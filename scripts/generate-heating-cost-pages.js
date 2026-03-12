#!/usr/bin/env node
/**
 * Heating Cost Estimator Page Generator
 *
 * Creates auto-generated pages answering "What will heating cost me?"
 * at state and county level using real oil price data + energy rates.
 *
 * URLs:
 *   /heating-cost/{state}/index.html       — e.g., /heating-cost/ny/
 *   /heating-cost/{state}/{county}.html     — e.g., /heating-cost/ny/westchester.html
 *
 * Thresholds:
 *   - ≥3 suppliers in the area
 *   - ≥2 active prices within 48 hours
 *
 * Runs after daily price scrape (alongside generate-seo-pages.js)
 *
 * Usage:
 *   DATABASE_URL="..." node scripts/generate-heating-cost-pages.js
 *   DATABASE_URL="..." node scripts/generate-heating-cost-pages.js --dry-run
 */

const { Sequelize } = require('sequelize');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const {
  init, STATES, BASE_URL, MIN_SUPPLIERS_FOR_PAGE, MIN_PRICES_FOR_PAGE,
  getCountyOilStats, getStateOilStats, getRecentPriceCount, computeFuelCosts,
  getCountyEligibility,
  getCssPath, getNavHTML, getFooterHTML, getFuelComparisonTable, getVerdictHTML,
  slugify, formatCurrency, formatPrice, formatPerUnit,
} = require('./lib/county-data');

// Configuration
const WEBSITE_DIR = path.join(__dirname, '../website');
const OUTPUT_DIR = path.join(WEBSITE_DIR, 'heating-cost');

// Initialize shared module
init(WEBSITE_DIR);

// Parse CLI args
const args = process.argv.slice(2);
const cliDryRun = args.includes('--dry-run');

// ── County Page Generator ────────────────────────────────────────

function generateCountyPageHTML(stateCode, stateInfo, county, countyStats, costs, eligibility) {
  const depth = 2; // /heating-cost/{state}/{county}.html
  const stateAbbrev = stateInfo.abbrev;
  const stateName = stateInfo.name;
  const oilPrice = countyStats.median_price;
  const today = new Date().toISOString().split('T')[0];
  const countySlug = slugify(county);

  const title = `Heating Cost in ${county} County, ${stateName} (2026) | HomeHeat`;
  const description = `Estimated heating costs for ${county} County, ${stateName}. Compare oil, gas, heat pump, and electric costs per BTU and annual estimates using local ${today.slice(0, 4)} prices.`;
  const canonicalURL = `${BASE_URL}/heating-cost/${stateAbbrev}/${countySlug}`;

  const annualOilCost = costs.fuels['heating-oil'] ? formatCurrency(costs.fuels['heating-oil'].annualCost) : 'N/A';
  const monthlyOilCost = costs.fuels['heating-oil'] ? formatCurrency(costs.fuels['heating-oil'].monthlyCost) : 'N/A';

  // FAQ questions
  const faq1Q = `What is the average heating cost in ${county} County, ${stateName}?`;
  const faq1A = costs.fuels['heating-oil']
    ? `Based on current oil prices of ${formatPrice(oilPrice)}/gallon and ${costs.hdd.toLocaleString()} heating degree days, the estimated annual heating cost for a typical 2,000 sq ft home in ${county} County is ${annualOilCost} using oil heat (${monthlyOilCost}/month during heating season).`
    : `Heating costs in ${county} County vary by fuel type. Check our calculator for current estimates.`;

  const faq2Q = `What is the cheapest way to heat a home in ${county} County?`;
  const cheapestLabel = costs.cheapest ? ({
    'heating-oil': 'heating oil',
    'natural-gas': 'natural gas',
    'heat-pump': 'a heat pump',
    'electric-baseboard': 'electric baseboard',
  })[costs.cheapest] || costs.cheapest : 'varies';
  const cheapestAnnual = costs.cheapest && costs.fuels[costs.cheapest] ? formatCurrency(costs.fuels[costs.cheapest].annualCost) : '';
  const faq2A = costs.cheapest
    ? `At current local prices, ${cheapestLabel} is the cheapest heating option in ${county} County at approximately ${cheapestAnnual}/year for a 2,000 sq ft home. Use our Heating Cost Calculator for your exact ZIP code.`
    : `The cheapest option depends on local fuel prices. Use our Heating Cost Calculator for current estimates.`;

  // Schema.org
  const schemaArticle = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: `Heating Cost Estimates for ${county} County, ${stateName}`,
    description,
    author: { '@type': 'Organization', name: 'HomeHeat' },
    publisher: { '@type': 'Organization', name: 'HomeHeat', url: BASE_URL },
    datePublished: today,
    dateModified: today,
    mainEntityOfPage: canonicalURL,
  });

  const schemaFAQ = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: faq1Q, acceptedAnswer: { '@type': 'Answer', text: faq1A } },
      { '@type': 'Question', name: faq2Q, acceptedAnswer: { '@type': 'Answer', text: faq2A } },
    ],
  });

  // Payback section
  let paybackHTML = '';
  if (costs.payback) {
    paybackHTML = `
        <h2>Heat Pump Payback in ${county} County</h2>
        <p>At local electricity rates (${formatPrice(costs.electricRate)}/kWh) and oil prices (${formatPrice(oilPrice)}/gal),
        switching from oil to a heat pump would pay for itself in approximately <strong>${costs.payback.years} years</strong>
        (based on average installation cost of $11,000). Federal tax credits and state rebates can reduce this significantly.</p>`;
  }

  // Trend note
  let trendNote = '';
  if (countyStats.percent_change_6w !== null && countyStats.percent_change_6w !== undefined) {
    const pct = parseFloat(countyStats.percent_change_6w);
    if (Math.abs(pct) >= 2) {
      const dir = pct > 0 ? 'up' : 'down';
      const arrow = pct > 0 ? '↑' : '↓';
      trendNote = `<p style="margin-top: 1rem;"><strong>${arrow} Oil prices in ${county} County are ${dir} ${Math.abs(pct).toFixed(1)}%</strong> over the past 6 weeks. <a href="/prices/${stateAbbrev}/${countySlug}-county">View current oil prices</a>.</p>`;
    }
  }

  // Cross-links (conditional on eligibility)
  let crossLinks = '';
  if (eligibility.avgBill) {
    crossLinks += `\n            <li><a href="/average-heating-bill/${stateAbbrev}/${countySlug}">Average Heating Bill in ${county} County</a></li>`;
  }
  if (eligibility.priceTrend) {
    crossLinks += `\n            <li><a href="/price-trend/${stateAbbrev}/${countySlug}">Oil Price Trends in ${county} County</a></li>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-HCNTVGNVJ9"></script>
<script src="${'../'.repeat(depth)}js/analytics.js"></script>

    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="apple-itunes-app" content="app-id=6747320571">
    <title>${title}</title>
    <meta name="description" content="${description}">

    <meta property="og:title" content="Heating Cost in ${county} County, ${stateName}">
    <meta property="og:description" content="${description}">
    <meta property="og:url" content="${canonicalURL}">
    <meta property="og:type" content="article">
    <meta name="twitter:card" content="summary">

    <link rel="canonical" href="${canonicalURL}">
    <link rel="stylesheet" href="${getCssPath(depth)}">
    <link rel="icon" type="image/png" sizes="32x32" href="${'../'.repeat(depth)}favicon-32.png">
    <link rel="icon" type="image/png" sizes="180x180" href="${'../'.repeat(depth)}favicon.png">
    <link rel="apple-touch-icon" sizes="180x180" href="${'../'.repeat(depth)}favicon.png">

    <script type="application/ld+json">${schemaArticle}</script>
    <script type="application/ld+json">${schemaFAQ}</script>
</head>
<body>
    ${getNavHTML(depth)}

    <section class="content-section">
        <p style="color: var(--text-light); font-size: 0.9rem; margin-bottom: 0.5rem;">
            <a href="/heating-cost/${stateAbbrev}/">Heating Cost in ${stateName}</a> → ${county} County
        </p>

        <h1>Estimated Heating Costs in ${county} County, ${stateName}</h1>

        <p>How much does it cost to heat a home in ${county} County? Here's a breakdown by fuel type, using <strong>real local prices</strong> and ${costs.hdd.toLocaleString()} heating degree days for ${county} County.</p>

        <p>Estimates are for a typical 2,000 sq ft home. <a href="/tools/heating-cost-calculator">Use the calculator</a> for your exact ZIP code.</p>
        ${trendNote}

        <div class="calc-inline-zip">
            <span>Get your exact estimate:</span>
            <input type="text" maxlength="5" inputmode="numeric" pattern="[0-9]*" placeholder="ZIP code" class="calc-inline-zip-input" data-calc-zip>
            <a href="/tools/heating-cost-calculator" class="calc-inline-zip-btn" data-calc-go>Compare Costs</a>
        </div>

        <h2>Heating Cost Comparison — ${county} County</h2>

        ${getFuelComparisonTable(costs)}

        ${getVerdictHTML(costs)}

        <p style="margin-top: 1rem; font-size: 0.9rem; color: var(--text-light);">
            Oil price: ${formatPrice(oilPrice)}/gal (local median). Electricity: ${formatPrice(costs.electricRate)}/kWh (${stateName} avg). Gas: ${costs.gasRate ? formatPrice(costs.gasRate) + '/therm' : 'N/A'} (${stateName} avg). HDD: ${costs.hdd.toLocaleString()}. Estimates for a 2,000 sq ft home.
            <br>Prices updated: ${today}. <em>Prices may differ from <a href="/tools/heating-cost-calculator">real-time calculator</a>.</em>
        </p>

        ${paybackHTML}

        <h2>Estimated Monthly Heating Bill — ${county} County</h2>

        <p>During the heating season (October–March), a typical 2,000 sq ft home in ${county} County costs approximately:</p>

        <ul>
            ${costs.fuels['heating-oil'] ? `<li><strong>Oil heat:</strong> ${monthlyOilCost}/month</li>` : ''}
            ${costs.fuels['natural-gas'] ? `<li><strong>Natural gas:</strong> ${formatCurrency(costs.fuels['natural-gas'].monthlyCost)}/month</li>` : ''}
            ${costs.fuels['heat-pump'] ? `<li><strong>Heat pump:</strong> ${formatCurrency(costs.fuels['heat-pump'].monthlyCost)}/month</li>` : ''}
            ${costs.fuels['electric-baseboard'] ? `<li><strong>Electric baseboard:</strong> ${formatCurrency(costs.fuels['electric-baseboard'].monthlyCost)}/month</li>` : ''}
        </ul>

        <h2>Staying With Oil? Get the Best Price</h2>

        <p>If you're staying with oil heat, the biggest savings come from comparing local suppliers. The spread between cheapest and most expensive in ${county} County can be $0.50–$1.00/gallon — that's $250–$500/year on the same fuel.</p>

        <p><strong><a href="/prices/${stateAbbrev}/${countySlug}-county">Compare ${county} County Oil Prices →</a></strong></p>

        <hr style="margin: 2.5rem 0; border: none; border-top: 1px solid var(--border-color);">

        <h3>Related</h3>
        <ul>
            <li><a href="/heating-cost/${stateAbbrev}/">Heating costs across ${stateName}</a></li>
            <li><a href="/tools/heating-cost-calculator">Heating Cost Calculator — Your ZIP, Your Prices</a></li>
            <li><a href="/learn/cheapest-way-to-heat-your-home">What's the Cheapest Way to Heat Your Home?</a></li>
            <li><a href="/learn/heating-oil-vs-heat-pump">Heating Oil vs Heat Pump: Cost Comparison</a></li>
            <li><a href="/prices/${stateAbbrev}/${countySlug}-county">${county} County Oil Prices</a></li>${crossLinks}
        </ul>

        <p style="margin-top: 2rem;">
            <a href="/heating-cost/${stateAbbrev}/">← Heating costs in ${stateName}</a>
        </p>
    </section>

    ${getFooterHTML(depth)}
</body>
</html>`;
}

// ── State Page Generator ─────────────────────────────────────────

function generateStatePageHTML(stateCode, stateInfo, stateStats, countyData, costs) {
  const depth = 2; // /heating-cost/{state}/index.html
  const stateAbbrev = stateInfo.abbrev;
  const stateName = stateInfo.name;
  const today = new Date().toISOString().split('T')[0];

  const stateOilPrice = stateStats.state_median ? parseFloat(stateStats.state_median) : null;
  const title = `Heating Costs in ${stateName} (2026 Estimates) | HomeHeat`;
  const description = `Compare heating costs across ${stateName} counties. See estimated annual costs for oil, gas, heat pump, and electric heat using local ${today.slice(0, 4)} prices.`;
  const canonicalURL = `${BASE_URL}/heating-cost/${stateAbbrev}/`;

  // Schema.org
  const schemaArticle = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: `Heating Cost Estimates for ${stateName}`,
    description,
    author: { '@type': 'Organization', name: 'HomeHeat' },
    publisher: { '@type': 'Organization', name: 'HomeHeat', url: BASE_URL },
    datePublished: today,
    dateModified: today,
    mainEntityOfPage: canonicalURL,
  });

  const faq1Q = `How much does it cost to heat a home in ${stateName}?`;
  const faq1A = stateOilPrice
    ? `At current oil prices (${formatPrice(stateOilPrice)}/gal statewide median), a typical 2,000 sq ft home in ${stateName} costs approximately ${costs.fuels['heating-oil'] ? formatCurrency(costs.fuels['heating-oil'].annualCost) : 'varies'}/year with oil heat. Natural gas and heat pumps cost less per BTU in most areas.`
    : `Heating costs in ${stateName} vary by county and fuel type. Use our calculator for local estimates.`;

  const schemaFAQ = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: faq1Q, acceptedAnswer: { '@type': 'Answer', text: faq1A } },
    ],
  });

  // County comparison table
  let countyRows = '';
  const sortedCounties = [...countyData].sort((a, b) => a.costs.fuels['heating-oil']?.annualCost - b.costs.fuels['heating-oil']?.annualCost);
  for (const cd of sortedCounties) {
    const oilAnnual = cd.costs.fuels['heating-oil'] ? formatCurrency(cd.costs.fuels['heating-oil'].annualCost) : 'N/A';
    const gasAnnual = cd.costs.fuels['natural-gas'] ? formatCurrency(cd.costs.fuels['natural-gas'].annualCost) : 'N/A';
    const hpAnnual = cd.costs.fuels['heat-pump'] ? formatCurrency(cd.costs.fuels['heat-pump'].annualCost) : 'N/A';
    const oilPrice = cd.stats.median_price ? formatPrice(cd.stats.median_price) : 'N/A';
    const countySlug = slugify(cd.county);

    countyRows += `
                <tr>
                    <td><a href="/heating-cost/${stateAbbrev}/${countySlug}">${cd.county}</a></td>
                    <td>${oilPrice}</td>
                    <td><strong>${oilAnnual}</strong></td>
                    <td>${gasAnnual}</td>
                    <td>${hpAnnual}</td>
                    <td>${cd.costs.hdd.toLocaleString()}</td>
                </tr>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-HCNTVGNVJ9"></script>
<script src="${'../'.repeat(depth)}js/analytics.js"></script>

    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="apple-itunes-app" content="app-id=6747320571">
    <title>${title}</title>
    <meta name="description" content="${description}">

    <meta property="og:title" content="Heating Costs in ${stateName} — All Fuels Compared">
    <meta property="og:description" content="${description}">
    <meta property="og:url" content="${canonicalURL}">
    <meta property="og:type" content="article">
    <meta name="twitter:card" content="summary">

    <link rel="canonical" href="${canonicalURL}">
    <link rel="stylesheet" href="${getCssPath(depth)}">
    <link rel="icon" type="image/png" sizes="32x32" href="${'../'.repeat(depth)}favicon-32.png">
    <link rel="icon" type="image/png" sizes="180x180" href="${'../'.repeat(depth)}favicon.png">
    <link rel="apple-touch-icon" sizes="180x180" href="${'../'.repeat(depth)}favicon.png">

    <script type="application/ld+json">${schemaArticle}</script>
    <script type="application/ld+json">${schemaFAQ}</script>
</head>
<body>
    ${getNavHTML(depth)}

    <section class="content-section">
        <p style="color: var(--text-light); font-size: 0.9rem; margin-bottom: 0.5rem;">
            <a href="/learn/">Learn</a> → Heating Costs in ${stateName}
        </p>

        <h1>Estimated Heating Costs in ${stateName}</h1>

        <p>How much does it cost to heat a home in ${stateName}? It depends on your county, your fuel type, and your home. Here are <strong>local estimates by county</strong> using real fuel prices and heating degree day data.</p>

        <p>All estimates are for a typical 2,000 sq ft home. For your exact costs, <a href="/tools/heating-cost-calculator">enter your ZIP code</a>.</p>

        <div class="calc-inline-zip">
            <span>Get your exact estimate:</span>
            <input type="text" maxlength="5" inputmode="numeric" pattern="[0-9]*" placeholder="ZIP code" class="calc-inline-zip-input" data-calc-zip>
            <a href="/tools/heating-cost-calculator" class="calc-inline-zip-btn" data-calc-go>Compare Costs</a>
        </div>

        ${stateOilPrice ? `
        <h2>Statewide Fuel Cost Comparison</h2>

        <p>Using the ${stateName} statewide median oil price of <strong>${formatPrice(stateOilPrice)}/gallon</strong> and state-average energy rates:</p>

        ${getFuelComparisonTable(costs)}

        ${getVerdictHTML(costs)}

        <p style="margin-top: 1rem; font-size: 0.9rem; color: var(--text-light);">
            Statewide medians. Individual counties may differ. Updated: ${today}.
        </p>
        ` : ''}

        <h2>Heating Costs by County — ${stateName}</h2>

        <p>Annual estimated heating cost for a 2,000 sq ft home, sorted by oil heat cost:</p>

        <div style="overflow-x: auto;">
            <table class="calc-table">
                <thead>
                    <tr>
                        <th>County</th>
                        <th>Oil $/gal</th>
                        <th>Oil/Year</th>
                        <th>Gas/Year</th>
                        <th>Heat Pump/Year</th>
                        <th>HDD</th>
                    </tr>
                </thead>
                <tbody>${countyRows}
                </tbody>
            </table>
        </div>

        <p style="margin-top: 1rem; font-size: 0.9rem; color: var(--text-light);">
            Oil prices are local medians from current supplier data. Gas and electricity are ${stateName} state averages (EIA). HDD from NOAA 30-year normals.
            <br>Updated: ${today}. Click a county for detailed breakdown.
        </p>

        <h2>Understanding These Estimates</h2>

        <p>These estimates use <strong>Heating Degree Days (HDD)</strong> — a standard measure of how cold your area gets. More HDD = more heating fuel needed. ${stateName} ranges from ${sortedCounties.length > 0 ? `${sortedCounties[0].costs.hdd.toLocaleString()} HDD in ${sortedCounties[0].county} County to ${sortedCounties[sortedCounties.length - 1].costs.hdd.toLocaleString()} HDD in ${sortedCounties[sortedCounties.length - 1].county} County` : 'varies by county'}.</p>

        <p>Cost per million BTU (MMBTU) is the fairest cross-fuel comparison. It normalizes for the different energy content and efficiency of each fuel. <a href="/learn/cheapest-way-to-heat-your-home">Learn more about comparing heating fuels</a>.</p>

        <h2>Save on Heating in ${stateName}</h2>

        <p><strong>Staying with oil?</strong> The biggest immediate savings come from comparing local suppliers. The spread between cheapest and most expensive supplier is often $0.50–$1.00/gallon. <a href="/prices/${stateAbbrev}/">Compare ${stateName} oil prices</a>.</p>

        <p><strong>Considering switching fuels?</strong> Our <a href="/tools/heating-cost-calculator">Heating Cost Calculator</a> shows exact payback periods for your ZIP code, and our <a href="/learn/">fuel comparison guides</a> explain the trade-offs.</p>

        <hr style="margin: 2.5rem 0; border: none; border-top: 1px solid var(--border-color);">

        <h3>Related</h3>
        <ul>
            <li><a href="/tools/heating-cost-calculator">Heating Cost Calculator</a></li>
            <li><a href="/learn/cheapest-way-to-heat-your-home">What's the Cheapest Way to Heat Your Home?</a></li>
            <li><a href="/prices/${stateAbbrev}/">${stateName} Oil Prices</a></li>
            <li><a href="/learn/heating-oil-vs-natural-gas">Heating Oil vs Natural Gas</a></li>
            <li><a href="/learn/heating-oil-vs-heat-pump">Heating Oil vs Heat Pump</a></li>
            <li><a href="/average-heating-bill/${stateAbbrev}/">Average Heating Bills in ${stateName}</a></li>
            <li><a href="/price-trend/${stateAbbrev}/">Oil Price Trends in ${stateName}</a></li>
        </ul>
    </section>

    ${getFooterHTML(depth)}
</body>
</html>`;
}

// ── Sitemap URLs ─────────────────────────────────────────────────

function generateSitemapURLs(generatedPages) {
  const today = new Date().toISOString().split('T')[0];
  let urls = '';

  for (const state of generatedPages.states) {
    urls += `
  <url>
    <loc>${BASE_URL}/heating-cost/${state.abbrev}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
  </url>`;
  }

  for (const county of generatedPages.counties) {
    urls += `
  <url>
    <loc>${BASE_URL}/heating-cost/${county.stateAbbrev}/${county.slug}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.6</priority>
  </url>`;
  }

  return urls;
}

// ── Main ─────────────────────────────────────────────────────────

async function generateHeatingCostPages(options = {}) {
  const {
    sequelize: externalSequelize = null,
    dryRun = cliDryRun,
  } = options;

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  HomeHeat Heating Cost Page Generator');
  console.log('  ' + new Date().toLocaleString());
  console.log('═══════════════════════════════════════════════════════════');

  if (dryRun) {
    console.log('DRY RUN — no files will be written');
  }

  // Database connection
  const sequelize = externalSequelize || new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: {
      ssl: process.env.DATABASE_URL?.includes('railway') ? {
        require: true,
        rejectUnauthorized: false,
      } : false,
    },
  });

  const shouldCloseConnection = !externalSequelize;

  try {
    if (!externalSequelize) {
      await sequelize.authenticate();
      console.log('Database connected');
    }

    const generatedPages = { states: [], counties: [] };
    let totalStatePages = 0;
    let totalCountyPages = 0;

    for (const [stateCode, stateInfo] of Object.entries(STATES)) {
      console.log(`\nProcessing ${stateInfo.name}...`);

      // Get county-level oil stats
      const countyStats = await getCountyOilStats(sequelize, stateCode);
      if (countyStats.length === 0) {
        console.log(`  Skipping ${stateCode} — no county price data`);
        continue;
      }

      // Get state-level aggregate
      const stateStats = await getStateOilStats(sequelize, stateCode);

      // Create state directory
      const stateDir = path.join(OUTPUT_DIR, stateInfo.abbrev);
      if (!dryRun) {
        await fs.mkdir(stateDir, { recursive: true });
        // Clean stale HTML files
        try {
          const existingFiles = await fs.readdir(stateDir);
          for (const file of existingFiles) {
            if (file.endsWith('.html')) {
              await fs.unlink(path.join(stateDir, file));
            }
          }
        } catch (e) {
          // Directory may not exist yet — that's fine
        }
      }

      // Process each county
      const validCounties = [];
      for (const cs of countyStats) {
        const county = cs.county_name;
        const zipPrefixes = cs.zip_prefixes || [];

        // Threshold check via shared eligibility
        const recentPrices = await getRecentPriceCount(sequelize, zipPrefixes);
        const eligibility = getCountyEligibility(cs, recentPrices);

        if (!eligibility.heatingCost) {
          continue;
        }

        // Compute multi-fuel costs
        const oilPrice = parseFloat(cs.median_price);
        const costs = computeFuelCosts(oilPrice, stateCode, county);

        // Generate county page
        const html = generateCountyPageHTML(stateCode, stateInfo, county, cs, costs, eligibility);
        const countySlug = slugify(county);
        const filePath = path.join(stateDir, `${countySlug}.html`);

        if (!dryRun) {
          await fs.writeFile(filePath, html, 'utf-8');
        }

        console.log(`  County: ${county} — oil $${oilPrice.toFixed(2)}, HDD ${costs.hdd}, cheapest: ${costs.cheapest}`);
        totalCountyPages++;

        validCounties.push({ county, stats: cs, costs });
        generatedPages.counties.push({
          stateAbbrev: stateInfo.abbrev,
          county,
          slug: countySlug,
        });
      }

      if (validCounties.length === 0) {
        console.log(`  No counties passed thresholds for ${stateCode}`);
        continue;
      }

      // Generate state page
      const stateOilPrice = stateStats.state_median ? parseFloat(stateStats.state_median) : null;
      const stateCosts = stateOilPrice ? computeFuelCosts(stateOilPrice, stateCode, null) : { fuels: {}, cheapest: null, payback: null, hdd: 0, electricRate: 0, gasRate: 0 };

      const stateHtml = generateStatePageHTML(stateCode, stateInfo, stateStats, validCounties, stateCosts);
      const statePath = path.join(stateDir, 'index.html');
      if (!dryRun) {
        await fs.writeFile(statePath, stateHtml, 'utf-8');
      }

      console.log(`  State page: ${stateInfo.abbrev}/index.html (${validCounties.length} counties)`);
      totalStatePages++;
      generatedPages.states.push({ abbrev: stateInfo.abbrev, name: stateInfo.name });
    }

    // Write sitemap fragment (to be included by main sitemap generator)
    const sitemapURLs = generateSitemapURLs(generatedPages);
    const sitemapPath = path.join(OUTPUT_DIR, '_sitemap-fragment.xml');
    if (!dryRun) {
      await fs.mkdir(OUTPUT_DIR, { recursive: true });
      await fs.writeFile(sitemapPath, sitemapURLs, 'utf-8');
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log(`  Generated: ${totalStatePages} state pages, ${totalCountyPages} county pages`);
    console.log(`  Sitemap fragment: heating-cost/_sitemap-fragment.xml`);
    console.log('═══════════════════════════════════════════════════════════');

    return { success: true, generatedPages, totalStatePages, totalCountyPages };

  } finally {
    if (shouldCloseConnection) {
      await sequelize.close();
    }
  }
}

// CLI entry point
if (require.main === module) {
  generateHeatingCostPages().catch(err => {
    console.error('FATAL:', err.message);
    process.exit(1);
  });
}

module.exports = { generateHeatingCostPages };
