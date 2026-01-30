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
const path = require('path');
require('dotenv').config();

// Import location resolver for ZIP lookups
const locationResolver = require('../src/services/locationResolver');

// Configuration
const WEBSITE_DIR = path.join(__dirname, '../website');
const PRICES_DIR = path.join(WEBSITE_DIR, 'prices');
const MIN_SUPPLIERS_FOR_PAGE = 3;  // Threshold for generating a page
const MIN_VALID_PRICE = 2.00;       // Filter out data errors
const MAX_VALID_PRICE = 6.00;       // Filter out data errors

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
  'AK': { name: 'Alaska', abbrev: 'ak' }
};

// Parse CLI args
const args = process.argv.slice(2);
const cliDryRun = args.includes('--dry-run');

/**
 * Main entry point
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

    const pricesDir = outputDir ? path.join(outputDir, 'prices') : PRICES_DIR;
    const websiteDir = outputDir || WEBSITE_DIR;

    // 1. Get all suppliers with their service areas
    const suppliers = await getAllSuppliers(sequelize);
    log(`📊 Found ${suppliers.length} active suppliers`);

    // 2. Get all current prices
    const prices = await getCurrentPrices(sequelize);
    log(`💰 Found ${prices.length} current prices`);

    // Create price lookup map
    const priceMap = new Map();
    for (const p of prices) {
      priceMap.set(p.supplier_id, p);
    }

    // 3. Track generated pages for sitemap
    const generatedPages = {
      states: [],
      counties: [],
      cities: []
    };

    // 4. Process each state
    for (const [stateCode, stateInfo] of Object.entries(STATES)) {
      log(`\n📍 Processing ${stateInfo.name}...`);

      // Create state directory
      const stateDir = path.join(pricesDir, stateInfo.abbrev);
      if (!dryRun) {
        await fs.mkdir(stateDir, { recursive: true });
      }

      // Get suppliers for this state (by physical location OR service area)
      const stateSuppliers = suppliers.filter(s =>
        s.state === stateCode ||
        (s.service_counties && s.service_counties.some(c => c.includes(stateCode)))
      );

      if (stateSuppliers.length < MIN_SUPPLIERS_FOR_PAGE) {
        log(`   ⏭️  Skipping ${stateCode} (only ${stateSuppliers.length} suppliers)`);
        continue;
      }

      // A. Generate State Hub Page
      const statePageData = await generateStateHubPage(
        stateCode, stateInfo, suppliers, priceMap, sequelize
      );

      if (statePageData) {
        const statePath = path.join(stateDir, 'index.html');
        if (!dryRun) {
          await fs.writeFile(statePath, statePageData.html, 'utf-8');
        }
        log(`   ✅ State: ${stateInfo.abbrev}/index.html (${statePageData.supplierCount} suppliers)`);
        generatedPages.states.push({
          abbrev: stateInfo.abbrev,
          name: stateInfo.name,
          supplierCount: statePageData.supplierCount
        });
      }

      // B. Generate County Pages
      const counties = locationResolver.getCountiesForState(stateCode);
      for (const county of counties) {
        const countyData = await generateCountyPage(
          stateCode, stateInfo, county, suppliers, priceMap, sequelize
        );

        if (countyData && countyData.supplierCount >= MIN_SUPPLIERS_FOR_PAGE) {
          const countySlug = slugify(county) + '-county';
          const countyPath = path.join(stateDir, `${countySlug}.html`);
          if (!dryRun) {
            await fs.writeFile(countyPath, countyData.html, 'utf-8');
          }
          log(`   ✅ County: ${stateInfo.abbrev}/${countySlug}.html (${countyData.supplierCount} suppliers)`);
          generatedPages.counties.push({
            state: stateInfo.abbrev,
            stateName: stateInfo.name,
            county: county,
            slug: countySlug,
            supplierCount: countyData.supplierCount
          });
        }
      }

      // C. Generate City Pages
      const cities = locationResolver.getCitiesForState(stateCode);
      for (const city of cities) {
        const cityData = await generateCityPage(
          stateCode, stateInfo, city, suppliers, priceMap, sequelize
        );

        if (cityData && cityData.supplierCount >= MIN_SUPPLIERS_FOR_PAGE) {
          const citySlug = slugify(city);
          const cityPath = path.join(stateDir, `${citySlug}.html`);
          if (!dryRun) {
            await fs.writeFile(cityPath, cityData.html, 'utf-8');
          }
          log(`   ✅ City: ${stateInfo.abbrev}/${citySlug}.html (${cityData.supplierCount} suppliers)`);
          generatedPages.cities.push({
            state: stateInfo.abbrev,
            stateName: stateInfo.name,
            city: city,
            county: cityData.county,
            slug: citySlug,
            supplierCount: cityData.supplierCount
          });
        }
      }
    }

    // 5. Generate national leaderboard snippet
    const leaderboardHtml = generateLeaderboardSnippet(generatedPages.states, prices, suppliers);
    const leaderboardPath = path.join(pricesDir, '_leaderboard-snippet.html');
    if (!dryRun) {
      await fs.writeFile(leaderboardPath, leaderboardHtml, 'utf-8');
    }
    log(`\n✅ Generated _leaderboard-snippet.html`);

    // 6. Update sitemap
    const sitemapPath = path.join(websiteDir, 'sitemap.xml');
    const sitemap = generateSitemap(generatedPages);
    if (!dryRun) {
      await fs.writeFile(sitemapPath, sitemap, 'utf-8');
    }
    log(`✅ Updated sitemap.xml`);

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
    log(`  County pages: ${generatedPages.counties.length}`);
    log(`  City pages: ${generatedPages.cities.length}`);
    log(`  Total pages: ${generatedPages.states.length + generatedPages.counties.length + generatedPages.cities.length}`);

    if (shouldCloseConnection) await sequelize.close();
    return {
      success: true,
      states: generatedPages.states.length,
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

/**
 * Get all active suppliers with service areas
 */
async function getAllSuppliers(sequelize) {
  const [results] = await sequelize.query(`
    SELECT
      id,
      name,
      city,
      state,
      phone,
      website,
      postal_codes_served,
      service_counties,
      allow_price_display
    FROM suppliers
    WHERE active = true
    ORDER BY name
  `);
  return results;
}

/**
 * Get current valid prices
 */
async function getCurrentPrices(sequelize) {
  const [results] = await sequelize.query(`
    SELECT DISTINCT ON (supplier_id)
      supplier_id,
      price_per_gallon as price,
      min_gallons,
      scraped_at,
      source_type
    FROM supplier_prices
    WHERE is_valid = true
      AND expires_at > NOW()
      AND price_per_gallon BETWEEN $1 AND $2
    ORDER BY supplier_id, scraped_at DESC
  `, {
    bind: [MIN_VALID_PRICE, MAX_VALID_PRICE]
  });

  return results.map(r => ({
    ...r,
    price: parseFloat(r.price)
  }));
}

/**
 * Get suppliers serving a specific set of ZIP codes
 */
function getSuppliersForZips(suppliers, zips, priceMap) {
  const zipSet = new Set(zips);
  const matching = [];

  for (const supplier of suppliers) {
    const servedZips = supplier.postal_codes_served || [];
    const servesArea = servedZips.some(z => zipSet.has(z));

    if (servesArea) {
      const priceInfo = priceMap.get(supplier.id);
      matching.push({
        ...supplier,
        price: priceInfo?.price || null,
        minGallons: priceInfo?.min_gallons || null,
        priceSource: priceInfo?.source_type || null,
        hasPrice: !!priceInfo
      });
    }
  }

  // Sort: priced suppliers first (by price), then phone-only
  matching.sort((a, b) => {
    if (a.hasPrice && !b.hasPrice) return -1;
    if (!a.hasPrice && b.hasPrice) return 1;
    if (a.hasPrice && b.hasPrice) return a.price - b.price;
    return a.name.localeCompare(b.name);
  });

  return matching;
}

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
 */
async function generateStateHubPage(stateCode, stateInfo, allSuppliers, priceMap, sequelize) {
  // Get all ZIPs for this state's counties
  const counties = locationResolver.getCountiesForState(stateCode);
  const allZips = new Set();

  for (const county of counties) {
    const zips = locationResolver.getZipsForCounty(county, stateCode);
    zips.forEach(z => allZips.add(z));
  }

  const suppliers = getSuppliersForZips(allSuppliers, Array.from(allZips), priceMap);

  if (suppliers.length < MIN_SUPPLIERS_FOR_PAGE) {
    return null;
  }

  const stats = calculateMarketStats(suppliers);
  const dateStr = formatDate();
  const timeStr = formatTime();

  // Get counties with enough suppliers for links
  const countyLinks = [];
  for (const county of counties) {
    const zips = locationResolver.getZipsForCounty(county, stateCode);
    const countySuppliers = getSuppliersForZips(allSuppliers, zips, priceMap);
    if (countySuppliers.length >= MIN_SUPPLIERS_FOR_PAGE) {
      countyLinks.push({
        name: toTitleCase(county),
        slug: slugify(county) + '-county',
        count: countySuppliers.length
      });
    }
  }
  countyLinks.sort((a, b) => b.count - a.count);

  const html = generatePageHTML({
    type: 'state',
    title: `Heating Oil Prices in ${stateInfo.name}`,
    h1: `Heating Oil Prices in ${stateInfo.name}`,
    description: `Compare ${suppliers.length} heating oil suppliers in ${stateInfo.name}. ${stats ? `Prices from $${stats.min} to $${stats.max}/gal.` : ''} Updated daily.`,
    canonicalUrl: `https://www.gethomeheat.com/prices/${stateInfo.abbrev}/`,
    breadcrumbs: [
      { name: 'Home', url: '/' },
      { name: 'Prices', url: '/prices.html' },
      { name: stateInfo.name, url: null }
    ],
    stats,
    suppliers,
    dateStr,
    timeStr,
    stateInfo,
    stateCode,
    countyLinks,
    otherStates: Object.entries(STATES)
      .filter(([code]) => code !== stateCode)
      .map(([code, info]) => ({ name: info.name, abbrev: info.abbrev }))
  });

  return { html, supplierCount: suppliers.length };
}

/**
 * Generate County Page
 */
async function generateCountyPage(stateCode, stateInfo, county, allSuppliers, priceMap, sequelize) {
  const zips = locationResolver.getZipsForCounty(county, stateCode);

  if (zips.length === 0) {
    return null;
  }

  const suppliers = getSuppliersForZips(allSuppliers, zips, priceMap);

  if (suppliers.length < MIN_SUPPLIERS_FOR_PAGE) {
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
      if (citySuppliers.length >= MIN_SUPPLIERS_FOR_PAGE) {
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
    title: `Heating Oil Prices in ${countyName} County, ${stateInfo.name}`,
    h1: `${countyName} County Heating Oil Prices`,
    description: `Compare ${suppliers.length} heating oil suppliers in ${countyName} County, ${stateCode}. ${stats ? `Prices from $${stats.min} to $${stats.max}/gal.` : ''} Updated daily.`,
    canonicalUrl: `https://www.gethomeheat.com/prices/${stateInfo.abbrev}/${countySlug}.html`,
    breadcrumbs: [
      { name: 'Home', url: '/' },
      { name: 'Prices', url: '/prices.html' },
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
  });

  return { html, supplierCount: suppliers.length, county };
}

/**
 * Generate City Page
 */
async function generateCityPage(stateCode, stateInfo, city, allSuppliers, priceMap, sequelize) {
  const zips = locationResolver.getZipsForCity(city, stateCode);

  if (zips.length === 0) {
    return null;
  }

  const suppliers = getSuppliersForZips(allSuppliers, zips, priceMap);

  if (suppliers.length < MIN_SUPPLIERS_FOR_PAGE) {
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
        if (otherSuppliers.length >= MIN_SUPPLIERS_FOR_PAGE) {
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
    title: `Heating Oil Prices in ${cityName}, ${stateCode}`,
    h1: `${cityName} Heating Oil Prices`,
    description: `Compare ${suppliers.length} heating oil suppliers in ${cityName}, ${stateCode}. ${stats ? `Prices from $${stats.min} to $${stats.max}/gal.` : ''} Updated daily.`,
    canonicalUrl: `https://www.gethomeheat.com/prices/${stateInfo.abbrev}/${citySlug}.html`,
    breadcrumbs: [
      { name: 'Home', url: '/' },
      { name: 'Prices', url: '/prices.html' },
      { name: stateInfo.name, url: `/prices/${stateInfo.abbrev}/` },
      ...(countyNameFormatted ? [{ name: `${countyNameFormatted} County`, url: `/prices/${stateInfo.abbrev}/${slugify(countyName)}-county.html` }] : []),
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
    siblingCities: siblingCities.slice(0, 10).map(s => ({ ...s, name: toTitleCase(s.name) }))  // Limit to 10
  });

  return { html, supplierCount: suppliers.length, county: countyName };
}

/**
 * Generate page HTML (shared template)
 */
function generatePageHTML(data) {
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
    countyLinks,
    cityLinks,
    siblingCities,
    otherStates
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
  const pricedSuppliers = suppliers.filter(s => s.hasPrice).slice(0, 25);
  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": title,
    "numberOfItems": pricedSuppliers.length,
    "itemListElement": pricedSuppliers.map((s, i) => ({
      "@type": "ListItem",
      "position": i + 1,
      "item": {
        "@type": "Product",
        "name": `Heating Oil from ${s.name}`,
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
    }))
  };

  // Generate breadcrumb HTML
  const breadcrumbHtml = breadcrumbs.map((b, i) =>
    b.url
      ? `<a href="${b.url}">${escapeHtml(b.name)}</a>`
      : `<span>${escapeHtml(b.name)}</span>`
  ).join(' › ');

  // Generate supplier table
  const supplierRows = suppliers.map(s => {
    const hasValidWebsite = s.website && s.website.startsWith('https://');
    return `
        <tr>
          <td class="supplier-name">${escapeHtml(s.name)}</td>
          <td class="supplier-city">${escapeHtml(s.city || '')}</td>
          <td class="supplier-price">${s.hasPrice ? `$${s.price.toFixed(2)}` : '<span class="call-for-price">Call</span>'}</td>
          <td class="supplier-phone">${s.phone ? `<a href="tel:${s.phone}" class="phone-link">${escapeHtml(s.phone)}</a>` : '—'}</td>
          <td class="supplier-website">${hasValidWebsite ? `<a href="${escapeHtml(s.website)}" target="_blank" rel="noopener noreferrer" class="website-link">Website</a>` : ''}</td>
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

  // Hub links section
  let hubLinksHtml = '';

  if (type === 'state' && countyLinks && countyLinks.length > 0) {
    hubLinksHtml = `
    <section class="hub-links">
      <h3>Counties in ${stateInfo.name}</h3>
      <div class="link-grid">
        ${countyLinks.slice(0, 20).map(c =>
          `<a href="${c.slug}.html">${escapeHtml(c.name)} County <span class="count">(${c.count})</span></a>`
        ).join('\n        ')}
      </div>
    </section>`;
  }

  if (type === 'county' && cityLinks && cityLinks.length > 0) {
    hubLinksHtml = `
    <section class="hub-links">
      <h3>Cities in ${county} County</h3>
      <div class="link-grid">
        ${cityLinks.slice(0, 20).map(c =>
          `<a href="${c.slug}.html">${escapeHtml(c.name)} <span class="count">(${c.count})</span></a>`
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
          `<a href="${c.slug}.html">${escapeHtml(c.name)} <span class="count">(${c.count})</span></a>`
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

  // Determine relative path depth for assets
  const assetPath = '../../';

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
  <title>${escapeHtml(title)} - Updated ${dateStr} | HomeHeat</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${canonicalUrl}">

  <!-- OpenGraph -->
  <meta property="og:title" content="${escapeHtml(title)} - ${dateStr}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:type" content="website">

  <link rel="stylesheet" href="${assetPath}style.css?v=11">
  <link rel="icon" type="image/png" sizes="32x32" href="${assetPath}favicon-32.png">

  <!-- Schema.org Structured Data -->
  <script type="application/ld+json">${JSON.stringify(breadcrumbSchema)}</script>
  <script type="application/ld+json">${JSON.stringify(itemListSchema)}</script>
</head>
<body>
  <nav class="nav">
    <div class="nav-container">
      <a href="${assetPath}index.html" class="nav-logo">
        <img src="${assetPath}images/app-icon-small.png" alt="HomeHeat" class="nav-logo-icon">
        HomeHeat
      </a>
      <button class="nav-toggle" aria-label="Toggle navigation">
        <span></span>
        <span></span>
        <span></span>
      </button>
      <ul class="nav-links">
        <li><a href="${assetPath}index.html">Home</a></li>
        <li><a href="${assetPath}prices.html" class="active">Prices</a></li>
        <li><a href="${assetPath}for-suppliers.html">For Suppliers</a></li>
        <li><a href="${assetPath}learn/">Learn</a></li>
        <li><a href="${assetPath}support.html">Support</a></li>
      </ul>
    </div>
  </nav>

  <main class="seo-page">
    <!-- Breadcrumb -->
    <nav class="breadcrumb" aria-label="Breadcrumb">
      ${breadcrumbHtml}
    </nav>

    <header class="page-header">
      <h1>${escapeHtml(h1)}</h1>
      <p class="supplier-count">${suppliers.length} suppliers · Updated ${dateStr}</p>
    </header>

    <!-- Market Intelligence Stats -->
    ${statsHtml}

    <!-- Supplier Table -->
    <section class="supplier-table-section">
      <h2>Compare Suppliers</h2>
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
${supplierRows}
        </tbody>
      </table>
    </section>

    <!-- Disclaimer -->
    <p class="disclaimer">
      Prices shown are reported by suppliers. Actual delivered prices may vary by volume and payment method. Always confirm when ordering.
    </p>

    <!-- Hub Links (Counties/Cities) -->
    ${hubLinksHtml}

    <!-- ZIP Lookup CTA -->
    <section class="zip-cta">
      <h3>Find prices in your exact area</h3>
      <p>Enter your ZIP code for suppliers that deliver to your address.</p>
      <a href="${assetPath}prices.html" class="cta-button">Check My ZIP Code →</a>
    </section>

    <!-- Other States -->
    ${otherStatesHtml}

    <!-- Trust Footer -->
    <p class="trust-footer">
      Data updated daily by HomeHeat · <a href="${assetPath}index.html">gethomeheat.com</a>
    </p>
  </main>

  <footer class="footer">
    <div class="footer-links">
      <a href="${assetPath}for-suppliers.html">For Suppliers</a>
      <a href="${assetPath}how-prices-work.html">How Prices Work</a>
      <a href="${assetPath}learn/">Learn</a>
      <a href="${assetPath}privacy.html">Privacy Policy</a>
      <a href="${assetPath}terms.html">Terms of Service</a>
      <a href="${assetPath}support.html">Support</a>
    </div>
    <p class="footer-audience">Built for homeowners who rely on heating oil or propane.</p>
    <p>&copy; 2026 HomeHeat. All rights reserved.</p>
  </footer>

  <script src="${assetPath}js/nav.js"></script>
</body>
</html>`;
}

/**
 * Generate national leaderboard snippet for prices.html
 */
function generateLeaderboardSnippet(states, prices, suppliers) {
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
          <td><a href="prices/${s.abbrev}/">${s.name}</a></td>
          <td>$${s.avg} avg</td>
          <td>${s.count} suppliers</td>
          <td><a href="prices/${s.abbrev}/">See all →</a></td>
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
  "numberOfItems": topDeals.length,
  "itemListElement": topDeals.map((d, i) => ({
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
function generateSitemap(pages) {
  const today = new Date().toISOString().split('T')[0];

  const stateUrls = pages.states.map(s => `
  <url>
    <loc>https://www.gethomeheat.com/prices/${s.abbrev}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`).join('');

  const countyUrls = pages.counties.map(c => `
  <url>
    <loc>https://www.gethomeheat.com/prices/${c.state}/${c.slug}.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
  </url>`).join('');

  const cityUrls = pages.cities.map(c => `
  <url>
    <loc>https://www.gethomeheat.com/prices/${c.state}/${c.slug}.html</loc>
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
    <loc>https://www.gethomeheat.com/prices.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
${stateUrls}
${countyUrls}
${cityUrls}
  <url>
    <loc>https://www.gethomeheat.com/for-suppliers.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://www.gethomeheat.com/how-prices-work.html</loc>
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
    <loc>https://www.gethomeheat.com/learn/heating-oil-usage.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://www.gethomeheat.com/learn/heating-oil-winter.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://www.gethomeheat.com/learn/measure-heating-oil.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://www.gethomeheat.com/privacy.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.3</priority>
  </url>
  <url>
    <loc>https://www.gethomeheat.com/terms.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.3</priority>
  </url>
  <url>
    <loc>https://www.gethomeheat.com/support.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.4</priority>
  </url>
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
