/**
 * Supplier Health Service
 * Aggregates health data from existing DB fields for the dashboard Health tab.
 * No new migrations required — reads from suppliers and supplier_prices tables.
 */

const { getBackoffStats } = require('./scrapeBackoff');

class SupplierHealthService {
  /**
   * Generate a comprehensive health report
   * @param {object} sequelize - Sequelize instance
   * @returns {object} Health report
   */
  async generateHealthReport(sequelize) {
    const [
      backoffStats,
      freshness,
      failureData,
      scrapedTodayData,
      lastScrapeData,
      staleSuppliers,
      cooldownSuppliers,
      atRiskSuppliers
    ] = await Promise.all([
      getBackoffStats(sequelize),
      this._getPriceFreshness(sequelize),
      this._getFailureData(sequelize),
      this._getScrapedToday(sequelize),
      this._getLastScrape(sequelize),
      this._getStaleSuppliers(sequelize),
      this._getNewCooldowns(sequelize),
      this._getAtRiskSuppliers(sequelize)
    ]);

    const totalScrapable = (parseInt(backoffStats.active_count) || 0)
      + (parseInt(backoffStats.cooldown_count) || 0)
      + (parseInt(backoffStats.phone_only_count) || 0);

    const scrapedToday = parseInt(scrapedTodayData) || 0;
    const totalFailures24h = parseInt(failureData.totalFailures24h) || 0;
    const totalAttempts24h = scrapedToday + totalFailures24h;
    const successRate = totalAttempts24h > 0
      ? Math.round((scrapedToday / totalAttempts24h) * 100)
      : 100;

    return {
      backoff: {
        active: parseInt(backoffStats.active_count) || 0,
        cooldown: parseInt(backoffStats.cooldown_count) || 0,
        phoneOnly: parseInt(backoffStats.phone_only_count) || 0,
        totalScrapable
      },
      priceFreshness: freshness,
      recentFailures: {
        total: totalFailures24h,
        suppliersWithFailures: parseInt(failureData.suppliersWithFailures) || 0
      },
      newCooldowns: cooldownSuppliers,
      atRisk: atRiskSuppliers,
      staleSuppliers,
      scrapedToday,
      lastScrapeAt: lastScrapeData,
      successRate
    };
  }

  /**
   * Get price freshness breakdown
   * Categories: fresh (<24h), aging (24-48h), stale (48h-7d), expired (>7d or never)
   */
  async _getPriceFreshness(sequelize) {
    const [results] = await sequelize.query(`
      WITH latest_prices AS (
        SELECT DISTINCT ON (supplier_id)
          supplier_id,
          scraped_at
        FROM supplier_prices
        WHERE is_valid = true
        ORDER BY supplier_id, scraped_at DESC
      ),
      scrapable AS (
        SELECT s.id
        FROM suppliers s
        WHERE s.active = true
          AND s.website IS NOT NULL
          AND s.website != ''
      )
      SELECT
        COUNT(*) FILTER (WHERE lp.scraped_at >= NOW() - INTERVAL '24 hours') as fresh,
        COUNT(*) FILTER (WHERE lp.scraped_at >= NOW() - INTERVAL '48 hours'
                           AND lp.scraped_at < NOW() - INTERVAL '24 hours') as aging,
        COUNT(*) FILTER (WHERE lp.scraped_at >= NOW() - INTERVAL '7 days'
                           AND lp.scraped_at < NOW() - INTERVAL '48 hours') as stale,
        COUNT(*) FILTER (WHERE lp.scraped_at < NOW() - INTERVAL '7 days'
                           OR lp.scraped_at IS NULL) as expired
      FROM scrapable sc
      LEFT JOIN latest_prices lp ON sc.id = lp.supplier_id
    `);

    const row = results[0] || {};
    return {
      fresh: parseInt(row.fresh) || 0,
      aging: parseInt(row.aging) || 0,
      stale: parseInt(row.stale) || 0,
      expired: parseInt(row.expired) || 0
    };
  }

  /**
   * Get failure data from the last 24 hours
   * Uses scrape_failure_dates JSON array on suppliers table
   */
  async _getFailureData(sequelize) {
    const [results] = await sequelize.query(`
      WITH failure_entries AS (
        SELECT s.id as supplier_id, d.val::timestamptz as failure_at
        FROM suppliers s,
        LATERAL jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(s.scrape_failure_dates) = 'array' THEN s.scrape_failure_dates ELSE '[]'::jsonb END
        ) AS d(val)
        WHERE s.active = true
          AND s.website IS NOT NULL
          AND s.website != ''
      )
      SELECT
        COUNT(*) as total_failures,
        COUNT(DISTINCT supplier_id) as suppliers_with_failures
      FROM failure_entries
      WHERE failure_at >= NOW() - INTERVAL '24 hours'
    `);

    const row = results[0] || {};
    return {
      totalFailures24h: row.total_failures,
      suppliersWithFailures: row.suppliers_with_failures
    };
  }

  /**
   * Get count of suppliers scraped today
   */
  async _getScrapedToday(sequelize) {
    const [results] = await sequelize.query(`
      SELECT COUNT(DISTINCT supplier_id) as count
      FROM supplier_prices
      WHERE scraped_at > CURRENT_DATE
        AND is_valid = true
    `);
    return results[0]?.count || 0;
  }

  /**
   * Get timestamp of last successful scrape
   */
  async _getLastScrape(sequelize) {
    const [results] = await sequelize.query(`
      SELECT MAX(scraped_at) as last_scrape
      FROM supplier_prices
      WHERE is_valid = true
    `);
    return results[0]?.last_scrape || null;
  }

  /**
   * Get suppliers with stale prices (>48h old)
   */
  async _getStaleSuppliers(sequelize) {
    const [results] = await sequelize.query(`
      WITH latest_prices AS (
        SELECT DISTINCT ON (supplier_id)
          supplier_id,
          price_per_gallon,
          scraped_at
        FROM supplier_prices
        WHERE is_valid = true
        ORDER BY supplier_id, scraped_at DESC
      )
      SELECT
        s.name,
        s.city,
        s.state,
        lp.price_per_gallon as last_price,
        lp.scraped_at as last_updated,
        s.website,
        EXTRACT(EPOCH FROM (NOW() - lp.scraped_at)) / 86400 as days_since_update
      FROM suppliers s
      INNER JOIN latest_prices lp ON s.id = lp.supplier_id
      WHERE s.active = true
        AND s.website IS NOT NULL
        AND s.website != ''
        AND lp.scraped_at < NOW() - INTERVAL '48 hours'
      ORDER BY lp.scraped_at ASC
    `);

    return results.map(r => ({
      name: r.name,
      city: r.city,
      state: r.state,
      lastPrice: r.last_price ? parseFloat(r.last_price) : null,
      lastUpdated: r.last_updated,
      website: r.website,
      daysSinceUpdate: Math.round(parseFloat(r.days_since_update) * 10) / 10
    }));
  }

  /**
   * Get suppliers that entered cooldown in the last 24 hours
   */
  async _getNewCooldowns(sequelize) {
    const [results] = await sequelize.query(`
      SELECT
        s.name,
        s.city,
        s.state,
        s.website,
        s.consecutive_scrape_failures,
        s.scrape_status
      FROM suppliers s
      WHERE s.active = true
        AND s.scrape_status IN ('cooldown', 'phone_only')
        AND s.last_scrape_failure_at >= NOW() - INTERVAL '24 hours'
      ORDER BY s.last_scrape_failure_at DESC
    `);

    return results.map(r => ({
      name: r.name,
      city: r.city,
      state: r.state,
      website: r.website,
      consecutiveFailures: r.consecutive_scrape_failures,
      status: r.scrape_status
    }));
  }

  /**
   * Get suppliers at risk of entering cooldown (1 failure from threshold)
   * MAX_CONSECUTIVE_FAILURES is 2, so 1 consecutive failure = at risk
   */
  async _getAtRiskSuppliers(sequelize) {
    const [results] = await sequelize.query(`
      SELECT
        s.name,
        s.city,
        s.state,
        s.consecutive_scrape_failures,
        s.last_scrape_failure_at
      FROM suppliers s
      WHERE s.active = true
        AND s.website IS NOT NULL
        AND s.website != ''
        AND s.scrape_status = 'active'
        AND s.consecutive_scrape_failures = 1
      ORDER BY s.last_scrape_failure_at DESC
    `);

    return results.map(r => ({
      name: r.name,
      city: r.city,
      state: r.state,
      consecutiveFailures: r.consecutive_scrape_failures,
      lastFailureAt: r.last_scrape_failure_at
    }));
  }
}

module.exports = SupplierHealthService;
