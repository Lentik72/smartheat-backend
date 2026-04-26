/**
 * Bare-node tests for render-county-v2.js.
 * Run: node scripts/lib/render-county-v2.test.js
 *
 * Pattern matches existing tests in the repo (fuel-config.test.js,
 * multi-branch-config.test.js) — no jest/mocha, just `assert`.
 */

const assert = require('assert');
const {
  cheapestTiebreak,
  freshnessChip,
  historicalPercentileBand,
  freshnessHuman,
  initials,
  safeTel,
  renderHeroAnswer,
  renderSupplierList,
} = require('./render-county-v2');

// ── cheapestTiebreak ──────────────────────────────────────

assert.strictEqual(cheapestTiebreak([]), null, 'empty list → null');
assert.strictEqual(cheapestTiebreak(null), null, 'null → null');
assert.strictEqual(cheapestTiebreak([{ id: 'a', hasPrice: false, price: null }]), null, 'no priced suppliers → null');

(() => {
  const a = { id: 'a', hasPrice: true, price: 4.55, scrapedAt: '2026-04-24T10:00:00Z' };
  const b = { id: 'b', hasPrice: true, price: 4.65, scrapedAt: '2026-04-24T11:00:00Z' };
  assert.strictEqual(cheapestTiebreak([a, b]).id, 'a', 'lowest price wins');
})();

(() => {
  // Same price, same scrapedAt — must be deterministic via hash.
  const a = { id: 'aaa-id', hasPrice: true, price: 4.65, scrapedAt: '2026-04-24T10:00:00Z' };
  const b = { id: 'bbb-id', hasPrice: true, price: 4.65, scrapedAt: '2026-04-24T10:00:00Z' };
  const winner1 = cheapestTiebreak([a, b]).id;
  const winner2 = cheapestTiebreak([b, a]).id;
  assert.strictEqual(winner1, winner2, 'tiebreak deterministic regardless of input order');
})();

(() => {
  // Same price, different scrapedAt — most recent wins.
  const a = { id: 'a', hasPrice: true, price: 4.65, scrapedAt: '2026-04-24T10:00:00Z' };
  const b = { id: 'b', hasPrice: true, price: 4.65, scrapedAt: '2026-04-24T11:00:00Z' };
  assert.strictEqual(cheapestTiebreak([a, b]).id, 'b', 'most recent scrape wins on tie');
})();

// ── freshnessChip ─────────────────────────────────────────

(() => {
  const now = Date.now();
  assert.strictEqual(freshnessChip(new Date(now - 1 * 3600_000).toISOString()).klass, 'is-fresh', '1h → fresh');
  assert.strictEqual(freshnessChip(new Date(now - 24 * 3600_000).toISOString()).klass, 'is-fresh', '24h → fresh');
  assert.strictEqual(freshnessChip(new Date(now - 47 * 3600_000).toISOString()).klass, 'is-fresh', '47h → fresh (under 48h)');
  assert.strictEqual(freshnessChip(new Date(now - 48 * 3600_000 - 1000).toISOString()).klass, 'is-recent', 'just past 48h → recent');
  assert.strictEqual(freshnessChip(new Date(now - 5 * 24 * 3600_000).toISOString()).klass, 'is-recent', '5d → recent');
  assert.strictEqual(freshnessChip(new Date(now - 8 * 24 * 3600_000).toISOString()).klass, 'is-stale', '8d → stale');
  assert.strictEqual(freshnessChip(null).klass, 'is-stale', 'null → stale');
  assert.strictEqual(freshnessChip(undefined).klass, 'is-stale', 'undefined → stale');
})();

// ── historicalPercentileBand ──────────────────────────────

assert.strictEqual(historicalPercentileBand(4.5, []), null, 'empty history → null (omit block)');
assert.strictEqual(historicalPercentileBand(4.5, null), null, 'null history → null');
assert.strictEqual(historicalPercentileBand(4.5, [{ min_price: 4.5 }]), null, 'history < 7 entries → null');

(() => {
  // 10 history entries; current min ranks #1 (lowest of all)
  const history = Array.from({ length: 10 }, (_, i) => ({ min_price: 4.5 + i * 0.05 }));
  assert.strictEqual(historicalPercentileBand(4.0, history), 'bottom 10%', 'lower than all → bottom 10%');
  assert.strictEqual(historicalPercentileBand(99.0, history), 'top 10%', 'higher than all → top 10%');
})();

// ── freshnessHuman ────────────────────────────────────────

(() => {
  const now = Date.now();
  assert.strictEqual(freshnessHuman(new Date(now - 1 * 3600_000).toISOString()), 'today');
  assert.strictEqual(freshnessHuman(new Date(now - 30 * 3600_000).toISOString()), 'yesterday');
  assert.strictEqual(freshnessHuman(null), 'unknown');
})();

// ── initials ──────────────────────────────────────────────

assert.strictEqual(initials('Supreme Oil'), 'SO');
assert.strictEqual(initials('Oil'), 'OI');
assert.strictEqual(initials('Sons & Co'), 'SC');
assert.strictEqual(initials(''), '??');
assert.strictEqual(initials(null), '??');

// ── safeTel ───────────────────────────────────────────────

assert.strictEqual(safeTel('(914) 750-9498'), '9147509498');
assert.strictEqual(safeTel('+1-914-750-9498'), '+19147509498');
assert.strictEqual(safeTel('123'), null, 'too short → null');
assert.strictEqual(safeTel(null), null);

// ── XSS — supplier name with HTML/script ──────────────────

(() => {
  const malicious = [{
    id: 'm', hasPrice: true, price: 4.55, scrapedAt: new Date().toISOString(),
    name: '<script>alert(1)</script>O\'Brien & "Fast Oil"',
    city: '<img src=x>',
    minGallons: 150,
    phone: '(555) 123-4567',
    slug: 'malicious-slug',
  }];
  const html = renderSupplierList({ suppliers: malicious, cheapestId: 'm' });
  assert.ok(!html.includes('<script>alert'), 'script tag must be escaped');
  assert.ok(html.includes('&lt;script&gt;'), 'script tag rendered as text');
  assert.ok(!html.includes('<img src=x>'), 'img tag in city must be escaped');
  assert.ok(html.includes('&quot;Fast Oil&quot;'), 'double quotes encoded for attribute safety');
  assert.ok(html.includes('aria-label="Call'), 'aria-label intact');
})();

// ── Single tiebreak winner — only ONE row gets is-cheapest ─

(() => {
  // 4 suppliers all tied at $4.65 (live Westchester scenario per spec line 395).
  const tied = [
    { id: 'aaa', hasPrice: true, price: 4.65, scrapedAt: '2026-04-24T10:00:00Z', name: 'A Oil', city: 'X', phone: '5551111111', slug: 'a' },
    { id: 'bbb', hasPrice: true, price: 4.65, scrapedAt: '2026-04-24T10:00:00Z', name: 'B Oil', city: 'X', phone: '5551111111', slug: 'b' },
    { id: 'ccc', hasPrice: true, price: 4.65, scrapedAt: '2026-04-24T10:00:00Z', name: 'C Oil', city: 'X', phone: '5551111111', slug: 'c' },
    { id: 'ddd', hasPrice: true, price: 4.65, scrapedAt: '2026-04-24T10:00:00Z', name: 'D Oil', city: 'X', phone: '5551111111', slug: 'd' },
  ];
  const html = renderSupplierList({ suppliers: tied, cheapestId: 'bbb' });
  const matches = (html.match(/is-cheapest/g) || []).length;
  assert.strictEqual(matches, 1, 'only one row should get is-cheapest class');
  const flagMatches = (html.match(/flag-cheapest/g) || []).length;
  assert.strictEqual(flagMatches, 1, 'only one row should get the Lowest price flag');
})();

// ── Tied-count line — disclosed when N suppliers share min_price ─

(() => {
  const ts = new Date().toISOString();
  const tied = [
    { id: 'a', hasPrice: true, price: 4.55, scrapedAt: ts },
    { id: 'b', hasPrice: true, price: 4.55, scrapedAt: ts },
    { id: 'c', hasPrice: true, price: 4.55, scrapedAt: ts },
    { id: 'd', hasPrice: true, price: 4.55, scrapedAt: ts },
    { id: 'e', hasPrice: true, price: 4.65, scrapedAt: ts },
  ];
  const html = renderHeroAnswer({
    countyName: 'Westchester', stateCode: 'NY', stateName: 'New York',
    stats: { min_price: 4.55, median_price: 4.65, max_price: 4.95 },
    allPricedSuppliers: tied,
    cheapestSupplier: { id: 'a', name: 'Supreme Oil', city: 'White Plains', slug: 'supreme-oil', phone: '9148934800' },
  });
  assert.ok(html.includes('+3 more suppliers tied at this price'), '4 tied → +3 more disclosure');
})();

(() => {
  const ts = new Date().toISOString();
  const single = [{ id: 'a', hasPrice: true, price: 4.55, scrapedAt: ts }];
  const html = renderHeroAnswer({
    countyName: 'Westchester', stateCode: 'NY', stateName: 'New York',
    stats: { min_price: 4.55, median_price: 4.65, max_price: 4.95 },
    allPricedSuppliers: single,
    cheapestSupplier: { id: 'a', name: 'Solo Oil', city: 'White Plains', slug: 'solo-oil', phone: '9148934800' },
  });
  assert.ok(!html.includes('hero-tied-count'), 'no tie → omit disclosure entirely');
})();

(() => {
  // 2-tie → should say "+1 more supplier" (singular, not "+1 more suppliers")
  const ts = new Date().toISOString();
  const two = [
    { id: 'a', hasPrice: true, price: 4.55, scrapedAt: ts },
    { id: 'b', hasPrice: true, price: 4.55, scrapedAt: ts },
  ];
  const html = renderHeroAnswer({
    countyName: 'Putnam', stateCode: 'NY', stateName: 'New York',
    stats: { min_price: 4.55, median_price: 4.65, max_price: 4.95 },
    allPricedSuppliers: two,
    cheapestSupplier: { id: 'a', name: 'Test Oil', city: 'Carmel', slug: 'test', phone: '9148934800' },
  });
  assert.ok(html.includes('+1 more supplier tied at this price'), '2 tied → singular noun');
  assert.ok(!html.includes('+1 more suppliers'), 'no plural when count is 1');
})();

// ── Sticky bar — emitted when cheapest known, omitted otherwise ─

(() => {
  const html = renderHeroAnswer({
    countyName: 'Westchester', stateCode: 'NY', stateName: 'New York',
    stats: { min_price: 4.55, median_price: 4.70, max_price: 4.95 },
    allPricedSuppliers: [{ id: 'a', hasPrice: true, price: 4.55, scrapedAt: new Date().toISOString() }],
    cheapestSupplier: { id: 'a', name: 'Supreme Oil', city: 'White Plains', slug: 'supreme-oil', phone: '9148934800' },
  });
  assert.ok(html.includes('id="stickyBar"'), 'sticky bar markup must render when cheapest is known');
  assert.ok(html.includes('IntersectionObserver'), 'sticky bar JS must be inlined');
  assert.ok(html.includes('Cheapest in Westchester'), 'sticky bar eyebrow uses county name');
  assert.ok(html.includes('Supreme Oil'), 'sticky bar names the cheapest supplier');
})();

(() => {
  const html = renderHeroAnswer({
    countyName: 'Empty', stateCode: 'NY', stateName: 'New York',
    stats: { min_price: null, median_price: null, max_price: null },
    allPricedSuppliers: [],
    cheapestSupplier: null,
  });
  assert.ok(!html.includes('id="stickyBar"'), 'sticky bar omitted when no cheapest supplier');
})();

// ── Hero — savings = 0 graceful omit ──────────────────────

(() => {
  // median ≈ min: savings should not render
  const html = renderHeroAnswer({
    countyName: 'Putnam', stateCode: 'NY', stateName: 'New York',
    stats: { min_price: 4.55, median_price: 4.55, max_price: 4.55 },
    allPricedSuppliers: [{ id: 'a', hasPrice: true, price: 4.55, scrapedAt: new Date().toISOString() }],
    cheapestSupplier: { id: 'a', name: 'Test Oil', city: 'Carmel', slug: 'test-oil' },
  });
  assert.ok(!html.includes('You save ~$0'), 'must not render zero-savings line');
  assert.ok(!html.includes('vs typical'), 'must not render savings chip when no spread');
})();

// ── Hero — null stats handled ─────────────────────────────

(() => {
  const html = renderHeroAnswer({
    countyName: 'Empty', stateCode: 'NY', stateName: 'New York',
    stats: { min_price: null, median_price: null, max_price: null },
    allPricedSuppliers: [],
    cheapestSupplier: null,
  });
  assert.ok(!html.includes('NaN'), 'null stats must not render NaN anywhere');
  assert.ok(!html.includes('$undefined'), 'no undefined leaks');
})();

console.log('render-county-v2 tests passed');
