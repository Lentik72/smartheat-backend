#!/usr/bin/env node
'use strict';

/**
 * update-supplier-page-stats.js
 *
 * Queries DB for supplier engagement metrics and writes rounded values
 * into for-suppliers.html. Runs nightly after page generators or on-demand.
 *
 * Usage: node scripts/update-supplier-page-stats.js
 *        node scripts/update-supplier-page-stats.js --dry-run
 */

const fs = require('fs').promises;
const path = require('path');

const WEBSITE_DIR = path.join(__dirname, '..', 'website');
const HTML_FILE = path.join(WEBSITE_DIR, 'for-suppliers.html');

// ── Rounding rules ──────────────────────────────────────────────────────

function roundSuppliers(count) {
  if (!count || count < 10) return null;
  return Math.floor(count / 10) * 10 + '+';
}

function roundSearches(count) {
  if (!count || count < 50) return null;
  return Math.floor(count / 50) * 50 + '+';
}

function formatActivity(count) {
  if (!count || count < 20) return null;
  if (count < 100) return 'Dozens';
  return Math.floor(count / 10) * 10 + '+';
}

// ── Queries ─────────────────────────────────────────────────────────────

async function fetchStats(sequelize) {
  const stats = {};

  // 1. Active supplier count
  const [suppRows] = await sequelize.query(
    `SELECT COUNT(*) as count FROM suppliers WHERE active = true`
  );
  stats.suppliers = parseInt(suppRows[0].count, 10);

  // 2. Searches in last 30 days
  const [searchRows] = await sequelize.query(
    `SELECT COUNT(*) as count FROM api_activity
     WHERE endpoint LIKE '%supplier%'
       AND created_at >= NOW() - INTERVAL '30 days'`
  );
  stats.searches = parseInt(searchRows[0].count, 10);

  // 3. Weekly calls + website clicks from latest platform metrics
  const [metricRows] = await sequelize.query(
    `SELECT COALESCE(calls_7d, 0) + COALESCE(website_clicks_7d, 0) as activity
     FROM daily_platform_metrics
     ORDER BY day DESC LIMIT 1`
  );
  stats.activity = metricRows.length > 0 ? parseInt(metricRows[0].activity, 10) : 0;

  return stats;
}

// ── HTML injection ──────────────────────────────────────────────────────

function updateHTML(html, stats) {
  const supplierVal = roundSuppliers(stats.suppliers);
  const searchVal = roundSearches(stats.searches);
  const activityVal = formatActivity(stats.activity);

  const activeStats = [
    supplierVal && { id: 'stat-suppliers', value: supplierVal },
    searchVal && { id: 'stat-searches', value: searchVal },
    activityVal && { id: 'stat-activity', value: activityVal },
  ].filter(Boolean);

  if (activeStats.length === 0) {
    // Hide entire stats bar
    html = html.replace(
      /(<section class="supplier-stats-bar"[^>]*>)/,
      '$1\n        <!-- stats hidden: no data -->\n        <style>.supplier-stats-bar{display:none}</style>'
    );
    return html;
  }

  // Inject each stat value into its placeholder span
  for (const stat of activeStats) {
    const regex = new RegExp(
      `(<span[^>]*id="${stat.id}"[^>]*>)[^<]*(</span>)`
    );
    html = html.replace(regex, `$1${stat.value}$2`);
  }

  // Hide individual stats that have no data by wrapping their parent .supplier-stat
  const allIds = ['stat-suppliers', 'stat-searches', 'stat-activity'];
  const activeIds = activeStats.map(s => s.id);
  for (const id of allIds) {
    if (!activeIds.includes(id)) {
      const hideRegex = new RegExp(
        `(<div class="supplier-stat">\\s*<span[^>]*id="${id}"[^>]*>)[^<]*(</span>)`,
        's'
      );
      html = html.replace(hideRegex, (match) =>
        match.replace('class="supplier-stat"', 'class="supplier-stat" style="display:none"')
      );
    }
  }

  return html;
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  let sequelize;

  try {
    require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
    const { Sequelize } = require('sequelize');
    sequelize = new Sequelize(process.env.DATABASE_URL, {
      logging: false,
      dialectOptions: process.env.DATABASE_URL?.includes('railway')
        ? { ssl: { rejectUnauthorized: false } }
        : {}
    });

    const stats = await fetchStats(sequelize);
    console.log('Raw stats:', stats);
    console.log('Rounded:', {
      suppliers: roundSuppliers(stats.suppliers),
      searches: roundSearches(stats.searches),
      activity: formatActivity(stats.activity),
    });

    let html = await fs.readFile(HTML_FILE, 'utf-8');
    html = updateHTML(html, stats);

    if (dryRun) {
      console.log('Dry run — no file written.');
    } else {
      await fs.writeFile(HTML_FILE, html, 'utf-8');
      console.log('✅ Updated for-suppliers.html with fresh stats.');
    }
  } catch (err) {
    console.error('⚠️ Stats update failed (non-blocking):', err.message);
  } finally {
    if (sequelize) await sequelize.close();
  }
}

// Support both CLI and require() for cron
if (require.main === module) {
  main();
} else {
  module.exports = { main, fetchStats, updateHTML, roundSuppliers, roundSearches, formatActivity };
}
