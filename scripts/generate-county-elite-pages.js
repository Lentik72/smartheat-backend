#!/usr/bin/env node
/**
 * Generate County Elite Price Pages
 * Creates /prices/county/{state}/{county}.html for counties with quality data
 *
 * Features:
 * - Static HTML with pre-computed data (no API calls at runtime)
 * - Chart.js 6-week price history
 * - Confidence badges (never numeric - bands only)
 * - ZIP prefix breakdown with links to ZIP pages
 * - Schema.org structured data (Dataset + FAQ)
 * - Internal linking to ZIP pages
 *
 * Usage:
 *   DATABASE_URL="..." node scripts/generate-county-elite-pages.js
 *   DATABASE_URL="..." node scripts/generate-county-elite-pages.js --dry-run
 *   DATABASE_URL="..." node scripts/generate-county-elite-pages.js --county=Westchester --state=NY
 */

const { Sequelize } = require('sequelize');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

// Configuration
const WEBSITE_DIR = path.join(__dirname, '../website');
const COUNTY_DIR = path.join(WEBSITE_DIR, 'prices/county');
const MIN_QUALITY_SCORE = 0.45;  // Tier 1 + Tier 2 only (quality counties)

// Parse CLI args
const args = process.argv.slice(2);
const cliDryRun = args.includes('--dry-run');
const countyArg = args.find(a => a.startsWith('--county='));
const stateArg = args.find(a => a.startsWith('--state='));
const singleCounty = countyArg ? countyArg.split('=')[1] : null;
const singleState = stateArg ? stateArg.split('=')[1] : null;

/**
 * Main entry point
 */
async function generateCountyElitePages(options = {}) {
  const {
    sequelize: externalSequelize = null,
    logger = console,
    outputDir = WEBSITE_DIR,
    dryRun = cliDryRun
  } = options;

  const log = (msg) => logger.info ? logger.info(msg) : console.log(msg);

  log('═══════════════════════════════════════════════════════════');
  log('  County Elite Page Generator - V1.0.0');
  log('  ' + new Date().toLocaleString());
  log('═══════════════════════════════════════════════════════════');

  if (dryRun) {
    log('🔍 DRY RUN - No files will be written');
  }

  if (singleCounty && singleState) {
    log(`📍 Single county mode: ${singleCounty}, ${singleState}`);
  }

  // Database connection
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

  const shouldCloseConnection = !externalSequelize;

  try {
    if (!externalSequelize) {
      await sequelize.authenticate();
      log('✅ Database connected');
    }

    // Ensure directory exists
    if (!dryRun) {
      await fs.mkdir(COUNTY_DIR, { recursive: true });
    }

    // Get county stats that meet quality threshold
    let whereClause = 'WHERE data_quality_score >= :minQuality';
    const replacements = { minQuality: MIN_QUALITY_SCORE };

    if (singleCounty && singleState) {
      whereClause += ' AND county_name = :county AND state_code = :state';
      replacements.county = singleCounty;
      replacements.state = singleState;
    }

    const [countyStats] = await sequelize.query(`
      SELECT *
      FROM county_current_stats
      ${whereClause}
      ORDER BY data_quality_score DESC
    `, { replacements });

    log(`📊 Found ${countyStats.length} counties meeting quality threshold (>= ${MIN_QUALITY_SCORE})`);

    // Generate pages
    let generated = 0;
    for (const stats of countyStats) {
      // Get historical data for this county
      const [history] = await sequelize.query(`
        SELECT
          week_start as week,
          median_price as median,
          min_price,
          max_price,
          supplier_count as suppliers,
          data_points
        FROM county_price_stats
        WHERE county_name = :county AND state_code = :state AND fuel_type = :fuelType
        ORDER BY week_start DESC
        LIMIT 12
      `, {
        replacements: { county: stats.county_name, state: stats.state_code, fuelType: stats.fuel_type || 'heating_oil' }
      });

      // Get ZIP prefix details for this county
      const zipPrefixes = stats.zip_prefixes || [];
      let zipDetails = [];
      if (zipPrefixes.length > 0) {
        [zipDetails] = await sequelize.query(`
          SELECT zip_prefix, median_price, supplier_count, data_quality_score
          FROM zip_current_stats
          WHERE zip_prefix IN (:prefixes) AND fuel_type = 'heating_oil'
          ORDER BY zip_prefix
        `, { replacements: { prefixes: zipPrefixes } });
      }

      const html = generateCountyPageHTML(stats, history, zipDetails);

      // Create state subdirectory
      const stateDir = path.join(COUNTY_DIR, stats.state_code.toLowerCase());
      if (!dryRun) {
        await fs.mkdir(stateDir, { recursive: true });
      }

      const slug = slugify(stats.county_name);
      const filePath = path.join(stateDir, `${slug}.html`);

      if (!dryRun) {
        await fs.writeFile(filePath, html, 'utf-8');
      }
      generated++;

      if (generated <= 10 || generated % 10 === 0) {
        log(`  [${generated}/${countyStats.length}] ${stats.county_name}, ${stats.state_code} (quality: ${stats.data_quality_score})`);
      }
    }

    // Generate CSS
    if (!dryRun) {
      const cssPath = path.join(COUNTY_DIR, 'county-elite.css');
      await fs.writeFile(cssPath, generateCountyEliteCSS(), 'utf-8');
      log('✅ Generated county-elite.css');
    }

    // Update sitemap to include county pages
    if (!dryRun && countyStats.length > 0) {
      const websiteDir = outputDir || WEBSITE_DIR;
      const sitemapPath = path.join(websiteDir, 'sitemap.xml');
      try {
        await updateSitemapWithCountyPages(sitemapPath, countyStats);
        log('✅ Updated sitemap.xml with county pages');
      } catch (e) {
        log(`⚠️  Failed to update sitemap: ${e.message}`);
      }
    }

    // Summary
    log('\n═══════════════════════════════════════════════════════════');
    log('  GENERATION COMPLETE');
    log('═══════════════════════════════════════════════════════════');
    log(`  County pages generated: ${generated}`);

    if (shouldCloseConnection) await sequelize.close();
    return { success: true, generated };

  } catch (error) {
    log(`❌ Error: ${error.message}`);
    console.error(error);
    if (shouldCloseConnection) await sequelize.close();
    throw error;
  }
}

/**
 * Generate HTML for a County Elite page
 */
function generateCountyPageHTML(stats, history, zipDetails) {
  const countyName = stats.county_name;
  const stateCode = stats.state_code;
  const stateName = getStateName(stateCode);
  const medianPrice = parseFloat(stats.median_price) || null;
  const minPrice = parseFloat(stats.min_price) || medianPrice;
  const maxPrice = parseFloat(stats.max_price) || medianPrice;
  const supplierCount = stats.supplier_count || 0;
  const zipCount = stats.zip_count || 0;
  const weeksAvailable = stats.weeks_available || 0;
  const percentChange6w = stats.percent_change_6w ? parseFloat(stats.percent_change_6w) : null;
  const dataQuality = parseFloat(stats.data_quality_score) || 0;
  const zipPrefixes = stats.zip_prefixes || [];

  // Confidence badge - NEVER show numeric score
  const confidenceLabel = getConfidenceLabel(dataQuality);
  const confidenceClass = getConfidenceClass(dataQuality);
  const confidenceTooltip = 'Based on supplier coverage, data depth, and price history maturity.';

  // Trend messaging
  const trendMessage = getTrendMessage(percentChange6w, weeksAvailable);
  const trendClass = getTrendClass(percentChange6w);

  // Format dates
  const dateStr = formatDate();
  const lastUpdate = stats.last_scrape_at
    ? new Date(stats.last_scrape_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : dateStr;

  // Chart data (reverse for chronological order)
  const chartHistory = [...history].reverse();
  const chartLabels = chartHistory.map(h => formatWeekLabel(h.week));
  const chartData = chartHistory.map(h => parseFloat(h.median) || null);

  // Coverage depth messaging
  const coverageDepth = `Data coverage across ${zipPrefixes.length} ZIP prefix${zipPrefixes.length !== 1 ? 'es' : ''} and ${zipCount} ZIP codes.`;

  // Schema.org Dataset
  const datasetSchema = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    "name": `Heating Oil Prices in ${countyName} County, ${stateName}`,
    "description": `Weekly heating oil price data for ${countyName} County, ${stateCode}. Includes median, minimum, and maximum prices from ${supplierCount} suppliers across ${zipCount} ZIP codes.`,
    "url": `https://www.gethomeheat.com/prices/county/${stateCode.toLowerCase()}/${slugify(countyName)}`,
    "license": "https://creativecommons.org/licenses/by-nc/4.0/",
    "creator": {
      "@type": "Organization",
      "name": "HomeHeat",
      "url": "https://www.gethomeheat.com"
    },
    "spatialCoverage": {
      "@type": "Place",
      "name": `${countyName} County, ${stateName}`,
      "address": {
        "@type": "PostalAddress",
        "addressRegion": stateCode,
        "addressCountry": "US"
      }
    },
    "temporalCoverage": weeksAvailable > 0 ? `P${weeksAvailable}W` : undefined,
    "dateModified": new Date().toISOString().split('T')[0],
    "variableMeasured": [
      {
        "@type": "PropertyValue",
        "name": "Median Price",
        "unitCode": "USD/gallon"
      }
    ]
  };

  // Schema.org FAQPage
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": `What is the current heating oil price in ${countyName} County, ${stateCode}?`,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": medianPrice
            ? `The current median heating oil price in ${countyName} County, ${stateName} is $${medianPrice.toFixed(2)} per gallon, based on ${supplierCount} suppliers. Prices range from $${minPrice.toFixed(2)} to $${maxPrice.toFixed(2)}/gal.`
            : `Price data is being collected for ${countyName} County. Check back soon for updates.`
        }
      },
      {
        "@type": "Question",
        "name": `Why are heating oil prices in ${countyName} County ${percentChange6w > 0 ? 'rising' : 'lower'}?`,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": trendMessage || `Heating oil prices fluctuate based on crude oil markets, seasonal demand, and local supplier competition. ${countyName} County has ${supplierCount} active suppliers competing for customers.`
        }
      },
      {
        "@type": "Question",
        "name": `How many heating oil suppliers operate in ${countyName} County?`,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": `There are ${supplierCount} heating oil suppliers with published pricing in ${countyName} County, serving ${zipCount} ZIP codes across ${zipPrefixes.length} ZIP prefix areas.`
        }
      }
    ]
  };

  // Breadcrumb schema
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.gethomeheat.com/" },
      { "@type": "ListItem", "position": 2, "name": "Prices", "item": "https://www.gethomeheat.com/prices" },
      { "@type": "ListItem", "position": 3, "name": stateName, "item": `https://www.gethomeheat.com/prices/${stateCode.toLowerCase()}` },
      { "@type": "ListItem", "position": 4, "name": `${countyName} County` }
    ]
  };

  const assetPath = '../../../';
  const slug = slugify(countyName);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-HCNTVGNVJ9"></script>
  <script src="${assetPath}js/analytics.js"></script>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Heating Oil Prices in ${escapeHtml(countyName)} County, ${stateCode} - ${dateStr} | HomeHeat</title>
  <meta name="description" content="${medianPrice ? `Current heating oil price in ${countyName} County, ${stateName}: $${medianPrice.toFixed(2)}/gal median from ${supplierCount} suppliers across ${zipCount} ZIP codes.` : `Heating oil prices for ${countyName} County, ${stateName}.`} Updated ${lastUpdate}.">
  <link rel="canonical" href="https://www.gethomeheat.com/prices/county/${stateCode.toLowerCase()}/${slug}">

  <!-- OpenGraph -->
  <meta property="og:title" content="Heating Oil Prices in ${escapeHtml(countyName)} County, ${stateCode} - ${dateStr}">
  <meta property="og:description" content="${medianPrice ? `$${medianPrice.toFixed(2)}/gal median. Compare ${supplierCount} suppliers.` : 'Compare local heating oil prices.'}">
  <meta property="og:url" content="https://www.gethomeheat.com/prices/county/${stateCode.toLowerCase()}/${slug}">
  <meta property="og:type" content="website">

  <meta name="color-scheme" content="light only">
  <link rel="stylesheet" href="${assetPath}style.min.css?v=26">
  <link rel="stylesheet" href="../county-elite.css?v=1">
  <link rel="icon" type="image/png" sizes="32x32" href="${assetPath}favicon-32.png">
  <meta name="apple-itunes-app" content="app-id=6747320571">

  <!-- Chart.js -->
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>

  <!-- Schema.org Structured Data -->
  <script type="application/ld+json">${JSON.stringify(breadcrumbSchema)}</script>
  <script type="application/ld+json">${JSON.stringify(datasetSchema)}</script>
  <script type="application/ld+json">${JSON.stringify(faqSchema)}</script>
</head>
<body>
  <nav class="nav">
    <div class="nav-container">
      <a href="/" class="nav-logo">
        <img src="${assetPath}images/app-icon-small.png" alt="HomeHeat" class="nav-logo-icon">
        HomeHeat
      </a>
      <button class="nav-toggle" aria-label="Toggle navigation">
        <span></span>
        <span></span>
        <span></span>
      </button>
      <ul class="nav-links">
        <li><a href="/">Home</a></li>
        <li><a href="/prices" class="active">Prices</a></li>
        <li><a href="/for-suppliers">For Suppliers</a></li>
        <li><a href="/learn/">Learn</a></li>
        <li><a href="/support">Support</a></li>
      </ul>
    </div>
  </nav>

  <main class="county-elite-page">
    <!-- Breadcrumb -->
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <a href="/">Home</a> › <a href="/prices">Prices</a> › <a href="/prices/${stateCode.toLowerCase()}">${stateName}</a> › <span>${escapeHtml(countyName)} County</span>
    </nav>

    <header class="page-header">
      <h1>Heating Oil Prices in ${escapeHtml(countyName)} County, ${stateCode}</h1>
      <p class="county-meta">${supplierCount} suppliers · ${zipPrefixes.length} ZIP areas · Updated ${lastUpdate}</p>
      <span class="confidence-badge ${confidenceClass}" title="${confidenceTooltip}">${confidenceLabel} Confidence</span>
    </header>

    <!-- Price Summary -->
    ${medianPrice ? `
    <section class="price-summary">
      <div class="price-main">
        <span class="price-value">$${medianPrice.toFixed(2)}</span>
        <span class="price-unit">per gallon</span>
        <span class="price-label">Median Price</span>
      </div>
      <div class="price-range">
        <div class="range-item">
          <span class="range-value">$${minPrice.toFixed(2)}</span>
          <span class="range-label">Low</span>
        </div>
        <div class="range-item">
          <span class="range-value">$${maxPrice.toFixed(2)}</span>
          <span class="range-label">High</span>
        </div>
        <div class="range-item">
          <span class="range-value">${supplierCount}</span>
          <span class="range-label">Suppliers</span>
        </div>
      </div>
    </section>
    ` : `
    <section class="price-summary price-pending">
      <p>Price data is being collected for this county. Check back soon!</p>
    </section>
    `}

    <!-- Trend Alert -->
    ${trendMessage ? `
    <section class="trend-alert ${trendClass}">
      <span class="trend-icon">${getTrendIcon(percentChange6w)}</span>
      <span class="trend-text">${trendMessage}</span>
    </section>
    ` : ''}

    <!-- 6-Week Price History Chart -->
    ${history.length > 1 ? `
    <section class="chart-section">
      <h2>6-Week Price Trend</h2>
      <div class="chart-container">
        <canvas id="priceChart"></canvas>
      </div>
      <p class="chart-caption">County aggregate from ${supplierCount} suppliers</p>
    </section>

    <script>
      document.addEventListener('DOMContentLoaded', function() {
        const ctx = document.getElementById('priceChart').getContext('2d');
        new Chart(ctx, {
          type: 'line',
          data: {
            labels: ${JSON.stringify(chartLabels.slice(-6))},
            datasets: [{
              label: 'Median Price ($/gal)',
              data: ${JSON.stringify(chartData.slice(-6))},
              borderColor: '#FF6B35',
              backgroundColor: 'rgba(255, 107, 53, 0.1)',
              fill: true,
              tension: 0.3,
              pointRadius: 5,
              pointBackgroundColor: '#FF6B35'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: function(context) {
                    return '$' + context.parsed.y.toFixed(2) + '/gal';
                  }
                }
              }
            },
            scales: {
              y: {
                beginAtZero: false,
                ticks: {
                  callback: function(value) {
                    return '$' + value.toFixed(2);
                  }
                }
              }
            }
          }
        });
      });
    </script>
    ` : ''}

    <!-- Market Snapshot -->
    <section class="market-snapshot">
      <h2>Market Snapshot</h2>
      <div class="snapshot-grid">
        <div class="snapshot-item">
          <span class="snapshot-value">${supplierCount}</span>
          <span class="snapshot-label">Suppliers with live pricing</span>
        </div>
        <div class="snapshot-item">
          <span class="snapshot-value">${weeksAvailable}</span>
          <span class="snapshot-label">Weeks of data</span>
        </div>
        <div class="snapshot-item">
          <span class="snapshot-value">${zipCount}</span>
          <span class="snapshot-label">ZIP codes covered</span>
        </div>
      </div>
      <p class="coverage-depth">${coverageDepth}</p>
    </section>

    <!-- ZIP Breakdown Section -->
    ${zipDetails.length > 0 ? `
    <section class="zip-breakdown">
      <h2>Detailed Pricing by ZIP Prefix</h2>
      <div class="zip-grid">
        ${zipDetails.map(z => `
        <a href="/prices/zip/${z.zip_prefix}" class="zip-card">
          <span class="zip-prefix">${z.zip_prefix}xx</span>
          <span class="zip-price">$${parseFloat(z.median_price).toFixed(2)}/gal</span>
          <span class="zip-suppliers">${z.supplier_count} suppliers</span>
        </a>
        `).join('')}
      </div>
    </section>
    ` : ''}

    <!-- FAQ Section -->
    <section class="faq-section">
      <h2>Frequently Asked Questions</h2>
      <div class="faq-list">
        <details class="faq-item">
          <summary>What is the current heating oil price in ${escapeHtml(countyName)} County?</summary>
          <p>${medianPrice
            ? `The current median heating oil price in ${countyName} County, ${stateName} is <strong>$${medianPrice.toFixed(2)} per gallon</strong>, based on ${supplierCount} suppliers. Prices range from $${minPrice.toFixed(2)} to $${maxPrice.toFixed(2)}/gal.`
            : `Price data is being collected for ${countyName} County. Check back soon for updates.`}</p>
        </details>
        <details class="faq-item">
          <summary>Why are ${escapeHtml(countyName)} County prices ${medianPrice > 3.5 ? 'higher than average' : 'competitive'}?</summary>
          <p>Heating oil prices in ${countyName} County are influenced by proximity to terminals, local supplier competition, and seasonal demand. With ${supplierCount} active suppliers, homeowners have options to compare prices and find competitive rates.</p>
        </details>
        <details class="faq-item">
          <summary>How many heating oil suppliers operate in ${escapeHtml(countyName)} County?</summary>
          <p>There are <strong>${supplierCount} heating oil suppliers</strong> with published pricing in ${countyName} County, serving ${zipCount} ZIP codes across ${zipPrefixes.length} ZIP prefix areas (${zipPrefixes.join(', ')}).</p>
        </details>
      </div>
    </section>

    <!-- App CTA -->
    <section class="app-cta">
      <h3>Track Your Oil Usage</h3>
      <p>Get personalized run-out predictions and price alerts for ${escapeHtml(countyName)} County.</p>
      <a href="https://apps.apple.com/us/app/homeheat/id6747320571?utm_source=web_county&utm_medium=website&utm_campaign=county_elite_${stateCode.toLowerCase()}_${slug}" class="cta-button ios-only">Get HomeHeat Free &rarr;</a>
      <a href="/prices" class="cta-button android-only" style="display:none" onclick="if(window.showPwaInstallBanner){window.showPwaInstallBanner();event.preventDefault()}">Save HomeHeat &rarr;</a>
      <p class="cta-micro ios-only">Free app. No hardware. No ads.</p>
      <p class="cta-micro android-only" style="display:none">Works like an app — no download needed.</p>
    </section>

    <!-- Trust Footer -->
    <p class="trust-footer">
      Data updated daily by HomeHeat · <a href="/">gethomeheat.com</a>
    </p>
  </main>

  <!-- Floating App Download Icon (iOS mobile only) -->
  <div class="floating-app-wrapper ios-only" id="floating-app-wrapper">
    <button class="floating-app-dismiss" aria-label="Dismiss">&times;</button>
    <a href="https://apps.apple.com/us/app/homeheat/id6747320571?utm_source=web_county&utm_medium=website&utm_campaign=county_floating" class="floating-app-icon" id="floating-app-cta">
      <img src="${assetPath}images/app-icon.png" alt="HomeHeat">
      <div class="float-text">
        <span class="float-title">Get HomeHeat</span>
        <span class="float-subtitle">Free on App Store</span>
      </div>
    </a>
  </div>

  <footer class="footer">
    <div class="footer-links">
      <a href="/for-suppliers">For Suppliers</a>
      <a href="/how-prices-work">How Prices Work</a>
      <a href="/learn/">Learn</a>
      <a href="/privacy">Privacy Policy</a>
      <a href="/terms">Terms of Service</a>
      <a href="/support">Support</a>
    </div>
    <p class="copyright">© ${new Date().getFullYear()} HomeHeat. All rights reserved.</p>
  </footer>

  <script src="${assetPath}js/nav.js"></script>
  <script src="${assetPath}js/platform-detection.js"></script>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════

function getConfidenceLabel(score) {
  if (score >= 0.80) return 'High';
  if (score >= 0.60) return 'Good';
  if (score >= 0.40) return 'Moderate';
  return 'Limited';
}

function getConfidenceClass(score) {
  if (score >= 0.80) return 'confidence-high';
  if (score >= 0.60) return 'confidence-good';
  if (score >= 0.40) return 'confidence-moderate';
  return 'confidence-limited';
}

function getTrendMessage(percentChange, weeksAvailable) {
  if (weeksAvailable < 2 || percentChange === null) {
    return null;
  }

  const absChange = Math.abs(percentChange);
  const direction = percentChange > 0 ? 'up' : 'down';
  const sign = percentChange > 0 ? '+' : '';

  // Informational tone, not alarmist
  if (absChange < 2) {
    return 'Prices have remained stable over the past 6 weeks.';
  } else if (absChange < 5) {
    return `Prices are ${direction} slightly (${sign}${percentChange.toFixed(1)}%) over the past 6 weeks.`;
  } else if (absChange < 15) {
    return `Prices are ${direction} (${sign}${percentChange.toFixed(1)}%) compared to 6 weeks ago.`;
  } else {
    // Softer language for large swings - factual, not sensational
    return `Prices are ${sign}${percentChange.toFixed(1)}% compared to 6 weeks ago, reflecting seasonal market movement.`;
  }
}

function getTrendClass(percentChange) {
  if (percentChange === null) return '';
  if (percentChange > 5) return 'trend-up';
  if (percentChange < -5) return 'trend-down';
  return 'trend-stable';
}

function getTrendIcon(percentChange) {
  if (percentChange === null) return '';
  if (percentChange > 2) return '↑';
  if (percentChange < -2) return '↓';
  return '→';
}

function formatDate() {
  return new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function formatWeekLabel(weekDate) {
  const d = new Date(weekDate);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
}

function slugify(str) {
  return str.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function getStateName(code) {
  const states = {
    'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas',
    'CA': 'California', 'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware',
    'FL': 'Florida', 'GA': 'Georgia', 'HI': 'Hawaii', 'ID': 'Idaho',
    'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa', 'KS': 'Kansas',
    'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
    'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi',
    'MO': 'Missouri', 'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada',
    'NH': 'New Hampshire', 'NJ': 'New Jersey', 'NM': 'New Mexico', 'NY': 'New York',
    'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio', 'OK': 'Oklahoma',
    'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
    'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah',
    'VT': 'Vermont', 'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia',
    'WI': 'Wisconsin', 'WY': 'Wyoming', 'DC': 'District of Columbia'
  };
  return states[code] || code;
}

/**
 * Generate CSS for County Elite pages
 */
function generateCountyEliteCSS() {
  return `/* County Elite Page Styles - V1.0.0 */
/* Extends base styles from style.min.css */

.county-elite-page {
  max-width: 800px;
  margin: 0 auto;
  padding: 1rem;
}

.breadcrumb {
  font-size: 0.875rem;
  color: #666;
  margin-bottom: 1rem;
}

.breadcrumb a {
  color: #FF6B35;
  text-decoration: none;
}

.breadcrumb a:hover {
  text-decoration: underline;
}

.page-header {
  text-align: center;
  margin-bottom: 2rem;
}

.page-header h1 {
  font-size: 1.75rem;
  margin-bottom: 0.5rem;
  line-height: 1.3;
}

.county-meta {
  color: #666;
  font-size: 0.9rem;
  margin-bottom: 0.75rem;
}

/* Confidence Badges - Never show numeric */
.confidence-badge {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  border-radius: 1rem;
  font-size: 0.8rem;
  font-weight: 500;
  cursor: help;
}

.confidence-high {
  background: #d4edda;
  color: #155724;
}

.confidence-good {
  background: #d1ecf1;
  color: #0c5460;
}

.confidence-moderate {
  background: #fff3cd;
  color: #856404;
}

.confidence-limited {
  background: #f8d7da;
  color: #721c24;
}

/* Price Summary */
.price-summary {
  background: linear-gradient(135deg, #fff5f0 0%, #fff 100%);
  border: 1px solid #ffe5d9;
  border-radius: 12px;
  padding: 1.5rem;
  text-align: center;
  margin-bottom: 1.5rem;
}

.price-main {
  margin-bottom: 1rem;
}

.price-value {
  display: block;
  font-size: 3rem;
  font-weight: 700;
  color: #FF6B35;
  line-height: 1;
}

.price-unit {
  display: block;
  font-size: 1rem;
  color: #666;
  margin-top: 0.25rem;
}

.price-label {
  display: block;
  font-size: 0.875rem;
  color: #999;
  margin-top: 0.25rem;
}

.price-range {
  display: flex;
  justify-content: center;
  gap: 2rem;
  flex-wrap: wrap;
}

.range-item {
  text-align: center;
}

.range-value {
  display: block;
  font-size: 1.25rem;
  font-weight: 600;
  color: #333;
}

.range-label {
  display: block;
  font-size: 0.75rem;
  color: #666;
  text-transform: uppercase;
}

/* Trend Alert */
.trend-alert {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  margin-bottom: 1.5rem;
  font-size: 0.9rem;
}

.trend-up {
  background: #fff3cd;
  color: #856404;
}

.trend-down {
  background: #d4edda;
  color: #155724;
}

.trend-stable {
  background: #e2e3e5;
  color: #383d41;
}

.trend-icon {
  font-weight: bold;
  font-size: 1.1rem;
}

/* Chart Section */
.chart-section {
  margin-bottom: 2rem;
}

.chart-section h2 {
  font-size: 1.25rem;
  margin-bottom: 1rem;
  text-align: center;
}

.chart-container {
  height: 250px;
  position: relative;
}

.chart-caption {
  text-align: center;
  font-size: 0.8rem;
  color: #666;
  margin-top: 0.5rem;
}

/* Market Snapshot */
.market-snapshot {
  background: #f8f9fa;
  border-radius: 12px;
  padding: 1.5rem;
  margin-bottom: 2rem;
}

.market-snapshot h2 {
  font-size: 1.25rem;
  margin-bottom: 1rem;
  text-align: center;
}

.snapshot-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
  text-align: center;
}

.snapshot-value {
  display: block;
  font-size: 1.5rem;
  font-weight: 700;
  color: #333;
}

.snapshot-label {
  display: block;
  font-size: 0.75rem;
  color: #666;
}

.coverage-depth {
  text-align: center;
  font-size: 0.85rem;
  color: #666;
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #ddd;
}

/* ZIP Breakdown */
.zip-breakdown {
  margin-bottom: 2rem;
}

.zip-breakdown h2 {
  font-size: 1.25rem;
  margin-bottom: 1rem;
  text-align: center;
}

.zip-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.75rem;
}

.zip-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 1rem;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 8px;
  text-decoration: none;
  color: inherit;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.zip-card:hover {
  border-color: #FF6B35;
  box-shadow: 0 2px 8px rgba(255,107,53,0.15);
}

.zip-prefix {
  font-size: 1.1rem;
  font-weight: 600;
  color: #333;
}

.zip-price {
  font-size: 1rem;
  color: #FF6B35;
  font-weight: 500;
  margin: 0.25rem 0;
}

.zip-suppliers {
  font-size: 0.75rem;
  color: #666;
}

/* FAQ Section */
.faq-section {
  margin-bottom: 2rem;
}

.faq-section h2 {
  font-size: 1.25rem;
  margin-bottom: 1rem;
  text-align: center;
}

.faq-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.faq-item {
  border: 1px solid #ddd;
  border-radius: 8px;
  overflow: hidden;
}

.faq-item summary {
  padding: 1rem;
  cursor: pointer;
  font-weight: 500;
  background: #f8f9fa;
}

.faq-item summary:hover {
  background: #e9ecef;
}

.faq-item p {
  padding: 1rem;
  margin: 0;
  background: #fff;
  line-height: 1.6;
}

/* App CTA */
.app-cta {
  background: linear-gradient(135deg, #FF6B35 0%, #e55a28 100%);
  color: white;
  border-radius: 12px;
  padding: 2rem;
  text-align: center;
  margin-bottom: 2rem;
}

.app-cta h3 {
  font-size: 1.5rem;
  margin-bottom: 0.5rem;
}

.app-cta p {
  margin-bottom: 1rem;
  opacity: 0.95;
}

.cta-button {
  display: inline-block;
  background: white;
  color: #FF6B35;
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  text-decoration: none;
  font-weight: 600;
  transition: transform 0.2s;
}

.cta-button:hover {
  transform: translateY(-2px);
}

.cta-micro {
  font-size: 0.8rem;
  opacity: 0.8;
  margin-top: 0.75rem;
  margin-bottom: 0;
}

/* Trust Footer */
.trust-footer {
  text-align: center;
  font-size: 0.8rem;
  color: #999;
  padding: 1rem 0;
}

.trust-footer a {
  color: #FF6B35;
}

/* Responsive */
@media (max-width: 600px) {
  .page-header h1 {
    font-size: 1.4rem;
  }

  .price-value {
    font-size: 2.5rem;
  }

  .price-range {
    gap: 1rem;
  }

  .snapshot-grid {
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
  }

  .snapshot-value {
    font-size: 1.25rem;
  }

  .zip-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
`;
}

/**
 * Update sitemap with county pages
 */
async function updateSitemapWithCountyPages(sitemapPath, countyStats) {
  try {
    let content = await fs.readFile(sitemapPath, 'utf-8');

    // Remove existing county URLs
    content = content.replace(/\s*<url>\s*<loc>https:\/\/www\.gethomeheat\.com\/prices\/county\/[^<]+<\/loc>[\s\S]*?<\/url>/g, '');

    // Find closing </urlset>
    const closingTag = '</urlset>';
    const insertPos = content.lastIndexOf(closingTag);

    if (insertPos === -1) {
      throw new Error('Invalid sitemap format');
    }

    // Generate county URLs
    const today = new Date().toISOString().split('T')[0];
    const countyUrls = countyStats.map(stats => {
      const slug = slugify(stats.county_name);
      return `  <url>
    <loc>https://www.gethomeheat.com/prices/county/${stats.state_code.toLowerCase()}/${slug}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
    }).join('\n');

    // Insert county URLs
    const newContent = content.slice(0, insertPos) + countyUrls + '\n' + content.slice(insertPos);

    await fs.writeFile(sitemapPath, newContent, 'utf-8');
  } catch (error) {
    throw new Error(`Sitemap update failed: ${error.message}`);
  }
}

// Run if called directly
if (require.main === module) {
  generateCountyElitePages()
    .then(result => {
      process.exit(result.success ? 0 : 1);
    })
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { generateCountyElitePages };
