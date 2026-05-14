// src/utils/trailing-slash-redirect.test.js
//
// Known-answer tests for the trailing-slash → no-slash redirect decision.
// Run: node src/utils/trailing-slash-redirect.test.js
//
// Convention matches src/services/healthCheck.test.js — plain assertions,
// no framework. Exits 0 on success, 1 on any failure.
//
// Why this test exists: bead heatingoil-x0ak — /prices/ was 404ing because
// the clean-URL middleware (server.js:266) skips trailing-slash paths, so
// /prices/ never resolved to website/prices.html. This helper is the
// decision point for the new 301; injected fileExists keeps the test
// hermetic (no real filesystem).

const { trailingSlashRedirectTarget } = require('./trailing-slash-redirect');

let passed = 0;
let failed = 0;
function pass(label) { passed++; console.log(`  ✓ ${label}`); }
function fail(label, detail) { failed++; console.error(`  ✗ ${label} — ${detail}`); }
function assertEqual(actual, expected, label) {
  if (actual === expected) pass(label);
  else fail(label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const WD = '/site';
const fileExistsFrom = (existing) => (p) => existing.has(p);

// Case 1: /prices/ → /prices (prices.html exists, no prices/index.html)
assertEqual(
  trailingSlashRedirectTarget(
    '/prices/',
    WD,
    fileExistsFrom(new Set(['/site/prices.html']))
  ),
  '/prices',
  '/prices/ redirects to /prices when prices.html exists and no directory index'
);

// Case 2: /prices/ny/ stays (prices/ny/index.html exists — Express static handles it)
assertEqual(
  trailingSlashRedirectTarget(
    '/prices/ny/',
    WD,
    fileExistsFrom(new Set([
      '/site/prices/ny/index.html',
      '/site/prices/ny.html',  // even if a sibling .html also exists, index wins
    ]))
  ),
  null,
  '/prices/ny/ does not redirect when directory index.html exists'
);

// Case 3: / (root) is excluded
assertEqual(
  trailingSlashRedirectTarget('/', WD, fileExistsFrom(new Set())),
  null,
  'root path / does not redirect'
);

// Case 4: /unknown/ — no file in either form
assertEqual(
  trailingSlashRedirectTarget('/unknown/', WD, fileExistsFrom(new Set())),
  null,
  '/unknown/ does not redirect when no .html target exists'
);

// Case 5: no trailing slash — pass through
assertEqual(
  trailingSlashRedirectTarget(
    '/prices',
    WD,
    fileExistsFrom(new Set(['/site/prices.html']))
  ),
  null,
  '/prices (no trailing slash) does not redirect — clean-URL middleware handles it'
);

// Case 6: nested path /prices/county/ny/westchester/
assertEqual(
  trailingSlashRedirectTarget(
    '/prices/county/ny/westchester/',
    WD,
    fileExistsFrom(new Set(['/site/prices/county/ny/westchester.html']))
  ),
  '/prices/county/ny/westchester',
  'nested trailing-slash path redirects when .html target exists'
);

// Case 7: protocol-relative path is rejected. Express 4 does NOT normalize
// leading slashes — //prices/ arrives as reqPath '//prices/'. Without the
// guard the helper would return '//prices' and res.redirect would emit
// Location: //prices, an open redirect to https://prices/. The fixture
// deliberately includes /site/prices.html so the test proves the guard bails
// even when a matching file exists.
assertEqual(
  trailingSlashRedirectTarget(
    '//prices/',
    WD,
    fileExistsFrom(new Set(['/site/prices.html']))
  ),
  null,
  '//prices/ returns null — protocol-relative input rejected before redirect'
);

// Case 8: triple-slash prefix also rejected (guard is startsWith('//'))
assertEqual(
  trailingSlashRedirectTarget(
    '///prices/',
    WD,
    fileExistsFrom(new Set(['/site/prices.html']))
  ),
  null,
  '///prices/ returns null — multi-slash prefix rejected'
);

console.log('');
if (failed === 0) {
  console.log(`✅ All ${passed} test(s) passed.`);
  process.exit(0);
} else {
  console.error(`❌ ${failed} of ${passed + failed} test(s) failed.`);
  process.exit(1);
}
