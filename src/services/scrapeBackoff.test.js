// src/services/scrapeBackoff.test.js
//
// recordSuccess MUST clear scrape_failure_dates (the rolling 30-day phone_only
// window), not just consecutive_scrape_failures. Otherwise a supplier that
// scrapes successfully and then fails once snaps straight back to phone_only,
// because recordFailure re-reads the stale window and finds >=3 dates still in
// it (heatingoil-duqd). monthlyReset already clears the dates; recordSuccess is
// the one that forgot to. Confirmed in prod: Kelley's Oil / Fox / Coastline were
// phone_only with consecutive_scrape_failures=1 and a successful oil scrape the
// same day.
//
// No DB — a fake `sequelize` captures the SQL; tests assert on what would be
// written and on the action recordFailure returns for a given window.
//
// Run: node src/services/scrapeBackoff.test.js

const { recordSuccess, recordFailure, MAX_FAILURES_IN_30_DAYS } = require('./scrapeBackoff');

let passed = 0, failed = 0;
const pass = (l) => { passed++; console.log(`  ✓ ${l}`); };
const fail = (l, d) => { failed++; console.error(`  ✗ ${l} — ${d}`); };
const ok = (c, l, d) => (c ? pass(l) : fail(l, d || 'expected true'));
const eq = (a, b, l) => (JSON.stringify(a) === JSON.stringify(b) ? pass(l) : fail(l, `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`));

const noopLogger = { warn() {}, info() {} };

// Fake sequelize: captures every query; returns `selectRows` for any SELECT.
function fakeSequelize(selectRows = []) {
  const calls = [];
  return {
    calls,
    async query(sql, opts) {
      calls.push({ sql, bind: opts && opts.bind });
      if (/^\s*SELECT/i.test(sql)) return [selectRows, {}];
      return [[], {}];
    },
  };
}

const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

(async () => {
  console.log('\n=== recordSuccess ===');
  {
    const seq = fakeSequelize();
    await recordSuccess(seq, 'sup-1');
    const upd = seq.calls.find((c) => /UPDATE\s+suppliers/i.test(c.sql));
    ok(upd, 'issues an UPDATE on suppliers');
    ok(/scrape_failure_dates\s*=\s*'\[\]'::jsonb/i.test(upd ? upd.sql : ''), 'clears scrape_failure_dates to [] (heatingoil-duqd)');
    ok(/consecutive_scrape_failures\s*=\s*0/i.test(upd ? upd.sql : ''), 'resets consecutive_scrape_failures to 0');
    ok(/scrape_status\s*=\s*'active'/i.test(upd ? upd.sql : ''), "sets scrape_status to 'active'");
  }

  console.log('\n=== recordFailure: rolling 30-day phone_only window ===');
  {
    // 2 recent failures already in the window → this 3rd one → phone_only
    const seq = fakeSequelize([{ consecutive_scrape_failures: 2, scrape_failure_dates: [daysAgo(3), daysAgo(1)] }]);
    const r = await recordFailure(seq, 'id', 'Sticky Co', noopLogger, 'Price not found in HTML');
    eq(r.action, 'phone_only', `3rd failure in 30d → phone_only (MAX_FAILURES_IN_30_DAYS=${MAX_FAILURES_IN_30_DAYS})`);
  }
  {
    // After a success has cleared the window, a single fresh failure must NOT
    // re-trigger phone_only — this is the behavior the recordSuccess fix restores.
    const seq = fakeSequelize([{ consecutive_scrape_failures: 0, scrape_failure_dates: [] }]);
    const r = await recordFailure(seq, 'id', 'Recovered Co', noopLogger, 'Price not found in HTML');
    eq(r.action, 'none', 'first failure after a cleared window → no escalation');
  }

  console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})();
