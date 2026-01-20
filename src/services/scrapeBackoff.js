/**
 * Scrape Backoff Service
 * V2.6.0: Manages cooldown logic for blocked sites
 *
 * Rules:
 * - 2 consecutive failures → 7 day cooldown
 * - 3 failures in 30 days → mark as phone_only
 * - Monthly retry of phone_only sites (1st of month)
 */

const COOLDOWN_DAYS = 7;
const MAX_CONSECUTIVE_FAILURES = 2;
const MAX_FAILURES_IN_30_DAYS = 3;

/**
 * Check if a supplier should be scraped based on backoff status
 * @param {object} supplier - Supplier with backoff fields
 * @returns {object} { shouldScrape: boolean, reason?: string }
 */
function shouldScrapeSupplier(supplier) {
  const now = new Date();

  // Phone-only suppliers are skipped
  if (supplier.scrape_status === 'phone_only') {
    return {
      shouldScrape: false,
      reason: 'phone_only - blocked too often'
    };
  }

  // Check if in cooldown
  if (supplier.scrape_status === 'cooldown' && supplier.scrape_cooldown_until) {
    const cooldownEnd = new Date(supplier.scrape_cooldown_until);
    if (now < cooldownEnd) {
      const daysLeft = Math.ceil((cooldownEnd - now) / (24 * 60 * 60 * 1000));
      return {
        shouldScrape: false,
        reason: `cooldown - ${daysLeft}d remaining`
      };
    }
    // Cooldown expired, can scrape again
  }

  return { shouldScrape: true };
}

/**
 * Record a successful scrape - reset failure counters
 * @param {object} sequelize - Sequelize instance
 * @param {string} supplierId - Supplier ID
 */
async function recordSuccess(sequelize, supplierId) {
  await sequelize.query(`
    UPDATE suppliers SET
      consecutive_scrape_failures = 0,
      scrape_status = 'active',
      scrape_cooldown_until = NULL,
      updated_at = NOW()
    WHERE id = $1
  `, { bind: [supplierId] });
}

/**
 * Record a failed scrape - update failure counters and potentially set cooldown
 * @param {object} sequelize - Sequelize instance
 * @param {string} supplierId - Supplier ID
 * @param {string} supplierName - For logging
 * @param {object} logger - Logger instance
 * @returns {object} { action: 'none' | 'cooldown' | 'phone_only' }
 */
async function recordFailure(sequelize, supplierId, supplierName, logger) {
  const now = new Date();

  // Get current state
  const [suppliers] = await sequelize.query(`
    SELECT consecutive_scrape_failures, scrape_failure_dates
    FROM suppliers WHERE id = $1
  `, { bind: [supplierId] });

  if (suppliers.length === 0) {
    return { action: 'none' };
  }

  const supplier = suppliers[0];
  const consecutiveFailures = (supplier.consecutive_scrape_failures || 0) + 1;

  // Update failure dates array (keep only last 30 days)
  let failureDates = supplier.scrape_failure_dates || [];
  if (!Array.isArray(failureDates)) failureDates = [];

  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  failureDates = failureDates.filter(d => new Date(d) > thirtyDaysAgo);
  failureDates.push(now.toISOString());

  // Determine action
  let action = 'none';
  let newStatus = 'active';
  let cooldownUntil = null;

  // Check for phone_only threshold (3 failures in 30 days)
  if (failureDates.length >= MAX_FAILURES_IN_30_DAYS) {
    action = 'phone_only';
    newStatus = 'phone_only';
    logger.warn(`   ⛔ ${supplierName} marked as PHONE_ONLY (${failureDates.length} failures in 30 days)`);
  }
  // Check for cooldown threshold (2 consecutive failures)
  else if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    action = 'cooldown';
    newStatus = 'cooldown';
    cooldownUntil = new Date(now.getTime() + COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
    logger.warn(`   🕐 ${supplierName} entering ${COOLDOWN_DAYS}-day cooldown (${consecutiveFailures} consecutive failures)`);
  }

  // Update database
  await sequelize.query(`
    UPDATE suppliers SET
      consecutive_scrape_failures = $1,
      scrape_failure_dates = $2::jsonb,
      last_scrape_failure_at = $3,
      scrape_status = $4,
      scrape_cooldown_until = $5,
      updated_at = NOW()
    WHERE id = $6
  `, {
    bind: [
      consecutiveFailures,
      JSON.stringify(failureDates),
      now.toISOString(),
      newStatus,
      cooldownUntil?.toISOString() || null,
      supplierId
    ]
  });

  return { action, consecutiveFailures, failuresLast30Days: failureDates.length };
}

/**
 * Reset all phone_only suppliers to active (monthly retry)
 * Call this on the 1st of each month
 * @param {object} sequelize - Sequelize instance
 * @param {object} logger - Logger instance
 */
async function monthlyReset(sequelize, logger) {
  const [result] = await sequelize.query(`
    UPDATE suppliers SET
      scrape_status = 'active',
      consecutive_scrape_failures = 0,
      scrape_cooldown_until = NULL,
      updated_at = NOW()
    WHERE scrape_status = 'phone_only'
    RETURNING name
  `);

  if (result.length > 0) {
    logger.info(`🔄 Monthly reset: ${result.length} phone_only suppliers reset to active`);
    result.forEach(s => logger.info(`   - ${s.name}`));
  }

  return result.length;
}

/**
 * Get backoff statistics for reporting
 * @param {object} sequelize - Sequelize instance
 */
async function getBackoffStats(sequelize) {
  const [stats] = await sequelize.query(`
    SELECT
      COUNT(*) FILTER (WHERE scrape_status = 'active') as active_count,
      COUNT(*) FILTER (WHERE scrape_status = 'cooldown') as cooldown_count,
      COUNT(*) FILTER (WHERE scrape_status = 'phone_only') as phone_only_count,
      COUNT(*) FILTER (WHERE consecutive_scrape_failures > 0) as with_recent_failures
    FROM suppliers
    WHERE active = true
      AND website IS NOT NULL
      AND website != ''
  `);

  return stats[0];
}

module.exports = {
  shouldScrapeSupplier,
  recordSuccess,
  recordFailure,
  monthlyReset,
  getBackoffStats,
  // Constants for testing/reference
  COOLDOWN_DAYS,
  MAX_CONSECUTIVE_FAILURES,
  MAX_FAILURES_IN_30_DAYS
};
