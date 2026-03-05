#!/usr/bin/env node
/**
 * Uncovered Demand Report
 *
 * Shows ZIPs where people signed up for price alerts but we have no
 * active supplier coverage (or only stale prices). This is demand signal
 * for supplier outreach — these users want to buy oil and nobody's serving them.
 *
 * Usage:
 *   node scripts/uncovered-demand.js
 *   node scripts/uncovered-demand.js --all   (include covered ZIPs too)
 *
 * Requires: DATABASE_URL or DATABASE_PUBLIC_URL in .env
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Sequelize } = require('sequelize');

const showAll = process.argv.includes('--all');

async function main() {
  const dbUrl = process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const sequelize = new Sequelize(dbUrl, {
    logging: false,
    dialectOptions: { ssl: { rejectUnauthorized: false } }
  });

  await sequelize.authenticate();

  // For each ZIP with active subscribers, check supplier coverage
  const [rows] = await sequelize.query(`
    WITH subscriber_zips AS (
      SELECT
        zip_code,
        COUNT(*) AS subscribers,
        MIN(created_at) AS first_signup,
        MAX(created_at) AS latest_signup,
        ROUND(AVG(threshold_price)::numeric, 2) AS avg_threshold,
        SUM(CASE WHEN alert_count = 0 THEN 1 ELSE 0 END) AS never_alerted
      FROM price_alert_subscribers
      WHERE active = true
      GROUP BY zip_code
    ),
    zip_coverage AS (
      SELECT
        sz.zip_code,
        COUNT(DISTINCT s.id) AS active_suppliers,
        MIN(sp.price_per_gallon)::numeric AS current_min_price,
        MAX(sp.scraped_at) AS latest_scrape
      FROM subscriber_zips sz
      LEFT JOIN suppliers s ON s.active = true
        AND s.allow_price_display = true
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(s.postal_codes_served) AS z
          WHERE z = sz.zip_code
        )
      LEFT JOIN supplier_prices sp ON sp.supplier_id = s.id
        AND sp.is_valid = true
        AND sp.expires_at > NOW()
        AND sp.scraped_at > NOW() - INTERVAL '72 hours'
        AND sp.source_type != 'aggregator_signal'
      GROUP BY sz.zip_code
    )
    SELECT
      sz.zip_code,
      sz.subscribers,
      sz.never_alerted,
      sz.avg_threshold,
      sz.first_signup,
      sz.latest_signup,
      COALESCE(zc.active_suppliers, 0) AS active_suppliers,
      zc.current_min_price,
      zc.latest_scrape,
      CASE
        WHEN COALESCE(zc.active_suppliers, 0) = 0 THEN 'NO COVERAGE'
        WHEN zc.current_min_price IS NULL THEN 'STALE PRICES'
        ELSE 'COVERED'
      END AS status
    FROM subscriber_zips sz
    LEFT JOIN zip_coverage zc ON zc.zip_code = sz.zip_code
    ORDER BY
      CASE
        WHEN COALESCE(zc.active_suppliers, 0) = 0 THEN 0
        WHEN zc.current_min_price IS NULL THEN 1
        ELSE 2
      END,
      sz.subscribers DESC
  `);

  await sequelize.close();

  if (rows.length === 0) {
    console.log('No active subscribers found.');
    return;
  }

  const uncovered = rows.filter(r => r.status === 'NO COVERAGE');
  const stale = rows.filter(r => r.status === 'STALE PRICES');
  const covered = rows.filter(r => r.status === 'COVERED');

  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('  UNCOVERED DEMAND REPORT');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  ${rows.length} ZIPs with active subscribers`);
  console.log(`  ${uncovered.length} NO COVERAGE  |  ${stale.length} STALE  |  ${covered.length} COVERED`);
  console.log('═══════════════════════════════════════════════════');

  if (uncovered.length > 0) {
    console.log('');
    console.log('  NO COVERAGE — zero suppliers serve these ZIPs');
    console.log('  ─────────────────────────────────────────────');
    printTable(uncovered);
  }

  if (stale.length > 0) {
    console.log('');
    console.log('  STALE PRICES — suppliers exist but no fresh prices (>72h)');
    console.log('  ────────────────────────────────────────────────────────');
    printTable(stale);
  }

  if (showAll && covered.length > 0) {
    console.log('');
    console.log('  COVERED — active suppliers with fresh prices');
    console.log('  ────────────────────────────────────────────');
    printTable(covered);
  }

  // Summary for outreach
  if (uncovered.length > 0 || stale.length > 0) {
    const totalDemand = [...uncovered, ...stale].reduce((sum, r) => sum + parseInt(r.subscribers), 0);
    console.log('');
    console.log(`  → ${totalDemand} subscribers waiting across ${uncovered.length + stale.length} underserved ZIPs`);
    console.log('  → Use these ZIPs to prioritize supplier outreach (heatingoil-014)');
  }

  console.log('');
}

function printTable(rows) {
  for (const r of rows) {
    const subs = String(r.subscribers).padStart(3);
    const neverAlerted = r.never_alerted > 0 ? ` (${r.never_alerted} never alerted)` : '';
    const suppliers = r.active_suppliers > 0 ? `${r.active_suppliers} suppliers` : 'none';
    const price = r.current_min_price ? `$${parseFloat(r.current_min_price).toFixed(2)}` : '—';
    const threshold = `avg threshold $${r.avg_threshold}`;
    const firstSignup = new Date(r.first_signup).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    console.log(`    ${r.zip_code}  ${subs} subs  |  ${suppliers}  |  min: ${price}  |  ${threshold}  |  since ${firstSignup}${neverAlerted}`);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
