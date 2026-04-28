// src/utils/supplier-price-query.test.js
//
// Tests for buildScrapedPriceWhere — the where-clause builder used by
// /api/intelligence/market-summary and any future fuel-aware price reader.
//
// Run: node src/utils/supplier-price-query.test.js
//
// Convention matches src/services/multi-branch-config.test.js — plain
// assertions, no framework, clear output. Exits 0 on success, 1 on any failure.

const { Op } = require('sequelize');
const { buildScrapedPriceWhere } = require('./supplier-price-query');

let passed = 0;
let failed = 0;

function pass(label) { passed++; console.log(`  ✓ ${label}`); }
function fail(label, detail) { failed++; console.error(`  ✗ ${label} — ${detail}`); }

function assertEqual(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) pass(label); else fail(label, `expected ${e}, got ${a}`);
}

function assertHasKey(obj, key, label) {
  if (obj && Object.prototype.hasOwnProperty.call(obj, key)) pass(label);
  else fail(label, `expected key "${key}" in ${JSON.stringify(obj)}`);
}

function assertSymbolValue(obj, sym, expected, label) {
  const v = obj && obj[sym];
  const a = JSON.stringify(v);
  const e = JSON.stringify(expected);
  if (a === e) pass(label); else fail(label, `expected ${e}, got ${a}`);
}

const since = new Date('2026-04-01T00:00:00Z');

console.log('\n=== buildScrapedPriceWhere (heatingoil-ryp3) ===');

// Core bug: fuelType must be present so propane/kerosene callers do not
// receive heating_oil rows. This is the regression test for the fix.
{
  const where = buildScrapedPriceWhere({
    supplierIds: [1, 2, 3],
    fuelType: 'propane',
    since
  });
  assertHasKey(where, 'fuelType', 'fuelType included for propane caller');
  assertEqual(where.fuelType, 'propane', 'fuelType matches caller for propane');
}

{
  const where = buildScrapedPriceWhere({
    supplierIds: [1],
    fuelType: 'kerosene',
    since
  });
  assertEqual(where.fuelType, 'kerosene', 'fuelType matches caller for kerosene');
}

{
  const where = buildScrapedPriceWhere({
    supplierIds: [42],
    fuelType: 'heating_oil',
    since
  });
  assertEqual(where.fuelType, 'heating_oil', 'fuelType matches caller for heating_oil');
}

// Existing filters that the route already had must not regress.
{
  const where = buildScrapedPriceWhere({
    supplierIds: [10, 20],
    fuelType: 'heating_oil',
    since
  });
  assertSymbolValue(where.supplierId, Op.in, [10, 20], 'supplierId filter uses Op.in');
  assertEqual(where.isValid, true, 'isValid filter is true');
  assertSymbolValue(where.sourceType, Op.ne, 'aggregator_signal', 'sourceType excludes aggregator_signal');
  assertSymbolValue(where.scrapedAt, Op.gte, since.toISOString(), 'scrapedAt >= since');
}

// Defensive: refuse to build a clause with no fuelType. Silent default to
// heating_oil is exactly the bug we are fixing.
{
  let threw = false;
  try {
    buildScrapedPriceWhere({ supplierIds: [1], since });
  } catch (e) {
    threw = true;
  }
  if (threw) pass('throws when fuelType missing'); else fail('throws when fuelType missing', 'no error raised');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
