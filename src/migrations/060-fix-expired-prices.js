/**
 * Migration 060: Fix expired prices
 * V2.35.14: One-time fix to extend expiration of recently scraped prices
 *
 * Problem: Prices scraped in the last 7 days have expired due to:
 * 1. 24-hour expiration being too short
 * 2. Distributed scheduler timezone bug causing scrape window to close early
 * 3. Railway incident potentially causing missed scrapes
 *
 * Fix: Extend expires_at to 48 hours from NOW for all valid prices
 * scraped in the last 7 days that have already expired.
 */

async function up(sequelize) {
  console.log('[Migration 060] Fixing expired prices...');

  try {
    // Update recently scraped prices that have expired
    const [result] = await sequelize.query(`
      UPDATE supplier_prices
      SET expires_at = NOW() + INTERVAL '48 hours',
          updated_at = NOW()
      WHERE is_valid = true
        AND scraped_at > NOW() - INTERVAL '7 days'
        AND expires_at <= NOW()
      RETURNING id
    `);

    const fixedCount = result?.length || 0;
    console.log(`[Migration 060] Fixed ${fixedCount} expired prices`);

    // Log summary of price status after fix
    const [summary] = await sequelize.query(`
      SELECT
        COUNT(*) FILTER (WHERE expires_at > NOW() AND is_valid = true) as valid_not_expired,
        COUNT(*) FILTER (WHERE expires_at <= NOW() AND is_valid = true) as valid_but_expired,
        MAX(scraped_at) as most_recent_scrape,
        MAX(expires_at) FILTER (WHERE expires_at > NOW()) as latest_expiration
      FROM supplier_prices
      WHERE scraped_at > NOW() - INTERVAL '7 days'
    `);

    if (summary[0]) {
      const s = summary[0];
      console.log(`[Migration 060] After fix:`);
      console.log(`  - Valid & not expired: ${s.valid_not_expired}`);
      console.log(`  - Valid but expired: ${s.valid_but_expired}`);
      console.log(`  - Most recent scrape: ${s.most_recent_scrape}`);
      console.log(`  - Latest expiration: ${s.latest_expiration}`);
    }

    return { success: true, fixedCount };

  } catch (error) {
    console.error('[Migration 060] Error:', error.message);
    return { success: false, error: error.message };
  }
}

async function down(sequelize) {
  // No rollback needed - prices will naturally re-expire
  console.log('[Migration 060] No rollback action needed');
  return { success: true };
}

module.exports = { up, down };
