/**
 * Tests for helpers in scripts/generate-seo-pages.js.
 *
 * Run: node src/scripts/generate-seo-pages.test.js
 * Auto-discovered by scripts/run-tests.sh (find src -name "*.test.js").
 *
 * Bare-node `assert` pattern matching src/data/fuel-config.test.js,
 * src/services/multi-branch-config.test.js, etc.
 *
 * Driven by heatingoil-clsn: hardcoded MIN/MAX_VALID_PRICE constants
 * silently filtered kerosene prices >$6.00 out of market stats /
 * leaderboards. Live impact at time of fix: County Energy Products MA
 * ($6.489), Harris Energy NH ($6.250), Thermo Petroleum NY ($6.159).
 */

const assert = require('assert');
const {
  priceInFuelRange,
  calculateMarketStats,
  generateLeaderboardSnippet,
} = require('../../scripts/generate-seo-pages');

// ── priceInFuelRange ─────────────────────────────────────────────

const heatingOil = { minPrice: 2.00, maxPrice: 6.00 };
const kerosene   = { minPrice: 2.50, maxPrice: 7.00 };

assert.strictEqual(priceInFuelRange(4.50, heatingOil), true,  'heating_oil mid-range admitted');
assert.strictEqual(priceInFuelRange(2.00, heatingOil), true,  'heating_oil at floor (inclusive)');
assert.strictEqual(priceInFuelRange(6.00, heatingOil), true,  'heating_oil at ceiling (inclusive)');
assert.strictEqual(priceInFuelRange(1.99, heatingOil), false, 'heating_oil below floor rejected');
assert.strictEqual(priceInFuelRange(6.01, heatingOil), false, 'heating_oil above ceiling rejected');
assert.strictEqual(priceInFuelRange(6.30, kerosene),   true,  'kerosene admits $6.30 (CM Fuels case)');
assert.strictEqual(priceInFuelRange(7.00, kerosene),   true,  'kerosene at ceiling (inclusive)');
assert.strictEqual(priceInFuelRange(7.01, kerosene),   false, 'kerosene above ceiling rejected');
assert.strictEqual(priceInFuelRange(2.49, kerosene),   false, 'kerosene below floor rejected');

console.log('✅ priceInFuelRange: 9 assertions passed');

// ── calculateMarketStats(suppliers, FUEL) ───────────────────────

(() => {
  const stats = calculateMarketStats(
    [
      { hasPrice: true, price: 4.50 },
      { hasPrice: true, price: 6.30 },  // CM Fuels-style kerosene
    ],
    kerosene
  );
  assert.strictEqual(stats.pricedCount, 2, 'kerosene $6.30 included in pricedCount');
  assert.strictEqual(stats.max, '6.30',    'kerosene max reflects $6.30 not $4.50');
})();

(() => {
  // Heating_oil regression: $6.30 still rejected (out-of-range)
  const stats = calculateMarketStats(
    [{ hasPrice: true, price: 6.30 }],
    heatingOil
  );
  assert.strictEqual(stats, null, 'heating_oil $6.30 still rejected (out-of-range)');
})();

(() => {
  // Heating_oil boundary: $2.00 exactly at floor
  const stats = calculateMarketStats(
    [{ hasPrice: true, price: 2.00 }],
    heatingOil
  );
  assert.strictEqual(stats.pricedCount, 1, 'heating_oil $2.00 admitted (inclusive floor)');
})();

(() => {
  // Heating_oil boundary: $1.99 just below floor
  const stats = calculateMarketStats(
    [{ hasPrice: true, price: 1.99 }],
    heatingOil
  );
  assert.strictEqual(stats, null, 'heating_oil $1.99 rejected (below floor)');
})();

console.log('✅ calculateMarketStats: 5 assertions passed');

// ── generateLeaderboardSnippet ──────────────────────────────────

(() => {
  // Verified shape from generate-seo-pages.js:1950-1985:
  //   state.abbrev (uppercased), state.name
  //   p.supplier_id, p.price
  //   s.id, s.state, s.name, s.city
  // FUEL needs label + urlPrefix (in the template).
  const fuelKero = {
    minPrice: 2.50, maxPrice: 7.00,
    label: 'K-1 Kerosene',
    urlPrefix: '/prices/kerosene',
  };
  const states = [{ abbrev: 'PA', name: 'Pennsylvania' }];
  const suppliers = [
    { id: 'cm', state: 'PA', name: 'C.M. Fuels', city: 'Spring Run' },
  ];
  const prices = [{ supplier_id: 'cm', price: 6.30 }];

  const html = generateLeaderboardSnippet(states, prices, suppliers, fuelKero);
  // Price-string-specific assertion on purpose — a length-only or
  // non-empty check could pass against a function that never exercised
  // the filter.
  assert.ok(html.includes('$6.30/gal'), 'kerosene $6.30 reaches the top-deals HTML');
})();

(() => {
  // Heating_oil regression: same $6.30 supplier must NOT appear in
  // top deals when FUEL is heating_oil (out-of-range).
  const fuelOil = {
    minPrice: 2.00, maxPrice: 6.00,
    label: 'Heating Oil',
    urlPrefix: '/prices',
  };
  const states = [{ abbrev: 'PA', name: 'Pennsylvania' }];
  const suppliers = [{ id: 'cm', state: 'PA', name: 'C.M. Fuels', city: 'Spring Run' }];
  const prices = [{ supplier_id: 'cm', price: 6.30 }];

  const html = generateLeaderboardSnippet(states, prices, suppliers, fuelOil);
  assert.ok(!html.includes('$6.30/gal'), 'heating_oil leaderboard still filters $6.30');
})();

console.log('✅ generateLeaderboardSnippet: 2 assertions passed');
