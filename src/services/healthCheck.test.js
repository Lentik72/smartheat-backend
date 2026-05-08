// src/services/healthCheck.test.js
//
// Known-answer tests for the /health DB-authenticate race.
// Run: node src/services/healthCheck.test.js
//
// Convention matches src/services/multi-branch-config.test.js — plain
// assertions, no framework. Exits 0 on success, 1 on any failure.
//
// Why this test exists: heatingoil-jsxj rolled back a Railway deploy
// because /health performed an unbounded sequelize.authenticate(). The
// race in raceDbAuthenticate() is the load-bearing fix; these tests catch
// regressions of "the race got removed" or "the timeout error stopped
// being classified as 'timeout'".

const { raceDbAuthenticate, truncateMigrationError } = require('./healthCheck');

let passed = 0;
let failed = 0;
function pass(label) { passed++; console.log(`  ✓ ${label}`); }
function fail(label, detail) { failed++; console.error(`  ✗ ${label} — ${detail}`); }
function assertEqual(actual, expected, label) {
  if (actual === expected) pass(label);
  else fail(label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function assertWithin(actual, lo, hi, label) {
  if (actual >= lo && actual <= hi) pass(label);
  else fail(label, `expected ${lo}–${hi}, got ${actual}`);
}

// Stub sequelize that resolves authenticate after `delayMs`, rejects with
// `error` if provided.
function fakeSequelize({ delayMs = 0, error = null } = {}) {
  return {
    authenticate() {
      return new Promise((resolve, reject) => {
        setTimeout(() => (error ? reject(error) : resolve()), delayMs);
      });
    }
  };
}

// Stub sequelize that hangs forever (never resolves) — simulates the
// heatingoil-jsxj failure mode.
const hangSequelize = { authenticate: () => new Promise(() => {}) };

(async () => {
  console.log('\n=== raceDbAuthenticate ===');

  // Null sequelize → down (server hasn't initialized DB yet).
  {
    const r = await raceDbAuthenticate(null, 100);
    assertEqual(r.state, 'down', 'null sequelize → down');
  }

  // Fast resolve → up.
  {
    const start = Date.now();
    const r = await raceDbAuthenticate(fakeSequelize({ delayMs: 5 }), 200);
    const elapsed = Date.now() - start;
    assertEqual(r.state, 'up', 'fast authenticate → up');
    assertWithin(elapsed, 0, 100, 'fast authenticate completes well before timeout');
  }

  // Reject with non-timeout error → down (e.g., connection refused, auth error).
  {
    const r = await raceDbAuthenticate(fakeSequelize({ error: new Error('connection refused') }), 200);
    assertEqual(r.state, 'down', 'authenticate rejection → down');
  }

  // Hang → timeout — the load-bearing test for heatingoil-jsxj regression.
  {
    const start = Date.now();
    const r = await raceDbAuthenticate(hangSequelize, 100);
    const elapsed = Date.now() - start;
    assertEqual(r.state, 'timeout', 'hung authenticate → timeout (heatingoil-jsxj guard)');
    assertWithin(elapsed, 90, 250, 'timeout fires near the configured deadline');
  }

  // Slow but finishes before timeout → up. Confirms race doesn't false-fire.
  {
    const r = await raceDbAuthenticate(fakeSequelize({ delayMs: 30 }), 200);
    assertEqual(r.state, 'up', 'slow-but-in-budget authenticate → up');
  }

  // Slow past timeout → timeout (race fires first).
  {
    const r = await raceDbAuthenticate(fakeSequelize({ delayMs: 200 }), 50);
    assertEqual(r.state, 'timeout', 'authenticate exceeds budget → timeout');
  }

  // Error-message normalization: truncateMigrationError caps long messages.
  console.log('\n=== truncateMigrationError ===');
  {
    const long = 'x'.repeat(500);
    assertEqual(truncateMigrationError({ message: long }).length, 200, '200-char cap on long error');
    assertEqual(truncateMigrationError(new Error('short')), 'short', 'short message unchanged');
    assertEqual(truncateMigrationError(null), 'null', 'null normalizes via String()');
    assertEqual(truncateMigrationError('plain string'), 'plain string', 'string passthrough');
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
