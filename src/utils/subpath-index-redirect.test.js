// src/utils/subpath-index-redirect.test.js
//
// Known-answer tests for the subpath /{prefix}/index → /{prefix} redirect decision.
// Run: node src/utils/subpath-index-redirect.test.js
//
// Convention matches src/services/healthCheck.test.js — plain assertions,
// no framework. Exits 0 on success, 1 on any failure.
//
// Why this test exists: bead heatingoil-2e1s — /prices/ny/index 404'd
// because the existing /index → / rule only handles bare root. Cases 8 and 9
// cover the // open-redirect vector x0ak's trailing-slash-redirect.js guards;
// without the guard, //foo/index would 301 to //foo (a protocol-relative URL).

const { subpathIndexRedirectTarget } = require('./subpath-index-redirect');

let passed = 0;
let failed = 0;
function pass(label) { passed++; console.log(`  ✓ ${label}`); }
function fail(label, detail) { failed++; console.error(`  ✗ ${label} — ${detail}`); }
function assertEqual(actual, expected, label) {
  if (actual === expected) pass(label);
  else fail(label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// Case 1: minimal subpath case
assertEqual(
  subpathIndexRedirectTarget('/foo/index'),
  '/foo',
  '/foo/index → /foo'
);

// Case 2: bead evidence
assertEqual(
  subpathIndexRedirectTarget('/prices/ny/index'),
  '/prices/ny',
  '/prices/ny/index → /prices/ny (bead evidence)'
);

// Case 3: bare /index — existing server.js rule handles, helper must return null
assertEqual(
  subpathIndexRedirectTarget('/index'),
  null,
  'bare /index returns null (existing rule handles root case)'
);

// Case 4: trailing slash — out of scope for this helper
assertEqual(
  subpathIndexRedirectTarget('/foo/index/'),
  null,
  '/foo/index/ (trailing slash) returns null'
);

// Case 5: no /index suffix
assertEqual(
  subpathIndexRedirectTarget('/foo'),
  null,
  '/foo (no /index suffix) returns null'
);

// Case 6: index not the final segment
assertEqual(
  subpathIndexRedirectTarget('/foo/index/bar'),
  null,
  '/foo/index/bar (index not final) returns null'
);

// Case 7: multi-segment prefix
assertEqual(
  subpathIndexRedirectTarget('/foo/bar/index'),
  '/foo/bar',
  '/foo/bar/index → /foo/bar (multi-segment)'
);

// Case 8: protocol-relative open-redirect vector — must return null
// Without the // guard, the regex would match with group 1 = '/foo' and the
// helper would return '//foo' — a protocol-relative URL the browser resolves
// to https://foo/.
assertEqual(
  subpathIndexRedirectTarget('//foo/index'),
  null,
  '//foo/index returns null (// guard halts the regex match)'
);

// Case 9: triple-slash prefix — same guard
assertEqual(
  subpathIndexRedirectTarget('///foo/index'),
  null,
  '///foo/index returns null (multi-slash prefix rejected)'
);

console.log('');
if (failed === 0) {
  console.log(`✅ All ${passed} test(s) passed.`);
  process.exit(0);
} else {
  console.error(`❌ ${failed} of ${passed + failed} test(s) failed.`);
  process.exit(1);
}
