#!/usr/bin/env node
/**
 * Daily Price Scraper
 * V1.5.0: Scrapes prices from configured supplier websites
 *
 * Run daily at 10:00 AM EST (15:00 UTC)
 *
 * Usage:
 *   DATABASE_URL="..." node scripts/scrape-prices.js
 *   DATABASE_URL="..." node scripts/scrape-prices.js --dry-run
 *   DATABASE_URL="..." node scripts/scrape-prices.js --supplier "Domino"
 */

const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config();

const {
  scrapeSupplierPrice,
  loadScrapeConfig,
  getConfigForSupplier,
  sleep
} = require('../src/services/priceScraper');

// Parse command line args
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const supplierFilter = args.includes('--supplier')
  ? args[args.indexOf('--supplier') + 1]
  : null;

async function runScraper() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  HomeHeat Price Scraper - V1.5.0');
  console.log('  ' + new Date().toLocaleString());
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  if (dryRun) {
    console.log('🔍 DRY RUN - No prices will be saved');
    console.log('');
  }

  // Load scrape config
  const scrapeConfig = loadScrapeConfig();
  const configuredDomains = Object.keys(scrapeConfig).filter(k => !k.startsWith('_'));
  console.log(`📋 Loaded config for ${configuredDomains.length} domains`);

  // Connect to database
  const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: {
      ssl: process.env.DATABASE_URL?.includes('railway') ? {
        require: true,
        rejectUnauthorized: false
      } : false
    }
  });

  try {
    await sequelize.authenticate();
    console.log('✅ Database connected');
    console.log('');

    // Get suppliers with websites that allow price display
    let query = `
      SELECT id, name, website, city, state
      FROM suppliers
      WHERE active = true
      AND allow_price_display = true
      AND website IS NOT NULL
      AND website != ''
    `;
    const binds = [];

    if (supplierFilter) {
      query += ` AND name ILIKE $1`;
      binds.push(`%${supplierFilter}%`);
    }

    query += ` ORDER BY name`;

    const [suppliers] = await sequelize.query(query, { bind: binds });
    console.log(`📍 Found ${suppliers.length} suppliers with websites`);

    // Filter to configured suppliers
    const scrapableSuppliers = suppliers.filter(s => {
      const config = getConfigForSupplier(s.website, scrapeConfig);
      return config && config.enabled;
    });
    console.log(`📋 ${scrapableSuppliers.length} have scrape config`);
    console.log('');

    if (scrapableSuppliers.length === 0) {
      console.log('⚠️  No suppliers configured for scraping');
      await sequelize.close();
      return;
    }

    // Scrape each supplier
    const results = {
      success: [],
      failed: [],
      skipped: []
    };

    const DELAY_MS = 2000; // 2 seconds between requests

    for (let i = 0; i < scrapableSuppliers.length; i++) {
      const supplier = scrapableSuppliers[i];
      const config = getConfigForSupplier(supplier.website, scrapeConfig);

      console.log(`[${i + 1}/${scrapableSuppliers.length}] Scraping ${supplier.name}...`);

      const result = await scrapeSupplierPrice(supplier, config);

      if (result.success) {
        console.log(`   ✅ $${result.pricePerGallon.toFixed(2)}/gal (${result.duration}ms)`);
        results.success.push(result);

        // Save to database (unless dry run)
        if (!dryRun) {
          await sequelize.query(`
            INSERT INTO supplier_prices (
              id, supplier_id, price_per_gallon, min_gallons, fuel_type,
              source_type, source_url, scraped_at, expires_at, is_valid, notes,
              created_at, updated_at
            ) VALUES (
              gen_random_uuid(), $1, $2, $3, 'heating_oil',
              'scraped', $4, $5, $6, true, NULL,
              NOW(), NOW()
            )
          `, {
            bind: [
              result.supplierId,
              result.pricePerGallon,
              result.minGallons,
              result.sourceUrl,
              result.scrapedAt.toISOString(),
              result.expiresAt.toISOString()
            ]
          });
        }
      } else {
        console.log(`   ❌ ${result.error} (${result.duration}ms)`);
        results.failed.push(result);
      }

      // Rate limiting - don't hammer servers
      if (i < scrapableSuppliers.length - 1) {
        await sleep(DELAY_MS);
      }
    }

    // Summary
    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  SCRAPE SUMMARY');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`  ✅ Success: ${results.success.length}`);
    console.log(`  ❌ Failed:  ${results.failed.length}`);
    console.log(`  ⏭️  Skipped: ${suppliers.length - scrapableSuppliers.length} (no config)`);
    console.log('');

    // Calculate failure rate
    const total = results.success.length + results.failed.length;
    if (total > 0) {
      const failRate = results.failed.length / total;
      if (failRate > 0.20) {
        console.log(`⚠️  ALERT: ${(failRate * 100).toFixed(0)}% failure rate exceeds 20% threshold`);
        console.log('   Check supplier websites for changes');
      }
    }

    // Show failed suppliers
    if (results.failed.length > 0) {
      console.log('');
      console.log('Failed suppliers:');
      results.failed.forEach(r => {
        console.log(`  - ${r.supplierName}: ${r.error}`);
      });
    }

    // Show price summary if not dry run
    if (!dryRun && results.success.length > 0) {
      const [priceStats] = await sequelize.query(`
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN source_type = 'scraped' THEN 1 END) as scraped,
          COUNT(CASE WHEN source_type = 'manual' THEN 1 END) as manual,
          MIN(price_per_gallon) as min_price,
          MAX(price_per_gallon) as max_price,
          AVG(price_per_gallon) as avg_price
        FROM supplier_prices
        WHERE is_valid = true
        AND expires_at > NOW()
      `);

      if (priceStats[0]) {
        const stats = priceStats[0];
        console.log('');
        console.log('📊 Active prices:');
        console.log(`   Total: ${stats.total} (${stats.scraped} scraped, ${stats.manual} manual)`);
        console.log(`   Range: $${parseFloat(stats.min_price).toFixed(2)} - $${parseFloat(stats.max_price).toFixed(2)}`);
        console.log(`   Average: $${parseFloat(stats.avg_price).toFixed(2)}`);
      }
    }

    await sequelize.close();
    console.log('');
    console.log('🎉 Scrape complete!');

  } catch (error) {
    console.error('❌ Scraper error:', error.message);
    console.error(error.stack);
    await sequelize.close();
    process.exit(1);
  }
}

runScraper();
