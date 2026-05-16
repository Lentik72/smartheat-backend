// src/utils/supplier-health-price-query.test.js
//
// Static-analysis tests for the canonical health-freshness SQL helper.
// No DB needed. Run: node src/utils/supplier-health-price-query.test.js
//
// Bead: heatingoil-kjnt (Cluster A foundation).

const {
  healthFuelPredicate,
  healthTieBreak,
  buildLatestHealthPriceCTE,
} = require('./supplier-health-price-query');

let passed = 0;
let failed = 0;
function pass(label) { passed++; console.log(`  ✓ ${label}`); }
function fail(label, detail) { failed++; console.error(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); }
function eq(actual, expected, label) {
  if (actual === expected) return pass(label);
  fail(label, `\n      expected: ${JSON.stringify(expected)}\n      actual:   ${JSON.stringify(actual)}`);
}
function contains(haystack, needle, label) {
  if (typeof haystack === 'string' && haystack.includes(needle)) return pass(label);
  fail(label, `\n      missing substring: ${JSON.stringify(needle)}\n      in: ${JSON.stringify(haystack).slice(0, 200)}…`);
}
function notContains(haystack, needle, label) {
  if (typeof haystack === 'string' && !haystack.includes(needle)) return pass(label);
  fail(label, `\n      unexpectedly contains: ${JSON.stringify(needle)}`);
}

console.log('\n=== healthFuelPredicate ===');

eq(
  healthFuelPredicate(),
  "(sp.fuel_type = 'heating_oil' OR s.primary_fuel_optional = true)",
  'default aliases'
);

eq(
  healthFuelPredicate({ pricesAlias: 'p', suppliersAlias: 'sup' }),
  "(p.fuel_type = 'heating_oil' OR sup.primary_fuel_optional = true)",
  'custom aliases'
);

eq(
  healthFuelPredicate({}),
  "(sp.fuel_type = 'heating_oil' OR s.primary_fuel_optional = true)",
  'empty opts → defaults'
);

console.log('\n=== healthTieBreak ===');

eq(
  healthTieBreak(),
  "CASE WHEN sp.fuel_type = 'heating_oil' THEN 0 ELSE 1 END",
  'default alias'
);

eq(
  healthTieBreak({ pricesAlias: 'p' }),
  "CASE WHEN p.fuel_type = 'heating_oil' THEN 0 ELSE 1 END",
  'custom alias'
);

console.log('\n=== buildLatestHealthPriceCTE — semantic checks ===');

const defaultCte = buildLatestHealthPriceCTE();

contains(defaultCte, 'WITH latest_health_prices AS', 'default cte name');
contains(defaultCte, 'DISTINCT ON (sp.supplier_id)', 'DISTINCT ON supplier_id');
contains(defaultCte, "sp.fuel_type AS health_fuel_type", 'always selects health_fuel_type');
contains(defaultCte, 'FROM supplier_prices sp', 'FROM supplier_prices');
contains(defaultCte, 'JOIN suppliers s ON sp.supplier_id = s.id', 'JOIN suppliers for primary_fuel_optional');
contains(defaultCte, 'sp.is_valid = true', 'is_valid filter');
contains(defaultCte, "(sp.fuel_type = 'heating_oil' OR s.primary_fuel_optional = true)", 'fuel predicate via helper');
contains(defaultCte, "ORDER BY sp.supplier_id, sp.scraped_at DESC", 'ORDER BY supplier_id, scraped_at DESC');
contains(defaultCte, "CASE WHEN sp.fuel_type = 'heating_oil' THEN 0 ELSE 1 END", 'tie-break favors heating_oil');

notContains(defaultCte, 'price_per_gallon', 'default does NOT include price column');
notContains(defaultCte, 'aggregator_signal', 'default does NOT bake in source_type policy');
notContains(defaultCte, 'expires_at', 'default does NOT bake in expires_at');

console.log('\n=== buildLatestHealthPriceCTE — knobs ===');

const ctePriced = buildLatestHealthPriceCTE({ includePrice: true });
contains(ctePriced, 'sp.price_per_gallon', 'includePrice: true adds price column');
contains(ctePriced, 'sp.fuel_type AS health_fuel_type', 'still carries health_fuel_type alongside price');

const cteRenamed = buildLatestHealthPriceCTE({ cteName: 'fresh_supplier_data' });
contains(cteRenamed, 'WITH fresh_supplier_data AS', 'custom cteName');
notContains(cteRenamed, 'latest_health_prices', 'custom cteName replaces default');

const cteAliased = buildLatestHealthPriceCTE({ pricesAlias: 'p', suppliersAlias: 'sup' });
contains(cteAliased, 'FROM supplier_prices p', 'custom pricesAlias');
contains(cteAliased, 'JOIN suppliers sup ON p.supplier_id = sup.id', 'custom suppliersAlias');
contains(cteAliased, "(p.fuel_type = 'heating_oil' OR sup.primary_fuel_optional = true)", 'predicate uses custom aliases');

console.log('\n=== buildLatestHealthPriceCTE — extraWhere pass-through ===');

const cteWithExpires = buildLatestHealthPriceCTE({
  extraWhere: ['AND sp.expires_at > NOW()'],
});
contains(cteWithExpires, 'AND sp.expires_at > NOW()', 'extraWhere: expires_at preserved');

const cteWithSourceType = buildLatestHealthPriceCTE({
  extraWhere: ["AND sp.source_type != 'aggregator_signal'"],
});
contains(cteWithSourceType, "AND sp.source_type != 'aggregator_signal'", 'extraWhere: source_type preserved (caller opt-in)');

const cteMulti = buildLatestHealthPriceCTE({
  extraWhere: [
    'AND sp.expires_at > NOW()',
    "AND sp.source_type != 'aggregator_signal'",
  ],
});
contains(cteMulti, 'AND sp.expires_at > NOW()', 'multiple extraWhere clauses #1');
contains(cteMulti, "AND sp.source_type != 'aggregator_signal'", 'multiple extraWhere clauses #2');

// Ensure no default-baked source_type even when caller doesn't pass any extras
const cteEmpty = buildLatestHealthPriceCTE({ extraWhere: [] });
notContains(cteEmpty, 'aggregator_signal', 'empty extraWhere → no source_type clause baked in');

console.log('\n=== Predicate logical equivalence (sanity) ===');
// Cross-check: a heating_oil row OR a primary-fuel-optional supplier's
// non-oil row both pass; an ordinary supplier's non-oil row does not.
// This is a syntax-only test; semantic correctness needs DB-side verification
// in a separate live test.
const pred = healthFuelPredicate();
contains(pred, "fuel_type = 'heating_oil'", 'predicate has heating_oil branch');
contains(pred, 'primary_fuel_optional = true', 'predicate has primary_fuel_optional branch');
contains(pred, ' OR ', 'predicate is an OR');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
