#!/usr/bin/env node
/**
 * Daily Price Scraper
 * V1.5.0: Scrapes prices from configured supplier websites
 * V1.6.0: Exported for use by cron scheduler in server.js
 * V2.1.0: Support for aggregator_signal source type (displayable=false)
 *
 * Runs daily at 10:00 AM EST (15:00 UTC) via node-cron in server.js
 *
 * CLI Usage:
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

// Parse command line args (only when run directly)
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const supplierFilter = args.includes('--supplier')
  ? args[args.indexOf('--supplier') + 1]
  : null;

/**
 * Run the price scraper
 * @param {object} options - Optional config
 * @param {boolean} options.dryRun - Don't save to DB
 * @param {string} options.supplierFilter - Filter by supplier name
 * @param {object} options.logger - Logger instance (defaults to console)
 * @returns {object} Results summary with failures array
 */
async function runScraper(options = {}) {
  const runStartTime = Date.now();
  const opts = {
    dryRun: options.dryRun ?? dryRun,
    supplierFilter: options.supplierFilter ?? supplierFilter,
    logger: options.logger ?? console
  };
  const log = opts.logger;
  log.info('═══════════════════════════════════════════════════════════');
  log.info('  HomeHeat Price Scraper - V1.7.0');
  log.info('  ' + new Date().toLocaleString());
  log.info('═══════════════════════════════════════════════════════════');
  log.info('');

  if (opts.dryRun) {
    log.info('🔍 DRY RUN - No prices will be saved');
    log.info('');
  }

  // Load scrape config
  const scrapeConfig = loadScrapeConfig();
  const configuredDomains = Object.keys(scrapeConfig).filter(k => !k.startsWith('_'));
  log.info(`📋 Loaded config for ${configuredDomains.length} domains`);

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
    log.info('✅ Database connected');
    log.info('');

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

    if (opts.supplierFilter) {
      query += ` AND name ILIKE $1`;
      binds.push(`%${opts.supplierFilter}%`);
    }

    query += ` ORDER BY name`;

    const [suppliers] = await sequelize.query(query, { bind: binds });
    log.info(`📍 Found ${suppliers.length} suppliers with websites`);

    // Filter to configured suppliers
    const scrapableSuppliers = suppliers.filter(s => {
      const config = getConfigForSupplier(s.website, scrapeConfig);
      return config && config.enabled;
    });
    log.info(`📋 ${scrapableSuppliers.length} have scrape config`);
    log.info('');

    if (scrapableSuppliers.length === 0) {
      log.warn('⚠️  No suppliers configured for scraping');
      await sequelize.close();
      return { success: 0, failed: 0, skipped: 0 };
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

      log.info(`[${i + 1}/${scrapableSuppliers.length}] Scraping ${supplier.name}...`);

      const result = await scrapeSupplierPrice(supplier, config);

      if (result.success) {
        // V2.1.0: Log aggregator status
        // V2.2.0: Log retry info
        const aggLabel = result.isAggregator ? ' [AGGREGATOR]' : '';
        const retryLabel = result.retriedAttempts ? ` [RETRIED ${result.retriedAttempts}x]` : '';
        log.info(`   ✅ $${result.pricePerGallon.toFixed(2)}/gal (${result.duration}ms)${aggLabel}${retryLabel}`);
        results.success.push(result);

        // Save to database (unless dry run)
        // V2.1.0: Use result.sourceType to distinguish scraped vs aggregator_signal
        if (!opts.dryRun) {
          await sequelize.query(`
            INSERT INTO supplier_prices (
              id, supplier_id, price_per_gallon, min_gallons, fuel_type,
              source_type, source_url, scraped_at, expires_at, is_valid, notes,
              created_at, updated_at
            ) VALUES (
              gen_random_uuid(), $1, $2, $3, 'heating_oil',
              $4, $5, $6, $7, true, NULL,
              NOW(), NOW()
            )
          `, {
            bind: [
              result.supplierId,
              result.pricePerGallon,
              result.minGallons,
              result.sourceType, // V2.1.0: 'scraped' or 'aggregator_signal'
              result.sourceUrl,
              result.scrapedAt.toISOString(),
              result.expiresAt.toISOString()
            ]
          });
        }
      } else {
        // V2.2.0: Log retry attempts for failures
        const retryLabel = result.retriedAttempts ? ` [after ${result.retriedAttempts} retries]` : '';
        log.info(`   ❌ ${result.error} (${result.duration}ms)${retryLabel}`);
        results.failed.push(result);
      }

      // Rate limiting - don't hammer servers
      if (i < scrapableSuppliers.length - 1) {
        await sleep(DELAY_MS);
      }
    }

    // Summary
    log.info('');
    log.info('═══════════════════════════════════════════════════════════');
    log.info('  SCRAPE SUMMARY');
    log.info('═══════════════════════════════════════════════════════════');
    log.info(`  ✅ Success: ${results.success.length}`);
    log.info(`  ❌ Failed:  ${results.failed.length}`);
    log.info(`  ⏭️  Skipped: ${suppliers.length - scrapableSuppliers.length} (no config)`);
    log.info('');

    // Calculate failure rate
    const total = results.success.length + results.failed.length;
    if (total > 0) {
      const failRate = results.failed.length / total;
      if (failRate > 0.20) {
        log.warn(`⚠️  ALERT: ${(failRate * 100).toFixed(0)}% failure rate exceeds 20% threshold`);
        log.warn('   Check supplier websites for changes');
      }
    }

    // Show failed suppliers
    if (results.failed.length > 0) {
      log.info('');
      log.info('Failed suppliers:');
      results.failed.forEach(r => {
        log.info(`  - ${r.supplierName}: ${r.error}`);
      });
    }

    // Show price summary if not dry run
    if (!opts.dryRun && results.success.length > 0) {
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
        log.info('');
        log.info('📊 Active prices:');
        log.info(`   Total: ${stats.total} (${stats.scraped} scraped, ${stats.manual} manual)`);
        log.info(`   Range: $${parseFloat(stats.min_price).toFixed(2)} - $${parseFloat(stats.max_price).toFixed(2)}`);
        log.info(`   Average: $${parseFloat(stats.avg_price).toFixed(2)}`);
      }
    }

    // V1.7.0: Log scrape run to database for daily report
    const runDuration = Date.now() - runStartTime;
    const failuresArray = results.failed.map(f => ({
      supplierName: f.supplierName,
      error: f.error,
      retriedAttempts: f.retriedAttempts || 0
    }));

    if (!opts.dryRun) {
      try {
        await sequelize.query(`
          INSERT INTO scrape_runs (run_at, success_count, failed_count, skipped_count, duration_ms, failures)
          VALUES (NOW(), $1, $2, $3, $4, $5::jsonb)
        `, {
          bind: [
            results.success.length,
            results.failed.length,
            suppliers.length - scrapableSuppliers.length,
            runDuration,
            JSON.stringify(failuresArray)
          ]
        });
        log.info('📝 Scrape run logged to database');
      } catch (logError) {
        log.warn('⚠️  Failed to log scrape run:', logError.message);
      }
    }

    await sequelize.close();
    log.info('');
    log.info('🎉 Scrape complete!');

    return {
      success: results.success.length,
      failed: results.failed.length,
      skipped: suppliers.length - scrapableSuppliers.length,
      failures: failuresArray,
      durationMs: runDuration
    };

  } catch (error) {
    log.error('❌ Scraper error:', error.message);
    log.error(error.stack);
    await sequelize.close();
    throw error;
  }
}

// Export for use by cron scheduler
module.exports = { runScraper };

// Run directly if executed from command line
if (require.main === module) {
  runScraper()
    .then(result => {
      if (result) {
        console.log(`\nResults: ${result.success} success, ${result.failed} failed, ${result.skipped} skipped`);
      }
      process.exit(0);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}
