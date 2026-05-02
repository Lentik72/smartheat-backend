#!/usr/bin/env node
/**
 * SEO Static Page Generator V2.0.0
 * Hub & Spoke Architecture: State → County → City
 *
 * Creates:
 * - State hub pages: /prices/{state}/index.html
 * - County pages: /prices/{state}/{county}-county.html
 * - City pages: /prices/{state}/{city}.html
 * - National leaderboard snippet
 * - Updated sitemap.xml
 *
 * Runs after daily price scrape (7 PM EST)
 *
 * Usage:
 *   DATABASE_URL="..." node scripts/generate-seo-pages.js
 *   DATABASE_URL="..." node scripts/generate-seo-pages.js --dry-run
 */

const { Sequelize } = require('sequelize');
const fs = require('fs').promises;
const fsSync = require('fs');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config();

// Import location resolver for ZIP lookups
const locationResolver = require('../src/services/locationResolver');

// Shared supplier data queries
const { getAllSuppliers, getCurrentPrices, getSuppliersForZips, getRecentPricedSupplierIds } = require('./lib/supplier-data');

// Shared nav/CSS helpers
const { getNavHTML, init: initCountyData, crossLinkExists } = require('./lib/county-data');

// Configuration
const WEBSITE_DIR = path.join(__dirname, '../website');
const PRICES_DIR = path.join(WEBSITE_DIR, 'prices');
// Two thresholds:
//   - MIN_SUPPLIERS_TO_GENERATE: durable. Counts suppliers SERVING the location
//     (postal_codes_served overlap). Decides whether to generate the page at all.
//   - MIN_PRICED_TO_INDEX: volatile. Counts suppliers with a PRICE in the last
//     INDEX_PRICE_WINDOW_DAYS days. Decides indexability (meta robots + sitemap).
//   See docs/website-generation.md and
//   docs/superpowers/specs/2026-05-01-thin-town-page-noindex-design.md
const MIN_SUPPLIERS_TO_GENERATE = 3;
const MIN_PRICED_TO_INDEX = 2;
const INDEX_PRICE_WINDOW_DAYS = 14;

// Kill switch: set DISABLE_NOINDEX_THIN_PAGES=true on Railway to force every
// page indexable, no redeploy needed. Use only if Google starts depublishing
// strong pages or some other regression appears.
const DISABLE_NOINDEX_THIN_PAGES = process.env.DISABLE_NOINDEX_THIN_PAGES === 'true';

const MIN_VALID_PRICE = 2.00;       // Filter out data errors
const MAX_VALID_PRICE = 6.00;       // Filter out data errors

initCountyData(WEBSITE_DIR);

// Content hash for cache-busting (matches build.js logic)
const _fileHashCache = {};
function getFileHash(relativePath) {
  if (_fileHashCache[relativePath]) return _fileHashCache[relativePath];
  const fullPath = path.join(WEBSITE_DIR, relativePath);
  if (fsSync.existsSync(fullPath)) {
    _fileHashCache[relativePath] = crypto.createHash('md5').update(fsSync.readFileSync(fullPath)).digest('hex').slice(0, 8);
  } else {
    _fileHashCache[relativePath] = Date.now().toString(36);
  }
  return _fileHashCache[relativePath];
}

// State configuration
const STATES = {
  'NY': { name: 'New York', abbrev: 'ny' },
  'CT': { name: 'Connecticut', abbrev: 'ct' },
  'MA': { name: 'Massachusetts', abbrev: 'ma' },
  'NJ': { name: 'New Jersey', abbrev: 'nj' },
  'PA': { name: 'Pennsylvania', abbrev: 'pa' },
  'RI': { name: 'Rhode Island', abbrev: 'ri' },
  'NH': { name: 'New Hampshire', abbrev: 'nh' },
  'ME': { name: 'Maine', abbrev: 'me' },
  'VA': { name: 'Virginia', abbrev: 'va' },
  'MD': { name: 'Maryland', abbrev: 'md' },
  'DE': { name: 'Delaware', abbrev: 'de' },
  'AK': { name: 'Alaska', abbrev: 'ak' },
  'VT': { name: 'Vermont', abbrev: 'vt' },
  'OH': { name: 'Ohio', abbrev: 'oh' }
};

// Regional configuration - aggregates multiple counties for SEO
// These match how locals search (e.g., "Long Island heating oil")
const REGIONS = {
  'NY': [
    {
      name: 'Long Island',
      slug: 'long-island',
      counties: ['Nassau', 'Suffolk'],
      description: 'Nassau and Suffolk counties on Long Island'
    },
    {
      name: 'Hudson Valley',
      slug: 'hudson-valley',
      counties: ['Dutchess', 'Orange', 'Putnam', 'Ulster', 'Rockland'],
      description: 'The Hudson Valley region of New York'
    },
    {
      name: 'Capital Region',
      slug: 'capital-region',
      counties: ['Albany', 'Rensselaer', 'Saratoga', 'Schenectady'],
      description: 'The Capital District around Albany'
    }
  ],
  'CT': [
    {
      name: 'Connecticut Shoreline',
      slug: 'shoreline',
      counties: ['New Haven', 'Middlesex', 'New London'],
      description: 'The Connecticut shoreline along Long Island Sound'
    }
  ]
};

// Parse CLI args
const args = process.argv.slice(2);
const cliDryRun = args.includes('--dry-run');

// V2.12.0: Multi-fuel support
const fuelArg = args.find(a => a.startsWith('--fuel='));
const cliFuelType = fuelArg ? fuelArg.split('=')[1] : 'heating_oil';

const FUEL_CONFIGS = {
  heating_oil: {
    fuelType: 'heating_oil',
    label: 'Heating Oil',
    slug: '',
    minPrice: 2.00,
    maxPrice: 6.00,
    urlPrefix: '/prices',
    dirSuffix: '',               // output to prices/{state}/
    crossLinkFuel: 'kerosene',
    crossLinkLabel: 'K-1 Kerosene',
    crossLinkUrl: '/prices/kerosene',
  },
  kerosene: {
    fuelType: 'kerosene',
    label: 'K-1 Kerosene',
    slug: 'kerosene',
    minPrice: 2.50,
    maxPrice: 7.00,
    urlPrefix: '/prices/kerosene',
    dirSuffix: '/kerosene',      // output to prices/kerosene/{state}/
    crossLinkFuel: 'heating_oil',
    crossLinkLabel: 'Heating Oil',
    crossLinkUrl: '/prices',
  },
  propane: {
    fuelType: 'propane',
    label: 'Propane',
    slug: 'propane',
    minPrice: 1.50,
    maxPrice: 5.00,
    urlPrefix: '/prices/propane',
    dirSuffix: '/propane',       // output to prices/propane/{state}/
    crossLinkFuel: 'heating_oil',
    crossLinkLabel: 'Heating Oil',
    crossLinkUrl: '/prices',
  }
};
/**
 * Main entry point
 * @param {object} options
 * @param {string} options.fuelType - 'heating_oil' or 'kerosene' (default: CLI --fuel arg or 'heating_oil')
 */
async function generateSEOPages(options = {}) {
  const {
    sequelize: externalSequelize = null,
    logger = console,
    outputDir = WEBSITE_DIR,
    dryRun = cliDryRun,
    fuelType = cliFuelType
  } = options;

  const FUEL = FUEL_CONFIGS[fuelType] || FUEL_CONFIGS.heating_oil;

  const log = (msg) => logger.info ? logger.info(msg) : console.log(msg);

  log('═══════════════════════════════════════════════════════════');
  log('  HomeHeat SEO Page Generator - V2.0.0 (Hub & Spoke)');
  log('  ' + new Date().toLocaleString());
  log('═══════════════════════════════════════════════════════════');

  if (dryRun) {
    log('🔍 DRY RUN - No files will be written');
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

    // V2.12.0: Kerosene outputs to prices/kerosene/{state}/, oil to prices/{state}/
    const pricesDir = outputDir
      ? path.join(outputDir, 'prices' + FUEL.dirSuffix)
      : path.join(PRICES_DIR + FUEL.dirSuffix);
    const websiteDir = outputDir || WEBSITE_DIR;

    // 1. Get all suppliers with their service areas
    let suppliers = await getAllSuppliers(sequelize);
    log(`📊 Found ${suppliers.length} active suppliers`);

    // 2. Get all current prices
    const prices = await getCurrentPrices(sequelize, FUEL.minPrice, FUEL.maxPrice, FUEL.fuelType);
    log(`💰 Found ${prices.length} current prices`);

    // Create price lookup map
    const priceMap = new Map();
    for (const p of prices) {
      priceMap.set(p.supplier_id, p);
    }

    // V2.40.0: Indexability gate uses a wider window than display freshness.
    // If the query throws (transient DB error, schema drift), let it bubble
    // up to cronMonitor.run — that path retries once and logs to cron_error_log
    // so the failure surfaces in the 6 AM email. A try/catch here would
    // silently violate feedback_silent_degradation. See spec "Failure handling".
    const recentPriceSet = await getRecentPricedSupplierIds(
      sequelize,
      FUEL.fuelType,
      INDEX_PRICE_WINDOW_DAYS,
      { minPrice: FUEL.minPrice, maxPrice: FUEL.maxPrice }
    );
    log(`📋 ${recentPriceSet.size} ${FUEL.label.toLowerCase()} suppliers had a price in the last ${INDEX_PRICE_WINDOW_DAYS} days (used for indexability)`);

    // V2.12.0: Pre-fetch cross-link fuel state data for banner display
    const [crossLinkStates] = await sequelize.query(`
      SELECT state_code, SUM(supplier_count) as total_suppliers
      FROM county_current_stats
      WHERE fuel_type = :crossFuelType AND median_price IS NOT NULL
      GROUP BY state_code
    `, { replacements: { crossFuelType: FUEL.crossLinkFuel } });
    const crossLinkStateMap = new Map(crossLinkStates.map(s => [s.state_code, parseInt(s.total_suppliers)]));

    // V2.12.0: For non-oil fuels, filter supplier list to only those that deliver this fuel
    // Suppliers qualify if they list the fuel in fuel_types OR have a scraped price for it
    if (FUEL.fuelType !== 'heating_oil') {
      const fuelKey = FUEL.fuelType; // 'kerosene'
      suppliers = suppliers.filter(s => {
        const ft = s.fuel_types || [];
        return ft.includes(fuelKey) || priceMap.has(s.id);
      });
      log(`🔥 Filtered to ${suppliers.length} suppliers that deliver ${FUEL.label}`);
    }

    // 3. Track generated pages for sitemap
    const generatedPages = {
      states: [],
      regions: [],
      counties: [],
      cities: []
    };

    // 4. Process each state
    // Safe generate-then-swap: write all pages to a temp directory per state,
    // then replace the live directory only after the entire state succeeds.
    // If generation fails for any state, old pages survive untouched.
    for (const [stateCode, stateInfo] of Object.entries(STATES)) {
      log(`\n📍 Processing ${stateInfo.name}...`);

      // Get suppliers for this state (by physical location OR service area)
      const stateSuppliers = suppliers.filter(s =>
        s.state === stateCode ||
        (s.service_counties && s.service_counties.some(c => c.includes(stateCode)))
      );

      // V2.12.0: For non-oil fuels, suppliers list is pre-filtered above.
      // stateSuppliers now only contains suppliers that deliver this fuel.
      const fuelThreshold = FUEL.fuelType === 'heating_oil' ? MIN_SUPPLIERS_TO_GENERATE : 5;

      if (stateSuppliers.length < fuelThreshold) {
        log(`   ⏭️  Skipping ${stateCode} (only ${stateSuppliers.length} ${FUEL.label.toLowerCase()} suppliers, need ${fuelThreshold})`);
        continue;
      }

      const stateDir = path.join(pricesDir, stateInfo.abbrev);
      const tmpDir = stateDir + '._tmp';

      // Track pages generated for this state (committed to generatedPages only on success)
      const stateGenerated = { states: [], regions: [], counties: [], cities: [] };

      try {
        if (!dryRun) {
          // Clean and create temp directory
          await fs.rm(tmpDir, { recursive: true, force: true });
          await fs.mkdir(tmpDir, { recursive: true });
        }

        // A. Generate State Hub Page
        const statePageData = await generateStateHubPage(
          stateCode, stateInfo, suppliers, priceMap, sequelize, crossLinkStateMap, FUEL
        );

        if (statePageData) {
          if (!dryRun) {
            await fs.writeFile(path.join(tmpDir, 'index.html'), statePageData.html, 'utf-8');
          }
          log(`   ✅ State: ${stateInfo.abbrev}/index.html (${statePageData.supplierCount} suppliers)`);
          stateGenerated.states.push({
            abbrev: stateInfo.abbrev,
            name: stateInfo.name,
            supplierCount: statePageData.supplierCount
          });
        }

        // B. Generate Regional Pages (e.g., Long Island, Hudson Valley)
        const stateRegions = REGIONS[stateCode] || [];
        for (const region of stateRegions) {
          const regionData = await generateRegionalPage(
            stateCode, stateInfo, region, suppliers, priceMap, sequelize, FUEL
          );

          if (regionData && regionData.supplierCount >= MIN_SUPPLIERS_TO_GENERATE) {
            if (!dryRun) {
              await fs.writeFile(path.join(tmpDir, `${region.slug}.html`), regionData.html, 'utf-8');
            }
            log(`   ✅ Region: ${stateInfo.abbrev}/${region.slug}.html (${regionData.supplierCount} suppliers)`);
            stateGenerated.regions.push({
              state: stateInfo.abbrev,
              stateName: stateInfo.name,
              region: region.name,
              slug: region.slug,
              supplierCount: regionData.supplierCount
            });
          }
        }

        // C. Generate County Pages
        const counties = locationResolver.getCountiesForState(stateCode);
        for (const county of counties) {
          const countyData = await generateCountyPage(
            stateCode, stateInfo, county, suppliers, priceMap, sequelize, FUEL
          );

          if (countyData && countyData.supplierCount >= MIN_SUPPLIERS_TO_GENERATE) {
            const countySlug = slugify(county) + '-county';
            if (!dryRun) {
              await fs.writeFile(path.join(tmpDir, `${countySlug}.html`), countyData.html, 'utf-8');
            }
            log(`   ✅ County: ${stateInfo.abbrev}/${countySlug}.html (${countyData.supplierCount} suppliers)`);
            stateGenerated.counties.push({
              state: stateInfo.abbrev,
              stateName: stateInfo.name,
              county: county,
              slug: countySlug,
              supplierCount: countyData.supplierCount
            });
          }
        }

        // D. Generate City Pages
        const cities = locationResolver.getCitiesForState(stateCode);
        for (const city of cities) {
          const cityData = await generateCityPage(
            stateCode, stateInfo, city, suppliers, priceMap, sequelize, FUEL
          );

          if (cityData && cityData.supplierCount >= MIN_SUPPLIERS_TO_GENERATE) {
            const citySlug = slugify(city);
            if (!dryRun) {
              await fs.writeFile(path.join(tmpDir, `${citySlug}.html`), cityData.html, 'utf-8');
            }
            log(`   ✅ City: ${stateInfo.abbrev}/${citySlug}.html (${cityData.supplierCount} suppliers)`);
            stateGenerated.cities.push({
              state: stateInfo.abbrev,
              stateName: stateInfo.name,
              city: city,
              county: cityData.county,
              slug: citySlug,
              supplierCount: cityData.supplierCount
            });
          }
        }

        // All pages for this state generated successfully — swap into live directory.
        // Remove old .html files, move new ones in, clean up temp dir.
        if (!dryRun) {
          await fs.mkdir(stateDir, { recursive: true });
          const oldFiles = await fs.readdir(stateDir);
          for (const file of oldFiles) {
            if (file.endsWith('.html')) {
              await fs.unlink(path.join(stateDir, file));
            }
          }
          const newFiles = await fs.readdir(tmpDir);
          for (const file of newFiles) {
            await fs.rename(path.join(tmpDir, file), path.join(stateDir, file));
          }
          await fs.rm(tmpDir, { recursive: true, force: true });
        }

        // Commit tracking data only after successful swap
        generatedPages.states.push(...stateGenerated.states);
        generatedPages.regions.push(...stateGenerated.regions);
        generatedPages.counties.push(...stateGenerated.counties);
        generatedPages.cities.push(...stateGenerated.cities);

      } catch (stateError) {
        // Generation failed for this state — old pages survive, continue to next state
        log(`   ❌ ${stateInfo.name} generation failed: ${stateError.message} — keeping old pages`);
        if (!dryRun) {
          await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
        }
      }
    }

    // 5. Generate national leaderboard snippet
    const leaderboardHtml = generateLeaderboardSnippet(generatedPages.states, prices, suppliers, FUEL);
    const leaderboardPath = path.join(pricesDir, '_leaderboard-snippet.html');
    if (!dryRun) {
      await fs.writeFile(leaderboardPath, leaderboardHtml, 'utf-8');
    }
    log(`\n✅ Generated _leaderboard-snippet.html`);

    // V2.17.0: Update prices.html with fresh leaderboard data
    // Only heating_oil should update prices.html — kerosene has its own hub page
    const pricesHtmlPath = path.join(websiteDir, 'prices.html');
    if (!dryRun && FUEL.fuelType === 'heating_oil') {
      try {
        await updatePricesHtml(pricesHtmlPath, generatedPages.states, prices, suppliers, FUEL);
        log(`✅ Updated prices.html with fresh leaderboard data`);
      } catch (updateError) {
        log(`⚠️  Failed to update prices.html: ${updateError.message}`);
      }
    }

    // 6. Update sitemap
    // V2.12.0: Sitemap is now generated by scripts/generate-sitemap.js (standalone, scans all pages)
    // Run it after all generators complete: node scripts/generate-sitemap.js
    const sitemapPath = path.join(websiteDir, 'sitemap.xml');
    const sitemap = generateSitemap(generatedPages, suppliers);
    if (!dryRun) {
      await fs.writeFile(sitemapPath, sitemap, 'utf-8');
    }
    log(`✅ Updated sitemap.xml (legacy — run generate-sitemap.js after all generators for full sitemap)`);

    // 7. Create redirects for old state page URLs
    if (!dryRun) {
      await createLegacyRedirects(pricesDir, generatedPages.states);
    }
    log(`✅ Created legacy redirects`);

    // Summary
    log('\n═══════════════════════════════════════════════════════════');
    log('  GENERATION COMPLETE');
    log('═══════════════════════════════════════════════════════════');
    log(`  State pages: ${generatedPages.states.length}`);
    log(`  Regional pages: ${generatedPages.regions.length}`);
    log(`  County pages: ${generatedPages.counties.length}`);
    log(`  City pages: ${generatedPages.cities.length}`);
    log(`  Total pages: ${generatedPages.states.length + generatedPages.regions.length + generatedPages.counties.length + generatedPages.cities.length}`);

    if (shouldCloseConnection) await sequelize.close();
    return {
      success: true,
      states: generatedPages.states.length,
      regions: generatedPages.regions.length,
      counties: generatedPages.counties.length,
      cities: generatedPages.cities.length
    };

  } catch (error) {
    log(`❌ Error: ${error.message}`);
    console.error(error);
    if (shouldCloseConnection) await sequelize.close();
    throw error;
  }
}

// getAllSuppliers, getCurrentPrices, getSuppliersForZips — imported from ./lib/supplier-data.js

/**
 * Calculate market stats with outlier filtering
 */
function calculateMarketStats(suppliers) {
  const pricedSuppliers = suppliers.filter(s => s.hasPrice && s.price);

  if (pricedSuppliers.length === 0) {
    return null;
  }

  const prices = pricedSuppliers.map(s => s.price);

  // Filter outliers (< $2 or > $6 are data errors)
  const validPrices = prices.filter(p => p >= MIN_VALID_PRICE && p <= MAX_VALID_PRICE);

  if (validPrices.length === 0) {
    return null;
  }

  const sorted = [...validPrices].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const avg = validPrices.reduce((a, b) => a + b, 0) / validPrices.length;
  const spread = max - min;

  return {
    avg: avg.toFixed(2),
    min: min.toFixed(2),
    max: max.toFixed(2),
    spread: spread.toFixed(2),
    pricedCount: validPrices.length,
    totalCount: suppliers.length
  };
}

/**
 * Generate State Hub Page
 * V2.34.0: Intelligence-first architecture - leads with price data, not supplier directory
 */
async function generateStateHubPage(stateCode, stateInfo, allSuppliers, priceMap, sequelize, crossLinkStateMap = new Map(), FUEL) {
  // Get all ZIPs for this state's counties
  const counties = locationResolver.getCountiesForState(stateCode);
  const allZips = new Set();

  for (const county of counties) {
    const zips = locationResolver.getZipsForCounty(county, stateCode);
    zips.forEach(z => allZips.add(z));
  }

  const suppliers = getSuppliersForZips(allSuppliers, Array.from(allZips), priceMap);

  if (suppliers.length < MIN_SUPPLIERS_TO_GENERATE) {
    return null;
  }

  const stats = calculateMarketStats(suppliers);
  const dateStr = formatDate();
  const timeStr = formatTime();

  // V2.34.0: Get state-level price intelligence from county_current_stats
  // This powers the intelligence-first state page design
  let stateMedian = null;
  let stateTrend = null;
  let countyEliteData = [];

  try {
    // Get aggregate state stats
    const [stateStats] = await sequelize.query(`
      SELECT
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY median_price) as state_median,
        AVG(percent_change_6w) as avg_trend,
        COUNT(*) as county_count,
        SUM(supplier_count) as total_suppliers
      FROM county_current_stats
      WHERE state_code = :stateCode
        AND fuel_type = :fuelType
        AND median_price IS NOT NULL
    `, { replacements: { stateCode, fuelType: FUEL.fuelType } });

    if (stateStats[0] && stateStats[0].state_median) {
      stateMedian = parseFloat(stateStats[0].state_median);
      stateTrend = stateStats[0].avg_trend ? parseFloat(stateStats[0].avg_trend) : null;
    }

    // Get county Elite data for intelligence cards
    const [countyStats] = await sequelize.query(`
      SELECT
        county_name,
        median_price,
        min_price,
        max_price,
        supplier_count,
        percent_change_6w,
        data_quality_score
      FROM county_current_stats
      WHERE state_code = :stateCode
        AND fuel_type = :fuelType
        AND data_quality_score >= 0.45
      ORDER BY data_quality_score DESC, supplier_count DESC
    `, { replacements: { stateCode, fuelType: FUEL.fuelType } });

    countyEliteData = countyStats.map(c => ({
      name: toTitleCase(c.county_name),
      slug: slugify(c.county_name),
      medianPrice: parseFloat(c.median_price),
      minPrice: c.min_price ? parseFloat(c.min_price) : null,
      maxPrice: c.max_price ? parseFloat(c.max_price) : null,
      supplierCount: c.supplier_count,
      trend: c.percent_change_6w ? parseFloat(c.percent_change_6w) : null,
      hasElite: true
    })).filter(c => crossLinkExists(`${FUEL.urlPrefix}/county/${stateCode.toLowerCase()}/${c.slug}`));
  } catch (e) {
    // If county stats not available, fall back to supplier-only data
    console.log(`   ⚠️  Could not fetch county stats for ${stateCode}: ${e.message}`);
  }

  // Get state weekly price history for trend chart
  let stateHistory = [];
  try {
    const [historyRows] = await sequelize.query(`
      SELECT
        week_start as week,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY median_price) as state_median
      FROM county_price_stats
      WHERE state_code = :stateCode
        AND fuel_type = :fuelType
        AND median_price IS NOT NULL
      GROUP BY week_start
      ORDER BY week_start DESC
      LIMIT 8
    `, { replacements: { stateCode, fuelType: FUEL.fuelType } });
    stateHistory = historyRows.map(r => ({
      week: r.week,
      median: parseFloat(r.state_median)
    })).reverse();  // chronological order
  } catch (e) {
    console.log(`   ⚠️  Could not fetch state history for ${stateCode}: ${e.message}`);
  }

  // Get regions with enough suppliers for links
  const stateRegions = REGIONS[stateCode] || [];
  const regionLinks = [];
  for (const region of stateRegions) {
    const regionZips = new Set();
    for (const county of region.counties) {
      const countyZips = locationResolver.getZipsForCounty(county, stateCode);
      countyZips.forEach(z => regionZips.add(z));
    }
    const regionSuppliers = getSuppliersForZips(allSuppliers, Array.from(regionZips), priceMap);
    if (regionSuppliers.length >= MIN_SUPPLIERS_TO_GENERATE) {
      regionLinks.push({
        name: region.name,
        slug: region.slug,
        count: regionSuppliers.length
      });
    }
  }
  regionLinks.sort((a, b) => b.count - a.count);

  // Get counties with enough suppliers for directory links (secondary section)
  const countyLinks = [];
  for (const county of counties) {
    const zips = locationResolver.getZipsForCounty(county, stateCode);
    const countySuppliers = getSuppliersForZips(allSuppliers, zips, priceMap);
    if (countySuppliers.length >= MIN_SUPPLIERS_TO_GENERATE) {
      countyLinks.push({
        name: toTitleCase(county),
        slug: slugify(county) + '-county',
        count: countySuppliers.length
      });
    }
  }
  countyLinks.sort((a, b) => b.count - a.count);

  // Intelligence-first description — highlights county comparison for SEO
  const description = stateMedian
    ? `Today's (${dateStr}) ${FUEL.label.toLowerCase()} prices across ${countyEliteData.length} counties in ${stateInfo.name}. Compare ${suppliers.length} suppliers updated daily.`
    : `Today's (${dateStr}) ${FUEL.label.toLowerCase()} prices in ${stateInfo.name}. ${stats ? `Prices from $${stats.min} to $${stats.max}/gal.` : ''} Compare ${suppliers.length} suppliers.`;

  const html = generatePageHTML({
    type: 'state',
    title: `${FUEL.label} Prices in ${stateInfo.name}`,
    h1: `${FUEL.label} Prices in ${stateInfo.name}`,
    description,
    canonicalUrl: `https://www.gethomeheat.com${FUEL.urlPrefix}/${stateInfo.abbrev}/`,
    breadcrumbs: [
      { name: 'Home', url: '/' },
      { name: FUEL.label + ' Prices', url: FUEL.urlPrefix || '/prices' },
      { name: stateInfo.name, url: null }
    ],
    stats,
    suppliers,
    dateStr,
    timeStr,
    stateInfo,
    stateCode,
    regionLinks,
    countyLinks,
    // V2.34.0: Elite data for intelligence-first layout
    stateMedian,
    stateTrend,
    stateHistory,
    countyEliteData,
    crossLinkStateMap,
    otherStates: Object.entries(STATES)
      .filter(([code]) => code !== stateCode)
      .map(([code, info]) => ({ name: info.name, abbrev: info.abbrev }))
  }, FUEL);

  return { html, supplierCount: suppliers.length };
}

/**
 * Generate County Page
 */
async function generateCountyPage(stateCode, stateInfo, county, allSuppliers, priceMap, sequelize, FUEL) {
  const zips = locationResolver.getZipsForCounty(county, stateCode);

  if (zips.length === 0) {
    return null;
  }

  const suppliers = getSuppliersForZips(allSuppliers, zips, priceMap);

  if (suppliers.length < MIN_SUPPLIERS_TO_GENERATE) {
    return null;
  }

  const stats = calculateMarketStats(suppliers);
  const dateStr = formatDate();
  const timeStr = formatTime();
  const countySlug = slugify(county) + '-county';

  // Get cities in this county with enough suppliers
  const cityLinks = [];
  const cities = locationResolver.getCitiesForState(stateCode);

  for (const city of cities) {
    const cityZips = locationResolver.getZipsForCity(city, stateCode);
    // Check if city is in this county (at least one ZIP overlaps)
    const isInCounty = cityZips.some(z => zips.includes(z));
    if (isInCounty) {
      const citySuppliers = getSuppliersForZips(allSuppliers, cityZips, priceMap);
      if (citySuppliers.length >= MIN_SUPPLIERS_TO_GENERATE) {
        cityLinks.push({
          name: toTitleCase(city),
          slug: slugify(city),
          count: citySuppliers.length
        });
      }
    }
  }
  cityLinks.sort((a, b) => b.count - a.count);

  const countyName = toTitleCase(county);
  const html = generatePageHTML({
    type: 'county',
    title: `${FUEL.label} Prices in ${countyName} County, ${stateInfo.name}`,
    h1: `${countyName} County ${FUEL.label} Prices`,
    description: `Today's (${dateStr}) ${FUEL.label.toLowerCase()} prices in ${countyName} County, ${stateCode}. ${stats ? `Prices from $${stats.min} to $${stats.max}/gal.` : ''} Compare ${suppliers.length} suppliers.`,
    canonicalUrl: `https://www.gethomeheat.com${FUEL.urlPrefix}/${stateInfo.abbrev}/${countySlug}`,
    breadcrumbs: [
      { name: 'Home', url: '/' },
      { name: FUEL.label + ' Prices', url: FUEL.urlPrefix || '/prices' },
      { name: stateInfo.name, url: `/prices/${stateInfo.abbrev}/` },
      { name: `${countyName} County`, url: null }
    ],
    stats,
    suppliers,
    dateStr,
    timeStr,
    stateInfo,
    stateCode,
    county: countyName,
    cityLinks
  }, FUEL);

  return { html, supplierCount: suppliers.length, county };
}

/**
 * Generate Regional Page (e.g., Long Island, Hudson Valley)
 * Aggregates multiple counties into a single regional landing page
 */
async function generateRegionalPage(stateCode, stateInfo, region, allSuppliers, priceMap, sequelize, FUEL) {
  // Collect all ZIPs from the region's counties
  const allZips = new Set();
  for (const county of region.counties) {
    const countyZips = locationResolver.getZipsForCounty(county, stateCode);
    countyZips.forEach(z => allZips.add(z));
  }

  if (allZips.size === 0) {
    return null;
  }

  const suppliers = getSuppliersForZips(allSuppliers, Array.from(allZips), priceMap);

  if (suppliers.length < MIN_SUPPLIERS_TO_GENERATE) {
    return null;
  }

  const stats = calculateMarketStats(suppliers);
  const dateStr = formatDate();
  const timeStr = formatTime();

  // Get counties in this region with their supplier counts (for links)
  const countyLinks = [];
  for (const county of region.counties) {
    const countyZips = locationResolver.getZipsForCounty(county, stateCode);
    const countySuppliers = getSuppliersForZips(allSuppliers, countyZips, priceMap);
    if (countySuppliers.length >= MIN_SUPPLIERS_TO_GENERATE) {
      countyLinks.push({
        name: toTitleCase(county),
        slug: slugify(county) + '-county',
        count: countySuppliers.length
      });
    }
  }
  countyLinks.sort((a, b) => b.count - a.count);

  const html = generatePageHTML({
    type: 'region',
    title: `${FUEL.label} Prices in ${region.name}, ${stateInfo.name}`,
    h1: `${region.name} ${FUEL.label} Prices`,
    description: `Today's (${dateStr}) ${FUEL.label.toLowerCase()} prices in ${region.name}. ${stats ? `Prices from $${stats.min} to $${stats.max}/gal.` : ''} Covers ${region.counties.join(', ')} counties.`,
    canonicalUrl: `https://www.gethomeheat.com${FUEL.urlPrefix}/${stateInfo.abbrev}/${region.slug}`,
    breadcrumbs: [
      { name: 'Home', url: '/' },
      { name: FUEL.label + ' Prices', url: FUEL.urlPrefix || '/prices' },
      { name: stateInfo.name, url: `/prices/${stateInfo.abbrev}/` },
      { name: region.name, url: null }
    ],
    stats,
    suppliers,
    dateStr,
    timeStr,
    stateInfo,
    stateCode,
    region: region.name,
    regionDescription: region.description,
    countyLinks
  }, FUEL);

  return { html, supplierCount: suppliers.length };
}

/**
 * Generate City Page
 */
async function generateCityPage(stateCode, stateInfo, city, allSuppliers, priceMap, sequelize, FUEL) {
  const zips = locationResolver.getZipsForCity(city, stateCode);

  if (zips.length === 0) {
    return null;
  }

  const suppliers = getSuppliersForZips(allSuppliers, zips, priceMap);

  if (suppliers.length < MIN_SUPPLIERS_TO_GENERATE) {
    return null;
  }

  const stats = calculateMarketStats(suppliers);
  const dateStr = formatDate();
  const timeStr = formatTime();
  const citySlug = slugify(city);

  // Find which county this city is in
  let countyName = null;
  const counties = locationResolver.getCountiesForState(stateCode);
  for (const county of counties) {
    const countyZips = locationResolver.getZipsForCounty(county, stateCode);
    if (zips.some(z => countyZips.includes(z))) {
      countyName = county;
      break;
    }
  }

  // Get other cities in the same county
  const siblingCities = [];
  if (countyName) {
    const countyZips = locationResolver.getZipsForCounty(countyName, stateCode);
    const cities = locationResolver.getCitiesForState(stateCode);

    for (const otherCity of cities) {
      if (otherCity.toLowerCase() === city.toLowerCase()) continue;

      const otherCityZips = locationResolver.getZipsForCity(otherCity, stateCode);
      const isInCounty = otherCityZips.some(z => countyZips.includes(z));

      if (isInCounty) {
        const otherSuppliers = getSuppliersForZips(allSuppliers, otherCityZips, priceMap);
        if (otherSuppliers.length >= MIN_SUPPLIERS_TO_GENERATE) {
          siblingCities.push({
            name: otherCity,
            slug: slugify(otherCity),
            count: otherSuppliers.length
          });
        }
      }
    }
    siblingCities.sort((a, b) => b.count - a.count);
  }

  const cityName = toTitleCase(city);
  const countyNameFormatted = countyName ? toTitleCase(countyName) : null;
  const html = generatePageHTML({
    type: 'city',
    title: `${FUEL.label} Prices in ${cityName}, ${stateCode}`,
    h1: `${cityName} ${FUEL.label} Prices`,
    description: `Today's (${dateStr}) ${FUEL.label.toLowerCase()} prices in ${cityName}, ${stateCode}. ${stats ? `Prices from $${stats.min} to $${stats.max}/gal.` : ''} Compare ${suppliers.length} suppliers.`,
    canonicalUrl: `https://www.gethomeheat.com${FUEL.urlPrefix}/${stateInfo.abbrev}/${citySlug}`,
    breadcrumbs: [
      { name: 'Home', url: '/' },
      { name: FUEL.label + ' Prices', url: FUEL.urlPrefix || '/prices' },
      { name: stateInfo.name, url: `/prices/${stateInfo.abbrev}/` },
      ...(countyNameFormatted ? [{ name: `${countyNameFormatted} County`, url: `/prices/${stateInfo.abbrev}/${slugify(countyName)}-county` }] : []),
      { name: cityName, url: null }
    ],
    stats,
    suppliers,
    dateStr,
    timeStr,
    stateInfo,
    stateCode,
    city: cityName,
    county: countyNameFormatted,
    siblingCities: siblingCities.slice(0, 10).map(s => ({ ...s, name: toTitleCase(s.name) })),  // Limit to 10
    zips
  }, FUEL);

  return { html, supplierCount: suppliers.length, county: countyName };
}

/**
 * Compute freshness display from a scraped_at timestamp
 * Returns { dotClass, text } for rendering freshness indicators
 */
function computeFreshness(scrapedAt) {
  if (!scrapedAt) return { dotClass: 'stale', text: '—' };
  const date = new Date(scrapedAt);
  if (isNaN(date.getTime())) return { dotClass: 'stale', text: '—' };
  const diff = Date.now() - date.getTime();
  if (diff < 0) return { dotClass: 'stale', text: '—' };
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (hours < 24) return { dotClass: 'fresh', text: hours < 1 ? 'Now' : `${hours}h ago` };
  if (days <= 3) return { dotClass: 'recent', text: days === 1 ? '1d ago' : `${days}d ago` };
  return { dotClass: 'stale', text: days < 7 ? `${days}d ago` : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) };
}

/**
 * Generate page HTML (shared template)
 */
function generatePageHTML(data, FUEL) {
  const {
    type,
    title,
    h1,
    description,
    canonicalUrl,
    breadcrumbs,
    stats,
    suppliers,
    dateStr,
    timeStr,
    stateInfo,
    stateCode,
    county,
    city,
    region,
    regionDescription,
    regionLinks,
    countyLinks,
    cityLinks,
    siblingCities,
    otherStates,
    zips,
    // V2.34.0: Elite data for intelligence-first state pages
    stateMedian,
    stateTrend,
    stateHistory,
    countyEliteData,
    // V2.12.0: Cross-link data
    crossLinkStateMap = new Map(),
  } = data;

  // Schema.org breadcrumb
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": breadcrumbs.map((b, i) => ({
      "@type": "ListItem",
      "position": i + 1,
      "name": b.name,
      ...(b.url && { "item": `https://www.gethomeheat.com${b.url}` })
    }))
  };

  // Schema.org product list
  // V2.1.0: Use PriceSpecification instead of Offer to avoid Google's e-commerce field requirements
  // (hasMerchantReturnPolicy, shippingDetails are not applicable to service businesses)
  const pricedSuppliers = suppliers.filter(s => s.hasPrice).slice(0, 25);
  // Build location name for schema descriptions
  const locationName = city ? `${city}, ${stateCode}` : (county ? `${county} County, ${stateCode}` : stateInfo.name);

  // V2.34.0: For state pages, use Dataset schema (primary) to signal price intelligence
  // ItemList schema retained for supplier directory section
  const datasetSchema = (type === 'state' && stateMedian) ? {
    "@context": "https://schema.org",
    "@type": "Dataset",
    "name": `${FUEL.label} Prices in ${stateInfo.name}`,
    "description": `County-level ${FUEL.label.toLowerCase()} price data for ${stateInfo.name}. Current median: $${stateMedian.toFixed(2)}/gal across ${countyEliteData?.length || 0} counties.`,
    "url": canonicalUrl,
    "license": "https://creativecommons.org/licenses/by-nc/4.0/",
    "creator": {
      "@type": "Organization",
      "name": "HomeHeat",
      "url": "https://www.gethomeheat.com"
    },
    "spatialCoverage": {
      "@type": "Place",
      "name": stateInfo.name,
      "address": {
        "@type": "PostalAddress",
        "addressRegion": stateCode,
        "addressCountry": "US"
      }
    },
    "temporalCoverage": "P6W",
    "dateModified": new Date().toISOString().split('T')[0],
    "variableMeasured": [
      {
        "@type": "PropertyValue",
        "name": "Median Price",
        "unitCode": "USD/gallon",
        "value": stateMedian.toFixed(2)
      }
    ]
  } : null;

  // FAQPage schema for state pages
  const faqSchema = (type === 'state' && stateMedian) ? {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": `What is the current ${FUEL.label.toLowerCase()} price in ${stateInfo.name}?`,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": `The median ${FUEL.label.toLowerCase()} price in ${stateInfo.name} today is $${stateMedian.toFixed(2)} per gallon${stats ? `, with prices ranging from $${stats.min} to $${stats.max}` : ''}. Prices are based on data from ${suppliers.filter(s => s.hasPrice).length} reporting suppliers across ${countyEliteData?.length || 0} counties.`
        }
      },
      {
        "@type": "Question",
        "name": `How many ${FUEL.label.toLowerCase()} suppliers are in ${stateInfo.name}?`,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": `HomeHeat tracks ${suppliers.length} ${FUEL.label.toLowerCase()} suppliers across ${countyEliteData?.length || 0} counties in ${stateInfo.name}. Pricing data is updated daily from verified COD suppliers.`
        }
      },
      {
        "@type": "Question",
        "name": `Are ${FUEL.label.toLowerCase()} prices going up or down in ${stateInfo.name}?`,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": stateTrend
            ? (Math.abs(stateTrend) < 2
              ? `Heating oil prices in ${stateInfo.name} have been relatively stable over the past 6 weeks. The statewide median is currently $${stateMedian.toFixed(2)} per gallon.`
              : `Heating oil prices in ${stateInfo.name} are ${stateTrend > 0 ? 'up' : 'down'} approximately ${Math.abs(stateTrend).toFixed(1)}% over the past 6 weeks. The current statewide median is $${stateMedian.toFixed(2)} per gallon.`)
            : `The current statewide median ${FUEL.label.toLowerCase()} price in ${stateInfo.name} is $${stateMedian.toFixed(2)} per gallon. Check back for trend data as more weekly pricing is collected.`
        }
      }
    ]
  } : null;

  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": title,
    "description": `Compare ${FUEL.label.toLowerCase()} prices from local suppliers in ${locationName}`,
    "numberOfItems": pricedSuppliers.length,
    "itemListElement": pricedSuppliers.map((s, i) => ({
      "@type": "ListItem",
      "position": i + 1,
      "item": {
        "@type": "Service",
        "name": `${FUEL.label} Delivery from ${s.name}`,
        "description": `Heating oil delivery service from ${s.name} in ${locationName}. Current price: $${s.price.toFixed(2)} per gallon.`,
        "image": "https://www.gethomeheat.com/images/app-icon.png",
        "serviceType": `${FUEL.label} Delivery`,
        "areaServed": locationName,
        "provider": {
          "@type": "LocalBusiness",
          "name": s.name,
          ...(s.slug && { "@id": `https://www.gethomeheat.com/supplier/${s.slug}` }),
          "image": "https://www.gethomeheat.com/images/app-icon.png",
          ...(s.phone && { "telephone": s.phone }),
          "priceRange": `$${s.price.toFixed(2)}/gal`
        },
        "priceSpecification": {
          "@type": "UnitPriceSpecification",
          "price": s.price.toFixed(2),
          "priceCurrency": "USD",
          "unitCode": "GLL",
          "unitText": "gallon"
        }
      }
    }))
  };

  // Schema.org Product + AggregateOffer (triggers Google price rich snippets for aggregator sites)
  const productSchema = (stats && stats.pricedCount >= 2 && Number.isFinite(stats.min) && Number.isFinite(stats.max)) ? {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": `${FUEL.label} in ${city ? `${city}, ${stateCode}` : county ? `${county} County, ${stateCode}` : stateInfo.name}`,
    "description": `Compare ${FUEL.label.toLowerCase()} prices from ${stats.pricedCount} COD suppliers in ${city ? `${city}, ${stateCode}` : county ? `${county} County, ${stateCode}` : stateInfo.name}. Updated daily.`,
    "url": canonicalUrl,
    "image": "https://www.gethomeheat.com/images/heating-oil-product.jpg",
    "brand": {
      "@type": "Brand",
      "name": "#2 Heating Oil"
    },
    "category": "Heating Fuel",
    "offers": {
      "@type": "AggregateOffer",
      "lowPrice": stats.min.toFixed(2),
      "highPrice": stats.max.toFixed(2),
      "priceCurrency": "USD",
      "offerCount": stats.pricedCount,
      "availability": "https://schema.org/InStock",
      "priceValidUntil": new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
    }
  } : null;

  // Generate breadcrumb HTML
  const breadcrumbHtml = breadcrumbs.map((b, i) =>
    b.url
      ? `<a href="${b.url}">${escapeHtml(b.name)}</a>`
      : `<span>${escapeHtml(b.name)}</span>`
  ).join(' › ');

  // Generate supplier table rows
  // State pages get enhanced 7-column table; others keep 5-column
  const isEnhancedTable = type === 'state';
  const supplierRows = suppliers.map(s => {
    const hasValidWebsite = s.website && s.website.startsWith('https://');
    const freshness = computeFreshness(s.scrapedAt);
    const minGalText = s.minGallons ? `${s.minGallons}+` : '—';
    const freshnessHtml = s.hasPrice
      ? `<span class="freshness-dot ${freshness.dotClass}"></span> ${escapeHtml(freshness.text)}`
      : '—';

    if (isEnhancedTable) {
      return `
        <tr>
          <td class="supplier-name">${s.slug ? `<a href="/supplier/${s.slug}" class="supplier-profile-link">${escapeHtml(s.name)}</a>` : escapeHtml(s.name)}</td>
          <td class="supplier-city">${escapeHtml(s.city || '')}</td>
          <td class="supplier-price">${s.hasPrice ? `$${s.price.toFixed(2)}` : '<span class="call-for-price">Call</span>'}</td>
          <td class="supplier-min-gal">${minGalText}</td>
          <td class="supplier-freshness">${freshnessHtml}</td>
          <td class="supplier-phone">${s.phone ? `<a href="tel:${s.phone}" class="phone-link" data-supplier-id="${s.id}" data-supplier-name="${escapeHtml(s.name)}" data-action="call">${escapeHtml(s.phone)}</a>` : '—'}</td>
          <td class="supplier-website">${hasValidWebsite ? `<a href="${escapeHtml(s.website)}" target="_blank" rel="noopener noreferrer" class="website-link" data-supplier-id="${s.id}" data-supplier-name="${escapeHtml(s.name)}" data-action="website">Website</a>` : ''}</td>
        </tr>`;
    }
    return `
        <tr>
          <td class="supplier-name">${s.slug ? `<a href="/supplier/${s.slug}" class="supplier-profile-link">${escapeHtml(s.name)}</a>` : escapeHtml(s.name)}</td>
          <td class="supplier-city">${escapeHtml(s.city || '')}</td>
          <td class="supplier-price">${s.hasPrice ? `$${s.price.toFixed(2)}` : '<span class="call-for-price">Call</span>'}</td>
          <td class="supplier-phone">${s.phone ? `<a href="tel:${s.phone}" class="phone-link" data-supplier-id="${s.id}" data-supplier-name="${escapeHtml(s.name)}" data-action="call">${escapeHtml(s.phone)}</a>` : '—'}</td>
          <td class="supplier-website">${hasValidWebsite ? `<a href="${escapeHtml(s.website)}" target="_blank" rel="noopener noreferrer" class="website-link" data-supplier-id="${s.id}" data-supplier-name="${escapeHtml(s.name)}" data-action="website">Website</a>` : ''}</td>
        </tr>`;
  }).join('\n');

  // Market stats section (if available)
  const statsHtml = stats ? `
    <section class="market-stats-card">
      <div class="stat-item">
        <span class="stat-value">$${stats.avg}</span>
        <span class="stat-label">Average</span>
      </div>
      <div class="stat-item stat-highlight">
        <span class="stat-value">$${stats.min}</span>
        <span class="stat-label">Lowest</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">$${stats.spread}</span>
        <span class="stat-label">Potential Savings</span>
      </div>
    </section>` : '';

  // Elite page link banner (for county pages with Elite coverage)
  // Links to /prices/county/{state}/{county} if county Elite page exists
  // Anchor text includes target keywords for SEO intent signaling
  const countySlugForElite = county ? slugify(county) : null;
  const eliteBannerHtml = (type === 'county' && county && stateCode && crossLinkExists(`${FUEL.urlPrefix}/county/${stateCode.toLowerCase()}/${countySlugForElite}`)) ? `
    <section class="elite-banner">
      <div class="elite-banner-content">
        <span class="elite-icon">📊</span>
        <div class="elite-text">
          <strong>Looking for price trends and market analysis?</strong>
          <span>View the ${escapeHtml(county)} County Price Report with charts, trends, and ZIP breakdown.</span>
        </div>
        <a href="${FUEL.urlPrefix}/county/${stateCode.toLowerCase()}/${countySlugForElite}" class="elite-link">View ${escapeHtml(county)} County ${FUEL.label} Prices →</a>
      </div>
    </section>` : '';

  // Hub links section
  let hubLinksHtml = '';

  // State-only sections
  let stateIntelligenceHtml = '';
  let stateStatsBarHtml = '';
  let trendAlertHtml = '';
  let countyComparisonHtml = '';
  let chartSectionHtml = '';
  let priceAlertHtml = '';
  let countyLinkListHtml = '';
  let seoTextHtml = '';
  let faqSectionHtml = '';

  if (type === 'state') {
    // State price intelligence hero
    if (stateMedian) {
      const trendText = stateTrend
        ? (stateTrend > 2 ? `<span class="trend-up">&uarr; ${stateTrend.toFixed(1)}%</span>` :
           stateTrend < -2 ? `<span class="trend-down">&darr; ${Math.abs(stateTrend).toFixed(1)}%</span>` :
           '<span class="trend-stable">&rarr; stable</span>')
        : '';

      stateIntelligenceHtml = `
    <section class="state-intelligence">
      <div class="state-price-hero">
        <div class="price-main">
          <span class="price-value">$${stateMedian.toFixed(2)}</span>
          <span class="price-unit">per gallon</span>
          <span class="price-label">Statewide Median ${trendText}</span>
        </div>
      </div>
    </section>`;
    }

    // State Stats Bar
    const lowestPrice = stats ? parseFloat(stats.min) : null;
    stateStatsBarHtml = `
    <section class="state-stats-bar">
      <div class="stat"><span class="stat-label">Median Price</span><span class="stat-value">${stateMedian ? '$' + stateMedian.toFixed(2) + '/gal' : '—'}</span></div>
      <div class="stat"><span class="stat-label">Lowest Price</span><span class="stat-value">${stats ? '$' + stats.min : '—'}</span></div>
      <div class="stat"><span class="stat-label">Suppliers</span><span class="stat-value">${suppliers.length}</span></div>
      <div class="stat"><span class="stat-label">Counties</span><span class="stat-value">${countyEliteData?.length || 0}</span></div>
    </section>`;

    // Trend Alert Banner (conditional)
    if (stateHistory && stateHistory.length >= 2 && countyEliteData.length >= 3 && stateTrend && Math.abs(stateTrend) >= 2) {
      const isUp = stateTrend > 0;
      const firstPrice = stateHistory[0].median;
      const lastPrice = stateHistory[stateHistory.length - 1].median;
      trendAlertHtml = `
    <section class="trend-alert ${isUp ? 'trend-up' : 'trend-down'}">
      <span class="trend-icon">${isUp ? '&uarr;' : '&darr;'}</span>
      <span class="trend-text">${stateInfo.name} ${FUEL.label.toLowerCase()} prices are ${isUp ? 'up' : 'down'} ${Math.abs(stateTrend).toFixed(1)}% over the past 6 weeks (from $${firstPrice.toFixed(2)} to $${lastPrice.toFixed(2)})</span>
    </section>`;
    }

    // County Price Comparison Table (PRIMARY SEO feature)
    if (countyEliteData && countyEliteData.length > 0) {
      const sortedCounties = [...countyEliteData].sort((a, b) => a.medianPrice - b.medianPrice);
      const countyRows = sortedCounties.map(c => {
        let rangeText;
        if (c.supplierCount === 1) {
          rangeText = 'Single supplier';
        } else if (c.minPrice && c.maxPrice && c.minPrice !== c.maxPrice) {
          rangeText = `$${c.minPrice.toFixed(2)}&ndash;$${c.maxPrice.toFixed(2)}`;
          if (c.supplierCount === 2) rangeText += ' (2 suppliers)';
        } else {
          rangeText = '—';
        }
        return `
          <tr>
            <td><a href="${FUEL.urlPrefix}/county/${stateCode.toLowerCase()}/${c.slug}">${escapeHtml(c.name)} County</a></td>
            <td class="county-price">$${c.medianPrice.toFixed(2)}</td>
            <td>${c.supplierCount} supplier${c.supplierCount !== 1 ? 's' : ''}</td>
            <td>${rangeText}</td>
          </tr>`;
      }).join('');

      countyComparisonHtml = `
    <section class="county-price-section">
      <h2>${FUEL.label} Prices by County in ${stateInfo.name}</h2>
      <table class="county-comparison-table">
        <thead>
          <tr>
            <th>County</th>
            <th>Avg Price Today</th>
            <th>Suppliers</th>
            <th>Price Range</th>
          </tr>
        </thead>
        <tbody>${countyRows}
        </tbody>
      </table>
    </section>`;
    }

    // Trend Chart (conditional on data depth)
    const showChart = stateHistory && stateHistory.length >= 3 && countyEliteData.length >= 3;
    if (showChart) {
      const chartLabels = JSON.stringify(stateHistory.map(h => {
        const d = new Date(h.week);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }));
      const chartData = JSON.stringify(stateHistory.map(h => h.median));
      const minVal = Math.min(...stateHistory.map(h => h.median));
      const maxVal = Math.max(...stateHistory.map(h => h.median));
      const yPadding = (maxVal - minVal) * 0.15 || 0.05;

      chartSectionHtml = `
    <section class="chart-section">
      <h2>6-Week Price Trend</h2>
      <div class="chart-container"><canvas id="stateChart"></canvas></div>
      <p class="chart-caption">Statewide median ${FUEL.label.toLowerCase()} price across ${countyEliteData.length} counties (last ${stateHistory.length} weeks)</p>
    </section>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
    <script>
    (function() {
      if (typeof Chart === 'undefined') return;
      var ctx = document.getElementById('stateChart');
      if (!ctx) return;
      new Chart(ctx, {
        type: 'line',
        data: {
          labels: ${chartLabels},
          datasets: [{
            label: 'Median Price',
            data: ${chartData},
            borderColor: '#FF6B35',
            backgroundColor: 'rgba(255,107,53,0.08)',
            fill: true,
            tension: 0.3,
            pointRadius: 4,
            pointBackgroundColor: '#FF6B35'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: {
              min: ${(minVal - yPadding).toFixed(2)},
              max: ${(maxVal + yPadding).toFixed(2)},
              ticks: { callback: function(v) { return '$' + v.toFixed(2); } }
            }
          }
        }
      });
    })();
    </script>`;
    } else if (stateHistory && stateHistory.length > 0 && stateHistory.length < 3) {
      chartSectionHtml = `
    <section class="chart-section">
      <p class="chart-caption" style="text-align:center;color:var(--text-gray);font-size:0.9rem;">Price trend chart available as more data is collected.</p>
    </section>`;
    }

    // Price Alert Signup (only when lowestPrice > 0)
    if (lowestPrice && lowestPrice > 0) {
      priceAlertHtml = `
    <section class="state-alert-section">
      <h3>Get Email Alerts When ${FUEL.label} Prices Drop in ${escapeHtml(stateInfo.name)}</h3>
      <p>Get alerted when ${FUEL.label.toLowerCase()} prices drop in your area. No newsletters, only price alerts.</p>
      <div class="price-alert-card" data-zip="" data-price="${lowestPrice}"></div>
    </section>`;
    }

    // County Link List (lightweight secondary links)
    if (countyEliteData && countyEliteData.length > 0) {
      const countyLinkItems = countyEliteData.map(c =>
        `<a href="${FUEL.urlPrefix}/county/${stateCode.toLowerCase()}/${c.slug}">${escapeHtml(c.name)} County</a>`
      ).join(' &middot; ');
      countyLinkListHtml = `
    <section class="county-links-section">
      <h3>Browse by County</h3>
      <p class="county-link-list">${countyLinkItems}</p>
    </section>`;
    }

    // SEO Text Block
    const pricedCount = suppliers.filter(s => s.hasPrice).length;
    const trendContext = stateTrend
      ? (Math.abs(stateTrend) < 2 ? 'Prices have been stable over the past 6 weeks.'
        : `Prices are ${stateTrend > 0 ? 'up' : 'down'} ${Math.abs(stateTrend).toFixed(1)}% over the past 6 weeks.`)
      : '';
    const supplierPhrase = suppliers.length < 3
      ? `Currently tracking pricing data from ${pricedCount} supplier${pricedCount !== 1 ? 's' : ''} across ${countyEliteData?.length || 0} counties`
      : `based on pricing data from ${pricedCount} suppliers across ${countyEliteData?.length || 0} counties`;
    seoTextHtml = `
    <section class="seo-text">
      <h2>About ${FUEL.label} Prices in ${escapeHtml(stateInfo.name)}</h2>
      <p>The average ${FUEL.label.toLowerCase()} price today in ${escapeHtml(stateInfo.name)} is ${stateMedian ? '$' + stateMedian.toFixed(2) : 'N/A'} per gallon, ${supplierPhrase}. ${stats ? `Prices range from $${stats.min} to $${stats.max} per gallon.` : ''} ${trendContext}</p>
      <p>HomeHeat updates pricing daily from verified COD suppliers. All prices shown are for cash-on-delivery, will-call orders.</p>
    </section>`;

    // FAQ Section
    if (stateMedian) {
      const faqTrendAnswer = stateTrend
        ? (Math.abs(stateTrend) < 2
          ? `Heating oil prices in ${stateInfo.name} have been relatively stable over the past 6 weeks. The statewide median is currently $${stateMedian.toFixed(2)} per gallon. Prices typically peak in winter (December\u2013February) and dip in summer.`
          : `Heating oil prices in ${stateInfo.name} are ${stateTrend > 0 ? 'up' : 'down'} approximately ${Math.abs(stateTrend).toFixed(1)}% over the past 6 weeks. The current statewide median is $${stateMedian.toFixed(2)} per gallon. Prices typically peak in winter and dip in summer.`)
        : `The current statewide median is $${stateMedian.toFixed(2)} per gallon. Check back for trend data as more weekly pricing is collected.`;

      faqSectionHtml = `
    <section class="faq-section">
      <h2>Frequently Asked Questions</h2>
      <details class="faq-details">
        <summary>What is the current ${FUEL.label.toLowerCase()} price in ${escapeHtml(stateInfo.name)}?</summary>
        <div class="faq-content">
          <p>The median ${FUEL.label.toLowerCase()} price in ${escapeHtml(stateInfo.name)} today is $${stateMedian.toFixed(2)} per gallon${stats ? `, with prices ranging from $${stats.min} to $${stats.max}` : ''}. Prices are based on data from ${pricedCount} reporting suppliers across ${countyEliteData?.length || 0} counties.</p>
        </div>
      </details>
      <details class="faq-details">
        <summary>How many ${FUEL.label.toLowerCase()} suppliers are in ${escapeHtml(stateInfo.name)}?</summary>
        <div class="faq-content">
          <p>HomeHeat tracks ${suppliers.length} ${FUEL.label.toLowerCase()} suppliers across ${countyEliteData?.length || 0} counties in ${escapeHtml(stateInfo.name)}. Pricing data is updated daily from verified COD suppliers.</p>
        </div>
      </details>
      <details class="faq-details">
        <summary>Are ${FUEL.label.toLowerCase()} prices going up or down in ${escapeHtml(stateInfo.name)}?</summary>
        <div class="faq-content">
          <p>${faqTrendAnswer}</p>
        </div>
      </details>
    </section>`;
    }

    // Show regional links if available (e.g., Long Island, Hudson Valley)
    const regionSection = regionLinks && regionLinks.length > 0 ? `
    <section class="hub-links hub-links-featured">
      <h3>Popular Regions</h3>
      <div class="link-grid">
        ${regionLinks.map(r =>
          `<a href="${r.slug}" class="featured-link">${escapeHtml(r.name)} <span class="count">(${r.count})</span></a>`
        ).join('\n        ')}
      </div>
    </section>` : '';

    hubLinksHtml = regionSection;
  }

  if (type === 'region' && countyLinks && countyLinks.length > 0) {
    hubLinksHtml = `
    <section class="hub-links">
      <h3>Counties in ${data.region}</h3>
      <div class="link-grid">
        ${countyLinks.map(c =>
          `<a href="${c.slug}">${escapeHtml(c.name)} County <span class="count">(${c.count})</span></a>`
        ).join('\n        ')}
      </div>
    </section>`;
  }

  if (type === 'county' && cityLinks && cityLinks.length > 0) {
    hubLinksHtml = `
    <section class="hub-links">
      <h3>Cities in ${county} County</h3>
      <div class="link-grid">
        ${cityLinks.map(c =>
          `<a href="${c.slug}">${escapeHtml(c.name)} <span class="count">(${c.count})</span></a>`
        ).join('\n        ')}
      </div>
    </section>`;
  }

  if (type === 'city' && siblingCities && siblingCities.length > 0) {
    hubLinksHtml = `
    <section class="hub-links">
      <h3>Other Cities in ${county} County</h3>
      <div class="link-grid">
        ${siblingCities.map(c =>
          `<a href="${c.slug}">${escapeHtml(c.name)} <span class="count">(${c.count})</span></a>`
        ).join('\n        ')}
      </div>
    </section>`;
  }

  // Other states (for state pages)
  const otherStatesHtml = otherStates && otherStates.length > 0 ? `
    <section class="other-states">
      <h3>Prices in Other States</h3>
      <p>${otherStates.map(s => `<a href="/prices/${s.abbrev}/">${s.name}</a>`).join(' · ')}</p>
    </section>` : '';

  // Heating cost + avg bill + price trend cross-links (only link to pages that exist)
  let heatingCostLinkHtml = '';
  if (type === 'county' && county && stateInfo) {
    const countySlug = county.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const hcLink = crossLinkExists(`/heating-cost/${stateInfo.abbrev}/${countySlug}`) ? `<a href="/heating-cost/${stateInfo.abbrev}/${countySlug}" style="font-weight: 600;">Heating costs</a>` : '';
    const abLink = crossLinkExists(`/average-heating-bill/${stateInfo.abbrev}/${countySlug}`) ? `<a href="/average-heating-bill/${stateInfo.abbrev}/${countySlug}" style="font-weight: 600;">Average bill</a>` : '';
    const ptLink = crossLinkExists(`/price-trend/${stateInfo.abbrev}/${countySlug}`) ? `<a href="/price-trend/${stateInfo.abbrev}/${countySlug}" style="font-weight: 600;">Price trends</a>` : '';
    const links = [hcLink, abLink, ptLink].filter(Boolean).join(' | ');
    if (links) {
      heatingCostLinkHtml = `
      <section style="background: var(--primary-orange-light); padding: 1.25rem; border-radius: 8px; margin: 2rem 0;">
        <strong>What does heating cost in ${escapeHtml(county)} County?</strong>
        ${links}
      </section>`;
    }
  } else if (type === 'state' && stateInfo) {
    const hcLink = crossLinkExists(`/heating-cost/${stateInfo.abbrev}`) ? `<a href="/heating-cost/${stateInfo.abbrev}/" style="font-weight: 600;">Heating costs</a>` : '';
    const abLink = crossLinkExists(`/average-heating-bill/${stateInfo.abbrev}`) ? `<a href="/average-heating-bill/${stateInfo.abbrev}/" style="font-weight: 600;">Average bill</a>` : '';
    const ptLink = crossLinkExists(`/price-trend/${stateInfo.abbrev}`) ? `<a href="/price-trend/${stateInfo.abbrev}/" style="font-weight: 600;">Price trends</a>` : '';
    const links = [hcLink, abLink, ptLink].filter(Boolean).join(' | ');
    if (links) {
      heatingCostLinkHtml = `
      <section style="background: var(--primary-orange-light); padding: 1.25rem; border-radius: 8px; margin: 2rem 0;">
        <strong>What does heating cost in ${escapeHtml(stateInfo.name)}?</strong>
        ${links}
      </section>`;
    }
  }

  // Determine relative path depth for assets
  // Oil pages are at /prices/{state}/ = depth 2. Kerosene at /prices/kerosene/{state}/ = depth 3.
  const assetDepth = FUEL.fuelType === 'heating_oil' ? 2 : 3;
  const assetPath = '../'.repeat(assetDepth);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-HCNTVGNVJ9"></script>
  <script src="${assetPath}js/analytics.js"></script>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - Updated ${dateStr} | HomeHeat</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${canonicalUrl}">

  <!-- OpenGraph -->
  <meta property="og:title" content="${escapeHtml(title)} - ${dateStr}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:image" content="https://www.gethomeheat.com/images/screenshot-1-home.png">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:type" content="website">

  <meta name="color-scheme" content="light only">
  <link rel="stylesheet" href="${assetPath}style.min.css?v=${getFileHash('style.min.css')}">
  <link rel="icon" type="image/png" sizes="32x32" href="${assetPath}favicon-32.png">
  <meta name="apple-itunes-app" content="app-id=6747320571">
  <meta name="theme-color" content="#FF6B35">
  <link rel="manifest" href="${assetPath}manifest.json">

  <!-- Schema.org Structured Data -->
  <script type="application/ld+json">${JSON.stringify(breadcrumbSchema)}</script>
  ${datasetSchema ? `<script type="application/ld+json">${JSON.stringify(datasetSchema)}</script>` : ''}
  <script type="application/ld+json">${JSON.stringify(itemListSchema)}</script>
  ${faqSchema ? `<script type="application/ld+json">${JSON.stringify(faqSchema)}</script>` : ''}
  ${productSchema ? `<script type="application/ld+json">${JSON.stringify(productSchema)}</script>` : ''}
</head>
<body${zips && zips[0] ? ` data-zip="${zips[0]}"` : ''}>
  ${getNavHTML(assetDepth, '/prices')}

  <main class="seo-page">
    <!-- Breadcrumb -->
    <nav class="breadcrumb" aria-label="Breadcrumb">
      ${breadcrumbHtml}
    </nav>

    <header class="page-header">
      <h1>${escapeHtml(h1)}</h1>
      <p class="supplier-count">${type === 'state' && countyEliteData?.length ? `Prices updated daily &mdash; last updated ${dateStr}` : `${suppliers.length} suppliers · Updated ${dateStr}`}</p>
    </header>

    <!-- State Price Intelligence (state pages only) -->
    ${stateIntelligenceHtml}

    <!-- State Stats Bar (state pages only) -->
    ${stateStatsBarHtml}

    <!-- Trend Alert Banner (state pages only, conditional) -->
    ${trendAlertHtml}

    <!-- Market Intelligence Stats (non-state pages) -->
    ${type !== 'state' ? statsHtml : ''}

    <!-- Elite Page Banner (County directory pages only) -->
    ${eliteBannerHtml}

    <!-- County Price Comparison Table (state pages only — PRIMARY SEO feature) -->
    ${countyComparisonHtml}

    <!-- Regional Links (state pages only) -->
    ${type === 'state' ? hubLinksHtml : ''}

    <!-- Trend Chart (state pages only, conditional) -->
    ${chartSectionHtml}

    <!-- Price Alert Signup (state pages only, conditional) -->
    ${priceAlertHtml}

    <!-- Supplier Table -->
    <section class="supplier-table-section">
      <h2>${type === 'state' ? (suppliers.length < 3 ? `${FUEL.label} Suppliers Currently Reporting in ${stateInfo.name}` : 'Compare All Suppliers') : 'Compare Suppliers'}</h2>
      ${suppliers.length === 1 ? `
      <div class="single-supplier-detail">
        <p><strong>${escapeHtml(suppliers[0].name)}</strong> — ${escapeHtml(suppliers[0].city || '')}</p>
        ${suppliers[0].hasPrice ? `<p class="supplier-price">$${suppliers[0].price.toFixed(2)}/gal</p>` : ''}
        ${suppliers[0].phone ? `<p><a href="tel:${suppliers[0].phone}" class="phone-link">${escapeHtml(suppliers[0].phone)}</a></p>` : ''}
      </div>` : `
      <table class="supplier-table${isEnhancedTable ? ' supplier-table-enhanced' : ''}">
        <thead>
          <tr>
            <th>Supplier</th>
            <th>Location</th>
            <th>Price/Gal</th>
            ${isEnhancedTable ? '<th>Min Gal</th><th>Updated</th>' : ''}
            <th>Phone</th>
            <th>Website</th>
          </tr>
        </thead>
        <tbody>
${supplierRows}
        </tbody>
      </table>`}
    </section>

    <!-- County Link List (state pages only) -->
    ${countyLinkListHtml}

    <!-- Disclaimer -->
    <p class="disclaimer">
      Prices shown are reported by suppliers. Actual delivered prices may vary by volume and payment method. Always confirm when ordering.
    </p>

    <!-- SEO Text Block (state pages only) -->
    ${seoTextHtml}

    <!-- FAQ Section (state pages only) -->
    ${faqSectionHtml}

    <!-- App CTA -->
    <section class="zip-cta app-cta-inline">
      <h3>Never Run Out of Oil</h3>
      <p>HomeHeat tracks your usage and predicts when you'll need your next delivery &mdash; no sensors required.</p>
      <a href="https://apps.apple.com/us/app/homeheat/id6747320571?utm_source=web_seo&utm_medium=website&utm_campaign=seo_price_page" class="cta-button hide-on-android">Get HomeHeat Free &rarr;</a>
      <a href="/prices" class="cta-button android-only" style="display:none" onclick="if(window.showPwaInstallBanner){window.showPwaInstallBanner();event.preventDefault()}">Save HomeHeat to Your Phone &rarr;</a>
      <p style="font-size:0.8rem;color:var(--text-gray);margin:0.75rem 0 0" class="hide-on-android">Free app. No hardware. No ads.</p>
      <p class="android-only" style="display:none;font-size:0.8rem;color:var(--text-gray);margin:0.75rem 0 0">Works like an app &mdash; no download needed.</p>
    </section>

    <!-- Cross-sell: Heating Cost Comparison -->
    ${heatingCostLinkHtml}

    <!-- V3.1.0: Cross-fuel link for county pages (oil ↔ kerosene) -->
    ${type === 'county' && county && stateInfo && crossLinkExists(`${FUEL.crossLinkUrl}/${stateInfo.abbrev}/${county.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-county`) ? `
    <section class="cross-fuel-banner">
      <h3>Also Available in ${escapeHtml(county)} County</h3>
      <a href="${FUEL.crossLinkUrl}/${stateInfo.abbrev}/${county.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-county" class="cross-fuel-link">View ${FUEL.crossLinkLabel} Prices in ${escapeHtml(county)} County →</a>
    </section>` : ''}

    <!-- Hub Links (Counties/Cities) - for non-state pages -->
    ${type !== 'state' ? hubLinksHtml : ''}

    <!-- ZIP Lookup CTA -->
    <section class="zip-cta">
      <h3>Find prices in your exact area</h3>
      <p>Enter your ZIP code for suppliers that deliver to your address.</p>
      <a href="/prices" class="cta-button">Check My ZIP Code &rarr;</a>
    </section>

    <!-- Other States -->
    ${otherStatesHtml}

    ${crossLinkStateMap.has(stateCode) ? `
    <!-- V2.12.0: Cross-link to other fuel -->
    <section class="cross-fuel-banner">
      <h3>Also Available in ${escapeHtml(stateInfo.name)}</h3>
      <p>${FUEL.crossLinkLabel} Prices — ${crossLinkStateMap.get(stateCode)} suppliers reporting</p>
      <a href="${FUEL.crossLinkUrl}/${stateInfo.abbrev}/" class="cross-fuel-link">View ${FUEL.crossLinkLabel} Prices →</a>
    </section>` : ''}

    <!-- Trust Footer -->
    <p class="trust-footer">
      Data updated daily by HomeHeat · <a href="/">gethomeheat.com</a>
    </p>
  </main>

  <!-- Floating App Download Icon (iOS mobile only) -->
  <div class="floating-app-wrapper ios-only" id="floating-app-wrapper">
    <button class="floating-app-dismiss" aria-label="Dismiss">&times;</button>
    <a href="https://apps.apple.com/us/app/homeheat/id6747320571?utm_source=web_seo&utm_medium=website&utm_campaign=seo_floating" class="floating-app-icon" id="floating-app-cta">
      <img src="${assetPath}images/app-icon.png" alt="HomeHeat" width="180" height="180">
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
    <p>&copy; 2026 HomeHeat by Tsoir Advisors LLC. All rights reserved.</p>
  </footer>

  <script src="${assetPath}js/nav.js"></script>
  <script src="${assetPath}js/widgets.js"></script>
  <script src="${assetPath}js/seo-tracking.js"></script>
  <script src="${assetPath}js/pwa.js"></script>
  ${priceAlertHtml ? `<script src="${assetPath}js/price-alerts.js?v=${getFileHash('js/price-alerts.js')}"></script>\n  <script src="${assetPath}js/platform-detection.js?v=${getFileHash('js/platform-detection.js')}"></script>` : ''}
</body>
</html>`;
}

/**
 * V2.17.0: Update prices.html with fresh leaderboard data
 * Replaces the hardcoded state averages and top deals sections
 */
async function updatePricesHtml(pricesHtmlPath, states, prices, suppliers, FUEL) {
  FUEL = FUEL && FUEL.label ? FUEL : FUEL_CONFIGS.heating_oil;
  let html = await fs.readFile(pricesHtmlPath, 'utf-8');

  // Calculate state averages (same logic as generateLeaderboardSnippet)
  const stateData = [];
  for (const state of states) {
    const stateSuppliers = suppliers.filter(s =>
      s.state === state.abbrev.toUpperCase() && s.allow_price_display !== false
    );
    const statePrices = prices.filter(p =>
      stateSuppliers.some(s => s.id === p.supplier_id)
    );

    if (statePrices.length >= 3) {
      const avg = statePrices.reduce((a, b) => a + b.price, 0) / statePrices.length;
      stateData.push({
        ...state,
        avg: avg.toFixed(2),
        count: statePrices.length
      });
    }
  }
  stateData.sort((a, b) => parseFloat(a.avg) - parseFloat(b.avg));

  // Top 5 deals
  const displayableSuppliers = suppliers.filter(s => s.allow_price_display !== false);
  const validPrices = prices
    .filter(p => {
      const supplier = displayableSuppliers.find(s => s.id === p.supplier_id);
      return supplier && p.price >= MIN_VALID_PRICE && p.price <= MAX_VALID_PRICE;
    })
    .sort((a, b) => a.price - b.price)
    .slice(0, 5);

  const topDeals = validPrices.map(p => {
    const supplier = suppliers.find(s => s.id === p.supplier_id);
    return {
      price: p.price.toFixed(2),
      supplier: supplier?.name || 'Unknown',
      city: supplier?.city || '',
      state: supplier?.state || ''
    };
  });

  // Generate new state averages table rows (escape $ as $$ for regex replacement)
  const stateRows = stateData.map(s =>
    `                        <tr>\n` +
    `                            <td><a href="${FUEL.urlPrefix}/${s.abbrev}/">${s.name}</a></td>\n` +
    `                            <td>$$${s.avg} avg</td>\n` +
    `                            <td>${s.count} suppliers</td>\n` +
    `                            <td><a href="${FUEL.urlPrefix}/${s.abbrev}/">See all →</a></td>\n` +
    `                        </tr>`
  ).join('\n');

  // Generate new top deals items (escape $ as $$ for regex replacement)
  // Must match the HTML structure: deal-info wrapper with deal-supplier/deal-location divs
  const dealItems = topDeals.map(d =>
    `                    <li>\n` +
    `                        <span class="deal-price">$$${d.price}/gal</span>\n` +
    `                        <div class="deal-info">\n` +
    `                            <div class="deal-supplier">${escapeHtml(d.supplier)}</div>\n` +
    `                            <div class="deal-location">${escapeHtml(d.city)}, ${d.state}</div>\n` +
    `                        </div>\n` +
    `                    </li>`
  ).join('\n');

  // Update leaderboard date
  const dateStr = formatDate();
  html = html.replace(
    /<p class="leaderboard-date"[^>]*>.*?<\/p>/,
    `<p class="leaderboard-date" id="leaderboard-date">Updated ${dateStr}</p>`
  );

  // Replace state averages table body content (between <tbody> and </tbody>)
  // Class name must match HTML: averages-table-v2
  const stateTableRegex = /<table class="averages-table-v2">\s*<tbody>[\s\S]*?<\/tbody>\s*<\/table>/;
  if (stateTableRegex.test(html)) {
    html = html.replace(stateTableRegex,
      `<table class="averages-table-v2">\n                    <tbody>\n${stateRows}\n                    </tbody>\n                </table>`
    );
  }

  // Replace top deals list content (between <ul class="deals-list-v2"> and </ul>)
  const dealsListRegex = /<ul class="deals-list-v2">[\s\S]*?<\/ul>/;
  if (dealsListRegex.test(html)) {
    html = html.replace(dealsListRegex,
      `<ul class="deals-list-v2">\n${dealItems}\n                </ul>`
    );
  }

  // Update lowest-price-card with #1 deal data
  if (topDeals.length > 0) {
    const best = topDeals[0];
    const overallAvg = prices.length > 0
      ? (prices.reduce((sum, p) => sum + p.price, 0) / prices.length)
      : 0;
    const delta = overallAvg > 0 ? (overallAvg - parseFloat(best.price)).toFixed(2) : null;

    // Find ZIP for the best deal supplier
    const bestSupplier = suppliers.find(s => s.name === best.supplier || s.id === (validPrices[0] && validPrices[0].supplier_id));
    const bestZip = bestSupplier?.postal_code || '';

    const lowestCardRegex = /<div class="lowest-price-card" id="lowest-price-card"[^>]*>[\s\S]*?<\/div>/;
    const lowestCardHtml = `<div class="lowest-price-card" id="lowest-price-card" style="min-height: 120px;">
                <p class="lowest-label">Lowest ${FUEL.label} Price Today</p>
                <span class="lowest-value">$$${best.price}/gal</span>
                ${delta ? `<span class="lowest-vs-avg">$$${delta} below Northeast average</span>` : ''}
                <p class="lowest-supplier">${escapeHtml(best.supplier)} — ${escapeHtml(best.city)}, ${best.state}${bestZip ? ' (' + bestZip + ')' : ''}</p>
            </div>`;
    if (lowestCardRegex.test(html)) {
      html = html.replace(lowestCardRegex, lowestCardHtml);
    }
  }

  // Update market pulse counts
  const totalSuppliers = suppliers.filter(s => s.allow_price_display !== false).length;
  const totalStates = new Set(suppliers.map(s => s.state)).size;
  html = html.replace(/<span id="pulse-suppliers">[^<]*<\/span>/, `<span id="pulse-suppliers">${totalSuppliers}+</span>`);
  html = html.replace(/<span id="pulse-states">[^<]*<\/span>/, `<span id="pulse-states">${totalStates}</span>`);

  // Update ItemList schema with top deals data
  const schemaRegex = /<script id="schema-markup" type="application\/ld\+json">[\s\S]*?<\/script>/;
  if (schemaRegex.test(html) && topDeals.length > 0) {
    const schema = {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "name": `${FUEL.label} Prices Near You`,
      "description": `Compare current ${FUEL.label.toLowerCase()} prices from local suppliers across the Northeast United States.`,
      "publisher": {
        "@type": "Organization",
        "name": "HomeHeat",
        "url": "https://www.gethomeheat.com"
      },
      "breadcrumb": {
        "@type": "BreadcrumbList",
        "itemListElement": [
          {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.gethomeheat.com/"},
          {"@type": "ListItem", "position": 2, "name": "Prices"}
        ]
      },
      "mainEntity": {
        "@type": "ItemList",
        "name": `${FUEL.label} Price Comparison`,
        "description": `Current ${FUEL.label.toLowerCase()} prices from local suppliers`,
        "itemListOrder": "https://schema.org/ItemListOrderAscending",
        "numberOfItems": topDeals.length,
        "itemListElement": topDeals.map((d, i) => ({
          "@type": "ListItem",
          "position": i + 1,
          "item": {
            "@type": "Product",
            "name": `${FUEL.label} from ${d.supplier}`,
            "description": `Heating oil delivery in ${d.city}, ${d.state}`,
            "image": "https://www.gethomeheat.com/images/heating-oil-product.jpg",
            "brand": {
              "@type": "Brand",
              "name": "#2 Heating Oil"
            },
            "category": "Heating Fuel",
            "offers": {
              "@type": "Offer",
              "price": d.price,
              "priceCurrency": "USD",
              "unitCode": "GLL",
              "availability": "https://schema.org/InStock",
              "priceValidUntil": new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
            }
          }
        }))
      }
    };
    html = html.replace(schemaRegex,
      `<script id="schema-markup" type="application/ld+json">\n    ${JSON.stringify(schema, null, 4)}\n    </script>`
    );
  }

  await fs.writeFile(pricesHtmlPath, html, 'utf-8');
}

/**
 * Generate national leaderboard snippet for prices.html
 */
function generateLeaderboardSnippet(states, prices, suppliers, FUEL) {
  const dateStr = formatDate();

  // Calculate state averages
  const stateData = [];
  for (const state of states) {
    const stateSuppliers = suppliers.filter(s => s.state === state.abbrev.toUpperCase());
    const statePrices = prices.filter(p =>
      stateSuppliers.some(s => s.id === p.supplier_id)
    );

    if (statePrices.length >= 3) {
      const avg = statePrices.reduce((a, b) => a + b.price, 0) / statePrices.length;
      stateData.push({
        ...state,
        avg: avg.toFixed(2),
        count: statePrices.length
      });
    }
  }
  stateData.sort((a, b) => parseFloat(a.avg) - parseFloat(b.avg));

  // Top 5 deals
  const validPrices = prices
    .filter(p => p.price >= MIN_VALID_PRICE && p.price <= MAX_VALID_PRICE)
    .sort((a, b) => a.price - b.price)
    .slice(0, 5);

  const topDeals = validPrices.map(p => {
    const supplier = suppliers.find(s => s.id === p.supplier_id);
    return {
      price: p.price.toFixed(2),
      supplier: supplier?.name || 'Unknown',
      city: supplier?.city || '',
      state: supplier?.state || ''
    };
  });

  const stateRows = stateData.map(s => `
        <tr>
          <td><a href="${FUEL.urlPrefix}/${s.abbrev}/">${s.name}</a></td>
          <td>$${s.avg} avg</td>
          <td>${s.count} suppliers</td>
          <td><a href="${FUEL.urlPrefix}/${s.abbrev}/">See all →</a></td>
        </tr>`).join('\n');

  const topDealItems = topDeals.map(d => `
        <li class="deal-item">
          <span class="deal-price">$${d.price}/gal</span>
          <span class="deal-supplier">${escapeHtml(d.supplier)}</span>
          <span class="deal-location">${escapeHtml(d.city)}, ${d.state}</span>
        </li>`).join('\n');

  return `<!-- SEO LEADERBOARD - Auto-generated ${new Date().toISOString()} -->
<!-- Insert this after the prices-hero section in prices.html -->

<section id="default-leaderboard" class="default-leaderboard">
  <h2>Today's ${FUEL.label} Prices Across the Northeast</h2>
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
  "name": `${FUEL.label} Prices - Northeast US`,
  "description": `Current ${FUEL.label.toLowerCase()} prices across the Northeast United States`,
  "numberOfItems": topDeals.length,
  "itemListElement": topDeals.map((d, i) => ({
    "@type": "ListItem",
    "position": i + 1,
    "item": {
      "@type": "Service",
      "name": `${FUEL.label} Delivery in ${d.city}, ${d.state}`,
      "description": `Heating oil delivery service in ${d.city}, ${d.state}. Current price: $${d.price} per gallon.`,
      "image": "https://www.gethomeheat.com/images/app-icon.png",
      "serviceType": `${FUEL.label} Delivery`,
      "areaServed": `${d.city}, ${d.state}`,
      "priceSpecification": {
        "@type": "UnitPriceSpecification",
        "price": d.price,
        "priceCurrency": "USD",
        "unitCode": "GLL",
        "unitText": "gallon"
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
function generateSitemap(pages, suppliers = []) {
  const today = new Date().toISOString().split('T')[0];

  // Heating cost page sitemap fragment (generated by generate-heating-cost-pages.js)
  let heatingCostUrls = '';
  try {
    const fragmentPath = path.join(WEBSITE_DIR, 'heating-cost', '_sitemap-fragment.xml');
    if (fsSync.existsSync(fragmentPath)) {
      heatingCostUrls = fsSync.readFileSync(fragmentPath, 'utf-8');
    }
  } catch (e) {
    // Fragment may not exist yet — that's fine
  }

  // Average heating bill fragment (generated by generate-avg-bill-pages.js)
  let avgBillUrls = '';
  try {
    const fragmentPath = path.join(WEBSITE_DIR, 'average-heating-bill', '_sitemap-fragment.xml');
    if (fsSync.existsSync(fragmentPath)) {
      avgBillUrls = fsSync.readFileSync(fragmentPath, 'utf-8');
    }
  } catch (e) {}

  // Price trend fragment (generated by generate-price-trend-pages.js)
  let priceTrendUrls = '';
  try {
    const fragmentPath = path.join(WEBSITE_DIR, 'price-trend', '_sitemap-fragment.xml');
    if (fsSync.existsSync(fragmentPath)) {
      priceTrendUrls = fsSync.readFileSync(fragmentPath, 'utf-8');
    }
  } catch (e) {}


  // Supplier profile pages
  const supplierUrls = suppliers
    .filter(s => s.slug)
    .map(s => `
  <url>
    <loc>https://www.gethomeheat.com/supplier/${s.slug}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.5</priority>
  </url>`).join('');

  const stateUrls = pages.states.map(s => `
  <url>
    <loc>https://www.gethomeheat.com/prices/${s.abbrev}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`).join('');

  const regionUrls = pages.regions.map(r => `
  <url>
    <loc>https://www.gethomeheat.com/prices/${r.state}/${r.slug}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.75</priority>
  </url>`).join('');

  const countyUrls = pages.counties.map(c => `
  <url>
    <loc>https://www.gethomeheat.com/prices/${c.state}/${c.slug}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
  </url>`).join('');

  const cityUrls = pages.cities.map(c => `
  <url>
    <loc>https://www.gethomeheat.com/prices/${c.state}/${c.slug}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.6</priority>
  </url>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://www.gethomeheat.com/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://www.gethomeheat.com/prices</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
${stateUrls}
${regionUrls}
${countyUrls}
${cityUrls}
  <url>
    <loc>https://www.gethomeheat.com/for-suppliers</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://www.gethomeheat.com/how-prices-work</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://www.gethomeheat.com/learn/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://www.gethomeheat.com/learn/heating-oil-usage</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://www.gethomeheat.com/learn/heating-oil-winter</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://www.gethomeheat.com/learn/measure-heating-oil</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://www.gethomeheat.com/learn/cheapest-way-to-heat-your-home</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://www.gethomeheat.com/learn/heating-oil-vs-natural-gas</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://www.gethomeheat.com/learn/heating-oil-vs-heat-pump</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://www.gethomeheat.com/learn/heating-oil-vs-electric-heat</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://www.gethomeheat.com/learn/heating-emergency</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://www.gethomeheat.com/learn/run-out-of-heating-oil</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://www.gethomeheat.com/learn/why-people-run-out-of-oil</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://www.gethomeheat.com/tools/heating-cost-calculator</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://www.gethomeheat.com/privacy</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.3</priority>
  </url>
  <url>
    <loc>https://www.gethomeheat.com/terms</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.3</priority>
  </url>
  <url>
    <loc>https://www.gethomeheat.com/support</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.4</priority>
  </url>
${supplierUrls}
${heatingCostUrls}
${avgBillUrls}
${priceTrendUrls}
</urlset>`;
}

/**
 * Create redirect files for legacy URLs (e.g., /prices/new-york.html -> /prices/ny/)
 */
async function createLegacyRedirects(pricesDir, states) {
  const legacySlugs = {
    'NY': 'new-york',
    'CT': 'connecticut',
    'MA': 'massachusetts',
    'NJ': 'new-jersey',
    'PA': 'pennsylvania',
    'RI': 'rhode-island',
    'NH': 'new-hampshire',
    'ME': 'maine',
    'AK': 'alaska'
  };

  for (const state of states) {
    const stateCode = state.abbrev.toUpperCase();
    const legacySlug = legacySlugs[stateCode];
    if (!legacySlug) continue;

    const redirectHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="refresh" content="0; url=/prices/${state.abbrev}/">
  <link rel="canonical" href="https://www.gethomeheat.com/prices/${state.abbrev}/">
  <title>Redirecting...</title>
</head>
<body>
  <p>Redirecting to <a href="/prices/${state.abbrev}/">new location</a>...</p>
</body>
</html>`;

    await fs.writeFile(path.join(pricesDir, `${legacySlug}.html`), redirectHtml, 'utf-8');
  }
}

// Utility functions
function slugify(str) {
  return str
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function toTitleCase(str) {
  // Handle special abbreviations and compound words
  const specialCases = {
    'ny': 'NY', 'ct': 'CT', 'ma': 'MA', 'nj': 'NJ', 'pa': 'PA',
    'ri': 'RI', 'nh': 'NH', 'me': 'ME', 'ak': 'AK', 'vt': 'VT',
    'and': 'and', 'of': 'of', 'the': 'the', 'in': 'in'
  };

  return str
    .toLowerCase()
    .split(' ')
    .map((word, index) => {
      if (specialCases[word] && index > 0) return specialCases[word];
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

function formatDate() {
  return new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}

function formatTime() {
  return new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  });
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
module.exports = { generateSEOPages };

// Run directly if executed from command line
if (require.main === module) {
  generateSEOPages()
    .then(result => {
      if (result?.success) {
        console.log('\n✅ SEO pages generated successfully');
        console.log(`   States: ${result.states}, Counties: ${result.counties}, Cities: ${result.cities}`);
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
