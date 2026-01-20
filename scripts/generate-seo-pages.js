#!/usr/bin/env node
/**
 * SEO Static Page Generator
 * V1.0.0: Generates static HTML pages for search engine indexing
 *
 * Creates:
 * - National dashboard content for prices.html
 * - State-level pages (7 states)
 * - Updated sitemap.xml
 *
 * Runs after daily price scrape (10 AM EST)
 *
 * Usage:
 *   DATABASE_URL="..." node scripts/generate-seo-pages.js
 *   DATABASE_URL="..." node scripts/generate-seo-pages.js --dry-run
 */

const { Sequelize } = require('sequelize');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

// Configuration
const WEBSITE_DIR = path.join(__dirname, '../../website');
const PRICES_DIR = path.join(WEBSITE_DIR, 'prices');
const MIN_SUPPLIERS_REQUIRED = 10; // Safety threshold

// State configuration
const STATES = {
  'NY': { name: 'New York', slug: 'new-york' },
  'CT': { name: 'Connecticut', slug: 'connecticut' },
  'MA': { name: 'Massachusetts', slug: 'massachusetts' },
  'NJ': { name: 'New Jersey', slug: 'new-jersey' },
  'PA': { name: 'Pennsylvania', slug: 'pennsylvania' },
  'RI': { name: 'Rhode Island', slug: 'rhode-island' },
  'NH': { name: 'New Hampshire', slug: 'new-hampshire' }
};

// Parse args (for CLI mode)
const args = process.argv.slice(2);
const cliDryRun = args.includes('--dry-run');

/**
 * Main entry point
 * @param {object} options - Configuration options
 * @param {object} options.sequelize - Existing Sequelize instance (optional)
 * @param {object} options.logger - Logger instance (default: console)
 * @param {string} options.outputDir - Output directory (null = use default WEBSITE_DIR)
 * @param {boolean} options.dryRun - If true, don't write files
 */
async function generateSEOPages(options = {}) {
  const {
    sequelize: externalSequelize = null,
    logger = console,
    outputDir = WEBSITE_DIR,
    dryRun = cliDryRun
  } = options;

  const log = (msg) => logger.info ? logger.info(msg) : console.log(msg);

  log('═══════════════════════════════════════════════════════════');
  log('  HomeHeat SEO Page Generator - V1.0.0');
  log('  ' + new Date().toLocaleString());
  log('═══════════════════════════════════════════════════════════');

  if (dryRun) {
    log('🔍 DRY RUN - No files will be written');
  }

  // Use provided sequelize or create new connection
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

  const shouldCloseConnection = !externalSequelize; // Only close if we created it

  try {
    if (!externalSequelize) {
      await sequelize.authenticate();
      log('✅ Database connected');
    }

    // Determine output paths
    const pricesDir = outputDir ? path.join(outputDir, 'prices') : PRICES_DIR;
    const websiteDir = outputDir || WEBSITE_DIR;

    // 1. Get all suppliers with fresh prices
    const suppliers = await getSupplierPrices(sequelize);
    log(`📊 Found ${suppliers.length} suppliers with prices`);

    // 2. SAFETY CHECK: Abort if insufficient data
    if (suppliers.length < MIN_SUPPLIERS_REQUIRED) {
      log(`❌ CRITICAL: Only ${suppliers.length} suppliers found (need ${MIN_SUPPLIERS_REQUIRED}+)`);
      log('   Aborting to prevent blank pages.');
      if (shouldCloseConnection) await sequelize.close();
      return { success: false, reason: 'insufficient_data', totalSuppliers: suppliers.length };
    }

    // 3. Group by state
    const byState = groupByState(suppliers);
    log('📍 Suppliers by state:');
    for (const [state, list] of Object.entries(byState)) {
      log(`   ${state}: ${list.length} suppliers`);
    }

    // 4. Create prices directory if needed
    if (!dryRun) {
      await fs.mkdir(pricesDir, { recursive: true });
    }

    // 5. Generate national dashboard data
    const dashboard = generateDashboardData(byState);
    log('📊 Generated national dashboard data');

    // 6. Generate state pages
    let stateCount = 0;
    for (const [stateCode, stateSuppliers] of Object.entries(byState)) {
      if (stateSuppliers.length < 3) {
        log(`   ⏭️  Skipping ${stateCode} (only ${stateSuppliers.length} suppliers)`);
        continue;
      }

      const stateInfo = STATES[stateCode];
      if (!stateInfo) continue;

      const html = generateStatePage(stateCode, stateInfo, stateSuppliers, byState);
      const outputPath = path.join(pricesDir, `${stateInfo.slug}.html`);

      if (!dryRun) {
        await fs.writeFile(outputPath, html, 'utf-8');
      }
      log(`   ✅ Generated ${stateInfo.slug}.html (${stateSuppliers.length} suppliers)`);
      stateCount++;
    }

    // 7. Generate leaderboard HTML snippet for prices.html injection
    const leaderboardHtml = generateLeaderboardSnippet(dashboard);
    const leaderboardPath = path.join(pricesDir, '_leaderboard-snippet.html');
    if (!dryRun) {
      await fs.writeFile(leaderboardPath, leaderboardHtml, 'utf-8');
    }
    log(`   ✅ Generated _leaderboard-snippet.html`);

    // 8. Update sitemap
    const sitemapPath = path.join(websiteDir, 'sitemap.xml');
    const sitemap = await generateSitemap(Object.keys(byState).filter(s => byState[s].length >= 3));
    if (!dryRun) {
      await fs.writeFile(sitemapPath, sitemap, 'utf-8');
    }
    log(`   ✅ Updated sitemap.xml`);

    // Summary
    log('═══════════════════════════════════════════════════════════');
    log('  GENERATION COMPLETE');
    log('═══════════════════════════════════════════════════════════');
    log(`  State pages: ${stateCount}`);
    log(`  Total suppliers: ${suppliers.length}`);
    log(`  Output directory: ${pricesDir}`);

    if (shouldCloseConnection) await sequelize.close();
    return { success: true, statePages: stateCount, totalSuppliers: suppliers.length };

  } catch (error) {
    log(`❌ Error: ${error.message}`);
    if (shouldCloseConnection) await sequelize.close();
    throw error;
  }
}

/**
 * Get suppliers with current prices from database
 */
async function getSupplierPrices(sequelize) {
  const [results] = await sequelize.query(`
    SELECT
      s.id,
      s.name,
      s.city,
      s.state,
      s.phone,
      s.website,
      sp.price_per_gallon as price,
      sp.min_gallons,
      sp.scraped_at
    FROM suppliers s
    JOIN supplier_prices sp ON s.id = sp.supplier_id
    WHERE s.active = true
      AND s.allow_price_display = true
      AND sp.is_valid = true
      AND sp.expires_at > NOW()
      AND sp.source_type = 'scraped'
      AND sp.price_per_gallon BETWEEN 2.00 AND 5.00
    ORDER BY sp.scraped_at DESC
  `);

  // Deduplicate by supplier (keep latest price)
  const seen = new Set();
  const unique = [];
  for (const row of results) {
    if (!seen.has(row.id)) {
      seen.add(row.id);
      unique.push({
        ...row,
        price: parseFloat(row.price)
      });
    }
  }

  return unique;
}

/**
 * Group suppliers by state
 */
function groupByState(suppliers) {
  const byState = {};
  for (const s of suppliers) {
    if (!s.state) continue;
    byState[s.state] = byState[s.state] || [];
    byState[s.state].push(s);
  }

  // Sort each state by price
  for (const state of Object.keys(byState)) {
    byState[state].sort((a, b) => a.price - b.price);
  }

  return byState;
}

/**
 * Generate national dashboard data
 */
function generateDashboardData(byState) {
  const stateAverages = [];
  const allSuppliers = [];

  for (const [state, suppliers] of Object.entries(byState)) {
    if (suppliers.length < 3) continue;

    const prices = suppliers.map(s => s.price);
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;

    stateAverages.push({
      state,
      stateName: STATES[state]?.name || state,
      slug: STATES[state]?.slug,
      avg: avg.toFixed(2),
      count: suppliers.length,
      min: Math.min(...prices).toFixed(2),
      max: Math.max(...prices).toFixed(2)
    });

    allSuppliers.push(...suppliers);
  }

  // Sort states by average price
  stateAverages.sort((a, b) => parseFloat(a.avg) - parseFloat(b.avg));

  // Top 5 deals across all states
  allSuppliers.sort((a, b) => a.price - b.price);
  const topDeals = allSuppliers.slice(0, 5).map(s => ({
    price: s.price.toFixed(2),
    supplier: s.name,
    city: s.city,
    state: s.state
  }));

  return { stateAverages, topDeals };
}

/**
 * Generate analysis text for a state (avoids thin content)
 */
function generateAnalysisText(stateInfo, suppliers) {
  const prices = suppliers.map(s => s.price);
  const avg = (prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2);
  const min = Math.min(...prices).toFixed(2);
  const max = Math.max(...prices).toFixed(2);
  const cheapest = suppliers.find(s => s.price.toFixed(2) === min);
  const spread = (parseFloat(avg) - parseFloat(min)).toFixed(2);

  const dateStr = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  return `As of ${dateStr}, the average heating oil price in <strong>${stateInfo.name}</strong> is <strong>$${avg}</strong> per gallon. The lowest price is <strong>$${min}</strong> in ${cheapest?.city || 'the region'}, which is <strong>$${spread} lower</strong> than the state average. Prices range from $${min} to $${max} across ${suppliers.length} suppliers.`;
}

/**
 * Generate a state page HTML
 */
function generateStatePage(stateCode, stateInfo, suppliers, byState) {
  const dateStr = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  const timeStr = new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  });

  const prices = suppliers.map(s => s.price);
  const avg = (prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2);
  const min = Math.min(...prices).toFixed(2);
  const max = Math.max(...prices).toFixed(2);

  const analysisText = generateAnalysisText(stateInfo, suppliers);

  // Generate Schema.org markup
  const schemaItems = suppliers.slice(0, 25).map((s, i) => ({
    "@type": "ListItem",
    "position": i + 1,
    "item": {
      "@type": "Product",
      "name": `Heating Oil Delivery in ${s.city}, ${s.state}`,
      "offers": {
        "@type": "Offer",
        "price": s.price.toFixed(2),
        "priceCurrency": "USD",
        "priceValidUntil": new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        "availability": "https://schema.org/InStock",
        "seller": {
          "@type": "LocalBusiness",
          "name": s.name,
          ...(s.phone && { "telephone": s.phone })
        }
      }
    }
  }));

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://gethomeheat.com/" },
      { "@type": "ListItem", "position": 2, "name": "Prices", "item": "https://gethomeheat.com/prices.html" },
      { "@type": "ListItem", "position": 3, "name": stateInfo.name }
    ]
  };

  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": `Heating Oil Prices in ${stateInfo.name}`,
    "numberOfItems": schemaItems.length,
    "itemListElement": schemaItems
  };

  // Generate other state links
  const otherStates = Object.entries(STATES)
    .filter(([code]) => code !== stateCode && byState[code]?.length >= 3)
    .map(([code, info]) => `<a href="${info.slug}.html">${info.name}</a>`)
    .join(' · ');

  // Generate supplier table rows
  const tableRows = suppliers.map(s => `
        <tr>
          <td class="supplier-name">${escapeHtml(s.name)}</td>
          <td class="supplier-city">${escapeHtml(s.city || '')}</td>
          <td class="supplier-price">$${s.price.toFixed(2)}</td>
          <td class="supplier-phone">${s.phone ? `<a href="tel:${s.phone}">${escapeHtml(s.phone)}</a>` : '—'}</td>
        </tr>`).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-HCNTVGNVJ9"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-HCNTVGNVJ9');
  </script>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Heating Oil Prices in ${stateInfo.name} - Updated ${dateStr} | HomeHeat</title>
  <meta name="description" content="${stateInfo.name} heating oil prices today. Compare ${suppliers.length} suppliers from $${min} to $${max}/gal. Updated daily.">
  <link rel="canonical" href="https://gethomeheat.com/prices/${stateInfo.slug}.html">

  <!-- OpenGraph -->
  <meta property="og:title" content="Heating Oil Prices in ${stateInfo.name} - ${dateStr}">
  <meta property="og:description" content="Compare ${suppliers.length} heating oil suppliers in ${stateInfo.name}. Prices from $${min} to $${max}/gal.">
  <meta property="og:url" content="https://gethomeheat.com/prices/${stateInfo.slug}.html">
  <meta property="og:type" content="website">

  <link rel="stylesheet" href="../style.css?v=8">
  <link rel="icon" type="image/png" sizes="32x32" href="../favicon-32.png">

  <!-- Schema.org Structured Data -->
  <script type="application/ld+json">${JSON.stringify(breadcrumbSchema)}</script>
  <script type="application/ld+json">${JSON.stringify(itemListSchema)}</script>
</head>
<body>
  <nav class="nav">
    <div class="nav-container">
      <a href="../index.html" class="nav-logo">
        <img src="../images/app-icon-small.png" alt="HomeHeat" class="nav-logo-icon">
        HomeHeat
      </a>
      <ul class="nav-links">
        <li><a href="../index.html">Home</a></li>
        <li><a href="../prices.html" class="active">Prices</a></li>
        <li><a href="../learn/">Learn</a></li>
        <li><a href="../privacy.html">Privacy</a></li>
        <li><a href="../support.html">Support</a></li>
      </ul>
    </div>
  </nav>

  <main class="state-prices-page">
    <!-- Breadcrumb -->
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <a href="../index.html">Home</a> ›
      <a href="../prices.html">Prices</a> ›
      <span>${stateInfo.name}</span>
    </nav>

    <header class="state-header">
      <h1>Heating Oil Prices in ${stateInfo.name}</h1>
      <p class="last-updated">Prices last updated: ${dateStr} at ${timeStr}</p>
    </header>

    <!-- Dynamic Analysis (Unique per state - avoids thin content) -->
    <section class="analysis-section">
      <p class="analysis-text">${analysisText}</p>
    </section>

    <!-- Price Summary Card -->
    <section class="price-summary-card">
      <div class="price-stat">
        <span class="stat-label">Lowest</span>
        <span class="stat-value">$${min}</span>
      </div>
      <div class="price-stat">
        <span class="stat-label">Average</span>
        <span class="stat-value">$${avg}</span>
      </div>
      <div class="price-stat">
        <span class="stat-label">Highest</span>
        <span class="stat-value">$${max}</span>
      </div>
    </section>

    <!-- Supplier Table -->
    <section class="supplier-table-section">
      <h2>All ${stateInfo.name} Suppliers (${suppliers.length})</h2>
      <table class="supplier-table">
        <thead>
          <tr>
            <th>Supplier</th>
            <th>City</th>
            <th>Price/Gal</th>
            <th>Phone</th>
          </tr>
        </thead>
        <tbody>
${tableRows}
        </tbody>
      </table>
    </section>

    <!-- Disclaimer -->
    <p class="disclaimer">
      Prices shown are reported by suppliers. Actual delivered prices may vary by volume and payment method.
    </p>

    <!-- ZIP Lookup CTA -->
    <section class="zip-cta">
      <h3>Find prices in your exact area</h3>
      <p>Enter your ZIP code for suppliers that deliver to your address.</p>
      <a href="../prices.html" class="cta-button">Check My ZIP Code →</a>
    </section>

    <!-- Other States -->
    <section class="other-states">
      <h3>Prices in Other States</h3>
      <p>${otherStates}</p>
    </section>

    <!-- Trust Footer -->
    <p class="trust-footer">
      Data updated daily by HomeHeat · <a href="../index.html">gethomeheat.com</a>
    </p>
  </main>

  <footer class="footer">
    <div class="footer-links">
      <a href="../learn/">Learn</a>
      <a href="../privacy.html">Privacy Policy</a>
      <a href="../terms.html">Terms of Service</a>
      <a href="../support.html">Support</a>
    </div>
    <p>&copy; 2025 HomeHeat. All rights reserved.</p>
  </footer>
</body>
</html>`;
}

/**
 * Generate leaderboard HTML snippet for prices.html
 */
function generateLeaderboardSnippet(dashboard) {
  const dateStr = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  // State averages table
  const stateRows = dashboard.stateAverages.map(s => `
        <tr>
          <td><a href="prices/${s.slug}.html">${s.stateName}</a></td>
          <td>$${s.avg} avg</td>
          <td>${s.count} suppliers</td>
          <td><a href="prices/${s.slug}.html">See all →</a></td>
        </tr>`).join('\n');

  // Top deals list
  const topDealItems = dashboard.topDeals.map(d => `
        <li class="deal-item">
          <span class="deal-price">$${d.price}/gal</span>
          <span class="deal-supplier">${escapeHtml(d.supplier)}</span>
          <span class="deal-location">${escapeHtml(d.city)}, ${d.state}</span>
        </li>`).join('\n');

  return `<!-- SEO LEADERBOARD - Auto-generated ${new Date().toISOString()} -->
<!-- Insert this after the prices-hero section in prices.html -->

<section id="default-leaderboard" class="default-leaderboard">
  <h2>Today's Heating Oil Prices Across the Northeast</h2>
  <p class="leaderboard-date">Updated ${dateStr}</p>

  <div class="leaderboard-grid">
    <!-- State Averages -->
    <div class="state-averages">
      <h3>Average Prices by State</h3>
      <table class="averages-table">
        <tbody>
${stateRows}
        </tbody>
      </table>
    </div>

    <!-- Top Deals -->
    <div class="top-deals">
      <h3>Top 5 Deals in the Northeast</h3>
      <ul class="deals-list">
${topDealItems}
      </ul>
    </div>
  </div>

  <p class="leaderboard-cta">Enter your ZIP code above for prices in your exact area.</p>

  <p class="disclaimer">
    Prices shown are reported by suppliers. Actual delivered prices may vary.
  </p>
</section>

<!-- Schema.org for National Leaderboard -->
<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "ItemList",
  "name": "Heating Oil Prices - Northeast US",
  "description": "Current heating oil prices across the Northeast United States",
  "numberOfItems": dashboard.topDeals.length,
  "itemListElement": dashboard.topDeals.map((d, i) => ({
    "@type": "ListItem",
    "position": i + 1,
    "item": {
      "@type": "Product",
      "name": `Heating Oil Delivery in ${d.city}, ${d.state}`,
      "offers": {
        "@type": "Offer",
        "price": d.price,
        "priceCurrency": "USD"
      }
    }
  }))
}, null, 2)}
</script>
`;
}

/**
 * Generate sitemap.xml
 */
async function generateSitemap(activeStates) {
  const today = new Date().toISOString().split('T')[0];

  const stateUrls = activeStates
    .map(code => STATES[code])
    .filter(Boolean)
    .map(s => `
  <url>
    <loc>https://gethomeheat.com/prices/${s.slug}.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://gethomeheat.com/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://gethomeheat.com/prices.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
${stateUrls}
  <url>
    <loc>https://gethomeheat.com/learn/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://gethomeheat.com/learn/heating-oil-usage.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://gethomeheat.com/learn/heating-oil-winter.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://gethomeheat.com/learn/measure-heating-oil.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://gethomeheat.com/privacy.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.3</priority>
  </url>
  <url>
    <loc>https://gethomeheat.com/terms.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.3</priority>
  </url>
  <url>
    <loc>https://gethomeheat.com/support.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.4</priority>
  </url>
</urlset>`;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Export for use by scheduler
module.exports = { generateSEOPages };

// Run directly if executed from command line
if (require.main === module) {
  generateSEOPages()
    .then(result => {
      if (result?.success) {
        console.log('✅ SEO pages generated successfully');
        process.exit(0);
      } else {
        console.log('❌ Generation failed:', result?.reason);
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}
