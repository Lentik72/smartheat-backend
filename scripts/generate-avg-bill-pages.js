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

// ── Top-Level Index Page ─────────────────────────────────────────

function generateIndexPageHTML(statesData) {
  const depth = 1;
  const today = new Date().toISOString().split('T')[0];
  const currentYear = today.slice(0, 4);
  const updateMonth = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const title = `Average Heating Bills by State (${currentYear}) | HomeHeat`;
  const description = 'Average heating bills vary widely depending on fuel type, home size, and climate. See estimated winter heating costs by state and county.';
  const canonicalURL = `${BASE_URL}/average-heating-bill/`;

  const schemaBreadcrumb = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: BASE_URL },
      { '@type': 'ListItem', position: 2, name: 'Average Heating Bill', item: canonicalURL },
    ],
  });

  // Compute range for cost bar visualization
  const costs = statesData.filter(s => s.monthlyCost).map(s => s.monthlyCost);
  const minCost = Math.min(...costs);
  const maxCost = Math.max(...costs);
  const costRange = maxCost - minCost || 1;
  const avgCost = Math.round(costs.reduce((a, b) => a + b, 0) / costs.length);
  const totalCounties = statesData.reduce((sum, s) => sum + (s.countyCount || 0), 0);

  // Sort by cost descending for the ranked list
  const sorted = [...statesData].filter(s => s.monthlyCost).sort((a, b) => b.monthlyCost - a.monthlyCost);

  let stateRows = '';
  for (let i = 0; i < sorted.length; i++) {
    const st = sorted[i];
    const monthlyCost = formatCurrency(st.monthlyCost);
    const annualCost = formatCurrency(st.monthlyCost * 6);
    const countyCount = st.countyCount || 0;
    const barWidth = Math.round(((st.monthlyCost - minCost) / costRange) * 100);
    const countyLabel = countyCount === 1 ? '1 county' : `${countyCount} counties`;

    stateRows += `
                <a href="/average-heating-bill/${st.abbrev}/" class="abi-state-row" data-track="avgbill-state-${st.abbrev}" data-referrer="avg_bill_index">
                    <div class="abi-state-name">${st.name}</div>
                    <div class="abi-state-bar-wrap">
                        <div class="abi-state-bar" style="width:${Math.max(barWidth, 8)}%"></div>
                    </div>
                    <div class="abi-state-cost">${monthlyCost}<span>/mo</span></div>
                    <div class="abi-state-annual">${annualCost}/season</div>
                    <div class="abi-state-meta">${countyLabel}</div>
                    <div class="abi-state-arrow">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </div>
                </a>`;
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
    <meta property="og:type" content="website">

    <link rel="canonical" href="${canonicalURL}">
    <link rel="stylesheet" href="${getCssPath(depth)}">
    <link rel="icon" type="image/png" sizes="32x32" href="${'../'.repeat(depth)}favicon-32.png">
    <link rel="icon" type="image/png" sizes="180x180" href="${'../'.repeat(depth)}favicon.png">
    <link rel="apple-touch-icon" sizes="180x180" href="${'../'.repeat(depth)}favicon.png">

    <script type="application/ld+json">${schemaBreadcrumb}</script>
    <style>
        .abi-hero {
            background: linear-gradient(135deg, #1a1a1a 0%, #2d1f14 100%);
            color: #fff;
            padding: 3.5rem 1.5rem 3rem;
            margin: 0 calc(-1 * var(--space-6));
            text-align: center;
        }
        .abi-hero h1 {
            font-size: 2rem;
            font-weight: 700;
            margin: 0 0 0.75rem;
            letter-spacing: -0.02em;
            color: #fff;
        }
        .abi-hero p {
            color: rgba(255,255,255,0.7);
            font-size: 1.05rem;
            max-width: 540px;
            margin: 0 auto;
            line-height: 1.5;
        }
        .abi-stats {
            display: flex;
            justify-content: center;
            gap: 2.5rem;
            margin-top: 2rem;
            flex-wrap: wrap;
        }
        .abi-stat {
            text-align: center;
        }
        .abi-stat-value {
            font-size: 1.75rem;
            font-weight: 700;
            color: #FF6B35;
        }
        .abi-stat-label {
            font-size: 0.8rem;
            color: rgba(255,255,255,0.5);
            text-transform: uppercase;
            letter-spacing: 0.06em;
            margin-top: 0.15rem;
        }
        .abi-section {
            max-width: 720px;
            margin: 0 auto;
            padding: 2.5rem 0;
        }
        .abi-section-header {
            display: flex;
            align-items: baseline;
            justify-content: space-between;
            margin-bottom: 1.25rem;
        }
        .abi-section-header h2 {
            font-size: 1.25rem;
            font-weight: 600;
            margin: 0;
            color: var(--text-dark);
        }
        .abi-section-header span {
            font-size: 0.8rem;
            color: var(--text-light);
        }
        .abi-state-list {
            display: flex;
            flex-direction: column;
            gap: 0;
        }
        .abi-state-row {
            display: grid;
            grid-template-columns: 140px 1fr auto auto auto auto;
            grid-template-areas: "name bar cost annual meta arrow";
            align-items: center;
            gap: 1rem;
            padding: 1rem 1.25rem;
            text-decoration: none;
            color: var(--text-dark);
            border-bottom: 1px solid var(--border-color);
            transition: background 0.15s;
        }
        .abi-state-row:first-child {
            border-top: 1px solid var(--border-color);
        }
        .abi-state-row:hover {
            background: var(--primary-orange-light);
        }
        .abi-state-name {
            grid-area: name;
            font-weight: 600;
            font-size: 0.95rem;
        }
        .abi-state-bar-wrap {
            grid-area: bar;
            height: 6px;
            background: #f0ebe7;
            border-radius: 3px;
            overflow: hidden;
            min-width: 60px;
        }
        .abi-state-bar {
            height: 100%;
            background: linear-gradient(90deg, #FF6B35, #ff8f66);
            border-radius: 3px;
            transition: width 0.4s ease;
        }
        .abi-state-cost {
            grid-area: cost;
            font-size: 1.1rem;
            font-weight: 700;
            color: var(--text-dark);
            white-space: nowrap;
            text-align: right;
        }
        .abi-state-cost span {
            font-size: 0.75rem;
            font-weight: 400;
            color: var(--text-light);
        }
        .abi-state-annual {
            grid-area: annual;
            font-size: 0.8rem;
            color: var(--text-light);
            white-space: nowrap;
            min-width: 80px;
            text-align: right;
        }
        .abi-state-meta {
            grid-area: meta;
            font-size: 0.8rem;
            color: var(--text-light);
            white-space: nowrap;
            min-width: 70px;
            text-align: right;
        }
        .abi-state-arrow {
            grid-area: arrow;
            color: var(--text-light);
            display: flex;
            align-items: center;
        }
        .abi-state-row:hover .abi-state-arrow {
            color: var(--primary-orange);
        }
        .abi-method {
            background: var(--background-secondary);
            border-radius: 10px;
            padding: 1.5rem 1.75rem;
            margin-top: 2.5rem;
        }
        .abi-method h3 {
            font-size: 0.95rem;
            font-weight: 600;
            margin: 0 0 0.5rem;
            color: var(--text-dark);
        }
        .abi-method p {
            font-size: 0.85rem;
            color: var(--text-gray);
            margin: 0;
            line-height: 1.6;
        }
        .abi-related {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 1rem;
            margin-top: 2rem;
        }
        .abi-related a {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            padding: 1rem 1.25rem;
            border: 1px solid var(--border-color);
            border-radius: 10px;
            text-decoration: none;
            color: var(--text-dark);
            font-size: 0.9rem;
            font-weight: 500;
            transition: border-color 0.15s, box-shadow 0.15s;
        }
        .abi-related a:hover {
            border-color: var(--primary-orange);
            box-shadow: 0 2px 8px rgba(255,107,53,0.1);
        }
        .abi-related svg {
            flex-shrink: 0;
            color: var(--primary-orange);
        }
        @media (max-width: 768px) {
            .abi-hero {
                padding: 2.5rem 1.25rem 2rem;
                margin: 0 -1rem;
            }
            .abi-hero h1 { font-size: 1.5rem; }
            .abi-stats { gap: 1.5rem; }
            .abi-stat-value { font-size: 1.4rem; }
            .abi-state-row {
                grid-template-columns: 1fr auto auto;
                grid-template-areas:
                    "name cost arrow"
                    "bar bar arrow";
                gap: 0.35rem 0.75rem;
                padding: 0.85rem 1rem;
            }
            .abi-state-annual, .abi-state-meta { display: none; }
            .abi-state-bar-wrap { margin-top: 0.15rem; }
            .abi-state-arrow { grid-row: 1 / 3; }
            .abi-related { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>
    ${getNavHTML(depth)}

    <section class="content-section">
        <div class="abi-hero">
            <h1>Average Heating Bills by State</h1>
            <p>Estimated monthly heating costs for a 2,000 sq ft home based on local fuel prices and climate data.</p>
            <div class="abi-stats">
                <div class="abi-stat">
                    <div class="abi-stat-value">${formatCurrency(avgCost)}</div>
                    <div class="abi-stat-label">Avg monthly bill</div>
                </div>
                <div class="abi-stat">
                    <div class="abi-stat-value">${formatCurrency(minCost)}–${formatCurrency(maxCost)}</div>
                    <div class="abi-stat-label">Range across states</div>
                </div>
                <div class="abi-stat">
                    <div class="abi-stat-value">${totalCounties}</div>
                    <div class="abi-stat-label">Counties tracked</div>
                </div>
            </div>
        </div>

        <div class="abi-section">
            <div class="abi-section-header">
                <h2>Heating Bills by State</h2>
                <span>Updated ${updateMonth}</span>
            </div>
            <div class="abi-state-list">
                ${stateRows}
            </div>

            <div class="abi-method">
                <h3>How we calculate these estimates</h3>
                <p>Based on NOAA 30-year normal heating degree days, EIA state-average energy rates, and local median oil prices from ${totalCounties > 50 ? totalCounties : 'tracked'} counties. Assumes a 2,000 sq ft home, 85% oil furnace efficiency, and 6-month heating season (October–March). Select a state to see county-level breakdowns.</p>
            </div>

            <div class="abi-section-header" style="margin-top:2.5rem;">
                <h2>Explore More</h2>
            </div>
            <div class="abi-related">
                <a href="/tools/heating-cost-calculator" data-track="avgbill-explore-calculator" data-referrer="avg_bill_index">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="10" y2="10"/><line x1="14" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="10" y2="14"/><line x1="14" y1="14" x2="16" y2="14"/></svg>
                    Heating Cost Calculator
                </a>
                <a href="/learn/heating-oil-vs-heat-pump" data-track="avgbill-explore-heatpump" data-referrer="avg_bill_index">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg>
                    Oil vs Heat Pump Comparison
                </a>
                <a href="/learn/cheapest-way-to-heat-your-home" data-track="avgbill-explore-cheapest" data-referrer="avg_bill_index">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                    Cheapest Way to Heat Your Home
                </a>
                <a href="/prices" data-track="avgbill-explore-prices" data-referrer="avg_bill_index">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                    Compare Oil Prices by State
                </a>
            </div>
        </div>
    </section>

    ${getFooterHTML(depth)}
    <script src="${'../'.repeat(depth)}js/nav.min.js" defer></script>
    <script src="${'../'.repeat(depth)}js/widgets.min.js" defer></script>
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
      const stateMonthlyOil = stateCosts.fuels['heating-oil'] ? stateCosts.fuels['heating-oil'].monthlyCost : null;
      generatedPages.states.push({ abbrev: stateInfo.abbrev, name: stateInfo.name, monthlyCost: stateMonthlyOil, countyCount: validCounties.length });
    }

    // Generate top-level index page
    if (generatedPages.states.length > 0 && !dryRun) {
      await fs.mkdir(OUTPUT_DIR, { recursive: true });
      const indexHtml = generateIndexPageHTML(generatedPages.states);
      await fs.writeFile(path.join(OUTPUT_DIR, 'index.html'), indexHtml, 'utf-8');
      console.log(`\n✅ Top-level index page generated`);
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
