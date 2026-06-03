/**
 * Tests for scripts/lib/seo-meta.js — CTR-optimized SEO title/description.
 * Run: node src/scripts/seo-meta.test.js
 * Auto-discovered by scripts/run-tests.sh (find src -name "*.test.js").
 * heatingoil-qbd0.2
 */
const assert = require('assert');
const {
  stateMeta, countyMeta, cityMeta, regionMeta, zipMeta, supplierMeta, fitTitle, TITLE_CORE_MAX,
} = require('../../scripts/lib/seo-meta');

// ── stateMeta (with price stats) ──
{
  const { title, description } = stateMeta({
    fuelLabel: 'Heating Oil', stateName: 'New York',
    supplierCount: 200, stats: { min: '3.80', max: '5.20' },
  });
  assert.ok(title.startsWith('New York Heating Oil Prices'), 'state title front-loads keyword');
  assert.ok(title.includes('200'), 'state title keeps supplier-count hook when it fits');
  assert.ok(title.length <= TITLE_CORE_MAX, `state title core within ${TITLE_CORE_MAX}: "${title}" (${title.length})`);
  assert.ok(!title.includes('HomeHeat'), 'helper does NOT add brand (template appends it)');
  assert.ok(description.includes('$3.80–$5.20/gal'), 'state description includes price range');
  assert.ok(description.toLowerCase().includes('lowest first'), 'state description has CTR hook');
  assert.ok(description.length <= 160, 'state description within 160 chars');
}
// ── stateMeta (no price stats) ──
{
  const { title, description } = stateMeta({
    fuelLabel: 'Heating Oil', stateName: 'Maine', supplierCount: 40, stats: null,
  });
  assert.ok(title.startsWith('Maine Heating Oil Prices'), 'state title ok without stats');
  assert.ok(!description.includes('$'), 'state description omits price clause when no stats');
  assert.ok(description.includes('40 Maine suppliers'), 'state description still names supplier count');
}
// ── fitTitle drops optional segments to fit ──
{
  const t = fitTitle('A'.repeat(50), [' — Compare 200 Suppliers']);
  assert.ok(t.length <= TITLE_CORE_MAX, 'fitTitle respects max');
  assert.strictEqual(t, 'A'.repeat(50), 'fitTitle drops the optional hook when required fills the budget');
}
// ── countyMeta ──
{
  const { title, description } = countyMeta({
    fuelLabel: 'Heating Oil', countyName: 'Westchester', stateCode: 'NY',
    supplierCount: 200, stats: { min: '3.80', max: '5.20' },
  });
  assert.ok(title.startsWith('Westchester County Heating Oil Prices'), 'county title front-loads keyword');
  assert.ok(title.length <= TITLE_CORE_MAX, `county title within max: "${title}"`);
  assert.ok(description.includes('Westchester County, NY'), 'county description names county + state');
}
// ── cityMeta ──
{
  const { title } = cityMeta({
    fuelLabel: 'Heating Oil', cityName: 'Mount Kisco', stateCode: 'NY',
    supplierCount: 29, stats: null,
  });
  assert.ok(title.startsWith('Mount Kisco, NY Heating Oil Prices'), 'city title front-loads city + state + keyword');
  assert.ok(title.length <= TITLE_CORE_MAX, `city title within max: "${title}"`);
}
// ── fuel label is parametrized (kerosene) ──
{
  const { title } = stateMeta({ fuelLabel: 'Kerosene', stateName: 'Maine', supplierCount: 22, stats: null });
  assert.ok(title.startsWith('Maine Kerosene Prices'), 'fuel label is parametrized (kerosene)');
}
// ── regionMeta (heatingoil-qbd0.8) ──
{
  const { title, description } = regionMeta({
    fuelLabel: 'Heating Oil', regionName: 'Long Island', stateCode: 'NY',
    supplierCount: 40, stats: { min: '3.80', max: '5.20' },
  });
  assert.ok(title.startsWith('Long Island, NY Heating Oil Prices'), 'region title front-loads region+state');
  assert.ok(title.length <= TITLE_CORE_MAX, `region title within max: "${title}" (${title.length})`);
  assert.ok(description.includes('Long Island'), 'region description names region');
}
// ── zipMeta (heatingoil-qbd0.8) ──
{
  const { title } = zipMeta({
    regionName: 'Westchester Area', zipPrefix: '105',
    supplierCount: 30, stats: { min: '3.80', max: '5.20' },
  });
  assert.ok(title.includes('105'), 'zip title keeps the prefix');
  assert.ok(title.toLowerCase().includes('heating oil'), 'zip title keeps the keyword');
  assert.ok(title.length <= TITLE_CORE_MAX, `zip title within max: "${title}" (${title.length})`);
}

{ // supplierMeta — heatingoil-qbd0.2 supplier CTR
  const { title, description } = supplierMeta({ name: 'Bryn Mawr Fuel', city: 'Yonkers', stateCode: 'NY', stats: null });
  assert.ok(title.startsWith('Bryn Mawr Fuel'), 'supplier title leads with business name');
  assert.ok(title.includes('Heating Oil Prices'), 'supplier title keeps keyword when it fits');
  assert.ok(title.length <= TITLE_CORE_MAX, `supplier title within max: "${title}"`);
  assert.ok(!title.includes('HomeHeat'), 'helper does not add brand');
  assert.ok(description.includes('Yonkers, NY'), 'supplier description names city + state');
  assert.ok(description.length <= 160, 'supplier description within 160');
}
{ const { title } = supplierMeta({ name: 'A'.repeat(45), city: 'Springfield', stateCode: 'MA', stats: null });
  assert.ok(title.length <= TITLE_CORE_MAX, 'long-name supplier title still within max');
  assert.ok(title.startsWith('A'.repeat(45)), 'long-name supplier title keeps full name'); }
{ // double-escape guard: helper returns RAW name; render escapes exactly once
  const { title } = supplierMeta({ name: 'S&S Oil', city: 'Derby', stateCode: 'CT', stats: null });
  assert.ok(title.includes('S&S Oil'), 'helper keeps raw ampersand; escaping happens once at render');
  assert.ok(!title.includes('&amp;'), 'helper does NOT pre-escape (avoids S&amp;amp;S)'); }

console.log('✅ seo-meta: all assertions passed');
