// src/utils/review-queue-sql.test.js
//
// Canonical review-queue SQL: portal (GET /api/price-review) and daily-email/
// admin count MUST share the same LATEST-heating-oil logic, or one surface
// flags fresh in-band suppliers as false alarms while the other doesn't.
//
// Both branches are latest-oil based:
//   suspicious = LATEST valid oil price out-of-band (NOT "any is_valid row")
//   blocked    = cooldown/phone_only AND latest oil NOT fresh (<48h) in-band
// Freshness clock = scraped_at (review suppression), NOT expires_at.
// Wiring assertions (call sites import/call the builders) are APPENDED in Task 2
// and committed WITH the call-site edits, so every commit stays test-green.
//
// Run: node src/utils/review-queue-sql.test.js

const fs = require('fs');
const path = require('path');
const { buildBlockedSitesSQL, buildReviewCountSQL } = require('./review-queue-sql');

let passed = 0, failed = 0;
function pass(l){ passed++; console.log(`  ✓ ${l}`); }
function fail(l,d){ failed++; console.error(`  ✗ ${l} — ${d}`); }
function has(s,re,l){ re.test(s)?pass(l):fail(l,`/${re.source}/ not found`); }
function hasNot(s,re,l){ !re.test(s)?pass(l):fail(l,`/${re.source}/ should NOT appear`); }

console.log('\n=== buildBlockedSitesSQL (portal) ===');
{
  const sql = buildBlockedSitesSQL();
  has(sql, /scrape_status\s*=\s*'cooldown'\s*OR\s*s\.scrape_status\s*=\s*'phone_only'/, 'selects cooldown/phone_only');
  has(sql, /lp\.current_price IS NULL/, 'guard: no price');
  has(sql, /lp\.scraped_at\s*<\s*NOW\(\)\s*-\s*INTERVAL '48 hours'/, 'guard: latest oil stale (older than 48h)');
  has(sql, /lp\.current_price\s*<\s*2\.00/, 'guard: out-of-band low');
  has(sql, /lp\.current_price\s*>\s*5\.50/, 'guard: out-of-band high');
  hasNot(sql, /expires_at/, 'does NOT key off expires_at');
  has(sql, /'scrape_blocked' as review_reason/, 'tags scrape_blocked');
}

console.log('\n=== buildReviewCountSQL (email/admin) ===');
{
  const sql = buildReviewCountSQL();
  has(sql, /COUNT\(DISTINCT s\.id\)/, 'is COUNT(DISTINCT)');
  has(sql, /WITH latest_oil AS/, 'uses a latest_oil CTE');
  has(sql, /DISTINCT ON \(supplier_id\)/, 'CTE is latest-per-supplier');
  has(sql, /price_review_dismissals/, 'excludes dismissed');
  has(sql, /\(\s*\(lo\.current_price\s*<\s*2\.00\s*OR\s*lo\.current_price\s*>\s*5\.50\)\s*OR\s*\(\s*s\.scrape_status IN/, 'suspicious is a top-level OR branch (not only inside blocked)');
  has(sql, /scrape_status IN \('cooldown', 'phone_only'\)/, 'blocked branch present');
  has(sql, /lo\.scraped_at\s*<\s*NOW\(\)\s*-\s*INTERVAL '48 hours'/, 'blocked guard: latest oil stale (older than 48h)');
  has(sql, /NOT EXISTS\s*\(\s*SELECT 1 FROM supplier_prices sp2\b[\s\S]*?sp2\.is_valid = true/, 'needs_initial: no valid price');
  hasNot(sql, /expires_at/, 'does NOT key off expires_at');
}

console.log('\n=== wiring: call sites import + call the builders ===');
{
  const read = p => fs.readFileSync(path.join(__dirname, p), 'utf8');
  const pr = read('../routes/price-review.js');
  has(pr, /require\(['"]\.\.\/utils\/review-queue-sql['"]\)/, 'price-review.js requires the util');
  has(pr, /buildBlockedSitesSQL\(\)/, 'price-review.js calls buildBlockedSitesSQL()');
  const srv = read('../../server.js');
  has(srv, /require\(['"]\.\/src\/utils\/review-queue-sql['"]\)/, 'server.js requires the util');
  has(srv, /buildReviewCountSQL\(\)/, 'server.js calls buildReviewCountSQL()');
  const adm = read('../routes/admin.js');
  has(adm, /require\(['"]\.\.\/utils\/review-queue-sql['"]\)/, 'admin.js requires the util');
  has(adm, /buildReviewCountSQL\(\)/, 'admin.js calls buildReviewCountSQL()');
  // the old inline queries must be GONE (replaced, not left alongside the new call)
  hasNot(pr,  /'scrape_blocked' as review_reason/, 'price-review.js no longer inlines the blocked query');
  hasNot(srv, /COUNT\(DISTINCT s\.id\) as cnt/, 'server.js no longer inlines the old guard-less count query');
  hasNot(adm, /COUNT\(DISTINCT s\.id\) as cnt/, 'admin.js no longer inlines the old guard-less count query');
}

console.log(`\n${failed===0?'✅':'❌'} ${passed} passed, ${failed} failed`);
process.exit(failed===0?0:1);
