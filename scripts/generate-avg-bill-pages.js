#!/usr/bin/env node
/**
 * Average Heating Bill Page Generator (Phase C2)
 *
 * Creates auto-generated pages answering "what do people typically pay?"
 * at state and county level using real oil price data + energy rates.
 *
 * URLs:
 *   /average-heating-bill/{state}/index.html       — e.g., /average-heating-bill/ny/
 *   /average-heating-bill/{state}/{county}.html     — e.g., /average-heating-bill/ny/westchester.html
 *
 * Thresholds (same as Phase C):
 *   - ≥3 suppliers in the area
 *   - ≥2 active prices within 48 hours
 *
 * Usage:
 *   DATABASE_URL="..." node scripts/generate-avg-bill-pages.js
 *   DATABASE_URL="..." node scripts/generate-avg-bill-pages.js --dry-run
 */

const { Sequelize } = require('sequelize');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const {
  init, STATES, BASE_URL,
  getCountyOilStats, getStateOilStats, getRecentPriceCount, computeFuelCosts,
  getCountyEligibility,
  getCssPath, getNavHTML, getFooterHTML, getFuelComparisonTable, getVerdictHTML,
  slugify, formatCurrency, formatPrice,
} = require('./lib/county-data');

// Configuration
const WEBSITE_DIR = path.join(__dirname, '../website');
const OUTPUT_DIR = path.join(WEBSITE_DIR, 'average-heating-bill');

// Initialize shared module
init(WEBSITE_DIR);

// Parse CLI args
const args = process.argv.slice(2);
const cliDryRun = args.includes('--dry-run');

// ── County Page Generator ────────────────────────────────────────

function generateCountyPageHTML(stateCode, stateInfo, county, countyStats, costs, eligibility) {
  const depth = 2;
  const stateAbbrev = stateInfo.abbrev;
  const stateName = stateInfo.name;
  const oilPrice = parseFloat(countyStats.median_price);
  const today = new Date().toISOString().split('T')[0];
  const currentYear = today.slice(0, 4);
  const countySlug = slugify(county);

  const monthlyCost = costs.fuels['heating-oil'] ? formatCurrency(costs.fuels['heating-oil'].monthlyCost) : 'N/A';
  const annualCost = costs.fuels['heating-oil'] ? formatCurrency(costs.fuels['heating-oil'].annualCost) : 'N/A';
  const costPerSqFt = costs.fuels['heating-oil']
    ? '$' + (costs.fuels['heating-oil'].annualCost / 2000).toFixed(2)
    : 'N/A';

  const title = `Average Heating Bill in ${county} County, ${stateName} (${currentYear})`;
  const description = `The average heating bill in ${county} County, ${stateName} is ${monthlyCost}/month for oil. Compare oil, gas, and heat pump costs for a 2,000 sq ft home.`;
  const canonicalURL = `${BASE_URL}/average-heating-bill/${stateAbbrev}/${countySlug}`;

  // Schema.org BreadcrumbList
  const schemaBreadcrumb = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: BASE_URL },
      { '@type': 'ListItem', position: 2, name: 'Average Heating Bill', item: `${BASE_URL}/average-heating-bill/` },
      { '@type': 'ListItem', position: 3, name: stateName, item: `${BASE_URL}/average-heating-bill/${stateAbbrev}/` },
      { '@type': 'ListItem', position: 4, name: `${county} County`, item: canonicalURL },
    ],
  });

  // FAQPage schema (3 questions unique to C2)
  const faq1Q = `What is the average heating bill in ${county} County, ${stateName}?`;
  const faq1A = costs.fuels['heating-oil']
    ? `The average monthly heating bill for oil heat in ${county} County is approximately ${monthlyCost} for a 2,000 sq ft home, or ${annualCost}/year. This is based on a median oil price of ${formatPrice(oilPrice)}/gallon and ${costs.hdd.toLocaleString()} heating degree days.`
    : `Heating bills in ${county} County vary by fuel type. Check our calculator for current estimates.`;

  const faq2Q = `How much does the average homeowner spend on heating in ${county} County?`;
  const faq2A = costs.fuels['heating-oil']
    ? `The average homeowner in ${county} County using oil heat spends approximately ${annualCost}/year or ${monthlyCost}/month during the heating season. ${costs.fuels['heat-pump'] ? `Switching to a heat pump could reduce this to approximately ${formatCurrency(costs.fuels['heat-pump'].annualCost)}/year.` : ''}`
    : `Spending depends on fuel type, home size, and insulation. Use our calculator for personalized estimates.`;

  const faq3Q = `What is the heating cost per square foot in ${county} County?`;
  const faq3A = costs.fuels['heating-oil']
    ? `The estimated heating cost per square foot in ${county} County is ${costPerSqFt}/year for oil heat, based on a 2,000 sq ft home. This translates to approximately ${monthlyCost}/month during the October–March heating season.`
    : `Heating cost per square foot varies by fuel type and home efficiency. Use our calculator for local estimates.`;

  const schemaFAQ = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: faq1Q, acceptedAnswer: { '@type': 'Answer', text: faq1A } },
      { '@type': 'Question', name: faq2Q, acceptedAnswer: { '@type': 'Answer', text: faq2A } },
      { '@type': 'Question', name: faq3Q, acceptedAnswer: { '@type': 'Answer', text: faq3A } },
    ],
  });

  // Article schema
  const schemaArticle = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description,
    author: { '@type': 'Organization', name: 'HomeHeat' },
    publisher: { '@type': 'Organization', name: 'HomeHeat', url: BASE_URL },
    datePublished: today,
    dateModified: today,
    mainEntityOfPage: canonicalURL,
  });

  // Trend note
  let trendNote = '';
  if (countyStats.percent_change_6w !== null && countyStats.percent_change_6w !== undefined) {
    const pct = parseFloat(countyStats.percent_change_6w);
    if (Math.abs(pct) >= 2) {
      const dir = pct > 0 ? 'up' : 'down';
      const arrow = pct > 0 ? '↑' : '↓';
      trendNote = `<p style="margin-top: 1rem;"><strong>${arrow} Oil prices are ${dir} ${Math.abs(pct).toFixed(1)}%</strong> over the past 6 weeks, which affects current heating bills. <a href="/price-trend/${stateAbbrev}/${countySlug}">View price trends</a>.</p>`;
    }
  }

  // Monthly breakdown bullets
  let monthlyBreakdown = '';
  const fuelBullets = [];
  if (costs.fuels['heating-oil']) fuelBullets.push(`<li><strong>Oil:</strong> ${formatCurrency(costs.fuels['heating-oil'].monthlyCost)}/mo</li>`);
  if (costs.fuels['natural-gas']) fuelBullets.push(`<li><strong>Natural Gas:</strong> ${formatCurrency(costs.fuels['natural-gas'].monthlyCost)}/mo</li>`);
  if (costs.fuels['heat-pump']) fuelBullets.push(`<li><strong>Heat Pump:</strong> ${formatCurrency(costs.fuels['heat-pump'].monthlyCost)}/mo</li>`);
  if (costs.fuels['electric-baseboard']) fuelBullets.push(`<li><strong>Electric Baseboard:</strong> ${formatCurrency(costs.fuels['electric-baseboard'].monthlyCost)}/mo</li>`);
  if (fuelBullets.length > 0) {
    monthlyBreakdown = `
        <h2>Monthly Heating Bill Breakdown</h2>
        <p>Average monthly heating costs during the October–March season for a 2,000 sq ft home in ${county} County:</p>
        <ul>
            ${fuelBullets.join('\n            ')}
        </ul>`;
  }

  // Last updated
  const lastUpdated = countyStats.last_scrape_at
    ? new Date(countyStats.last_scrape_at).toISOString().split('T')[0]
    : today;

  // Cross-links (conditional on eligibility)
  let crossLinks = '';
  crossLinks += `\n            <li><a href="/heating-cost/${stateAbbrev}/${countySlug}">Heating Cost Comparison in ${county} County</a></li>`;
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

    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:url" content="${canonicalURL}">
    <meta property="og:type" content="article">
    <meta name="twitter:card" content="summary">

    <link rel="canonical" href="${canonicalURL}">
    <link rel="stylesheet" href="${getCssPath(depth)}">
    <link rel="icon" type="image/png" sizes="32x32" href="${'../'.repeat(depth)}favicon-32.png">
    <link rel="icon" type="image/png" sizes="180x180" href="${'../'.repeat(depth)}favicon.png">
    <link rel="apple-touch-icon" sizes="180x180" href="${'../'.repeat(depth)}favicon.png">

    <script type="application/ld+json">${schemaBreadcrumb}</script>
    <script type="application/ld+json">${schemaArticle}</script>
    <script type="application/ld+json">${schemaFAQ}</script>
</head>
<body>
    ${getNavHTML(depth)}

    <section class="content-section">
        <p style="color: var(--text-light); font-size: 0.9rem; margin-bottom: 0.5rem;">
            <a href="/average-heating-bill/${stateAbbrev}/">Average Heating Bill in ${stateName}</a> → ${county} County
        </p>

        <h1>Average Heating Bill in ${county} County, ${stateName}</h1>

        <div style="text-align: center; margin: 1.5rem 0;">
            <p style="font-size: 2.5rem; font-weight: 700; color: var(--primary-blue); margin: 0;">${monthlyCost}<span style="font-size: 1rem; font-weight: 400; color: var(--text-light);">/mo</span></p>
            <p style="font-size: 1.2rem; color: var(--text-dark); margin: 0.25rem 0;">${annualCost}/year</p>
            <p style="font-size: 0.95rem; color: var(--text-light); margin: 0.25rem 0;">${costPerSqFt}/sq ft (oil heat, 2,000 sq ft home)</p>
        </div>
        ${trendNote}

        <h2>Fuel Cost Comparison — ${county} County</h2>

        ${getFuelComparisonTable(costs)}

        ${getVerdictHTML(costs)}

        ${monthlyBreakdown}

        <h2>How We Calculate These Estimates</h2>
        <p style="font-size: 0.9rem; color: var(--text-light);">
            Based on a 2,000 sq ft home with 85% oil furnace efficiency, COP 3.0 heat pump, NOAA 30-year normal heating degree days (${costs.hdd.toLocaleString()} HDD for ${county} County), and current EIA state-average energy rates. Oil prices reflect local median from ${parseInt(countyStats.supplier_count, 10)} tracked suppliers.
        </p>

        <div class="calc-inline-zip">
            <span>Get your exact estimate:</span>
            <input type="text" maxlength="5" inputmode="numeric" pattern="[0-9]*" placeholder="ZIP code" class="calc-inline-zip-input" data-calc-zip>
            <a href="/tools/heating-cost-calculator" class="calc-inline-zip-btn" data-calc-go>Compare Costs</a>
        </div>

        <p style="font-size: 0.85rem; color: var(--text-light); margin-top: 1rem;">Data updated ${lastUpdated}.</p>

        <!-- App CTA -->
        <section class="zip-cta" style="margin: 2rem 0;">
            <h3>Get Personalized Heating Cost Alerts</h3>
            <p>Track price drops and predict your next delivery with the HomeHeat app.</p>
            <a href="https://apps.apple.com/us/app/homeheat/id6747320571?utm_source=web_avgbill&utm_medium=website&utm_campaign=avgbill_${stateAbbrev}_${countySlug}" class="cta-button" style="color:white">Get HomeHeat Free →</a>
            <p style="font-size:0.8rem;color:var(--text-gray);margin:0.75rem 0 0">Free app for iPhone. No hardware. No ads.</p>
        </section>

        <h2>Compare Suppliers in ${county} County</h2>
        <p>If you're staying with oil heat, compare local suppliers to find the best price. The spread in ${county} County can be $0.50–$1.00/gallon.</p>
        <p><strong><a href="/prices/${stateAbbrev}/${countySlug}-county">Compare ${county} County Oil Prices →</a></strong></p>

        <hr style="margin: 2.5rem 0; border: none; border-top: 1px solid var(--border-color);">

        <h3>Related</h3>
        <ul>${crossLinks}
            <li><a href="/tools/heating-cost-calculator">Heating Cost Calculator — Your ZIP, Your Prices</a></li>
            <li><a href="/learn/cheapest-way-to-heat-your-home">What's the Cheapest Way to Heat Your Home?</a></li>
            <li><a href="/learn/heating-oil-vs-heat-pump">Heating Oil vs Heat Pump: Cost Comparison</a></li>
            <li><a href="/prices/${stateAbbrev}/${countySlug}-county">${county} County Oil Prices</a></li>
        </ul>

        <p style="margin-top: 2rem;">
            <a href="/average-heating-bill/${stateAbbrev}/">← Average heating bills in ${stateName}</a>
        </p>
    </section>

    ${getFooterHTML(depth)}
</body>
</html>`;
}

// ── State Page Generator ─────────────────────────────────────────

function generateStatePageHTML(stateCode, stateInfo, stateStats, countyData, costs) {
  const depth = 2;
  const stateAbbrev = stateInfo.abbrev;
  const stateName = stateInfo.name;
  const today = new Date().toISOString().split('T')[0];
  const currentYear = today.slice(0, 4);

  const stateOilPrice = stateStats.state_median ? parseFloat(stateStats.state_median) : null;
  const stateMonthly = costs.fuels['heating-oil'] ? formatCurrency(costs.fuels['heating-oil'].monthlyCost) : 'varies';

  const title = `Average Heating Bill in ${stateName} (${currentYear})`;
  const description = `Average monthly heating bills across ${stateName} counties. Compare oil, gas, and heat pump costs by county for a 2,000 sq ft home.`;
  const canonicalURL = `${BASE_URL}/average-heating-bill/${stateAbbrev}/`;

  // Schema.org BreadcrumbList
  const schemaBreadcrumb = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: BASE_URL },
      { '@type': 'ListItem', position: 2, name: 'Average Heating Bill', item: `${BASE_URL}/average-heating-bill/` },
      { '@type': 'ListItem', position: 3, name: stateName, item: canonicalURL },
    ],
  });

  const schemaArticle = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description,
    author: { '@type': 'Organization', name: 'HomeHeat' },
    publisher: { '@type': 'Organization', name: 'HomeHeat', url: BASE_URL },
    datePublished: today,
    dateModified: today,
    mainEntityOfPage: canonicalURL,
  });

  // County comparison table
  let countyRows = '';
  const sortedCounties = [...countyData].sort((a, b) =>
    (a.costs.fuels['heating-oil']?.monthlyCost || 0) - (b.costs.fuels['heating-oil']?.monthlyCost || 0)
  );
  for (const cd of sortedCounties) {
    const oilMonthly = cd.costs.fuels['heating-oil'] ? formatCurrency(cd.costs.fuels['heating-oil'].monthlyCost) : 'N/A';
    const gasMonthly = cd.costs.fuels['natural-gas'] ? formatCurrency(cd.costs.fuels['natural-gas'].monthlyCost) : 'N/A';
    const hpMonthly = cd.costs.fuels['heat-pump'] ? formatCurrency(cd.costs.fuels['heat-pump'].monthlyCost) : 'N/A';
    const countySlug = slugify(cd.county);

    countyRows += `
                <tr>
                    <td><a href="/average-heating-bill/${stateAbbrev}/${countySlug}">${cd.county}</a></td>
                    <td><strong>${oilMonthly}</strong></td>
                    <td>${gasMonthly}</td>
                    <td>${hpMonthly}</td>
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

    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:url" content="${canonicalURL}">
    <meta property="og:type" content="article">
    <meta name="twitter:card" content="summary">

    <link rel="canonical" href="${canonicalURL}">
    <link rel="stylesheet" href="${getCssPath(depth)}">
    <link rel="icon" type="image/png" sizes="32x32" href="${'../'.repeat(depth)}favicon-32.png">
    <link rel="icon" type="image/png" sizes="180x180" href="${'../'.repeat(depth)}favicon.png">
    <link rel="apple-touch-icon" sizes="180x180" href="${'../'.repeat(depth)}favicon.png">

    <script type="application/ld+json">${schemaBreadcrumb}</script>
    <script type="application/ld+json">${schemaArticle}</script>
</head>
<body>
    ${getNavHTML(depth)}

    <section class="content-section">
        <p style="color: var(--text-light); font-size: 0.9rem; margin-bottom: 0.5rem;">
            <a href="/learn/">Learn</a> → Average Heating Bill in ${stateName}
        </p>

        <h1>Average Heating Bill in ${stateName}</h1>

        ${stateOilPrice ? `
        <p style="font-size: 1.3rem; margin: 1rem 0;"><strong>${stateName} Average Monthly Heating Bill: ${stateMonthly}</strong> <span style="color: var(--text-light); font-size: 0.9rem;">(oil heat, statewide median)</span></p>
        ` : ''}

        <h2>Monthly Heating Bills by County</h2>

        <p>Average monthly heating cost during the October–March season for a 2,000 sq ft home:</p>

        <div style="overflow-x: auto;">
            <table class="calc-table">
                <thead>
                    <tr>
                        <th>County</th>
                        <th>Monthly Oil</th>
                        <th>Monthly Gas</th>
                        <th>Monthly Heat Pump</th>
                        <th>HDD</th>
                    </tr>
                </thead>
                <tbody>${countyRows}
                </tbody>
            </table>
        </div>

        <p style="margin-top: 1rem; font-size: 0.9rem; color: var(--text-light);">
            Oil prices are local medians. Gas and electricity are ${stateName} state averages (EIA). HDD from NOAA 30-year normals.
            <br>Updated: ${today}. Click a county for detailed breakdown.
        </p>

        ${stateOilPrice ? `
        <h2>Statewide Fuel Cost Comparison</h2>
        ${getFuelComparisonTable(costs)}
        ${getVerdictHTML(costs)}
        ` : ''}

        <h2>Assumptions</h2>
        <p style="font-size: 0.9rem; color: var(--text-light);">
            Based on a 2,000 sq ft home, 85% oil furnace efficiency, COP 3.0 heat pump, NOAA 30-year normal HDD, and EIA state-average energy rates.
        </p>

        <hr style="margin: 2.5rem 0; border: none; border-top: 1px solid var(--border-color);">

        <h3>Related</h3>
        <ul>
            <li><a href="/heating-cost/${stateAbbrev}/">Heating Costs in ${stateName}</a></li>
            <li><a href="/price-trend/${stateAbbrev}/">Oil Price Trends in ${stateName}</a></li>
            <li><a href="/tools/heating-cost-calculator">Heating Cost Calculator</a></li>
            <li><a href="/prices/${stateAbbrev}/">${stateName} Oil Prices</a></li>
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
    <loc>${BASE_URL}/average-heating-bill/${state.abbrev}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
  </url>`;
  }

  for (const county of generatedPages.counties) {
    urls += `
  <url>
    <loc>${BASE_URL}/average-heating-bill/${county.stateAbbrev}/${county.slug}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.6</priority>
  </url>`;
  }

  return urls;
}

// ── Main ─────────────────────────────────────────────────────────

async function generateAvgBillPages(options = {}) {
  const {
    sequelize: externalSequelize = null,
    dryRun = cliDryRun,
  } = options;

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  HomeHeat Average Heating Bill Page Generator');
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
    let skippedCount = 0;

    for (const [stateCode, stateInfo] of Object.entries(STATES)) {
      console.log(`\nProcessing ${stateInfo.name}...`);

      const countyStats = await getCountyOilStats(sequelize, stateCode);
      if (countyStats.length === 0) {
        console.log(`  Skipping ${stateCode} — no county price data`);
        continue;
      }

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
          // Directory may not exist yet
        }
      }

      // Process each county
      const validCounties = [];
      for (const cs of countyStats) {
        const county = cs.county_name;
        const zipPrefixes = cs.zip_prefixes || [];

        const recentPrices = await getRecentPriceCount(sequelize, zipPrefixes);
        const eligibility = getCountyEligibility(cs, recentPrices);

        if (!eligibility.avgBill) {
          skippedCount++;
          continue;
        }

        const oilPrice = parseFloat(cs.median_price);
        const costs = computeFuelCosts(oilPrice, stateCode, county);

        const html = generateCountyPageHTML(stateCode, stateInfo, county, cs, costs, eligibility);
        const countySlug = slugify(county);
        const filePath = path.join(stateDir, `${countySlug}.html`);

        if (!dryRun) {
          await fs.writeFile(filePath, html, 'utf-8');
        }

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
      const stateCosts = stateOilPrice
        ? computeFuelCosts(stateOilPrice, stateCode, null)
        : { fuels: {}, cheapest: null, payback: null, hdd: 0, electricRate: 0, gasRate: 0 };

      const stateHtml = generateStatePageHTML(stateCode, stateInfo, stateStats, validCounties, stateCosts);
      const statePath = path.join(stateDir, 'index.html');
      if (!dryRun) {
        await fs.writeFile(statePath, stateHtml, 'utf-8');
      }

      console.log(`  ${stateInfo.abbrev}: ${validCounties.length} counties`);
      totalStatePages++;
      generatedPages.states.push({ abbrev: stateInfo.abbrev, name: stateInfo.name });
    }

    // Write sitemap fragment
    const sitemapURLs = generateSitemapURLs(generatedPages);
    const sitemapPath = path.join(OUTPUT_DIR, '_sitemap-fragment.xml');
    if (!dryRun) {
      await fs.mkdir(OUTPUT_DIR, { recursive: true });
      await fs.writeFile(sitemapPath, sitemapURLs, 'utf-8');
    }

    console.log(`\n✅ Avg Bill pages: ${totalStatePages} state, ${totalCountyPages} county (${skippedCount} skipped: insufficient data)`);

    return { success: true, generatedPages, totalStatePages, totalCountyPages };

  } finally {
    if (shouldCloseConnection) {
      await sequelize.close();
    }
  }
}

// CLI entry point
if (require.main === module) {
  generateAvgBillPages().catch(err => {
    console.error('FATAL:', err.message);
    process.exit(1);
  });
}

module.exports = { generateAvgBillPages };
