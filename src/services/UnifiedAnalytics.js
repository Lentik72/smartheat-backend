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
      // Calculate confidence based on user engagement from supplier_clicks + supplier_engagements
      const [engagement] = await this.sequelize.query(`
        WITH all_user_activity AS (
          -- Web clicks
          SELECT ip_address as user_id, created_at, supplier_id, 'web' as source
          FROM supplier_clicks
          WHERE created_at > NOW() - INTERVAL '${days} days'
            AND ip_address IS NOT NULL
          UNION ALL
          -- App engagements
          SELECT ip_hash as user_id, created_at, supplier_id, 'app' as source
          FROM supplier_engagements
          WHERE created_at > NOW() - INTERVAL '${days} days'
            AND ip_hash IS NOT NULL
        ),
        user_stats AS (
          SELECT
            user_id,
            COUNT(*) as total_actions,
            COUNT(DISTINCT supplier_id) as suppliers_compared,
            COUNT(DISTINCT DATE(created_at)) as active_days,
            COUNT(DISTINCT source) as platforms_used
          FROM all_user_activity
          GROUP BY user_id
        ),
        user_scores AS (
          SELECT
            user_id,
            -- Score: actions (max 30) + suppliers (max 30) + days (max 20) + multi-platform (20)
            LEAST(total_actions * 2, 30) +
            LEAST(suppliers_compared * 5, 30) +
            LEAST(active_days * 5, 20) +
            CASE WHEN platforms_used > 1 THEN 20 ELSE 0 END as score
          FROM user_stats
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
      // FVE = First Value Event = first supplier click/engagement
      // Calculate from supplier_clicks + supplier_engagements
      const [fveStats] = await this.sequelize.query(`
        WITH all_activity AS (
          SELECT ip_address as user_id, created_at
          FROM supplier_clicks
          WHERE created_at > NOW() - INTERVAL '${days} days'
            AND ip_address IS NOT NULL
          UNION ALL
          SELECT ip_hash as user_id, created_at
          FROM supplier_engagements
          WHERE created_at > NOW() - INTERVAL '${days} days'
            AND ip_hash IS NOT NULL
        ),
        user_first_action AS (
          SELECT user_id, MIN(created_at) as first_action
          FROM all_activity
          GROUP BY user_id
        ),
        returning_users AS (
          SELECT DISTINCT a.user_id
          FROM all_activity a
          JOIN user_first_action f ON a.user_id = f.user_id
          WHERE a.created_at > f.first_action + INTERVAL '3 days'
        )
        SELECT
          (SELECT COUNT(*) FROM user_first_action) as total_users,
          (SELECT COUNT(*) FROM returning_users) as returning_users
      `, { type: this.sequelize.QueryTypes.SELECT });

      const stats = fveStats[0] || {};
      const totalUsers = parseInt(stats.total_users) || 0;
      const returningUsers = parseInt(stats.returning_users) || 0;

      // FVE completion = users who took any action (all users in this context are FVE users)
      const completionRate = totalUsers > 0 ? 100 : 0;
      const retentionRate = totalUsers > 0 ? ((returningUsers / totalUsers) * 100).toFixed(0) : 0;

      return {
        completionRate: `${completionRate}%`,
        within72h: `${completionRate}%`, // All FVE users by definition
        userRetention: `${retentionRate}%`,
        nonUserRetention: '0%',
        multiplier: returningUsers > 0 ? `${(retentionRate / 10).toFixed(1)}×` : '--'
      };
    } catch (error) {
      this.logger.error('[UnifiedAnalytics] FVE metrics error:', error.message);
      return {
        completionRate: '--',
        within72h: '--',
        userRetention: '--',
        nonUserRetention: '--',
        multiplier: '--'
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
   * Get top suppliers by engagement (clicks, calls) from BOTH web and app
   * @param {number} days - Number of days to look back
   * @param {number} limit - Max suppliers to return
   */
  async getTopSuppliers(days = 30, limit = 30) {
    try {
      const results = await this.sequelize.query(`
        WITH all_engagements AS (
          -- Website clicks
          SELECT
            supplier_id,
            supplier_name,
            action_type,
            ip_address,
            'web' as source
          FROM supplier_clicks
          WHERE created_at > NOW() - INTERVAL '${days} days'
          UNION ALL
          -- iOS app engagements
          SELECT
            supplier_id,
            supplier_name,
            engagement_type as action_type,
            ip_hash as ip_address,
            'app' as source
          FROM supplier_engagements
          WHERE created_at > NOW() - INTERVAL '${days} days'
        ),
        latest_prices AS (
          SELECT DISTINCT ON (supplier_id) supplier_id, price_per_gallon
          FROM supplier_prices
          WHERE is_valid = true
          ORDER BY supplier_id, scraped_at DESC
        ),
        market_avg AS (
          SELECT COALESCE(AVG(price_per_gallon), 0) as avg_price
          FROM latest_prices
        )
        SELECT
          s.id,
          s.name,
          s.city,
          s.state,
          COUNT(*) as total_clicks,
          -- Action type breakdown (what the user did)
          COUNT(*) FILTER (WHERE ae.action_type = 'call') as calls,
          COUNT(*) FILTER (WHERE ae.action_type = 'website') as website_clicks,
          COUNT(*) FILTER (WHERE ae.action_type NOT IN ('call', 'website')) as other_clicks,
          COUNT(DISTINCT ae.ip_address) as unique_users,
          -- Source breakdown (where it came from)
          COUNT(*) FILTER (WHERE ae.source = 'web') as from_web,
          COUNT(*) FILTER (WHERE ae.source = 'app') as from_app,
          lp.price_per_gallon as price,
          ma.avg_price as market_avg,
          CASE
            WHEN lp.price_per_gallon IS NOT NULL
            THEN ROUND((lp.price_per_gallon - ma.avg_price)::numeric, 2)
            ELSE NULL
          END as price_delta,
          CASE
            WHEN lp.price_per_gallon IS NULL THEN 'data_gap'
            WHEN COUNT(*) >= 20 AND lp.price_per_gallon > ma.avg_price THEN 'brand_strength'
            WHEN COUNT(*) < 10 AND lp.price_per_gallon < ma.avg_price THEN 'visibility_issue'
            ELSE 'normal'
          END as signal
        FROM all_engagements ae
        JOIN suppliers s ON ae.supplier_id = s.id
        CROSS JOIN market_avg ma
        LEFT JOIN latest_prices lp ON s.id = lp.supplier_id
        GROUP BY s.id, s.name, s.city, s.state, lp.price_per_gallon, ma.avg_price
        ORDER BY total_clicks DESC
        ${limit > 0 ? `LIMIT ${limit}` : ''}
      `, { type: this.sequelize.QueryTypes.SELECT });

      return results.map((r, index) => ({
        rank: index + 1,
        id: r.id,
        name: r.name,
        location: r.city && r.state ? `${r.city}, ${r.state}` : r.state || '--',
        totalClicks: parseInt(r.total_clicks) || 0,
        // Action breakdown (what user did) - these should add up to total
        calls: parseInt(r.calls) || 0,           // clicked call button
        websiteClicks: parseInt(r.website_clicks) || 0,  // clicked website link
        otherClicks: parseInt(r.other_clicks) || 0,      // view, save, etc.
        uniqueUsers: parseInt(r.unique_users) || 0,
        // Source breakdown (where it came from)
        fromWeb: parseInt(r.from_web) || 0,      // from website
        fromApp: parseInt(r.from_app) || 0,      // from iOS app
        price: r.price ? parseFloat(r.price) : null,
        marketAvg: r.market_avg ? parseFloat(r.market_avg) : null,
        priceDelta: r.price_delta ? parseFloat(r.price_delta) : null,
        signal: r.signal || 'normal'
      }));
    } catch (error) {
      this.logger.error('[UnifiedAnalytics] Top suppliers error:', error.message);
      return [];
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
   * Get price vs clicks correlation analysis
   * Analyzes how price changes correlate with engagement
   * @param {number} days - Number of days to analyze
   */
  async getPriceCorrelation(days = 30) {
    try {
      // Get daily average price and click counts (web + app combined)
      const results = await this.sequelize.query(`
        WITH daily_prices AS (
          SELECT
            DATE(scraped_at) as date,
            AVG(price_per_gallon) as avg_price,
            MIN(price_per_gallon) as min_price,
            MAX(price_per_gallon) as max_price,
            COUNT(DISTINCT supplier_id) as suppliers_with_price
          FROM supplier_prices
          WHERE scraped_at > NOW() - INTERVAL '${days} days'
            AND is_valid = true
          GROUP BY DATE(scraped_at)
        ),
        all_engagements AS (
          -- Web clicks
          SELECT created_at, action_type, ip_address, 'web' as source
          FROM supplier_clicks
          WHERE created_at > NOW() - INTERVAL '${days} days'
          UNION ALL
          -- App engagements
          SELECT created_at, engagement_type as action_type, ip_hash as ip_address, 'app' as source
          FROM supplier_engagements
          WHERE created_at > NOW() - INTERVAL '${days} days'
        ),
        daily_clicks AS (
          SELECT
            DATE(created_at) as date,
            COUNT(*) as total_clicks,
            COUNT(*) FILTER (WHERE action_type = 'call') as calls,
            COUNT(*) FILTER (WHERE action_type = 'website') as website_clicks,
            COUNT(DISTINCT ip_address) as unique_users,
            COUNT(*) FILTER (WHERE source = 'web') as web_clicks,
            COUNT(*) FILTER (WHERE source = 'app') as app_clicks
          FROM all_engagements
          GROUP BY DATE(created_at)
        )
        SELECT
          COALESCE(p.date, c.date) as date,
          p.avg_price,
          p.min_price,
          p.max_price,
          COALESCE(c.total_clicks, 0) as total_clicks,
          COALESCE(c.calls, 0) as calls,
          COALESCE(c.website_clicks, 0) as website_clicks,
          COALESCE(c.unique_users, 0) as unique_users
        FROM daily_prices p
        FULL OUTER JOIN daily_clicks c ON p.date = c.date
        WHERE COALESCE(p.date, c.date) IS NOT NULL
        ORDER BY date ASC
      `, { type: this.sequelize.QueryTypes.SELECT });

      // Calculate correlation coefficient
      const data = results.filter(r => r.avg_price && r.total_clicks);

      if (data.length < 3) {
        return {
          correlation: null,
          insight: 'Not enough data points for correlation analysis',
          dailyData: results.map(r => ({
            date: r.date,
            avgPrice: r.avg_price ? parseFloat(r.avg_price).toFixed(2) : null,
            minPrice: r.min_price ? parseFloat(r.min_price).toFixed(2) : null,
            maxPrice: r.max_price ? parseFloat(r.max_price).toFixed(2) : null,
            totalClicks: parseInt(r.total_clicks) || 0,
            calls: parseInt(r.calls) || 0,
            websiteClicks: parseInt(r.website_clicks) || 0,
            uniqueUsers: parseInt(r.unique_users) || 0
          }))
        };
      }

      // Pearson correlation calculation
      const prices = data.map(d => parseFloat(d.avg_price));
      const clicks = data.map(d => parseInt(d.total_clicks));

      const n = prices.length;
      const sumX = prices.reduce((a, b) => a + b, 0);
      const sumY = clicks.reduce((a, b) => a + b, 0);
      const sumXY = prices.reduce((sum, x, i) => sum + x * clicks[i], 0);
      const sumX2 = prices.reduce((sum, x) => sum + x * x, 0);
      const sumY2 = clicks.reduce((sum, y) => sum + y * y, 0);

      const numerator = (n * sumXY) - (sumX * sumY);
      const denominator = Math.sqrt(((n * sumX2) - (sumX * sumX)) * ((n * sumY2) - (sumY * sumY)));

      const correlation = denominator !== 0 ? numerator / denominator : 0;

      // Generate insight based on correlation
      let insight = '';
      if (correlation < -0.5) {
        insight = '📉 Strong negative correlation: When prices drop, clicks increase significantly. Users are price-sensitive!';
      } else if (correlation < -0.2) {
        insight = '📊 Moderate negative correlation: Lower prices tend to drive more engagement.';
      } else if (correlation > 0.5) {
        insight = '📈 Strong positive correlation: Clicks increase with prices - possibly seasonal demand driving both.';
      } else if (correlation > 0.2) {
        insight = '📊 Moderate positive correlation: Higher engagement when prices are up - users checking prices more.';
      } else {
        insight = '➡️ No significant correlation between price and clicks. Other factors may be driving engagement.';
      }

      return {
        correlation: parseFloat(correlation.toFixed(3)),
        insight,
        dailyData: results.map(r => ({
          date: r.date,
          avgPrice: r.avg_price ? parseFloat(r.avg_price).toFixed(2) : null,
          minPrice: r.min_price ? parseFloat(r.min_price).toFixed(2) : null,
          maxPrice: r.max_price ? parseFloat(r.max_price).toFixed(2) : null,
          totalClicks: parseInt(r.total_clicks) || 0,
          calls: parseInt(r.calls) || 0,
          websiteClicks: parseInt(r.website_clicks) || 0,
          uniqueUsers: parseInt(r.unique_users) || 0
        }))
      };
    } catch (error) {
      this.logger.error('[UnifiedAnalytics] Price correlation error:', error.message);
      return { correlation: null, insight: 'Error calculating correlation', dailyData: [] };
    }
  }

  /**
   * Get weather vs clicks correlation analysis
   * Stores daily temps for historical tracking
   * @param {number} days - Number of days to analyze
   */
  async getWeatherCorrelation(days = 30) {
    try {
      // Ensure weather_history table exists
      await this.sequelize.query(`
        CREATE TABLE IF NOT EXISTS weather_history (
          id SERIAL PRIMARY KEY,
          date DATE UNIQUE NOT NULL,
          temp_high NUMERIC(5,2),
          temp_low NUMERIC(5,2),
          temp_avg NUMERIC(5,2),
          conditions VARCHAR(50),
          location VARCHAR(100) DEFAULT 'Hartford, CT',
          created_at TIMESTAMP DEFAULT NOW()
        )
      `).catch(() => {}); // Ignore if exists

      const weatherApiKey = process.env.OPENWEATHER_API_KEY;
      let currentTemp = null;
      let conditions = null;

      // Fetch and store current weather
      if (weatherApiKey) {
        try {
          const axios = require('axios');
          // Hartford, CT coordinates (center of Northeast coverage area)
          const lat = 41.7658;
          const lon = -72.6734;

          const currentWeather = await axios.get(
            `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=imperial&appid=${weatherApiKey}`
          );

          currentTemp = currentWeather.data.main.temp;
          const tempHigh = currentWeather.data.main.temp_max;
          const tempLow = currentWeather.data.main.temp_min;
          conditions = currentWeather.data.weather[0].main;

          // Store today's weather (upsert)
          await this.sequelize.query(`
            INSERT INTO weather_history (date, temp_high, temp_low, temp_avg, conditions)
            VALUES (CURRENT_DATE, $1, $2, $3, $4)
            ON CONFLICT (date) DO UPDATE SET
              temp_high = GREATEST(weather_history.temp_high, $1),
              temp_low = LEAST(weather_history.temp_low, $2),
              temp_avg = $3,
              conditions = $4
          `, { bind: [tempHigh, tempLow, currentTemp, conditions] });
        } catch (apiError) {
          this.logger.error('[UnifiedAnalytics] Weather API error:', apiError.message);
        }
      }

      // Get daily data with weather history (web + app combined)
      const dailyData = await this.sequelize.query(`
        WITH all_engagements AS (
          -- Web clicks
          SELECT created_at, ip_address, 'web' as source
          FROM supplier_clicks
          WHERE created_at > NOW() - INTERVAL '${days} days'
          UNION ALL
          -- App engagements
          SELECT created_at, ip_hash as ip_address, 'app' as source
          FROM supplier_engagements
          WHERE created_at > NOW() - INTERVAL '${days} days'
        ),
        click_data AS (
          SELECT
            DATE(created_at) as date,
            COUNT(*) as total_clicks,
            COUNT(DISTINCT ip_address) as unique_users,
            COUNT(*) FILTER (WHERE source = 'web') as web_clicks,
            COUNT(*) FILTER (WHERE source = 'app') as app_clicks
          FROM all_engagements
          GROUP BY DATE(created_at)
        ),
        date_series AS (
          SELECT generate_series(
            CURRENT_DATE - INTERVAL '${days} days',
            CURRENT_DATE,
            '1 day'::interval
          )::date as date
        )
        SELECT
          ds.date,
          COALESCE(cd.total_clicks, 0) as total_clicks,
          COALESCE(cd.unique_users, 0) as unique_users,
          COALESCE(cd.web_clicks, 0) as web_clicks,
          COALESCE(cd.app_clicks, 0) as app_clicks,
          wh.temp_avg as temperature,
          wh.temp_high,
          wh.temp_low,
          wh.conditions
        FROM date_series ds
        LEFT JOIN click_data cd ON ds.date = cd.date
        LEFT JOIN weather_history wh ON ds.date = wh.date
        ORDER BY ds.date ASC
      `, { type: this.sequelize.QueryTypes.SELECT });

      // Calculate correlation if we have enough weather data
      const dataWithWeather = dailyData.filter(d => d.temperature && d.total_clicks > 0);
      let correlation = null;

      if (dataWithWeather.length >= 5) {
        const temps = dataWithWeather.map(d => parseFloat(d.temperature));
        const clicks = dataWithWeather.map(d => parseInt(d.total_clicks));

        const n = temps.length;
        const sumX = temps.reduce((a, b) => a + b, 0);
        const sumY = clicks.reduce((a, b) => a + b, 0);
        const sumXY = temps.reduce((sum, x, i) => sum + x * clicks[i], 0);
        const sumX2 = temps.reduce((sum, x) => sum + x * x, 0);
        const sumY2 = clicks.reduce((sum, y) => sum + y * y, 0);

        const numerator = (n * sumXY) - (sumX * sumY);
        const denominator = Math.sqrt(((n * sumX2) - (sumX * sumX)) * ((n * sumY2) - (sumY * sumY)));
        correlation = denominator !== 0 ? numerator / denominator : 0;
      }

      // Generate insight
      let insight = '';
      if (currentTemp !== null) {
        if (currentTemp < 40) {
          insight = `🥶 Current: ${currentTemp.toFixed(0)}°F - Cold weather drives heating oil demand.`;
        } else if (currentTemp < 55) {
          insight = `🍂 Current: ${currentTemp.toFixed(0)}°F - Moderate temps, steady engagement.`;
        } else {
          insight = `☀️ Current: ${currentTemp.toFixed(0)}°F - Warm weather, lower demand expected.`;
        }

        if (correlation !== null) {
          if (correlation < -0.3) {
            insight += ` 📊 Correlation: ${correlation.toFixed(2)} (colder = more clicks)`;
          } else if (correlation > 0.3) {
            insight += ` 📊 Correlation: ${correlation.toFixed(2)} (warmer = more clicks?)`;
          }
        } else if (dataWithWeather.length < 5) {
          insight += ` (${dataWithWeather.length}/5 days of weather data - building history...)`;
        }
      } else if (!weatherApiKey) {
        insight = 'Set OPENWEATHER_API_KEY to enable weather tracking.';
      }

      return {
        available: currentTemp !== null,
        currentTemp: currentTemp?.toFixed(0) || null,
        conditions,
        correlation: correlation ? parseFloat(correlation.toFixed(3)) : null,
        insight,
        daysWithWeather: dataWithWeather.length,
        dailyData: dailyData.map(r => ({
          date: r.date,
          totalClicks: parseInt(r.total_clicks) || 0,
          uniqueUsers: parseInt(r.unique_users) || 0,
          webClicks: parseInt(r.web_clicks) || 0,
          appClicks: parseInt(r.app_clicks) || 0,
          temperature: r.temperature ? parseFloat(r.temperature) : null,
          tempHigh: r.temp_high ? parseFloat(r.temp_high) : null,
          tempLow: r.temp_low ? parseFloat(r.temp_low) : null,
          conditions: r.conditions
        }))
      };
    } catch (error) {
      this.logger.error('[UnifiedAnalytics] Weather correlation error:', error.message);
      return { available: false, message: 'Error fetching data', dailyData: [] };
    }
  }

  /**
   * Get onboarding funnel data from BigQuery
   * @param {number} days - Number of days to look back
   */
  async getOnboardingFunnel(days = 30) {
    await this.initBigQuery();

    if (!this.bigQueryClient) {
      return null;
    }

    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const startDateStr = startDate.toISOString().split('T')[0].replace(/-/g, '');
      const endDateStr = endDate.toISOString().split('T')[0].replace(/-/g, '');

      const [result] = await this.bigQueryClient.query({
        query: `
          WITH funnel_events AS (
            SELECT
              user_pseudo_id,
              event_name,
              TIMESTAMP_MICROS(event_timestamp) as event_time
            FROM \`${this.bigQueryProject}.${this.bigQueryDataset}.events_*\`
            WHERE _TABLE_SUFFIX BETWEEN '${startDateStr}' AND '${endDateStr}'
              AND event_name IN ('first_open', 'onboarding_step', 'onboarding_complete',
                                 'directory_viewed', 'forecast_viewed', 'tank_reading',
                                 'feature_used', 'session_start')
          )
          SELECT
            COUNT(DISTINCT CASE WHEN event_name = 'first_open' THEN user_pseudo_id END) as installs,
            COUNT(DISTINCT CASE WHEN event_name = 'onboarding_step' THEN user_pseudo_id END) as started_onboarding,
            COUNT(DISTINCT CASE WHEN event_name = 'onboarding_complete' THEN user_pseudo_id END) as completed_onboarding,
            COUNT(DISTINCT CASE WHEN event_name = 'directory_viewed' THEN user_pseudo_id END) as searched_supplier,
            COUNT(DISTINCT CASE WHEN event_name = 'forecast_viewed' THEN user_pseudo_id END) as viewed_forecast,
            COUNT(DISTINCT CASE WHEN event_name = 'tank_reading' THEN user_pseudo_id END) as logged_tank,
            COUNT(DISTINCT CASE WHEN event_name = 'feature_used' THEN user_pseudo_id END) as used_feature,
            COUNT(DISTINCT user_pseudo_id) as total_users
          FROM funnel_events
        `
      });

      const data = result[0] || {};
      const installs = parseInt(data.installs) || 0;
      const startedOnboarding = parseInt(data.started_onboarding) || 0;
      const completedOnboarding = parseInt(data.completed_onboarding) || 0;
      const searchedSupplier = parseInt(data.searched_supplier) || 0;
      const viewedForecast = parseInt(data.viewed_forecast) || 0;
      const loggedTank = parseInt(data.logged_tank) || 0;

      // If no onboarding_complete event, estimate from onboarding_step
      const effectiveCompleted = completedOnboarding > 0 ? completedOnboarding : startedOnboarding;

      // First value event = any meaningful action after install
      const firstValueUsers = Math.max(searchedSupplier, viewedForecast, loggedTank);

      return {
        steps: [
          { name: 'Install', count: installs, percent: 100 },
          { name: 'Start Onboarding', count: startedOnboarding, percent: installs > 0 ? Math.round((startedOnboarding / installs) * 100) : 0 },
          { name: 'Complete Onboarding', count: effectiveCompleted, percent: installs > 0 ? Math.round((effectiveCompleted / installs) * 100) : 0 },
          { name: 'First Value Action', count: firstValueUsers, percent: installs > 0 ? Math.round((firstValueUsers / installs) * 100) : 0 }
        ],
        summary: {
          installs,
          onboardingRate: installs > 0 ? ((effectiveCompleted / installs) * 100).toFixed(1) : 0,
          activationRate: installs > 0 ? ((firstValueUsers / installs) * 100).toFixed(1) : 0
        }
      };
    } catch (error) {
      this.logger.error('[UnifiedAnalytics] Onboarding funnel error:', error.message);
      return null;
    }
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
  async getFuelTypeBreakdown(days = 30) {
    try {
      // Try multiple sources for fuel type data
      let result = [];

      // Source 1: onboarding_steps (users who selected fuel type during onboarding)
      try {
        const onboardingData = await this.sequelize.query(`
          SELECT
            COALESCE(fuel_type, 'heating_oil') as fuel_type,
            COUNT(DISTINCT ip_hash) as unique_users
          FROM onboarding_steps
          WHERE created_at > NOW() - INTERVAL '${days} days'
            AND fuel_type IS NOT NULL
          GROUP BY fuel_type
        `, { type: this.sequelize.QueryTypes.SELECT });
        if (onboardingData.length > 0) result = onboardingData;
      } catch (e) {
        this.logger.debug('[UnifiedAnalytics] onboarding_steps query failed:', e.message);
      }

      // Source 2: app_events (if onboarding didn't have data)
      if (result.length === 0) {
        try {
          const appEventsData = await this.sequelize.query(`
            SELECT
              COALESCE(fuel_type, 'heating_oil') as fuel_type,
              COUNT(DISTINCT device_id_hash) as unique_users
            FROM app_events
            WHERE created_at > NOW() - INTERVAL '${days} days'
              AND fuel_type IS NOT NULL
            GROUP BY fuel_type
          `, { type: this.sequelize.QueryTypes.SELECT });
          if (appEventsData.length > 0) result = appEventsData;
        } catch (e) {
          this.logger.debug('[UnifiedAnalytics] app_events query failed:', e.message);
        }
      }

      // Source 3: supplier_engagements (has fuel_type column)
      if (result.length === 0) {
        try {
          const engagementsData = await this.sequelize.query(`
            SELECT
              COALESCE(fuel_type, 'heating_oil') as fuel_type,
              COUNT(DISTINCT ip_hash) as unique_users
            FROM supplier_engagements
            WHERE created_at > NOW() - INTERVAL '${days} days'
            GROUP BY COALESCE(fuel_type, 'heating_oil')
          `, { type: this.sequelize.QueryTypes.SELECT });
          if (engagementsData.length > 0) result = engagementsData;
        } catch (e) {
          this.logger.debug('[UnifiedAnalytics] supplier_engagements query failed:', e.message);
        }
      }

      const totalUsers = result.reduce((sum, r) => sum + parseInt(r.unique_users || 0), 0);

      const oil = result.find(r => r.fuel_type === 'heating_oil');
      const propane = result.find(r => r.fuel_type === 'propane');

      const oilUsers = parseInt(oil?.unique_users || 0);
      const propaneUsers = parseInt(propane?.unique_users || 0);

      // If no data from any source, return placeholder
      if (totalUsers === 0) {
        return {
          oil: { users: 'N/A', pct: '--' },
          propane: { users: 'N/A', pct: '--' },
          noData: true
        };
      }

      return {
        oil: {
          users: oilUsers,
          pct: totalUsers > 0 ? ((oilUsers / totalUsers) * 100).toFixed(0) : 0
        },
        propane: {
          users: propaneUsers,
          pct: totalUsers > 0 ? ((propaneUsers / totalUsers) * 100).toFixed(0) : 0
        }
      };
    } catch (error) {
      this.logger.error('[UnifiedAnalytics] Fuel type breakdown error:', error.message);
      return { oil: { users: 'N/A', pct: '--' }, propane: { users: 'N/A', pct: '--' }, noData: true };
    }
  }

  /**
   * Get unified overview combining all data sources
   * @param {number} days - Number of days to look back
   */
  async getUnifiedOverview(days = 7) {
    try {
      const [website, app, backend, retention, android, fuelType, deliveries, fve, confidence, trends, onboardingFunnel, topSuppliers, priceCorrelation, weatherCorrelation, cohortRetention, geoHeatmap] = await Promise.all([
        this.getWebsiteMetrics(days),
        this.getAppMetrics(days),
        this.getBackendMetrics(days),
        this.getRetentionAnalysis(6),
        this.getAndroidDecisionSignals(),
        this.getFuelTypeBreakdown(days),
        this.getDeliveryPatterns(days),
        this.getFVEMetrics(days),
        this.getConfidenceScore(days),
        this.getTrendData(days),
        this.getOnboardingFunnel(days),
        this.getTopSuppliers(days, 0),  // 0 = no limit, show all suppliers with activity
        this.getPriceCorrelation(days),
        this.getWeatherCorrelation(days),
        this.getCohortRetention(days).catch(e => { this.logger.error('[UnifiedAnalytics] Cohort retention failed:', e.message, e.stack); return { available: false, error: e.message }; }),
        this.getGeographicHeatmap(days).catch(e => { this.logger.error('[UnifiedAnalytics] Geographic heatmap failed:', e.message, e.stack); return { available: false, error: e.message }; })
      ]);

      // Determine data sources
      const isBigQuery = app.source === 'bigquery';
      const isFirebaseDb = app.available && app.source === 'database';

      // Add fuel type, delivery, FVE, confidence, and onboarding data to app section
      const appData = app.data || {};
      appData.fuelType = fuelType;
      appData.deliveries = deliveries;
      appData.fve = fve;
      appData.confidence = confidence;
      appData.onboardingFunnel = onboardingFunnel;

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
        topSuppliers,
        correlations: {
          price: priceCorrelation,
          weather: weatherCorrelation
        },
        cohortRetention,
        geoHeatmap,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('[UnifiedAnalytics] Unified overview error:', error.message);
      throw error;
    }
  }

  /**
   * Get Day 1/7/30 cohort retention analysis
   * @param {number} days - Lookback period for cohorts
   */
  async getCohortRetention(days = 30) {
    try {
      // Get retention by cohort week with Day 1, 7, 30 breakdown
      const [cohortData] = await this.sequelize.query(`
        WITH all_activity AS (
          SELECT ip_address as user_id, created_at::date as activity_date, 'web' as source
          FROM supplier_clicks
          WHERE ip_address IS NOT NULL
          UNION ALL
          SELECT ip_hash as user_id, created_at::date as activity_date, 'app' as source
          FROM supplier_engagements
          WHERE ip_hash IS NOT NULL
        ),
        user_first_activity AS (
          SELECT
            user_id,
            MIN(activity_date) as cohort_date
          FROM all_activity
          GROUP BY user_id
        ),
        user_activity_days AS (
          SELECT
            ufa.user_id,
            ufa.cohort_date,
            aa.activity_date,
            (aa.activity_date - ufa.cohort_date) as days_since_cohort
          FROM user_first_activity ufa
          JOIN all_activity aa ON ufa.user_id = aa.user_id
          WHERE ufa.cohort_date >= NOW()::date - INTERVAL '${days} days'
        ),
        cohort_retention AS (
          SELECT
            cohort_date,
            COUNT(DISTINCT user_id) as cohort_size,
            COUNT(DISTINCT CASE WHEN days_since_cohort = 1 THEN user_id END) as day1_retained,
            COUNT(DISTINCT CASE WHEN days_since_cohort = 7 THEN user_id END) as day7_retained,
            COUNT(DISTINCT CASE WHEN days_since_cohort = 30 THEN user_id END) as day30_retained,
            COUNT(DISTINCT CASE WHEN days_since_cohort BETWEEN 1 AND 7 THEN user_id END) as week1_active
          FROM user_activity_days
          GROUP BY cohort_date
          ORDER BY cohort_date DESC
        )
        SELECT
          cohort_date,
          cohort_size,
          day1_retained,
          day7_retained,
          day30_retained,
          week1_active,
          CASE WHEN cohort_size > 0 THEN ROUND((day1_retained::numeric / cohort_size * 100), 1) ELSE 0 END as day1_rate,
          CASE WHEN cohort_size > 0 THEN ROUND((day7_retained::numeric / cohort_size * 100), 1) ELSE 0 END as day7_rate,
          CASE WHEN cohort_size > 0 THEN ROUND((day30_retained::numeric / cohort_size * 100), 1) ELSE 0 END as day30_rate
        FROM cohort_retention
        WHERE cohort_size >= 1
      `, { type: this.sequelize.QueryTypes.SELECT });

      // Calculate overall retention rates
      const totalUsers = cohortData.reduce((sum, c) => sum + parseInt(c.cohort_size || 0), 0);
      const totalDay1 = cohortData.reduce((sum, c) => sum + parseInt(c.day1_retained || 0), 0);
      const totalDay7 = cohortData.reduce((sum, c) => sum + parseInt(c.day7_retained || 0), 0);
      const totalDay30 = cohortData.reduce((sum, c) => sum + parseInt(c.day30_retained || 0), 0);

      // Build retention curve data in a single efficient query
      const [curveData] = await this.sequelize.query(`
        WITH all_activity AS (
          SELECT ip_address as user_id, created_at::date as activity_date
          FROM supplier_clicks WHERE ip_address IS NOT NULL
          UNION ALL
          SELECT ip_hash as user_id, created_at::date as activity_date
          FROM supplier_engagements WHERE ip_hash IS NOT NULL
        ),
        user_first AS (
          SELECT user_id, MIN(activity_date) as cohort_date
          FROM all_activity
          GROUP BY user_id
        ),
        day_retention AS (
          SELECT
            (aa.activity_date - uf.cohort_date) as days_since,
            COUNT(DISTINCT aa.user_id) as users
          FROM user_first uf
          JOIN all_activity aa ON uf.user_id = aa.user_id
          WHERE uf.cohort_date >= NOW()::date - INTERVAL '${days} days'
            AND (aa.activity_date - uf.cohort_date) BETWEEN 0 AND 30
          GROUP BY (aa.activity_date - uf.cohort_date)
        )
        SELECT days_since, users FROM day_retention ORDER BY days_since
      `, { type: this.sequelize.QueryTypes.SELECT });

      // Build curve array with all 31 days
      const curveMap = new Map(curveData.map(d => [parseInt(d.days_since), parseInt(d.users)]));
      const day0Users = curveMap.get(0) || 1;

      const normalizedCurve = [];
      for (let day = 0; day <= 30; day++) {
        const users = curveMap.get(day) || 0;
        normalizedCurve.push({
          day,
          rate: day0Users > 0 ? ((users / day0Users) * 100).toFixed(1) : '0'
        });
      }

      return {
        available: true,
        hasData: cohortData.length > 0,
        data: {
          cohorts: cohortData.map(c => ({
            date: c.cohort_date,
            size: parseInt(c.cohort_size),
            day1: { retained: parseInt(c.day1_retained), rate: parseFloat(c.day1_rate) },
            day7: { retained: parseInt(c.day7_retained), rate: parseFloat(c.day7_rate) },
            day30: { retained: parseInt(c.day30_retained), rate: parseFloat(c.day30_rate) }
          })),
          summary: {
            totalUsers,
            day1Rate: totalUsers > 0 ? ((totalDay1 / totalUsers) * 100).toFixed(1) : 0,
            day7Rate: totalUsers > 0 ? ((totalDay7 / totalUsers) * 100).toFixed(1) : 0,
            day30Rate: totalUsers > 0 ? ((totalDay30 / totalUsers) * 100).toFixed(1) : 0
          },
          curve: normalizedCurve
        }
      };
    } catch (error) {
      this.logger.error('[UnifiedAnalytics] Cohort retention error:', error.message);
      return { available: false, error: error.message };
    }
  }

  /**
   * Get geographic heatmap data based on ZIP codes
   * Falls back to supplier locations if no click-level ZIP data exists
   * @param {number} days - Lookback period
   */
  async getGeographicHeatmap(days = 30) {
    try {
      // Get engagement counts by ZIP code from both sources
      // Note: supplier_clicks uses zip_code, supplier_engagements uses user_zip
      const [zipData] = await this.sequelize.query(`
        WITH all_engagements AS (
          SELECT zip_code, COUNT(*) as engagements, COUNT(DISTINCT ip_address) as users
          FROM supplier_clicks
          WHERE created_at > NOW() - INTERVAL '${days} days'
            AND zip_code IS NOT NULL
          GROUP BY zip_code
          UNION ALL
          SELECT user_zip as zip_code, COUNT(*) as engagements, COUNT(DISTINCT ip_hash) as users
          FROM supplier_engagements
          WHERE created_at > NOW() - INTERVAL '${days} days'
            AND user_zip IS NOT NULL
          GROUP BY user_zip
        ),
        combined AS (
          SELECT
            zip_code,
            SUM(engagements) as total_engagements,
            SUM(users) as total_users
          FROM all_engagements
          GROUP BY zip_code
        )
        SELECT zip_code, total_engagements, total_users
        FROM combined
        WHERE total_engagements > 0
        ORDER BY total_engagements DESC
      `, { type: this.sequelize.QueryTypes.SELECT });

      // Also get user_locations data
      const [locationData] = await this.sequelize.query(`
        SELECT zip_code, COUNT(*) as searches
        FROM user_locations
        WHERE created_at > NOW() - INTERVAL '${days} days'
          AND zip_code IS NOT NULL
        GROUP BY zip_code
        ORDER BY searches DESC
      `, { type: this.sequelize.QueryTypes.SELECT });

      // If no ZIP data, fall back to supplier locations with their click counts
      let supplierLocationFallback = [];
      if (zipData.length === 0 && locationData.length === 0) {
        // First try: suppliers with clicks
        const [supplierData] = await this.sequelize.query(`
          WITH supplier_clicks_agg AS (
            SELECT supplier_id, COUNT(*) as clicks
            FROM supplier_clicks
            WHERE created_at > NOW() - INTERVAL '${days} days'
            GROUP BY supplier_id
          ),
          supplier_engagements_agg AS (
            SELECT supplier_id, COUNT(*) as engagements
            FROM supplier_engagements
            WHERE created_at > NOW() - INTERVAL '${days} days'
            GROUP BY supplier_id
          )
          SELECT
            s.id,
            s.name,
            s.city,
            s.state,
            -- Get first ZIP from postal_codes_served array
            CASE
              WHEN jsonb_array_length(s.postal_codes_served) > 0
              THEN s.postal_codes_served->>0
              ELSE NULL
            END as zip_code,
            COALESCE(sc.clicks, 0) + COALESCE(se.engagements, 0) as total_activity
          FROM suppliers s
          LEFT JOIN supplier_clicks_agg sc ON s.id::text = sc.supplier_id::text
          LEFT JOIN supplier_engagements_agg se ON s.id::text = se.supplier_id::text
          WHERE s.active = true
            AND jsonb_array_length(s.postal_codes_served) > 0
            AND (COALESCE(sc.clicks, 0) + COALESCE(se.engagements, 0)) > 0
          ORDER BY total_activity DESC
          LIMIT 100
        `, { type: this.sequelize.QueryTypes.SELECT });

        supplierLocationFallback = supplierData;

        // Second fallback: if no clicks at all, just show active suppliers
        if (supplierLocationFallback.length === 0) {
          const [allSuppliers] = await this.sequelize.query(`
            SELECT
              s.id,
              s.name,
              s.city,
              s.state,
              CASE
                WHEN jsonb_array_length(s.postal_codes_served) > 0
                THEN s.postal_codes_served->>0
                ELSE NULL
              END as zip_code,
              1 as total_activity
            FROM suppliers s
            WHERE s.active = true
              AND jsonb_array_length(s.postal_codes_served) > 0
            ORDER BY s.name
            LIMIT 100
          `, { type: this.sequelize.QueryTypes.SELECT });

          supplierLocationFallback = allSuppliers;
        }
      }

      // Merge location searches with engagement data
      const zipMap = new Map();

      for (const loc of locationData) {
        zipMap.set(loc.zip_code, {
          zip: loc.zip_code,
          searches: parseInt(loc.searches),
          engagements: 0,
          users: 0
        });
      }

      for (const eng of zipData) {
        if (zipMap.has(eng.zip_code)) {
          zipMap.get(eng.zip_code).engagements = parseInt(eng.total_engagements);
          zipMap.get(eng.zip_code).users = parseInt(eng.total_users);
        } else {
          zipMap.set(eng.zip_code, {
            zip: eng.zip_code,
            searches: 0,
            engagements: parseInt(eng.total_engagements),
            users: parseInt(eng.total_users)
          });
        }
      }

      // Load ZIP coordinates
      const zipDbPath = path.join(__dirname, '../data/zip-database.json');
      let zipCoords = {};
      try {
        zipCoords = JSON.parse(fs.readFileSync(zipDbPath, 'utf8'));
      } catch (e) {
        this.logger.warn('[UnifiedAnalytics] Could not load zip-database.json');
      }

      // Build heatmap points with coordinates
      const heatmapPoints = [];
      const stateStats = {};

      // Use zipMap if we have ZIP-level data, otherwise use supplier fallback
      if (zipMap.size > 0) {
        for (const [zip, data] of zipMap) {
          const coords = zipCoords[zip];
          if (coords && coords.lat && coords.lng) {
            const intensity = data.searches + data.engagements;
            heatmapPoints.push({
              zip,
              lat: coords.lat,
              lng: coords.lng,
              city: coords.city || '--',
              state: coords.state || '--',
              intensity,
              searches: data.searches,
              engagements: data.engagements,
              users: data.users
            });

            // Aggregate by state
            const state = coords.state || 'Unknown';
            if (!stateStats[state]) {
              stateStats[state] = { searches: 0, engagements: 0, users: 0, zips: 0 };
            }
            stateStats[state].searches += data.searches;
            stateStats[state].engagements += data.engagements;
            stateStats[state].users += data.users;
            stateStats[state].zips += 1;
          }
        }
      } else if (supplierLocationFallback.length > 0) {
        // Fall back to supplier locations
        for (const supplier of supplierLocationFallback) {
          const coords = zipCoords[supplier.zip_code];
          if (coords && coords.lat && coords.lng) {
            heatmapPoints.push({
              zip: supplier.zip_code,
              lat: coords.lat,
              lng: coords.lng,
              city: supplier.city || coords.city || '--',
              state: supplier.state || coords.state || '--',
              intensity: parseInt(supplier.total_activity) || 0,
              searches: 0,
              engagements: parseInt(supplier.total_activity) || 0,
              users: 0,
              supplierName: supplier.name
            });

            // Aggregate by state
            const state = supplier.state || coords.state || 'Unknown';
            if (!stateStats[state]) {
              stateStats[state] = { searches: 0, engagements: 0, users: 0, zips: 0 };
            }
            stateStats[state].engagements += parseInt(supplier.total_activity) || 0;
            stateStats[state].zips += 1;
          }
        }
      }

      // Sort by intensity for top locations
      heatmapPoints.sort((a, b) => b.intensity - a.intensity);

      // Convert state stats to sorted array
      const stateBreakdown = Object.entries(stateStats)
        .map(([state, stats]) => ({ state, ...stats }))
        .sort((a, b) => b.engagements - a.engagements);

      return {
        available: true,
        hasData: heatmapPoints.length > 0,
        data: {
          points: heatmapPoints.slice(0, 500), // Limit for performance
          topLocations: heatmapPoints.slice(0, 20),
          stateBreakdown,
          summary: {
            totalZips: heatmapPoints.length,
            totalSearches: heatmapPoints.reduce((sum, p) => sum + p.searches, 0),
            totalEngagements: heatmapPoints.reduce((sum, p) => sum + p.engagements, 0),
            statesActive: stateBreakdown.length
          }
        }
      };
    } catch (error) {
      this.logger.error('[UnifiedAnalytics] Geographic heatmap error:', error.message);
      return { available: false, error: error.message };
    }
  }
}

module.exports = UnifiedAnalytics;
