// src/services/supplierMatcher.test.js
//
// Targeted regression tests for findSuppliersForZip.
//
// Currently scoped to the cross-state county-name leak class of bug
// (heatingoil-12815 surfacing): a NJ-based supplier with NY ZIPs in
// Orange/Sullivan counties was matching NY 12815 (Warren County) via
// the county fallback because the existing state guard only required
// "supplier serves user's state" — Wilson Fuel had Warren in
// serviceCounties (referring to NJ Warren) and NY ZIPs (in different
// NY counties), and the loose guard accepted that combo.
//
// These tests use real ZIPs from src/data/zip-database.json to keep
// the assertions tied to live data semantics.
//
// Run: node src/services/supplierMatcher.test.js
// Convention: plain assertions, exits 0 on success, 1 on any failure.

const { findSuppliersForZip } = require('./supplierMatcher');

let passed = 0;
let failed = 0;
function pass(label) { passed++; console.log(`  ✓ ${label}`); }
function fail(label, detail) { failed++; console.error(`  ✗ ${label} — ${detail}`); }
function assertTrue(cond, label, detail) { if (cond) pass(label); else fail(label, detail || 'expected true'); }
function assertEqual(actual, expected, label) {
  if (actual === expected) pass(label);
  else fail(label, `got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
}

console.log('\n=== findSuppliersForZip — cross-state county-name leak (heatingoil-12815) ===');

// Scenario 1: Wilson-Fuel-shaped supplier — NJ-based, claims "Warren"
// referring to NJ Warren, has NY ZIPs but only in Orange/Sullivan
// counties (not NY Warren). Must NOT match a NY Warren ZIP user.
{
  const wilsonShape = {
    id: 'test-wilson',
    name: 'Test Wilson Fuel (NJ)',
    state: 'NJ',
    serviceCounties: ['Sussex', 'Warren', 'Morris', 'Orange', 'Sullivan', 'Pike'],
    postalCodesServed: [
      // NJ Warren (1 ZIP — supplier's actual Warren coverage)
      '07825',
      // NY Orange (NY ZIPs but wrong county)
      '10940', '10963', '10973', '10988', '10990', '10998',
      // NY Sullivan (NY ZIPs but wrong county)
      '12733', '12738', '12747',
    ],
    serviceAreaRadius: 30,
  };

  const { suppliers } = findSuppliersForZip('12815', [wilsonShape], { includeRadius: true });
  assertEqual(
    suppliers.length,
    0,
    'NJ-Warren supplier with NY-Orange/Sullivan ZIPs does NOT match NY-Warren 12815'
  );
}

// Scenario 2: Legitimate same-state county fallback. NY-based supplier,
// serviceCounties includes "Warren", and has at least one real Warren
// County NY ZIP (12801 = Queensbury). User asks for 12815 (Brant Lake,
// Warren NY) which is NOT in postalCodesServed — must still match via
// the county fallback, because 12801 proves actual Warren NY coverage.
//
// (Real-world Corinth Oil Delivery on prod has serviceCounties=
// ['Saratoga','Warren','Washington'] but ZERO Warren NY ZIPs in
// postalCodesServed — all are Saratoga. The fix correctly rejects
// that case as a same-class cross-state-county leak (overstated
// serviceCounties relative to actual coverage).)
{
  const goodGapShape = {
    id: 'test-county-gap',
    name: 'Test Same-State County Gap (NY)',
    state: 'NY',
    serviceCounties: ['Saratoga', 'Warren', 'Washington'],
    postalCodesServed: [
      '12801', // Queensbury — Warren County NY (real coverage proof)
      '12866', '12831', '12833', // Saratoga County NY
    ],
    serviceAreaRadius: 35,
  };

  const { suppliers } = findSuppliersForZip('12815', [goodGapShape], { includeRadius: true });
  assertEqual(suppliers.length, 1, 'NY supplier with at least one real Warren NY ZIP matches via county fallback');
  if (suppliers.length === 1) {
    assertEqual(suppliers[0].matchType, 'county', 'matchType is county');
  }
}

// Scenario 2b: Same supplier shape as 2 but with Warren claim that
// has ZERO Warren NY ZIPs (real-world Corinth Oil shape). Must NOT
// match — overstated county claim relative to actual ZIP coverage.
{
  const overstatedShape = {
    id: 'test-overstated',
    name: 'Test Overstated County (NY)',
    state: 'NY',
    serviceCounties: ['Saratoga', 'Warren', 'Washington'],
    postalCodesServed: [
      '12803', '12822', '12866', '12831', // all Saratoga NY
    ],
    serviceAreaRadius: 0,
    lat: null, lng: null,
  };

  const { suppliers } = findSuppliersForZip('12815', [overstatedShape], { includeRadius: true });
  assertEqual(
    suppliers.length,
    0,
    'NY supplier listing Warren in serviceCounties but with zero real Warren NY ZIPs does NOT match'
  );
}

// Scenario 3: Out-of-state supplier with no county overlap — must
// not match by county. (Sanity check for the matcher's basic guard.)
{
  const samShape = {
    id: 'test-sam',
    name: "Test Sam's U-Save Fuels (VT)",
    state: 'VT',
    serviceCounties: ['Rutland', 'Addison', 'Bennington', 'Windsor'],
    postalCodesServed: [
      '05743', '05753', '05761', // VT ZIPs only
    ],
    serviceAreaRadius: 0, // disable radius match for this test
    lat: null, lng: null,
  };

  const { suppliers } = findSuppliersForZip('12815', [samShape], { includeRadius: true });
  assertEqual(suppliers.length, 0, 'VT supplier with no Warren in counties + no NY ZIPs does NOT match');
}

// Scenario 4: Same-state same-county legitimate ZIP-coverage gap.
// Long-Energy-shaped supplier explicitly serves Warren County NY and
// has 12815 in their postalCodesServed — must match by ZIP (not
// county). Direct ZIP hit, score should be 100.
{
  const leShape = {
    id: 'test-le',
    name: 'Test Long Energy (NY)',
    state: 'NY',
    serviceCounties: ['Albany', 'Schenectady', 'Warren', 'Washington'],
    postalCodesServed: ['12303', '12815', '12866', '12801'],
    serviceAreaRadius: 60,
  };

  const { suppliers } = findSuppliersForZip('12815', [leShape], { includeRadius: true });
  assertEqual(suppliers.length, 1, 'In-state supplier with exact ZIP match DOES match');
  if (suppliers.length === 1) {
    assertEqual(suppliers[0].matchType, 'zip', 'exact ZIP match takes priority over county');
  }
}

// Scenario 5: Cross-state-county leak with York VA / York PA shape
// (the V1.1.0 comment's original example). VA supplier with York in
// counties + 1 PA ZIP outside York PA (e.g. Lancaster PA 17602) must
// not match a York PA user.
{
  const yorkVaShape = {
    id: 'test-york-va',
    name: 'Test York VA Supplier',
    state: 'VA',
    serviceCounties: ['York', 'Henrico'],
    postalCodesServed: [
      '23690', // York VA
      '17602', // Lancaster PA — wrong county for a "York" claim
    ],
    serviceAreaRadius: 20,
  };

  // 17404 is York PA
  const { suppliers } = findSuppliersForZip('17404', [yorkVaShape], { includeRadius: true });
  assertEqual(
    suppliers.length,
    0,
    'VA-York supplier with PA-Lancaster ZIP does NOT match PA-York user'
  );
}

console.log(`\n${passed} passed, ${failed} failed.\n`);
process.exit(failed === 0 ? 0 : 1);
