/**
 * Tests for getRecentPriceCount in scripts/lib/county-data.js.
 *
 * Run: node src/scripts/lib/county-data.test.js
 * Auto-discovered by scripts/run-tests.sh (find src -name "*.test.js").
 *
 * Bare-node `assert` pattern matching src/scripts/generate-seo-pages.test.js.
 *
 * Driven by heatingoil-ed2g: getRecentPriceCount hardcoded a $2-$6 price
 * window, silently undercounting any non-oil caller. This locks the
 * contract that defaults preserve heating-oil behavior AND that custom
 * min/max reach the SQL bind unchanged.
 */

const assert = require('assert');
const { getRecentPriceCount } = require('../../../scripts/lib/county-data');

function makeFakeSequelize() {
  const calls = [];
  return {
    calls,
    query: async (_sql, options) => {
      calls.push(options);
      return [[{ price_count: 0 }]];
    },
  };
}

// ── Test 1: defaults bind heating-oil range ─────────────────────────

(async () => {
  const fakeSql = makeFakeSequelize();
  await getRecentPriceCount(fakeSql, ['100']);

  assert.strictEqual(fakeSql.calls.length, 1, 'query called once');
  assert.deepStrictEqual(
    fakeSql.calls[0].bind,
    [2.00, 6.00, ['100']],
    'defaults bind [MIN_VALID_PRICE, MAX_VALID_PRICE, zipPrefixes]'
  );

  console.log('  ✓ defaults bind heating-oil range [2.00, 6.00, zips]');

  // ── Test 2: custom min/max reach the SQL bind ─────────────────────

  const fakeSql2 = makeFakeSequelize();
  await getRecentPriceCount(fakeSql2, ['100'], 2.50, 7.00);

  assert.strictEqual(fakeSql2.calls.length, 1, 'query called once (custom args)');
  assert.deepStrictEqual(
    fakeSql2.calls[0].bind,
    [2.50, 7.00, ['100']],
    'custom args bind [minPrice, maxPrice, zipPrefixes]'
  );

  console.log('  ✓ custom args bind [2.50, 7.00, zips]');

  // ── Test 3: empty zipPrefixes returns 0 without calling query ─────

  const fakeSql3 = makeFakeSequelize();
  const result = await getRecentPriceCount(fakeSql3, []);

  assert.strictEqual(result, 0, 'returns 0 for empty zipPrefixes');
  assert.strictEqual(fakeSql3.calls.length, 0, 'query NOT called for empty zipPrefixes');

  console.log('  ✓ empty zipPrefixes returns 0 without querying');
  console.log('✅ getRecentPriceCount: 3 tests passed');
})().catch((err) => {
  console.error('  ✗ FAIL:', err.message);
  process.exit(1);
});
