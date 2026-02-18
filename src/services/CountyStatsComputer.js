/**
 * CountyStatsComputer Service
 *
 * Computes county-level price statistics from raw supplier_prices.
 * Uses zip_to_county mapping for geographic accuracy.
 *
 * Architecture:
 * 1. Aggregate weekly prices from supplier_prices via zip_to_county
 * 2. Upsert into county_price_stats (historical)
 * 3. Compute trends and quality scores
 * 4. Upsert into county_current_stats (snapshot)
 *
 * Key difference from ZipStatsComputer:
 * - Groups by county_name + state_code (not zip_prefix)
 * - Uses zip_to_county for accurate geographic mapping
 * - Aggregates across multiple ZIP prefixes
 */

class CountyStatsComputer {
  constructor(sequelize, logger = console) {
    this.sequelize = sequelize;
    this.logger = logger;

    // Thresholds for showing community data
    this.USER_COUNT_THRESHOLD = 10;
    this.DELIVERY_COUNT_THRESHOLD = 20;

    // Quality score weights - calibrated for county-level data density
    // Design principles:
    //   - Leave ceiling room (don't saturate early)
    //   - Flagship counties → 0.75-0.90
    //   - Mid counties → 0.50-0.70
    //   - Weak counties → <0.40
    //   - Weeks is hardest to game, weighted heavily
    //   - supplierCount target lowered from 20 to 12 to fairly score rural counties
    this.QUALITY_WEIGHTS = {
      supplierCount: { target: 12, weight: 0.35 },   // 12 suppliers = 1.0 (rural-fair)
      dataPoints: { target: 300, weight: 0.25 },     // 300 data points = 1.0 (multi-week density)
      weeksAvailable: { target: 10, weight: 0.30 },  // 10 weeks = 1.0 (maturity signal)
      recency: { weight: 0.10 }
    };
  }

  /**
   * Main entry point - compute all county stats
   */
  async compute() {
    const startTime = Date.now();
    this.logger.info('[CountyStatsComputer] Starting computation...');

    try {
      // Step 1: Get all unique counties from zip_to_county that have supplier coverage
      const counties = await this.getActiveCounties();
      this.logger.info(`[CountyStatsComputer] Found ${counties.length} counties with supplier coverage`);

      // Step 2: Compute weekly stats for recent weeks
      await this.computeWeeklyStats();

      // Step 3: Update current stats for each county
      let updated = 0;
      for (const county of counties) {
        try {
          await this.updateCurrentStats(county.county_name, county.state_code, 'heating_oil');
          updated++;
        } catch (err) {
          this.logger.warn(`[CountyStatsComputer] Failed to update ${county.county_name}, ${county.state_code}: ${err.message}`);
        }
      }

      const duration = Date.now() - startTime;
      this.logger.info(`[CountyStatsComputer] ✅ Completed: ${updated}/${counties.length} counties updated in ${duration}ms`);

      return { success: true, updated, total: counties.length, durationMs: duration };
    } catch (error) {
      this.logger.error('[CountyStatsComputer] ❌ Failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get all unique counties that have supplier coverage
   */
  async getActiveCounties() {
    const [results] = await this.sequelize.query(`
      SELECT DISTINCT ztc.county_name, ztc.state_code
      FROM zip_to_county ztc
      JOIN suppliers s ON true
      JOIN jsonb_array_elements_text(s.postal_codes_served) AS zip ON zip = ztc.zip_code
      WHERE s.active = true
      ORDER BY ztc.state_code, ztc.county_name
    `);
    return results;
  }

  /**
   * Compute weekly aggregates for all counties
   * Aggregates from raw supplier_prices via zip_to_county
   *
   * CRITICAL: Uses CTE to prevent row explosion bug.
   * Without CTE, joining ZIP expansion before aggregation causes each price
   * to be counted N times (once per ZIP the supplier serves in the county).
   * The CTE first maps suppliers to counties, then joins prices ONCE per supplier.
   */
  async computeWeeklyStats() {
    this.logger.info('[CountyStatsComputer] Computing weekly stats for last 12 weeks...');

    await this.sequelize.query(`
      WITH supplier_counties AS (
        -- Map each supplier to all counties they serve (via their ZIP coverage)
        -- This is computed ONCE, not per-price
        SELECT DISTINCT
          s.id as supplier_id,
          ztc.county_name,
          ztc.state_code
        FROM suppliers s
        JOIN jsonb_array_elements_text(s.postal_codes_served) AS zip ON true
        JOIN zip_to_county ztc ON ztc.zip_code = zip
        WHERE s.active = true
      ),
      county_zip_counts AS (
        -- Pre-compute ZIP counts per county for the zip_count field
        SELECT
          ztc.county_name,
          ztc.state_code,
          COUNT(DISTINCT ztc.zip_code) as zip_count
        FROM suppliers s
        JOIN jsonb_array_elements_text(s.postal_codes_served) AS zip ON true
        JOIN zip_to_county ztc ON ztc.zip_code = zip
        WHERE s.active = true
        GROUP BY ztc.county_name, ztc.state_code
      )
      INSERT INTO county_price_stats (
        id, county_name, state_code, fuel_type, week_start,
        median_price, min_price, max_price, avg_price,
        supplier_count, data_points, zip_count, computed_at
      )
      SELECT
        gen_random_uuid(),
        sc.county_name,
        sc.state_code,
        'heating_oil' as fuel_type,
        DATE_TRUNC('week', sp.created_at)::date as week_start,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY sp.price_per_gallon::numeric)::numeric(5,3) as median_price,
        MIN(sp.price_per_gallon::numeric)::numeric(5,3) as min_price,
        MAX(sp.price_per_gallon::numeric)::numeric(5,3) as max_price,
        AVG(sp.price_per_gallon::numeric)::numeric(5,3) as avg_price,
        COUNT(DISTINCT sc.supplier_id)::integer as supplier_count,
        COUNT(*)::integer as data_points,
        COALESCE(czc.zip_count, 0)::integer as zip_count,
        NOW()
      FROM supplier_prices sp
      JOIN supplier_counties sc ON sc.supplier_id = sp.supplier_id
      LEFT JOIN county_zip_counts czc ON czc.county_name = sc.county_name AND czc.state_code = sc.state_code
      WHERE sp.is_valid = true
        AND sp.created_at >= DATE_TRUNC('week', NOW()) - INTERVAL '12 weeks'
      GROUP BY sc.county_name, sc.state_code, czc.zip_count, DATE_TRUNC('week', sp.created_at)::date
      ON CONFLICT (county_name, state_code, week_start, fuel_type)
      DO UPDATE SET
        median_price = EXCLUDED.median_price,
        min_price = EXCLUDED.min_price,
        max_price = EXCLUDED.max_price,
        avg_price = EXCLUDED.avg_price,
        supplier_count = EXCLUDED.supplier_count,
        data_points = EXCLUDED.data_points,
        zip_count = EXCLUDED.zip_count,
        computed_at = NOW()
    `);
  }

  /**
   * Update current stats snapshot for a county
   */
  async updateCurrentStats(countyName, stateCode, fuelType = 'heating_oil') {
    // Get historical data for this county
    const [history] = await this.sequelize.query(`
      SELECT week_start, median_price, min_price, max_price, avg_price,
             supplier_count, data_points, zip_count
      FROM county_price_stats
      WHERE county_name = :countyName
        AND state_code = :stateCode
        AND fuel_type = :fuelType
      ORDER BY week_start DESC
      LIMIT 12
    `, { replacements: { countyName, stateCode, fuelType } });

    if (history.length === 0) {
      return; // No data for this county
    }

    // Get current week stats (most recent)
    const latest = history[0];
    const oldest = history[history.length - 1];

    // Calculate trend
    const weeksAvailable = history.length;
    let percentChange6w = null;

    if (history.length >= 2) {
      const sixWeeksAgo = history[Math.min(5, history.length - 1)];
      if (sixWeeksAgo.median_price && latest.median_price) {
        percentChange6w = ((latest.median_price - sixWeeksAgo.median_price) / sixWeeksAgo.median_price * 100).toFixed(2);
      }
    }

    // Get ZIP prefixes in this county
    const zipPrefixes = await this.getZipPrefixesForCounty(countyName, stateCode);

    // Get community metrics (aggregated from ZIP stats)
    const communityMetrics = await this.getCommunityMetrics(countyName, stateCode);

    // Calculate data quality score
    const dataQualityScore = this.calculateQualityScore({
      supplierCount: latest.supplier_count,
      dataPoints: latest.data_points,
      weeksAvailable,
      lastScrapeAt: new Date()
    });

    // Upsert current stats
    await this.sequelize.query(`
      INSERT INTO county_current_stats (
        county_name, state_code, fuel_type,
        median_price, min_price, max_price, avg_price, supplier_count, zip_count,
        weeks_available, percent_change_6w, first_week_price, latest_week_price,
        zip_prefixes,
        user_count, delivery_count, show_user_count, show_delivery_count,
        data_quality_score, last_scrape_at, updated_at
      ) VALUES (
        :countyName, :stateCode, :fuelType,
        :medianPrice, :minPrice, :maxPrice, :avgPrice, :supplierCount, :zipCount,
        :weeksAvailable, :percentChange6w, :firstWeekPrice, :latestWeekPrice,
        :zipPrefixes::jsonb,
        :userCount, :deliveryCount, :showUserCount, :showDeliveryCount,
        :dataQualityScore, NOW(), NOW()
      )
      ON CONFLICT (county_name, state_code, fuel_type)
      DO UPDATE SET
        median_price = EXCLUDED.median_price,
        min_price = EXCLUDED.min_price,
        max_price = EXCLUDED.max_price,
        avg_price = EXCLUDED.avg_price,
        supplier_count = EXCLUDED.supplier_count,
        zip_count = EXCLUDED.zip_count,
        weeks_available = EXCLUDED.weeks_available,
        percent_change_6w = EXCLUDED.percent_change_6w,
        first_week_price = EXCLUDED.first_week_price,
        latest_week_price = EXCLUDED.latest_week_price,
        zip_prefixes = EXCLUDED.zip_prefixes,
        user_count = EXCLUDED.user_count,
        delivery_count = EXCLUDED.delivery_count,
        show_user_count = EXCLUDED.show_user_count,
        show_delivery_count = EXCLUDED.show_delivery_count,
        data_quality_score = EXCLUDED.data_quality_score,
        last_scrape_at = NOW(),
        updated_at = NOW()
    `, {
      replacements: {
        countyName,
        stateCode,
        fuelType,
        medianPrice: latest.median_price,
        minPrice: latest.min_price,
        maxPrice: latest.max_price,
        avgPrice: latest.avg_price,
        supplierCount: latest.supplier_count,
        zipCount: latest.zip_count,
        weeksAvailable,
        percentChange6w,
        firstWeekPrice: oldest.median_price,
        latestWeekPrice: latest.median_price,
        zipPrefixes: JSON.stringify(zipPrefixes),
        userCount: communityMetrics.userCount,
        deliveryCount: communityMetrics.deliveryCount,
        showUserCount: communityMetrics.userCount >= this.USER_COUNT_THRESHOLD,
        showDeliveryCount: communityMetrics.deliveryCount >= this.DELIVERY_COUNT_THRESHOLD,
        dataQualityScore
      }
    });
  }

  /**
   * Get unique ZIP prefixes for a county
   */
  async getZipPrefixesForCounty(countyName, stateCode) {
    const [results] = await this.sequelize.query(`
      SELECT DISTINCT SUBSTRING(zip_code, 1, 3) as prefix
      FROM zip_to_county
      WHERE county_name = :countyName AND state_code = :stateCode
      ORDER BY prefix
    `, { replacements: { countyName, stateCode } });

    return results.map(r => r.prefix);
  }

  /**
   * Get community metrics aggregated from ZIP-level data
   */
  async getCommunityMetrics(countyName, stateCode) {
    // Aggregate user count from user_locations via zip_to_county
    const [users] = await this.sequelize.query(`
      SELECT COUNT(DISTINCT ul.zip_code) as user_count
      FROM user_locations ul
      JOIN zip_to_county ztc ON ul.zip_code = ztc.zip_code
      WHERE ztc.county_name = :countyName AND ztc.state_code = :stateCode
    `, { replacements: { countyName, stateCode } });

    // Aggregate delivery count from community_deliveries via zip_to_county
    const [deliveries] = await this.sequelize.query(`
      SELECT COUNT(*) as delivery_count
      FROM community_deliveries cd
      JOIN zip_to_county ztc ON SUBSTRING(ztc.zip_code, 1, 3) = cd.zip_prefix
      WHERE ztc.county_name = :countyName
        AND ztc.state_code = :stateCode
        AND cd.validation_status = 'valid'
    `, { replacements: { countyName, stateCode } });

    return {
      userCount: parseInt(users[0]?.user_count || 0),
      deliveryCount: parseInt(deliveries[0]?.delivery_count || 0)
    };
  }

  /**
   * Calculate data quality score (0.0 - 1.0)
   * Higher targets for county-level (more suppliers expected)
   */
  calculateQualityScore({ supplierCount, dataPoints, weeksAvailable, lastScrapeAt }) {
    const w = this.QUALITY_WEIGHTS;

    // Component scores (capped at 1.0)
    const supplierScore = Math.min(1.0, supplierCount / w.supplierCount.target);
    const dataPointsScore = Math.min(1.0, dataPoints / w.dataPoints.target);
    const weeksScore = Math.min(1.0, weeksAvailable / w.weeksAvailable.target);

    // Recency factor
    const hoursSinceUpdate = lastScrapeAt
      ? (Date.now() - lastScrapeAt.getTime()) / (1000 * 60 * 60)
      : 999;

    let recencyScore = 1.0;
    if (hoursSinceUpdate > 72) recencyScore = 0.1;
    else if (hoursSinceUpdate > 48) recencyScore = 0.4;
    else if (hoursSinceUpdate > 24) recencyScore = 0.7;

    // Weighted sum
    const score = (
      supplierScore * w.supplierCount.weight +
      dataPointsScore * w.dataPoints.weight +
      weeksScore * w.weeksAvailable.weight +
      recencyScore * w.recency.weight
    );

    return Math.round(score * 100) / 100;
  }
}

module.exports = CountyStatsComputer;
