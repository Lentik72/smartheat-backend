// src/utils/city-county-redirect.test.js
//
// Known-answer tests for the city → -county fuzzy redirect decision.
// Run: node src/utils/city-county-redirect.test.js
//
// Convention matches src/services/healthCheck.test.js — plain assertions,
// no framework. Exits 0 on success, 1 on any failure.
//
// Why this test exists: bead heatingoil-vwpi — /prices/va/fairfax 404'd
// because the file is prices/va/fairfax-county.html and no fuzzy match
// existed. This helper is the decision point for the new 301; injected
// fileExists keeps the test hermetic (no real filesystem).

const { cityCountyRedirectTarget } = require('./city-county-redirect');

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

// Case 1: /prices/va/fairfax → /prices/va/fairfax-county (county sibling exists)
assertEqual(
  cityCountyRedirectTarget(
    '/prices/va/fairfax',
    WD,
    fileExistsFrom(new Set(['/site/prices/va/fairfax-county.html']))
  ),
  '/prices/va/fairfax-county',
  '/prices/va/fairfax redirects when fairfax-county.html exists'
);

// Case 2: /prices/ny/westchester → /prices/ny/westchester-county
assertEqual(
  cityCountyRedirectTarget(
    '/prices/ny/westchester',
    WD,
    fileExistsFrom(new Set(['/site/prices/ny/westchester-county.html']))
  ),
  '/prices/ny/westchester-county',
  '/prices/ny/westchester redirects when westchester-county.html exists'
);

// Case 3: /prices/nh/ossipee — no -county file → null (genuine coverage gap, AC #4)
assertEqual(
  cityCountyRedirectTarget('/prices/nh/ossipee', WD, fileExistsFrom(new Set())),
  null,
  '/prices/nh/ossipee returns null when no -county sibling exists (no false positive)'
);

// Case 4: /prices/va/fairfax-county (already suffixed, file missing) → null
assertEqual(
  cityCountyRedirectTarget('/prices/va/fairfax-county', WD, fileExistsFrom(new Set())),
  null,
  '/prices/va/fairfax-county returns null — already -county, no -county-county'
);

// Case 5: /prices/county/ny/westchester — county path, regex rejects → null
assertEqual(
  cityCountyRedirectTarget(
    '/prices/county/ny/westchester',
    WD,
    fileExistsFrom(new Set(['/site/prices/county/ny/westchester-county.html']))
  ),
  null,
  '/prices/county/ny/westchester returns null — county path is out of scope'
);

// Case 6: /prices/kerosene/me — fuel-prefixed, regex rejects → null
assertEqual(
  cityCountyRedirectTarget(
    '/prices/kerosene/me',
    WD,
    fileExistsFrom(new Set(['/site/prices/kerosene/me-county.html']))
  ),
  null,
  '/prices/kerosene/me returns null — fuel-prefixed route is out of scope'
);

// Case 7: /prices/va/fairfax/ — trailing slash, regex $ rejects → null
assertEqual(
  cityCountyRedirectTarget(
    '/prices/va/fairfax/',
    WD,
    fileExistsFrom(new Set(['/site/prices/va/fairfax-county.html']))
  ),
  null,
  '/prices/va/fairfax/ returns null — trailing slash is out of scope'
);

// Case 8: /supplier/foo — not a /prices/ path → null
assertEqual(
  cityCountyRedirectTarget('/supplier/foo', WD, fileExistsFrom(new Set())),
  null,
  '/supplier/foo returns null — not a /prices/ path'
);

console.log('');
if (failed === 0) {
  console.log(`✅ All ${passed} test(s) passed.`);
  process.exit(0);
} else {
  console.error(`❌ ${failed} of ${passed + failed} test(s) failed.`);
  process.exit(1);
}
