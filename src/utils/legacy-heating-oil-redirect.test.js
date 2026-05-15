// src/utils/legacy-heating-oil-redirect.test.js
//
// Known-answer tests for the legacy /heating-oil[-prices]/ → /prices/county/ redirect decision.
// Run: node src/utils/legacy-heating-oil-redirect.test.js
//
// Convention matches src/services/healthCheck.test.js — plain assertions,
// no framework. Exits 0 on success, 1 on any failure.
//
// Why this test exists: bead heatingoil-2e1s — two evidence URLs:
//   /heating-oil-prices/pennsylvania/delaware-county (full-name state)
//   /heating-oil/ny/westchester-county/ (abbr state, trailing slash)
// The helper supports both forms and rejects unknown states with null
// rather than 301ing to a path that doesn't exist.

const { legacyHeatingOilRedirectTarget } = require('./legacy-heating-oil-redirect');

let passed = 0;
let failed = 0;
function pass(label) { passed++; console.log(`  ✓ ${label}`); }
function fail(label, detail) { failed++; console.error(`  ✗ ${label} — ${detail}`); }
function assertEqual(actual, expected, label) {
  if (actual === expected) pass(label);
  else fail(label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// Same OLD_STATE_NAMES contents as server.js (kept inline for test hermeticity)
const OLD_STATE_NAMES = {
  'connecticut': 'ct', 'new-york': 'ny', 'new-jersey': 'nj', 'new-hampshire': 'nh',
  'maine': 'me', 'massachusetts': 'ma', 'pennsylvania': 'pa', 'rhode-island': 'ri',
  'alaska': 'ak', 'delaware': 'de', 'maryland': 'md', 'virginia': 'va', 'vermont': 'vt'
};

// Case 1: bead evidence — full-name state, with -prices infix and -county suffix
assertEqual(
  legacyHeatingOilRedirectTarget('/heating-oil-prices/pennsylvania/delaware-county', OLD_STATE_NAMES),
  '/prices/county/pa/delaware',
  'full-name state + -prices + -county strip → /prices/county/{abbr}/{city}'
);

// Case 2: bead evidence — abbr state, without -prices, with trailing slash
assertEqual(
  legacyHeatingOilRedirectTarget('/heating-oil/ny/westchester-county/', OLD_STATE_NAMES),
  '/prices/county/ny/westchester',
  'abbr state + trailing slash + -county strip → /prices/county/{abbr}/{city}'
);

// Case 3: missing -county suffix on a valid state — still redirects (optional suffix)
assertEqual(
  legacyHeatingOilRedirectTarget('/heating-oil/ny/westchester', OLD_STATE_NAMES),
  '/prices/county/ny/westchester',
  'abbr state without -county suffix → same target'
);

// Case 4: unknown state (not in keys or values) → null (no 301 to nonexistent path)
assertEqual(
  legacyHeatingOilRedirectTarget('/heating-oil-prices/california/foo-county', OLD_STATE_NAMES),
  null,
  'unknown state returns null'
);

// Case 5: a different full-name state, different city
assertEqual(
  legacyHeatingOilRedirectTarget('/heating-oil-prices/maine/lancaster-county', OLD_STATE_NAMES),
  '/prices/county/me/lancaster',
  'full-name "maine" → abbr "me", city stripped'
);

// Case 6: bare /heating-oil — no segments
assertEqual(
  legacyHeatingOilRedirectTarget('/heating-oil', OLD_STATE_NAMES),
  null,
  'bare /heating-oil returns null'
);

// Case 7: /heating-oil/ — no segments, trailing slash
assertEqual(
  legacyHeatingOilRedirectTarget('/heating-oil/', OLD_STATE_NAMES),
  null,
  '/heating-oil/ returns null'
);

// Case 8: not a legacy URL
assertEqual(
  legacyHeatingOilRedirectTarget('/prices/ny/westchester', OLD_STATE_NAMES),
  null,
  '/prices/ny/westchester is not a legacy URL → null'
);

// Case 9: state already in abbr form (passes through via Object.values check)
assertEqual(
  legacyHeatingOilRedirectTarget('/heating-oil/pa/foo-county', OLD_STATE_NAMES),
  '/prices/county/pa/foo',
  'state already as abbr passes through unchanged'
);

// Case 10: state segment is "constructor" — bracket notation would inherit from
// Object.prototype.constructor (a truthy function). Object.hasOwn guards this:
// "constructor" is not an OWN key of oldStateNames → null. Without this guard,
// the helper would emit a 301 to a stringified-function target.
assertEqual(
  legacyHeatingOilRedirectTarget('/heating-oil/constructor/foo-county', OLD_STATE_NAMES),
  null,
  'state="constructor" returns null (prototype-property guard via Object.hasOwn)'
);

console.log('');
if (failed === 0) {
  console.log(`✅ All ${passed} test(s) passed.`);
  process.exit(0);
} else {
  console.error(`❌ ${failed} of ${passed + failed} test(s) failed.`);
  process.exit(1);
}
