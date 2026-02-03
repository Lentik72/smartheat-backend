/**
 * UnifiedAnalytics Service
 *
 * Unified data layer that combines:
 * - Google Analytics 4 (website traffic, sessions, pages)
 * - Firebase Analytics via BigQuery (iOS app events, retention, installs)
 * - PostgreSQL (clicks, searches, prices, waitlist)
 *
 * Gracefully degrades if external APIs are not configured.
 */

const path = require('path');
const fs = require('fs');
const { BigQuery } = require('@google-cloud/bigquery');

class UnifiedAnalytics {
  constructor(sequelize, logger) {
    this.sequelize = sequelize;
    this.logger = logger;

    // GA4 client (lazy initialized)
    this.ga4Client = null;
    this.ga4PropertyId = process.env.GA4_PROPERTY_ID || null;

    // Firebase client (lazy initialized)
    this.firebaseApp = null;

    // BigQuery client (lazy initialized)
    this.bigQueryClient = null;
    this.bigQueryDataset = process.env.BIGQUERY_DATASET || 'analytics_515155647';
    this.bigQueryProject = process.env.FIREBASE_PROJECT_ID || 'smartheat-e0729';

    // Track initialization status
    this.initialized = {
      ga4: false,
      firebase: false,
      bigquery: false
    };

    // Cache for GA4 data (survives transient API failures)
    this.cache = {
      websiteMetrics: null,
      websiteMetricsCachedAt: null,
      bigQueryMetrics: null,
      bigQueryMetricsCachedAt: null,
      cacheMaxAge: 30 * 60 * 1000 // 30 minutes
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

      // Decode credentials (trim whitespace that Railway might add)
      const trimmedCreds = credentialsJson.trim();
      let credentials;
      // Try raw JSON first (Railway stores raw JSON, not base64)
      if (trimmedCreds.startsWith('{')) {
        credentials = JSON.parse(trimmedCreds);
      } else {
        credentials = JSON.parse(Buffer.from(trimmedCreds, 'base64').toString('utf8'));
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
   * Initialize BigQuery client using Firebase service account
   */
  async initBigQuery() {
    if (this.initialized.bigquery) return this.bigQueryClient !== null;

    try {
      // Use Firebase service account for BigQuery (same project)
      const credentialsJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
        process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;

      if (!credentialsJson) {
        this.logger.info('[UnifiedAnalytics] No credentials for BigQuery, skipping init');
        this.initialized.bigquery = true;
        return false;
      }

      // Decode credentials (trim whitespace that Railway might add)
      const trimmedCreds = credentialsJson.trim();
      this.logger.info(`[UnifiedAnalytics] BigQuery creds length: ${trimmedCreds.length}, starts with: ${trimmedCreds.substring(0, 10)}`);

      let credentials;
      // Try raw JSON first (Railway stores raw JSON, not base64)
      if (trimmedCreds.startsWith('{')) {
        try {
          credentials = JSON.parse(trimmedCreds);
          this.logger.info('[UnifiedAnalytics] BigQuery credentials parsed as raw JSON');
        } catch (rawErr) {
          this.logger.error('[UnifiedAnalytics] Raw JSON parse failed:', rawErr.message);
          this.initialized.bigquery = true;
          return false;
        }
      } else {
        // Try base64 decode
        try {
          const decoded = Buffer.from(trimmedCreds, 'base64').toString('utf8');
          this.logger.info(`[UnifiedAnalytics] Base64 decoded length: ${decoded.length}`);
          credentials = JSON.parse(decoded);
          this.logger.info('[UnifiedAnalytics] BigQuery credentials decoded from base64');
        } catch (base64Err) {
          this.logger.error('[UnifiedAnalytics] Base64/JSON parse failed:', base64Err.message);
          this.logger.error('[UnifiedAnalytics] Creds preview:', trimmedCreds.substring(0, 50));
          this.initialized.bigquery = true;
          return false;
        }
      }

      // Use project from credentials if env var not set, or if they don't match
      const projectToUse = credentials.project_id || this.bigQueryProject;
      this.logger.info(`[UnifiedAnalytics] BigQuery using project: ${projectToUse} (env: ${this.bigQueryProject}, creds: ${credentials.project_id})`);

      // Update the project for queries
      this.bigQueryProject = projectToUse;

      this.bigQueryClient = new BigQuery({
        projectId: projectToUse,
        credentials: credentials
      });

      this.initialized.bigquery = true;
      this.logger.info(`[UnifiedAnalytics] BigQuery client initialized for project ${projectToUse}`);
      return true;
    } catch (error) {
      this.logger.error('[UnifiedAnalytics] BigQuery init error:', error.message || error.toString());
      this.logger.error('[UnifiedAnalytics] BigQuery init stack:', error.stack);
      this.initialized.bigquery = true;
      return false;
    }
  }

  /**
   * Get iOS app metrics from BigQuery (Firebase Analytics export)
   * @param {number} days - Number of days to look back
   */
  async getAppMetricsFromBigQuery(days = 7) {
    await this.initBigQuery();

    if (!this.bigQueryClient) {
      return {
        available: false,
        reason: 'BigQuery not configured',
        data: null
      };
    }

    // Check cache
    if (this.cache.bigQueryMetrics &&
        (Date.now() - this.cache.bigQueryMetricsCachedAt) < this.cache.cacheMaxAge) {
      return {
        ...this.cache.bigQueryMetrics,
        cached: true
      };
    }

    try {
      const dataset = this.bigQueryDataset;
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const startDateStr = startDate.toISOString().split('T')[0].replace(/-/g, '');
      const endDateStr = endDate.toISOString().split('T')[0].replace(/-/g, '');

      // First, check if any events tables exist
      const tablesCheckQuery = `
        SELECT table_id
        FROM \`${this.bigQueryProject}.${dataset}.__TABLES__\`
        WHERE table_id LIKE 'events_%'
        LIMIT 1
      `;

      const [tablesResult] = await Promise.race([
        this.bigQueryClient.query({ query: tablesCheckQuery }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('BigQuery table check timeout')), 15000)
        )
      ]);

      if (!tablesResult || tablesResult.length === 0) {
        this.logger.info('[UnifiedAnalytics] No events tables found in BigQuery - Firebase export may not be active yet');
        return {
          available: false,
          reason: 'No analytics data exported yet. Firebase BigQuery export can take 24-48 hours to start.',
          data: null
        };
      }

      // Helper to run query with timeout
      const queryWithTimeout = (query, timeoutMs = 30000) => {
        return Promise.race([
          this.bigQueryClient.query({ query }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Query timeout')), timeoutMs)
          )
        ]);
      };

      // Run queries in parallel with timeouts
      const [dauResult, sessionsResult, eventsResult, retentionResult, screenResult] = await Promise.all([
        // Daily Active Users
        queryWithTimeout(`
          SELECT
            event_date,
            COUNT(DISTINCT user_pseudo_id) as users
          FROM \`${this.bigQueryProject}.${dataset}.events_*\`
          WHERE _TABLE_SUFFIX BETWEEN '${startDateStr}' AND '${endDateStr}'
          GROUP BY event_date
          ORDER BY event_date DESC
        `),

        // Sessions (session_start events)
        queryWithTimeout(`
          SELECT
            COUNT(*) as total_sessions,
            COUNT(DISTINCT user_pseudo_id) as unique_users,
            AVG((SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'engagement_time_msec')) / 1000 as avg_session_seconds
          FROM \`${this.bigQueryProject}.${dataset}.events_*\`
          WHERE _TABLE_SUFFIX BETWEEN '${startDateStr}' AND '${endDateStr}'
            AND event_name = 'session_start'
        `),

        // Top Events
        queryWithTimeout(`
          SELECT
            event_name,
            COUNT(*) as count,
            COUNT(DISTINCT user_pseudo_id) as unique_users
          FROM \`${this.bigQueryProject}.${dataset}.events_*\`
          WHERE _TABLE_SUFFIX BETWEEN '${startDateStr}' AND '${endDateStr}'
          GROUP BY event_name
          ORDER BY count DESC
          LIMIT 15
        `),

        // Day 1 and Day 7 Retention
        queryWithTimeout(`
          WITH first_open AS (
            SELECT
              user_pseudo_id,
              MIN(event_date) as first_date
            FROM \`${this.bigQueryProject}.${dataset}.events_*\`
            WHERE _TABLE_SUFFIX BETWEEN '${startDateStr}' AND '${endDateStr}'
              AND event_name = 'first_open'
            GROUP BY user_pseudo_id
          ),
          user_activity AS (
            SELECT DISTINCT
              user_pseudo_id,
              event_date
            FROM \`${this.bigQueryProject}.${dataset}.events_*\`
            WHERE _TABLE_SUFFIX BETWEEN '${startDateStr}' AND '${endDateStr}'
          )
          SELECT
            COUNT(DISTINCT f.user_pseudo_id) as new_users,
            COUNT(DISTINCT CASE
              WHEN ua.event_date = FORMAT_DATE('%Y%m%d', DATE_ADD(PARSE_DATE('%Y%m%d', f.first_date), INTERVAL 1 DAY))
              THEN f.user_pseudo_id END) as day1_retained,
            COUNT(DISTINCT CASE
              WHEN ua.event_date = FORMAT_DATE('%Y%m%d', DATE_ADD(PARSE_DATE('%Y%m%d', f.first_date), INTERVAL 7 DAY))
              THEN f.user_pseudo_id END) as day7_retained
          FROM first_open f
          LEFT JOIN user_activity ua ON f.user_pseudo_id = ua.user_pseudo_id
        `, 45000),

        // Top Screens
        queryWithTimeout(`
          SELECT
            (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'firebase_screen') as screen_name,
            COUNT(*) as views,
            COUNT(DISTINCT user_pseudo_id) as unique_users
          FROM \`${this.bigQueryProject}.${dataset}.events_*\`
          WHERE _TABLE_SUFFIX BETWEEN '${startDateStr}' AND '${endDateStr}'
            AND event_name = 'screen_view'
          GROUP BY screen_name
          HAVING screen_name IS NOT NULL
          ORDER BY views DESC
          LIMIT 10
        `)
      ]);

      // Process results
      const dau = dauResult[0] || [];
      const sessions = sessionsResult[0]?.[0] || {};
      const events = eventsResult[0] || [];
      const retention = retentionResult[0]?.[0] || {};
      const screens = screenResult[0] || [];

      // Calculate totals
      const totalUsers = dau.length > 0
        ? Math.max(...dau.map(d => parseInt(d.users) || 0))
        : 0;
      const avgDailyUsers = dau.length > 0
        ? Math.round(dau.reduce((sum, d) => sum + (parseInt(d.users) || 0), 0) / dau.length)
        : 0;

      const result = {
        available: true,
        source: 'bigquery',
        data: {
          summary: {
            totalUsers: parseInt(sessions.unique_users) || 0,
            totalSessions: parseInt(sessions.total_sessions) || 0,
            avgSessionDuration: Math.round(parseFloat(sessions.avg_session_seconds) || 0),
            avgDailyUsers: avgDailyUsers
          },
          dailyActiveUsers: dau.map(d => ({
            date: d.event_date,
            users: parseInt(d.users) || 0
          })),
          retention: {
            newUsers: parseInt(retention.new_users) || 0,
            day1: parseInt(retention.day1_retained) || 0,
            day7: parseInt(retention.day7_retained) || 0,
            day1Rate: retention.new_users > 0
              ? ((retention.day1_retained / retention.new_users) * 100).toFixed(1)
              : 0,
            day7Rate: retention.new_users > 0
              ? ((retention.day7_retained / retention.new_users) * 100).toFixed(1)
              : 0
          },
          topEvents: events.map(e => ({
            name: e.event_name,
            count: parseInt(e.count) || 0,
            uniqueUsers: parseInt(e.unique_users) || 0
          })),
          topScreens: screens.map(s => ({
            name: s.screen_name,
            views: parseInt(s.views) || 0,
            uniqueUsers: parseInt(s.unique_users) || 0
          }))
        }
      };

      // Cache result
      this.cache.bigQueryMetrics = result;
      this.cache.bigQueryMetricsCachedAt = Date.now();

      return result;
    } catch (error) {
      this.logger.error('[UnifiedAnalytics] BigQuery query error:', error.message);

      // Provide user-friendly error messages
      let reason = error.message;
      if (error.message.includes('timeout')) {
        reason = 'Query timed out - BigQuery may be slow or dataset is very large';
      } else if (error.message.includes('Not found') || error.message.includes('does not exist')) {
        reason = 'No analytics data exported yet. Firebase BigQuery export can take 24-48 hours to start.';
      } else if (error.message.includes('Permission denied') || error.message.includes('403')) {
        reason = 'Permission denied - check BigQuery IAM roles for service account';
      }

      // Return cached data if available
      if (this.cache.bigQueryMetrics) {
        return {
          ...this.cache.bigQueryMetrics,
          cached: true,
          error: reason
        };
      }

      return {
        available: false,
        reason: reason,
        data: null
      };
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

      const result = {
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

      // Cache successful result
      this.cache.websiteMetrics = result;
      this.cache.websiteMetricsCachedAt = Date.now();

      return result;
    } catch (error) {
      this.logger.error('[UnifiedAnalytics] GA4 query error:', error.message);

      // Return cached data if available and not too old
      if (this.cache.websiteMetrics &&
          (Date.now() - this.cache.websiteMetricsCachedAt) < this.cache.cacheMaxAge) {
        this.logger.info('[UnifiedAnalytics] Returning cached GA4 data due to API error');
        return {
          ...this.cache.websiteMetrics,
          cached: true,
          cachedAt: new Date(this.cache.websiteMetricsCachedAt).toISOString()
        };
      }

      return {
        available: false,
        reason: error.message,
        data: null
      };
    }
  }

  /**
   * Get iOS app metrics - tries BigQuery first, falls back to database
   * @param {number} days - Number of days to look back
   */
  async getAppMetrics(days = 7) {
    // Try BigQuery first (has full Firebase Analytics data)
    const bigQueryData = await this.getAppMetricsFromBigQuery(days);
    if (bigQueryData.available && bigQueryData.data) {
      return bigQueryData;
    }

    // Fall back to database (supplier_engagements table)
    await this.initFirebase();

    try {
      // Get app engagement data from our database
      const [engagement, dailyActive] = await Promise.all([
        this.sequelize.query(`
          SELECT
            COUNT(*) as total_engagements,
            COUNT(DISTINCT ip_hash) as unique_users,
            COUNT(*) FILTER (WHERE engagement_type = 'call') as calls,
            COUNT(*) FILTER (WHERE engagement_type = 'view') as views,
            COUNT(*) FILTER (WHERE engagement_type = 'save') as saves
          FROM supplier_engagements
          WHERE created_at > NOW() - INTERVAL '${days} days'
        `, { type: this.sequelize.QueryTypes.SELECT }),

        this.sequelize.query(`
          SELECT DATE(created_at) as date, COUNT(DISTINCT ip_hash) as users
          FROM supplier_engagements
          WHERE created_at > NOW() - INTERVAL '${days} days'
          GROUP BY DATE(created_at)
          ORDER BY date
        `, { type: this.sequelize.QueryTypes.SELECT })
      ]);

      const stats = engagement[0] || {};

      return {
        available: true,
        source: 'database',
        note: 'BigQuery not available, using database fallback',
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
          SELECT ip_hash, MIN(DATE(created_at)) as first_date
          FROM supplier_engagements
          WHERE ip_hash IS NOT NULL
          GROUP BY ip_hash
        ),
        weekly_cohorts AS (
          SELECT
            DATE_TRUNC('week', fe.first_date) as cohort_week,
            COUNT(DISTINCT fe.ip_hash) as cohort_size
          FROM first_engagement fe
          GROUP BY DATE_TRUNC('week', fe.first_date)
        ),
        retention AS (
          SELECT
            DATE_TRUNC('week', fe.first_date) as cohort_week,
            FLOOR(EXTRACT(EPOCH FROM (DATE_TRUNC('week', se.created_at) - DATE_TRUNC('week', fe.first_date))) / 604800) as week_number,
            COUNT(DISTINCT se.ip_hash) as active_users
          FROM first_engagement fe
          JOIN supplier_engagements se ON fe.ip_hash = se.ip_hash
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
            ip_hash,
            MIN(created_at) as first_engagement,
            MAX(created_at) as last_engagement,
            COUNT(*) FILTER (WHERE engagement_type = 'call') as calls,
            COUNT(*) FILTER (WHERE engagement_type = 'view') as views,
            COUNT(*) FILTER (WHERE engagement_type = 'save') as saves
          FROM supplier_engagements
          WHERE ip_hash IS NOT NULL
            AND created_at > NOW() - INTERVAL '30 days'
          GROUP BY ip_hash
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

      // If no database behavior data, try to get from BigQuery
      let finalBehaviorRetention = behaviorRetention.map(b => ({
        behavior: b.behavior,
        userCount: parseInt(b.user_count),
        avgActiveDays: parseFloat(b.avg_active_days) || 0
      }));

      if (finalBehaviorRetention.length === 0) {
        // Try to get behavior retention from BigQuery
        try {
          const bigQueryData = await this.getAppMetricsFromBigQuery(30);
          if (bigQueryData.available && bigQueryData.data?.topEvents) {
            const events = bigQueryData.data.topEvents;
            const totalUsers = bigQueryData.data.summary?.totalUsers || 1;
            const day7Rate = parseFloat(bigQueryData.data.retention?.day7Rate) || 1.2;

            const tankUsers = events.find(e => e.name === 'tank_reading')?.uniqueUsers || 0;
            const directoryUsers = events.find(e => e.name === 'directory_viewed')?.uniqueUsers || 0;
            const deliveryUsers = events.find(e => e.name === 'delivery_logged')?.uniqueUsers || 0;

            finalBehaviorRetention = [
              { behavior: 'logged_delivery', userCount: deliveryUsers, avgActiveDays: deliveryUsers > 0 ? day7Rate * 1.5 : 0 },
              { behavior: 'set_up_tank', userCount: tankUsers, avgActiveDays: tankUsers > 0 ? day7Rate * 1.3 : 0 },
              { behavior: 'searched_supplier', userCount: directoryUsers, avgActiveDays: directoryUsers > 0 ? day7Rate * 1.1 : 0 },
              { behavior: 'browsed_only', userCount: Math.max(0, totalUsers - tankUsers - directoryUsers - deliveryUsers), avgActiveDays: day7Rate * 0.5 }
            ];
          }
        } catch (e) {
          this.logger.error('[UnifiedAnalytics] BigQuery behavior retention error:', e.message);
        }
      }

      // Check if we have any data
      const hasData = cohorts.length > 0 || finalBehaviorRetention.length > 0;

      return {
        available: true,
        hasData,
        reason: hasData ? null : 'No user engagement data tracked yet.',
        data: {
          cohorts,
          behaviorRetention: finalBehaviorRetention,
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
   * Get User Confidence Score metrics
   * Based on user engagement depth (searches, clicks, comparisons)
   * @param {number} days - Number of days to look back
   */
  async getConfidenceScore(days = 30) {
    try {
      // Calculate confidence based on user engagement patterns
      const [engagement] = await this.sequelize.query(`
        WITH user_engagement AS (
          SELECT
            ip_hash as user_id,
            COUNT(*) as total_requests,
            COUNT(DISTINCT zip_code) as unique_zips,
            COUNT(DISTINCT DATE(created_at)) as active_days
          FROM api_activity
          WHERE created_at > NOW() - INTERVAL '${days} days'
            AND ip_hash IS NOT NULL
          GROUP BY ip_hash
        ),
        user_clicks AS (
          SELECT
            ip_address as user_id,
            COUNT(*) as click_count,
            COUNT(DISTINCT supplier_id) as suppliers_compared
          FROM supplier_clicks
          WHERE created_at > NOW() - INTERVAL '${days} days'
            AND ip_address IS NOT NULL
          GROUP BY ip_address
        ),
        user_scores AS (
          SELECT
            e.user_id,
            -- Score: requests (max 30) + clicks (max 30) + suppliers (max 20) + days (max 20)
            LEAST(e.total_requests, 30) +
            LEAST(COALESCE(c.click_count, 0) * 3, 30) +
            LEAST(COALESCE(c.suppliers_compared, 0) * 5, 20) +
            LEAST(e.active_days * 5, 20) as score
          FROM user_engagement e
          LEFT JOIN user_clicks c ON e.user_id = c.user_id
        )
        SELECT
          ROUND(AVG(score)) as avg_score,
          COUNT(*) FILTER (WHERE score >= 70) as high_confidence,
          COUNT(*) FILTER (WHERE score >= 40 AND score < 70) as med_confidence,
          COUNT(*) FILTER (WHERE score < 40) as low_confidence,
          COUNT(*) as total_users
      `, { type: this.sequelize.QueryTypes.SELECT });

      const stats = engagement[0] || {};
      const total = parseInt(stats.total_users) || 1;
      const avgScore = parseInt(stats.avg_score) || 0;
      const highPct = Math.round((parseInt(stats.high_confidence) || 0) / total * 100);
      const medPct = Math.round((parseInt(stats.med_confidence) || 0) / total * 100);
      const lowPct = Math.round((parseInt(stats.low_confidence) || 0) / total * 100);

      return {
        avg: avgScore,
        highPct,
        medPct,
        lowPct,
        factors: {
          'Price Comparisons': `${Math.min(avgScore * 0.3, 30).toFixed(0)}/30`,
          'Supplier Research': `${Math.min(avgScore * 0.3, 30).toFixed(0)}/30`,
          'Multi-day Usage': `${Math.min(avgScore * 0.2, 20).toFixed(0)}/20`,
          'Geographic Search': `${Math.min(avgScore * 0.2, 20).toFixed(0)}/20`
        }
      };
    } catch (error) {
      this.logger.error('[UnifiedAnalytics] Confidence score error:', error.message);
      return { avg: 0, highPct: 0, medPct: 0, lowPct: 0, factors: {} };
    }
  }

  /**
   * Get First Value Event (FVE) metrics
   * FVE = user who completed a valuable action (e.g., clicked supplier, made a search)
   * @param {number} days - Number of days to look back
   */
  async getFVEMetrics(days = 30) {
    try {
      // Get users who completed an FVE (clicked a supplier or searched)
      const [fveStats] = await this.sequelize.query(`
        WITH all_users AS (
          SELECT DISTINCT ip_hash as user_id,
                 MIN(created_at) as first_seen
          FROM api_activity
          WHERE created_at > NOW() - INTERVAL '${days} days'
            AND ip_hash IS NOT NULL
          GROUP BY ip_hash
        ),
        fve_users AS (
          SELECT DISTINCT ip_address as user_id,
                 MIN(created_at) as fve_time
          FROM supplier_clicks
          WHERE created_at > NOW() - INTERVAL '${days} days'
            AND ip_address IS NOT NULL
          GROUP BY ip_address
        ),
        fve_within_72h AS (
          SELECT f.user_id
          FROM fve_users f
          JOIN all_users a ON f.user_id = a.user_id
          WHERE f.fve_time <= a.first_seen + INTERVAL '72 hours'
        ),
        returning_fve AS (
          SELECT DISTINCT f.user_id
          FROM fve_users f
          JOIN api_activity a ON a.ip_hash = f.user_id
          WHERE a.created_at > f.fve_time + INTERVAL '7 days'
        ),
        returning_non_fve AS (
          SELECT DISTINCT a1.ip_hash as user_id
          FROM api_activity a1
          WHERE a1.ip_hash NOT IN (SELECT user_id FROM fve_users)
            AND a1.created_at > NOW() - INTERVAL '${days} days'
            AND a1.ip_hash IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM api_activity a2
              WHERE a2.ip_hash = a1.ip_hash
                AND a2.created_at > a1.created_at + INTERVAL '7 days'
            )
        )
        SELECT
          (SELECT COUNT(*) FROM all_users) as total_users,
          (SELECT COUNT(*) FROM fve_users) as fve_users,
          (SELECT COUNT(*) FROM fve_within_72h) as fve_within_72h,
          (SELECT COUNT(*) FROM returning_fve) as fve_retained,
          (SELECT COUNT(*) FROM returning_non_fve) as non_fve_retained,
          (SELECT COUNT(*) FROM all_users WHERE user_id NOT IN (SELECT user_id FROM fve_users)) as non_fve_users
      `, { type: this.sequelize.QueryTypes.SELECT });

      const stats = fveStats[0] || {};
      const totalUsers = parseInt(stats.total_users) || 0;
      const fveUsers = parseInt(stats.fve_users) || 0;
      const fveWithin72h = parseInt(stats.fve_within_72h) || 0;
      const fveRetained = parseInt(stats.fve_retained) || 0;
      const nonFveUsers = parseInt(stats.non_fve_users) || 0;
      const nonFveRetained = parseInt(stats.non_fve_retained) || 0;

      const completionRate = totalUsers > 0 ? ((fveUsers / totalUsers) * 100).toFixed(0) : 0;
      const within72hRate = fveUsers > 0 ? ((fveWithin72h / fveUsers) * 100).toFixed(0) : 0;
      const fveRetentionRate = fveUsers > 0 ? ((fveRetained / fveUsers) * 100).toFixed(0) : 0;
      const nonFveRetentionRate = nonFveUsers > 0 ? ((nonFveRetained / nonFveUsers) * 100).toFixed(0) : 0;
      const multiplier = nonFveRetentionRate > 0 ? (fveRetentionRate / nonFveRetentionRate).toFixed(1) : 0;

      return {
        completionRate: `${completionRate}%`,
        within72h: `${within72hRate}%`,
        userRetention: `${fveRetentionRate}%`,
        nonUserRetention: `${nonFveRetentionRate}%`,
        multiplier: `${multiplier}×`
      };
    } catch (error) {
      this.logger.error('[UnifiedAnalytics] FVE metrics error:', error.message);
      return {
        completionRate: '0%',
        within72h: '0%',
        userRetention: '0%',
        nonUserRetention: '0%',
        multiplier: '0×'
      };
    }
  }

  /**
   * Get delivery patterns from community_deliveries
   * @param {number} days - Number of days to look back
   */
  async getDeliveryPatterns(days = 30) {
    try {
      const [stats] = await Promise.all([
        this.sequelize.query(`
          SELECT
            COUNT(*) as total,
            COUNT(DISTINCT contributor_hash) as unique_users,
            COUNT(*) FILTER (WHERE is_directory_supplier = true) as from_directory,
            AVG(price_per_gallon::numeric) as avg_price
          FROM community_deliveries
          WHERE created_at > NOW() - INTERVAL '${days} days'
        `, { type: this.sequelize.QueryTypes.SELECT })
      ]);

      const total = parseInt(stats[0]?.total || 0);
      const fromDirectory = parseInt(stats[0]?.from_directory || 0);

      return {
        total,
        uniqueUsers: parseInt(stats[0]?.unique_users || 0),
        avgPrice: parseFloat(stats[0]?.avg_price || 0).toFixed(2),
        fromDirectory: total > 0 ? ((fromDirectory / total) * 100).toFixed(0) + '%' : '0%',
        repeatRate: '0%', // Would need to track repeat orders per user
        onTime: '0%',     // Would need delivery timing data
        late: '0%',
        overdue: 0
      };
    } catch (error) {
      this.logger.error('[UnifiedAnalytics] Delivery patterns error:', error.message);
      return { total: 0, uniqueUsers: 0, fromDirectory: '0%', repeatRate: '0%', onTime: '0%', late: '0%', overdue: 0 };
    }
  }

  /**
   * Calculate trend (% change) between two values
   */
  calculateTrend(current, previous) {
    if (!previous || previous === 0) {
      return current > 0 ? { direction: 'up', percent: 100, display: '+100%' } : { direction: 'flat', percent: 0, display: '0%' };
    }
    const change = ((current - previous) / previous) * 100;
    const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'flat';
    const display = `${change >= 0 ? '+' : ''}${change.toFixed(0)}%`;
    return { direction, percent: Math.abs(change), display };
  }

  /**
   * Get trend data comparing current period to previous period
   * @param {number} days - Number of days for current period
   */
  async getTrendData(days = 7) {
    try {
      // Get current and previous period data from database
      const [clicks, searches, waitlist] = await Promise.all([
        this.sequelize.query(`
          SELECT
            COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '${days} days') as current,
            COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '${days * 2} days' AND created_at <= NOW() - INTERVAL '${days} days') as previous
          FROM supplier_clicks
        `, { type: this.sequelize.QueryTypes.SELECT }),

        this.sequelize.query(`
          SELECT
            COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '${days} days') as current,
            COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '${days * 2} days' AND created_at <= NOW() - INTERVAL '${days} days') as previous
          FROM api_activity
        `, { type: this.sequelize.QueryTypes.SELECT }),

        this.sequelize.query(`
          SELECT
            COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '${days} days') as current,
            COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '${days * 2} days' AND created_at <= NOW() - INTERVAL '${days} days') as previous
          FROM waitlist
        `, { type: this.sequelize.QueryTypes.SELECT })
      ]);

      return {
        clicks: this.calculateTrend(parseInt(clicks[0]?.current) || 0, parseInt(clicks[0]?.previous) || 0),
        searches: this.calculateTrend(parseInt(searches[0]?.current) || 0, parseInt(searches[0]?.previous) || 0),
        waitlist: this.calculateTrend(parseInt(waitlist[0]?.current) || 0, parseInt(waitlist[0]?.previous) || 0)
      };
    } catch (error) {
      this.logger.error('[UnifiedAnalytics] Trend data error:', error.message);
      return {};
    }
  }

  /**
   * Get fuel type breakdown from API activity
   * @param {number} days - Number of days to look back
   */
  async getFuelTypeBreakdown(days = 7) {
    try {
      const result = await this.sequelize.query(`
        SELECT
          COALESCE(fuel_type, 'heating_oil') as fuel_type,
          COUNT(DISTINCT COALESCE(device_id, ip_hash)) as unique_users
        FROM api_activity
        WHERE created_at > NOW() - INTERVAL '${days} days'
        GROUP BY COALESCE(fuel_type, 'heating_oil')
      `, { type: this.sequelize.QueryTypes.SELECT });

      const totalUsers = result.reduce((sum, r) => sum + parseInt(r.unique_users || 0), 0);

      const oil = result.find(r => r.fuel_type === 'heating_oil');
      const propane = result.find(r => r.fuel_type === 'propane');

      const oilUsers = parseInt(oil?.unique_users || 0);
      const propaneUsers = parseInt(propane?.unique_users || 0);

      return {
        oil: {
          users: oilUsers,
          pct: totalUsers > 0 ? ((oilUsers / totalUsers) * 100).toFixed(1) : 0
        },
        propane: {
          users: propaneUsers,
          pct: totalUsers > 0 ? ((propaneUsers / totalUsers) * 100).toFixed(1) : 0
        }
      };
    } catch (error) {
      this.logger.error('[UnifiedAnalytics] Fuel type breakdown error:', error.message);
      return { oil: { users: 0, pct: 0 }, propane: { users: 0, pct: 0 } };
    }
  }

  /**
   * Get unified overview combining all data sources
   * @param {number} days - Number of days to look back
   */
  async getUnifiedOverview(days = 7) {
    try {
      const [website, app, backend, retention, android, fuelType, deliveries, fve, confidence, trends] = await Promise.all([
        this.getWebsiteMetrics(days),
        this.getAppMetrics(days),
        this.getBackendMetrics(days),
        this.getRetentionAnalysis(6),
        this.getAndroidDecisionSignals(),
        this.getFuelTypeBreakdown(days),
        this.getDeliveryPatterns(days),
        this.getFVEMetrics(days),
        this.getConfidenceScore(days),
        this.getTrendData(days)
      ]);

      // Determine data sources
      const isBigQuery = app.source === 'bigquery';
      const isFirebaseDb = app.available && app.source === 'database';

      // Add fuel type, delivery, FVE, and confidence data to app section
      const appData = app.data || {};
      appData.fuelType = fuelType;
      appData.deliveries = deliveries;
      appData.fve = fve;
      appData.confidence = confidence;

      // Add click data to website section
      const websiteData = website.data || {};
      try {
        const [clicks] = await this.sequelize.query(`
          SELECT
            COUNT(*) as total_clicks,
            COUNT(*) FILTER (WHERE action_type = 'call') as call_clicks,
            COUNT(*) FILTER (WHERE action_type = 'website') as website_clicks
          FROM supplier_clicks
          WHERE created_at > NOW() - INTERVAL '${days} days'
        `, { type: this.sequelize.QueryTypes.SELECT });
        websiteData.totalClicks = parseInt(clicks[0]?.total_clicks) || 0;
        websiteData.callClicks = parseInt(clicks[0]?.call_clicks) || 0;
        websiteData.websiteClicks = parseInt(clicks[0]?.website_clicks) || 0;
      } catch (e) {
        this.logger.error('[UnifiedAnalytics] Click data error:', e.message);
      }

      // Add BigQuery-based behavior retention if available
      const retentionData = retention.data || {};
      if (isBigQuery && app.data?.topEvents) {
        // Calculate behavior retention from BigQuery events
        const events = app.data.topEvents;
        const totalUsers = app.data.summary?.totalUsers || 1;

        const tankUsers = events.find(e => e.name === 'tank_reading')?.uniqueUsers || 0;
        const directoryUsers = events.find(e => e.name === 'directory_viewed')?.uniqueUsers || 0;
        const deliveryUsers = events.find(e => e.name === 'delivery_logged')?.uniqueUsers || 0;

        // Day-7 retention from BigQuery
        const day7Rate = parseFloat(app.data.retention?.day7Rate) || 0;

        // Estimate behavior-specific retention (users who perform actions typically retain better)
        retentionData.behaviorRetention = [
          { behavior: 'logged_delivery', userCount: deliveryUsers, avgActiveDays: deliveryUsers > 0 ? day7Rate * 1.5 : 0 },
          { behavior: 'set_up_tank', userCount: tankUsers, avgActiveDays: tankUsers > 0 ? day7Rate * 1.3 : 0 },
          { behavior: 'searched_supplier', userCount: directoryUsers, avgActiveDays: directoryUsers > 0 ? day7Rate * 1.1 : 0 },
          { behavior: 'browsed_only', userCount: Math.max(0, totalUsers - tankUsers - directoryUsers), avgActiveDays: day7Rate * 0.5 }
        ];
      }

      // Calculate iOS user trend from DAU data if available
      const allTrends = { ...trends };
      if (appData.dailyActiveUsers && appData.dailyActiveUsers.length >= 14) {
        const dau = appData.dailyActiveUsers;
        // First half (recent) vs second half (older)
        const halfPoint = Math.floor(dau.length / 2);
        const recentSum = dau.slice(0, halfPoint).reduce((s, d) => s + d.users, 0);
        const olderSum = dau.slice(halfPoint).reduce((s, d) => s + d.users, 0);
        allTrends.iosUsers = this.calculateTrend(recentSum, olderSum);
      }

      // Website users trend from GA4 if we had previous period (estimate from session data)
      if (websiteData.activeUsers) {
        // We don't have previous period GA4 data easily, so mark as flat for now
        allTrends.websiteUsers = { direction: 'flat', percent: 0, display: '—' };
      }

      return {
        period: `${days}d`,
        dataSources: {
          ga4: website.available,
          firebase: app.available,
          bigquery: isBigQuery,
          database: backend.available
        },
        website: websiteData,
        app: appData,
        appSource: app.source || 'none',
        backend: backend.data,
        retention: retentionData,
        android: android.data,
        trends: allTrends,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('[UnifiedAnalytics] Unified overview error:', error.message);
      throw error;
    }
  }
}

module.exports = UnifiedAnalytics;
