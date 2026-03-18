#!/usr/bin/env node
/**
 * Generate K-1 Kerosene Hub Page
 * Creates /prices/kerosene/index.html — landing page listing all states with kerosene coverage.
 *
 * Only includes states with ≥5 kerosene-priced suppliers (plan threshold).
 * States below threshold get a mention but no dedicated link.
 *
 * Usage:
 *   DATABASE_URL="..." node scripts/generate-kerosene-hub.js
 *   DATABASE_URL="..." node scripts/generate-kerosene-hub.js --dry-run
 */

const { Sequelize } = require('sequelize');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const {
  STATES,
  BASE_URL,
  getNavHTML,
  getFooterHTML,
  getCssPath,
  init: initCountyData,
  slugify,
  formatPrice,
} = require('./lib/county-data');

const WEBSITE_DIR = path.join(__dirname, '../website');
const OUTPUT_DIR = path.join(WEBSITE_DIR, 'prices', 'kerosene');
const MIN_SUPPLIERS_FOR_STATE = 5;

initCountyData(WEBSITE_DIR);

const cliDryRun = process.argv.includes('--dry-run');

function escapeHtml(text) {
  if (!text) return '';
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Main entry point
 * @param {object} options
 * @param {object} options.sequelize - External Sequelize instance (avoids creating new DB connection)
 * @param {object} options.logger - Logger instance (default: console)
 * @param {boolean} options.dryRun - If true, don't write files
 */
async function generateKeroseneHub(options = {}) {
  const {
    sequelize: externalSequelize = null,
    logger = console,
    dryRun = cliDryRun
  } = options;

  const log = (msg) => logger.info ? logger.info(msg) : console.log(msg);
  const logError = (msg) => logger.error ? logger.error(msg) : console.error(msg);

  log('═══════════════════════════════════════════════════════════');
  log('  Kerosene Hub Page Generator');
  log('  ' + new Date().toLocaleString());
  log('═══════════════════════════════════════════════════════════');

  const ownConnection = !externalSequelize;
  const sequelize = externalSequelize || new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: {
      ssl: process.env.DATABASE_URL?.includes('railway') ? {
        require: true,
        rejectUnauthorized: false
      } : false
    }
  });

  try {
    if (ownConnection) {
      await sequelize.authenticate();
      log('✅ Database connected');
    }

    // Get kerosene suppliers per state (by fuel_types field, not just scraped prices)
    const [stateStats] = await sequelize.query(`
      SELECT
        s.state as state_code,
        COUNT(*) as total_suppliers
      FROM suppliers s
      WHERE s.active = true
        AND s.fuel_types::text ILIKE '%kerosene%'
      GROUP BY s.state
      ORDER BY COUNT(*) DESC
    `);

    // Get scraped kerosene price stats per state (for median/min/max display)
    const [priceStats] = await sequelize.query(`
      SELECT
        state_code,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY median_price) as state_median,
        MIN(min_price) as state_min,
        MAX(max_price) as state_max
      FROM county_current_stats
      WHERE fuel_type = 'kerosene' AND median_price IS NOT NULL
      GROUP BY state_code
    `);
    const priceStatMap = new Map(priceStats.map(p => [p.state_code, p]));

    log(`📊 Found ${stateStats.length} states with kerosene suppliers`);

    // Total kerosene suppliers
    const totalKeroSuppliers = stateStats.reduce((sum, s) => sum + parseInt(s.total_suppliers), 0);

    // Separate states meeting threshold from those below
    const qualifiedStates = [];
    const mentionStates = [];

    for (const stat of stateStats) {
      const stateInfo = STATES[stat.state_code];
      if (!stateInfo) continue;

      const ps = priceStatMap.get(stat.state_code);
      const data = {
        code: stat.state_code,
        name: stateInfo.name,
        abbrev: stateInfo.abbrev,
        median: ps ? parseFloat(ps.state_median) : null,
        min: ps ? parseFloat(ps.state_min) : null,
        max: ps ? parseFloat(ps.state_max) : null,
        suppliers: parseInt(stat.total_suppliers),
        hasPriceData: !!ps,
      };

      if (data.suppliers >= MIN_SUPPLIERS_FOR_STATE) {
        qualifiedStates.push(data);
      } else {
        mentionStates.push(data);
      }
    }

    log(`  Qualified (≥${MIN_SUPPLIERS_FOR_STATE} suppliers): ${qualifiedStates.length} states`);
    log(`  Below threshold: ${mentionStates.length} states`);

    // Build page
    const today = new Date().toISOString().split('T')[0];
    const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const cssPath = getCssPath(2);

    // State table rows
    const stateRows = qualifiedStates.map(s => `
              <tr>
                <td><a href="/prices/kerosene/${s.abbrev}/">${escapeHtml(s.name)}</a></td>
                <td>${s.suppliers}</td>
                <td>${s.median ? '$' + s.median.toFixed(2) : 'Call'}</td>
                <td>${s.min && s.max ? '$' + s.min.toFixed(2) + ' – $' + s.max.toFixed(2) : '—'}</td>
                <td><a href="/prices/kerosene/${s.abbrev}/">View suppliers →</a></td>
              </tr>`).join('');

    // Mention states (below threshold)
    const mentionHtml = mentionStates.length > 0
      ? `<p class="kh-mention">Also tracking kerosene in: ${mentionStates.map(s =>
          `${escapeHtml(s.name)} (${s.suppliers} supplier${s.suppliers > 1 ? 's' : ''})`
        ).join(', ')}. More suppliers coming soon.</p>`
      : '';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-HCNTVGNVJ9"></script>
<script src="../../js/analytics.js"></script>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="apple-itunes-app" content="app-id=6747320571">
  <title>K-1 Kerosene Prices by State — Compare Suppliers | HomeHeat</title>
  <meta name="description" content="Compare K-1 kerosene prices from ${totalKeroSuppliers} suppliers across ${qualifiedStates.length + mentionStates.length} states. Updated daily. Find the lowest kerosene price near you.">
  <link rel="canonical" href="${BASE_URL}/prices/kerosene/">
  <meta property="og:title" content="K-1 Kerosene Prices by State">
  <meta property="og:description" content="Compare K-1 kerosene prices from local suppliers. Updated daily.">
  <meta property="og:url" content="${BASE_URL}/prices/kerosene/">
  <meta property="og:type" content="website">
  <link rel="stylesheet" href="${cssPath}">
  <link rel="icon" type="image/png" sizes="32x32" href="../../favicon-32.png">
  <link rel="manifest" href="../../manifest.json">
  <meta name="theme-color" content="#FF6B35">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": "K-1 Kerosene Prices by State",
    "description": "Compare K-1 kerosene prices from local suppliers across the Northeast United States",
    "url": "${BASE_URL}/prices/kerosene/",
    "publisher": {
      "@type": "Organization",
      "name": "HomeHeat",
      "url": "${BASE_URL}"
    }
  }
  </script>
  <style>
  .kh-page { max-width: 800px; margin: 0 auto; padding: 0 1rem; }
  .kh-page h1 { font-size: 1.75rem; margin: 1.5rem 0 0.5rem; }
  .kh-subtitle { color: var(--text-secondary, #555); font-size: 0.95rem; margin-bottom: 1.5rem; }
  .kh-stats { display: flex; gap: 24px; margin-bottom: 24px; flex-wrap: wrap; }
  .kh-stat { background: var(--background-secondary, #FEF3EB); border-radius: 8px; padding: 16px 20px; flex: 1; min-width: 140px; }
  .kh-stat-value { font-size: 1.5rem; font-weight: 700; color: #2d8a2d; margin: 0; }
  .kh-stat-label { font-size: 0.75rem; color: var(--text-muted, #888); text-transform: uppercase; letter-spacing: 0.05em; margin: 4px 0 0; }
  .kh-table { width: 100%; border-collapse: collapse; margin: 1.5rem 0; }
  .kh-table th, .kh-table td { padding: 12px; text-align: left; border-bottom: 1px solid var(--border-color, #ddd); }
  .kh-table th { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted, #888); }
  .kh-table td a { color: var(--primary-orange, #FF6B35); text-decoration: none; font-weight: 500; }
  .kh-table td a:hover { text-decoration: underline; }
  .kh-mention { font-size: 0.875rem; color: var(--text-secondary, #555); margin: 1rem 0; }
  .kh-education { margin: 2rem 0; }
  .kh-education h2 { font-size: 1.25rem; margin: 1.5rem 0 0.75rem; }
  .kh-education p { font-size: 0.9375rem; line-height: 1.6; color: var(--text-secondary, #555); margin: 0 0 1rem; }
  .kh-cross-link { background: #f0f7ff; border: 1px solid #d0e3f7; border-radius: 8px; padding: 16px 20px; margin: 2rem 0; text-align: center; }
  .kh-cross-link h3 { font-size: 1rem; margin: 0 0 4px; color: #1a365d; }
  .kh-cross-link a { color: var(--primary-orange, #FF6B35); font-weight: 600; text-decoration: none; }
  .kh-cross-link a:hover { text-decoration: underline; }
  .kh-tools { display: flex; gap: 12px; margin: 1.5rem 0; flex-wrap: wrap; }
  .kh-tool-link { display: inline-block; padding: 10px 16px; border: 1px solid var(--border-color, #ddd); border-radius: 8px; text-decoration: none; color: var(--text-primary, #1a1a1a); font-weight: 500; font-size: 0.875rem; transition: border-color 0.15s; }
  .kh-tool-link:hover { border-color: var(--primary-orange, #FF6B35); }
  @media (max-width: 600px) {
    .kh-stats { flex-direction: column; }
    .kh-table { font-size: 0.875rem; }
    .kh-table th:nth-child(4), .kh-table td:nth-child(4) { display: none; }
  }
  </style>
</head>
<body data-page-type="kerosene-hub">
  ${getNavHTML(2)}

  <main class="kh-page">
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <a href="/">Home</a> › <a href="/prices">Prices</a> › <span>K-1 Kerosene</span>
    </nav>

    <h1>K-1 Kerosene Prices by State</h1>
    <p class="kh-subtitle">Compare K-1 kerosene prices from local COD suppliers. Updated daily from verified supplier websites.</p>

    <div class="kh-stats">
      <div class="kh-stat">
        <p class="kh-stat-value">${totalKeroSuppliers}</p>
        <p class="kh-stat-label">Suppliers Reporting</p>
      </div>
      <div class="kh-stat">
        <p class="kh-stat-value">${qualifiedStates.length + mentionStates.length}</p>
        <p class="kh-stat-label">States Covered</p>
      </div>
      ${qualifiedStates.length > 0 && qualifiedStates[0].median ? `<div class="kh-stat">
        <p class="kh-stat-value">$${qualifiedStates[0].median.toFixed(2)}</p>
        <p class="kh-stat-label">Avg Price (${qualifiedStates[0].name})</p>
      </div>` : ''}
    </div>

    ${qualifiedStates.length > 0 ? `
    <table class="kh-table">
      <thead>
        <tr>
          <th>State</th>
          <th>Suppliers</th>
          <th>Avg Price</th>
          <th>Range</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${stateRows}
      </tbody>
    </table>` : '<p>Kerosene price data is being collected. Check back soon for state-level comparisons.</p>'}

    ${mentionHtml}

    <div class="kh-tools">
      <a href="/tools/blend-calculator" class="kh-tool-link">Oil/Kerosene Blend Calculator</a>
      <a href="/tools/heating-cost-calculator" class="kh-tool-link">Heating Cost Calculator</a>
    </div>

    <section class="kh-education">
      <h2>Why K-1 Kerosene?</h2>
      <p>K-1 kerosene is a highly refined fuel used primarily in outdoor heating oil tanks and in regions where temperatures regularly drop below 20°F. Unlike #2 heating oil, which begins to gel around 20°F, K-1 kerosene remains liquid down to approximately -40°F, making it essential for reliable heating in extreme cold.</p>
      <p>In northern New England — particularly Maine and New Hampshire — many homeowners use K-1 kerosene blends to prevent fuel line freezing during winter. Suppliers in these states commonly publish kerosene prices alongside heating oil prices, making direct comparison possible.</p>

      <h2>Kerosene vs Heating Oil</h2>
      <p>K-1 kerosene typically costs $0.50–$1.00 more per gallon than #2 heating oil. The premium reflects additional refining required to lower the gel point. For indoor tanks in moderate climates, straight heating oil is the better value. For outdoor tanks or sub-zero temperatures, kerosene or a kerosene blend prevents the fuel gelling that can shut down your heating system.</p>
      <p>Many suppliers offer pre-blended fuel (80/20 or 70/30 oil/kerosene) during winter months. Use our <a href="/tools/blend-calculator">blend calculator</a> to find the right mix ratio for your temperature.</p>

      <h2>K-1 Kerosene Delivery</h2>
      <p>Kerosene delivery works the same as heating oil — COD (cash on delivery) with typical minimums of 100–150 gallons. Most suppliers that deliver heating oil also deliver kerosene since both fuels are carried on the same truck. Call your supplier to confirm kerosene availability and pricing.</p>
    </section>

    <div class="kh-cross-link">
      <h3>Looking for Heating Oil?</h3>
      <a href="/prices">Compare Heating Oil Prices →</a>
    </div>

    <p style="text-align:center; font-size: 0.8rem; color: #999; margin: 2rem 0;">
      Data updated daily · <a href="/" style="color: #FF6B35;">gethomeheat.com</a>
    </p>
  </main>

  ${getFooterHTML(2)}
</body>
</html>`;

    // Write
    if (!dryRun) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      fs.writeFileSync(path.join(OUTPUT_DIR, 'index.html'), html, 'utf-8');
      log(`✅ Generated /prices/kerosene/index.html`);
    } else {
      log(`[DRY RUN] Would write /prices/kerosene/index.html (${html.length} bytes)`);
    }

    qualifiedStates.forEach(s => {
      log(`  ${s.name}: ${s.suppliers} suppliers${s.median ? ', $' + s.median.toFixed(2) + ' median' : ''}`);
    });

    if (ownConnection) {
      await sequelize.close();
    }

    return { success: true, states: qualifiedStates.length, totalSuppliers: totalKeroSuppliers };
  } catch (error) {
    logError(`❌ Error: ${error.message}`);
    if (ownConnection) {
      await sequelize.close();
    }
    return { success: false, error: error.message };
  }
}

module.exports = { generateKeroseneHub };

// Run directly if executed from command line
if (require.main === module) {
  generateKeroseneHub()
    .then(result => {
      if (!result.success) process.exit(1);
    })
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}
