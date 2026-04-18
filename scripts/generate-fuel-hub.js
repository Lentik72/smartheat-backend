#!/usr/bin/env node
/**
 * Generate Fuel Hub Page (multi-fuel)
 * Creates /prices/<fuel>/index.html — landing page listing all states with coverage for a given fuel.
 *
 * Only includes states with >=5 suppliers for the fuel (plan threshold).
 * States below threshold get a "coming soon" mention.
 *
 * Usage:
 *   DATABASE_URL="..." node scripts/generate-fuel-hub.js --fuel=kerosene
 *   DATABASE_URL="..." node scripts/generate-fuel-hub.js --fuel=propane --dry-run
 *   DATABASE_URL="..." node scripts/generate-fuel-hub.js                # defaults to kerosene
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
const MIN_SUPPLIERS_FOR_STATE = 5;

// Parse --fuel=X argument (default: kerosene for backward compat)
const fuelArg = process.argv.find(a => a.startsWith('--fuel='));
const FUEL_TYPE = fuelArg ? fuelArg.split('=')[1] : 'kerosene';

// ── Fuel-specific configuration ──────────────────────────────────────────────
const FUEL_HUB_CONFIGS = {
  kerosene: {
    fuelType: 'kerosene',
    label: 'K-1 Kerosene',
    pageTitle: 'K-1 Kerosene Prices by State — Compare Suppliers | HomeHeat',
    heroTitle: 'K-1 Kerosene Prices by State',
    heroSubtitle: 'Compare K-1 kerosene prices from local COD suppliers. Updated daily from verified supplier websites.',
    outputDir: path.join(WEBSITE_DIR, 'prices', 'kerosene'),
    urlPrefix: '/prices/kerosene',
    crossLinkUrl: '/prices',
    crossLinkLabel: 'Compare Heating Oil Prices',
    crossLinkHeading: 'Looking for Heating Oil?',
    breadcrumbLabel: 'K-1 Kerosene',
    metaDescription: (totalSuppliers, stateCount) =>
      `Compare K-1 kerosene prices from ${totalSuppliers} suppliers across ${stateCount} states. Updated daily. Find the lowest kerosene price near you.`,
    ogDescription: 'Compare K-1 kerosene prices from local suppliers. Updated daily.',
    schemaDescription: 'Compare K-1 kerosene prices from local suppliers across the Northeast United States',
    emptyStateMessage: 'Kerosene price data is being collected. Check back soon for state-level comparisons.',
    introSection: '',
    toolLinks: [
      { href: '/tools/blend-calculator', label: 'Oil/Kerosene Blend Calculator' },
      { href: '/tools/heating-cost-calculator', label: 'Heating Cost Calculator' },
    ],
    educationSection: `
      <h2>Why K-1 Kerosene?</h2>
      <p>K-1 kerosene is a highly refined fuel used primarily in outdoor heating oil tanks and in regions where temperatures regularly drop below 20\u00B0F. Unlike #2 heating oil, which begins to gel around 20\u00B0F, K-1 kerosene remains liquid down to approximately -40\u00B0F, making it essential for reliable heating in extreme cold.</p>
      <p>In northern New England \u2014 particularly Maine and New Hampshire \u2014 many homeowners use K-1 kerosene blends to prevent fuel line freezing during winter. Suppliers in these states commonly publish kerosene prices alongside heating oil prices, making direct comparison possible.</p>

      <h2>Kerosene vs Heating Oil</h2>
      <p>K-1 kerosene typically costs $0.50\u2013$1.00 more per gallon than #2 heating oil. The premium reflects additional refining required to lower the gel point. For indoor tanks in moderate climates, straight heating oil is the better value. For outdoor tanks or sub-zero temperatures, kerosene or a kerosene blend prevents the fuel gelling that can shut down your heating system.</p>
      <p>Many suppliers offer pre-blended fuel (80/20 or 70/30 oil/kerosene) during winter months. Use our <a href="/tools/blend-calculator">blend calculator</a> to find the right mix ratio for your temperature.</p>

      <h2>K-1 Kerosene Delivery</h2>
      <p>Kerosene delivery works the same as heating oil \u2014 COD (cash on delivery) with typical minimums of 100\u2013150 gallons. Most suppliers that deliver heating oil also deliver kerosene since both fuels are carried on the same truck. Call your supplier to confirm kerosene availability and pricing.</p>`,
    faqItems: [
      { q: 'What is K-1 kerosene?', a: 'K-1 is a highly refined kerosene that stays liquid down to -40\u00B0F, making it ideal for outdoor tanks and extreme cold climates.' },
      { q: 'Why is kerosene more expensive than heating oil?', a: 'K-1 requires additional refining to lower its gel point. Expect to pay $0.50\u2013$1.00 more per gallon than #2 heating oil.' },
      { q: 'Can I mix kerosene with heating oil?', a: 'Yes. Many suppliers offer 80/20 or 70/30 oil/kerosene blends during winter. Use our blend calculator to find the right ratio for your temperature.' },
    ],
  },

  propane: {
    fuelType: 'propane',
    label: 'Propane',
    pageTitle: 'Propane Prices by State — Compare Suppliers | HomeHeat',
    heroTitle: 'Propane Prices by State',
    heroSubtitle: 'Compare delivered propane prices from local suppliers. Updated daily from verified supplier websites.',
    outputDir: path.join(WEBSITE_DIR, 'prices', 'propane'),
    urlPrefix: '/prices/propane',
    crossLinkUrl: '/prices',
    crossLinkLabel: 'Compare Heating Oil Prices',
    crossLinkHeading: 'Looking for Heating Oil?',
    breadcrumbLabel: 'Propane',
    metaDescription: (totalSuppliers, stateCount) =>
      `Compare delivered propane prices from ${totalSuppliers} suppliers across ${stateCount} states. Updated daily. Find the lowest propane price near you.`,
    ogDescription: 'Compare delivered propane prices from local suppliers. Updated daily.',
    schemaDescription: 'Compare delivered propane prices from local suppliers across the United States',
    emptyStateMessage: 'Propane price data is being collected. Check back soon for state-level comparisons.',
    introSection: `
  <div style="background: #f8f9fa; border-radius: 12px; padding: 24px; margin-bottom: 32px;">
    <h3 style="margin-top: 0;">Delivered vs. Retail Propane</h3>
    <p>Buying propane at retail stores costs $3.50\u2013$5.00 per gallon equivalent. Delivered propane from local suppliers typically runs $1.80\u2013$3.00 per gallon \u2014 saving you 30\u201350% on every fill.</p>
    <p><a href="/learn/propane-delivered-vs-retail" style="color: #FF6B35; font-weight: 600;">Use our break-even calculator \u2192</a></p>
  </div>
`,
    toolLinks: [
      { href: '/tools/heating-cost-calculator', label: 'Heating Cost Calculator' },
    ],
    educationSection: `
      <h2>Why Delivered Propane?</h2>
      <p>Delivered propane is the most cost-effective way to fuel your home if you use more than 100 gallons per year. Local COD suppliers offer bulk pricing significantly below retail tank exchange rates, with the convenience of scheduled or on-demand delivery.</p>

      <h2>Propane Tank Sizes</h2>
      <p>Most homes use a 500-gallon tank for primary heating. Hot water and cooking typically require a 120\u2013250 gallon tank. If you own your tank, you can shop freely among COD/will-call suppliers for the best price.</p>

      <h2>Propane Delivery</h2>
      <p>COD propane delivery works similarly to heating oil \u2014 you order when you need it and pay on delivery. Minimum orders are typically 100\u2013150 gallons. Many suppliers serve both propane and heating oil customers from the same fleet.</p>`,
    faqItems: [
      { q: 'What size propane tank do I need for home heating?', a: 'Most homes use a 500-gallon tank for primary heating. Hot water and cooking use a 120-250 gallon tank.' },
      { q: 'Is delivered propane cheaper than retail?', a: 'Yes. Delivered propane runs $1.80\u2013$3.00/gal vs $3.50\u2013$5.00/gal at retail. If you use more than 100 gallons/year, delivery saves money.' },
      { q: 'Can I switch propane suppliers?', a: 'If you own your tank, yes \u2014 COD/will-call suppliers let you switch anytime. If the supplier owns the tank, check your agreement.' },
    ],
  },
};

const fuelConfig = FUEL_HUB_CONFIGS[FUEL_TYPE];
if (!fuelConfig) {
  console.error(`Unknown fuel type: ${FUEL_TYPE}. Valid: ${Object.keys(FUEL_HUB_CONFIGS).join(', ')}`);
  process.exit(1);
}

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
 * @param {string} options.fuel - Fuel type override (default: CLI-parsed FUEL_TYPE)
 */
async function generateFuelHub(options = {}) {
  const {
    sequelize: externalSequelize = null,
    logger = console,
    dryRun = cliDryRun,
    fuel,
  } = options;

  const activeFuel = fuel || FUEL_TYPE;
  const activeFuelConfig = FUEL_HUB_CONFIGS[activeFuel] || fuelConfig;

  const log = (msg) => logger.info ? logger.info(msg) : console.log(msg);
  const logError = (msg) => logger.error ? logger.error(msg) : console.error(msg);

  log('═══════════════════════════════════════════════════════════');
  log(`  ${activeFuelConfig.label} Hub Page Generator`);
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
      log('\u2705 Database connected');
    }

    // Get suppliers per state (by fuel_types field, not just scraped prices)
    const [stateStats] = await sequelize.query(`
      SELECT
        s.state as state_code,
        COUNT(*) as total_suppliers
      FROM suppliers s
      WHERE s.active = true
        AND s.fuel_types::text ILIKE '%${activeFuelConfig.fuelType}%'
      GROUP BY s.state
      ORDER BY COUNT(*) DESC
    `);

    // Get scraped price stats per state (for median/min/max display)
    const [priceStats] = await sequelize.query(`
      SELECT
        state_code,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY median_price) as state_median,
        MIN(min_price) as state_min,
        MAX(max_price) as state_max
      FROM county_current_stats
      WHERE fuel_type = '${activeFuelConfig.fuelType}' AND median_price IS NOT NULL
      GROUP BY state_code
    `);
    const priceStatMap = new Map(priceStats.map(p => [p.state_code, p]));

    log(`\uD83D\uDCCA Found ${stateStats.length} states with ${activeFuelConfig.label.toLowerCase()} suppliers`);

    // Total suppliers for this fuel
    const totalSuppliers = stateStats.reduce((sum, s) => sum + parseInt(s.total_suppliers), 0);

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
        supplierCount: parseInt(stat.total_suppliers),
        stateName: stateInfo.name,
        hasPriceData: !!ps,
      };

      if (data.suppliers >= MIN_SUPPLIERS_FOR_STATE) {
        qualifiedStates.push(data);
      } else {
        mentionStates.push(data);
      }
    }

    log(`  Qualified (\u2265${MIN_SUPPLIERS_FOR_STATE} suppliers): ${qualifiedStates.length} states`);
    log(`  Below threshold: ${mentionStates.length} states`);

    // Build page
    const today = new Date().toISOString().split('T')[0];
    const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const cssPath = getCssPath(2);

    // State table rows
    const stateRows = qualifiedStates.map(s => `
              <tr>
                <td><a href="${activeFuelConfig.urlPrefix}/${s.abbrev}/">${escapeHtml(s.name)}</a></td>
                <td>${s.suppliers}</td>
                <td>${s.median ? '$' + s.median.toFixed(2) : 'Call'}</td>
                <td>${s.min && s.max ? '$' + s.min.toFixed(2) + ' \u2013 $' + s.max.toFixed(2) : '\u2014'}</td>
                <td><a href="${activeFuelConfig.urlPrefix}/${s.abbrev}/">View suppliers \u2192</a></td>
              </tr>`).join('');

    // Mention states (below threshold)
    const mentionHtml = mentionStates.length > 0
      ? `<p class="kh-mention">Also tracking ${activeFuelConfig.label.toLowerCase()} in: ${mentionStates.map(s =>
          `${escapeHtml(s.name)} (${s.suppliers} supplier${s.suppliers > 1 ? 's' : ''})`
        ).join(', ')}. More suppliers coming soon.</p>`
      : '';

    // "Coming soon" section for below-threshold states with at least 1 supplier
    const stateResults = [...qualifiedStates, ...mentionStates];
    const belowThreshold = stateResults.filter(s => s.supplierCount > 0 && s.supplierCount < MIN_SUPPLIERS_FOR_STATE);
    let comingSoonHtml = '';
    if (belowThreshold.length > 0) {
      comingSoonHtml = `<div style="margin-top: 24px; padding: 16px; background: #f0f4f8; border-radius: 8px;">
    <p style="margin: 0; color: #666;">Coming soon: ${belowThreshold.map(s => s.stateName).join(', ')}. We're expanding ${activeFuelConfig.label.toLowerCase()} coverage \u2014 more suppliers added weekly.</p>
  </div>`;
    }

    // Tool links
    const toolLinksHtml = activeFuelConfig.toolLinks.length > 0
      ? `<div class="kh-tools">\n${activeFuelConfig.toolLinks.map(t =>
          `      <a href="${t.href}" class="kh-tool-link">${escapeHtml(t.label)}</a>`
        ).join('\n')}\n    </div>`
      : '';

    // FAQ structured data
    const faqSchema = activeFuelConfig.faqItems.length > 0 ? `
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [${activeFuelConfig.faqItems.map(f => `
      {
        "@type": "Question",
        "name": ${JSON.stringify(f.q)},
        "acceptedAnswer": {
          "@type": "Answer",
          "text": ${JSON.stringify(f.a)}
        }
      }`).join(',')}
    ]
  }
  </script>` : '';

    const totalStateCount = qualifiedStates.length + mentionStates.length;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-HCNTVGNVJ9"></script>
<script src="../../js/analytics.js"></script>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="apple-itunes-app" content="app-id=6747320571">
  <title>${activeFuelConfig.pageTitle}</title>
  <meta name="description" content="${activeFuelConfig.metaDescription(totalSuppliers, totalStateCount)}">
  <link rel="canonical" href="${BASE_URL}${activeFuelConfig.urlPrefix}/">
  <meta property="og:title" content="${activeFuelConfig.heroTitle}">
  <meta property="og:description" content="${activeFuelConfig.ogDescription}">
  <meta property="og:image" content="https://www.gethomeheat.com/images/screenshot-1-home.png">
  <meta property="og:url" content="${BASE_URL}${activeFuelConfig.urlPrefix}/">
  <meta property="og:type" content="website">
  <link rel="stylesheet" href="${cssPath}">
  <link rel="icon" type="image/png" sizes="32x32" href="../../favicon-32.png">
  <link rel="manifest" href="../../manifest.json">
  <meta name="theme-color" content="#FF6B35">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": "${activeFuelConfig.heroTitle}",
    "description": "${activeFuelConfig.schemaDescription}",
    "url": "${BASE_URL}${activeFuelConfig.urlPrefix}/",
    "publisher": {
      "@type": "Organization",
      "name": "HomeHeat",
      "url": "${BASE_URL}"
    }
  }
  </script>${faqSchema}
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
<body data-page-type="${activeFuelConfig.fuelType}-hub">
  ${getNavHTML(2)}

  <main class="kh-page">
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <a href="/">Home</a> › <a href="/prices">Prices</a> › <span>${activeFuelConfig.breadcrumbLabel}</span>
    </nav>

    <h1>${activeFuelConfig.heroTitle}</h1>
    <p class="kh-subtitle">${activeFuelConfig.heroSubtitle}</p>

    <div class="kh-stats">
      <div class="kh-stat">
        <p class="kh-stat-value">${totalSuppliers}</p>
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
    </table>` : '<p>' + activeFuelConfig.emptyStateMessage + '</p>'}

    ${mentionHtml}

    ${comingSoonHtml}

    ${toolLinksHtml}

    ${activeFuelConfig.introSection}

    <section class="kh-education">${activeFuelConfig.educationSection}
    </section>

    <div class="kh-cross-link">
      <h3>${activeFuelConfig.crossLinkHeading}</h3>
      <a href="${activeFuelConfig.crossLinkUrl}">${activeFuelConfig.crossLinkLabel} →</a>
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
      fs.mkdirSync(activeFuelConfig.outputDir, { recursive: true });
      fs.writeFileSync(path.join(activeFuelConfig.outputDir, 'index.html'), html, 'utf-8');
      log(`\u2705 Generated ${activeFuelConfig.urlPrefix}/index.html`);
    } else {
      log(`[DRY RUN] Would write ${activeFuelConfig.urlPrefix}/index.html (${html.length} bytes)`);
    }

    qualifiedStates.forEach(s => {
      log(`  ${s.name}: ${s.suppliers} suppliers${s.median ? ', $' + s.median.toFixed(2) + ' median' : ''}`);
    });

    if (ownConnection) {
      await sequelize.close();
    }

    return { success: true, states: qualifiedStates.length, totalSuppliers };
  } catch (error) {
    logError(`\u274C Error: ${error.message}`);
    if (ownConnection) {
      await sequelize.close();
    }
    return { success: false, error: error.message };
  }
}

module.exports = { generateFuelHub };

// Run directly if executed from command line
if (require.main === module) {
  generateFuelHub()
    .then(result => {
      if (!result.success) process.exit(1);
    })
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}
