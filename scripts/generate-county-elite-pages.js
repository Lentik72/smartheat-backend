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
const crypto = require('crypto');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
require('dotenv').config();

// Shared supplier data queries
const { getAllSuppliers, getCurrentPrices, getSuppliersForZips, computeFreshness } = require('./lib/supplier-data');

// Fuel cost computation
const { computeFuelCosts, init: initCountyData, getNavHTML } = require('./lib/county-data');

// Location resolver for ZIP lookups
const locationResolver = require('../src/services/locationResolver');

// Configuration
const MIN_VALID_PRICE = 2.00;
const MAX_VALID_PRICE = 6.00;
const WEBSITE_DIR = path.join(__dirname, '../website');
const COUNTY_DIR = path.join(WEBSITE_DIR, 'prices/county');
const MIN_QUALITY_SCORE = 0.45;  // Tier 1 + Tier 2 only (quality counties)

// Initialize county data module for fuel cost lookups
initCountyData(WEBSITE_DIR);

// Parse CLI args
const args = process.argv.slice(2);
const cliDryRun = args.includes('--dry-run');
const countyArg = args.find(a => a.startsWith('--county='));
const stateArg = args.find(a => a.startsWith('--state='));
const singleCounty = countyArg ? countyArg.split('=')[1] : null;
const singleState = stateArg ? stateArg.split('=')[1] : null;
const legacyLayout = args.includes('--legacy-layout');

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

    // For nearby county links, we need ALL qualifying counties (not just filtered single)
    let allQualifyingCounties = countyStats;
    if (singleCounty && singleState) {
      const [allQC] = await sequelize.query(`
        SELECT * FROM county_current_stats
        WHERE data_quality_score >= :minQuality
        ORDER BY data_quality_score DESC
      `, { replacements: { minQuality: MIN_QUALITY_SCORE } });
      allQualifyingCounties = allQC;
    }

    // Get state-level medians for comparison
    const [stateMedians] = await sequelize.query(`
      SELECT
        state_code,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY median_price) as state_median
      FROM county_current_stats
      WHERE fuel_type = 'heating_oil' AND median_price IS NOT NULL
      GROUP BY state_code
    `);
    const stateMedianMap = {};
    stateMedians.forEach(s => {
      stateMedianMap[s.state_code] = parseFloat(s.state_median);
    });

    // Compute county CSS hash for cache-busting
    const countyCssContent = generateCountyEliteCSS();
    const countyCssHash = crypto.createHash('md5').update(countyCssContent).digest('hex').slice(0, 8);

    // Write CSS BEFORE HTML pages to prevent CDN race condition:
    // If HTML is served before CSS is written, CDN caches stale CSS under new hash
    if (!dryRun) {
      const cssPath = path.join(COUNTY_DIR, 'county-elite.css');
      await fs.writeFile(cssPath, countyCssContent, 'utf-8');
      log('✅ Generated county-elite.css (hash: ' + countyCssHash + ')');
    }

    // Fetch all suppliers + prices once (shared with SEO generator)
    const allSuppliers = await getAllSuppliers(sequelize);
    const allPrices = await getCurrentPrices(sequelize, MIN_VALID_PRICE, MAX_VALID_PRICE);
    const priceMap = new Map();
    for (const p of allPrices) {
      priceMap.set(p.supplier_id, p);
    }
    log(`📊 Loaded ${allSuppliers.length} suppliers, ${allPrices.length} prices for table generation`);

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

      // Get suppliers for this county via 5-digit ZIP matching
      const countyZips = locationResolver.getZipsForCounty(stats.county_name, stats.state_code);
      let countySuppliers = [];
      if (countyZips.length > 0) {
        countySuppliers = getSuppliersForZips(allSuppliers, countyZips, priceMap);
      } else {
        // Fallback: match suppliers by service_counties field
        countySuppliers = allSuppliers
          .filter(s => {
            const counties = s.service_counties || [];
            return counties.some(c =>
              c.toLowerCase().includes(stats.county_name.toLowerCase()) &&
              c.toUpperCase().includes(stats.state_code)
            );
          })
          .map(s => {
            const priceInfo = priceMap.get(s.id);
            return {
              ...s,
              price: priceInfo?.price || null,
              minGallons: priceInfo?.min_gallons || null,
              scrapedAt: priceInfo?.scraped_at || null,
              priceSource: priceInfo?.source_type || null,
              hasPrice: !!priceInfo
            };
          })
          .sort((a, b) => {
            if (a.hasPrice && !b.hasPrice) return -1;
            if (!a.hasPrice && b.hasPrice) return 1;
            if (a.hasPrice && b.hasPrice) return a.price - b.price;
            return a.name.localeCompare(b.name);
          });
      }

      const stateMedian = stateMedianMap[stats.state_code] || null;
      const html = generateCountyPageHTML(stats, history, zipDetails, stateMedian, countyCssHash, countySuppliers, countyZips, allQualifyingCounties, legacyLayout);

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
        log(`  [${generated}/${countyStats.length}] ${stats.county_name}, ${stats.state_code} (quality: ${stats.data_quality_score}, ${countySuppliers.length} suppliers)`);
      }
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
function generateCountyPageHTML(stats, history, zipDetails, stateMedian = null, countyCssHash = '1', countySuppliers = [], countyZips = [], allCountyStats = [], legacyLayout = false) {
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

  // Community engagement data (for social proof)
  const userCount = parseInt(stats.user_count) || 0;
  const showUserCount = stats.show_user_count === true;

  // State comparison (e.g., "Westchester is 4% above NY average")
  const stateComparison = getStateComparison(medianPrice, stateMedian, countyName, stateCode);

  // Confidence badge - NEVER show numeric score
  const confidenceLabel = getConfidenceLabel(dataQuality);
  const confidenceClass = getConfidenceClass(dataQuality);
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

  // Chart y-axis clamping (only the displayed 6 weeks, not all 12)
  const chartDisplayData = chartData.slice(-6);
  const chartValues = chartDisplayData.filter(v => v !== null);
  const chartMinVal = chartValues.length ? Math.min(...chartValues) : 0;
  const chartMaxVal = chartValues.length ? Math.max(...chartValues) : 5;
  const chartPadVal = (chartMaxVal - chartMinVal) * 0.05 || 0.05;
  const chartYMin = Math.max(0, Math.floor((chartMinVal - chartPadVal) * 100) / 100);
  const chartYMax = Math.ceil((chartMaxVal + chartPadVal) * 100) / 100;

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
            ? `The current median heating oil price in ${countyName} County, ${stateName} is $${medianPrice.toFixed(2)} per gallon, based on ${supplierCount} tracked suppliers. Prices range from $${minPrice.toFixed(2)} to $${maxPrice.toFixed(2)}/gal.`
            : `Price data is being collected for ${countyName} County. Check back soon for updates.`
        }
      },
      {
        "@type": "Question",
        "name": `Why are heating oil prices in ${countyName} County ${percentChange6w > 0 ? 'rising' : 'lower'}?`,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": trendMessage || `Heating oil prices fluctuate based on crude oil markets, seasonal demand, and local supplier competition. HomeHeat currently tracks ${supplierCount} suppliers in ${countyName} County.`
        }
      },
      {
        "@type": "Question",
        "name": `How many heating oil suppliers operate in ${countyName} County?`,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": `HomeHeat tracks ${Math.max(supplierCount, countySuppliers.length)} heating oil suppliers with published pricing in ${countyName} County, covering ${zipCount} ZIP codes.`
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

  // Schema.org ItemList for priced suppliers (min 2 items)
  const pricedSuppliers = countySuppliers.filter(s => s.hasPrice && s.slug);
  const itemListSchema = pricedSuppliers.length >= 2 ? {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": `Heating Oil Suppliers in ${countyName} County, ${stateName}`,
    "numberOfItems": pricedSuppliers.length,
    "itemListElement": pricedSuppliers.map((s, i) => ({
      "@type": "ListItem",
      "position": i + 1,
      "item": {
        "@type": "LocalBusiness",
        "name": s.name,
        "url": `https://www.gethomeheat.com/supplier/${s.slug}`,
        "address": {
          "@type": "PostalAddress",
          "addressLocality": s.city || '',
          "addressRegion": s.state || stateCode
        },
        "offers": {
          "@type": "Offer",
          "priceSpecification": {
            "@type": "UnitPriceSpecification",
            "price": s.price.toFixed(2),
            "priceCurrency": "USD",
            "unitCode": "GLL",
            "unitText": "gallon"
          }
        }
      }
    }))
  } : null;

  // Use actual supplier count from table when larger than aggregated stats
  const displaySupplierCount = countySuppliers.length;

  const slug = slugify(countyName);

  // ── Price Status Banner logic ──
  const lastScrapeAt = stats.last_scrape_at ? new Date(stats.last_scrape_at) : null;
  const hoursSinceScrape = lastScrapeAt ? (Date.now() - lastScrapeAt.getTime()) / (1000 * 60 * 60) : Infinity;
  const isFresh = hoursSinceScrape < 36;
  const absChange = percentChange6w !== null ? Math.abs(percentChange6w) : 0;
  const showPriceBanner = isFresh && percentChange6w !== null && supplierCount >= 3 && absChange >= 3;

  // Compute 6w-ago price from current + percent change
  let priceSignal = 'none';
  let priceBannerHTML = '';
  if (showPriceBanner && medianPrice) {
    const priceAgo = medianPrice / (1 + percentChange6w / 100);
    const weeksLabel = weeksAvailable >= 6 ? '6' : String(weeksAvailable);

    if (percentChange6w <= -3) {
      priceSignal = 'down';
      priceBannerHTML = `
    <section class="price-status-banner price-status-down">
      <div class="psb-status">Prices Down ${absChange.toFixed(0)}% in ${weeksLabel} Weeks</div>
      <div class="psb-range">Prices range from $${minPrice.toFixed(2)} to $${maxPrice.toFixed(2)}/gal across ${supplierCount} suppliers</div>
      <div class="psb-timestamp">Based on ${supplierCount} suppliers · Updated ${lastUpdate}</div>
      <a href="#suppliers" class="psb-cta" data-track="price-status-cta" data-referrer="price_status">Compare ${supplierCount} suppliers &rarr;</a>
      <a href="https://apps.apple.com/us/app/homeheat/id6747320571?utm_source=web_county&utm_medium=price_banner&utm_campaign=county_elite_${stateCode.toLowerCase()}_${slug}" class="psb-app-hook ios-only">Track price changes in the app &rarr;</a>
    </section>`;
    } else {
      priceSignal = 'up';
      priceBannerHTML = `
    <section class="price-status-banner price-status-up">
      <div class="psb-status">Prices Trending Up ${absChange.toFixed(0)}% in ${weeksLabel} Weeks</div>
      <div class="psb-range">Prices range from $${minPrice.toFixed(2)} to $${maxPrice.toFixed(2)}/gal across ${supplierCount} suppliers</div>
      <div class="psb-timestamp">Based on ${supplierCount} suppliers · Updated ${lastUpdate}</div>
      <a href="#alerts" class="psb-cta" data-track="price-status-cta" data-referrer="price_status">Set a price alert &rarr;</a>
      <a href="https://apps.apple.com/us/app/homeheat/id6747320571?utm_source=web_county&utm_medium=price_banner&utm_campaign=county_elite_${stateCode.toLowerCase()}_${slug}" class="psb-app-hook ios-only">Track price changes in the app &rarr;</a>
    </section>`;
    }
  }

  // ── Fuel Cost Insights ──
  let fuelCosts = null;
  try {
    fuelCosts = medianPrice ? computeFuelCosts(medianPrice, stateCode, countyName) : null;
  } catch (e) {
    // Non-fatal: skip insights if fuel data unavailable
  }

  // ── Dynamic meta description ──
  let metaDescription;
  if (showPriceBanner && medianPrice) {
    if (priceSignal === 'down') {
      metaDescription = `Heating oil in ${countyName} County is down ${absChange.toFixed(0)}% — prices from $${minPrice.toFixed(2)} to $${maxPrice.toFixed(2)}/gal from ${supplierCount} suppliers.`;
    } else {
      metaDescription = `Heating oil prices in ${countyName} County trending up ${absChange.toFixed(0)}%. Compare ${supplierCount} suppliers from $${minPrice.toFixed(2)}/gal.`;
    }
  } else if (medianPrice) {
    metaDescription = `Current heating oil price in ${countyName} County, ${stateName}: $${medianPrice.toFixed(2)}/gal median from ${supplierCount} suppliers across ${zipCount} ZIP codes. Updated ${lastUpdate}.`;
  } else {
    metaDescription = `Heating oil prices for ${countyName} County, ${stateName}.`;
  }

  const assetPath = '../../../';
  const cssVersion = getCssVersion();

  // ── Best price / savings computation ──
  const allPricedSuppliers = countySuppliers.filter(s => s.hasPrice);
  const bestPrice = allPricedSuppliers.length > 0 ? allPricedSuppliers[0].price : null;
  const highestPrice = allPricedSuppliers.length > 0 ? allPricedSuppliers[allPricedSuppliers.length - 1].price : null;
  const bestDeliveryCost = bestPrice ? Math.round(bestPrice * 150) : null;
  const savingsVsMedian = (bestPrice && medianPrice) ? Math.max(0, Math.round((medianPrice - bestPrice) * 150)) : 0;
  const nearBestCount = bestPrice ? allPricedSuppliers.filter(s => s.price - bestPrice <= 0.05).length : 0;

  // ── Supplier ZIP map for client-side filter ──
  const supplierZipMap = {};
  if (countyZips.length > 0) {
    const czSet = new Set(countyZips);
    for (const s of countySuppliers) {
      const szips = s.postal_codes_served || [];
      const overlap = szips.filter(z => czSet.has(z));
      if (overlap.length > 0) supplierZipMap[s.id] = overlap;
    }
  }

  // ── Nearby counties ──
  const nearbyCounties = getNearbyCounties(countyName, stateCode, allCountyStats);

  // ── Legacy layout (old section order) ──
  if (legacyLayout) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-HCNTVGNVJ9"></script>
  <script src="${assetPath}js/analytics.js"></script>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Heating Oil Prices in ${escapeHtml(countyName)} County, ${stateCode} - ${dateStr} | HomeHeat</title>
  <meta name="description" content="${metaDescription}">
  <link rel="canonical" href="https://www.gethomeheat.com/prices/county/${stateCode.toLowerCase()}/${slug}">

  <!-- OpenGraph -->
  <meta property="og:title" content="Heating Oil Prices in ${escapeHtml(countyName)} County, ${stateCode} - ${dateStr}">
  <meta property="og:description" content="${medianPrice ? `$${medianPrice.toFixed(2)}/gal median. Compare ${supplierCount} suppliers.` : 'Compare local heating oil prices.'}">
  <meta property="og:url" content="https://www.gethomeheat.com/prices/county/${stateCode.toLowerCase()}/${slug}">
  <meta property="og:type" content="website">

  <meta name="color-scheme" content="light only">
  <link rel="stylesheet" href="${assetPath}style.min.css?v=${cssVersion}">
  <link rel="stylesheet" href="../county-elite.css?v=${countyCssHash}">
  <link rel="icon" type="image/png" sizes="32x32" href="${assetPath}favicon-32.png">
  <meta name="apple-itunes-app" content="app-id=6747320571">

  <!-- Chart.js -->
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>

  <!-- Schema.org Structured Data -->
  <script type="application/ld+json">${JSON.stringify(breadcrumbSchema)}</script>
  <script type="application/ld+json">${JSON.stringify(datasetSchema)}</script>
  <script type="application/ld+json">${JSON.stringify(faqSchema)}</script>
  ${itemListSchema ? `<script type="application/ld+json">${JSON.stringify(itemListSchema)}</script>` : ''}
</head>
<body data-page-type="county_elite" data-price-signal="${priceSignal}">
  ${getNavHTML(3, '/prices')}

  <main class="county-elite-page">
    <!-- Breadcrumb -->
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <a href="/">Home</a> › <a href="/prices">Prices</a> › <a href="/prices/${stateCode.toLowerCase()}">${stateName}</a> › <span>${escapeHtml(countyName)} County</span>
    </nav>

    <header class="page-header">
      <h1>Heating Oil Prices in ${escapeHtml(countyName)} County, ${stateCode}</h1>
      <p class="county-meta">${displaySupplierCount} suppliers · ${zipPrefixes.length} ZIP areas · Updated ${lastUpdate}</p>
      ${zipPrefixes.length > 0 ? `<p class="geographic-context">Covering ${formatZipPrefixRange(zipPrefixes)} across ${zipCount} ZIP codes</p>` : ''}
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
      ${stateComparison ? `<p class="state-comparison ${stateComparison.class}">${stateComparison.text}</p>` : ''}
      <p class="price-trust-line">Prices updated daily from verified local suppliers.</p>
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

    ${priceBannerHTML}

    <!-- 6-Week Price History Chart -->
    ${history.length > 1 ? `
    <section class="chart-section">
      <h2>6-Week Price Trend</h2>
      <div class="chart-container">
        <canvas id="priceChart"></canvas>
      </div>
      <p class="chart-caption">County aggregate from ${supplierCount} suppliers ·
        <a href="/price-trend/${stateCode.toLowerCase()}/${slugify(countyName)}">See full trend analysis →</a>
      </p>
    </section>

    <script>
      document.addEventListener('DOMContentLoaded', function() {
        const ctx = document.getElementById('priceChart').getContext('2d');
        const chartMin = ${chartYMin};
        const chartMax = ${chartYMax};
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
                min: chartMin,
                max: chartMax,
                beginAtZero: false,
                ticks: {
                  stepSize: 0.10,
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

    <!-- App Hook 2: Price alerts -->
    <p class="app-hook">
      <a href="https://apps.apple.com/us/app/homeheat/id6747320571?utm_source=web_county&utm_medium=hook_alerts&utm_campaign=county_elite_${stateCode.toLowerCase()}_${slug}" class="hook-link ios-only">Track your tank and compare prices in the free app →</a>
      <a href="/prices" class="hook-link android-only" style="display:none" onclick="if(window.showPwaInstallBanner){window.showPwaInstallBanner();event.preventDefault()}">Save HomeHeat for quick access →</a>
    </p>
    ` : ''}

    ${medianPrice ? `
    <section class="county-alert-section" id="alerts">
      <h3>Get Email Alerts When Heating Oil Prices Drop</h3>
      <p class="county-alert-hook">Prices change daily. Save $40-$120 per delivery by timing it right.</p>
      <div class="price-alert-card" data-zip="${countyZips.length > 0 ? countyZips[Math.floor(countyZips.length / 2)] : ''}" data-price="${minPrice ? minPrice.toFixed(2) : ''}"></div>
      <p class="county-alert-trust">We check prices daily. No newsletters. Only price drops.</p>
    </section>
    ` : ''}

    ${fuelCosts ? `
    <!-- Heating Cost Insights -->
    <section class="insight-section">
      <div class="insight-grid">
        <a href="/average-heating-bill/${stateCode.toLowerCase()}/${slug}" class="insight-card" data-track="insight-bill" data-referrer="insights_block">
          <div class="insight-value">$${fuelCosts.fuels['heating-oil'] ? fuelCosts.fuels['heating-oil'].monthlyCost : '—'}/mo</div>
          <div class="insight-label">Monthly Heating Bill</div>
          <div class="insight-detail">2,000 sq ft home · Oil heat</div>
        </a>
        <a href="/heating-cost/${stateCode.toLowerCase()}/${slug}" class="insight-card" data-track="insight-fuel" data-referrer="insights_block">
          ${fuelCosts.cheapest === 'heating-oil' ?
            `<div class="insight-value insight-value-good">Oil is cheapest</div>
             <div class="insight-label">Fuel Comparison</div>
             <div class="insight-detail">See full comparison &rarr;</div>` :
            `<div class="insight-value">${fuelCosts.fuels[fuelCosts.cheapest] ? '$' + fuelCosts.fuels[fuelCosts.cheapest].annualCost.toLocaleString() + '/yr' : '—'}</div>
             <div class="insight-label">${{'natural-gas':'Natural Gas','heat-pump':'Heat Pump','electric-baseboard':'Electric'}[fuelCosts.cheapest] || fuelCosts.cheapest}</div>
             <div class="insight-detail">${fuelCosts.fuels['heating-oil'] && fuelCosts.fuels[fuelCosts.cheapest] ? '$' + (fuelCosts.fuels['heating-oil'].annualCost - fuelCosts.fuels[fuelCosts.cheapest].annualCost).toLocaleString() + ' less than oil' : 'See comparison'}</div>`
          }
        </a>
        <a href="/price-trend/${stateCode.toLowerCase()}/${slug}" class="insight-card" data-track="insight-trend" data-referrer="insights_block">
          <div class="insight-value">${percentChange6w !== null ? (percentChange6w > 0 ? '↑' : percentChange6w < 0 ? '↓' : '→') + ' ' + Math.abs(percentChange6w).toFixed(0) + '%' : '—'}</div>
          <div class="insight-label">Price Trend</div>
          <div class="insight-detail">${percentChange6w !== null ? 'in ' + (weeksAvailable >= 6 ? '6' : weeksAvailable) + ' weeks' : 'View trend analysis'}</div>
        </a>
      </div>
    </section>
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

    <!-- Supplier Table -->
    ${countySuppliers.length > 0 ? `
    <section class="supplier-table-section" id="suppliers">
      <h2>Heating Oil Suppliers Serving ${escapeHtml(countyName)} County</h2>
      <p class="supplier-table-intro">Below are heating oil suppliers currently serving ${escapeHtml(countyName)} County, ${stateName} based on ZIP code coverage.</p>
        <table class="supplier-table">
          <thead>
            <tr>
              <th>Supplier</th>
              <th>Location</th>
              <th>Price/Gal</th>
              <th>Phone</th>
              <th>Website</th>
            </tr>
          </thead>
          <tbody>
${countySuppliers.map(s => {
  const hasValidWebsite = s.website && s.website.startsWith('https://');
  return `            <tr>
              <td class="supplier-name">${s.slug ? `<a href="/supplier/${s.slug}" class="supplier-profile-link">${escapeHtml(s.name)}</a>` : escapeHtml(s.name)}</td>
              <td class="supplier-city">${escapeHtml(s.city || '')}</td>
              <td class="supplier-price">${s.hasPrice ? `$${s.price.toFixed(2)}` : '<span class="call-for-price">Call</span>'}</td>
              <td class="supplier-phone">${s.phone ? `<a href="tel:${s.phone}" class="phone-link" data-supplier-id="${s.id}" data-supplier-name="${escapeHtml(s.name)}" data-action="call" data-track="phone-click">${escapeHtml(s.phone)}</a>` : '\u2014'}</td>
              <td class="supplier-website">${hasValidWebsite ? `<a href="${escapeHtml(s.website)}" target="_blank" rel="noopener noreferrer" class="website-link" data-supplier-id="${s.id}" data-supplier-name="${escapeHtml(s.name)}" data-action="website" data-track="website-click">Website</a>` : ''}</td>
            </tr>`;
}).join('\n')}
          </tbody>
        </table>
      <p class="supplier-directory-link">
        <a href="/prices/${stateCode.toLowerCase()}/${slugify(countyName)}-county">View full ${escapeHtml(countyName)} County supplier directory &rarr;</a>
      </p>
    </section>
    ` : `
    <section class="supplier-table-section supplier-empty-state">
      <h2>Heating Oil Suppliers Serving ${escapeHtml(countyName)} County</h2>
      <p>No suppliers currently reporting prices in ${escapeHtml(countyName)} County. <a href="/prices">Search heating oil prices by ZIP code</a> to find suppliers delivering to your area.</p>
    </section>
    `}

    <!-- Social Proof (gated by threshold, explicit iPhone) -->
    ${showUserCount ? `
    <p class="social-proof">
      ${userCount} homeowners in ${escapeHtml(countyName)} County track deliveries with <a href="https://apps.apple.com/us/app/homeheat/id6747320571?utm_source=web_county&utm_medium=social_proof&utm_campaign=county_elite_${stateCode.toLowerCase()}_${slug}">HomeHeat for iPhone</a>.
    </p>
    ` : ''}

    ${medianPrice ? `
    <section class="county-seo-text">
      <p>Heating oil prices in ${countyName} County, ${stateName} typically range from
      $${minPrice.toFixed(2)} to $${maxPrice.toFixed(2)} per gallon depending on season,
      delivery size, and supplier competition.${stateComparison ? ` ${stateComparison.text}.` : ''}</p>

      <p>HomeHeat tracks ${displaySupplierCount} heating oil suppliers across
      ${zipCount} ZIP codes in ${countyName} County.
      Prices are updated daily using supplier reports and verified market data.</p>

      <p>Homeowners in ${countyName} County typically use between 600 and 1,000 gallons
      of heating oil per year depending on home size and insulation. Monitoring price
      trends can help households save $100-$300 annually by timing deliveries during
      lower price periods.</p>

      <p>Heating oil prices across ${stateName} can fluctuate significantly throughout
      the winter heating season. Cold weather spikes, regional supply changes, and
      delivery demand often influence short-term pricing trends. Many residents
      searching for heating oil prices today in ${countyName} County use these
      daily updates to compare local supplier rates before placing their next
      delivery order.</p>
    </section>
    ` : ''}

    <!-- FAQ Section -->
    <section class="faq-section">
      <h2>Frequently Asked Questions</h2>
      <div class="faq-list">
        <details class="faq-item">
          <summary>What is the current heating oil price in ${escapeHtml(countyName)} County?</summary>
          <p>${medianPrice
            ? `The current median heating oil price in ${countyName} County, ${stateName} is <strong>$${medianPrice.toFixed(2)} per gallon</strong>, based on ${supplierCount} tracked suppliers. Prices range from $${minPrice.toFixed(2)} to $${maxPrice.toFixed(2)}/gal.`
            : `Price data is being collected for ${countyName} County. Check back soon for updates.`}</p>
        </details>
        <details class="faq-item">
          <summary>Why are ${escapeHtml(countyName)} County prices ${medianPrice > 3.5 ? 'higher than average' : 'competitive'}?</summary>
          <p>Heating oil prices in ${countyName} County are influenced by proximity to terminals, local supplier competition, and seasonal demand. HomeHeat currently tracks ${displaySupplierCount} suppliers in ${countyName} County, giving homeowners options to compare prices and find competitive rates.</p>
        </details>
        <details class="faq-item">
          <summary>How many heating oil suppliers operate in ${escapeHtml(countyName)} County?</summary>
          <p>HomeHeat tracks <strong>${displaySupplierCount} heating oil suppliers</strong> with published pricing in ${countyName} County, covering ${zipCount} ZIP codes.</p>
        </details>
      </div>
    </section>

    <!-- App CTA -->
    <section class="app-cta">
      <h3>Track Your Oil Usage</h3>
      <p>Get personalized run-out predictions and price alerts for ${escapeHtml(countyName)} County.</p>
      <a href="https://apps.apple.com/us/app/homeheat/id6747320571?utm_source=web_county&utm_medium=website&utm_campaign=county_elite_${stateCode.toLowerCase()}_${slug}" class="cta-button hide-on-android">Download Free for iPhone &rarr;</a>
      <a href="/prices" class="cta-button android-only" style="display:none" onclick="if(window.showPwaInstallBanner){window.showPwaInstallBanner();event.preventDefault()}">Add to Home Screen &rarr;</a>
      <p class="cta-micro hide-on-android">Free app. No hardware. No ads.</p>
      <p class="cta-micro android-only" style="display:none">Works like an app — no download needed.</p>
    </section>

    <!-- Cross-sell: Heating Cost Comparison -->
    <section style="background: var(--primary-orange-light); padding: 1.25rem; border-radius: 8px; margin: 2rem 0;">
      <strong>What does heating cost in ${escapeHtml(countyName)} County?</strong>
      <a href="/heating-cost/${stateCode.toLowerCase()}/${slug}" style="font-weight: 600;">Heating costs</a> |
      <a href="/average-heating-bill/${stateCode.toLowerCase()}/${slug}" style="font-weight: 600;">Average bill</a> |
      <a href="/price-trend/${stateCode.toLowerCase()}/${slug}" style="font-weight: 600;">Price trends</a>
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
  <script src="${assetPath}js/price-alerts.js?v=${getFileHash('js/price-alerts.js')}"></script>
  <script src="${assetPath}js/platform-detection.js?v=${getFileHash('js/platform-detection.js')}"></script>
  <script src="${assetPath}js/widgets.js"></script>
</body>
</html>`;
  } // end legacyLayout

  // ── New action-first layout ──
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-HCNTVGNVJ9"></script>
  <script src="${assetPath}js/analytics.js"></script>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Heating Oil Prices in ${escapeHtml(countyName)} County, ${stateCode} - ${dateStr} | HomeHeat</title>
  <meta name="description" content="${metaDescription}">
  <link rel="canonical" href="https://www.gethomeheat.com/prices/county/${stateCode.toLowerCase()}/${slug}">

  <!-- OpenGraph -->
  <meta property="og:title" content="Heating Oil Prices in ${escapeHtml(countyName)} County, ${stateCode} - ${dateStr}">
  <meta property="og:description" content="${medianPrice ? `$${medianPrice.toFixed(2)}/gal median. Compare ${supplierCount} suppliers.` : 'Compare local heating oil prices.'}">
  <meta property="og:url" content="https://www.gethomeheat.com/prices/county/${stateCode.toLowerCase()}/${slug}">
  <meta property="og:type" content="website">

  <meta name="color-scheme" content="light only">
  <link rel="stylesheet" href="${assetPath}style.min.css?v=${cssVersion}">
  <link rel="stylesheet" href="../county-elite.css?v=${countyCssHash}">
  <link rel="icon" type="image/png" sizes="32x32" href="${assetPath}favicon-32.png">
  <meta name="apple-itunes-app" content="app-id=6747320571">

  <!-- Chart.js -->
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>

  <!-- Schema.org Structured Data -->
  <script type="application/ld+json">${JSON.stringify(breadcrumbSchema)}</script>
  <script type="application/ld+json">${JSON.stringify(datasetSchema)}</script>
  <script type="application/ld+json">${JSON.stringify(faqSchema)}</script>
  ${itemListSchema ? `<script type="application/ld+json">${JSON.stringify(itemListSchema)}</script>` : ''}
</head>
<body data-page-type="county_elite" data-price-signal="${priceSignal}">
  ${getNavHTML(3, '/prices')}

  <main class="county-elite-page" data-county="${escapeHtml(countyName)}">
    <!-- Breadcrumb -->
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <a href="/">Home</a> › <a href="/prices">Prices</a> › <a href="/prices/${stateCode.toLowerCase()}">${stateName}</a> › <span>${escapeHtml(countyName)} County</span>
    </nav>

    <header class="page-header">
      <h1>Heating Oil Prices in ${escapeHtml(countyName)} County, ${stateCode}</h1>
      ${medianPrice ? `
      <div class="price-summary-bar">
        <p class="summary-line-1">
          <span class="summary-price">$${medianPrice.toFixed(2)}</span>/gal median <span class="summary-sep">&middot;</span> ${displaySupplierCount} suppliers
        </p>
        ${bestPrice ? `<p class="summary-line-2">
          Lowest price <strong>$${bestPrice.toFixed(2)}</strong>${savingsVsMedian > 0 && allPricedSuppliers.length > 1 ? ` <span class="summary-sep">&middot;</span> <span class="savings-badge">Save ~$${savingsVsMedian} on a typical delivery</span>` : ''}${nearBestCount > 1 ? ` <span class="summary-sep">&middot;</span> <span class="near-best">${nearBestCount} suppliers within $0.05</span>` : ''}
        </p>` : ''}
        ${bestPrice ? `<p class="call-prompt"><a href="#suppliers">Call the lowest-price supplier now to order delivery &rarr;</a></p>` : ''}
      </div>
      ${stateComparison ? `<p class="state-comparison ${stateComparison.class}">${stateComparison.text}</p>` : ''}
      ` : `<p class="county-meta">Price data is being collected. Check back soon.</p>`}
      <p class="geographic-context">${zipPrefixes.length > 0 ? `Covering ${formatZipPrefixRange(zipPrefixes)} across ${zipCount} ZIP codes · ` : ''}Updated ${lastUpdate}</p>
    </header>

    ${countyZips.length > 0 ? `
    <!-- ZIP Filter -->
    <section class="zip-filter-section" id="zip-filter">
      <label class="zip-filter-label" for="zip-filter-input">Enter your ZIP to see who delivers to you</label>
      <div class="zip-filter-row">
        <input id="zip-filter-input" class="zip-filter-input" placeholder="${countyZips[Math.floor(countyZips.length / 2)] || '10601'}" maxlength="5" inputmode="numeric" pattern="[0-9]*">
        <button id="zip-filter-btn" class="zip-filter-btn">Find Suppliers</button>
        <button id="zip-filter-clear" class="zip-filter-clear" hidden>Clear</button>
      </div>
      <p id="zip-filter-result" class="zip-filter-result" hidden></p>
    </section>
    <script>window.__supplierZips=${JSON.stringify(supplierZipMap)};window.__countyName="${escapeHtml(countyName)}";</script>
    ` : ''}

    <!-- Supplier Table -->
    ${countySuppliers.length > 0 ? `
    <section class="supplier-table-section" id="suppliers">
      <h2>Heating Oil Suppliers Serving ${escapeHtml(countyName)} County</h2>
        <table class="supplier-table">
          <thead>
            <tr>
              <th>Supplier</th>
              <th>Location</th>
              <th>Price/Gal</th>
              <th>Call to Order</th>
              <th>Website</th>
            </tr>
          </thead>
          <tbody>
${countySuppliers.map(s => {
  const hasValidWebsite = s.website && s.website.startsWith('https://');
  const freshness = computeFreshness(s.scrapedAt);
  const sDeliveryCost = s.hasPrice ? Math.round(s.price * (s.minGallons || 150)) : null;
  const sMinGal = s.minGallons || 150;
  const isBestPrice = s.hasPrice && bestPrice && s.price === bestPrice;
  const deltaPerDelivery = (s.hasPrice && bestPrice) ? Math.round((s.price - bestPrice) * (sMinGal)) : null;
  return `            <tr${isBestPrice ? ' class="best-price-row"' : ''} data-supplier-id="${s.id}">
              <td class="supplier-name">
                ${s.slug ? `<a href="/supplier/${s.slug}" class="supplier-profile-link">${escapeHtml(s.name)}</a>` : escapeHtml(s.name)}
                ${isBestPrice ? '<span class="best-price-badge">Lowest price</span>' : ''}
                ${freshness.text ? `<span class="supplier-updated"><span class="freshness-dot ${freshness.dotClass}"></span> ${freshness.text}</span>` : ''}
              </td>
              <td class="supplier-city">${escapeHtml(s.city || '')}</td>
              <td class="supplier-price">${s.hasPrice ? `<span class="price-amount">$${s.price.toFixed(2)}</span><span class="price-delivery">~$${sDeliveryCost} for ${sMinGal} gal</span>${isBestPrice ? '<span class="price-delta best">\u2713 Lowest price</span>' : deltaPerDelivery > 0 ? `<span class="price-delta">\u2248$${deltaPerDelivery} more per delivery</span>` : ''}` : '<span class="call-for-price">Call</span>'}</td>
              <td class="supplier-phone">${s.phone ? `<a href="tel:${s.phone}" class="supplier-call-btn" data-supplier-id="${s.id}" data-supplier-name="${escapeHtml(s.name)}" data-action="call" data-track="phone-click">Call · ${escapeHtml(s.phone)}</a>` : '\u2014'}</td>
              <td class="supplier-website">${hasValidWebsite ? `<a href="${escapeHtml(s.website)}" target="_blank" rel="noopener noreferrer" class="website-link" data-supplier-id="${s.id}" data-supplier-name="${escapeHtml(s.name)}" data-action="website" data-track="website-click">Website</a>` : ''}</td>
            </tr>`;
}).join('\n')}
          </tbody>
        </table>
      <p class="supplier-trust-line">Prices collected from supplier websites and verified daily. Always confirm price and delivery minimum when ordering.</p>
      <details class="how-to-order">
        <summary>New to ordering heating oil?</summary>
        <ol>
          <li>Call the supplier and confirm the price and delivery minimum</li>
          <li>Provide your address and tank location</li>
          <li>Delivery is typically within 24–72 hours</li>
        </ol>
      </details>
      <p class="supplier-claim-link">
        Are you a supplier in ${escapeHtml(countyName)} County? <a href="/for-suppliers">Claim your free listing &rarr;</a>
      </p>
      <p class="supplier-directory-link">
        <a href="/prices/${stateCode.toLowerCase()}/${slugify(countyName)}-county">View full ${escapeHtml(countyName)} County supplier directory &rarr;</a>
      </p>
    </section>
    ` : `
    <section class="supplier-table-section supplier-empty-state">
      <h2>Heating Oil Suppliers Serving ${escapeHtml(countyName)} County</h2>
      <p>No suppliers currently reporting prices in ${escapeHtml(countyName)} County. <a href="/prices">Search heating oil prices by ZIP code</a> to find suppliers delivering to your area.</p>
    </section>
    `}

    ${nearbyCounties.length > 0 ? `
    <div class="nearby-counties">
      <strong>Heating oil prices nearby:</strong>
      ${nearbyCounties.map(nc => {
        const ncSlug = slugify(nc.county_name);
        const ncMedian = nc.median_price ? parseFloat(nc.median_price) : null;
        return `<a href="/prices/county/${nc.state_code.toLowerCase()}/${ncSlug}">${escapeHtml(nc.county_name)} County${nc.state_code !== stateCode ? ', ' + nc.state_code : ''}${ncMedian ? ' – $' + ncMedian.toFixed(2) + '/gal' : ''}</a>`;
      }).join(' · ')}
    </div>
    ` : ''}

    ${priceBannerHTML}

    <!-- App CTA -->
    <section class="app-cta">
      <h3>Never Run Out of Oil</h3>
      <p>Track your tank level and get price alerts for ${escapeHtml(countyName)} County.</p>
      <a href="https://apps.apple.com/us/app/homeheat/id6747320571?utm_source=web_county&utm_medium=website&utm_campaign=county_elite_${stateCode.toLowerCase()}_${slug}" class="cta-button hide-on-android">Download Free for iPhone &rarr;</a>
      <a href="/prices" class="cta-button android-only" style="display:none" onclick="if(window.showPwaInstallBanner){window.showPwaInstallBanner();event.preventDefault()}">Add to Home Screen &rarr;</a>
      <p class="cta-micro hide-on-android">Free app. No hardware. No ads.</p>
      <p class="cta-micro android-only" style="display:none">Works like an app — no download needed.</p>
    </section>

    <!-- 6-Week Price History Chart -->
    ${history.length > 1 ? `
    <section class="chart-section">
      <h2>6-Week Price Trend</h2>
      <div class="chart-container">
        <canvas id="priceChart"></canvas>
      </div>
      <p class="chart-caption">County aggregate from ${supplierCount} suppliers ·
        <a href="/price-trend/${stateCode.toLowerCase()}/${slugify(countyName)}">See full trend analysis →</a>
      </p>
    </section>

    <script>
      document.addEventListener('DOMContentLoaded', function() {
        var ctx = document.getElementById('priceChart').getContext('2d');
        var chartMin = ${chartYMin};
        var chartMax = ${chartYMax};
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
                min: chartMin,
                max: chartMax,
                beginAtZero: false,
                ticks: {
                  stepSize: 0.10,
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

    ${fuelCosts ? `
    <!-- Heating Cost Insights -->
    <section class="insight-section">
      <div class="insight-grid">
        <a href="/average-heating-bill/${stateCode.toLowerCase()}/${slug}" class="insight-card" data-track="insight-bill" data-referrer="insights_block">
          <div class="insight-value">$${fuelCosts.fuels['heating-oil'] ? fuelCosts.fuels['heating-oil'].monthlyCost : '—'}/mo</div>
          <div class="insight-label">Monthly Heating Bill</div>
          <div class="insight-detail">2,000 sq ft home · Oil heat</div>
        </a>
        <a href="/heating-cost/${stateCode.toLowerCase()}/${slug}" class="insight-card" data-track="insight-fuel" data-referrer="insights_block">
          ${fuelCosts.cheapest === 'heating-oil' ?
            `<div class="insight-value insight-value-good">Oil is cheapest</div>
             <div class="insight-label">Fuel Comparison</div>
             <div class="insight-detail">See full comparison &rarr;</div>` :
            `<div class="insight-value">${fuelCosts.fuels[fuelCosts.cheapest] ? '$' + fuelCosts.fuels[fuelCosts.cheapest].annualCost.toLocaleString() + '/yr' : '—'}</div>
             <div class="insight-label">${{'natural-gas':'Natural Gas','heat-pump':'Heat Pump','electric-baseboard':'Electric'}[fuelCosts.cheapest] || fuelCosts.cheapest}</div>
             <div class="insight-detail">${fuelCosts.fuels['heating-oil'] && fuelCosts.fuels[fuelCosts.cheapest] ? '$' + (fuelCosts.fuels['heating-oil'].annualCost - fuelCosts.fuels[fuelCosts.cheapest].annualCost).toLocaleString() + ' less than oil' : 'See comparison'}</div>`
          }
        </a>
        <a href="/price-trend/${stateCode.toLowerCase()}/${slug}" class="insight-card" data-track="insight-trend" data-referrer="insights_block">
          <div class="insight-value">${percentChange6w !== null ? (percentChange6w > 0 ? '↑' : percentChange6w < 0 ? '↓' : '→') + ' ' + Math.abs(percentChange6w).toFixed(0) + '%' : '—'}</div>
          <div class="insight-label">Price Trend</div>
          <div class="insight-detail">${percentChange6w !== null ? 'in ' + (weeksAvailable >= 6 ? '6' : weeksAvailable) + ' weeks' : 'View trend analysis'}</div>
        </a>
      </div>
    </section>
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

    ${medianPrice ? `
    <section class="county-alert-section" id="alerts">
      <h3>Get Email Alerts When Heating Oil Prices Drop</h3>
      <p class="county-alert-hook">Prices change daily. Save $40-$120 per delivery by timing it right.</p>
      <div class="price-alert-card" data-zip="${countyZips.length > 0 ? countyZips[Math.floor(countyZips.length / 2)] : ''}" data-price="${minPrice ? minPrice.toFixed(2) : ''}"></div>
      <p class="county-alert-trust">We check prices daily. No newsletters. Only price drops.</p>
    </section>
    ` : ''}

    ${medianPrice ? `
    <section class="county-seo-text">
      <p>Heating oil prices in ${countyName} County, ${stateName} typically range from
      $${minPrice.toFixed(2)} to $${maxPrice.toFixed(2)} per gallon depending on season,
      delivery size, and supplier competition.${stateComparison ? ` ${stateComparison.text}.` : ''}</p>

      <p>HomeHeat tracks ${displaySupplierCount} heating oil suppliers across
      ${zipCount} ZIP codes in ${countyName} County.
      Prices are updated daily using supplier reports and verified market data.</p>

      <p>Homeowners in ${countyName} County typically use between 600 and 1,000 gallons
      of heating oil per year depending on home size and insulation. Monitoring price
      trends can help households save $100-$300 annually by timing deliveries during
      lower price periods.</p>

      <p>Heating oil prices across ${stateName} can fluctuate significantly throughout
      the winter heating season. Cold weather spikes, regional supply changes, and
      delivery demand often influence short-term pricing trends. Many residents
      searching for heating oil prices today in ${countyName} County use these
      daily updates to compare local supplier rates before placing their next
      delivery order.</p>
    </section>
    ` : ''}

    <!-- FAQ Section -->
    <section class="faq-section">
      <h2>Frequently Asked Questions</h2>
      <div class="faq-list">
        <details class="faq-item">
          <summary>What is the current heating oil price in ${escapeHtml(countyName)} County?</summary>
          <p>${medianPrice
            ? `The current median heating oil price in ${countyName} County, ${stateName} is <strong>$${medianPrice.toFixed(2)} per gallon</strong>, based on ${supplierCount} tracked suppliers. Prices range from $${minPrice.toFixed(2)} to $${maxPrice.toFixed(2)}/gal.`
            : `Price data is being collected for ${countyName} County. Check back soon for updates.`}</p>
        </details>
        <details class="faq-item">
          <summary>Why are ${escapeHtml(countyName)} County prices ${medianPrice > 3.5 ? 'higher than average' : 'competitive'}?</summary>
          <p>Heating oil prices in ${countyName} County are influenced by proximity to terminals, local supplier competition, and seasonal demand. HomeHeat currently tracks ${displaySupplierCount} suppliers in ${countyName} County, giving homeowners options to compare prices and find competitive rates.</p>
        </details>
        <details class="faq-item">
          <summary>How many heating oil suppliers operate in ${escapeHtml(countyName)} County?</summary>
          <p>HomeHeat tracks <strong>${displaySupplierCount} heating oil suppliers</strong> with published pricing in ${countyName} County, covering ${zipCount} ZIP codes.</p>
        </details>
      </div>
    </section>

    <!-- Cross-sell: Heating Cost Comparison -->
    <section style="background: var(--primary-orange-light); padding: 1.25rem; border-radius: 8px; margin: 2rem 0;">
      <strong>What does heating cost in ${escapeHtml(countyName)} County?</strong>
      <a href="/heating-cost/${stateCode.toLowerCase()}/${slug}" style="font-weight: 600;">Heating costs</a> |
      <a href="/average-heating-bill/${stateCode.toLowerCase()}/${slug}" style="font-weight: 600;">Average bill</a> |
      <a href="/price-trend/${stateCode.toLowerCase()}/${slug}" style="font-weight: 600;">Price trends</a>
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
  <script src="${assetPath}js/price-alerts.js?v=${getFileHash('js/price-alerts.js')}"></script>
  <script src="${assetPath}js/platform-detection.js?v=${getFileHash('js/platform-detection.js')}"></script>
  <script src="${assetPath}js/widgets.js"></script>
  ${countyZips.length > 0 ? `<script src="${assetPath}js/county-zip-filter.js?v=${getFileHash('js/county-zip-filter.js')}"></script>` : ''}
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════

const _fileHashCache = {};
function getFileHash(relativePath) {
  if (_fileHashCache[relativePath]) return _fileHashCache[relativePath];
  const fullPath = path.join(WEBSITE_DIR, relativePath);
  if (fsSync.existsSync(fullPath)) {
    const content = fsSync.readFileSync(fullPath);
    _fileHashCache[relativePath] = crypto.createHash('md5').update(content).digest('hex').slice(0, 8);
  } else {
    _fileHashCache[relativePath] = Date.now().toString(36);
  }
  return _fileHashCache[relativePath];
}

function getCssVersion() {
  return getFileHash('style.min.css');
}

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

function formatZipPrefixRange(prefixes) {
  if (!prefixes || prefixes.length === 0) return '';

  // Sort prefixes numerically
  const sorted = [...prefixes].sort((a, b) => parseInt(a) - parseInt(b));

  if (sorted.length === 1) {
    return `${sorted[0]}xx`;
  } else if (sorted.length === 2) {
    return `${sorted[0]}xx and ${sorted[1]}xx`;
  } else if (sorted.length <= 4) {
    // List all: 070xx, 074xx, 078xx, 079xx
    return sorted.map(p => `${p}xx`).join(', ');
  } else {
    // Use range format for many prefixes: 100xx–108xx
    return `${sorted[0]}xx–${sorted[sorted.length - 1]}xx`;
  }
}

function getStateComparison(countyMedian, stateMedian, countyName, stateCode) {
  if (!countyMedian || !stateMedian) return null;

  const diff = ((countyMedian - stateMedian) / stateMedian) * 100;
  const absDiff = Math.abs(diff);

  // Only show if difference is meaningful (>= 1%)
  if (absDiff < 1) {
    return {
      text: `${countyName} County prices are in line with the ${stateCode} average`,
      class: 'comparison-neutral'
    };
  }

  if (diff > 0) {
    return {
      text: `${countyName} County is ${absDiff.toFixed(0)}% above the ${stateCode} average`,
      class: 'comparison-above'
    };
  } else {
    return {
      text: `${countyName} County is ${absDiff.toFixed(0)}% below the ${stateCode} average`,
      class: 'comparison-below'
    };
  }
}

/**
 * Get nearby counties for internal linking (SEO + navigation)
 * Uses cross-border adjacency for border counties, then same-state fallback
 */
function getNearbyCounties(countyName, stateCode, allCountyStats) {
  const CROSS_BORDER = {
    'Westchester:NY': ['Fairfield:CT', 'Putnam:NY', 'Rockland:NY'],
    'Fairfield:CT': ['Westchester:NY', 'New Haven:CT', 'Litchfield:CT'],
    'Putnam:NY': ['Westchester:NY', 'Dutchess:NY', 'Fairfield:CT'],
    'Rockland:NY': ['Orange:NY', 'Westchester:NY', 'Bergen:NJ'],
    'Orange:NY': ['Rockland:NY', 'Sullivan:NY', 'Dutchess:NY'],
    'Dutchess:NY': ['Putnam:NY', 'Orange:NY', 'Ulster:NY', 'Columbia:NY'],
    'Nassau:NY': ['Suffolk:NY'],
    'Suffolk:NY': ['Nassau:NY'],
    'Bergen:NJ': ['Rockland:NY', 'Passaic:NJ', 'Essex:NJ'],
    'New Haven:CT': ['Fairfield:CT', 'Litchfield:CT', 'Hartford:CT', 'Middlesex:CT'],
    'Hartford:CT': ['Litchfield:CT', 'New Haven:CT', 'Tolland:CT'],
    'Litchfield:CT': ['Fairfield:CT', 'New Haven:CT', 'Hartford:CT'],
    'New London:CT': ['Middlesex:CT', 'Windham:CT'],
    'Middlesex:CT': ['New Haven:CT', 'Hartford:CT', 'New London:CT'],
  };

  const key = `${countyName}:${stateCode}`;
  const adjacentKeys = CROSS_BORDER[key] || [];

  // Build set of available counties (those with generated pages)
  const available = new Map();
  for (const s of allCountyStats) {
    available.set(`${s.county_name}:${s.state_code}`, s);
  }

  const seen = new Set([key]);
  const neighbors = [];

  // First: explicit adjacents
  for (const adjKey of adjacentKeys) {
    if (available.has(adjKey) && !seen.has(adjKey)) {
      neighbors.push(available.get(adjKey));
      seen.add(adjKey);
    }
  }

  // Then: same-state counties
  for (const s of allCountyStats) {
    const sKey = `${s.county_name}:${s.state_code}`;
    if (s.state_code === stateCode && !seen.has(sKey)) {
      neighbors.push(s);
      seen.add(sKey);
    }
    if (neighbors.length >= 5) break;
  }

  return neighbors.slice(0, 5);
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
  max-width: 960px;
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
  margin-bottom: 0.5rem;
}

.geographic-context {
  color: #888;
  font-size: 0.85rem;
  margin-bottom: 0.75rem;
  font-style: italic;
}

/* Confidence Badges - Never show numeric */
.confidence-badge {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  border-radius: 1rem;
  font-size: 0.8rem;
  font-weight: 500;
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

/* State Comparison */
.state-comparison {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #ffe5d9;
  font-size: 0.9rem;
  text-align: center;
}

.comparison-above {
  color: #b45309;
}

.comparison-below {
  color: #047857;
}

.comparison-neutral {
  color: #666;
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

/* Price Status Banner */
.price-status-banner {
  padding: 1rem 1.25rem;
  border-radius: 8px;
  margin-bottom: 1.5rem;
  border-left: 4px solid;
}

.price-status-down {
  background: #dcfce7;
  border-left-color: #166534;
  color: #166534;
}

.price-status-up {
  background: #fef3c7;
  border-left-color: #92400e;
  color: #92400e;
}

.psb-status {
  font-size: 1.1rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
}

.psb-range {
  font-size: 0.9rem;
  margin-bottom: 0.25rem;
}

.psb-timestamp {
  font-size: 0.8rem;
  opacity: 0.75;
  margin-bottom: 0.75rem;
}

.psb-cta {
  display: inline-block;
  font-weight: 600;
  font-size: 0.9rem;
  text-decoration: none;
  color: inherit;
  border-bottom: 1px solid currentColor;
}

.psb-cta:hover {
  opacity: 0.8;
}

.psb-app-hook {
  display: block;
  margin-top: 0.5rem;
  font-size: 0.8rem;
  color: inherit;
  text-decoration: none;
  opacity: 0.7;
}

.psb-app-hook:hover {
  opacity: 1;
}

@media (max-width: 768px) {
  .psb-timestamp {
    display: none;
  }
}

/* Heating Cost Insights */
.insight-section {
  margin-bottom: 2rem;
}

.insight-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
}

.insight-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 1.25rem 1rem;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  text-decoration: none;
  color: inherit;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.insight-card:hover {
  border-color: #FF6B35;
  box-shadow: 0 2px 8px rgba(255,107,53,0.12);
}

.insight-value {
  font-size: 1.4rem;
  font-weight: 700;
  color: #333;
  margin-bottom: 0.25rem;
}

.insight-value-good {
  color: #166534;
}

.insight-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: #555;
  margin-bottom: 0.25rem;
}

.insight-detail {
  font-size: 0.75rem;
  color: #888;
}

@media (max-width: 600px) {
  .insight-grid {
    grid-template-columns: 1fr;
  }
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
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
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

/* App Hooks - Contextual, lightweight */
.app-hook {
  text-align: center;
  font-size: 0.9rem;
  color: #666;
  margin: 1rem 0 1.5rem;
}

.hook-link {
  color: #FF6B35;
  text-decoration: none;
  font-weight: 500;
}

.hook-link:hover {
  text-decoration: underline;
}

/* Social Proof */
.social-proof {
  text-align: center;
  font-size: 0.9rem;
  color: #555;
  margin: 1.5rem 0;
  padding: 0.75rem 1rem;
  background: #f8f9fa;
  border-radius: 8px;
}

.social-proof a {
  color: #FF6B35;
  text-decoration: none;
  font-weight: 500;
}

.social-proof a:hover {
  text-decoration: underline;
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

/* Price Alert Section */
.county-alert-section {
  max-width: 640px;
  margin: 1.5rem auto;
  padding: 24px 20px;
  background: linear-gradient(135deg, #fff5f0 0%, #fff 100%);
  border-top: 2px solid #ffe0d0;
  border-radius: 0 0 12px 12px;
  text-align: center;
  overflow: hidden;
}
.county-alert-section h3 {
  font-size: 16px;
  font-weight: 600;
  color: #1a1a1a;
  margin: 0 0 4px;
}
.county-alert-hook { font-size: 13px; color: #666; margin: 0 0 12px; }
.county-alert-trust { font-size: 12px; color: #999; margin: 8px 0 0; }

/* Alert form layout — self-contained, does not depend on style.css */
.county-alert-section .price-alert-card {
  max-width: 600px;
  margin: 1rem auto;
  padding: 1rem 1.25rem;
  background: #fff;
  border: 1px solid #E5D8D0;
  border-radius: 12px;
  text-align: center;
}
.county-alert-section .price-alert-inner {
  font-size: 0.9rem;
  color: #1a1a1a;
}
.county-alert-section .price-alert-title {
  font-weight: 600;
  font-size: 0.9rem;
  margin-bottom: 10px;
}
.county-alert-section .price-alert-form {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}
.county-alert-section .price-alert-fields {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
  align-items: flex-end;
}
.county-alert-section .price-alert-field {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}
.county-alert-section .price-alert-field-email {
  flex: 1;
  min-width: 180px;
}
.county-alert-section .price-alert-label {
  font-size: 0.7rem;
  font-weight: 600;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.county-alert-section .price-alert-input-wrap {
  display: flex;
  align-items: center;
  border: 1px solid #d0d5dd;
  border-radius: 8px;
  background: #fff;
  overflow: hidden;
  height: 40px;
  box-sizing: border-box;
}
.county-alert-section .price-alert-dollar {
  padding: 0 0 0 10px;
  color: #666;
  font-weight: 600;
  line-height: 40px;
}
.county-alert-section .price-alert-threshold {
  width: 80px;
  padding: 0 10px 0 4px;
  border: none;
  font-size: 0.9rem;
  outline: none;
  background: transparent;
  height: 100%;
  -moz-appearance: textfield;
}
.county-alert-section .price-alert-threshold::-webkit-inner-spin-button,
.county-alert-section .price-alert-threshold::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.county-alert-section .price-alert-email {
  padding: 0 12px;
  border: 1px solid #d0d5dd;
  border-radius: 8px;
  font-size: 0.9rem;
  width: 100%;
  min-width: 180px;
  height: 40px;
  box-sizing: border-box;
  outline: none;
}
.county-alert-section .price-alert-zip {
  padding: 0 12px;
  border: 1px solid #d0d5dd;
  border-radius: 8px;
  font-size: 0.9rem;
  width: 90px;
  height: 40px;
  box-sizing: border-box;
  outline: none;
}
.county-alert-section .price-alert-btn {
  padding: 0 24px;
  height: 40px;
  background: #2E7D32;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s;
}
.county-alert-section .price-alert-btn:hover {
  background: #1B5E20;
}
.county-alert-section .price-alert-btn:disabled {
  background: #a5d6a7;
  cursor: not-allowed;
}
.county-alert-section .price-alert-meta {
  font-size: 0.78rem;
  color: #888;
  margin-top: 6px;
}
.county-alert-section .price-alert-error {
  color: #dc2626;
  font-size: 0.82rem;
  margin-top: 8px;
}
.county-alert-section .price-alert-warning {
  color: #b45309;
  font-size: 0.8rem;
  margin-top: 6px;
  font-style: italic;
}
.county-alert-section .price-alert-check {
  color: #16a34a;
  font-weight: 700;
  font-size: 1.1rem;
}
.county-alert-section .price-alert-success {
  padding: 8px 0;
}
.county-alert-section .price-alert-email:focus,
.county-alert-section .price-alert-input-wrap:focus-within {
  border-color: #2E7D32;
  box-shadow: 0 0 0 2px rgba(46, 125, 50, 0.15);
}

/* SEO Text Section */
.county-seo-text {
  max-width: 720px;
  margin: 2rem auto;
  padding: 0 1rem;
  font-size: 0.95rem;
  line-height: 1.7;
  color: #444;
}
.county-seo-text p { margin-bottom: 1rem; }

/* Trust Line */
.price-trust-line {
  text-align: center;
  font-size: 0.82rem;
  color: #666;
  margin-top: 0.5rem;
}

/* Supplier Table Section */
.county-elite-page .supplier-table-section {
  margin: 2rem 0;
}

.county-elite-page .supplier-table-section h2 {
  font-size: 1.25rem;
  margin-bottom: 0.5rem;
  text-align: center;
}

.county-elite-page .supplier-table td {
  vertical-align: top;
}

.supplier-table-intro {
  text-align: center;
  font-size: 0.9rem;
  color: #666;
  margin-bottom: 1rem;
}

.supplier-directory-link {
  text-align: center;
  margin-top: 1rem;
  font-size: 0.9rem;
}

.supplier-directory-link a {
  color: #FF6B35;
  text-decoration: none;
  font-weight: 500;
}

.supplier-directory-link a:hover {
  text-decoration: underline;
}

.supplier-empty-state {
  text-align: center;
  padding: 2rem 1rem;
  background: #f8f9fa;
  border-radius: 12px;
}

.supplier-empty-state p {
  color: #666;
  font-size: 0.95rem;
  line-height: 1.6;
}

.supplier-empty-state a {
  color: #FF6B35;
  text-decoration: none;
  font-weight: 500;
}

.supplier-empty-state a:hover {
  text-decoration: underline;
}

/* Desktop Typography */
@media (min-width: 960px) {
  .page-header h1 { font-size: 2rem; }
  .price-value { font-size: 3.5rem; }
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

  /* Supplier table: override base display:block + overflow-x:auto from style.css */
  .county-elite-page .supplier-table {
    display: table !important;
    table-layout: fixed !important;
    width: 100% !important;
    overflow-x: visible !important;
  }

  .county-elite-page .supplier-table th,
  .county-elite-page .supplier-table td {
    padding: 0.6rem 0.3rem;
    font-size: 0.78rem;
  }

  /* Col 1: Supplier name (visible) */
  .county-elite-page .supplier-table th:nth-child(1),
  .county-elite-page .supplier-table td:nth-child(1) {
    width: 40% !important;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Col 2: Location — hidden by base style.css */
  /* Col 3: Price/Gal (visible) */
  .county-elite-page .supplier-table th:nth-child(3),
  .county-elite-page .supplier-table td:nth-child(3) {
    width: 22% !important;
    text-align: right;
    white-space: nowrap;
  }

  /* Col 4: Phone (visible) */
  .county-elite-page .supplier-table th:nth-child(4),
  .county-elite-page .supplier-table td:nth-child(4) {
    width: 38% !important;
    white-space: nowrap;
    font-size: 0.75rem;
  }

  /* Col 5: Website — hidden by base style.css */

  .snapshot-value {
    font-size: 1.25rem;
  }

  .zip-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .county-alert-section {
    margin: 1rem 0;
    border-radius: 0;
    padding: 1rem;
  }
  .county-alert-section .price-alert-fields {
    flex-direction: column;
    align-items: stretch;
    width: 100%;
  }
  .county-alert-section .price-alert-field {
    width: 100%;
  }
  .county-alert-section .price-alert-field-email {
    min-width: unset;
  }
  .county-alert-section .price-alert-email {
    min-width: unset;
  }
  .county-alert-section .price-alert-input-wrap,
  .county-alert-section .price-alert-email,
  .county-alert-section .price-alert-zip {
    width: 100%;
    box-sizing: border-box;
  }
  .county-alert-section .price-alert-btn {
    width: 100%;
  }
}

/* ═══════════════════════════════════════════════════════════ */
/* Action-First Layout — New Components                       */
/* ═══════════════════════════════════════════════════════════ */

/* Price Summary Bar */
.county-elite-page .price-summary-bar {
  text-align: center;
  margin: 0.5rem 0 0.75rem;
  padding: 0.6rem 1rem;
  background: #fafafa;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
}

.county-elite-page .summary-line-1 {
  margin: 0 0 0.2rem;
  font-size: 1rem;
  color: #333;
}

.county-elite-page .summary-price {
  font-size: 1.4rem;
  font-weight: 700;
  color: #FF6B35;
}

.county-elite-page .summary-line-2 {
  margin: 0;
  font-size: 0.9rem;
  color: #555;
}

.county-elite-page .summary-line-2 strong {
  color: #166534;
  font-weight: 700;
}

.county-elite-page .summary-sep {
  color: #ccc;
  margin: 0 0.2rem;
}

.county-elite-page .savings-badge {
  color: #166534;
  font-weight: 600;
}

.county-elite-page .near-best {
  color: #888;
  font-size: 0.85rem;
}

.county-elite-page .call-prompt {
  margin: 0.4rem 0 0;
  font-size: 0.88rem;
  font-weight: 600;
}

.county-elite-page .call-prompt a {
  color: #166534;
  text-decoration: none;
}

.county-elite-page .call-prompt a:hover {
  text-decoration: underline;
}

/* ZIP Filter */
.county-elite-page .zip-filter-section {
  max-width: 480px;
  margin: 0 auto 1.75rem;
  text-align: center;
}

.county-elite-page .zip-filter-label {
  display: block;
  font-size: 0.88rem;
  color: #555;
  margin-bottom: 0.5rem;
  font-weight: 500;
}

.county-elite-page .zip-filter-row {
  display: flex;
  gap: 0.5rem;
  justify-content: center;
  align-items: center;
}

.county-elite-page .zip-filter-input {
  width: 130px;
  padding: 0.65rem 0.75rem;
  border: 2px solid #e5e7eb;
  border-radius: 10px;
  font-size: 1.05rem;
  text-align: center;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.county-elite-page .zip-filter-input:focus {
  border-color: #FF6B35;
  box-shadow: 0 0 0 3px rgba(255,107,53,0.12);
}

.county-elite-page .zip-filter-btn {
  padding: 0.65rem 1.25rem;
  background: #FF6B35;
  color: #fff;
  border: none;
  border-radius: 10px;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s, transform 0.1s;
}

.county-elite-page .zip-filter-btn:hover {
  background: #e55a28;
}

.county-elite-page .zip-filter-btn:active {
  transform: scale(0.98);
}

.county-elite-page .zip-filter-clear {
  padding: 0.65rem 0.75rem;
  background: #f3f4f6;
  color: #666;
  border: 1px solid #d0d5dd;
  border-radius: 10px;
  font-size: 0.85rem;
  cursor: pointer;
  transition: background 0.15s;
}

.county-elite-page .zip-filter-clear:hover {
  background: #e5e7eb;
}

.county-elite-page .zip-filter-result {
  margin-top: 0.6rem;
  font-size: 0.9rem;
  color: #333;
  font-weight: 500;
}

.county-elite-page .zip-filter-no-match {
  color: #92400e;
}

/* Enhanced Supplier Table Sub-lines */
.county-elite-page .supplier-table-section h2 {
  font-size: 1.2rem;
  margin-bottom: 1rem;
  color: #1a1a1a;
}

.county-elite-page .supplier-name .supplier-profile-link,
.county-elite-page .supplier-name .best-price-badge,
.county-elite-page .supplier-name .supplier-updated {
  display: block;
}

.county-elite-page .best-price-badge {
  display: inline-block;
  background: #166534;
  color: #fff;
  padding: 0.1rem 0.45rem;
  border-radius: 3px;
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.county-elite-page .supplier-updated {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.7rem;
  color: #999;
}

.county-elite-page .freshness-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.county-elite-page .freshness-green { background: #22c55e; }
.county-elite-page .freshness-yellow { background: #eab308; }
.county-elite-page .freshness-gray { background: #9ca3af; }

.county-elite-page .price-amount {
  display: block;
  font-weight: 600;
}

.county-elite-page .price-delivery {
  display: block;
  font-size: 0.7rem;
  color: #999;
  white-space: nowrap;
}

.county-elite-page .best-price-row {
  background: #f0fdf4;
  border-left: 4px solid #22c55e;
}

.county-elite-page .price-delta {
  display: block;
  font-size: 0.7rem;
  color: #6b7280;
}

.county-elite-page .price-delta.best {
  color: #15803d;
  font-weight: 600;
}

.county-elite-page .supplier-call-btn {
  color: #FF6B35;
  text-decoration: none;
  font-weight: 500;
  white-space: nowrap;
}

.county-elite-page .supplier-call-btn:hover {
  text-decoration: underline;
}

/* Trust Line + Claim Link */
.county-elite-page .supplier-trust-line {
  text-align: center;
  font-size: 0.8rem;
  color: #999;
  margin-top: 1rem;
}

.county-elite-page .supplier-claim-link {
  text-align: center;
  font-size: 0.88rem;
  color: #555;
  margin-top: 0.75rem;
}

.county-elite-page .supplier-claim-link a {
  color: #FF6B35;
  text-decoration: none;
  font-weight: 500;
}

.county-elite-page .supplier-claim-link a:hover {
  text-decoration: underline;
}

/* How to Order */
.county-elite-page .how-to-order {
  max-width: 520px;
  margin: 1rem auto 0;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  overflow: hidden;
}

.county-elite-page .how-to-order summary {
  padding: 0.75rem 1rem;
  cursor: pointer;
  font-weight: 500;
  font-size: 0.9rem;
  background: #f8f9fa;
  color: #555;
}

.county-elite-page .how-to-order summary:hover {
  background: #f0f1f3;
}

.county-elite-page .how-to-order ol {
  padding: 0.75rem 1rem 0.75rem 2rem;
  margin: 0;
  font-size: 0.88rem;
  line-height: 1.6;
  color: #444;
}

/* Nearby Counties */
.county-elite-page .nearby-counties {
  text-align: center;
  margin: 1.5rem 0;
  padding: 1rem 1.25rem;
  font-size: 0.88rem;
  background: #fafafa;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  line-height: 1.8;
}

.county-elite-page .nearby-counties strong {
  display: block;
  margin-bottom: 0.35rem;
  color: #333;
  font-size: 0.9rem;
}

.county-elite-page .nearby-counties a {
  color: #FF6B35;
  text-decoration: none;
  font-weight: 500;
}

.county-elite-page .nearby-counties a:hover {
  text-decoration: underline;
}

/* Mobile overrides */
@media (max-width: 600px) {
  .county-elite-page .price-delivery {
    display: none;
  }

  .county-elite-page .summary-line-1 {
    font-size: 0.92rem;
  }

  .county-elite-page .summary-price {
    font-size: 1.2rem;
  }

  .county-elite-page .near-best {
    display: none;
  }

  .county-elite-page .zip-filter-row {
    flex-direction: column;
  }

  .county-elite-page .zip-filter-input {
    width: 100%;
    box-sizing: border-box;
  }

  .county-elite-page .zip-filter-btn {
    width: 100%;
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
