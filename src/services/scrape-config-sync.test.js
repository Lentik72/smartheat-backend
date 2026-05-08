// src/services/scrape-config-sync.test.js
//
// Tests for the policy decisions inside ScrapeConfigSync. No DB —
// the class instance gets a fake `sequelize` whose .query() captures
// the SQL params; tests assert on what would have been written.
//
// Why this test exists: silent coverage drift is a known class of bug
// for this project (e.g., postalCodesOverride forgotten leads to
// permanent over-coverage; SCRAPECONFIG_SKIP_COVERAGE accidentally left
// on disables all writes). These tests pin the policy boundaries.
//
// Run: node src/services/scrape-config-sync.test.js

const ScrapeConfigSync = require('./ScrapeConfigSync');
const { _shouldSyncConfigEntry } = require('./ScrapeConfigSync');

let passed = 0;
let failed = 0;
function pass(label) { passed++; console.log(`  ✓ ${label}`); }
function fail(label, detail) { failed++; console.error(`  ✗ ${label} — ${detail}`); }
function assertEqual(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) pass(label); else fail(label, `expected ${e}, got ${a}`);
}
function assertTrue(cond, label, detail) { if (cond) pass(label); else fail(label, detail || 'expected true'); }
function assertFalse(cond, label) { if (!cond) pass(label); else fail(label, 'expected false'); }

// ────────────────────────────────────────────────────────────────
console.log('\n=== _shouldSyncConfigEntry (predicate) ===');
// ────────────────────────────────────────────────────────────────

assertFalse(_shouldSyncConfigEntry(null), 'null → false');
assertFalse(_shouldSyncConfigEntry(undefined), 'undefined → false');
assertFalse(_shouldSyncConfigEntry({}), 'empty object → false');
assertFalse(_shouldSyncConfigEntry({ enabled: true }), 'no postalCodesServed and no branches → false');
assertFalse(_shouldSyncConfigEntry({ postalCodesServed: [] }), 'empty postalCodesServed array → false');
assertFalse(_shouldSyncConfigEntry({ branches: {} }), 'empty branches map → false');
assertTrue(_shouldSyncConfigEntry({ postalCodesServed: ['12345'] }), 'non-empty postalCodesServed → true');
assertTrue(_shouldSyncConfigEntry({ branches: { 'branch-1': { postalCodesServed: ['12345'] } } }), 'non-empty branches → true');
assertTrue(_shouldSyncConfigEntry({ postalCodesServed: ['12345'], branches: { b: {} } }), 'either condition is sufficient');

// ────────────────────────────────────────────────────────────────
console.log('\n=== _syncSupplierCoverage (merge policy) ===');
// ────────────────────────────────────────────────────────────────

// Build a fake sequelize that captures every query call and returns
// reasonable defaults for the UPDATE the function makes.
function fakeSequelize() {
  const calls = [];
  return {
    QueryTypes: { UPDATE: 'UPDATE' },
    query(sql, opts) {
      calls.push({ sql, opts });
      return Promise.resolve([[], 0]);
    },
    _calls: calls,
  };
}

function newSync() {
  const seq = fakeSequelize();
  const sync = new ScrapeConfigSync(seq);
  return { sync, seq };
}

const baseCtx = { skipCoverage: false, zipDbLoaded: false, zipDb: {}, unresolvableZips: new Set() };

(async () => {

// SCRAPECONFIG_SKIP_COVERAGE → no DB write, regardless of inputs.
{
  const { sync, seq } = newSync();
  const supplier = { id: 'sup-1', postal_codes_served: ['12345'] };
  const cfg = { postalCodesServed: ['99999'] };
  const result = await sync._syncSupplierCoverage(supplier, cfg, 'TestCo', { ...baseCtx, skipCoverage: true });
  assertEqual(result, { updated: false, driftDetected: false }, 'skipCoverage → returns unchanged sentinel');
  assertEqual(seq._calls.length, 0, 'skipCoverage → zero DB calls');
}

// Empty config ZIPs and no override → skipped (no write).
{
  const { sync, seq } = newSync();
  const supplier = { id: 'sup-1', postal_codes_served: ['12345'] };
  const cfg = { postalCodesServed: [] };
  const result = await sync._syncSupplierCoverage(supplier, cfg, 'TestCo', { ...baseCtx });
  assertEqual(result.updated, false, 'empty config + no override → not updated');
  assertEqual(seq._calls.length, 0, 'empty config + no override → no DB call');
}

// Default mode (no override) = union merge: config adds, never removes.
{
  const { sync, seq } = newSync();
  const supplier = { id: 'sup-2', postal_codes_served: ['12345', '12346'] };
  const cfg = { postalCodesServed: ['12346', '12347'] };
  const result = await sync._syncSupplierCoverage(supplier, cfg, 'TestCo', { ...baseCtx });
  assertEqual(result.updated, true, 'union merge → updated');
  assertEqual(seq._calls.length, 1, 'union merge → one DB call');
  const writtenZips = JSON.parse(seq._calls[0].opts.bind[0]);
  assertEqual(writtenZips.sort(), ['12345', '12346', '12347'], 'union merge → sorted union of existing + config');
}

// postalCodesOverride: true → config replaces existing, even shrinking.
{
  const { sync, seq } = newSync();
  const supplier = { id: 'sup-3', postal_codes_served: ['12345', '12346', '12347'] };
  const cfg = { postalCodesServed: ['12345'], postalCodesOverride: true };
  const result = await sync._syncSupplierCoverage(supplier, cfg, 'TestCo', { ...baseCtx });
  assertEqual(result.updated, true, 'override mode → updated (shrink)');
  const writtenZips = JSON.parse(seq._calls[0].opts.bind[0]);
  assertEqual(writtenZips, ['12345'], 'override mode → exactly the config ZIPs');
}

// Override with empty config → DOES write empty (this is the explicit kill-coverage path).
{
  const { sync, seq } = newSync();
  const supplier = { id: 'sup-4', postal_codes_served: ['12345', '12346'] };
  const cfg = { postalCodesServed: [], postalCodesOverride: true };
  const result = await sync._syncSupplierCoverage(supplier, cfg, 'TestCo', { ...baseCtx });
  assertEqual(result.updated, true, 'override mode + empty config → updated (clears coverage)');
  const writtenZips = JSON.parse(seq._calls[0].opts.bind[0]);
  assertEqual(writtenZips, [], 'override mode + empty config → empty array written');
}

// No actual change → no DB write (idempotent).
{
  const { sync, seq } = newSync();
  const supplier = { id: 'sup-5', postal_codes_served: ['12345', '12346'] };
  const cfg = { postalCodesServed: ['12346', '12345'] }; // same set, different order
  const result = await sync._syncSupplierCoverage(supplier, cfg, 'TestCo', { ...baseCtx });
  assertEqual(result.updated, false, 'set equal → no update');
  assertEqual(seq._calls.length, 0, 'set equal → no DB call');
}

// Drift detection: config ZIPs not in DB and DB ZIPs not in config both reported.
{
  const { sync } = newSync();
  const supplier = { id: 'sup-6', postal_codes_served: ['12345', '99999'] };
  const cfg = { postalCodesServed: ['12345', '88888'] };
  const result = await sync._syncSupplierCoverage(supplier, cfg, 'TestCo', { ...baseCtx });
  assertEqual(result.driftDetected, true, 'mismatched DB and config → driftDetected=true');
}

// JSON-string postal_codes_served (some DB rows return as string) is parsed correctly.
{
  const { sync, seq } = newSync();
  const supplier = { id: 'sup-7', postal_codes_served: '["12345","12346"]' };
  const cfg = { postalCodesServed: ['12347'] };
  const result = await sync._syncSupplierCoverage(supplier, cfg, 'TestCo', { ...baseCtx });
  assertEqual(result.updated, true, 'string-encoded existing zips → handled');
  const writtenZips = JSON.parse(seq._calls[0].opts.bind[0]);
  assertEqual(writtenZips.sort(), ['12345', '12346', '12347'], 'union merges with string-encoded existing');
}

// Invalid ZIPs in config are dropped (normalizeZip), not written.
{
  const { sync, seq } = newSync();
  const supplier = { id: 'sup-8', postal_codes_served: [] };
  const cfg = { postalCodesServed: ['12345', 'invalid', '67890', ''] };
  const result = await sync._syncSupplierCoverage(supplier, cfg, 'TestCo', { ...baseCtx });
  assertEqual(result.updated, true, 'invalid ZIPs dropped, valid ones written');
  const writtenZips = JSON.parse(seq._calls[0].opts.bind[0]);
  assertEqual(writtenZips, ['12345', '67890'], 'only normalized valid ZIPs reach DB');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

})();
