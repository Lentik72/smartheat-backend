// src/migrations-list.test.js
//
// Static-analysis tests for the migration list. No DB needed — these
// catch class-of-bug regressions at edit time:
//   1. A file path in the list points to a missing migration.
//   2. A migration file exports the wrong shape (missing `up`, or `up`
//      isn't an async function).
//   3. The list contains duplicate slugs (paste mistake).
//   4. Migration IDs go backwards (entry inserted in wrong place).
//   5. Any migration with id > 100 writes `postal_codes_served` —
//      ScrapeConfigSync owns that column from migration 100 onward.
//
// Run: node src/migrations-list.test.js
// Convention: plain assertions, exits 0 on success, 1 on any failure.

const fs = require('fs');
const path = require('path');
const { migrations, loadMigrationModule, migrationId, MIGRATIONS_DIR } = require('./migrations-list');

let passed = 0;
let failed = 0;
function pass(label) { passed++; console.log(`  ✓ ${label}`); }
function fail(label, detail) { failed++; console.error(`  ✗ ${label} — ${detail}`); }
function assertTrue(cond, label, detail) { if (cond) pass(label); else fail(label, detail || 'expected true'); }

console.log('\n=== Migration list integrity ===');

// 1. List is non-empty.
assertTrue(Array.isArray(migrations) && migrations.length > 0, 'list is non-empty array');

// 2. Every entry has slug + label.
for (const m of migrations) {
  assertTrue(typeof m.slug === 'string' && m.slug.length > 0, `entry has slug (${JSON.stringify(m).slice(0, 80)})`);
  assertTrue(typeof m.label === 'string' && m.label.length > 0, `entry has label (slug=${m.slug})`);
}

// 3. No duplicate slugs.
{
  const seen = new Set();
  const dupes = [];
  for (const m of migrations) {
    if (seen.has(m.slug)) dupes.push(m.slug);
    seen.add(m.slug);
  }
  assertTrue(dupes.length === 0, 'no duplicate slugs', dupes.join(', ') || '');
}

// 4. Each migration file exists on disk.
console.log('\n=== Migration files exist on disk ===');
for (const m of migrations) {
  const filePath = path.join(MIGRATIONS_DIR, m.slug + '.js');
  assertTrue(fs.existsSync(filePath), `${m.slug} file exists`, `expected ${filePath}`);
}

// 5. Each migration file exports { up: async function }.
console.log('\n=== Migration export contract ===');
for (const m of migrations) {
  let mod;
  try { mod = loadMigrationModule(m); } catch (err) {
    fail(`${m.slug} requires`, err.message);
    continue;
  }
  assertTrue(mod && typeof mod.up === 'function', `${m.slug} exports up function`,
    `got typeof up = ${typeof (mod && mod.up)}`);
  // Async functions have constructor.name === 'AsyncFunction'.
  if (mod && typeof mod.up === 'function') {
    assertTrue(mod.up.constructor.name === 'AsyncFunction', `${m.slug} up is async`,
      `got ${mod.up.constructor.name}`);
  }
}

// 6. Migration IDs are monotonically non-decreasing — entry inserted in wrong place would fail this.
console.log('\n=== Migration ID order ===');
{
  let prev = 0;
  let outOfOrder = [];
  for (const m of migrations) {
    const id = migrationId(m);
    if (id === null) { fail(`${m.slug} id parses`, 'no leading digits'); continue; }
    if (id < prev) outOfOrder.push(`${m.slug} (${id}) after ${prev}`);
    prev = id;
  }
  assertTrue(outOfOrder.length === 0, 'IDs are monotonically non-decreasing', outOfOrder.join('; ') || '');
}

// 7. Post-100 contract: no migration after id=100 may OVERWRITE postal_codes_served
//    on existing rows. ScrapeConfigSync owns that column from migration 100 onward
//    (per backend/CLAUDE.md "Coverage Authority"). The hard-violation patterns:
//      a. `postal_codes_served = EXCLUDED.postal_codes_served` in ON CONFLICT DO UPDATE
//         (overwrites coverage every time the migration re-runs at startup).
//      b. `UPDATE suppliers SET ... postal_codes_served = ...` (direct rewrite).
//    Initial INSERT column-list usage is allowed: the row is new on first run,
//    ON CONFLICT DO NOTHING / DO UPDATE-without-postal_codes_served on re-runs.
//    ScrapeConfigSync union-merges from scrape-config.json afterward.
console.log('\n=== Post-100 postal_codes_served contract ===');
{
  const overwriteOnConflict = /postal_codes_served\s*=\s*EXCLUDED\.postal_codes_served/i;
  const directUpdate = /UPDATE\s+suppliers[\s\S]{0,500}?\bSET\b[\s\S]{0,500}?\bpostal_codes_served\s*=/i;
  const violators = [];
  for (const m of migrations) {
    const id = migrationId(m);
    if (id === null || id <= 100) continue;
    const filePath = path.join(MIGRATIONS_DIR, m.slug + '.js');
    let content;
    try { content = fs.readFileSync(filePath, 'utf8'); } catch (e) { continue; }
    const hits = [];
    if (overwriteOnConflict.test(content)) hits.push('ON CONFLICT EXCLUDED overwrite');
    if (directUpdate.test(content)) hits.push('direct UPDATE');
    if (hits.length) violators.push(`${m.slug} (${hits.join(', ')})`);
  }
  assertTrue(violators.length === 0, 'no migration after id=100 overwrites postal_codes_served', violators.join('; ') || '');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
