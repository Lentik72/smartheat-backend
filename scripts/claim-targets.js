#!/usr/bin/env node
/**
 * Claim Targets — Outreach tooling for heatingoil-014
 *
 * Generates urgency-ranked list of top unclaimed suppliers for outreach.
 * Optionally sends outreach emails via Resend (one-by-one with confirmation).
 *
 * Usage:
 *   node scripts/claim-targets.js              # List top 10 targets
 *   node scripts/claim-targets.js --top 20     # List top 20 targets
 *   node scripts/claim-targets.js --send       # List + prompt to send emails
 *
 * Requires: DATABASE_URL env var (or .env file in backend root)
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { Sequelize } = require('sequelize');
const readline = require('readline');

const TOP_N = parseInt(process.argv.find((a, i) => process.argv[i - 1] === '--top') || '10');
const SEND_MODE = process.argv.includes('--send');
const BASE_URL = process.env.BACKEND_URL || 'https://www.gethomeheat.com';

// ── DB Connection ────────────────────────────────────────────────
function getSequelize() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('ERROR: DATABASE_URL not set. Add to .env or export.');
    process.exit(1);
  }
  return new Sequelize(dbUrl, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: dbUrl.includes('railway.app') ? { ssl: { require: true, rejectUnauthorized: false } } : {}
  });
}

// ── Prompt helper ────────────────────────────────────────────────
function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

// ── Main ─────────────────────────────────────────────────────────
async function main() {
  const sequelize = getSequelize();

  try {
    await sequelize.authenticate();
    console.log('Connected to database.\n');

    // 1. Find unclaimed suppliers with phone + email on file
    const [candidates] = await sequelize.query(`
      SELECT
        s.id,
        s.name,
        s.slug,
        s.city,
        s.state,
        s.phone,
        s.email,
        s.postal_codes_served
      FROM suppliers s
      WHERE s.active = true
        AND s.claimed_at IS NULL
        AND s.phone IS NOT NULL
        AND s.email IS NOT NULL
        AND jsonb_array_length(COALESCE(s.postal_codes_served, '[]'::jsonb)) > 0
    `);

    if (candidates.length === 0) {
      console.log('No eligible unclaimed suppliers found (need active, unclaimed, with phone + email + ZIPs).');
      process.exit(0);
    }

    console.log(`Found ${candidates.length} eligible unclaimed suppliers. Computing market data...\n`);

    // 2. Compute market data for each candidate
    const results = [];
    for (const c of candidates) {
      const [rows] = await sequelize.query(`
        WITH supplier_zips AS (
          SELECT DISTINCT LEFT(jsonb_array_elements_text(:postalCodes::jsonb), 5) as zip
        ),
        area_searches AS (
          SELECT COALESCE(SUM(request_count), 0) as total
          FROM user_locations ul
          INNER JOIN supplier_zips sz ON LEFT(ul.zip_code, 5) = sz.zip
        ),
        own_clicks AS (
          SELECT COUNT(*) as total
          FROM supplier_clicks sc
          WHERE sc.supplier_id = :supplierId
            AND sc.created_at > NOW() - INTERVAL '30 days'
        ),
        competitor_clicks AS (
          SELECT COUNT(*) as total
          FROM supplier_clicks sc
          INNER JOIN supplier_zips sz ON LEFT(sc.zip_code, 5) = sz.zip
          WHERE sc.supplier_id != :supplierId
            AND sc.created_at > NOW() - INTERVAL '30 days'
        ),
        current_price AS (
          SELECT price_per_gallon
          FROM supplier_prices
          WHERE supplier_id = :supplierId AND is_valid = true
          ORDER BY scraped_at DESC LIMIT 1
        ),
        zip_demand AS (
          SELECT DISTINCT LEFT(sz.zip, 3) as prefix,
            COALESCE(SUM(ul.request_count), 0) as demand_weight
          FROM supplier_zips sz
          LEFT JOIN user_locations ul ON LEFT(ul.zip_code, 5) = sz.zip
          GROUP BY LEFT(sz.zip, 3)
        ),
        market_price AS (
          SELECT CASE
            WHEN SUM(zd.demand_weight) > 0
            THEN ROUND(SUM(zcs.median_price::numeric * zd.demand_weight) / SUM(zd.demand_weight), 3)
            ELSE ROUND(AVG(zcs.median_price::numeric), 3)
            END as avg_median
          FROM zip_current_stats zcs
          INNER JOIN zip_demand zd ON zcs.zip_prefix = zd.prefix
          WHERE zcs.fuel_type = 'heating_oil' AND zcs.median_price IS NOT NULL
        )
        SELECT
          (SELECT total FROM area_searches) as area_searches,
          (SELECT total FROM own_clicks) as own_clicks,
          (SELECT total FROM competitor_clicks) as competitor_clicks,
          (SELECT price_per_gallon FROM current_price) as current_price,
          (SELECT avg_median FROM market_price) as market_avg
      `, {
        replacements: {
          supplierId: c.id,
          postalCodes: JSON.stringify(c.postal_codes_served)
        }
      });

      const row = rows[0] || {};
      const areaSearches = parseInt(row.area_searches || 0);
      const ownClicks = parseInt(row.own_clicks || 0);
      const competitorClicks = parseInt(row.competitor_clicks || 0);
      const currentPrice = row.current_price ? parseFloat(row.current_price) : null;
      const marketAvg = row.market_avg ? parseFloat(row.market_avg) : null;
      const priceDelta = (currentPrice && marketAvg) ? currentPrice - marketAvg : 0;
      const clickShare = (ownClicks + competitorClicks > 0)
        ? Math.round(ownClicks / (ownClicks + competitorClicks) * 100)
        : 0;

      // Urgency score: competitor capture + poor price positioning = maximum urgency
      const score = (areaSearches * 0.5) + (competitorClicks * 1.5) + (priceDelta > 0 ? priceDelta * 40 : 0);

      results.push({
        id: c.id,
        name: c.name,
        slug: c.slug,
        city: c.city,
        state: c.state,
        phone: c.phone,
        email: c.email,
        areaSearches,
        ownClicks,
        competitorClicks,
        clickShare,
        priceDelta: priceDelta ? priceDelta.toFixed(2) : 'N/A',
        score: Math.round(score * 10) / 10,
        claimUrl: `${BASE_URL}/claim/${c.slug}`
      });
    }

    // 3. Rank by urgency score
    results.sort((a, b) => b.score - a.score);
    const topTargets = results.slice(0, TOP_N);

    // 4. Check for recent outreach (idempotency)
    const [recentOutreach] = await sequelize.query(`
      SELECT DISTINCT (details::jsonb)->>'slug' as slug
      FROM audit_logs
      WHERE action = 'outreach_email_sent'
        AND created_at > NOW() - INTERVAL '30 days'
    `);
    const recentSlugs = new Set(recentOutreach.map(r => r.slug));

    // 5. Display table
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log(`  TOP ${topTargets.length} CLAIM TARGETS — Urgency Ranked`);
    console.log('═══════════════════════════════════════════════════════════════════════\n');
    console.log(
      '#'.padEnd(4) +
      'Supplier'.padEnd(30) +
      'Location'.padEnd(18) +
      'Score'.padEnd(8) +
      'Searches'.padEnd(10) +
      'Comp.'.padEnd(8) +
      'Own'.padEnd(6) +
      'Share'.padEnd(7) +
      'Delta'.padEnd(8) +
      'Status'
    );
    console.log('─'.repeat(109));

    for (let i = 0; i < topTargets.length; i++) {
      const t = topTargets[i];
      const alreadySent = recentSlugs.has(t.slug);
      const status = alreadySent ? 'SENT' : 'ready';
      console.log(
        `${i + 1}`.padEnd(4) +
        t.name.slice(0, 28).padEnd(30) +
        `${t.city}, ${t.state}`.slice(0, 16).padEnd(18) +
        `${t.score}`.padEnd(8) +
        `${t.areaSearches}`.padEnd(10) +
        `${t.competitorClicks}`.padEnd(8) +
        `${t.ownClicks}`.padEnd(6) +
        `${t.clickShare}%`.padEnd(7) +
        `${t.priceDelta}`.padEnd(8) +
        status
      );
    }

    console.log('\n' + '─'.repeat(109));
    console.log(`  Showing ${topTargets.length} of ${results.length} eligible suppliers`);
    console.log(`  ${recentSlugs.size} already contacted in last 30 days\n`);

    // 6. Send emails if --send mode
    if (!SEND_MODE) {
      console.log('Run with --send to send outreach emails.\n');
      process.exit(0);
    }

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      console.error('ERROR: RESEND_API_KEY not set. Cannot send emails.');
      process.exit(1);
    }

    const emailFrom = process.env.EMAIL_FROM || 'HomeHeat <onboarding@resend.dev>';

    for (const t of topTargets) {
      if (recentSlugs.has(t.slug)) {
        console.log(`SKIP: ${t.name} — already sent in last 30 days`);
        continue;
      }

      console.log(`\n────────────────────────────────────────`);
      console.log(`TO: ${t.name} <${t.email}>`);
      console.log(`    ${t.city}, ${t.state}`);
      console.log(`    Score: ${t.score} | Competitors: ${t.competitorClicks} clicks | Own: ${t.ownClicks} clicks`);
      console.log(`    Claim URL: ${t.claimUrl}`);

      const answer = await ask(`Send outreach email? (y/n): `);
      if (answer !== 'y' && answer !== 'yes') {
        console.log('Skipped.');
        continue;
      }

      // Build email HTML
      const subject = `"${t.name}" — homeowners are searching for you on HomeHeat`;
      const html = buildOutreachEmail(t);

      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: emailFrom,
            to: [t.email],
            subject,
            html
          })
        });

        const result = await response.json();

        if (response.ok) {
          console.log(`SENT: ${result.id}`);

          // Log to audit_logs
          await sequelize.query(`
            INSERT INTO audit_logs (action, details, created_at, updated_at)
            VALUES ('outreach_email_sent', :details, NOW(), NOW())
          `, {
            replacements: {
              details: JSON.stringify({
                slug: t.slug,
                email: t.email,
                campaign: 'first_10',
                score: t.score,
                resend_id: result.id
              })
            }
          });

          recentSlugs.add(t.slug); // prevent double-send in same run
        } else {
          console.error(`FAILED: ${JSON.stringify(result)}`);
        }
      } catch (err) {
        console.error(`ERROR: ${err.message}`);
      }
    }

    console.log('\nDone.');

  } finally {
    await sequelize.close();
  }
}

// ── Email Template ───────────────────────────────────────────────
function buildOutreachEmail(target) {
  const competitorShare = 100 - target.clickShare;

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 20px; color: #333;">
      <div style="text-align: center; margin-bottom: 24px;">
        <img src="https://www.gethomeheat.com/images/app-icon-small.png" alt="HomeHeat" style="width: 40px; height: 40px; border-radius: 8px;">
      </div>

      <h1 style="font-size: 20px; color: #1a1a1a; margin: 0 0 16px; line-height: 1.3;">
        Homeowners clicked competitors <strong style="color: #DC2626;">${target.competitorClicks} times</strong> in your area last month
      </h1>

      <div style="background: #FEF3EB; padding: 16px; border-radius: 10px; margin: 20px 0;">
        <p style="margin: 0 0 8px; font-size: 15px; color: #374151;">
          Your listing on HomeHeat received <strong>${target.ownClicks} click${target.ownClicks !== 1 ? 's' : ''}</strong> — but
          <strong style="color: #DC2626;">${competitorShare}%</strong> of local clicks went to competitors instead.
        </p>
        <p style="margin: 0; font-size: 15px; color: #374151;">
          ${target.areaSearches.toLocaleString()} homeowners searched for heating oil in your coverage area.
        </p>
      </div>

      <h3 style="font-size: 16px; color: #1a1a1a; margin: 24px 0 8px;">Without claiming, you can't:</h3>
      <ul style="color: #4B5563; font-size: 15px; line-height: 1.8; padding-left: 20px; margin: 0 0 24px;">
        <li>Update your price (so homeowners see your current rate)</li>
        <li>See full analytics on who's searching</li>
        <li>Get your Verified Business badge</li>
        <li>Update your price by text message</li>
      </ul>

      <div style="text-align: center; margin: 32px 0;">
        <a href="${target.claimUrl}" style="display: inline-block; background: #FF6B35; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
          Claim Your Listing — Free
        </a>
      </div>

      <p style="font-size: 13px; color: #999; text-align: center; margin-top: 32px; line-height: 1.5;">
        You're receiving this because ${target.name} is listed on HomeHeat.<br>
        If you'd prefer not to hear from us, simply reply with "unsubscribe".<br><br>
        HomeHeat · Connecting homeowners with local heating oil suppliers
      </p>
    </div>
  `;
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
