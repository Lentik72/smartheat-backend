#!/usr/bin/env node
/**
 * Daily Price Scraper
 * V1.5.0: Scrapes prices from configured supplier websites
 * V1.6.0: Exported for use by cron scheduler in server.js
 * V2.1.0: Support for aggregator_signal source type (displayable=false)
 * V2.6.0: Backoff logic for blocked sites (cooldown + phone_only)
 * V2.7.0: Price change protection - reject suspicious drops > 25%
 * V3.1.0: Market outlier detection - reject prices > 20% below market median
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

// V2.6.0: Import backoff service
const {
  shouldScrapeSupplier,
  shouldSkipFailureCounter,
  recordSuccess,
  recordFailure,
  getBackoffStats
} = require('../src/services/scrapeBackoff');

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
    // V2.6.0: Include backoff fields for cooldown/phone_only logic
    // V2.8.0: Also include claimed suppliers with stale prices (7+ days) for backup scraping
    let query = `
      SELECT s.id, s.name, s.slug, s.website, s.city, s.state,
             s.scrape_status, s.scrape_cooldown_until, s.consecutive_scrape_failures,
             s.claimed_at, s.allow_price_display,
             (SELECT MAX(scraped_at) FROM supplier_prices WHERE supplier_id = s.id AND is_valid = true) as last_price_date
      FROM suppliers s
      WHERE s.active = true
      AND s.website IS NOT NULL
      AND s.website != ''
      AND (
        -- Normal case: allow_price_display suppliers
        s.allow_price_display = true
        OR
        -- Backup case: claimed suppliers with stale prices (7+ days old or no price)
        (s.claimed_at IS NOT NULL AND (
          NOT EXISTS (SELECT 1 FROM supplier_prices WHERE supplier_id = s.id AND is_valid = true)
          OR (SELECT MAX(scraped_at) FROM supplier_prices WHERE supplier_id = s.id AND is_valid = true) < NOW() - INTERVAL '7 days'
        ))
      )
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
      const config = getConfigForSupplier(s.website, scrapeConfig, s.slug);
      // Only warn on TRUE multi-branch orphans (domain has branches, but this
      // supplier's slug isn't one of them). Suppliers with no matching config
      // entry at all are normal — most suppliers we research aren't scrapable
      // and have no scrape-config row.
      if (!config && s.website && s.slug) {
        try {
          const d = new URL(s.website.startsWith('http') ? s.website : 'https://' + s.website).hostname.replace('www.', '');
          if (scrapeConfig[d] && scrapeConfig[d].branches) {
            log.warn(`⚠ supplier ${s.name} (${s.slug}) matched multi-branch domain ${d} but has no branch config — check scrape-config.json`);
          }
        } catch { /* malformed URL — already null'd by getConfigForSupplier */ }
      }
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
      skipped: [],
      cooldown: [],    // V2.6.0: Suppliers in cooldown
      phoneOnly: [],   // V2.6.0: Suppliers marked phone_only
      rejected: [],    // V2.7.0: Suspicious price drops rejected
      fuelSuccess: 0,  // V2.12.0: Additional fuel prices stored (kerosene, etc.)
      fuelFailed: 0,   // V2.12.0: Additional fuel extractions that failed
    };

    // V2.7.0: Price change protection threshold
    const MAX_PRICE_DROP_PERCENT = 0.25; // Reject drops > 25%

    // V3.1.0: Market outlier detection — reject prices far below the pack
    // Catches scraping artifacts (e.g., gas station prices, card prices, wrong page section)
    // V3.1.2: State-level median (not national) — prices vary significantly by state
    const MAX_BELOW_MEDIAN_PERCENT = 0.25; // Reject prices > 25% below state median
    const MIN_SUPPLIERS_FOR_MEDIAN = 5;    // Need enough data for a meaningful median
    const stateMedians = {};
    {
      const [medianRows] = await sequelize.query(`
        SELECT s.state,
               PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY sp.price_per_gallon::numeric) as median_price,
               COUNT(DISTINCT sp.supplier_id) as supplier_count
        FROM supplier_prices sp
        JOIN suppliers s ON sp.supplier_id = s.id
        WHERE sp.is_valid = true
          AND sp.fuel_type = 'heating_oil'
          AND sp.expires_at > NOW()
          AND s.active = true
          AND s.allow_price_display = true
          AND s.state IS NOT NULL
        GROUP BY s.state
        HAVING COUNT(DISTINCT sp.supplier_id) >= ${MIN_SUPPLIERS_FOR_MEDIAN}
      `);
      for (const row of medianRows) {
        stateMedians[row.state] = parseFloat(row.median_price);
      }
      const stateList = Object.entries(stateMedians).map(([st, m]) => `${st}: $${m.toFixed(2)}`).join(', ');
      log.info(`📊 State medians (${Object.keys(stateMedians).length} states): ${stateList || 'none (< 5 suppliers per state)'}`);
    }

    const DELAY_MS = 2000; // 2 seconds between requests

    for (let i = 0; i < scrapableSuppliers.length; i++) {
      const supplier = scrapableSuppliers[i];
      const config = getConfigForSupplier(supplier.website, scrapeConfig, supplier.slug);

      // V2.6.0: Check backoff status before scraping
      const backoffCheck = shouldScrapeSupplier(supplier);
      if (!backoffCheck.shouldScrape) {
        if (supplier.scrape_status === 'phone_only') {
          log.info(`[${i + 1}/${scrapableSuppliers.length}] ⛔ ${supplier.name} - ${backoffCheck.reason}`);
          results.phoneOnly.push({ supplierName: supplier.name, reason: backoffCheck.reason });
        } else {
          log.info(`[${i + 1}/${scrapableSuppliers.length}] 🕐 ${supplier.name} - ${backoffCheck.reason}`);
          results.cooldown.push({ supplierName: supplier.name, reason: backoffCheck.reason });
        }
        continue;
      }

      // V2.8.0: Check if this is a backup scrape for a claimed supplier
      const isBackupScrape = supplier.claimed_at && !supplier.allow_price_display;
      const backupLabel = isBackupScrape ? ' [BACKUP]' : '';
      log.info(`[${i + 1}/${scrapableSuppliers.length}] Scraping ${supplier.name}...${backupLabel}`);

      const result = await scrapeSupplierPrice(supplier, config);

      if (result.success) {
        // V2.1.0: Log aggregator status
        // V2.2.0: Log retry info
        const aggLabel = result.isAggregator ? ' [AGGREGATOR]' : '';
        const retryLabel = result.retriedAttempts ? ` [RETRIED ${result.retriedAttempts}x]` : '';
        log.info(`   ✅ $${result.pricePerGallon.toFixed(2)}/gal (${result.duration}ms)${aggLabel}${retryLabel}${backupLabel}`);
        results.success.push(result);

        // V2.6.0: Record success - reset failure counters
        if (!opts.dryRun) {
          await recordSuccess(sequelize, supplier.id);
        }

        // V2.7.0: Price change protection - check for suspicious drops
        let priceRejected = false;
        if (!opts.dryRun) {
          // Fetch previous valid price for this supplier
          const [prevPrices] = await sequelize.query(`
            SELECT price_per_gallon FROM supplier_prices
            WHERE supplier_id = $1 AND is_valid = true
            ORDER BY scraped_at DESC LIMIT 1
          `, { bind: [result.supplierId] });

          if (prevPrices.length > 0) {
            const prevPrice = parseFloat(prevPrices[0].price_per_gallon);
            const newPrice = result.pricePerGallon;
            const dropPercent = (prevPrice - newPrice) / prevPrice;

            if (dropPercent > MAX_PRICE_DROP_PERCENT) {
              // Suspicious drop - reject this price
              log.warn(`   ⚠️  REJECTED: $${newPrice.toFixed(3)} is ${(dropPercent * 100).toFixed(0)}% below previous $${prevPrice.toFixed(3)}`);
              results.rejected.push({
                supplierName: supplier.name,
                supplierId: supplier.id,
                newPrice,
                previousPrice: prevPrice,
                dropPercent: dropPercent * 100,
                reason: `${(dropPercent * 100).toFixed(0)}% drop exceeds ${MAX_PRICE_DROP_PERCENT * 100}% threshold`
              });
              priceRejected = true;
              // Move from success to rejected (don't count as success)
              results.success.pop();
            }
          }

          // V3.1.2: State-level outlier detection — reject prices far below the state pack
          const stateMedian = supplier.state ? stateMedians[supplier.state] : null;
          if (!priceRejected && stateMedian) {
            const newPrice = result.pricePerGallon;
            const belowMedian = (stateMedian - newPrice) / stateMedian;
            if (belowMedian > MAX_BELOW_MEDIAN_PERCENT) {
              log.warn(`   ⚠️  OUTLIER REJECTED: $${newPrice.toFixed(3)} is ${(belowMedian * 100).toFixed(0)}% below ${supplier.state} median $${stateMedian.toFixed(3)}`);
              results.rejected.push({
                supplierName: supplier.name,
                supplierId: supplier.id,
                state: supplier.state,
                newPrice,
                marketMedian: stateMedian,
                belowMedianPercent: belowMedian * 100,
                reason: `${(belowMedian * 100).toFixed(0)}% below ${supplier.state} median exceeds ${MAX_BELOW_MEDIAN_PERCENT * 100}% threshold`
              });
              priceRejected = true;
              results.success.pop();
            }
          }
        }

        // Save to database (unless dry run or rejected)
        // V2.1.0: Use result.sourceType to distinguish scraped vs aggregator_signal
        if (!opts.dryRun && !priceRejected) {
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

        // V2.12.0: Store additional fuel prices (kerosene, etc.)
        if (!opts.dryRun && result.fuelPrices && result.fuelPrices.length > 0) {
          for (const fp of result.fuelPrices) {
            try {
              // Price drop protection per fuel type
              const [prevFuelPrices] = await sequelize.query(`
                SELECT price_per_gallon FROM supplier_prices
                WHERE supplier_id = $1 AND fuel_type = $2 AND is_valid = true
                ORDER BY scraped_at DESC LIMIT 1
              `, { bind: [result.supplierId, fp.fuelType] });

              let fuelRejected = false;
              if (prevFuelPrices.length > 0) {
                const prevPrice = parseFloat(prevFuelPrices[0].price_per_gallon);
                const dropPercent = (prevPrice - fp.price) / prevPrice;
                if (dropPercent > MAX_PRICE_DROP_PERCENT) {
                  log.warn(`   ⚠️  ${fp.fuelType} REJECTED: $${fp.price.toFixed(3)} is ${(dropPercent * 100).toFixed(0)}% below previous $${prevPrice.toFixed(3)}`);
                  fuelRejected = true;
                }
              }
              // No previous price = first ever for this fuel — always store (no drop to detect)

              if (!fuelRejected) {
                await sequelize.query(`
                  INSERT INTO supplier_prices (
                    id, supplier_id, price_per_gallon, min_gallons, fuel_type,
                    source_type, source_url, scraped_at, expires_at, is_valid, notes,
                    created_at, updated_at
                  ) VALUES (
                    gen_random_uuid(), $1, $2, $3, $4,
                    $5, $6, $7, $8, true, NULL,
                    NOW(), NOW()
                  )
                `, {
                  bind: [
                    result.supplierId,
                    fp.price,
                    result.minGallons,
                    fp.fuelType, // 'kerosene', etc.
                    result.sourceType,
                    result.sourceUrl,
                    result.scrapedAt.toISOString(),
                    result.expiresAt.toISOString()
                  ]
                });
                log.info(`   🔥 ${fp.fuelType}: $${fp.price.toFixed(3)}`);
                results.fuelSuccess++;
              } else {
                results.fuelFailed++;
              }
            } catch (fuelErr) {
              log.warn(`   ⚠️  Failed to store ${fp.fuelType} price: ${fuelErr.message}`);
              results.fuelFailed++;
            }
          }
        }
      } else {
        // V2.2.0: Log retry attempts for failures
        const retryLabel = result.retriedAttempts ? ` [after ${result.retriedAttempts} retries]` : '';
        log.info(`   ❌ ${result.error} (${result.duration}ms)${retryLabel}`);
        results.failed.push(result);

        // V2.6.0: Record failure - update counters, potentially set cooldown/phone_only
        // V3.x.0: primaryFuelOptional gate (heatingoil-…) — when supplier is opted-in
        // and at least one secondary fuel succeeded, treat as healthy. Buxton Oil is
        // the first user: heating oil card says "Call our office" but propane scrapes fine.
        if (!opts.dryRun) {
          if (shouldSkipFailureCounter(config, result)) {
            await recordSuccess(sequelize, supplier.id);
            log.warn(`   ⚠️  primary fuel optional — ${result.fuelPrices.length} secondary fuel(s) succeeded; resetting failure counter`);
          } else {
            const backoffResult = await recordFailure(sequelize, supplier.id, supplier.name, log, result.error);
            if (backoffResult.action !== 'none') {
              // Already logged by recordFailure
            }
          }
        }

        // V2.12.0: Oil failed but fuel prices may have succeeded — store them independently
        if (!opts.dryRun && result.fuelPrices && result.fuelPrices.length > 0) {
          const sourceType = config.displayable === false ? 'aggregator_signal' : 'scraped';
          for (const fp of result.fuelPrices) {
            try {
              await sequelize.query(`
                INSERT INTO supplier_prices (
                  id, supplier_id, price_per_gallon, min_gallons, fuel_type,
                  source_type, source_url, scraped_at, expires_at, is_valid, notes,
                  created_at, updated_at
                ) VALUES (
                  gen_random_uuid(), $1, $2, 150, $3,
                  $4, $5, NOW(), NOW() + INTERVAL '48 hours', true, NULL,
                  NOW(), NOW()
                )
              `, {
                bind: [supplier.id, fp.price, fp.fuelType, sourceType, supplier.website]
              });
              log.info(`   🔥 ${fp.fuelType}: $${fp.price.toFixed(3)} (oil failed, fuel saved)`);
              results.fuelSuccess++;
            } catch (fuelErr) {
              log.warn(`   ⚠️  Failed to store ${fp.fuelType} price: ${fuelErr.message}`);
              results.fuelFailed++;
            }
          }
        }
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
    log.info(`  ✅ Oil success: ${results.success.length}`);
    log.info(`  ❌ Oil failed:  ${results.failed.length}`);
    log.info(`  🚫 Rejected:   ${results.rejected.length}`);  // V2.7.0
    if (results.fuelSuccess > 0 || results.fuelFailed > 0) {
      log.info(`  🔥 Fuel prices: ${results.fuelSuccess} stored, ${results.fuelFailed} failed`);  // V2.12.0
    }
    log.info(`  🕐 Cooldown:   ${results.cooldown.length}`);
    log.info(`  ⛔ Phone-only: ${results.phoneOnly.length}`);
    log.info(`  ⏭️  No config:  ${suppliers.length - scrapableSuppliers.length}`);
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

    // V2.7.0: Show rejected prices (suspicious drops + outliers)
    if (results.rejected.length > 0) {
      log.info('');
      log.warn('🚫 Rejected prices:');
      results.rejected.forEach(r => {
        if (r.marketMedian) {
          log.warn(`  - ${r.supplierName}: $${r.newPrice.toFixed(3)} (${r.belowMedianPercent.toFixed(0)}% below ${r.state || ''} median $${r.marketMedian.toFixed(3)}) — likely scraping artifact`);
        } else {
          log.warn(`  - ${r.supplierName}: $${r.newPrice.toFixed(3)} (${r.dropPercent.toFixed(0)}% drop from $${r.previousPrice.toFixed(3)})`);
        }
      });
      log.info('   → Use verify-price.js to manually update if prices are correct');
    }

    // V2.6.0: Show backoff stats
    if (!opts.dryRun) {
      const backoffStats = await getBackoffStats(sequelize);
      log.info('');
      log.info('📊 Backoff Status:');
      log.info(`   Active: ${backoffStats.active_count}`);
      log.info(`   Cooldown: ${backoffStats.cooldown_count}`);
      log.info(`   Phone-only: ${backoffStats.phone_only_count}`);
      if (backoffStats.with_recent_failures > 0) {
        log.info(`   With recent failures: ${backoffStats.with_recent_failures}`);
      }
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
      supplierId: f.supplierId || null,
      website: f.sourceUrl || null,
      error: f.error,
      retriedAttempts: f.retriedAttempts || 0
    }));

    if (!opts.dryRun) {
      try {
        await sequelize.query(`
          INSERT INTO scrape_runs (run_at, success_count, failed_count, skipped_count, duration_ms, failures, rejections)
          VALUES (NOW(), $1, $2, $3, $4, $5::jsonb, $6::jsonb)
        `, {
          bind: [
            results.success.length,
            results.failed.length,
            suppliers.length - scrapableSuppliers.length,
            runDuration,
            JSON.stringify(failuresArray),
            JSON.stringify(results.rejected)
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
      rejected: results.rejected.length,     // V2.7.0
      skipped: suppliers.length - scrapableSuppliers.length,
      cooldown: results.cooldown.length,     // V2.6.0
      phoneOnly: results.phoneOnly.length,   // V2.6.0
      failures: failuresArray,
      rejections: results.rejected,          // V2.7.0
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
        console.log(`\nResults: ${result.success} success, ${result.failed} failed, ${result.rejected} rejected, ${result.skipped} skipped`);
      }
      process.exit(0);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}
