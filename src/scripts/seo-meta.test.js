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

// ── DESC_MIN floor (Bing "too short" fix, qbd0.x) — every helper, incl. sparse + real-shaped inputs ──
const { DESC_MIN } = require('../../scripts/lib/seo-meta');
assert.strictEqual(typeof DESC_MIN, 'number', 'DESC_MIN exported');

function assertLen(desc, label) {
  assert.ok(desc.length >= DESC_MIN, `${label}: ${desc.length} >= ${DESC_MIN} (too short) :: ${desc}`);
  assert.ok(desc.length <= 160, `${label}: ${desc.length} <= 160 (too long) :: ${desc}`);
}

assertLen(cityMeta({ fuelLabel: 'Propane', cityName: 'Alma', stateCode: 'NY', countyName: 'Allegany', supplierCount: 1, stats: null }).description, 'cityMeta sparse');
assertLen(cityMeta({ fuelLabel: 'Heating Oil', cityName: 'White Plains', stateCode: 'NY', countyName: 'Westchester', supplierCount: 16, stats: { min: '4.40', max: '5.15' } }).description, 'cityMeta rich');
assertLen(cityMeta({ fuelLabel: 'Heating Oil', cityName: 'Batavia', stateCode: 'NY', countyName: null, supplierCount: 2, stats: null }).description, 'cityMeta no-county');
assertLen(countyMeta({ fuelLabel: 'Heating Oil', countyName: 'Nye', stateCode: 'NV', supplierCount: 1, stats: null }).description, 'countyMeta sparse');
assertLen(regionMeta({ fuelLabel: 'Heating Oil', regionName: 'Cape Cod', stateCode: 'MA', supplierCount: 2, stats: null }).description, 'regionMeta sparse');
assertLen(zipMeta({ regionName: 'Long Island', zipPrefix: '117', supplierCount: 0, stats: null }).description, 'zipMeta sparse');
assertLen(supplierMeta({ name: 'A1 Oil', city: null, stateCode: null, price: null }).description, 'supplierMeta short no-loc no-price');
assertLen(supplierMeta({ name: 'Tevis Energy', city: 'Westminster', stateCode: 'MD', price: null }).description, 'supplierMeta typical no-price');
assertLen(supplierMeta({ name: 'Mccleary Oil Company', city: 'Chambersburg', stateCode: 'PA', price: '4.69' }).description, 'supplierMeta long-name with-price');
assertLen(supplierMeta({ name: 'Reisdorf Oil & Propane', city: 'Warsaw', stateCode: 'NY', price: '4.29' }).description, 'supplierMeta ampersand long with-price');
// A typical no-price supplier must read as a COMPLETE sentence, not a clamp-truncated fragment:
assert.ok(!supplierMeta({ name: 'Tevis Energy', city: 'Westminster', stateCode: 'MD', price: null }).description.endsWith('…'), 'typical supplier desc not truncated');

// ── grammar: singular vs plural supplier word (qbd0.x — no "1 suppliers") ──
{
  const d1 = cityMeta({ fuelLabel: 'Propane', cityName: 'Alma', stateCode: 'NY', countyName: 'Allegany', supplierCount: 1, stats: null }).description;
  assert.ok(!/1 local suppliers/.test(d1), 'no "1 local suppliers" grammar slip :: ' + d1);
  assert.ok(/\b1 local supplier\b/.test(d1), 'singular "1 local supplier" :: ' + d1);
  const d2 = cityMeta({ fuelLabel: 'Propane', cityName: 'Alma', stateCode: 'NY', countyName: 'Allegany', supplierCount: 2, stats: null }).description;
  assert.ok(/\b2 local suppliers\b/.test(d2), 'plural "2 local suppliers" :: ' + d2);
}

console.log('✅ seo-meta: all assertions passed');
