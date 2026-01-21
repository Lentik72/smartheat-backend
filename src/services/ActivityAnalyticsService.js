/**
 * ActivityAnalyticsService
 *
 * Centralized service for tracking user activity:
 * - API request logging
 * - Supplier engagement tracking
 * - User-added supplier reporting
 * - DAU aggregation
 */

const crypto = require('crypto');

class ActivityAnalyticsService {
  constructor(sequelize) {
    this.sequelize = sequelize;
    this.requestBuffer = [];
    this.BUFFER_SIZE = 50;
    this.FLUSH_INTERVAL_MS = 30000; // 30 seconds

    // V2.7.0: Excluded device IDs (Leo's test devices)
    // Set via EXCLUDED_DEVICE_IDS env var (comma-separated)
    this.excludedDeviceIds = (process.env.EXCLUDED_DEVICE_IDS || '')
      .split(',')
      .map(id => id.trim().toUpperCase())
      .filter(id => id.length > 0);

    // Start periodic flush
    this.flushInterval = setInterval(() => this.flushRequestBuffer(), this.FLUSH_INTERVAL_MS);

    console.log('[ActivityAnalytics] Service initialized');
    if (this.excludedDeviceIds.length > 0) {
      console.log(`[ActivityAnalytics] Excluding ${this.excludedDeviceIds.length} device ID(s) from tracking`);
    }
  }

  /**
   * V2.7.0: Check if request is test traffic (should be excluded from analytics)
   * Checks: X-Test-Mode header, X-Simulator header, X-Device-ID in excluded list
   */
  isTestTraffic(req) {
    // Check X-Test-Mode header (for curl/API testing)
    if (req.get('X-Test-Mode') === 'true') {
      return true;
    }

    // Check X-Simulator header (iOS Simulator)
    if (req.get('X-Simulator') === 'true') {
      return true;
    }

    // Check X-Device-ID against excluded list
    const deviceId = req.get('X-Device-ID');

    // TEMPORARY: Log device IDs to capture Leo's iPhone ID
    // Remove this after setting EXCLUDED_DEVICE_IDS
    if (deviceId) {
      console.log(`[ActivityAnalytics] Device ID seen: ${deviceId}`);
    }

    if (deviceId && this.excludedDeviceIds.includes(deviceId.toUpperCase())) {
      return true;
    }

    return false;
  }

  /**
   * Hash IP address for privacy-safe unique user tracking
   */
  hashIP(ip) {
    if (!ip) return null;
    // Remove IPv6 prefix if present
    const cleanIP = ip.replace(/^::ffff:/, '');
    return crypto.createHash('sha256').update(cleanIP + process.env.JWT_SECRET).digest('hex').substring(0, 16);
  }

  /**
   * Hash user agent for device type analysis
   */
  hashUserAgent(ua) {
    if (!ua) return null;
    return crypto.createHash('sha256').update(ua).digest('hex').substring(0, 16);
  }

  /**
   * Extract state from ZIP code
   */
  getStateFromZip(zipCode) {
    if (!zipCode || zipCode.length < 2) return null;
    const prefix2 = zipCode.substring(0, 2);
    const prefix3 = zipCode.substring(0, 3);

    // Rhode Island special case
    if (['028', '029'].includes(prefix3)) return 'RI';
    // Delaware special case
    if (['197', '198', '199'].includes(prefix3)) return 'DE';

    const stateMap = {
      '01': 'MA', '02': 'MA',
      '03': 'NH', '04': 'ME', '05': 'VT', '06': 'CT',
      '07': 'NJ', '08': 'NJ',
      '10': 'NY', '11': 'NY', '12': 'NY', '13': 'NY', '14': 'NY',
      '15': 'PA', '16': 'PA', '17': 'PA', '18': 'PA', '19': 'PA',
      '20': 'DC', '21': 'MD', '22': 'VA', '23': 'VA'
    };

    return stateMap[prefix2] || null;
  }

  // ==================== API REQUEST LOGGING ====================

  /**
   * Log an API request (buffered for performance)
   * V2.7.0: Skip test traffic (simulator, excluded devices, X-Test-Mode header)
   */
  logRequest(req, res, responseTimeMs) {
    // V2.7.0: Skip test traffic
    if (this.isTestTraffic(req)) {
      return;
    }

    // Check both 'zip' and 'zipCode' query params (suppliers API uses 'zip')
    const zipCode = req.params?.zipCode || req.params?.zip ||
                    req.query?.zipCode || req.query?.zip ||
                    req.body?.zipCode || req.body?.zip || null;

    // V2.5.0: Capture fuel type from request (default: heating_oil)
    const fuelType = req.query?.fuelType || req.body?.fuelType || null;

    this.requestBuffer.push({
      endpoint: req.route?.path || req.path,
      method: req.method,
      status_code: res.statusCode,
      response_time_ms: responseTimeMs,
      zip_code: zipCode?.substring(0, 5) || null,
      state: this.getStateFromZip(zipCode),
      fuel_type: fuelType,
      ip_hash: this.hashIP(req.ip),
      user_agent_hash: this.hashUserAgent(req.get('User-Agent')),
      created_at: new Date()
    });

    // Flush if buffer is full
    if (this.requestBuffer.length >= this.BUFFER_SIZE) {
      this.flushRequestBuffer();
    }
  }

  /**
   * Flush request buffer to database
   */
  async flushRequestBuffer() {
    if (this.requestBuffer.length === 0) return;

    const requests = [...this.requestBuffer];
    this.requestBuffer = [];

    try {
      // Bulk insert (V2.5.0: now includes fuel_type)
      const values = requests.map(r => `(
        '${r.endpoint.replace(/'/g, "''")}',
        '${r.method}',
        ${r.status_code || 'NULL'},
        ${r.response_time_ms || 'NULL'},
        ${r.zip_code ? `'${r.zip_code}'` : 'NULL'},
        ${r.state ? `'${r.state}'` : 'NULL'},
        ${r.fuel_type ? `'${r.fuel_type}'` : 'NULL'},
        ${r.ip_hash ? `'${r.ip_hash}'` : 'NULL'},
        ${r.user_agent_hash ? `'${r.user_agent_hash}'` : 'NULL'},
        '${r.created_at.toISOString()}'
      )`).join(',');

      await this.sequelize.query(`
        INSERT INTO api_activity (endpoint, method, status_code, response_time_ms, zip_code, state, fuel_type, ip_hash, user_agent_hash, created_at)
        VALUES ${values}
      `);
    } catch (error) {
      console.error('[ActivityAnalytics] Failed to flush request buffer:', error.message);
    }
  }

  // ==================== SUPPLIER ENGAGEMENT ====================

  /**
   * Track supplier engagement (view, call, save, etc.)
   */
  async trackSupplierEngagement(supplierId, supplierName, engagementType, userContext = {}) {
    try {
      await this.sequelize.query(`
        INSERT INTO supplier_engagements (supplier_id, supplier_name, engagement_type, user_zip, user_state, ip_hash, source)
        VALUES (:supplierId, :supplierName, :engagementType, :userZip, :userState, :ipHash, :source)
      `, {
        replacements: {
          supplierId: supplierId || null,
          supplierName: supplierName.substring(0, 255),
          engagementType,
          userZip: userContext.zipCode?.substring(0, 5) || null,
          userState: userContext.state || this.getStateFromZip(userContext.zipCode),
          ipHash: this.hashIP(userContext.ip),
          source: userContext.source || 'directory'
        }
      });
    } catch (error) {
      console.error('[ActivityAnalytics] Failed to track supplier engagement:', error.message);
    }
  }

  /**
   * Get supplier engagement stats
   */
  async getSupplierEngagementStats(supplierId = null, days = 30) {
    const whereClause = supplierId ? 'AND supplier_id = :supplierId' : '';

    const [results] = await this.sequelize.query(`
      SELECT
        supplier_id,
        supplier_name,
        COUNT(*) FILTER (WHERE engagement_type = 'view') as views,
        COUNT(*) FILTER (WHERE engagement_type = 'call') as calls,
        COUNT(*) FILTER (WHERE engagement_type = 'text') as texts,
        COUNT(*) FILTER (WHERE engagement_type = 'email') as emails,
        COUNT(*) FILTER (WHERE engagement_type = 'save') as saves,
        COUNT(*) FILTER (WHERE engagement_type = 'request_quote') as quote_requests,
        COUNT(*) as total_engagements
      FROM supplier_engagements
      WHERE created_at >= NOW() - INTERVAL '${days} days'
      ${whereClause}
      GROUP BY supplier_id, supplier_name
      ORDER BY total_engagements DESC
      LIMIT 50
    `, {
      replacements: { supplierId }
    });

    return results;
  }

  // ==================== USER-ADDED SUPPLIERS ====================

  /**
   * Track a user-added supplier (for directory expansion insights)
   */
  async trackUserAddedSupplier(supplierInfo, userContext = {}) {
    try {
      const { companyName, phone, city, state, zipCode } = supplierInfo;

      // Upsert - increment count if already reported
      await this.sequelize.query(`
        INSERT INTO user_added_suppliers (company_name, phone, city, state, zip_code, user_zip, user_state, ip_hash)
        VALUES (:companyName, :phone, :city, :state, :zipCode, :userZip, :userState, :ipHash)
        ON CONFLICT (LOWER(company_name), state)
        DO UPDATE SET
          report_count = user_added_suppliers.report_count + 1,
          last_reported_at = NOW(),
          phone = COALESCE(EXCLUDED.phone, user_added_suppliers.phone),
          city = COALESCE(EXCLUDED.city, user_added_suppliers.city),
          zip_code = COALESCE(EXCLUDED.zip_code, user_added_suppliers.zip_code)
      `, {
        replacements: {
          companyName: companyName.substring(0, 255),
          phone: phone?.substring(0, 50) || null,
          city: city?.substring(0, 100) || null,
          state: state?.substring(0, 2) || null,
          zipCode: zipCode?.substring(0, 10) || null,
          userZip: userContext.zipCode?.substring(0, 5) || null,
          userState: userContext.state || this.getStateFromZip(userContext.zipCode),
          ipHash: this.hashIP(userContext.ip)
        }
      });

      console.log(`[ActivityAnalytics] User-added supplier tracked: ${companyName}`);
    } catch (error) {
      console.error('[ActivityAnalytics] Failed to track user-added supplier:', error.message);
    }
  }

  /**
   * Get user-added suppliers for admin review
   */
  async getUserAddedSuppliers(reviewed = false, limit = 50) {
    const [results] = await this.sequelize.query(`
      SELECT *
      FROM user_added_suppliers
      WHERE reviewed = :reviewed
      ORDER BY report_count DESC, last_reported_at DESC
      LIMIT :limit
    `, {
      replacements: { reviewed, limit }
    });

    return results;
  }

  // ==================== DAU TRACKING ====================

  /**
   * Get or create today's DAU record
   */
  async getTodayDAU() {
    const today = new Date().toISOString().split('T')[0];

    const [existing] = await this.sequelize.query(`
      SELECT * FROM daily_active_users WHERE date = :today
    `, { replacements: { today } });

    if (existing.length > 0) {
      return existing[0];
    }

    // Create new record
    await this.sequelize.query(`
      INSERT INTO daily_active_users (date) VALUES (:today)
      ON CONFLICT (date) DO NOTHING
    `, { replacements: { today } });

    const [newRecord] = await this.sequelize.query(`
      SELECT * FROM daily_active_users WHERE date = :today
    `, { replacements: { today } });

    return newRecord[0];
  }

  /**
   * Aggregate DAU metrics from api_activity (run hourly or on-demand)
   * V2.5.0: Now includes fuel type segmentation (oil vs propane)
   */
  async aggregateDAU(date = null) {
    const targetDate = date || new Date().toISOString().split('T')[0];

    try {
      const [stats] = await this.sequelize.query(`
        SELECT
          COUNT(DISTINCT ip_hash) as unique_users,
          COUNT(DISTINCT zip_code) as unique_zips,
          COUNT(*) as total_requests,
          ROUND(AVG(response_time_ms)) as avg_response_time_ms,
          COUNT(*) FILTER (WHERE status_code >= 400) as error_count,
          COUNT(*) FILTER (WHERE endpoint LIKE '%supplier%') as supplier_lookups,
          COUNT(*) FILTER (WHERE endpoint LIKE '%price%' OR endpoint LIKE '%market%') as price_checks,
          COUNT(*) FILTER (WHERE endpoint LIKE '%director%') as directory_views
        FROM api_activity
        WHERE DATE(created_at) = :targetDate
      `, { replacements: { targetDate } });

      // Get users by state
      const [byState] = await this.sequelize.query(`
        SELECT state, COUNT(DISTINCT ip_hash) as users
        FROM api_activity
        WHERE DATE(created_at) = :targetDate AND state IS NOT NULL
        GROUP BY state
        ORDER BY users DESC
      `, { replacements: { targetDate } });

      const usersByState = {};
      byState.forEach(row => {
        usersByState[row.state] = parseInt(row.users);
      });

      // V2.5.0: Get users and requests by fuel type
      const [byFuel] = await this.sequelize.query(`
        SELECT
          COALESCE(fuel_type, 'heating_oil') as fuel_type,
          COUNT(DISTINCT ip_hash) as users,
          COUNT(*) as requests
        FROM api_activity
        WHERE DATE(created_at) = :targetDate
        GROUP BY COALESCE(fuel_type, 'heating_oil')
      `, { replacements: { targetDate } });

      const usersByFuel = {};
      const requestsByFuel = {};
      byFuel.forEach(row => {
        usersByFuel[row.fuel_type] = parseInt(row.users);
        requestsByFuel[row.fuel_type] = parseInt(row.requests);
      });

      // Update DAU record (V2.5.0: now includes fuel breakdown)
      await this.sequelize.query(`
        INSERT INTO daily_active_users (date, unique_users, unique_zips, total_requests, avg_response_time_ms, error_count, supplier_lookups, price_checks, directory_views, users_by_state, users_by_fuel, requests_by_fuel, updated_at)
        VALUES (:date, :uniqueUsers, :uniqueZips, :totalRequests, :avgResponseTime, :errorCount, :supplierLookups, :priceChecks, :directoryViews, :usersByState::jsonb, :usersByFuel::jsonb, :requestsByFuel::jsonb, NOW())
        ON CONFLICT (date) DO UPDATE SET
          unique_users = EXCLUDED.unique_users,
          unique_zips = EXCLUDED.unique_zips,
          total_requests = EXCLUDED.total_requests,
          avg_response_time_ms = EXCLUDED.avg_response_time_ms,
          error_count = EXCLUDED.error_count,
          supplier_lookups = EXCLUDED.supplier_lookups,
          price_checks = EXCLUDED.price_checks,
          directory_views = EXCLUDED.directory_views,
          users_by_state = EXCLUDED.users_by_state,
          users_by_fuel = EXCLUDED.users_by_fuel,
          requests_by_fuel = EXCLUDED.requests_by_fuel,
          updated_at = NOW()
      `, {
        replacements: {
          date: targetDate,
          uniqueUsers: parseInt(stats[0]?.unique_users) || 0,
          uniqueZips: parseInt(stats[0]?.unique_zips) || 0,
          totalRequests: parseInt(stats[0]?.total_requests) || 0,
          avgResponseTime: parseInt(stats[0]?.avg_response_time_ms) || null,
          errorCount: parseInt(stats[0]?.error_count) || 0,
          supplierLookups: parseInt(stats[0]?.supplier_lookups) || 0,
          priceChecks: parseInt(stats[0]?.price_checks) || 0,
          directoryViews: parseInt(stats[0]?.directory_views) || 0,
          usersByState: JSON.stringify(usersByState),
          usersByFuel: JSON.stringify(usersByFuel),
          requestsByFuel: JSON.stringify(requestsByFuel)
        }
      });

      console.log(`[ActivityAnalytics] DAU aggregated for ${targetDate}: ${stats[0]?.unique_users || 0} users (oil: ${usersByFuel.heating_oil || 0}, propane: ${usersByFuel.propane || 0})`);
      return stats[0];
    } catch (error) {
      console.error('[ActivityAnalytics] Failed to aggregate DAU:', error.message);
      return null;
    }
  }

  /**
   * Get DAU history for dashboard
   */
  async getDAUHistory(days = 30) {
    const [results] = await this.sequelize.query(`
      SELECT *
      FROM daily_active_users
      WHERE date >= NOW() - INTERVAL '${days} days'
      ORDER BY date DESC
    `);

    return results;
  }

  /**
   * Get real-time activity stats (last 24 hours)
   */
  async getRealTimeStats() {
    const [stats] = await this.sequelize.query(`
      SELECT
        COUNT(DISTINCT ip_hash) as unique_users_24h,
        COUNT(DISTINCT zip_code) as unique_zips_24h,
        COUNT(*) as total_requests_24h,
        ROUND(AVG(response_time_ms)) as avg_response_time_ms,
        COUNT(*) FILTER (WHERE status_code >= 400) as errors_24h,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 hour') as requests_last_hour
      FROM api_activity
      WHERE created_at >= NOW() - INTERVAL '24 hours'
    `);

    // Get top endpoints
    const [topEndpoints] = await this.sequelize.query(`
      SELECT endpoint, COUNT(*) as hits
      FROM api_activity
      WHERE created_at >= NOW() - INTERVAL '24 hours'
      GROUP BY endpoint
      ORDER BY hits DESC
      LIMIT 10
    `);

    // Get activity by hour
    const [hourly] = await this.sequelize.query(`
      SELECT
        DATE_TRUNC('hour', created_at) as hour,
        COUNT(DISTINCT ip_hash) as users,
        COUNT(*) as requests
      FROM api_activity
      WHERE created_at >= NOW() - INTERVAL '24 hours'
      GROUP BY DATE_TRUNC('hour', created_at)
      ORDER BY hour DESC
    `);

    return {
      summary: stats[0],
      topEndpoints,
      hourlyActivity: hourly
    };
  }

  /**
   * Generate daily activity report for email
   * V2.5.0: Now includes fuel type segmentation (oil vs propane)
   */
  async generateDailyReport() {
    try {
      // Flush any pending requests first
      await this.flushRequestBuffer();

      // Get yesterday's date for the report
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const reportDate = yesterday.toISOString().split('T')[0];

      // Aggregate yesterday's data
      await this.aggregateDAU(reportDate);

      // Get the aggregated data
      const [dauData] = await this.sequelize.query(`
        SELECT * FROM daily_active_users WHERE date = :date
      `, { replacements: { date: reportDate } });

      // Get real-time stats (last 24h)
      const realTime = await this.getRealTimeStats();

      // Get geographic breakdown for last 24h
      const [byState] = await this.sequelize.query(`
        SELECT state, COUNT(DISTINCT ip_hash) as users, COUNT(*) as requests
        FROM api_activity
        WHERE created_at >= NOW() - INTERVAL '24 hours'
          AND state IS NOT NULL
        GROUP BY state
        ORDER BY users DESC
        LIMIT 10
      `);

      // Get top ZIP codes
      const [topZips] = await this.sequelize.query(`
        SELECT zip_code, state, COUNT(DISTINCT ip_hash) as users, COUNT(*) as requests
        FROM api_activity
        WHERE created_at >= NOW() - INTERVAL '24 hours'
          AND zip_code IS NOT NULL
        GROUP BY zip_code, state
        ORDER BY users DESC
        LIMIT 10
      `);

      // Get supplier engagement stats
      const [engagements] = await this.sequelize.query(`
        SELECT
          engagement_type,
          COUNT(*) as count
        FROM supplier_engagements
        WHERE created_at >= NOW() - INTERVAL '24 hours'
        GROUP BY engagement_type
        ORDER BY count DESC
      `);

      // Get 7-day trend
      const dauHistory = await this.getDAUHistory(7);

      // Calculate week-over-week trend
      const today = dauData[0] || {};
      const weekAgo = dauHistory[6] || {};
      const trend = {
        usersChange: (today.unique_users || 0) - (weekAgo.unique_users || 0),
        requestsChange: (today.total_requests || 0) - (weekAgo.total_requests || 0)
      };

      // V2.5.0: Get fuel type breakdown for last 24h
      const [byFuelType] = await this.sequelize.query(`
        SELECT
          COALESCE(fuel_type, 'heating_oil') as fuel_type,
          COUNT(DISTINCT ip_hash) as users,
          COUNT(DISTINCT zip_code) as zips,
          COUNT(*) as requests
        FROM api_activity
        WHERE created_at >= NOW() - INTERVAL '24 hours'
        GROUP BY COALESCE(fuel_type, 'heating_oil')
        ORDER BY users DESC
      `);

      // V2.5.0: Get geographic breakdown BY fuel type
      const [byStateFuel] = await this.sequelize.query(`
        SELECT
          state,
          COALESCE(fuel_type, 'heating_oil') as fuel_type,
          COUNT(DISTINCT ip_hash) as users,
          COUNT(*) as requests
        FROM api_activity
        WHERE created_at >= NOW() - INTERVAL '24 hours'
          AND state IS NOT NULL
        GROUP BY state, COALESCE(fuel_type, 'heating_oil')
        ORDER BY users DESC
        LIMIT 20
      `);

      // Organize by fuel type for easy email rendering
      const oilStats = byFuelType.find(f => f.fuel_type === 'heating_oil') || { users: 0, zips: 0, requests: 0 };
      const propaneStats = byFuelType.find(f => f.fuel_type === 'propane') || { users: 0, zips: 0, requests: 0 };

      const oilByState = byStateFuel.filter(s => s.fuel_type === 'heating_oil').map(s => ({
        state: s.state,
        users: parseInt(s.users),
        requests: parseInt(s.requests)
      }));

      const propaneByState = byStateFuel.filter(s => s.fuel_type === 'propane').map(s => ({
        state: s.state,
        users: parseInt(s.users),
        requests: parseInt(s.requests)
      }));

      return {
        date: new Date(),
        reportDate,
        summary: {
          uniqueUsers: parseInt(realTime.summary?.unique_users_24h) || 0,
          uniqueZips: parseInt(realTime.summary?.unique_zips_24h) || 0,
          totalRequests: parseInt(realTime.summary?.total_requests_24h) || 0,
          avgResponseTimeMs: parseInt(realTime.summary?.avg_response_time_ms) || 0,
          errors: parseInt(realTime.summary?.errors_24h) || 0
        },
        // V2.5.0: Fuel type breakdown
        byFuelType: {
          heating_oil: {
            users: parseInt(oilStats.users) || 0,
            zips: parseInt(oilStats.zips) || 0,
            requests: parseInt(oilStats.requests) || 0,
            byState: oilByState
          },
          propane: {
            users: parseInt(propaneStats.users) || 0,
            zips: parseInt(propaneStats.zips) || 0,
            requests: parseInt(propaneStats.requests) || 0,
            byState: propaneByState
          }
        },
        trend,
        byState: byState.map(s => ({
          state: s.state,
          users: parseInt(s.users),
          requests: parseInt(s.requests)
        })),
        topZips: topZips.map(z => ({
          zipCode: z.zip_code,
          state: z.state,
          users: parseInt(z.users),
          requests: parseInt(z.requests)
        })),
        topEndpoints: realTime.topEndpoints.slice(0, 10),
        engagements: engagements.map(e => ({
          type: e.engagement_type,
          count: parseInt(e.count)
        })),
        dauHistory: dauHistory.slice(0, 7).map(d => ({
          date: d.date,
          users: d.unique_users,
          requests: d.total_requests,
          usersByFuel: d.users_by_fuel || {}
        }))
      };
    } catch (error) {
      console.error('[ActivityAnalytics] Failed to generate daily report:', error.message);
      return null;
    }
  }

  /**
   * Cleanup - stop flush interval
   */
  shutdown() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    this.flushRequestBuffer();
    console.log('[ActivityAnalytics] Service shutdown complete');
  }
}

module.exports = ActivityAnalyticsService;
