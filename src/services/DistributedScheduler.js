/**
 * Distributed Scheduler Service
 * V2.1.0: Hash-based scrape timing distribution
 *
 * Purpose:
 * - Distribute supplier scraping across 8AM-6PM window (10 hours)
 * - Stable per-supplier offset based on supplier ID hash
 * - Random jitter (±15 minutes) to avoid exact patterns
 * - Shadow mode for comparison with existing fixed cron
 *
 * Benefits:
 * - Avoids detection of 10AM spike from all suppliers
 * - Spreads load across the day
 * - Each supplier scraped at consistent time daily
 */

const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { Sequelize } = require('sequelize');
const { checkAndRecordPrice, getStateMedian } = require('../utils/price-sanity');

// Configuration
const WINDOW_START_HOUR = 8;  // 8 AM EST
const WINDOW_END_HOUR = 18;   // 6 PM EST
const WINDOW_MINUTES = (WINDOW_END_HOUR - WINDOW_START_HOUR) * 60; // 600 minutes
const JITTER_MINUTES = 15;    // ±15 minute jitter
const SHADOW_MODE_DAYS = 7;   // Days to run in shadow mode before prompting

// Track scheduled scrapes
const scheduledScrapes = new Map();
let isRunning = false;
let shadowMode = true; // Start in shadow mode
let shadowModeStartDate = null;
let shadowModeStats = { executed: 0, byHour: {} };
let phase11EmailSent = false; // Only send email once

// V3.0.0: Host group rate limiting and circuit breaker (Droplet integration)
const HOST_GROUP_MIN_SPACING_MS = 10 * 60 * 1000; // 10 minutes between same host group
const HOST_GROUP_SLOW_SPACING_MS = 20 * 60 * 1000; // 20 minutes in slow mode
const hostGroupLastScrape = new Map(); // hostGroup → Date timestamp

// Circuit breaker state — in-memory only, resets on deploy (intentional)
const circuitBreaker = {
  droplet: {
    blocks: 0,
    windowStart: Date.now(),
    slowMode: false,
    paused: false,
    pauseUntil: 0,
    parseSuccesses: 0,
    parseTotal: 0,
  }
};

/**
 * V3.0.0: Record a Droplet scrape result for circuit breaker tracking
 * @param {'block'|'network'|'parse'|'success'} type - Failure classification
 */
function recordDropletResult(type) {
  const state = circuitBreaker.droplet;

  // Reset 1-hour window
  if (Date.now() - state.windowStart > 3600000) {
    state.blocks = 0;
    state.windowStart = Date.now();
    state.slowMode = false;
  }

  if (type === 'block') {
    state.blocks++;
    if (state.blocks >= 3) {
      state.paused = true;
      state.pauseUntil = Date.now() + 24 * 60 * 60 * 1000;
      console.error('🚨 Droplet circuit breaker TRIPPED — 3+ blocks in 1h, pausing 24h');
    } else if (state.blocks >= 2) {
      state.slowMode = true;
      console.warn('⚠️ Droplet slow mode — 2 blocks in 1h, doubling spacing');
    }
  }

  // Track parse success rate
  if (type === 'success' || type === 'parse') {
    state.parseTotal++;
    if (type === 'success') state.parseSuccesses++;

    if (state.parseTotal >= 10) {
      const rate = state.parseSuccesses / state.parseTotal;
      if (rate < 0.8) {
        console.warn(`⚠️ Droplet parsing degraded: ${Math.round(rate * 100)}% success rate (${state.parseSuccesses}/${state.parseTotal})`);
      }
    }
  }
}

/**
 * V3.0.0: Check if a Droplet scrape should proceed
 * @returns {boolean} true if OK to scrape, false if blocked by circuit breaker or spacing
 */
function canScrapeDroplet() {
  const state = circuitBreaker.droplet;
  if (state.paused && Date.now() < state.pauseUntil) return false;
  if (state.paused && Date.now() >= state.pauseUntil) {
    // Auto-resume after pause window
    state.paused = false;
    state.blocks = 0;
    state.slowMode = false;
    console.info('ℹ️ Droplet circuit breaker reset — resuming scraping');
  }
  return true;
}

/**
 * V3.0.0: Check host group spacing — returns ms to wait, or 0 if OK
 * @param {string} hostGroup - Host group identifier (e.g., 'droplet')
 * @returns {number} ms to wait before scraping, or 0 if ready
 */
function getHostGroupDelay(hostGroup) {
  if (!hostGroup) return 0;

  const lastScrape = hostGroupLastScrape.get(hostGroup);
  if (!lastScrape) return 0;

  const state = circuitBreaker[hostGroup];
  const minSpacing = (state && state.slowMode)
    ? HOST_GROUP_SLOW_SPACING_MS
    : HOST_GROUP_MIN_SPACING_MS;

  const elapsed = Date.now() - lastScrape;
  return elapsed < minSpacing ? minSpacing - elapsed : 0;
}

/**
 * V3.0.0: Mark that a host group was just scraped
 * @param {string} hostGroup - Host group identifier
 */
function markHostGroupScrape(hostGroup) {
  if (hostGroup) hostGroupLastScrape.set(hostGroup, Date.now());
}

/**
 * Calculate stable offset for a supplier based on ID hash
 * @param {string} supplierId - UUID of the supplier
 * @returns {number} Offset in minutes from WINDOW_START_HOUR (0-599)
 */
function getStableScrapeOffset(supplierId) {
  const hash = crypto.createHash('sha256').update(supplierId).digest();
  return hash.readUInt32BE(0) % WINDOW_MINUTES;
}

/**
 * Get random jitter within bounds
 * @returns {number} Jitter in minutes (-JITTER_MINUTES to +JITTER_MINUTES)
 */
function getJitter() {
  return Math.floor(Math.random() * (JITTER_MINUTES * 2 + 1)) - JITTER_MINUTES;
}

/**
 * Calculate next scrape time for a supplier
 * @param {string} supplierId - UUID of the supplier
 * @returns {Date} Next scheduled scrape time
 */
function getNextScrapeTime(supplierId) {
  const now = new Date();

  // V2.35.14: Fix timezone - convert EST hours to UTC
  // EST is UTC-5, so 8 AM EST = 13:00 UTC
  const EST_OFFSET = 5; // hours behind UTC
  const windowStartUtc = WINDOW_START_HOUR + EST_OFFSET; // 8 AM EST = 13:00 UTC

  // Start with today at window start in UTC
  const base = new Date(now);
  base.setUTCHours(windowStartUtc, 0, 0, 0);

  // Add stable offset for this supplier
  const offset = getStableScrapeOffset(supplierId);
  base.setMinutes(base.getMinutes() + offset);

  // Add random jitter
  const jitter = getJitter();
  base.setMinutes(base.getMinutes() + jitter);

  // If the time has already passed today, schedule for tomorrow
  if (base <= now) {
    base.setDate(base.getDate() + 1);
  }

  return base;
}

/**
 * Get schedule preview for all suppliers
 * @param {Array} suppliers - Array of supplier records with id and name
 * @returns {Array} Schedule entries sorted by time
 */
function getSchedulePreview(suppliers) {
  const schedule = suppliers.map(s => ({
    supplierId: s.id,
    supplierName: s.name,
    baseOffset: getStableScrapeOffset(s.id),
    nextScrape: getNextScrapeTime(s.id)
  }));

  // Sort by next scrape time
  schedule.sort((a, b) => a.nextScrape - b.nextScrape);

  return schedule;
}

/**
 * Check if we're within the scraping window
 * V2.35.14: Fix timezone - check against EST hours, not UTC
 * @returns {boolean} True if within 8AM-6PM EST
 */
function isWithinWindow() {
  // Get current hour in EST (UTC-5)
  const now = new Date();
  const utcHour = now.getUTCHours();
  const estHour = (utcHour - 5 + 24) % 24; // Handle wraparound
  return estHour >= WINDOW_START_HOUR && estHour < WINDOW_END_HOUR;
}

/**
 * Initialize the distributed scheduler
 * @param {object} options - Configuration options
 * @param {object} options.sequelize - Sequelize instance
 * @param {object} options.logger - Logger instance
 * @param {boolean} options.shadowMode - If true, only log actions without scraping
 * @returns {object} Scheduler control interface
 */
function initScheduler(options = {}) {
  const { sequelize, logger = console, shadowMode: shadow = true } = options;
  shadowMode = shadow;

  if (!sequelize) {
    logger.warn('⚠️  DistributedScheduler: No database connection');
    return null;
  }

  // Track shadow mode start for reminder
  if (shadowMode && !shadowModeStartDate) {
    shadowModeStartDate = new Date();
    shadowModeStats = { executed: 0, byHour: {} };
  }

  logger.info('═══════════════════════════════════════════════════════════');
  logger.info('  Distributed Scheduler V2.1.0');
  logger.info(`  Mode: ${shadowMode ? 'SHADOW (compare only)' : 'ACTIVE'}`);
  logger.info(`  Window: ${WINDOW_START_HOUR}:00 - ${WINDOW_END_HOUR}:00 EST`);
  if (shadowMode && shadowModeStartDate) {
    const daysInShadow = Math.floor((Date.now() - shadowModeStartDate.getTime()) / (24 * 60 * 60 * 1000));
    logger.info(`  Shadow mode day: ${daysInShadow + 1} of ${SHADOW_MODE_DAYS}`);
  }
  logger.info('═══════════════════════════════════════════════════════════');

  // Check if shadow mode reminder is due
  checkShadowModeReminder(logger);

  return {
    start: () => startScheduler(sequelize, logger),
    stop: () => stopScheduler(logger),
    getStatus: () => getSchedulerStatus(),
    getShadowStats: () => getShadowModeStats(),
    previewSchedule: (suppliers) => getSchedulePreview(suppliers),
    isActive: () => isRunning,
    isShadowMode: () => shadowMode,
    setShadowMode: (mode) => { shadowMode = mode; }
  };
}

/**
 * Start the scheduler loop
 */
async function startScheduler(sequelize, logger) {
  if (isRunning) {
    logger.info('📅 Scheduler already running');
    return;
  }

  isRunning = true;
  logger.info('📅 Starting distributed scheduler...');

  // Load suppliers to schedule
  try {
    const [suppliers] = await sequelize.query(`
      SELECT id, name, website
      FROM suppliers
      WHERE active = true
      AND allow_price_display = true
      AND website IS NOT NULL
      AND website != ''
      ORDER BY name
    `);

    logger.info(`📋 Loaded ${suppliers.length} suppliers for scheduling`);

    // Calculate and log schedule preview
    const schedule = getSchedulePreview(suppliers);
    logger.info('');
    logger.info('📅 Today\'s scrape schedule (next 5):');
    schedule.slice(0, 5).forEach(s => {
      const time = s.nextScrape.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      logger.info(`   ${time} - ${s.supplierName}`);
    });
    logger.info(`   ... and ${Math.max(0, schedule.length - 5)} more`);

    // Schedule each supplier
    for (const entry of schedule) {
      scheduleSupplierScrape(entry, sequelize, logger);
    }

  } catch (error) {
    logger.error('❌ Failed to start scheduler:', error.message);
    isRunning = false;
  }
}

/**
 * Schedule a single supplier scrape
 */
function scheduleSupplierScrape(entry, sequelize, logger) {
  const { supplierId, supplierName, nextScrape } = entry;
  const now = new Date();
  const delay = nextScrape - now;

  if (delay < 0) {
    // Already passed, schedule for tomorrow
    const tomorrow = new Date(nextScrape);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return scheduleSupplierScrape({ ...entry, nextScrape: tomorrow }, sequelize, logger);
  }

  // Schedule the scrape
  const timeoutId = setTimeout(async () => {
    await executeScrape(supplierId, supplierName, sequelize, logger);

    // Reschedule for tomorrow
    const tomorrow = new Date(nextScrape);
    tomorrow.setDate(tomorrow.getDate() + 1);
    // Re-add jitter for tomorrow
    tomorrow.setMinutes(tomorrow.getMinutes() + getJitter());
    scheduleSupplierScrape({ supplierId, supplierName, nextScrape: tomorrow }, sequelize, logger);

  }, delay);

  scheduledScrapes.set(supplierId, {
    supplierId,
    supplierName,
    scheduledFor: nextScrape,
    timeoutId
  });
}

/**
 * Execute a single supplier scrape
 */
async function executeScrape(supplierId, supplierName, sequelize, logger) {
  const now = new Date();
  const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const hour = now.getHours();

  if (shadowMode) {
    // Shadow mode: log and track stats
    logger.info(`🔮 [SHADOW] Would scrape ${supplierName} at ${time}`);

    // Track stats for distribution analysis
    shadowModeStats.executed++;
    shadowModeStats.byHour[hour] = (shadowModeStats.byHour[hour] || 0) + 1;

    return;
  }

  // Active mode: perform actual scrape
  try {
    // Import scraper
    const { scrapeSupplierPrice, loadScrapeConfig, getConfigForSupplier } = require('./priceScraper');

    // Get supplier details
    const [suppliers] = await sequelize.query(
      `SELECT id, name, website, city, state FROM suppliers WHERE id = $1`,
      { bind: [supplierId] }
    );

    if (suppliers.length === 0) {
      logger.warn(`⚠️  Supplier ${supplierId} not found`);
      return;
    }

    const supplier = suppliers[0];
    const scrapeConfig = loadScrapeConfig();
    const config = getConfigForSupplier(supplier.website, scrapeConfig);

    if (!config || !config.enabled) {
      logger.info(`   ⏭️  Skipped (not configured)`);
      return;
    }

    // V3.0.0: Host group checks — kill switch, circuit breaker, spacing
    if (config.hostGroup === 'droplet') {
      if (process.env.SCRAPE_SKIP_DROPLET === 'true') {
        logger.info(`   ⏭️  Skipped ${supplierName} (SCRAPE_SKIP_DROPLET)`);
        return;
      }
      if (!canScrapeDroplet()) {
        logger.info(`   ⏸️  Skipped ${supplierName} (Droplet circuit breaker active)`);
        return;
      }
      const hostDelay = getHostGroupDelay('droplet');
      if (hostDelay > 0) {
        logger.info(`   ⏳ Delaying ${supplierName} ${Math.round(hostDelay / 60000)}min (host group spacing)`);
        await new Promise(r => setTimeout(r, hostDelay));
      }
    }

    logger.info(`🔄 [ACTIVE] Scraping ${supplierName} at ${time}...`);

    const result = await scrapeSupplierPrice(supplier, config);

    // V3.0.0: Track Droplet results for circuit breaker
    if (config.hostGroup === 'droplet') {
      markHostGroupScrape('droplet');
      if (result.success) {
        recordDropletResult('success');
      } else if (result.dropletFailureType) {
        recordDropletResult(result.dropletFailureType);
      }
    }

    const { recordSuccess, recordFailure, shouldSkipFailureCounter } = require('./scrapeBackoff');

    // V3.x.0: Helper to insert one secondary fuel price row (kerosene, propane).
    // Mirrors the INSERT shape used by `scripts/scrape-prices.js:319-373`.
    async function insertSecondaryFuel(fp, sourceType, sourceUrl) {
      try {
        const [prevF] = await sequelize.query(`
          SELECT price_per_gallon FROM supplier_prices
          WHERE supplier_id = $1 AND fuel_type = $2 AND is_valid = true
          ORDER BY scraped_at DESC LIMIT 1
        `, { bind: [supplierId, fp.fuelType] });
        const v = await checkAndRecordPrice(sequelize, {
          supplierId, supplierName, fuelType: fp.fuelType, newPrice: fp.price,
          prevPrice: prevF.length > 0 ? parseFloat(prevF[0].price_per_gallon) : null,
          stateMedian: null, primaryPrice: result.pricePerGallon, source: 'scheduler',
        }, logger);
        if (!v.ok) {
          logger.warn(`   ⚠️  [price-rejected] ${supplierName} ${fp.fuelType} $${fp.price.toFixed(3)} — ${v.rejection.reason}`);
          return;
        }
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
          bind: [supplierId, fp.price, fp.fuelType, sourceType, sourceUrl]
        });
        logger.info(`   🔥 ${fp.fuelType}: $${fp.price.toFixed(3)}`);
      } catch (fuelErr) {
        logger.warn(`   ⚠️  Failed to store ${fp.fuelType} price: ${fuelErr.message}`);
      }
    }

    if (result.success) {
      // sanity-gate the primary oil price (recordSuccess still runs below regardless)
      const [prevOil] = await sequelize.query(`
        SELECT price_per_gallon FROM supplier_prices
        WHERE supplier_id = $1 AND fuel_type = 'heating_oil' AND is_valid = true
        ORDER BY scraped_at DESC LIMIT 1
      `, { bind: [result.supplierId] });
      const oilVerdict = await checkAndRecordPrice(sequelize, {
        supplierId: result.supplierId, supplierName: supplier.name, fuelType: 'heating_oil',
        newPrice: result.pricePerGallon,
        prevPrice: prevOil.length > 0 ? parseFloat(prevOil[0].price_per_gallon) : null,
        stateMedian: await getStateMedian(sequelize, supplier.state), state: supplier.state,
        source: 'scheduler',
      }, logger);
      if (!oilVerdict.ok) {
        logger.warn(`   ⚠️  [price-rejected] ${supplierName} heating_oil $${result.pricePerGallon.toFixed(3)} — ${oilVerdict.rejection.reason}`);
      } else {
        // Save to database
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
            result.sourceType,
            result.sourceUrl,
            result.scrapedAt.toISOString(),
            result.expiresAt.toISOString()
          ]
        });
      }

      // V3.x.0: Also store secondary fuel prices (kerosene, propane). Was previously
      // missing on this code path — only `scripts/scrape-prices.js` (4PM cron) stored them,
      // so multi-fuel suppliers (Phillips, Morse, etc.) only refreshed secondaries once/day.
      if (Array.isArray(result.fuelPrices) && result.fuelPrices.length > 0) {
        for (const fp of result.fuelPrices) {
          await insertSecondaryFuel(fp, result.sourceType, result.sourceUrl);
        }
      }

      // Reset backoff status so cooldown suppliers return to active
      await recordSuccess(sequelize, supplierId);

      logger.info(`   ✅ $${result.pricePerGallon.toFixed(2)}/gal`);
    } else {
      // V3.x.0: primaryFuelOptional gate — when supplier is opted-in and at least one
      // secondary fuel succeeded, store secondaries + treat as healthy. Buxton Oil
      // is the first user (heating-oil card says "Call our office", propane scrapes fine).
      if (shouldSkipFailureCounter(config, result)) {
        const sourceType = config.displayable === false ? 'aggregator_signal' : 'scraped';
        for (const fp of result.fuelPrices) {
          await insertSecondaryFuel(fp, sourceType, supplier.website);
        }
        await recordSuccess(sequelize, supplierId);
        logger.warn(`   ⚠️  primary fuel optional — ${result.fuelPrices.length} secondary fuel(s) succeeded; resetting failure counter`);
      } else {
        await recordFailure(sequelize, supplierId, supplierName, logger, result.error);
        logger.info(`   ❌ ${result.error}`);
      }
    }

  } catch (error) {
    logger.error(`   ❌ Scrape error: ${error.message}`);
  }
}

/**
 * Stop the scheduler
 */
function stopScheduler(logger) {
  if (!isRunning) {
    logger.info('📅 Scheduler not running');
    return;
  }

  logger.info('📅 Stopping distributed scheduler...');

  // Clear all scheduled timeouts
  for (const [supplierId, entry] of scheduledScrapes) {
    clearTimeout(entry.timeoutId);
  }
  scheduledScrapes.clear();
  isRunning = false;

  logger.info('📅 Scheduler stopped');
}

/**
 * Get current scheduler status
 */
function getSchedulerStatus() {
  const upcoming = [];

  for (const [supplierId, entry] of scheduledScrapes) {
    upcoming.push({
      supplierId,
      supplierName: entry.supplierName,
      scheduledFor: entry.scheduledFor
    });
  }

  // Sort by scheduled time
  upcoming.sort((a, b) => a.scheduledFor - b.scheduledFor);

  return {
    isRunning,
    shadowMode,
    scheduledCount: scheduledScrapes.size,
    nextFive: upcoming.slice(0, 5),
    windowStart: `${WINDOW_START_HOUR}:00`,
    windowEnd: `${WINDOW_END_HOUR}:00`,
    isWithinWindow: isWithinWindow()
  };
}

/**
 * Check if shadow mode reminder is due and log prominently
 */
function checkShadowModeReminder(logger) {
  if (!shadowMode || !shadowModeStartDate) return;

  const daysInShadow = Math.floor((Date.now() - shadowModeStartDate.getTime()) / (24 * 60 * 60 * 1000));

  if (daysInShadow >= SHADOW_MODE_DAYS) {
    const stats = getShadowModeStats();

    // Log to console
    logger.warn('');
    logger.warn('╔═══════════════════════════════════════════════════════════════╗');
    logger.warn('║  ⚠️  PHASE 11 REMINDER: Shadow mode has run for 7+ days!      ║');
    logger.warn('║                                                                ║');
    logger.warn('║  Review shadow stats and consider promoting to active mode:   ║');
    logger.warn('║  1. Check distribution: scheduler.getShadowStats()            ║');
    logger.warn('║  2. If good, set shadowMode: false in server.js               ║');
    logger.warn('║  3. Comment out the old cron.schedule(...) block              ║');
    logger.warn('║                                                                ║');
    logger.warn('║  Current stats:                                               ║');
    logger.warn(`║    Executions: ${stats.executed.toString().padEnd(45)}║`);
    logger.warn(`║    Distribution: ${stats.distributionSummary.padEnd(42)}║`);
    logger.warn('╚═══════════════════════════════════════════════════════════════╝');
    logger.warn('');

    // Send email once
    if (!phase11EmailSent) {
      sendPhase11ReminderEmail(stats, logger);
    }
  }
}

/**
 * Send Phase 11 reminder email with detailed instructions
 */
async function sendPhase11ReminderEmail(stats, logger) {
  const adminEmail = process.env.ADMIN_EMAIL || process.env.EMAIL_USER;

  if (!adminEmail || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    logger.warn('⚠️  Cannot send Phase 11 email: EMAIL_USER/EMAIL_PASS/ADMIN_EMAIL not configured');
    return;
  }

  // Mark as sent immediately to prevent duplicates
  phase11EmailSent = true;

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    const qualityEmoji = stats.distribution.quality === 'excellent' ? '✅' :
                         stats.distribution.quality === 'good' ? '✅' :
                         stats.distribution.quality === 'fair' ? '⚠️' : '❌';

    const hourlyBreakdown = Object.entries(stats.byHour)
      .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
      .map(([hour, count]) => `  ${hour.padStart(2, '0')}:00 - ${count} scrapes`)
      .join('\n');

    const emailBody = `
SmartHeat Phase 11 Reminder
═══════════════════════════════════════════════════════════

The distributed scheduler has been running in SHADOW MODE for ${stats.daysInShadow} days.
It's time to review the results and decide whether to promote it to active mode.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SHADOW MODE STATISTICS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Total shadow executions: ${stats.executed}
Distribution window: ${stats.distribution.minHour}:00 - ${stats.distribution.maxHour}:00
Average per hour: ${stats.distribution.avgPerHour}
Distribution quality: ${qualityEmoji} ${stats.distribution.quality.toUpperCase()}

Hourly breakdown:
${hourlyBreakdown || '  No data yet'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHAT TO DO NOW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${stats.readyToPromote ? `
✅ READY TO PROMOTE - Distribution looks good!

Open Claude Code and paste this prompt:
──────────────────────────────────────────────────────────

Complete Phase 11: Disable the old fixed 10 AM cron and activate the
distributed scheduler. The shadow mode stats show ${stats.distribution.quality}
distribution quality after ${stats.daysInShadow} days. Make the following changes:

1. In /backend/server.js, change shadowMode: true to shadowMode: false
2. Comment out the old cron.schedule('0 15 * * *', ...) block
3. Deploy to production

──────────────────────────────────────────────────────────
` : `
⚠️ NOT READY - Distribution quality is ${stats.distribution.quality}

Wait a few more days for better data, or investigate why distribution
is uneven. Check if:
- Server has been restarting frequently
- Suppliers are clustered in certain time slots
- There are errors in the scheduler logs
`}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHAT PHASE 11 DOES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Currently running:
  • OLD: Fixed 10 AM cron scrapes all suppliers at once
  • NEW: Distributed scheduler (shadow mode - logging only)

After Phase 11:
  • OLD: Disabled (commented out)
  • NEW: Active - scrapes suppliers spread across 8AM-6PM

Benefits:
  • Reduces detection risk (no 10 AM spike pattern)
  • Spreads server load throughout the day
  • Each supplier gets a consistent daily time

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This is an automated reminder from SmartHeat backend.
You will not receive this email again unless the server restarts
and shadow mode is still enabled.
`;

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: adminEmail,
      subject: `🔔 SmartHeat Phase 11: Distributed Scheduler Ready for Review`,
      text: emailBody
    });

    logger.info(`📧 Phase 11 reminder email sent to ${adminEmail}`);

  } catch (error) {
    logger.error(`❌ Failed to send Phase 11 email: ${error.message}`);
    // Reset flag so it can retry on next restart
    phase11EmailSent = false;
  }
}

/**
 * Get shadow mode statistics for distribution analysis
 */
function getShadowModeStats() {
  const daysInShadow = shadowModeStartDate
    ? Math.floor((Date.now() - shadowModeStartDate.getTime()) / (24 * 60 * 60 * 1000))
    : 0;

  // Calculate distribution metrics
  const hours = Object.entries(shadowModeStats.byHour)
    .map(([h, count]) => ({ hour: parseInt(h), count }))
    .sort((a, b) => a.hour - b.hour);

  const minHour = hours.length > 0 ? Math.min(...hours.map(h => h.hour)) : WINDOW_START_HOUR;
  const maxHour = hours.length > 0 ? Math.max(...hours.map(h => h.hour)) : WINDOW_END_HOUR;
  const counts = hours.map(h => h.count);
  const avgPerHour = counts.length > 0 ? counts.reduce((a, b) => a + b, 0) / counts.length : 0;
  const maxCount = counts.length > 0 ? Math.max(...counts) : 0;

  // Simple distribution quality check
  let distributionQuality = 'unknown';
  if (hours.length >= 5) {
    const variance = counts.reduce((sum, c) => sum + Math.pow(c - avgPerHour, 2), 0) / counts.length;
    const stdDev = Math.sqrt(variance);
    const cv = avgPerHour > 0 ? stdDev / avgPerHour : 0; // Coefficient of variation

    if (cv < 0.3) distributionQuality = 'excellent';
    else if (cv < 0.5) distributionQuality = 'good';
    else if (cv < 0.7) distributionQuality = 'fair';
    else distributionQuality = 'poor';
  }

  return {
    daysInShadow,
    executed: shadowModeStats.executed,
    byHour: shadowModeStats.byHour,
    distribution: {
      minHour,
      maxHour,
      avgPerHour: Math.round(avgPerHour * 10) / 10,
      maxCount,
      quality: distributionQuality
    },
    distributionSummary: `${minHour}:00-${maxHour}:00, quality: ${distributionQuality}`,
    readyToPromote: daysInShadow >= SHADOW_MODE_DAYS && distributionQuality !== 'poor',
    startDate: shadowModeStartDate?.toISOString() || null
  };
}

module.exports = {
  // Main initialization
  initScheduler,

  // Utility functions (for testing)
  getStableScrapeOffset,
  getNextScrapeTime,
  getSchedulePreview,
  isWithinWindow,
  getShadowModeStats,

  // V3.0.0: Host group / circuit breaker
  recordDropletResult,
  canScrapeDroplet,
  getHostGroupDelay,
  markHostGroupScrape,

  // Constants
  WINDOW_START_HOUR,
  WINDOW_END_HOUR,
  WINDOW_MINUTES,
  JITTER_MINUTES
};
