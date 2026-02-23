/**
 * PlatformMetricsService
 *
 * Computes daily platform metrics snapshot for the Command Center liquidity dashboard.
 * Runs nightly at 2:15 AM ET via cron. Results stored in daily_platform_metrics table.
 *
 * Pattern follows ZipStatsComputer: constructor(sequelize, logger), main method computeDaily().
 *
 * All heavy lifting is PostgreSQL-side (CTEs, aggregations). Node.js just sends queries
 * and receives small result sets. Queries run sequentially — no concurrent memory spikes.
 */

const ADVISORY_LOCK_KEY = 742019231;

class PlatformMetricsService {
  constructor(sequelize, logger = console) {
    this.sequelize = sequelize;
    this.logger = logger;
  }

  /**
   * Compute metrics for a target day and upsert into daily_platform_metrics.
   * Defaults to yesterday ET (the day that just ended).
   * Uses pg_try_advisory_lock to prevent overlapping runs.
   *
   * @param {string} [targetDate] - YYYY-MM-DD format, defaults to yesterday ET
   * @returns {{ success: boolean, day: string, durationMs: number }}
   */
  async computeDaily(targetDate) {
    const startTime = Date.now();

    // Default to yesterday ET
    const targetDay = targetDate || this._yesterdayET();
    this.logger.info(`[PlatformMetrics] Computing metrics for ${targetDay}...`);

    let lockAcquired = false;
    try {
      // Advisory lock to prevent overlapping runs
      const [[lockResult]] = await this.sequelize.query(
        `SELECT pg_try_advisory_lock(${ADVISORY_LOCK_KEY}) AS locked`
      );
      lockAcquired = lockResult.locked;

      if (!lockAcquired) {
        this.logger.info('[PlatformMetrics] Another instance is running, skipping.');
        return { success: false, day: targetDay, durationMs: Date.now() - startTime, reason: 'locked' };
      }

      // Run 3 queries sequentially
      const coreMetrics = await this._computeCoreMetrics(targetDay);
      const demandDensity = await this._computeDemandDensity(targetDay);
      const communityTopZips = await this._computeCommunityTopZips(targetDay);

      // Upsert
      await this._upsert(targetDay, coreMetrics, demandDensity, communityTopZips);

      const durationMs = Date.now() - startTime;
      this.logger.info(
        `[PlatformMetrics] ${targetDay} — searches: ${coreMetrics.search_zips}, ` +
        `pipeline: ${coreMetrics.pipeline_suppliers}, calls: ${coreMetrics.calls_7d}, ` +
        `clicks: ${coreMetrics.website_clicks_7d}, deliveries: ${coreMetrics.deliveries_7d} ` +
        `(${durationMs}ms)`
      );

      return { success: true, day: targetDay, durationMs };
    } finally {
      if (lockAcquired) {
        await this.sequelize.query(`SELECT pg_advisory_unlock(${ADVISORY_LOCK_KEY})`);
      }
    }
  }

  /**
   * Core metrics: pipeline suppliers, search denominators, utilization, match rate, engagement, deliveries
   * All windows are relative to targetDay.
   */
  async _computeCoreMetrics(targetDay) {
    const [[row]] = await this.sequelize.query(`
      WITH params AS (
        SELECT
          $1::date AS target_day,
          ($1::date - 6) AS d7_start,
          ($1::date - 29) AS d30_start,
          ($1::date - 59) AS d60_start,
          ($1::date - 30) AS prev30_end
      ),

      -- Pipeline suppliers (same definition as Supplier Health)
      pipeline AS (
        SELECT COUNT(*) AS cnt
        FROM suppliers
        WHERE active = true
          AND allow_price_display = true
          AND website IS NOT NULL
          AND website != ''
      ),

      -- Search denominators from api_activity (7d window)
      search_stats AS (
        SELECT
          COUNT(*) AS zip_days,
          COUNT(DISTINCT zip_code) AS zips
        FROM (
          SELECT zip_code, created_at::date AS day
          FROM api_activity, params p
          WHERE zip_code IS NOT NULL
            AND status_code < 400
            AND method = 'GET'
            AND created_at::date BETWEEN p.d7_start AND p.target_day
          GROUP BY zip_code, created_at::date
        ) sub
      ),

      -- Utilization: suppliers clicked/called in 7d and 30d windows
      util AS (
        SELECT
          COUNT(DISTINCT supplier_id) FILTER (
            WHERE created_at::date BETWEEN (SELECT d7_start FROM params) AND (SELECT target_day FROM params)
              AND action_type = 'website'
          ) AS clicked_7d,
          COUNT(DISTINCT supplier_id) FILTER (
            WHERE created_at::date BETWEEN (SELECT d30_start FROM params) AND (SELECT target_day FROM params)
              AND action_type = 'website'
          ) AS clicked_30d,
          COUNT(DISTINCT supplier_id) FILTER (
            WHERE created_at::date BETWEEN (SELECT d7_start FROM params) AND (SELECT target_day FROM params)
              AND action_type = 'call'
          ) AS called_7d,
          COUNT(DISTINCT supplier_id) FILTER (
            WHERE created_at::date BETWEEN (SELECT d30_start FROM params) AND (SELECT target_day FROM params)
              AND action_type = 'call'
          ) AS called_30d
        FROM supplier_clicks
        WHERE created_at::date BETWEEN (SELECT d30_start FROM params) AND (SELECT target_day FROM params)
      ),

      -- Match rate components + engagement totals (7d)
      match_engage AS (
        SELECT
          -- ZIP-day match rate (soft): distinct (zip, day) pairs with any click
          COUNT(DISTINCT (zip_code, created_at::date)) FILTER (
            WHERE action_type = 'website'
          ) AS zip_days_with_click,
          -- ZIP-day match rate (hard): distinct (zip, day) pairs with a call
          COUNT(DISTINCT (zip_code, created_at::date)) FILTER (
            WHERE action_type = 'call'
          ) AS zip_days_with_call,
          -- Liquidity coverage: distinct ZIPs with a call
          COUNT(DISTINCT zip_code) FILTER (
            WHERE action_type = 'call'
          ) AS zips_with_call,
          -- Totals
          COUNT(*) FILTER (WHERE action_type = 'call') AS calls,
          COUNT(*) FILTER (WHERE action_type = 'website') AS website_clicks
        FROM supplier_clicks, params p
        WHERE created_at::date BETWEEN p.d7_start AND p.target_day
      ),

      -- Community deliveries
      deliv AS (
        SELECT
          COUNT(*) FILTER (
            WHERE created_at::date BETWEEN (SELECT d7_start FROM params) AND (SELECT target_day FROM params)
          ) AS d7,
          COUNT(*) FILTER (
            WHERE created_at::date BETWEEN (SELECT d30_start FROM params) AND (SELECT target_day FROM params)
          ) AS d30,
          COUNT(*) FILTER (
            WHERE created_at::date BETWEEN (SELECT d30_start FROM params) AND (SELECT target_day FROM params)
              AND fuel_type = 'heating_oil'
          ) AS oil_30d,
          COUNT(*) FILTER (
            WHERE created_at::date BETWEEN (SELECT d30_start FROM params) AND (SELECT target_day FROM params)
              AND fuel_type = 'propane'
          ) AS propane_30d,
          COUNT(*) FILTER (
            WHERE created_at::date BETWEEN (SELECT d60_start FROM params) AND (SELECT prev30_end FROM params)
              AND fuel_type = 'propane'
          ) AS propane_prev30d
        FROM community_deliveries, params p
        WHERE validation_status = 'valid'
          AND created_at::date BETWEEN p.d60_start AND p.target_day
      )

      SELECT
        (SELECT cnt FROM pipeline) AS pipeline_suppliers,
        (SELECT zip_days FROM search_stats) AS search_zip_days,
        (SELECT zips FROM search_stats) AS search_zips,
        u.clicked_7d AS suppliers_clicked_7d,
        u.clicked_30d AS suppliers_clicked_30d,
        u.called_7d AS suppliers_called_7d,
        u.called_30d AS suppliers_called_30d,
        me.zip_days_with_click AS zip_days_with_click_7d,
        me.zip_days_with_call AS zip_days_with_call_7d,
        me.zips_with_call AS zips_with_call_7d,
        me.calls AS calls_7d,
        me.website_clicks AS website_clicks_7d,
        d.d7 AS deliveries_7d,
        d.d30 AS deliveries_30d,
        d.oil_30d AS deliveries_oil_30d,
        d.propane_30d AS deliveries_propane_30d,
        d.propane_prev30d AS deliveries_propane_prev30d
      FROM util u, match_engage me, deliv d
    `, { bind: [targetDay] });

    return {
      pipeline_suppliers: parseInt(row.pipeline_suppliers) || 0,
      search_zip_days: parseInt(row.search_zip_days) || 0,
      search_zips: parseInt(row.search_zips) || 0,
      suppliers_clicked_7d: parseInt(row.suppliers_clicked_7d) || 0,
      suppliers_clicked_30d: parseInt(row.suppliers_clicked_30d) || 0,
      suppliers_called_7d: parseInt(row.suppliers_called_7d) || 0,
      suppliers_called_30d: parseInt(row.suppliers_called_30d) || 0,
      zip_days_with_click_7d: parseInt(row.zip_days_with_click_7d) || 0,
      zip_days_with_call_7d: parseInt(row.zip_days_with_call_7d) || 0,
      zips_with_call_7d: parseInt(row.zips_with_call_7d) || 0,
      calls_7d: parseInt(row.calls_7d) || 0,
      website_clicks_7d: parseInt(row.website_clicks_7d) || 0,
      deliveries_7d: parseInt(row.deliveries_7d) || 0,
      deliveries_30d: parseInt(row.deliveries_30d) || 0,
      deliveries_oil_30d: parseInt(row.deliveries_oil_30d) || 0,
      deliveries_propane_30d: parseInt(row.deliveries_propane_30d) || 0,
      deliveries_propane_prev30d: parseInt(row.deliveries_propane_prev30d) || 0
    };
  }

  /**
   * Demand density top 25 ZIPs.
   * Score = (clicks + calls*3) / active_search_days per ZIP.
   * active_search_days from api_activity (search intent), not supplier_clicks.
   * Filters out ZIPs with < 2 active search days.
   */
  async _computeDemandDensity(targetDay) {
    const [rows] = await this.sequelize.query(`
      WITH params AS (
        SELECT $1::date AS target_day, ($1::date - 6) AS d7_start
      ),

      -- Search days per ZIP from api_activity
      search_days AS (
        SELECT
          zip_code,
          COUNT(DISTINCT created_at::date) AS active_days
        FROM api_activity, params p
        WHERE zip_code IS NOT NULL
          AND status_code < 400
          AND method = 'GET'
          AND created_at::date BETWEEN p.d7_start AND p.target_day
        GROUP BY zip_code
        HAVING COUNT(DISTINCT created_at::date) >= 2
      ),

      -- Clicks and calls per ZIP
      engagement AS (
        SELECT
          zip_code,
          COUNT(*) FILTER (WHERE action_type = 'website') AS clicks,
          COUNT(*) FILTER (WHERE action_type = 'call') AS calls
        FROM supplier_clicks, params p
        WHERE created_at::date BETWEEN p.d7_start AND p.target_day
          AND zip_code IS NOT NULL
        GROUP BY zip_code
      ),

      -- Supplier count per ZIP (expand postal_codes_served once)
      supplier_zips AS (
        SELECT
          jsonb_array_elements_text(postal_codes_served) AS zip_code,
          COUNT(*) AS supplier_count
        FROM suppliers
        WHERE active = true
          AND allow_price_display = true
          AND website IS NOT NULL AND website != ''
          AND jsonb_typeof(postal_codes_served) = 'array'
          AND jsonb_array_length(postal_codes_served) > 0
        GROUP BY jsonb_array_elements_text(postal_codes_served)
      ),

      -- Freshness: latest price per ZIP
      zip_freshness AS (
        SELECT
          jsonb_array_elements_text(s.postal_codes_served) AS zip_code,
          MAX(sp.scraped_at) AS latest_price_at
        FROM suppliers s
        JOIN supplier_prices sp ON s.id = sp.supplier_id AND sp.is_valid = true
        WHERE s.active = true
          AND s.allow_price_display = true
          AND jsonb_typeof(s.postal_codes_served) = 'array'
          AND jsonb_array_length(s.postal_codes_served) > 0
        GROUP BY jsonb_array_elements_text(s.postal_codes_served)
      ),

      scored AS (
        SELECT
          sd.zip_code,
          COALESCE(e.clicks, 0) AS clicks,
          COALESCE(e.calls, 0) AS calls,
          sd.active_days,
          ROUND(
            (COALESCE(e.clicks, 0) + COALESCE(e.calls, 0) * 3)::numeric
            / sd.active_days, 2
          ) AS score,
          COALESCE(sz.supplier_count, 0) AS supplier_count,
          zf.latest_price_at
        FROM search_days sd
        LEFT JOIN engagement e ON sd.zip_code = e.zip_code
        LEFT JOIN supplier_zips sz ON sd.zip_code = sz.zip_code
        LEFT JOIN zip_freshness zf ON sd.zip_code = zf.zip_code
        WHERE COALESCE(e.clicks, 0) + COALESCE(e.calls, 0) > 0
        ORDER BY score DESC
        LIMIT 25
      )

      SELECT
        zip_code,
        clicks,
        calls,
        score,
        active_days,
        supplier_count,
        CASE
          WHEN latest_price_at >= ($1::date - INTERVAL '2 days') THEN true
          ELSE false
        END AS is_fresh
      FROM scored
      ORDER BY score DESC
    `, { bind: [targetDay] });

    return rows.map(r => ({
      zip: r.zip_code,
      clicks: parseInt(r.clicks) || 0,
      calls: parseInt(r.calls) || 0,
      score: parseFloat(r.score) || 0,
      days: parseInt(r.active_days) || 0,
      suppliers: parseInt(r.supplier_count) || 0,
      fresh: r.is_fresh === true || r.is_fresh === 't'
    }));
  }

  /**
   * Community top ZIPs by delivery count (30d window).
   */
  async _computeCommunityTopZips(targetDay) {
    const [rows] = await this.sequelize.query(`
      SELECT
        full_zip_code AS zip,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE fuel_type = 'heating_oil') AS oil,
        COUNT(*) FILTER (WHERE fuel_type = 'propane') AS propane
      FROM community_deliveries
      WHERE validation_status = 'valid'
        AND full_zip_code IS NOT NULL
        AND created_at::date BETWEEN ($1::date - 29) AND $1::date
      GROUP BY full_zip_code
      ORDER BY total DESC
      LIMIT 15
    `, { bind: [targetDay] });

    return rows.map(r => ({
      zip: r.zip,
      total: parseInt(r.total) || 0,
      oil: parseInt(r.oil) || 0,
      propane: parseInt(r.propane) || 0
    }));
  }

  /**
   * Upsert computed metrics into daily_platform_metrics.
   */
  async _upsert(targetDay, core, demandDensity, communityTopZips) {
    await this.sequelize.query(`
      INSERT INTO daily_platform_metrics (
        day, computed_at,
        search_zip_days, search_zips,
        pipeline_suppliers,
        suppliers_clicked_7d, suppliers_clicked_30d,
        suppliers_called_7d, suppliers_called_30d,
        zip_days_with_click_7d, zip_days_with_call_7d, zips_with_call_7d,
        calls_7d, website_clicks_7d,
        deliveries_7d, deliveries_30d, deliveries_oil_30d,
        deliveries_propane_30d, deliveries_propane_prev30d,
        demand_density_top25, community_top_zips_30d
      ) VALUES (
        $1, NOW(),
        $2, $3,
        $4,
        $5, $6, $7, $8,
        $9, $10, $11,
        $12, $13,
        $14, $15, $16, $17, $18,
        $19::jsonb, $20::jsonb
      )
      ON CONFLICT (day) DO UPDATE SET
        computed_at = NOW(),
        search_zip_days = EXCLUDED.search_zip_days,
        search_zips = EXCLUDED.search_zips,
        pipeline_suppliers = EXCLUDED.pipeline_suppliers,
        suppliers_clicked_7d = EXCLUDED.suppliers_clicked_7d,
        suppliers_clicked_30d = EXCLUDED.suppliers_clicked_30d,
        suppliers_called_7d = EXCLUDED.suppliers_called_7d,
        suppliers_called_30d = EXCLUDED.suppliers_called_30d,
        zip_days_with_click_7d = EXCLUDED.zip_days_with_click_7d,
        zip_days_with_call_7d = EXCLUDED.zip_days_with_call_7d,
        zips_with_call_7d = EXCLUDED.zips_with_call_7d,
        calls_7d = EXCLUDED.calls_7d,
        website_clicks_7d = EXCLUDED.website_clicks_7d,
        deliveries_7d = EXCLUDED.deliveries_7d,
        deliveries_30d = EXCLUDED.deliveries_30d,
        deliveries_oil_30d = EXCLUDED.deliveries_oil_30d,
        deliveries_propane_30d = EXCLUDED.deliveries_propane_30d,
        deliveries_propane_prev30d = EXCLUDED.deliveries_propane_prev30d,
        demand_density_top25 = EXCLUDED.demand_density_top25,
        community_top_zips_30d = EXCLUDED.community_top_zips_30d
    `, {
      bind: [
        targetDay,
        core.search_zip_days, core.search_zips,
        core.pipeline_suppliers,
        core.suppliers_clicked_7d, core.suppliers_clicked_30d,
        core.suppliers_called_7d, core.suppliers_called_30d,
        core.zip_days_with_click_7d, core.zip_days_with_call_7d, core.zips_with_call_7d,
        core.calls_7d, core.website_clicks_7d,
        core.deliveries_7d, core.deliveries_30d, core.deliveries_oil_30d,
        core.deliveries_propane_30d, core.deliveries_propane_prev30d,
        JSON.stringify(demandDensity), JSON.stringify(communityTopZips)
      ]
    });
  }

  /**
   * Get yesterday's date in ET timezone as YYYY-MM-DD.
   */
  _yesterdayET() {
    const now = new Date();
    // Convert to ET
    const etStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const etDate = new Date(etStr + 'T00:00:00');
    etDate.setDate(etDate.getDate() - 1);
    return etDate.toISOString().split('T')[0];
  }
}

module.exports = PlatformMetricsService;
