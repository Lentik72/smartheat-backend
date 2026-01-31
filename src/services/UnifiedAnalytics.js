/**
 * UnifiedAnalytics Service
 *
 * Unified data layer that combines:
 * - Google Analytics 4 (website traffic, sessions, pages)
 * - Firebase Analytics (iOS app events, retention, installs)
 * - PostgreSQL (clicks, searches, prices, waitlist)
 *
 * Gracefully degrades if external APIs are not configured.
 */

const path = require('path');
const fs = require('fs');

class UnifiedAnalytics {
  constructor(sequelize, logger) {
    this.sequelize = sequelize;
    this.logger = logger;

    // GA4 client (lazy initialized)
    this.ga4Client = null;
    this.ga4PropertyId = process.env.GA4_PROPERTY_ID || null;

    // Firebase client (lazy initialized)
    this.firebaseApp = null;

    // Track initialization status
    this.initialized = {
      ga4: false,
      firebase: false
    };
  }

  /**
   * Initialize GA4 client if credentials are available
   */
  async initGA4() {
    if (this.initialized.ga4) return this.ga4Client !== null;

    try {
      if (!this.ga4PropertyId) {
        this.logger.info('[UnifiedAnalytics] GA4_PROPERTY_ID not set, skipping GA4 init');
        this.initialized.ga4 = true;
        return false;
      }

      const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
      if (!credentialsJson) {
        this.logger.info('[UnifiedAnalytics] GOOGLE_APPLICATION_CREDENTIALS_JSON not set, skipping GA4 init');
        this.initialized.ga4 = true;
        return false;
      }

      // Decode credentials (base64 or raw JSON)
      let credentials;
      try {
        credentials = JSON.parse(Buffer.from(credentialsJson, 'base64').toString('utf8'));
      } catch {
        credentials = JSON.parse(credentialsJson);
      }

      const { google } = require('googleapis');

      // Create JWT client
      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/analytics.readonly']
      });

      // Create GA4 Data API client
      this.ga4Client = google.analyticsdata({
        version: 'v1beta',
        auth
      });

      this.initialized.ga4 = true;
      this.logger.info('[UnifiedAnalytics] GA4 client initialized');
      return true;
    } catch (error) {
      this.logger.error('[UnifiedAnalytics] GA4 init error:', error.message);
      this.initialized.ga4 = true;
      return false;
    }
  }

  /**
   * Initialize Firebase Admin SDK if credentials are available
   */
  async initFirebase() {
    if (this.initialized.firebase) return this.firebaseApp !== null;

    try {
      const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON ||
        process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

      if (!credentialsJson) {
        this.logger.info('[UnifiedAnalytics] Firebase credentials not set, skipping Firebase init');
        this.initialized.firebase = true;
        return false;
      }

      // Decode credentials
      let credentials;
      try {
        credentials = JSON.parse(Buffer.from(credentialsJson, 'base64').toString('utf8'));
      } catch {
        credentials = JSON.parse(credentialsJson);
      }

      const admin = require('firebase-admin');

      // Initialize only if not already initialized
      if (admin.apps.length === 0) {
        this.firebaseApp = admin.initializeApp({
          credential: admin.credential.cert(credentials),
          projectId: process.env.FIREBASE_PROJECT_ID || credentials.project_id
        });
      } else {
        this.firebaseApp = admin.app();
      }

      this.initialized.firebase = true;
      this.logger.info('[UnifiedAnalytics] Firebase client initialized');
      return true;
    } catch (error) {
      this.logger.error('[UnifiedAnalytics] Firebase init error:', error.message);
      this.initialized.firebase = true;
      return false;
    }
  }

  /**
   * Get website metrics from GA4
   * @param {number} days - Number of days to look back
   */
  async getWebsiteMetrics(days = 7) {
    await this.initGA4();

    if (!this.ga4Client) {
      return {
        available: false,
        reason: 'GA4 not configured',
        data: null
      };
    }

    try {
      const startDate = `${days}daysAgo`;
      const endDate = 'today';

      // Run multiple reports in parallel
      const [sessionsReport, trafficReport, pagesReport, platformReport] = await Promise.all([
        // Sessions and users
        this.ga4Client.properties.runReport({
          property: `properties/${this.ga4PropertyId}`,
          requestBody: {
            dateRanges: [{ startDate, endDate }],
            metrics: [
              { name: 'sessions' },
              { name: 'activeUsers' },
              { name: 'newUsers' },
              { name: 'averageSessionDuration' },
              { name: 'bounceRate' }
            ]
          }
        }),

        // Traffic sources
        this.ga4Client.properties.runReport({
          property: `properties/${this.ga4PropertyId}`,
          requestBody: {
            dateRanges: [{ startDate, endDate }],
            dimensions: [{ name: 'sessionDefaultChannelGroup' }],
            metrics: [{ name: 'sessions' }, { name: 'activeUsers' }],
            limit: 10
          }
        }),

        // Top pages
        this.ga4Client.properties.runReport({
          property: `properties/${this.ga4PropertyId}`,
          requestBody: {
            dateRanges: [{ startDate, endDate }],
            dimensions: [{ name: 'pagePath' }],
            metrics: [{ name: 'screenPageViews' }],
            orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
            limit: 20
          }
        }),

        // Device platform (iOS vs Android vs Desktop)
        this.ga4Client.properties.runReport({
          property: `properties/${this.ga4PropertyId}`,
          requestBody: {
            dateRanges: [{ startDate, endDate }],
            dimensions: [{ name: 'operatingSystem' }],
            metrics: [{ name: 'activeUsers' }, { name: 'sessions' }],
            limit: 10
          }
        })
      ]);

      // Parse sessions report
      const sessionsRow = sessionsReport.data.rows?.[0]?.metricValues || [];
      const sessions = parseInt(sessionsRow[0]?.value) || 0;
      const activeUsers = parseInt(sessionsRow[1]?.value) || 0;
      const newUsers = parseInt(sessionsRow[2]?.value) || 0;
      const avgSessionDuration = parseFloat(sessionsRow[3]?.value) || 0;
      const bounceRate = parseFloat(sessionsRow[4]?.value) || 0;

      // Parse traffic sources
      const trafficSources = (trafficReport.data.rows || []).map(row => ({
        channel: row.dimensionValues[0].value,
        sessions: parseInt(row.metricValues[0].value),
        users: parseInt(row.metricValues[1].value)
      }));

      // Parse top pages
      const topPages = (pagesReport.data.rows || []).map(row => ({
        path: row.dimensionValues[0].value,
        views: parseInt(row.metricValues[0].value)
      }));

      // Parse platform breakdown (iOS vs Android vs Desktop)
      const platforms = (platformReport.data.rows || []).map(row => ({
        os: row.dimensionValues[0].value,
        users: parseInt(row.metricValues[0].value),
        sessions: parseInt(row.metricValues[1].value)
      }));

      // Calculate platform percentages
      const totalPlatformUsers = platforms.reduce((sum, p) => sum + p.users, 0);
      const iosUsers = platforms.find(p => p.os === 'iOS')?.users || 0;
      const androidUsers = platforms.find(p => p.os === 'Android')?.users || 0;
      const desktopUsers = platforms.filter(p =>
        ['Windows', 'Macintosh', 'Linux', 'Chrome OS'].includes(p.os)
      ).reduce((sum, p) => sum + p.users, 0);

      const platformBreakdown = {
        ios: { users: iosUsers, percent: totalPlatformUsers > 0 ? (iosUsers / totalPlatformUsers * 100).toFixed(1) : 0 },
        android: { users: androidUsers, percent: totalPlatformUsers > 0 ? (androidUsers / totalPlatformUsers * 100).toFixed(1) : 0 },
        desktop: { users: desktopUsers, percent: totalPlatformUsers > 0 ? (desktopUsers / totalPlatformUsers * 100).toFixed(1) : 0 },
        all: platforms
      };

      // Calculate organic percentage
      const organicSessions = trafficSources.find(t => t.channel === 'Organic Search')?.sessions || 0;
      const organicPercent = sessions > 0 ? (organicSessions / sessions * 100).toFixed(1) : 0;

      return {
        available: true,
        data: {
          sessions,
          activeUsers,
          newUsers,
          avgSessionDuration: Math.round(avgSessionDuration),
          bounceRate: (bounceRate * 100).toFixed(1),
          trafficSources,
          topPages,
          organicPercent: parseFloat(organicPercent),
          platformBreakdown
        }
      };
    } catch (error) {
      this.logger.error('[UnifiedAnalytics] GA4 query error:', error.message);
      return {
        available: false,
        reason: error.message,
        data: null
      };
    }
  }

  /**
   * Get iOS app metrics from Firebase
   * Note: Firebase Analytics API is limited - most detailed data requires BigQuery export
   * This provides what's available via Admin SDK
   * @param {number} days - Number of days to look back
   */
  async getAppMetrics(days = 7) {
    await this.initFirebase();

    if (!this.firebaseApp) {
      return {
        available: false,
        reason: 'Firebase not configured',
        data: null
      };
    }

    // Firebase Analytics data is not directly accessible via Admin SDK
    // It requires BigQuery export or using the Google Analytics Data API
    // For now, we'll pull what we can from our own supplier_engagements table
    // and note that full Firebase data requires manual CSV export or BigQuery setup

    try {
      // Get app engagement data from our database
      const [engagement, dailyActive] = await Promise.all([
        this.sequelize.query(`
          SELECT
            COUNT(*) as total_engagements,
            COUNT(DISTINCT user_id) as unique_users,
            COUNT(*) FILTER (WHERE engagement_type = 'call') as calls,
            COUNT(*) FILTER (WHERE engagement_type = 'view') as views,
            COUNT(*) FILTER (WHERE engagement_type = 'save') as saves
          FROM supplier_engagements
          WHERE created_at > NOW() - INTERVAL '${days} days'
        `, { type: this.sequelize.QueryTypes.SELECT }),

        this.sequelize.query(`
          SELECT DATE(created_at) as date, COUNT(DISTINCT user_id) as users
          FROM supplier_engagements
          WHERE created_at > NOW() - INTERVAL '${days} days'
          GROUP BY DATE(created_at)
          ORDER BY date
        `, { type: this.sequelize.QueryTypes.SELECT })
      ]);

      const stats = engagement[0] || {};

      return {
        available: true,
        source: 'database', // Indicating this is from our DB, not Firebase directly
        note: 'For full Firebase Analytics (installs, retention), configure GA4 Data API or BigQuery export',
        data: {
          totalEngagements: parseInt(stats.total_engagements) || 0,
          uniqueUsers: parseInt(stats.unique_users) || 0,
          calls: parseInt(stats.calls) || 0,
          views: parseInt(stats.views) || 0,
          saves: parseInt(stats.saves) || 0,
          dailyActiveUsers: dailyActive.map(d => ({
            date: d.date,
            users: parseInt(d.users)
          }))
        }
      };
    } catch (error) {
      this.logger.error('[UnifiedAnalytics] App metrics error:', error.message);
      return {
        available: false,
        reason: error.message,
        data: null
      };
    }
  }

  /**
   * Get backend metrics from PostgreSQL
   * @param {number} days - Number of days to look back
   */
  async getBackendMetrics(days = 7) {
    try {
      const [clicks, searches, waitlist, pwa] = await Promise.all([
        // Click stats
        this.sequelize.query(`
          SELECT
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE action_type = 'call') as calls,
            COUNT(*) FILTER (WHERE action_type = 'website') as websites,
            COUNT(DISTINCT supplier_id) as unique_suppliers
          FROM supplier_clicks
          WHERE created_at > NOW() - INTERVAL '${days} days'
        `, { type: this.sequelize.QueryTypes.SELECT }),

        // Search stats
        this.sequelize.query(`
          SELECT
            COUNT(*) as total,
            COUNT(DISTINCT zip_code) as unique_zips
          FROM user_locations
          WHERE created_at > NOW() - INTERVAL '${days} days'
        `, { type: this.sequelize.QueryTypes.SELECT }),

        // Waitlist stats
        this.sequelize.query(`
          SELECT
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as last_week
          FROM waitlist
        `, { type: this.sequelize.QueryTypes.SELECT }),

        // PWA stats
        this.sequelize.query(`
          SELECT
            COUNT(*) FILTER (WHERE event_type = 'prompt_shown') as prompts,
            COUNT(*) FILTER (WHERE event_type = 'installed') as installs
          FROM pwa_events
          WHERE created_at > NOW() - INTERVAL '${days} days'
        `, { type: this.sequelize.QueryTypes.SELECT })
      ]);

      const c = clicks[0] || {};
      const s = searches[0] || {};
      const w = waitlist[0] || {};
      const p = pwa[0] || {};

      return {
        available: true,
        data: {
          clicks: {
            total: parseInt(c.total) || 0,
            calls: parseInt(c.calls) || 0,
            websites: parseInt(c.websites) || 0,
            uniqueSuppliers: parseInt(c.unique_suppliers) || 0
          },
          searches: {
            total: parseInt(s.total) || 0,
            uniqueZips: parseInt(s.unique_zips) || 0
          },
          waitlist: {
            total: parseInt(w.total) || 0,
            lastWeek: parseInt(w.last_week) || 0
          },
          pwa: {
            prompts: parseInt(p.prompts) || 0,
            installs: parseInt(p.installs) || 0,
            conversionRate: p.prompts > 0
              ? ((parseInt(p.installs) / parseInt(p.prompts)) * 100).toFixed(1)
              : 0
          }
        }
      };
    } catch (error) {
      this.logger.error('[UnifiedAnalytics] Backend metrics error:', error.message);
      return {
        available: false,
        reason: error.message,
        data: null
      };
    }
  }

  /**
   * Get retention analysis data
   * Combines Firebase retention cohorts (if available) with our engagement data
   * @param {number} weeks - Number of weeks to analyze
   */
  async getRetentionAnalysis(weeks = 6) {
    try {
      // Get weekly cohort retention from our engagement data
      const cohorts = await this.sequelize.query(`
        WITH first_engagement AS (
          SELECT user_id, MIN(DATE(created_at)) as first_date
          FROM supplier_engagements
          WHERE user_id IS NOT NULL
          GROUP BY user_id
        ),
        weekly_cohorts AS (
          SELECT
            DATE_TRUNC('week', fe.first_date) as cohort_week,
            COUNT(DISTINCT fe.user_id) as cohort_size
          FROM first_engagement fe
          GROUP BY DATE_TRUNC('week', fe.first_date)
        ),
        retention AS (
          SELECT
            DATE_TRUNC('week', fe.first_date) as cohort_week,
            FLOOR(EXTRACT(EPOCH FROM (DATE_TRUNC('week', se.created_at) - DATE_TRUNC('week', fe.first_date))) / 604800) as week_number,
            COUNT(DISTINCT se.user_id) as active_users
          FROM first_engagement fe
          JOIN supplier_engagements se ON fe.user_id = se.user_id
          WHERE fe.first_date >= NOW() - INTERVAL '${weeks} weeks'
          GROUP BY DATE_TRUNC('week', fe.first_date), week_number
        )
        SELECT
          wc.cohort_week,
          wc.cohort_size,
          r.week_number,
          r.active_users,
          ROUND((r.active_users::numeric / NULLIF(wc.cohort_size, 0) * 100), 1) as retention_rate
        FROM weekly_cohorts wc
        JOIN retention r ON wc.cohort_week = r.cohort_week
        WHERE wc.cohort_week >= NOW() - INTERVAL '${weeks} weeks'
        ORDER BY wc.cohort_week, r.week_number
      `, { type: this.sequelize.QueryTypes.SELECT });

      // Get retention by behavior type
      const behaviorRetention = await this.sequelize.query(`
        WITH user_behaviors AS (
          SELECT
            user_id,
            MIN(created_at) as first_engagement,
            MAX(created_at) as last_engagement,
            COUNT(*) FILTER (WHERE engagement_type = 'call') as calls,
            COUNT(*) FILTER (WHERE engagement_type = 'view') as views,
            COUNT(*) FILTER (WHERE engagement_type = 'save') as saves
          FROM supplier_engagements
          WHERE user_id IS NOT NULL
            AND created_at > NOW() - INTERVAL '30 days'
          GROUP BY user_id
        )
        SELECT
          CASE
            WHEN calls > 0 THEN 'made_call'
            WHEN saves > 0 THEN 'saved_supplier'
            ELSE 'browsed_only'
          END as behavior,
          COUNT(*) as user_count,
          ROUND(AVG(EXTRACT(EPOCH FROM (last_engagement - first_engagement)) / 86400), 1) as avg_active_days
        FROM user_behaviors
        GROUP BY
          CASE
            WHEN calls > 0 THEN 'made_call'
            WHEN saves > 0 THEN 'saved_supplier'
            ELSE 'browsed_only'
          END
        ORDER BY avg_active_days DESC
      `, { type: this.sequelize.QueryTypes.SELECT });

      // Calculate overall week 1 retention
      const week1Retention = cohorts.find(c => c.week_number === 1);
      const week0 = cohorts.find(c => c.week_number === 0);

      return {
        available: true,
        data: {
          cohorts,
          behaviorRetention: behaviorRetention.map(b => ({
            behavior: b.behavior,
            userCount: parseInt(b.user_count),
            avgActiveDays: parseFloat(b.avg_active_days) || 0
          })),
          summary: {
            week1RetentionRate: week1Retention && week0
              ? ((parseInt(week1Retention.active_users) / parseInt(week0.active_users)) * 100).toFixed(1)
              : null,
            totalCohortSize: week0 ? parseInt(week0.cohort_size) : 0
          }
        }
      };
    } catch (error) {
      this.logger.error('[UnifiedAnalytics] Retention analysis error:', error.message);
      return {
        available: false,
        reason: error.message,
        data: null
      };
    }
  }

  /**
   * Get acquisition channel analysis
   * Combines GA4 traffic data with our conversion tracking
   * @param {number} days - Number of days to analyze
   */
  async getAcquisitionAnalysis(days = 30) {
    try {
      // Get website traffic if GA4 is available
      const websiteMetrics = await this.getWebsiteMetrics(days);

      // Get our conversion data
      const [searchToClick, topConverting] = await Promise.all([
        // Search to click conversion by day
        this.sequelize.query(`
          WITH daily_searches AS (
            SELECT DATE(created_at) as date, COUNT(*) as searches
            FROM user_locations
            WHERE created_at > NOW() - INTERVAL '${days} days'
            GROUP BY DATE(created_at)
          ),
          daily_clicks AS (
            SELECT DATE(created_at) as date, COUNT(*) as clicks
            FROM supplier_clicks
            WHERE created_at > NOW() - INTERVAL '${days} days'
            GROUP BY DATE(created_at)
          )
          SELECT
            s.date,
            s.searches,
            COALESCE(c.clicks, 0) as clicks,
            CASE WHEN s.searches > 0 THEN ROUND((COALESCE(c.clicks, 0)::numeric / s.searches * 100), 2) ELSE 0 END as conversion_rate
          FROM daily_searches s
          LEFT JOIN daily_clicks c ON s.date = c.date
          ORDER BY s.date
        `, { type: this.sequelize.QueryTypes.SELECT }),

        // Top converting cities/ZIPs
        this.sequelize.query(`
          WITH zip_searches AS (
            SELECT zip_code, COUNT(*) as searches
            FROM user_locations
            WHERE created_at > NOW() - INTERVAL '${days} days' AND zip_code IS NOT NULL
            GROUP BY zip_code
          ),
          zip_clicks AS (
            SELECT zip_code, COUNT(*) as clicks
            FROM supplier_clicks
            WHERE created_at > NOW() - INTERVAL '${days} days' AND zip_code IS NOT NULL
            GROUP BY zip_code
          )
          SELECT
            s.zip_code,
            s.searches,
            COALESCE(c.clicks, 0) as clicks,
            CASE WHEN s.searches > 0 THEN ROUND((COALESCE(c.clicks, 0)::numeric / s.searches * 100), 2) ELSE 0 END as conversion_rate
          FROM zip_searches s
          LEFT JOIN zip_clicks c ON s.zip_code = c.zip_code
          WHERE s.searches >= 5
          ORDER BY COALESCE(c.clicks, 0) DESC
          LIMIT 20
        `, { type: this.sequelize.QueryTypes.SELECT })
      ]);

      // Load ZIP database for city names
      const zipDbPath = path.join(__dirname, '../data/zip-database.json');
      let zipCoords = {};
      try {
        zipCoords = JSON.parse(fs.readFileSync(zipDbPath, 'utf8'));
      } catch (e) {
        // Continue without ZIP enrichment
      }

      // Enrich top converting with city names
      const enrichedTopConverting = topConverting.map(z => ({
        zip: z.zip_code,
        city: zipCoords[z.zip_code]?.city || '--',
        state: zipCoords[z.zip_code]?.state || '--',
        searches: parseInt(z.searches),
        clicks: parseInt(z.clicks),
        conversionRate: parseFloat(z.conversion_rate)
      }));

      return {
        available: true,
        data: {
          websiteTraffic: websiteMetrics.data,
          ga4Available: websiteMetrics.available,
          conversionFunnel: {
            daily: searchToClick.map(d => ({
              date: d.date,
              searches: parseInt(d.searches),
              clicks: parseInt(d.clicks),
              conversionRate: parseFloat(d.conversion_rate)
            }))
          },
          topConvertingLocations: enrichedTopConverting
        }
      };
    } catch (error) {
      this.logger.error('[UnifiedAnalytics] Acquisition analysis error:', error.message);
      return {
        available: false,
        reason: error.message,
        data: null
      };
    }
  }

  /**
   * Get Android decision signals
   * Aggregates data relevant for Android app go/no-go decision
   */
  async getAndroidDecisionSignals() {
    try {
      // Get website metrics for platform breakdown
      const websiteMetrics = await this.getWebsiteMetrics(30);

      const [waitlist, pwa, growth] = await Promise.all([
        // Waitlist stats (all platforms - total demand matters for Android decision)
        this.sequelize.query(`
          SELECT
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as last_week,
            COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '14 days' AND created_at <= NOW() - INTERVAL '7 days') as prev_week
          FROM waitlist
        `, { type: this.sequelize.QueryTypes.SELECT }),

        // PWA adoption
        this.sequelize.query(`
          SELECT
            COUNT(*) FILTER (WHERE event_type = 'installed') as installs,
            COUNT(*) FILTER (WHERE event_type = 'standalone_launch') as launches
          FROM pwa_events
          WHERE platform ILIKE '%android%'
        `, { type: this.sequelize.QueryTypes.SELECT }),

        // Weekly growth trend
        this.sequelize.query(`
          SELECT
            DATE_TRUNC('week', created_at) as week,
            COUNT(*) as signups
          FROM waitlist
          WHERE created_at > NOW() - INTERVAL '8 weeks'
          GROUP BY DATE_TRUNC('week', created_at)
          ORDER BY week
        `, { type: this.sequelize.QueryTypes.SELECT })
      ]);

      const w = waitlist[0] || {};
      const p = pwa[0] || {};

      // Calculate week-over-week growth
      const lastWeek = parseInt(w.last_week) || 0;
      const prevWeek = parseInt(w.prev_week) || 0;

      // Growth rate calculation with edge case handling
      let growthRate;
      if (prevWeek > 0) {
        // Normal case: calculate percentage change
        growthRate = ((lastWeek - prevWeek) / prevWeek * 100).toFixed(1);
      } else if (lastWeek > 0) {
        // Edge case: no signups last period but some this period = 100% growth (new growth)
        growthRate = 100;
      } else {
        // No signups either period
        growthRate = 0;
      }

      // Decision thresholds
      const total = parseInt(w.total) || 0;
      const thresholds = {
        waitlist: { value: 200, current: total, met: total >= 200 },
        growthRate: { value: 5, current: parseFloat(growthRate), met: parseFloat(growthRate) >= 5 },
        pwaAdoption: { value: 30, current: parseInt(p.installs) || 0, met: (parseInt(p.installs) || 0) >= 30 }
      };

      // Calculate projection
      const avgWeeklyGrowth = growth.length >= 2
        ? (parseInt(growth[growth.length - 1]?.signups) || 0)
        : lastWeek;
      const weeksTo200 = total < 200 && avgWeeklyGrowth > 0
        ? Math.ceil((200 - total) / avgWeeklyGrowth)
        : 0;

      // Decision recommendation
      const metCount = Object.values(thresholds).filter(t => t.met).length;
      let recommendation;
      if (metCount >= 2) {
        recommendation = {
          status: 'GO',
          message: 'Strong Android demand signals - consider starting development',
          confidence: 'HIGH'
        };
      } else if (metCount === 1) {
        recommendation = {
          status: 'WAIT',
          message: `Monitor for ${weeksTo200} more weeks until 200 waitlist threshold`,
          confidence: 'MEDIUM'
        };
      } else {
        recommendation = {
          status: 'WAIT',
          message: 'Insufficient demand signals - PWA serves Android users adequately',
          confidence: 'HIGH'
        };
      }

      // Get platform breakdown from GA4
      const platformBreakdown = websiteMetrics.available && websiteMetrics.data?.platformBreakdown
        ? websiteMetrics.data.platformBreakdown
        : null;

      return {
        available: true,
        data: {
          waitlist: {
            total,
            lastWeek,
            prevWeek,
            growthRate: parseFloat(growthRate)
          },
          pwa: {
            installs: parseInt(p.installs) || 0,
            launches: parseInt(p.launches) || 0
          },
          platformBreakdown,
          weeklyTrend: growth.map(g => ({
            week: g.week,
            signups: parseInt(g.signups)
          })),
          thresholds,
          projection: {
            weeksTo200,
            expectedConversion: Math.round(total * 0.3), // 30% expected conversion
            breakEvenUsers: 100
          },
          recommendation
        }
      };
    } catch (error) {
      this.logger.error('[UnifiedAnalytics] Android signals error:', error.message);
      return {
        available: false,
        reason: error.message,
        data: null
      };
    }
  }

  /**
   * Get unified overview combining all data sources
   * @param {number} days - Number of days to look back
   */
  async getUnifiedOverview(days = 7) {
    try {
      const [website, app, backend, retention, android] = await Promise.all([
        this.getWebsiteMetrics(days),
        this.getAppMetrics(days),
        this.getBackendMetrics(days),
        this.getRetentionAnalysis(6),
        this.getAndroidDecisionSignals()
      ]);

      return {
        period: `${days}d`,
        dataSources: {
          ga4: website.available,
          firebase: app.available && app.source !== 'database',
          database: backend.available
        },
        website: website.data,
        app: app.data,
        backend: backend.data,
        retention: retention.data,
        android: android.data,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('[UnifiedAnalytics] Unified overview error:', error.message);
      throw error;
    }
  }
}

module.exports = UnifiedAnalytics;
