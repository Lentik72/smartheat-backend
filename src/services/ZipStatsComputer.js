/**
 * ZipStatsComputer Service
 *
 * Computes pre-aggregated ZIP-level price statistics.
 * Run after scraper completes to update zip_price_stats and zip_current_stats.
 *
 * Architecture:
 * 1. Aggregate weekly prices from supplier_prices
 * 2. Upsert into zip_price_stats (historical)
 * 3. Compute trends and quality scores
 * 4. Upsert into zip_current_stats (snapshot)
 */

class ZipStatsComputer {
  constructor(sequelize, logger = console) {
    this.sequelize = sequelize;
    this.logger = logger;

    // Thresholds for showing community data
    this.USER_COUNT_THRESHOLD = 10;
    this.DELIVERY_COUNT_THRESHOLD = 20;

    // Quality score weights
    this.QUALITY_WEIGHTS = {
      supplierCount: { target: 30, weight: 0.4 },
      dataPoints: { target: 500, weight: 0.3 },
      weeksAvailable: { target: 12, weight: 0.2 },
      recency: { weight: 0.1 }
    };
  }

  /**
   * Main entry point - compute all ZIP stats
   */
  async compute() {
    const startTime = Date.now();
    this.logger.info('[ZipStatsComputer] Starting computation...');

    try {
      // Step 1: Get all unique ZIP prefixes from suppliers
      const zipPrefixes = await this.getActiveZipPrefixes();
      this.logger.info(`[ZipStatsComputer] Found ${zipPrefixes.length} active ZIP prefixes`);

      // Step 2: Compute weekly stats for current week
      const currentWeekStart = this.getWeekStart(new Date());
      await this.computeWeeklyStats(currentWeekStart);

      // Step 3: Update current stats for each ZIP prefix
      let updated = 0;
      for (const zipPrefix of zipPrefixes) {
        try {
          await this.updateCurrentStats(zipPrefix, 'heating_oil');
          updated++;
        } catch (err) {
          this.logger.warn(`[ZipStatsComputer] Failed to update ${zipPrefix}: ${err.message}`);
        }
      }

      const duration = Date.now() - startTime;
      this.logger.info(`[ZipStatsComputer] ✅ Completed: ${updated}/${zipPrefixes.length} ZIPs updated in ${duration}ms`);

      return { success: true, updated, total: zipPrefixes.length, durationMs: duration };
    } catch (error) {
      this.logger.error('[ZipStatsComputer] ❌ Failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get all unique 3-digit ZIP prefixes from active suppliers
   */
  async getActiveZipPrefixes() {
    const [results] = await this.sequelize.query(`
      SELECT DISTINCT SUBSTRING(zip::text, 1, 3) as zip_prefix
      FROM suppliers s,
           jsonb_array_elements_text(s.postal_codes_served) as zip
      WHERE s.active = true
        AND jsonb_array_length(s.postal_codes_served) > 0
      ORDER BY zip_prefix
    `);
    return results.map(r => r.zip_prefix);
  }

  /**
   * Compute weekly aggregates for a specific week
   */
  async computeWeeklyStats(weekStart) {
    this.logger.info(`[ZipStatsComputer] Computing weekly stats for week of ${weekStart}`);

    await this.sequelize.query(`
      INSERT INTO zip_price_stats (
        id, zip_prefix, fuel_type, week_start,
        median_price, min_price, max_price,
        supplier_count, data_points, computed_at
      )
      SELECT
        gen_random_uuid(),
        SUBSTRING(zip::text, 1, 3) as zip_prefix,
        'heating_oil' as fuel_type,
        DATE_TRUNC('week', sp.created_at)::date as week_start,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY sp.price_per_gallon::numeric)::numeric(5,3) as median_price,
        MIN(sp.price_per_gallon::numeric)::numeric(5,3) as min_price,
        MAX(sp.price_per_gallon::numeric)::numeric(5,3) as max_price,
        COUNT(DISTINCT s.id)::integer as supplier_count,
        COUNT(*)::integer as data_points,
        NOW()
      FROM supplier_prices sp
      JOIN suppliers s ON sp.supplier_id = s.id,
           jsonb_array_elements_text(s.postal_codes_served) as zip
      WHERE sp.is_valid = true
        AND sp.created_at >= DATE_TRUNC('week', NOW()) - INTERVAL '12 weeks'
        AND s.active = true
      GROUP BY SUBSTRING(zip::text, 1, 3), DATE_TRUNC('week', sp.created_at)::date
      ON CONFLICT (zip_prefix, week_start, fuel_type)
      DO UPDATE SET
        median_price = EXCLUDED.median_price,
        min_price = EXCLUDED.min_price,
        max_price = EXCLUDED.max_price,
        supplier_count = EXCLUDED.supplier_count,
        data_points = EXCLUDED.data_points,
        computed_at = NOW()
    `);
  }

  /**
   * Update current stats snapshot for a ZIP prefix
   */
  async updateCurrentStats(zipPrefix, fuelType = 'heating_oil') {
    // Get historical data for this ZIP
    const [history] = await this.sequelize.query(`
      SELECT week_start, median_price, supplier_count, data_points
      FROM zip_price_stats
      WHERE zip_prefix = :zipPrefix AND fuel_type = :fuelType
      ORDER BY week_start DESC
      LIMIT 12
    `, { replacements: { zipPrefix, fuelType } });

    if (history.length === 0) {
      return; // No data for this ZIP
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

    // Get region info
    const regionInfo = await this.getRegionInfo(zipPrefix);

    // Get community metrics
    const communityMetrics = await this.getCommunityMetrics(zipPrefix);

    // Calculate data quality score
    const dataQualityScore = this.calculateQualityScore({
      supplierCount: latest.supplier_count,
      dataPoints: latest.data_points,
      weeksAvailable,
      lastScrapeAt: new Date() // Assume fresh if running now
    });

    // Upsert current stats
    await this.sequelize.query(`
      INSERT INTO zip_current_stats (
        zip_prefix, fuel_type, region_name, cities,
        median_price, min_price, max_price, supplier_count,
        weeks_available, percent_change_6w, first_week_price, latest_week_price,
        user_count, delivery_count, show_user_count, show_delivery_count,
        data_quality_score, last_scrape_at, updated_at
      ) VALUES (
        :zipPrefix, :fuelType, :regionName, :cities::jsonb,
        :medianPrice, :minPrice, :maxPrice, :supplierCount,
        :weeksAvailable, :percentChange6w, :firstWeekPrice, :latestWeekPrice,
        :userCount, :deliveryCount, :showUserCount, :showDeliveryCount,
        :dataQualityScore, NOW(), NOW()
      )
      ON CONFLICT (zip_prefix, fuel_type)
      DO UPDATE SET
        region_name = EXCLUDED.region_name,
        cities = EXCLUDED.cities,
        median_price = EXCLUDED.median_price,
        min_price = EXCLUDED.min_price,
        max_price = EXCLUDED.max_price,
        supplier_count = EXCLUDED.supplier_count,
        weeks_available = EXCLUDED.weeks_available,
        percent_change_6w = EXCLUDED.percent_change_6w,
        first_week_price = EXCLUDED.first_week_price,
        latest_week_price = EXCLUDED.latest_week_price,
        user_count = EXCLUDED.user_count,
        delivery_count = EXCLUDED.delivery_count,
        show_user_count = EXCLUDED.show_user_count,
        show_delivery_count = EXCLUDED.show_delivery_count,
        data_quality_score = EXCLUDED.data_quality_score,
        last_scrape_at = NOW(),
        updated_at = NOW()
    `, {
      replacements: {
        zipPrefix,
        fuelType,
        regionName: regionInfo.regionName,
        cities: JSON.stringify(regionInfo.cities),
        medianPrice: latest.median_price,
        minPrice: latest.min_price || latest.median_price,
        maxPrice: latest.max_price || latest.median_price,
        supplierCount: latest.supplier_count,
        weeksAvailable,
        percentChange6w,
        firstWeekPrice: oldest.median_price,
        latestWeekPrice: latest.median_price,
        userCount: communityMetrics.userCount,
        deliveryCount: communityMetrics.deliveryCount,
        showUserCount: communityMetrics.userCount >= this.USER_COUNT_THRESHOLD,
        showDeliveryCount: communityMetrics.deliveryCount >= this.DELIVERY_COUNT_THRESHOLD,
        dataQualityScore
      }
    });
  }

  /**
   * Get region name and cities for a ZIP prefix
   */
  async getRegionInfo(zipPrefix) {
    const [results] = await this.sequelize.query(`
      SELECT
        s.state,
        array_agg(DISTINCT s.city) FILTER (WHERE s.city IS NOT NULL) as cities,
        array_agg(DISTINCT sc.name) FILTER (WHERE sc.name IS NOT NULL) as counties
      FROM suppliers s
      LEFT JOIN (
        SELECT DISTINCT ON (s2.id) s2.id, unnest(s2.service_counties::text[]::text[]) as name
        FROM suppliers s2
        WHERE s2.service_counties IS NOT NULL
      ) sc ON sc.id = s.id,
      jsonb_array_elements_text(s.postal_codes_served) as zip
      WHERE SUBSTRING(zip::text, 1, 3) = :zipPrefix
        AND s.active = true
      GROUP BY s.state
      ORDER BY COUNT(*) DESC
      LIMIT 1
    `, { replacements: { zipPrefix } });

    if (results.length === 0) {
      return { regionName: null, cities: [] };
    }

    const { state, cities, counties } = results[0];
    const countyName = counties && counties.length > 0 ? counties[0] : null;
    const regionName = countyName ? `${countyName} County, ${state}` : state;

    return {
      regionName,
      cities: (cities || []).slice(0, 10) // Limit to top 10 cities
    };
  }

  /**
   * Get community metrics (user count, delivery count)
   */
  async getCommunityMetrics(zipPrefix) {
    const [users] = await this.sequelize.query(`
      SELECT COUNT(DISTINCT zip_code) as user_count
      FROM user_locations
      WHERE SUBSTRING(zip_code, 1, 3) = :zipPrefix
    `, { replacements: { zipPrefix } });

    const [deliveries] = await this.sequelize.query(`
      SELECT COUNT(*) as delivery_count
      FROM community_deliveries
      WHERE zip_prefix = :zipPrefix
        AND validation_status = 'valid'
    `, { replacements: { zipPrefix } });

    return {
      userCount: parseInt(users[0]?.user_count || 0),
      deliveryCount: parseInt(deliveries[0]?.delivery_count || 0)
    };
  }

  /**
   * Calculate data quality score (0.0 - 1.0)
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

  /**
   * Get Monday of the week for a given date
   */
  getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    return d.toISOString().slice(0, 10);
  }
}

module.exports = ZipStatsComputer;
