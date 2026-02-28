#!/usr/bin/env node
/**
 * Claim Funnel Report — CLI dashboard for heatingoil-014
 *
 * Calls the admin funnel endpoint and formats a readable terminal report.
 * Use for day 3/7/14 check-ins after outreach.
 *
 * Usage:
 *   node scripts/claim-funnel-report.js
 *   node scripts/claim-funnel-report.js --url https://www.gethomeheat.com
 *
 * Requires: DASHBOARD_PASSWORD or ADMIN_REVIEW_TOKEN env var
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const BASE_URL = process.argv.find((a, i) => process.argv[i - 1] === '--url')
  || process.env.BACKEND_URL
  || 'http://localhost:3000';

const TOKEN = process.env.ADMIN_REVIEW_TOKEN || process.env.DASHBOARD_PASSWORD;

if (!TOKEN) {
  console.error('ERROR: Set ADMIN_REVIEW_TOKEN or DASHBOARD_PASSWORD in .env');
  process.exit(1);
}

async function main() {
  const url = `${BASE_URL}/api/admin/supplier-claims/funnel?token=${TOKEN}`;

  console.log(`Fetching funnel data from ${BASE_URL}...\n`);

  try {
    const response = await fetch(url);

    if (!response.ok) {
      const text = await response.text();
      console.error(`HTTP ${response.status}: ${text}`);
      process.exit(1);
    }

    const data = await response.json();

    if (!data.success) {
      console.error('API error:', data.error);
      process.exit(1);
    }

    const f = data.funnel;
    const cr = data.conversion_rates;
    const t = data.timing;
    const gi = data.grid_impact;
    const pi = data.price_impact;

    // Format helpers
    const pad = (s, n) => String(s).padStart(n);
    const pct = (s) => s || '—';
    const hrs = (h) => h != null ? `${h}h` : '—';

    console.log('═══════════════════════════════════════════');
    console.log('  CLAIM FUNNEL REPORT — Last 30 Days');
    console.log('═══════════════════════════════════════════');

    // Outreach section
    if (f.outreach_sent > 0) {
      console.log('\n  OUTREACH');
      console.log('  ──────────────────────────────');
      console.log(`  Emails sent:       ${pad(f.outreach_sent, 4)}`);
      console.log(`  Opened claim page: ${pad(f.outreach_opened, 4)}  (${pct(cr.outreach_to_view)})`);
      console.log(`  Avg time to open:  ${hrs(t.avg_hours_outreach_to_view)}`);
    }

    // Full funnel
    console.log('\n  FULL FUNNEL');
    console.log('  ──────────────────────────────');
    if (f.outreach_sent > 0) {
      console.log(`  Page views:        ${pad(f.page_views_total, 4)}  (${f.page_views_organic} organic + ${f.outreach_opened} outreach)`);
    } else {
      console.log(`  Page views:        ${pad(f.page_views_total, 4)}`);
    }
    console.log(`  Form submits:      ${pad(f.form_submits, 4)}  (${pct(cr.view_to_submit)} of views)`);
    console.log(`  Verified:          ${pad(f.verified, 4)}  (${pct(cr.submit_to_verify)} of submits)`);
    console.log(`  Rejected:          ${pad(f.rejected, 4)}`);
    console.log(`  Avg view→submit:   ${hrs(t.avg_hours_view_to_submit)}`);
    console.log(`  Avg submit→verify: ${hrs(t.avg_hours_submit_to_verify)}`);

    // Grid impact
    if (gi.unlocked_views > 0 || gi.locked_views > 0) {
      console.log('\n  GRID IMPACT');
      console.log('  ──────────────────────────────');
      console.log(`  Unlocked grid views: ${pad(gi.unlocked_views, 3)}  →  ${pct(gi.submit_rate_unlocked)} submit rate`);
      console.log(`  Locked grid views:   ${pad(gi.locked_views, 3)}  →  ${pct(gi.submit_rate_locked)} submit rate`);

      // Diagnostic signal
      if (gi.submit_rate_unlocked && gi.submit_rate_locked) {
        const unlockRate = parseFloat(gi.submit_rate_unlocked);
        const lockRate = parseFloat(gi.submit_rate_locked);
        if (unlockRate > lockRate * 2) {
          console.log('  Signal: Grid data IS the conversion lever');
        } else if (Math.abs(unlockRate - lockRate) < 2) {
          console.log('  Signal: Grid data may not matter — rethink what to show');
        }
      }
    }

    // Price impact
    if (pi.priced_views > 0 || pi.unpriced_views > 0) {
      console.log('\n  PRICE IMPACT');
      console.log('  ──────────────────────────────');
      console.log(`  Priced views:   ${pad(pi.priced_views, 3)}  →  ${pct(pi.submit_rate_priced)} submit rate`);
      console.log(`  Unpriced views: ${pad(pi.unpriced_views, 3)}  →  ${pct(pi.submit_rate_unpriced)} submit rate`);
    }

    console.log('\n═══════════════════════════════════════════\n');

    // Decision tree hints
    if (f.page_views_total === 0 && f.outreach_sent > 0) {
      console.log('  ACTION: 0 page views after outreach → Email not landing.');
      console.log('          Rewrite subject line. Try: "X homeowners called your competitors last month"\n');
    } else if (f.form_submits === 0 && f.page_views_total >= 3) {
      console.log('  ACTION: Views but no submits → Claim page not converting.');
      console.log('          Check grid data, tease text, form friction.\n');
    } else if (f.verified === 0 && f.form_submits > 0) {
      console.log('  ACTION: Submits but no verifications → Admin bottleneck.');
      console.log('          Speed up admin response. Target <4h verify time.\n');
    } else if (f.verified >= 3) {
      console.log('  ACTION: Gate is open. Scale to 50 — expand outreach, begin route fill.\n');
    }

  } catch (err) {
    if (err.code === 'ECONNREFUSED') {
      console.error(`Cannot connect to ${BASE_URL}. Is the server running?`);
    } else {
      console.error('Error:', err.message);
    }
    process.exit(1);
  }
}

main();
