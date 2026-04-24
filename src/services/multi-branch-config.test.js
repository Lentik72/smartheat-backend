// src/services/multi-branch-config.test.js
//
// Known-answer tests for multi-branch scrape-config support.
// Run: node src/services/multi-branch-config.test.js
// Or:  npm run test:multi-branch
//
// Convention matches src/data/fuel-config.test.js — plain assertions,
// no framework, clear output. Exits 0 on success, 1 on any failure.

const { getConfigForSupplier } = require('./priceScraper');

let passed = 0;
let failed = 0;

function pass(label) { passed++; console.log(`  ✓ ${label}`); }
function fail(label, detail) { failed++; console.error(`  ✗ ${label} — ${detail}`); }

function assertEqual(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) pass(label); else fail(label, `expected ${e}, got ${a}`);
}

function assertNull(actual, label) {
  if (actual === null) pass(label);
  else fail(label, `expected null, got ${JSON.stringify(actual)}`);
}

function assertTrue(cond, label) { if (cond) pass(label); else fail(label, 'expected true'); }

// ────────────────────────────────────────────────────────────────
console.log('\n=== getConfigForSupplier (Task 2) ===');
// ────────────────────────────────────────────────────────────────

const singleBranchCfg = {
  'example.com': {
    enabled: true, pattern: 'direct',
    priceRegex: '\\$([0-9]+\\.[0-9]{2,3})',
    lookupZip: '12345', postalCodesServed: ['12345', '12346']
  }
};

assertEqual(
  getConfigForSupplier('https://example.com', singleBranchCfg, null),
  singleBranchCfg['example.com'],
  'single-branch: returns base when no slug passed'
);

assertEqual(
  getConfigForSupplier('https://example.com', singleBranchCfg, 'any-slug'),
  singleBranchCfg['example.com'],
  'single-branch: ignores slug arg (backwards compat)'
);

const multiBranchCfg = {
  'chain.com': {
    enabled: true, pattern: 'direct',
    lookupUrl: 'https://chain.com/?zip={zip}',
    priceRegex: '\\$([0-9]+\\.[0-9]{2,3})',
    branches: {
      'chain-north': { lookupZip: '10001', postalCodesServed: ['10001', '10002'] },
      'chain-south': { lookupZip: '30001', postalCodesServed: ['30001', '30002'] }
    }
  }
};

const northMerged = {
  enabled: true, pattern: 'direct',
  lookupUrl: 'https://chain.com/?zip={zip}',
  priceRegex: '\\$([0-9]+\\.[0-9]{2,3})',
  branches: multiBranchCfg['chain.com'].branches,
  lookupZip: '10001', postalCodesServed: ['10001', '10002']
};

assertEqual(
  getConfigForSupplier('https://chain.com', multiBranchCfg, 'chain-north'),
  northMerged,
  'multi-branch: north slug → merged config with north branch fields'
);

assertNull(
  getConfigForSupplier('https://chain.com', multiBranchCfg, 'unknown-slug'),
  'multi-branch: unknown slug → null (orphan, prevents wrong-branch attribution)'
);

assertNull(
  getConfigForSupplier('https://chain.com', multiBranchCfg, null),
  'multi-branch: no slug → null (orphan)'
);

assertNull(
  getConfigForSupplier('https://unknown.com', singleBranchCfg, 'any'),
  'missing domain → null'
);

assertNull(
  getConfigForSupplier('not-a-url', singleBranchCfg, null),
  'malformed URL → null'
);

assertNull(
  getConfigForSupplier(null, singleBranchCfg, null),
  'null website → null'
);

// ────────────────────────────────────────────────────────────────
console.log('\n=== ScrapeConfigSync filter predicate (Task 4, P0 audit fix) ===');
// ────────────────────────────────────────────────────────────────
//
// The current filter at ScrapeConfigSync.js:109-115 is:
//   Array.isArray(cfg.postalCodesServed) && cfg.postalCodesServed.length > 0
// It must be widened to also include entries with `branches`, otherwise
// multi-branch configs silently skip the sync loop entirely.
//
// We test the predicate as a pure function. Task 4 must export it.

const { _shouldSyncConfigEntry } = require('./ScrapeConfigSync');

assertTrue(
  _shouldSyncConfigEntry({ postalCodesServed: ['12345'] }) === true,
  'filter: single-branch entry with postalCodesServed → include'
);

assertTrue(
  _shouldSyncConfigEntry({ branches: { 'some-slug': { postalCodesServed: ['12345'] } } }) === true,
  'filter: multi-branch entry with branches → include'
);

assertTrue(
  _shouldSyncConfigEntry({ enabled: true, pattern: 'direct' }) === false,
  'filter: entry with neither postalCodesServed nor branches → exclude (e.g., aggregator-signal configs)'
);

// ────────────────────────────────────────────────────────────────
console.log('\n=== _validateMultiBranchConfigs warnings (Task 5) ===');
// ────────────────────────────────────────────────────────────────
//
// Validator logs to console.warn. We spy on console.warn to capture
// messages, then assert the expected warnings fire for each bad config.

const ScrapeConfigSync = require('./ScrapeConfigSync');

// NOTE: All validator test cases run SEQUENTIALLY below. The console.warn spy
// is process-global — parallelizing these with Promise.all would cause
// cross-test contamination (Case 1's warnings could land in Case 2's array).
// Do not refactor to parallel execution without a per-case spy isolation layer.
async function captureWarnings(cfg, stubbedSequelize) {
  const warnings = [];
  const origWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    const inst = new ScrapeConfigSync(stubbedSequelize);
    await inst._validateMultiBranchConfigs(cfg);
  } finally {
    console.warn = origWarn;
  }
  return warnings;
}

// Stub sequelize that returns "no suppliers found" for any slug query
const noSupplierStub = { query: async () => [], QueryTypes: { SELECT: 'SELECT' } };
// Stub that returns all slugs as existing
const allExistStub = {
  query: async (_sql, opts) => (opts?.bind?.[0] || []).map(slug => ({ slug })),
  QueryTypes: { SELECT: 'SELECT' }
};

(async () => {
  // Case 1: top-level postalCodesServed + branches (ambiguous)
  {
    const w = await captureWarnings({
      'bad.com': {
        postalCodesServed: ['99999'],
        branches: { 'some-slug': { postalCodesServed: ['10001'] } }
      }
    }, allExistStub);
    assertTrue(
      w.some(s => s.includes('bad.com') && s.includes('top-level postalCodesServed')),
      'validator: warns on top-level postalCodesServed + branches'
    );
  }

  // Case 2: top-level lookupZip + branches
  {
    const w = await captureWarnings({
      'bad.com': {
        lookupZip: '99999',
        branches: { 'some-slug': { lookupZip: '10001', postalCodesServed: ['10001'] } }
      }
    }, allExistStub);
    assertTrue(
      w.some(s => s.includes('bad.com') && s.includes('top-level lookupZip')),
      'validator: warns on top-level lookupZip + branches'
    );
  }

  // Case 3: overlapping ZIPs across branches
  {
    const w = await captureWarnings({
      'chain.com': {
        branches: {
          'slug-a': { postalCodesServed: ['10001', '10002'] },
          'slug-b': { postalCodesServed: ['10002', '10003'] }
        }
      }
    }, allExistStub);
    assertTrue(
      w.some(s => s.includes('10002') && s.includes('slug-a') && s.includes('slug-b')),
      'validator: warns on overlapping ZIP across branches'
    );
  }

  // Case 4: branch without postalCodesServed
  {
    const w = await captureWarnings({
      'chain.com': {
        branches: {
          'slug-a': { lookupZip: '10001' }  // missing postalCodesServed
        }
      }
    }, allExistStub);
    assertTrue(
      w.some(s => s.includes('slug-a') && s.includes('postalCodesServed')),
      'validator: warns on branch missing postalCodesServed'
    );
  }

  // Case 5: branch slug with no matching supplier
  {
    const w = await captureWarnings({
      'chain.com': {
        branches: {
          'orphan-slug': { postalCodesServed: ['10001'] }
        }
      }
    }, noSupplierStub);
    assertTrue(
      w.some(s => s.includes('orphan-slug') && s.includes('no supplier')),
      'validator: warns on branch slug with no matching supplier row'
    );
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
