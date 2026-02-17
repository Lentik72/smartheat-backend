#!/usr/bin/env node
/**
 * Generate ZIP Elite Price Pages
 * Creates /prices/zip/{prefix}.html for ZIP prefixes with high-quality data
 *
 * Features:
 * - Static HTML with pre-computed data (no API calls at runtime)
 * - Chart.js price history visualization
 * - Confidence badges based on data quality
 * - Trend messaging (prices up/down/stable)
 * - Schema.org structured data (Dataset + FAQ)
 *
 * Usage:
 *   DATABASE_URL="..." node scripts/generate-zip-elite-pages.js
 *   DATABASE_URL="..." node scripts/generate-zip-elite-pages.js --dry-run
 *   DATABASE_URL="..." node scripts/generate-zip-elite-pages.js --prefix=105
 */

const { Sequelize } = require('sequelize');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

// Configuration
const WEBSITE_DIR = path.join(__dirname, '../website');
const ZIP_DIR = path.join(WEBSITE_DIR, 'prices/zip');
const MIN_QUALITY_SCORE = 0.3;  // Minimum data quality to generate a page

// Parse CLI args
const args = process.argv.slice(2);
const cliDryRun = args.includes('--dry-run');
const prefixArg = args.find(a => a.startsWith('--prefix='));
const singlePrefix = prefixArg ? prefixArg.split('=')[1] : null;

/**
 * Main entry point
 */
async function generateZipElitePages(options = {}) {
  const {
    sequelize: externalSequelize = null,
    logger = console,
    outputDir = WEBSITE_DIR,
    dryRun = cliDryRun
  } = options;

  const log = (msg) => logger.info ? logger.info(msg) : console.log(msg);

  log('═══════════════════════════════════════════════════════════');
  log('  ZIP Elite Page Generator - V1.0.0');
  log('  ' + new Date().toLocaleString());
  log('═══════════════════════════════════════════════════════════');

  if (dryRun) {
    log('🔍 DRY RUN - No files will be written');
  }

  if (singlePrefix) {
    log(`📍 Single prefix mode: ${singlePrefix}`);
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

    const zipDir = outputDir ? path.join(outputDir, 'prices/zip') : ZIP_DIR;

    // Ensure directory exists
    if (!dryRun) {
      await fs.mkdir(zipDir, { recursive: true });
    }

    // Get ZIP stats that meet quality threshold
    const whereClause = singlePrefix
      ? 'WHERE data_quality_score >= :minQuality AND zip_prefix = :prefix'
      : 'WHERE data_quality_score >= :minQuality';

    const [zipStats] = await sequelize.query(`
      SELECT *
      FROM zip_current_stats
      ${whereClause}
      ORDER BY data_quality_score DESC
    `, {
      replacements: { minQuality: MIN_QUALITY_SCORE, prefix: singlePrefix }
    });

    log(`📊 Found ${zipStats.length} ZIP prefixes meeting quality threshold (>= ${MIN_QUALITY_SCORE})`);

    // Generate pages
    let generated = 0;
    for (const stats of zipStats) {
      // Get historical data for this ZIP
      const [history] = await sequelize.query(`
        SELECT
          week_start as week,
          median_price as median,
          min_price,
          max_price,
          supplier_count as suppliers,
          data_points
        FROM zip_price_stats
        WHERE zip_prefix = :prefix AND fuel_type = :fuelType
        ORDER BY week_start DESC
        LIMIT 12
      `, {
        replacements: { prefix: stats.zip_prefix, fuelType: stats.fuel_type || 'heating_oil' }
      });

      const html = generateZipPageHTML(stats, history);
      const filePath = path.join(zipDir, `${stats.zip_prefix}.html`);

      if (!dryRun) {
        await fs.writeFile(filePath, html, 'utf-8');
      }
      generated++;

      if (generated <= 10 || generated % 20 === 0) {
        log(`  [${generated}/${zipStats.length}] ${stats.zip_prefix} → ${stats.region_name || 'Unknown'} (quality: ${stats.data_quality_score})`);
      }
    }

    // Generate CSS
    if (!dryRun) {
      const cssPath = path.join(zipDir, 'zip-elite.css');
      await fs.writeFile(cssPath, generateZipEliteCSS(), 'utf-8');
      log('✅ Generated zip-elite.css');
    }

    // Update sitemap to include ZIP Elite pages
    if (!dryRun && zipStats.length > 0) {
      const websiteDir = outputDir || WEBSITE_DIR;
      const sitemapPath = path.join(websiteDir, 'sitemap.xml');
      try {
        await updateSitemapWithZipPages(sitemapPath, zipStats);
        log('✅ Updated sitemap.xml with ZIP Elite pages');
      } catch (e) {
        log(`⚠️  Failed to update sitemap: ${e.message}`);
      }
    }

    // Summary
    log('\n═══════════════════════════════════════════════════════════');
    log('  GENERATION COMPLETE');
    log('═══════════════════════════════════════════════════════════');
    log(`  ZIP pages generated: ${generated}`);

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
 * Generate HTML for a ZIP Elite page
 */
function generateZipPageHTML(stats, history) {
  const zipPrefix = stats.zip_prefix;
  const regionName = stats.region_name || `ZIP ${zipPrefix}xx Area`;
  const medianPrice = parseFloat(stats.median_price) || null;
  const minPrice = parseFloat(stats.min_price) || medianPrice;
  const maxPrice = parseFloat(stats.max_price) || medianPrice;
  const supplierCount = stats.supplier_count || 0;
  const weeksAvailable = stats.weeks_available || 0;
  const percentChange6w = stats.percent_change_6w ? parseFloat(stats.percent_change_6w) : null;
  const dataQuality = parseFloat(stats.data_quality_score) || 0;
  const cities = stats.cities || [];

  // Compute confidence label
  const confidenceLabel = getConfidenceLabel(dataQuality);
  const confidenceClass = getConfidenceClass(dataQuality);

  // Compute trend messaging
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

  // Cities display
  const citiesDisplay = cities.length > 0
    ? cities.slice(0, 5).join(', ') + (cities.length > 5 ? `, and ${cities.length - 5} more` : '')
    : 'Various communities';

  // Schema.org Dataset
  const datasetSchema = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    "name": `Heating Oil Prices in ${regionName}`,
    "description": `Weekly heating oil price data for ZIP codes starting with ${zipPrefix} in ${regionName}. Includes median, minimum, and maximum prices from ${supplierCount} suppliers.`,
    "url": `https://www.gethomeheat.com/prices/zip/${zipPrefix}`,
    "license": "https://creativecommons.org/licenses/by-nc/4.0/",
    "creator": {
      "@type": "Organization",
      "name": "HomeHeat",
      "url": "https://www.gethomeheat.com"
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
        "name": `What is the current heating oil price in the ${zipPrefix}xx area?`,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": medianPrice
            ? `The current median heating oil price in ${regionName} (ZIP codes ${zipPrefix}xx) is $${medianPrice.toFixed(2)} per gallon, based on ${supplierCount} suppliers. Prices range from $${minPrice.toFixed(2)} to $${maxPrice.toFixed(2)}/gal.`
            : `Price data is being collected for the ${zipPrefix}xx area. Check back soon for updates.`
        }
      },
      {
        "@type": "Question",
        "name": `How have heating oil prices changed in ${regionName}?`,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": trendMessage
        }
      },
      {
        "@type": "Question",
        "name": `How reliable is the price data for ZIP ${zipPrefix}xx?`,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": `Our data quality score for this area is ${(dataQuality * 100).toFixed(0)}% (${confidenceLabel} confidence). This is based on ${supplierCount} suppliers and ${weeksAvailable} weeks of historical data.`
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
      { "@type": "ListItem", "position": 3, "name": regionName }
    ]
  };

  const assetPath = '../../';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-HCNTVGNVJ9"></script>
  <script src="${assetPath}js/analytics.js"></script>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Heating Oil Prices in ${escapeHtml(regionName)} (${zipPrefix}xx) - ${dateStr} | HomeHeat</title>
  <meta name="description" content="${medianPrice ? `Current heating oil price in ${regionName}: $${medianPrice.toFixed(2)}/gal median from ${supplierCount} suppliers.` : `Heating oil prices for ZIP codes starting with ${zipPrefix}.`} Updated ${lastUpdate}.">
  <link rel="canonical" href="https://www.gethomeheat.com/prices/zip/${zipPrefix}">

  <!-- OpenGraph -->
  <meta property="og:title" content="Heating Oil Prices in ${escapeHtml(regionName)} - ${dateStr}">
  <meta property="og:description" content="${medianPrice ? `$${medianPrice.toFixed(2)}/gal median. Compare ${supplierCount} suppliers.` : 'Compare local heating oil prices.'}">
  <meta property="og:url" content="https://www.gethomeheat.com/prices/zip/${zipPrefix}">
  <meta property="og:type" content="website">

  <meta name="color-scheme" content="light only">
  <link rel="stylesheet" href="${assetPath}style.min.css?v=26">
  <link rel="stylesheet" href="zip-elite.css?v=1">
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

  <main class="zip-elite-page">
    <!-- Breadcrumb -->
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <a href="/">Home</a> › <a href="/prices">Prices</a> › <span>${escapeHtml(regionName)}</span>
    </nav>

    <header class="page-header">
      <h1>Heating Oil Prices in ${escapeHtml(regionName)}</h1>
      <p class="zip-meta">ZIP codes starting with ${zipPrefix} · Updated ${lastUpdate}</p>
      <span class="confidence-badge ${confidenceClass}">${confidenceLabel} Confidence</span>
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
      <p>Price data is being collected for this area. Check back soon!</p>
    </section>
    `}

    <!-- Trend Alert -->
    ${trendMessage ? `
    <section class="trend-alert ${trendClass}">
      <span class="trend-icon">${getTrendIcon(percentChange6w)}</span>
      <span class="trend-text">${trendMessage}</span>
    </section>
    ` : ''}

    <!-- Price History Chart -->
    ${history.length > 1 ? `
    <section class="chart-section">
      <h2>Price History</h2>
      <div class="chart-container">
        <canvas id="priceChart"></canvas>
      </div>
      <p class="chart-caption">${weeksAvailable} weeks of data from ${supplierCount} suppliers</p>
    </section>

    <script>
      document.addEventListener('DOMContentLoaded', function() {
        const ctx = document.getElementById('priceChart').getContext('2d');
        new Chart(ctx, {
          type: 'line',
          data: {
            labels: ${JSON.stringify(chartLabels)},
            datasets: [{
              label: 'Median Price ($/gal)',
              data: ${JSON.stringify(chartData)},
              borderColor: '#FF6B35',
              backgroundColor: 'rgba(255, 107, 53, 0.1)',
              fill: true,
              tension: 0.3,
              pointRadius: 4,
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

    <!-- Coverage Info -->
    <section class="coverage-section">
      <h2>Area Coverage</h2>
      <div class="coverage-grid">
        <div class="coverage-item">
          <span class="coverage-label">Region</span>
          <span class="coverage-value">${escapeHtml(regionName)}</span>
        </div>
        <div class="coverage-item">
          <span class="coverage-label">ZIP Codes</span>
          <span class="coverage-value">${zipPrefix}00 - ${zipPrefix}99</span>
        </div>
        <div class="coverage-item">
          <span class="coverage-label">Communities</span>
          <span class="coverage-value">${escapeHtml(citiesDisplay)}</span>
        </div>
        <div class="coverage-item">
          <span class="coverage-label">Data Quality</span>
          <span class="coverage-value">${(dataQuality * 100).toFixed(0)}%</span>
        </div>
      </div>
    </section>

    <!-- Market Stats (if community data available) -->
    ${stats.show_user_count || stats.show_delivery_count ? `
    <section class="community-section">
      <h2>Community Activity</h2>
      <div class="community-grid">
        ${stats.show_user_count ? `
        <div class="community-item">
          <span class="community-value">${stats.user_count}+</span>
          <span class="community-label">HomeHeat users in this area</span>
        </div>
        ` : ''}
        ${stats.show_delivery_count ? `
        <div class="community-item">
          <span class="community-value">${stats.delivery_count}+</span>
          <span class="community-label">Deliveries tracked</span>
        </div>
        ` : ''}
      </div>
    </section>
    ` : ''}

    <!-- FAQ Section -->
    <section class="faq-section">
      <h2>Frequently Asked Questions</h2>
      <div class="faq-list">
        <details class="faq-item">
          <summary>What is the current heating oil price in the ${zipPrefix}xx area?</summary>
          <p>${medianPrice
            ? `The current median heating oil price in ${regionName} (ZIP codes ${zipPrefix}xx) is <strong>$${medianPrice.toFixed(2)} per gallon</strong>, based on ${supplierCount} suppliers. Prices range from $${minPrice.toFixed(2)} to $${maxPrice.toFixed(2)}/gal.`
            : `Price data is being collected for the ${zipPrefix}xx area. Check back soon for updates.`}</p>
        </details>
        <details class="faq-item">
          <summary>How have heating oil prices changed recently?</summary>
          <p>${trendMessage || 'We are gathering trend data for this area. Check back after a few weeks.'}</p>
        </details>
        <details class="faq-item">
          <summary>How reliable is this price data?</summary>
          <p>Our data quality score for this area is <strong>${(dataQuality * 100).toFixed(0)}%</strong> (${confidenceLabel} confidence). This is based on ${supplierCount} suppliers and ${weeksAvailable} weeks of historical data. Higher scores indicate more comprehensive coverage.</p>
        </details>
      </div>
    </section>

    <!-- App CTA -->
    <section class="app-cta">
      <h3>Track Your Oil Usage</h3>
      <p>Get personalized run-out predictions and price alerts for your area.</p>
      <a href="https://apps.apple.com/us/app/homeheat/id6747320571?utm_source=web_zip&utm_medium=website&utm_campaign=zip_elite_${zipPrefix}" class="cta-button ios-only">Get HomeHeat Free &rarr;</a>
      <a href="/prices" class="cta-button android-only" style="display:none" onclick="if(window.showPwaInstallBanner){window.showPwaInstallBanner();event.preventDefault()}">Save HomeHeat &rarr;</a>
      <p class="cta-micro ios-only">Free app. No hardware. No ads.</p>
    </section>

    <!-- Related Areas -->
    <section class="related-section">
      <h3>Find Suppliers in Your Area</h3>
      <p>Enter your full ZIP code for the most accurate supplier list.</p>
      <a href="/prices" class="cta-button-secondary">Search by ZIP Code &rarr;</a>
    </section>

    <!-- Trust Footer -->
    <p class="trust-footer">
      Data updated daily by HomeHeat · <a href="/">gethomeheat.com</a>
    </p>
  </main>

  <!-- Floating App Download Icon (iOS mobile only) -->
  <div class="floating-app-wrapper ios-only" id="floating-app-wrapper">
    <button class="floating-app-dismiss" aria-label="Dismiss">&times;</button>
    <a href="https://apps.apple.com/us/app/homeheat/id6747320571?utm_source=web_zip&utm_medium=website&utm_campaign=zip_floating" class="floating-app-icon" id="floating-app-cta">
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
    <p class="footer-audience">Built for homeowners who rely on heating oil or propane.</p>
    <p>&copy; 2026 HomeHeat. All rights reserved.</p>
  </footer>

  <script src="${assetPath}js/nav.js"></script>
  <script src="${assetPath}js/widgets.js"></script>
  <script src="${assetPath}js/seo-tracking.js"></script>
  <script src="${assetPath}js/pwa.js"></script>
</body>
</html>`;
}

/**
 * Generate CSS for ZIP Elite pages
 */
function generateZipEliteCSS() {
  return `/* ZIP Elite Page Styles */

.zip-elite-page {
  max-width: 800px;
  margin: 0 auto;
  padding: 24px 16px 48px;
}

.page-header {
  text-align: center;
  margin-bottom: 24px;
}

.page-header h1 {
  font-size: 28px;
  font-weight: 700;
  color: #1a1a1a;
  margin: 0 0 8px;
}

.zip-meta {
  font-size: 14px;
  color: #6b7280;
  margin: 0 0 12px;
}

.confidence-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 500;
}

.confidence-high {
  background: #d1fae5;
  color: #065f46;
}

.confidence-moderate {
  background: #fef3c7;
  color: #92400e;
}

.confidence-limited {
  background: #fee2e2;
  color: #991b1b;
}

/* Price Summary */
.price-summary {
  background: linear-gradient(135deg, #FEF3EB 0%, #fff 100%);
  border: 1px solid #E5D8D0;
  border-radius: 16px;
  padding: 24px;
  margin-bottom: 20px;
  text-align: center;
}

.price-main {
  margin-bottom: 20px;
}

.price-value {
  font-size: 48px;
  font-weight: 700;
  color: #FF6B35;
  display: block;
}

.price-unit {
  font-size: 16px;
  color: #6b7280;
}

.price-label {
  display: block;
  font-size: 14px;
  color: #9ca3af;
  margin-top: 4px;
}

.price-range {
  display: flex;
  justify-content: center;
  gap: 32px;
  flex-wrap: wrap;
}

.range-item {
  text-align: center;
}

.range-value {
  display: block;
  font-size: 20px;
  font-weight: 600;
  color: #1a1a1a;
}

.range-label {
  font-size: 12px;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.price-pending {
  padding: 32px;
}

.price-pending p {
  color: #6b7280;
  font-size: 16px;
  margin: 0;
}

/* Trend Alert */
.trend-alert {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  border-radius: 12px;
  margin-bottom: 20px;
}

.trend-up {
  background: #fee2e2;
  border: 1px solid #fca5a5;
}

.trend-down {
  background: #d1fae5;
  border: 1px solid #6ee7b7;
}

.trend-stable {
  background: #f3f4f6;
  border: 1px solid #d1d5db;
}

.trend-icon {
  font-size: 24px;
}

.trend-text {
  font-size: 15px;
  color: #1a1a1a;
}

/* Chart Section */
.chart-section {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  padding: 24px;
  margin-bottom: 20px;
}

.chart-section h2 {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 16px;
  color: #1a1a1a;
}

.chart-container {
  height: 250px;
  position: relative;
}

.chart-caption {
  font-size: 12px;
  color: #9ca3af;
  text-align: center;
  margin: 12px 0 0;
}

/* Coverage Section */
.coverage-section {
  background: #FEF3EB;
  border-radius: 16px;
  padding: 24px;
  margin-bottom: 20px;
}

.coverage-section h2 {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 16px;
  color: #1a1a1a;
}

.coverage-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.coverage-item {
  display: flex;
  flex-direction: column;
}

.coverage-label {
  font-size: 12px;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}

.coverage-value {
  font-size: 14px;
  color: #1a1a1a;
  font-weight: 500;
}

/* Community Section */
.community-section {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 16px;
  padding: 24px;
  margin-bottom: 20px;
}

.community-section h2 {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 16px;
  color: #1a1a1a;
}

.community-grid {
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
}

.community-item {
  text-align: center;
  flex: 1;
  min-width: 120px;
}

.community-value {
  display: block;
  font-size: 28px;
  font-weight: 700;
  color: #16a34a;
}

.community-label {
  font-size: 13px;
  color: #6b7280;
}

/* FAQ Section */
.faq-section {
  margin-bottom: 24px;
}

.faq-section h2 {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 16px;
  color: #1a1a1a;
}

.faq-item {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  margin-bottom: 12px;
  overflow: hidden;
}

.faq-item summary {
  padding: 16px;
  font-weight: 500;
  cursor: pointer;
  list-style: none;
}

.faq-item summary::-webkit-details-marker {
  display: none;
}

.faq-item summary::before {
  content: '+';
  float: right;
  font-size: 20px;
  color: #FF6B35;
}

.faq-item[open] summary::before {
  content: '-';
}

.faq-item p {
  padding: 0 16px 16px;
  margin: 0;
  color: #4b5563;
  line-height: 1.6;
}

/* App CTA */
.app-cta {
  background: linear-gradient(135deg, #FF6B35 0%, #E55A2B 100%);
  border-radius: 16px;
  padding: 32px 24px;
  text-align: center;
  color: white;
  margin-bottom: 20px;
}

.app-cta h3 {
  font-size: 22px;
  margin: 0 0 8px;
}

.app-cta p {
  margin: 0 0 20px;
  opacity: 0.9;
}

.cta-button {
  display: inline-block;
  background: white;
  color: #FF6B35;
  padding: 14px 28px;
  border-radius: 8px;
  font-weight: 600;
  text-decoration: none;
  transition: transform 0.2s;
}

.cta-button:hover {
  transform: scale(1.02);
}

.cta-micro {
  font-size: 12px;
  opacity: 0.8;
  margin: 12px 0 0;
}

/* Related Section */
.related-section {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  padding: 24px;
  text-align: center;
  margin-bottom: 24px;
}

.related-section h3 {
  font-size: 18px;
  margin: 0 0 8px;
  color: #1a1a1a;
}

.related-section p {
  margin: 0 0 16px;
  color: #6b7280;
}

.cta-button-secondary {
  display: inline-block;
  background: #FF6B35;
  color: white;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  text-decoration: none;
}

.cta-button-secondary:hover {
  background: #E55A2B;
}

/* Trust Footer */
.trust-footer {
  text-align: center;
  font-size: 13px;
  color: #9ca3af;
  margin: 24px 0 0;
}

.trust-footer a {
  color: #FF6B35;
}

/* Responsive */
@media (max-width: 480px) {
  .page-header h1 {
    font-size: 24px;
  }

  .price-value {
    font-size: 40px;
  }

  .price-range {
    gap: 20px;
  }

  .coverage-grid {
    grid-template-columns: 1fr;
  }
}
`;
}

/**
 * Update sitemap.xml to include ZIP Elite pages
 * Appends ZIP URLs before the closing </urlset> tag
 */
async function updateSitemapWithZipPages(sitemapPath, zipStats) {
  const today = new Date().toISOString().split('T')[0];

  // Generate ZIP URLs
  const zipUrls = zipStats.map(z => `
  <url>
    <loc>https://www.gethomeheat.com/prices/zip/${z.zip_prefix}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.65</priority>
  </url>`).join('');

  try {
    // Read existing sitemap
    let sitemap = await fs.readFile(sitemapPath, 'utf-8');

    // Remove any existing ZIP URLs (in case of re-runs)
    sitemap = sitemap.replace(/\s*<url>\s*<loc>https:\/\/www\.gethomeheat\.com\/prices\/zip\/\d{3}<\/loc>[\s\S]*?<\/url>/g, '');

    // Insert ZIP URLs before closing </urlset>
    sitemap = sitemap.replace('</urlset>', `${zipUrls}
</urlset>`);

    await fs.writeFile(sitemapPath, sitemap, 'utf-8');
  } catch (e) {
    // If sitemap doesn't exist, create a minimal one
    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://www.gethomeheat.com/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
${zipUrls}
</urlset>`;
    await fs.writeFile(sitemapPath, sitemap, 'utf-8');
  }
}

// Utility functions
function getConfidenceLabel(score) {
  if (score >= 0.8) return 'High';
  if (score >= 0.6) return 'Moderate';
  return 'Limited Data';
}

function getConfidenceClass(score) {
  if (score >= 0.8) return 'confidence-high';
  if (score >= 0.6) return 'confidence-moderate';
  return 'confidence-limited';
}

function getTrendMessage(percentChange, weeksAvailable) {
  if (percentChange === null || weeksAvailable < 2) {
    return null;
  }

  const absChange = Math.abs(percentChange);
  const direction = percentChange > 0 ? 'up' : 'down';

  if (absChange < 2) {
    return 'Prices have remained stable over the past 6 weeks.';
  } else if (absChange < 5) {
    return `Prices are ${direction} slightly (${absChange.toFixed(1)}%) over the past 6 weeks.`;
  } else if (absChange < 15) {
    return `Prices have moved ${direction} ${absChange.toFixed(1)}% over the past 6 weeks.`;
  } else {
    return `Prices have ${direction === 'up' ? 'increased sharply' : 'dropped significantly'} (${absChange.toFixed(1)}%) over the past 6 weeks.`;
  }
}

function getTrendClass(percentChange) {
  if (percentChange === null) return '';
  if (Math.abs(percentChange) < 2) return 'trend-stable';
  return percentChange > 0 ? 'trend-up' : 'trend-down';
}

function getTrendIcon(percentChange) {
  if (percentChange === null || Math.abs(percentChange) < 2) return '➡️';
  return percentChange > 0 ? '📈' : '📉';
}

function formatDate() {
  return new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}

function formatWeekLabel(weekDate) {
  const date = new Date(weekDate);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Export for scheduler
module.exports = { generateZipElitePages };

// Run directly if executed from command line
if (require.main === module) {
  generateZipElitePages()
    .then(result => {
      if (result?.success) {
        console.log(`\n✅ Generated ${result.generated} ZIP Elite pages`);
        process.exit(0);
      } else {
        console.log('❌ Generation failed');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}
