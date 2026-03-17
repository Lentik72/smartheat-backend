#!/usr/bin/env node
/**
 * Diagnose suppliers blocked by V2.13.0 JSON-LD stripping.
 *
 * 1. Queries DB for suppliers that went blocked since March 16 with "Price not found in HTML"
 * 2. Fetches each supplier's website
 * 3. Checks whether price exists in JSON-LD vs visible HTML
 * 4. Outputs which ones need useJsonLd: true in scrape-config.json
 *
 * Usage: node scripts/diagnose-jsonld-blocked.js
 */

const { Sequelize } = require('sequelize');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const FUEL_PRICE_RANGES = { heating_oil: [2.00, 5.50] };
const JSONLD_RE = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
const PRICE_RE = /\$\s*([0-9]+\.[0-9]{2,3})/g;

function findPricesInText(text) {
  const prices = [];
  let m;
  const re = new RegExp(PRICE_RE.source, 'g');
  while ((m = re.exec(text)) !== null) {
    const p = parseFloat(m[1]);
    if (p >= FUEL_PRICE_RANGES.heating_oil[0] && p <= FUEL_PRICE_RANGES.heating_oil[1]) {
      prices.push(p);
    }
  }
  return prices;
}

async function fetchHtml(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'HomeHeatBot/1.0 (gethomeheat.com; published-price-aggregation)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) return { error: `HTTP ${res.status}`, html: null };
    return { error: null, html: await res.text() };
  } catch (e) {
    clearTimeout(timer);
    return { error: e.message, html: null };
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const sequelize = new Sequelize(databaseUrl, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: {
      ssl: databaseUrl.includes('railway') ? { require: true, rejectUnauthorized: false } : false
    }
  });

  await sequelize.authenticate();
  console.log('Connected to DB\n');

  // Load scrape config to check for existing useJsonLd or pricePath
  const configPath = path.join(__dirname, '..', 'src', 'data', 'scrape-config.json');
  const scrapeConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

  // Find suppliers blocked since the JSON-LD commit
  const [blocked] = await sequelize.query(`
    SELECT id, name, website, slug, scrape_status,
           consecutive_scrape_failures, last_scrape_failure_at, last_scrape_error
    FROM suppliers
    WHERE scrape_status IN ('cooldown', 'phone_only')
      AND last_scrape_failure_at >= '2026-03-16'
      AND last_scrape_error = 'Price not found in HTML'
    ORDER BY name
  `);

  console.log(`Found ${blocked.length} suppliers blocked since March 16 with "Price not found in HTML"\n`);

  if (blocked.length === 0) {
    await sequelize.close();
    return;
  }

  const needsJsonLd = [];
  const siteChanged = [];
  const fetchFailed = [];
  const hasBothPrices = [];

  for (const supplier of blocked) {
    let url = supplier.website;
    if (!url) {
      fetchFailed.push({ ...supplier, reason: 'No website' });
      continue;
    }
    if (!url.startsWith('http')) url = 'https://' + url;

    // Check scrape config for pricePath
    const domain = url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '');
    const config = scrapeConfig[domain] || scrapeConfig['www.' + domain] || {};
    if (config.pricePath) {
      const urlObj = new URL(url);
      urlObj.pathname = config.pricePath;
      url = urlObj.toString();
    }

    process.stdout.write(`  ${supplier.name} (${domain})... `);

    const { error, html } = await fetchHtml(url);
    if (error || !html) {
      console.log(`FETCH FAILED: ${error}`);
      fetchFailed.push({ ...supplier, domain, reason: error });
      continue;
    }

    // Extract JSON-LD blocks
    const jsonLdBlocks = [];
    let jm;
    const jre = new RegExp(JSONLD_RE.source, 'gi');
    while ((jm = jre.exec(html)) !== null) {
      jsonLdBlocks.push(jm[0]);
    }

    // Check for prices in JSON-LD
    const jsonLdText = jsonLdBlocks.join('\n');
    const jsonLdPrices = findPricesInText(jsonLdText);

    // Check for prices in HTML with JSON-LD stripped
    const htmlOnly = html.replace(new RegExp(JSONLD_RE.source, 'gi'), '');
    const htmlPrices = findPricesInText(htmlOnly);

    // Also check with supplier's custom regex if they have one
    let customRegexHtmlPrices = [];
    if (config.priceRegex) {
      const cre = new RegExp(config.priceRegex, 'gi');
      let cm;
      while ((cm = cre.exec(htmlOnly)) !== null) {
        const p = parseFloat(cm[1]);
        if (p >= FUEL_PRICE_RANGES.heating_oil[0] && p <= FUEL_PRICE_RANGES.heating_oil[1]) {
          customRegexHtmlPrices.push(p);
        }
      }
    }

    if (jsonLdPrices.length > 0 && htmlPrices.length === 0 && customRegexHtmlPrices.length === 0) {
      console.log(`JSON-LD ONLY → needs useJsonLd: true (prices: ${jsonLdPrices.join(', ')})`);
      needsJsonLd.push({ ...supplier, domain, jsonLdPrices, config });
    } else if (jsonLdPrices.length === 0 && htmlPrices.length === 0) {
      console.log(`NO PRICE ANYWHERE → site changed`);
      siteChanged.push({ ...supplier, domain });
    } else if (htmlPrices.length > 0 || customRegexHtmlPrices.length > 0) {
      const prices = customRegexHtmlPrices.length > 0 ? customRegexHtmlPrices : htmlPrices;
      console.log(`HAS HTML PRICE (${prices.join(', ')}) → regex issue, not JSON-LD`);
      hasBothPrices.push({ ...supplier, domain, htmlPrices: prices, jsonLdPrices });
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 1000));
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));

  if (needsJsonLd.length > 0) {
    console.log(`\n✅ NEED useJsonLd: true (${needsJsonLd.length}):`);
    for (const s of needsJsonLd) {
      console.log(`   ${s.domain} → ${s.name} (slug: ${s.slug}) [prices: ${s.jsonLdPrices.join(', ')}]`);
    }
  }

  if (siteChanged.length > 0) {
    console.log(`\n⚠️  SITE CHANGED / NO PRICE (${siteChanged.length}):`);
    for (const s of siteChanged) {
      console.log(`   ${s.domain} → ${s.name} (slug: ${s.slug})`);
    }
  }

  if (hasBothPrices.length > 0) {
    console.log(`\n🔧 HAS HTML PRICE — regex needs fixing (${hasBothPrices.length}):`);
    for (const s of hasBothPrices) {
      console.log(`   ${s.domain} → ${s.name} (slug: ${s.slug}) [html: ${s.htmlPrices.join(', ')}, jsonld: ${s.jsonLdPrices.join(', ')}]`);
    }
  }

  if (fetchFailed.length > 0) {
    console.log(`\n❌ FETCH FAILED (${fetchFailed.length}):`);
    for (const s of fetchFailed) {
      console.log(`   ${s.domain || s.website} → ${s.name} (${s.reason})`);
    }
  }

  console.log(`\nTotal: ${blocked.length} blocked | ${needsJsonLd.length} JSON-LD | ${siteChanged.length} site changed | ${hasBothPrices.length} regex issue | ${fetchFailed.length} fetch failed`);

  await sequelize.close();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
