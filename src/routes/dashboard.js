/**
 * Dashboard API Routes
 *
 * Analytics dashboard endpoints for monitoring website, app, and supplier data.
 * All endpoints require authentication via DASHBOARD_PASSWORD.
 *
 * Endpoints:
 * - GET /api/dashboard/meta - Version and feature flags
 * - GET /api/dashboard/overview - Key metrics summary
 * - GET /api/dashboard/clicks - Click trends and supplier signals
 * - GET /api/dashboard/geographic - Geographic click distribution
 * - GET /api/dashboard/prices - Price trends over time
 * - GET /api/dashboard/scraper-health - Scraper status and failures
 * - GET /api/dashboard/waitlist - Android waitlist stats
 * - GET /api/dashboard/pwa - PWA install funnel
 * - GET /api/dashboard/suppliers - List all suppliers (for management)
 * - GET /api/dashboard/suppliers/:id - Single supplier details
 * - PUT /api/dashboard/suppliers/:id - Update supplier
 * - DELETE /api/dashboard/suppliers/:id - Remove supplier
 */

const express = require('express');
const router = express.Router();
const { dashboardProtection } = require('../middleware/dashboard-auth');
const path = require('path');
const fs = require('fs');
const UnifiedAnalytics = require('../services/UnifiedAnalytics');
const RecommendationsEngine = require('../services/RecommendationsEngine');

// Apply protection to all dashboard routes
router.use(dashboardProtection);

// Lazy-initialized service instances (created on first request)
let unifiedAnalytics = null;
let recommendationsEngine = null;

const getUnifiedAnalytics = (req) => {
  if (!unifiedAnalytics) {
    unifiedAnalytics = new UnifiedAnalytics(req.app.locals.sequelize, req.app.locals.logger);
  }
  return unifiedAnalytics;
};

const getRecommendationsEngine = (req) => {
  if (!recommendationsEngine) {
    recommendationsEngine = new RecommendationsEngine(req.app.locals.sequelize, req.app.locals.logger);
  }
  return recommendationsEngine;
};

// Helper: Parse days parameter with default
const parseDays = (req, defaultDays = 7) => {
  const days = parseInt(req.query.days) || defaultDays;
  return Math.min(Math.max(days, 1), 365); // Clamp to 1-365
};

// Helper: Format as CSV if requested
const formatResponse = (req, res, data, csvHeaders) => {
  if (req.query.format === 'csv' && csvHeaders) {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=export.csv');

    const rows = [csvHeaders.join(',')];
    if (Array.isArray(data)) {
      data.forEach(row => {
        rows.push(csvHeaders.map(h => {
          const val = row[h];
          if (val === null || val === undefined) return '';
          if (typeof val === 'string' && val.includes(',')) return `"${val}"`;
          return val;
        }).join(','));
      });
    }
    return res.send(rows.join('\n'));
  }
  return res.json(data);
};

// GET /api/dashboard/meta - Version and feature flags
router.get('/meta', (req, res) => {
  // Get excluded device IDs from env
  const excludedDeviceIds = (process.env.EXCLUDED_DEVICE_IDS || '')
    .split(',')
    .map(id => id.trim())
    .filter(id => id.length > 0);

  const excludedIPHashes = (process.env.EXCLUDED_IP_HASHES || '')
    .split(',')
    .map(h => h.trim())
    .filter(h => h.length > 0);

  const excludedStates = (process.env.EXCLUDED_STATES || 'CA')
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(s => s.length > 0);

  res.json({
    version: '1.0',
    features: {
      pwa: true,
      waitlist: true,
      geographic: true,
      priceTracking: true,
      supplierManagement: true
    },
    dataRetention: {
      clicks: '90 days',
      prices: 'unlimited'
    },
    exclusions: {
      deviceIds: excludedDeviceIds,
      ipHashes: excludedIPHashes,
      states: excludedStates,
      allowedCountries: ['US', 'CA']
    }
  });
});

// GET /api/dashboard/diag - Diagnostic endpoint for credentials debugging
router.get('/diag', async (req, res) => {
  const fbCreds = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const gaCreds = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;

  const diagnose = (name, value) => {
    if (!value) return { present: false, reason: 'not set' };

    const trimmed = value.trim();
    const result = {
      present: true,
      length: trimmed.length,
      startsWithBrace: trimmed.startsWith('{'),
      startsWithEyJ: trimmed.startsWith('eyJ') || trimmed.startsWith('ewog'),
      hasNewlines: trimmed.includes('\n'),
      first20: trimmed.substring(0, 20),
      last20: trimmed.substring(trimmed.length - 20)
    };

    // Try base64 decode
    try {
      const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
      result.base64DecodedLength = decoded.length;
      result.base64DecodedStartsWithBrace = decoded.startsWith('{');
      result.base64First30 = decoded.substring(0, 30);

      // Try JSON parse
      try {
        const parsed = JSON.parse(decoded);
        result.jsonValid = true;
        result.hasProjectId = !!parsed.project_id;
        result.projectId = parsed.project_id;
        result.hasPrivateKey = !!parsed.private_key;
        result.hasClientEmail = !!parsed.client_email;
      } catch (jsonErr) {
        result.jsonValid = false;
        result.jsonError = jsonErr.message;
      }
    } catch (b64Err) {
      result.base64Valid = false;
      result.base64Error = b64Err.message;

      // Try raw JSON parse
      try {
        const parsed = JSON.parse(trimmed);
        result.rawJsonValid = true;
        result.hasProjectId = !!parsed.project_id;
        result.projectId = parsed.project_id;
      } catch (rawErr) {
        result.rawJsonValid = false;
        result.rawJsonError = rawErr.message;
      }
    }

    return result;
  };

  res.json({
    FIREBASE_SERVICE_ACCOUNT_JSON: diagnose('firebase', fbCreds),
    GOOGLE_APPLICATION_CREDENTIALS_JSON: diagnose('google', gaCreds),
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || 'not set',
    BIGQUERY_DATASET: process.env.BIGQUERY_DATASET || 'not set (default: analytics_515155647)',
    GA4_PROPERTY_ID: process.env.GA4_PROPERTY_ID || 'not set (for website analytics)',
    FIREBASE_GA4_PROPERTY_ID: process.env.FIREBASE_GA4_PROPERTY_ID || 'not set (for iOS app events - get from Firebase console > Project settings > Integrations > Google Analytics)'
  });
});

// GET /api/dashboard/overview - Key metrics summary
// ?mode=summary returns compact format for email/Slack digests
router.get('/overview', async (req, res) => {
  const logger = req.app.locals.logger;
  const sequelize = req.app.locals.sequelize;
  const summaryMode = req.query.mode === 'summary';

  if (!sequelize) {
    return res.status(503).json({ error: 'Database not available' });
  }

  try {
    const days = parseDays(req);
    const now = new Date();

    // Helper for safe queries
    const safeQuery = async (name, query) => {
      try {
        return await sequelize.query(query, { type: sequelize.QueryTypes.SELECT });
      } catch (e) {
        logger.error(`[Dashboard] Query "${name}" failed: ${e.message}`);
        return [{}];
      }
    };

    // Parallel queries for performance
    const [
      clickStats,
      scraperStats,
      waitlistStats,
      pwaStats,
      coverageStats,
      dataFreshness,
      userStats
    ] = await Promise.all([
      // Click stats (combine website clicks + iOS app engagements)
      safeQuery('clickStats', `
        WITH all_clicks AS (
          -- Website clicks
          SELECT supplier_id, action_type, created_at, 'website' as source
          FROM supplier_clicks
          WHERE created_at > NOW() - INTERVAL '${days} days'
          UNION ALL
          -- iOS app engagements (calls count as clicks)
          SELECT supplier_id, engagement_type as action_type, created_at, 'ios_app' as source
          FROM supplier_engagements
          WHERE created_at > NOW() - INTERVAL '${days} days'
            AND engagement_type IN ('call', 'view', 'save')
        )
        SELECT
          COUNT(*) as total_clicks,
          COUNT(*) FILTER (WHERE action_type = 'call') as call_clicks,
          COUNT(*) FILTER (WHERE action_type IN ('website', 'view')) as website_clicks,
          COUNT(DISTINCT supplier_id) as unique_suppliers,
          MAX(created_at) as last_click
        FROM all_clicks
      `),

      // Scraper stats (prices are in supplier_prices table)
      safeQuery('scraperStats', `
        SELECT
          COUNT(DISTINCT CASE WHEN sp.scraped_at > NOW() - INTERVAL '48 hours' THEN s.id END) as with_fresh_prices,
          COUNT(DISTINCT s.id) as total,
          COUNT(DISTINCT CASE WHEN sp.id IS NOT NULL AND sp.scraped_at < NOW() - INTERVAL '48 hours' THEN s.id END) as stale_count
        FROM suppliers s
        LEFT JOIN (
          SELECT DISTINCT ON (supplier_id) supplier_id, id, scraped_at
          FROM supplier_prices
          WHERE is_valid = true
          ORDER BY supplier_id, scraped_at DESC
        ) sp ON s.id = sp.supplier_id
        WHERE s.active = true
      `),

      // Waitlist stats
      safeQuery('waitlistStats', `
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as last_7_days
        FROM waitlist
      `),

      // PWA stats
      safeQuery('pwaStats', `
        SELECT
          COUNT(*) FILTER (WHERE event_type = 'prompt_shown') as prompts_shown,
          COUNT(*) FILTER (WHERE event_type = 'installed') as installs
        FROM pwa_events
        WHERE created_at > NOW() - INTERVAL '${days} days'
      `),

      // Coverage gaps breakdown - true gaps vs engagement gaps
      // Uses subqueries instead of CTEs for better compatibility
      safeQuery('coverageStats', `
        SELECT
          (
            SELECT COUNT(DISTINCT ul.zip_code)
            FROM user_locations ul
            WHERE ul.created_at > NOW() - INTERVAL '${days} days'
              AND NOT EXISTS (
                SELECT 1 FROM suppliers s
                WHERE s.active = true
                  AND s.postal_codes_served IS NOT NULL
                  AND s.postal_codes_served @> to_jsonb(ul.zip_code::text)
              )
          ) as true_coverage_gaps,
          (
            SELECT COUNT(DISTINCT ul.zip_code)
            FROM user_locations ul
            WHERE ul.created_at > NOW() - INTERVAL '${days} days'
              AND EXISTS (
                SELECT 1 FROM suppliers s
                WHERE s.active = true
                  AND s.postal_codes_served IS NOT NULL
                  AND s.postal_codes_served @> to_jsonb(ul.zip_code::text)
              )
              AND NOT EXISTS (
                SELECT 1 FROM supplier_clicks sc
                WHERE sc.zip_code = ul.zip_code
                  AND sc.created_at > NOW() - INTERVAL '${days} days'
              )
          ) as engagement_gaps,
          (
            SELECT COUNT(DISTINCT zip_code)
            FROM user_locations
            WHERE created_at > NOW() - INTERVAL '${days} days'
          ) as total_searched
      `),

      // Data freshness (prices in supplier_prices table, scrape_runs may not exist)
      safeQuery('dataFreshness', `
        SELECT
          (SELECT MAX(created_at) FROM supplier_clicks) as last_click,
          (SELECT MAX(scraped_at) FROM supplier_prices WHERE is_valid = true) as last_price,
          (SELECT MAX(created_at) FROM waitlist) as last_waitlist,
          (SELECT MAX(created_at) FROM pwa_events) as last_pwa
      `),

      // User stats (estimate unique users from database activity)
      safeQuery('userStats', `
        SELECT
          (SELECT COUNT(DISTINCT COALESCE(ip_hash, zip_code))
           FROM user_locations
           WHERE created_at > NOW() - INTERVAL '${days} days') as website_users,
          (SELECT COUNT(DISTINCT ip_hash)
           FROM supplier_engagements
           WHERE created_at > NOW() - INTERVAL '${days} days'
             AND ip_hash IS NOT NULL) as ios_users
      `)
    ]);

    // Get top supplier (combine website clicks + iOS app engagements)
    const topSupplierResult = await safeQuery('topSupplier', `
      WITH all_clicks AS (
        SELECT supplier_id, supplier_name, created_at FROM supplier_clicks
        WHERE created_at > NOW() - INTERVAL '${days} days'
        UNION ALL
        SELECT supplier_id, supplier_name, created_at FROM supplier_engagements
        WHERE created_at > NOW() - INTERVAL '${days} days'
      )
      SELECT
        COALESCE(s.name, ac.supplier_name, 'Unknown') as name,
        COUNT(*) as clicks
      FROM all_clicks ac
      LEFT JOIN suppliers s ON ac.supplier_id = s.id
      GROUP BY COALESCE(s.name, ac.supplier_name, 'Unknown')
      ORDER BY clicks DESC
      LIMIT 1
    `);
    const topSupplier = topSupplierResult[0] || null;

    const click = clickStats[0] || {};
    const scraper = scraperStats[0] || {};
    const waitlist = waitlistStats[0] || {};
    const pwa = pwaStats[0] || {};
    const coverage = coverageStats[0] || {};
    const freshness = dataFreshness[0] || {};
    const users = userStats[0] || {};

    // Debug logging for coverage stats
    logger.info('[Dashboard] Coverage query result:', JSON.stringify(coverage));

    const conversionRate = pwa.prompts_shown > 0
      ? ((pwa.installs / pwa.prompts_shown) * 100).toFixed(1)
      : 0;

    // Summary mode - compact format for email/Slack
    if (summaryMode) {
      const totalClicks = parseInt(click.total_clicks) || 0;
      const staleCount = parseInt(scraper.stale_count) || 0;
      const trueCoverageGaps = parseInt(coverage.true_coverage_gaps) || 0;
      const engagementGaps = parseInt(coverage.engagement_gaps) || 0;

      // Build one-liner alerts
      const alerts = [];
      if (staleCount > 3) alerts.push(`${staleCount} stale scrapers`);
      if (trueCoverageGaps > 5) alerts.push(`${trueCoverageGaps} coverage gaps`);
      if (engagementGaps > 20) alerts.push(`${engagementGaps} low engagement ZIPs`);

      return res.json({
        period: `${days}d`,
        summary: {
          clicks: totalClicks,
          topSupplier: topSupplier ? `${topSupplier.name} (${topSupplier.clicks})` : null,
          scraperHealth: `${parseInt(scraper.with_fresh_prices) || 0}/${parseInt(scraper.total) || 0}`,
          stale: staleCount,
          waitlist: parseInt(waitlist.total) || 0,
          waitlistWeek: parseInt(waitlist.last_7_days) || 0,
          pwaInstalls: parseInt(pwa.installs) || 0,
          pwaRate: `${conversionRate}%`,
          trueCoverageGaps: trueCoverageGaps,
          engagementGaps: engagementGaps
        },
        alerts: alerts.length > 0 ? alerts : null,
        oneLiner: `${totalClicks} clicks | ${staleCount} stale | ${parseInt(waitlist.last_7_days) || 0} waitlist | ${parseInt(pwa.installs) || 0} PWA`,
        dashboardUrl: 'https://www.gethomeheat.com/admin/dashboard.html'
      });
    }

    res.json({
      period: `${days}d`,
      users: {
        website: parseInt(users.website_users) || 0,
        ios: parseInt(users.ios_users) || 0,
        total: (parseInt(users.website_users) || 0) + (parseInt(users.ios_users) || 0),
        source: 'database' // Note: Use GA4/Firebase for accurate user counts
      },
      website: {
        totalClicks: parseInt(click.total_clicks) || 0,
        callClicks: parseInt(click.call_clicks) || 0,
        websiteClicks: parseInt(click.website_clicks) || 0,
        uniqueSuppliers: parseInt(click.unique_suppliers) || 0,
        topSupplier: topSupplier || null,
        lastUpdated: click.last_click || null
      },
      scraping: {
        suppliersWithPrices: parseInt(scraper.with_fresh_prices) || 0,
        suppliersTotal: parseInt(scraper.total) || 0,
        staleCount: parseInt(scraper.stale_count) || 0,
        lastRunAt: freshness.last_scrape || null
      },
      waitlist: {
        total: parseInt(waitlist.total) || 0,
        last7Days: parseInt(waitlist.last_7_days) || 0,
        lastUpdated: freshness.last_waitlist || null
      },
      pwa: {
        promptsShown: parseInt(pwa.prompts_shown) || 0,
        installs: parseInt(pwa.installs) || 0,
        conversionRate: parseFloat(conversionRate),
        lastUpdated: freshness.last_pwa || null
      },
      coverage: {
        trueCoverageGaps: parseInt(coverage.true_coverage_gaps) || 0,
        engagementGaps: parseInt(coverage.engagement_gaps) || 0,
        totalSearched: parseInt(coverage.total_searched) || 0
      },
      dataFreshness: {
        supplier_clicks: freshness.last_click || null,
        supplier_prices: freshness.last_price || null,
        scrape_runs: freshness.last_scrape || null
      }
    });
  } catch (error) {
    const errMsg = error.message || String(error);
    const errStack = error.stack || '';
    logger.error(`[Dashboard] Overview error: ${errMsg} | Stack: ${errStack.split('\n')[1] || ''}`);
    res.status(500).json({ error: 'Failed to load overview', details: errMsg });
  }
});

// GET /api/dashboard/clicks - Click trends and supplier signals
router.get('/clicks', async (req, res) => {
  const logger = req.app.locals.logger;
  const sequelize = req.app.locals.sequelize;

  if (!sequelize) {
    return res.status(503).json({ error: 'Database not available' });
  }

  try {
    const days = parseDays(req, 30);

    // Parallel queries (combine website clicks + iOS app engagements)
    const [daily, bySupplier, bySupplierWithPrice, byPage, byDevice] = await Promise.all([
      // Daily trend (website + iOS)
      sequelize.query(`
        WITH all_clicks AS (
          SELECT created_at, action_type FROM supplier_clicks
          WHERE created_at > NOW() - INTERVAL '${days} days'
          UNION ALL
          SELECT created_at, engagement_type as action_type FROM supplier_engagements
          WHERE created_at > NOW() - INTERVAL '${days} days'
        )
        SELECT
          DATE(created_at) as date,
          COUNT(*) FILTER (WHERE action_type = 'call') as calls,
          COUNT(*) FILTER (WHERE action_type IN ('website', 'view')) as websites
        FROM all_clicks
        GROUP BY DATE(created_at)
        ORDER BY date
      `, { type: sequelize.QueryTypes.SELECT }),

      // By supplier (website + iOS)
      sequelize.query(`
        WITH all_clicks AS (
          SELECT supplier_id, supplier_name, action_type FROM supplier_clicks
          WHERE created_at > NOW() - INTERVAL '${days} days'
          UNION ALL
          SELECT supplier_id, supplier_name, engagement_type as action_type FROM supplier_engagements
          WHERE created_at > NOW() - INTERVAL '${days} days'
        )
        SELECT
          COALESCE(ac.supplier_name, s.name, 'Unknown') as name,
          COUNT(*) FILTER (WHERE action_type = 'call') as calls,
          COUNT(*) FILTER (WHERE action_type IN ('website', 'view')) as websites
        FROM all_clicks ac
        LEFT JOIN suppliers s ON ac.supplier_id = s.id
        GROUP BY COALESCE(ac.supplier_name, s.name, 'Unknown')
        ORDER BY (COUNT(*)) DESC
        LIMIT 20
      `, { type: sequelize.QueryTypes.SELECT }),

      // By supplier with price (for signals) - website + iOS app engagements
      sequelize.query(`
        WITH latest_prices AS (
          SELECT DISTINCT ON (supplier_id) supplier_id, price_per_gallon, scraped_at
          FROM supplier_prices
          WHERE is_valid = true
          ORDER BY supplier_id, scraped_at DESC
        ),
        market_avg AS (
          SELECT COALESCE(AVG(price_per_gallon), 0) as avg_price
          FROM latest_prices
        ),
        all_clicks AS (
          SELECT supplier_id, supplier_name FROM supplier_clicks
          WHERE created_at > NOW() - INTERVAL '${days} days'
          UNION ALL
          SELECT supplier_id, supplier_name FROM supplier_engagements
          WHERE created_at > NOW() - INTERVAL '${days} days'
        ),
        click_agg AS (
          SELECT
            COALESCE(ac.supplier_name, s.name, 'Unknown') as name,
            s.id as supplier_id,
            COUNT(*) as clicks
          FROM all_clicks ac
          LEFT JOIN suppliers s ON ac.supplier_id = s.id
             OR (ac.supplier_id IS NULL AND ac.supplier_name = s.name)
          GROUP BY COALESCE(ac.supplier_name, s.name, 'Unknown'), s.id
        )
        SELECT
          ca.name,
          ca.clicks,
          lp.price_per_gallon as "currentPrice",
          ROUND(ma.avg_price::numeric, 2) as "marketAvg",
          CASE
            WHEN lp.price_per_gallon IS NOT NULL THEN ROUND((lp.price_per_gallon - ma.avg_price)::numeric, 2)
            ELSE NULL
          END as "priceDelta",
          CASE
            WHEN lp.price_per_gallon IS NULL THEN 'data_gap'
            WHEN ca.clicks >= 20 AND lp.price_per_gallon > ma.avg_price THEN 'brand_strength'
            WHEN ca.clicks < 10 AND lp.price_per_gallon < ma.avg_price THEN 'visibility_issue'
            ELSE 'normal'
          END as signal,
          ROUND(ca.clicks * 500 * 0.03) as "estRevenueLost"
        FROM click_agg ca
        CROSS JOIN market_avg ma
        LEFT JOIN latest_prices lp ON ca.supplier_id = lp.supplier_id
        ORDER BY ca.clicks DESC
        LIMIT 30
      `, { type: sequelize.QueryTypes.SELECT }),

      // By page source
      sequelize.query(`
        SELECT
          COALESCE(page_source, 'unknown') as source,
          COUNT(*) as count
        FROM supplier_clicks
        WHERE created_at > NOW() - INTERVAL '${days} days'
        GROUP BY page_source
      `, { type: sequelize.QueryTypes.SELECT }),

      // By device
      sequelize.query(`
        SELECT
          COALESCE(device_type, 'unknown') as device,
          COUNT(*) as count
        FROM supplier_clicks
        WHERE created_at > NOW() - INTERVAL '${days} days'
        GROUP BY device_type
      `, { type: sequelize.QueryTypes.SELECT })
    ]);

    // Transform page source to object
    const byPageObj = {};
    byPage.forEach(row => { byPageObj[row.source] = parseInt(row.count); });

    // Transform device to object
    const byDeviceObj = {};
    byDevice.forEach(row => { byDeviceObj[row.device] = parseInt(row.count); });

    const result = {
      daily: daily.map(d => ({
        date: d.date,
        calls: parseInt(d.calls),
        websites: parseInt(d.websites)
      })),
      bySupplier: bySupplier.map(s => ({
        name: s.name,
        calls: parseInt(s.calls),
        websites: parseInt(s.websites)
      })),
      bySupplierWithPrice: bySupplierWithPrice.map(s => ({
        name: s.name,
        clicks: parseInt(s.clicks),
        currentPrice: s.currentPrice ? parseFloat(s.currentPrice) : null,
        marketAvg: s.marketAvg ? parseFloat(s.marketAvg) : null,
        priceDelta: s.priceDelta ? parseFloat(s.priceDelta) : null,
        signal: s.signal,
        estRevenueLost: s.signal === 'data_gap' ? null : parseInt(s.estRevenueLost) || 0
      })),
      byPage: byPageObj,
      byDevice: byDeviceObj
    };

    // CSV export for daily data
    if (req.query.format === 'csv') {
      return formatResponse(req, res, result.daily, ['date', 'calls', 'websites']);
    }

    res.json(result);
  } catch (error) {
    logger.error('[Dashboard] Clicks error:', error.message);
    res.status(500).json({ error: 'Failed to load clicks', details: error.message });
  }
});

// GET /api/dashboard/geographic - Demand heatmap and coverage gaps
router.get('/geographic', async (req, res) => {
  const logger = req.app.locals.logger;
  const sequelize = req.app.locals.sequelize;

  if (!sequelize) {
    return res.status(503).json({ error: 'Database not available' });
  }

  try {
    const days = parseDays(req, 30);

    // Load ZIP coordinates from zip-database.json
    const zipDbPath = path.join(__dirname, '../data/zip-database.json');
    let zipCoords = {};
    try {
      const zipDb = JSON.parse(fs.readFileSync(zipDbPath, 'utf8'));
      zipCoords = zipDb;
    } catch (e) {
      logger.warn('[Dashboard] Could not load zip-database.json');
    }

    // Get supplier count per ZIP (how many suppliers serve each ZIP)
    const supplierCoverage = await sequelize.query(`
      SELECT zip_code, COUNT(*) as supplier_count
      FROM (
        SELECT jsonb_array_elements_text(postal_codes_served) as zip_code
        FROM suppliers
        WHERE active = true AND postal_codes_served IS NOT NULL AND jsonb_array_length(postal_codes_served) > 0
      ) zips
      GROUP BY zip_code
    `, { type: sequelize.QueryTypes.SELECT });

    // Build map of ZIP -> supplier count
    const zipSupplierCount = new Map(supplierCoverage.map(r => [r.zip_code, parseInt(r.supplier_count)]));

    // Get user search demand by ZIP (from user_locations)
    const demand = await sequelize.query(`
      SELECT
        zip_code,
        COUNT(*) as search_count
      FROM user_locations
      WHERE created_at > NOW() - INTERVAL '${days} days'
        AND zip_code IS NOT NULL
      GROUP BY zip_code
      ORDER BY search_count DESC
      LIMIT 200
    `, { type: sequelize.QueryTypes.SELECT });

    // Enrich demand with coordinates and identify coverage gaps/limited coverage
    const demandHeatmap = [];
    const coverageGaps = [];      // 0 suppliers
    const limitedCoverage = [];   // 1-2 suppliers

    demand.forEach(d => {
      const zipData = zipCoords[d.zip_code];
      const hasCoords = zipData?.lat && zipData?.lng;
      const supplierCount = zipSupplierCount.get(d.zip_code) || 0;

      const entry = {
        zip: d.zip_code,
        count: parseInt(d.search_count),
        supplierCount: supplierCount,
        lat: hasCoords ? zipData.lat : null,
        lng: hasCoords ? zipData.lng : null,
        city: zipData?.city || null,
        county: zipData?.county || null,
        state: zipData?.state || null
      };

      // Only add to heatmap if we have coordinates
      if (hasCoords) {
        demandHeatmap.push(entry);
      }

      // Categorize by supplier count
      if (supplierCount === 0) {
        coverageGaps.push(entry);
        // Log gaps missing coordinates for debugging
        if (!hasCoords) {
          logger.warn(`[Geographic] Coverage gap ZIP ${d.zip_code} missing from zip-database.json`);
        }
      } else if (supplierCount <= 2) {
        limitedCoverage.push(entry);
      }
    });

    // Log stats for debugging
    logger.info(`[Geographic] Coverage: ${coverageGaps.length} gaps (${coverageGaps.filter(g => g.lat).length} with coords), ${limitedCoverage.length} limited (${limitedCoverage.filter(l => l.lat).length} with coords)`);

    // Also get supplier click data for the table
    const clicks = await sequelize.query(`
      SELECT
        zip_code,
        COUNT(*) as count
      FROM supplier_clicks
      WHERE created_at > NOW() - INTERVAL '${days} days'
        AND zip_code IS NOT NULL
      GROUP BY zip_code
      ORDER BY count DESC
      LIMIT 100
    `, { type: sequelize.QueryTypes.SELECT });

    const allClicks = clicks.map(c => {
      const zipData = zipCoords[c.zip_code];
      return {
        zip: c.zip_code,
        count: parseInt(c.count),
        city: zipData?.city || null,
        county: zipData?.county || null,
        state: zipData?.state || null
      };
    });

    res.json({
      demandHeatmap,    // Blue circles - user search demand
      coverageGaps,     // Red circles - searches with no supplier coverage (0 suppliers)
      limitedCoverage,  // Yellow circles - limited coverage (1-2 suppliers)
      allClicks,        // Table data - supplier clicks
      stats: {
        totalDemandZips: demandHeatmap.length,
        totalGapZips: coverageGaps.length,
        totalLimitedZips: limitedCoverage.length,
        coveredZips: zipSupplierCount.size
      }
    });
  } catch (error) {
    logger.error('[Dashboard] Geographic error:', error.message);
    res.status(500).json({ error: 'Failed to load geographic data', details: error.message });
  }
});

// GET /api/dashboard/prices - Price trends over time
router.get('/prices', async (req, res) => {
  const logger = req.app.locals.logger;
  const sequelize = req.app.locals.sequelize;

  if (!sequelize) {
    return res.status(503).json({ error: 'Database not available' });
  }

  try {
    const days = parseDays(req, 30);

    const [trends, bySupplier, priceSpread] = await Promise.all([
      // Daily price trends
      sequelize.query(`
        SELECT
          DATE(scraped_at) as date,
          ROUND(AVG(price_per_gallon)::numeric, 3) as "avgPrice",
          ROUND(MIN(price_per_gallon)::numeric, 3) as "minPrice",
          ROUND(MAX(price_per_gallon)::numeric, 3) as "maxPrice"
        FROM supplier_prices
        WHERE scraped_at > NOW() - INTERVAL '${days} days'
        GROUP BY DATE(scraped_at)
        ORDER BY date
      `, { type: sequelize.QueryTypes.SELECT }),

      // Current prices by supplier (from supplier_prices table)
      sequelize.query(`
        SELECT
          s.name,
          lp.price_per_gallon as "currentPrice",
          lp.scraped_at as "lastUpdated",
          s.state
        FROM suppliers s
        INNER JOIN (
          SELECT DISTINCT ON (supplier_id) supplier_id, price_per_gallon, scraped_at
          FROM supplier_prices
          WHERE is_valid = true
          ORDER BY supplier_id, scraped_at DESC
        ) lp ON s.id = lp.supplier_id
        WHERE s.active = true
        ORDER BY lp.price_per_gallon ASC
        LIMIT 50
      `, { type: sequelize.QueryTypes.SELECT }),

      // Price spread by state (for opportunity chart)
      sequelize.query(`
        WITH latest_prices AS (
          SELECT DISTINCT ON (supplier_id) supplier_id, price_per_gallon
          FROM supplier_prices
          WHERE is_valid = true
          ORDER BY supplier_id, scraped_at DESC
        )
        SELECT
          s.state,
          COUNT(*) as supplier_count,
          ROUND(MIN(lp.price_per_gallon)::numeric, 2) as min_price,
          ROUND(MAX(lp.price_per_gallon)::numeric, 2) as max_price,
          ROUND((MAX(lp.price_per_gallon) - MIN(lp.price_per_gallon))::numeric, 2) as spread
        FROM suppliers s
        INNER JOIN latest_prices lp ON s.id = lp.supplier_id
        WHERE s.active = true
        GROUP BY s.state
        HAVING COUNT(*) >= 3
        ORDER BY spread DESC
        LIMIT 10
      `, { type: sequelize.QueryTypes.SELECT })
    ]);

    res.json({
      trends: trends.map(t => ({
        date: t.date,
        avgPrice: parseFloat(t.avgPrice),
        minPrice: parseFloat(t.minPrice),
        maxPrice: parseFloat(t.maxPrice)
      })),
      bySupplier: bySupplier.map(s => ({
        name: s.name,
        currentPrice: parseFloat(s.currentPrice),
        lastUpdated: s.lastUpdated,
        state: s.state
      })),
      priceSpread: priceSpread.map(p => ({
        state: p.state,
        supplierCount: parseInt(p.supplier_count),
        minPrice: parseFloat(p.min_price),
        maxPrice: parseFloat(p.max_price),
        spread: parseFloat(p.spread)
      }))
    });
  } catch (error) {
    logger.error('[Dashboard] Prices error:', error.message);
    res.status(500).json({ error: 'Failed to load prices', details: error.message });
  }
});

// GET /api/dashboard/scraper-health - Scraper status and failures
router.get('/scraper-health', async (req, res) => {
  const logger = req.app.locals.logger;
  const sequelize = req.app.locals.sequelize;

  if (!sequelize) {
    return res.status(503).json({ error: 'Database not available' });
  }

  try {
    const [lastRun, scraperStats, staleSuppliers, recentFailures] = await Promise.all([
      // Last scrape time derived from supplier_prices
      sequelize.query(`
        SELECT MAX(scraped_at) as last_scrape
        FROM supplier_prices
        WHERE is_valid = true
      `, { type: sequelize.QueryTypes.SELECT }),

      // Overall scraper stats (using supplier_prices for price data)
      sequelize.query(`
        WITH latest_prices AS (
          SELECT DISTINCT ON (supplier_id) supplier_id, scraped_at
          FROM supplier_prices
          WHERE is_valid = true
          ORDER BY supplier_id, scraped_at DESC
        )
        SELECT
          COUNT(DISTINCT lp.supplier_id) as with_prices,
          COUNT(*) as total
        FROM suppliers s
        LEFT JOIN latest_prices lp ON s.id = lp.supplier_id
        WHERE s.active = true
      `, { type: sequelize.QueryTypes.SELECT }),

      // Stale suppliers (price older than 48h)
      sequelize.query(`
        WITH latest_prices AS (
          SELECT DISTINCT ON (supplier_id) supplier_id, price_per_gallon, scraped_at
          FROM supplier_prices
          WHERE is_valid = true
          ORDER BY supplier_id, scraped_at DESC
        )
        SELECT
          s.id,
          s.name,
          s.city,
          s.state,
          lp.price_per_gallon as "lastPrice",
          lp.scraped_at as "lastUpdated",
          s.website
        FROM suppliers s
        INNER JOIN latest_prices lp ON s.id = lp.supplier_id
        WHERE s.active = true
          AND lp.scraped_at < NOW() - INTERVAL '48 hours'
        ORDER BY lp.scraped_at ASC
        LIMIT 20
      `, { type: sequelize.QueryTypes.SELECT }),

      // Scrape count today
      sequelize.query(`
        SELECT COUNT(DISTINCT supplier_id) as scraped_today
        FROM supplier_prices
        WHERE scraped_at > CURRENT_DATE
          AND is_valid = true
      `, { type: sequelize.QueryTypes.SELECT })
    ]);

    const lastScrapeData = lastRun[0] || {};
    const stats = scraperStats[0] || {};
    const todayStats = recentFailures[0] || {};

    res.json({
      lastRun: lastScrapeData.last_scrape || null,
      suppliersScrapedToday: parseInt(todayStats.scraped_today) || 0,
      totalSuppliers: parseInt(stats.total) || 0,
      withPrices: parseInt(stats.with_prices) || 0,
      stale: staleSuppliers.map(s => ({
        id: s.id,
        name: s.name,
        city: s.city,
        state: s.state,
        lastPrice: s.lastPrice ? parseFloat(s.lastPrice) : null,
        lastUpdated: s.lastUpdated,
        website: s.website
      }))
    });
  } catch (error) {
    logger.error('[Dashboard] Scraper health error:', error.message);
    res.status(500).json({ error: 'Failed to load scraper health', details: error.message });
  }
});

// GET /api/dashboard/waitlist - Android waitlist stats
router.get('/waitlist', async (req, res) => {
  const logger = req.app.locals.logger;
  const sequelize = req.app.locals.sequelize;

  if (!sequelize) {
    return res.status(503).json({ error: 'Database not available' });
  }

  try {
    const [stats, daily, byPlatform] = await Promise.all([
      // Overall stats
      sequelize.query(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as last_7_days,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as last_30_days
        FROM waitlist
      `, { type: sequelize.QueryTypes.SELECT }),

      // Daily signups (last 30 days)
      sequelize.query(`
        SELECT DATE(created_at) as date, COUNT(*) as count
        FROM waitlist
        WHERE created_at > NOW() - INTERVAL '30 days'
        GROUP BY DATE(created_at)
        ORDER BY date
      `, { type: sequelize.QueryTypes.SELECT }),

      // By platform
      sequelize.query(`
        SELECT platform, COUNT(*) as count
        FROM waitlist
        GROUP BY platform
      `, { type: sequelize.QueryTypes.SELECT })
    ]);

    const s = stats[0] || {};

    res.json({
      total: parseInt(s.total) || 0,
      last7Days: parseInt(s.last_7_days) || 0,
      last30Days: parseInt(s.last_30_days) || 0,
      daily: daily.map(d => ({ date: d.date, count: parseInt(d.count) })),
      byPlatform: byPlatform.reduce((acc, p) => {
        acc[p.platform || 'unknown'] = parseInt(p.count);
        return acc;
      }, {})
    });
  } catch (error) {
    logger.error('[Dashboard] Waitlist error:', error.message);
    res.status(500).json({ error: 'Failed to load waitlist', details: error.message });
  }
});

// GET /api/dashboard/pwa - PWA install funnel
router.get('/pwa', async (req, res) => {
  const logger = req.app.locals.logger;
  const sequelize = req.app.locals.sequelize;

  if (!sequelize) {
    return res.status(503).json({ error: 'Database not available' });
  }

  try {
    const days = parseDays(req, 30);

    const [funnel, daily, byPlatform] = await Promise.all([
      // Funnel stats
      sequelize.query(`
        SELECT
          COUNT(*) FILTER (WHERE event_type = 'prompt_shown') as prompts,
          COUNT(*) FILTER (WHERE event_type = 'prompt_accepted') as accepted,
          COUNT(*) FILTER (WHERE event_type = 'prompt_dismissed') as dismissed,
          COUNT(*) FILTER (WHERE event_type = 'installed') as installed,
          COUNT(*) FILTER (WHERE event_type = 'standalone_launch') as standalone_launches
        FROM pwa_events
        WHERE created_at > NOW() - INTERVAL '${days} days'
      `, { type: sequelize.QueryTypes.SELECT }),

      // Daily installs
      sequelize.query(`
        SELECT DATE(created_at) as date, event_type, COUNT(*) as count
        FROM pwa_events
        WHERE created_at > NOW() - INTERVAL '${days} days'
        GROUP BY DATE(created_at), event_type
        ORDER BY date
      `, { type: sequelize.QueryTypes.SELECT }),

      // By platform
      sequelize.query(`
        SELECT platform, event_type, COUNT(*) as count
        FROM pwa_events
        WHERE created_at > NOW() - INTERVAL '${days} days'
        GROUP BY platform, event_type
      `, { type: sequelize.QueryTypes.SELECT })
    ]);

    const f = funnel[0] || {};
    const prompts = parseInt(f.prompts) || 0;
    const installed = parseInt(f.installed) || 0;

    res.json({
      funnel: {
        promptsShown: prompts,
        accepted: parseInt(f.accepted) || 0,
        dismissed: parseInt(f.dismissed) || 0,
        installed: installed,
        standaloneLaunches: parseInt(f.standalone_launches) || 0,
        conversionRate: prompts > 0 ? ((installed / prompts) * 100).toFixed(1) : 0
      },
      daily: daily.map(d => ({
        date: d.date,
        eventType: d.event_type,
        count: parseInt(d.count)
      })),
      byPlatform: byPlatform.reduce((acc, p) => {
        const platform = p.platform || 'unknown';
        if (!acc[platform]) acc[platform] = {};
        acc[platform][p.event_type] = parseInt(p.count);
        return acc;
      }, {})
    });
  } catch (error) {
    logger.error('[Dashboard] PWA error:', error.message);
    res.status(500).json({ error: 'Failed to load PWA stats', details: error.message });
  }
});

// ========================================
// SUPPLIER MANAGEMENT ENDPOINTS
// ========================================

// GET /api/dashboard/suppliers - List all suppliers with filters
router.get('/suppliers', async (req, res) => {
  const logger = req.app.locals.logger;
  const sequelize = req.app.locals.sequelize;

  if (!sequelize) {
    return res.status(503).json({ error: 'Database not available' });
  }

  try {
    const { state, hasPrice, scrapeStatus, search, active, limit = 50, offset = 0, sort = 'name', order = 'asc' } = req.query;

    // Build where clause with parameterized queries to prevent SQL injection
    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (state) {
      whereClause += ` AND s.state = $${paramIndex++}`;
      params.push(state);
    }
    if (hasPrice === 'true') whereClause += ' AND lp.price_per_gallon IS NOT NULL';
    if (hasPrice === 'false') whereClause += ' AND lp.price_per_gallon IS NULL';
    if (scrapeStatus === 'stale') whereClause += " AND lp.scraped_at < NOW() - INTERVAL '48 hours'";
    if (scrapeStatus === 'fresh') whereClause += " AND lp.scraped_at >= NOW() - INTERVAL '48 hours'";
    if (active === 'true') whereClause += ' AND s.active = true';
    if (active === 'false') whereClause += ' AND s.active = false';
    if (search) {
      whereClause += ` AND (s.name ILIKE $${paramIndex} OR s.website ILIKE $${paramIndex} OR s.city ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    // Validate and build ORDER BY clause
    const validSortFields = {
      name: 's.name',
      state: 's.state',
      price: 'lp.price_per_gallon',
      clicks: 'recent_clicks',
      updated: 'lp.scraped_at'
    };
    const sortField = validSortFields[sort] || 's.name';
    const sortOrder = order.toLowerCase() === 'desc' ? 'DESC NULLS LAST' : 'ASC NULLS LAST';
    const orderByClause = `ORDER BY ${sortField} ${sortOrder}`;

    const [suppliers, countResult] = await Promise.all([
      sequelize.query(`
        WITH latest_prices AS (
          SELECT DISTINCT ON (supplier_id) supplier_id, price_per_gallon, scraped_at
          FROM supplier_prices
          WHERE is_valid = true
          ORDER BY supplier_id, scraped_at DESC
        )
        SELECT
          s.id,
          s.name,
          s.phone,
          s.website,
          s.state,
          s.city,
          lp.price_per_gallon as "currentPrice",
          lp.scraped_at as "priceUpdatedAt",
          s.active as "isActive",
          s.allow_price_display as "allowPriceDisplay",
          CASE WHEN lp.scraped_at >= NOW() - INTERVAL '48 hours' THEN true ELSE false END as "scrapingEnabled",
          (SELECT COUNT(*) FROM supplier_clicks sc WHERE sc.supplier_id = s.id AND sc.created_at > NOW() - INTERVAL '7 days') as recent_clicks
        FROM suppliers s
        LEFT JOIN latest_prices lp ON s.id = lp.supplier_id
        ${whereClause}
        ${orderByClause}
        LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}
      `, { bind: params, type: sequelize.QueryTypes.SELECT }),

      sequelize.query(`
        WITH latest_prices AS (
          SELECT DISTINCT ON (supplier_id) supplier_id, price_per_gallon, scraped_at
          FROM supplier_prices
          WHERE is_valid = true
          ORDER BY supplier_id, scraped_at DESC
        )
        SELECT COUNT(*) as count
        FROM suppliers s
        LEFT JOIN latest_prices lp ON s.id = lp.supplier_id
        ${whereClause}
      `, { bind: params, type: sequelize.QueryTypes.SELECT })
    ]);

    res.json({
      suppliers: suppliers.map(s => ({
        ...s,
        currentPrice: s.currentPrice ? parseFloat(s.currentPrice) : null,
        recentClicks: parseInt(s.recent_clicks) || 0
      })),
      sort: sort,
      order: order,
      pagination: {
        total: parseInt(countResult[0].count),
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    logger.error('[Dashboard] Suppliers list error:', error.message);
    res.status(500).json({ error: 'Failed to load suppliers', details: error.message });
  }
});

// GET /api/dashboard/suppliers/map - Supplier locations for map display
router.get('/suppliers/map', async (req, res) => {
  const logger = req.app.locals.logger;
  const sequelize = req.app.locals.sequelize;

  if (!sequelize) {
    return res.status(503).json({ error: 'Database not available' });
  }

  try {
    // Get suppliers with location data
    const [suppliers] = await sequelize.query(`
      WITH latest_prices AS (
        SELECT DISTINCT ON (supplier_id) supplier_id, price_per_gallon, scraped_at
        FROM supplier_prices
        WHERE is_valid = true
        ORDER BY supplier_id, scraped_at DESC
      )
      SELECT
        s.id,
        s.name,
        s.address_line1,
        s.city,
        s.state,
        s.lat,
        s.lng,
        s.active,
        lp.price_per_gallon as price
      FROM suppliers s
      LEFT JOIN latest_prices lp ON s.id = lp.supplier_id
      WHERE s.city IS NOT NULL AND s.state IS NOT NULL
      ORDER BY s.name
    `);

    // Geocode suppliers without coordinates (batch, with rate limiting)
    // Skip invalid city names that can't be geocoded properly
    const invalidCities = ['various', 'multiple', 'many', 'several', 'n/a', 'na', 'unknown', 'tbd'];
    const needsGeocoding = suppliers.filter(s =>
      !s.lat && s.city && s.state &&
      !invalidCities.includes(s.city.toLowerCase().trim())
    );

    if (needsGeocoding.length > 0) {
      logger.info(`[Dashboard] Geocoding ${needsGeocoding.length} suppliers`);

      // Geocode up to 10 suppliers per request to avoid rate limits
      const toGeocode = needsGeocoding.slice(0, 10);

      for (const supplier of toGeocode) {
        try {
          const address = supplier.address_line1
            ? `${supplier.address_line1}, ${supplier.city}, ${supplier.state}`
            : `${supplier.city}, ${supplier.state}`;

          // Add USA to query to improve accuracy
          const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address + ', USA')}&limit=1&countrycodes=us`,
            { headers: { 'User-Agent': 'HomeHeat-Dashboard/1.0' } }
          );

          if (response.ok) {
            const data = await response.json();
            if (data.length > 0) {
              const { lat, lon } = data[0];
              const parsedLat = parseFloat(lat);
              const parsedLng = parseFloat(lon);

              // Validate coordinates are within continental US bounds
              const isValidUS = parsedLat >= 24 && parsedLat <= 50 &&
                               parsedLng >= -125 && parsedLng <= -66;

              if (isValidUS) {
                // Update database with coordinates
                await sequelize.query(
                  `UPDATE suppliers SET lat = $1, lng = $2 WHERE id = $3`,
                  { bind: [parsedLat, parsedLng, supplier.id] }
                );

                // Update local object
                supplier.lat = parsedLat;
                supplier.lng = parsedLng;
              } else {
                logger.warn(`[Dashboard] Geocoding returned non-US coordinates for ${supplier.name}: ${parsedLat}, ${parsedLng}`);
              }
            }
          }

          // Rate limit: 1 request per second for Nominatim
          await new Promise(resolve => setTimeout(resolve, 1100));
        } catch (geoError) {
          logger.warn(`[Dashboard] Geocoding failed for ${supplier.name}:`, geoError.message);
        }
      }
    }

    // Return suppliers with valid US coordinates only
    const mappableSuppliers = suppliers
      .filter(s => {
        if (!s.lat || !s.lng) return false;
        const lat = parseFloat(s.lat);
        const lng = parseFloat(s.lng);
        // Continental US bounds
        return lat >= 24 && lat <= 50 && lng >= -125 && lng <= -66;
      })
      .map(s => ({
        id: s.id,
        name: s.name,
        city: s.city,
        state: s.state,
        lat: parseFloat(s.lat),
        lng: parseFloat(s.lng),
        price: s.price ? parseFloat(s.price) : null,
        active: s.active
      }));

    res.json({
      suppliers: mappableSuppliers,
      total: suppliers.length,
      mapped: mappableSuppliers.length,
      needsGeocoding: needsGeocoding.length - Math.min(10, needsGeocoding.length)
    });
  } catch (error) {
    logger.error('[Dashboard] Suppliers map error:', error.message);
    res.status(500).json({ error: 'Failed to load supplier map data', details: error.message });
  }
});

// GET /api/dashboard/suppliers/:id - Single supplier details
router.get('/suppliers/:id', async (req, res) => {
  const logger = req.app.locals.logger;
  const sequelize = req.app.locals.sequelize;

  if (!sequelize) {
    return res.status(503).json({ error: 'Database not available' });
  }

  try {
    const { id } = req.params;

    // Get supplier with latest price
    const [supplier] = await sequelize.query(`
      SELECT s.*,
        lp.price_per_gallon as current_price,
        lp.scraped_at as price_updated_at
      FROM suppliers s
      LEFT JOIN (
        SELECT DISTINCT ON (supplier_id) supplier_id, price_per_gallon, scraped_at
        FROM supplier_prices
        WHERE is_valid = true
        ORDER BY supplier_id, scraped_at DESC
      ) lp ON s.id = lp.supplier_id
      WHERE s.id = :id
    `, { replacements: { id }, type: sequelize.QueryTypes.SELECT });

    if (!supplier) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    // Get price history
    const priceHistory = await sequelize.query(`
      SELECT price_per_gallon, scraped_at
      FROM supplier_prices
      WHERE supplier_id = :id
      ORDER BY scraped_at DESC
      LIMIT 30
    `, { replacements: { id }, type: sequelize.QueryTypes.SELECT });

    // Get click stats
    const clickStats = await sequelize.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as last_7_days,
        COUNT(*) FILTER (WHERE action_type = 'call') as calls,
        COUNT(*) FILTER (WHERE action_type = 'website') as websites
      FROM supplier_clicks
      WHERE supplier_id = :id
    `, { replacements: { id }, type: sequelize.QueryTypes.SELECT });

    // Get scrape config from file
    let scrapeConfig = null;
    try {
      const configPath = path.join(__dirname, '../data/scrape-config.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      // Find by website domain
      if (supplier.website) {
        const domain = supplier.website.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
        scrapeConfig = config[domain] || null;
      }
    } catch (e) {
      // Config not available
    }

    // Format response with expected field names for frontend
    res.json({
      supplier: {
        ...supplier,
        is_active: supplier.active,
        current_price: supplier.current_price ? parseFloat(supplier.current_price) : null,
        price_source: supplier.current_price ? 'scraped' : null,
        scraping_enabled: supplier.scraping_enabled ?? (
          supplier.price_updated_at &&
          (new Date() - new Date(supplier.price_updated_at)) < 48 * 60 * 60 * 1000
        ),
        // Hours & Availability (snake_case for frontend consistency)
        hours_weekday: supplier.hours_weekday,
        hours_saturday: supplier.hours_saturday,
        hours_sunday: supplier.hours_sunday,
        weekend_delivery: supplier.weekend_delivery || 'unknown',
        emergency_delivery: supplier.emergency_delivery || 'unknown',
        emergency_phone: supplier.emergency_phone,
        hours_notes: supplier.hours_notes,
        hours_verified_at: supplier.hours_verified_at
      },
      priceHistory: priceHistory.map(p => ({
        price: parseFloat(p.price_per_gallon),
        date: p.scraped_at
      })),
      clickStats: {
        total: parseInt(clickStats[0]?.total) || 0,
        last7Days: parseInt(clickStats[0]?.last_7_days) || 0,
        calls: parseInt(clickStats[0]?.calls) || 0,
        websites: parseInt(clickStats[0]?.websites) || 0
      },
      scrapeConfig
    });
  } catch (error) {
    logger.error('[Dashboard] Supplier detail error:', error.message);
    res.status(500).json({ error: 'Failed to load supplier', details: error.message });
  }
});

// POST /api/dashboard/suppliers - Create new supplier
router.post('/suppliers', async (req, res) => {
  const logger = req.app.locals.logger;
  const sequelize = req.app.locals.sequelize;

  if (!sequelize) {
    return res.status(503).json({ error: 'Database not available' });
  }

  try {
    const {
      name, phone, email, website, addressLine1, city, state,
      postalCodesServed, serviceCounties, serviceCities,
      fuelTypes, notes, active, allowPriceDisplay
    } = req.body;

    // Validate required fields
    if (!name || !state) {
      return res.status(400).json({ error: 'Name and state are required' });
    }

    // Check for duplicate by name (case-insensitive)
    const [existing] = await sequelize.query(`
      SELECT id, name, city, state FROM suppliers
      WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
      LIMIT 1
    `, { bind: [name] });

    if (existing.length > 0) {
      const dup = existing[0];
      return res.status(409).json({
        error: `Duplicate: "${dup.name}" already exists in ${dup.city || ''}, ${dup.state}`,
        existingId: dup.id
      });
    }

    // Generate slug from name
    const slug = name.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 100);

    const [result] = await sequelize.query(`
      INSERT INTO suppliers (
        id, name, phone, email, website, address_line1, city, state,
        postal_codes_served, service_counties, service_cities,
        fuel_types, notes, slug, active, allow_price_display, verified, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7,
        $8::jsonb, $9::jsonb, $10::jsonb,
        $11::jsonb, $12, $13, $14, $15, false, NOW(), NOW()
      )
      RETURNING id, name, state, city, slug
    `, {
      bind: [
        name,
        phone || null,
        email || null,
        website || null,
        addressLine1 || null,
        city || null,
        state,
        JSON.stringify(postalCodesServed || []),
        JSON.stringify(serviceCounties || []),
        JSON.stringify(serviceCities || []),
        JSON.stringify(fuelTypes || ['heating_oil']),
        notes || null,
        slug,
        active !== false,  // default true
        allowPriceDisplay !== false  // default true
      ]
    });

    logger.info(`[Dashboard] Created supplier: ${name} (${state})`);
    res.json({ success: true, supplier: result[0] });
  } catch (error) {
    logger.error('[Dashboard] Create supplier error:', error.message);
    res.status(500).json({ error: 'Failed to create supplier', details: error.message });
  }
});

// PUT /api/dashboard/suppliers/:id - Update supplier
router.put('/suppliers/:id', async (req, res) => {
  const logger = req.app.locals.logger;
  const sequelize = req.app.locals.sequelize;

  if (!sequelize) {
    return res.status(503).json({ error: 'Database not available' });
  }

  try {
    const { id } = req.params;
    const updates = req.body;

    // Map frontend field names to database column names
    const fieldMapping = {
      'is_active': 'active'
    };

    // Whitelist allowed fields (using actual column names)
    // Note: scraping_enabled is not a real column - it's computed from price freshness
    const allowedFields = [
      'name', 'phone', 'website', 'state', 'city',
      'active', 'allow_price_display',
      // Hours & Availability
      'hours_weekday', 'hours_saturday', 'hours_sunday',
      'weekend_delivery', 'emergency_delivery', 'emergency_phone',
      'hours_source', 'hours_verified_at', 'hours_notes'
    ];

    // Handle hours_verified checkbox (sets timestamp)
    if (updates.hours_verified !== undefined) {
      if (updates.hours_verified) {
        updates.hours_verified_at = new Date();
        updates.hours_source = updates.hours_source || 'manual';
      } else {
        updates.hours_verified_at = null;
      }
      delete updates.hours_verified;
    }

    const setClause = [];
    const replacements = { id };

    for (const [key, value] of Object.entries(updates)) {
      // Map frontend field name to database column name
      const dbField = fieldMapping[key] || key;

      if (allowedFields.includes(dbField) && value !== undefined) {
        setClause.push(`${dbField} = :${dbField}`);
        replacements[dbField] = value;
      }
    }

    if (setClause.length === 0 && !updates.manual_price) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    // Update supplier fields
    if (setClause.length > 0) {
      setClause.push('updated_at = NOW()');
      await sequelize.query(`
        UPDATE suppliers SET ${setClause.join(', ')} WHERE id = :id
      `, { replacements });
    }

    // Handle manual price update
    if (updates.manual_price !== undefined && updates.manual_price !== null) {
      const price = parseFloat(updates.manual_price);
      // Database constraint: price_per_gallon >= 1.50 AND <= 8.00
      if (!isNaN(price) && price >= 1.50 && price <= 8.00) {
        // Insert manual price into supplier_prices (expires in 7 days)
        await sequelize.query(`
          INSERT INTO supplier_prices (supplier_id, price_per_gallon, min_gallons, scraped_at, is_valid, expires_at)
          VALUES (:id, :price, 100, NOW(), true, NOW() + INTERVAL '7 days')
        `, { replacements: { id, price } });
        logger.info(`[Dashboard] Manual price set for supplier ${id}: $${price.toFixed(2)}`);
      } else if (!isNaN(price)) {
        logger.warn(`[Dashboard] Invalid price ${price} for supplier ${id} - must be between $1.50 and $8.00`);
      }
    }

    logger.info(`[Dashboard] Updated supplier ${id}: ${Object.keys(updates).join(', ')}`);

    // Return updated supplier with latest price
    const [updated] = await sequelize.query(`
      SELECT s.*,
        (SELECT price_per_gallon FROM supplier_prices
         WHERE supplier_id = s.id AND is_valid = true
         ORDER BY scraped_at DESC LIMIT 1) as current_price,
        (SELECT scraped_at FROM supplier_prices
         WHERE supplier_id = s.id AND is_valid = true
         ORDER BY scraped_at DESC LIMIT 1) as price_updated_at
      FROM suppliers s WHERE s.id = :id
    `, { replacements: { id }, type: sequelize.QueryTypes.SELECT });

    res.json({ success: true, supplier: updated });
  } catch (error) {
    logger.error('[Dashboard] Supplier update error:', error.message);
    res.status(500).json({ error: 'Failed to update supplier', details: error.message });
  }
});

// POST /api/dashboard/suppliers/:id/scrape-config - Update scrape config
router.post('/suppliers/:id/scrape-config', async (req, res) => {
  const logger = req.app.locals.logger;
  const sequelize = req.app.locals.sequelize;

  if (!sequelize) {
    return res.status(503).json({ error: 'Database not available' });
  }

  try {
    const { id } = req.params;
    const { domain, enabled, pattern, priceRegex, notes } = req.body;

    if (!domain) {
      return res.status(400).json({ error: 'Domain is required' });
    }

    // Load existing config
    const configPath = path.join(__dirname, '../data/scrape-config.json');
    let config = {};
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (e) {
      // Start fresh if file doesn't exist
    }

    // Update config for this domain
    config[domain] = {
      enabled: enabled !== false,
      pattern: pattern || 'text',
      notes: notes || '',
      ...(priceRegex && { priceRegex })
    };

    // Write back
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    logger.info(`[Dashboard] Updated scrape config for ${domain}`);

    res.json({ success: true, config: config[domain] });
  } catch (error) {
    logger.error('[Dashboard] Scrape config update error:', error.message);
    res.status(500).json({ error: 'Failed to update scrape config', details: error.message });
  }
});

// GET /api/dashboard/searches - Top searched ZIPs and search activity
router.get('/searches', async (req, res) => {
  const logger = req.app.locals.logger;
  const sequelize = req.app.locals.sequelize;

  if (!sequelize) {
    return res.status(503).json({ error: 'Database not available' });
  }

  try {
    const days = parseDays(req, 30);

    // Load ZIP database for city/county info
    const zipDbPath = path.join(__dirname, '../data/zip-database.json');
    let zipCoords = {};
    try {
      zipCoords = JSON.parse(fs.readFileSync(zipDbPath, 'utf8'));
    } catch (e) {
      logger.warn('[Dashboard] Could not load zip-database.json');
    }

    const [topZips, dailySearches, hourlySearches] = await Promise.all([
      // Top searched ZIPs
      sequelize.query(`
        SELECT zip_code, COUNT(*) as search_count
        FROM user_locations
        WHERE created_at > NOW() - INTERVAL '${days} days'
          AND zip_code IS NOT NULL
        GROUP BY zip_code
        ORDER BY search_count DESC
        LIMIT 50
      `, { type: sequelize.QueryTypes.SELECT }),

      // Daily search volume
      sequelize.query(`
        SELECT DATE(created_at) as date, COUNT(*) as searches
        FROM user_locations
        WHERE created_at > NOW() - INTERVAL '${days} days'
        GROUP BY DATE(created_at)
        ORDER BY date
      `, { type: sequelize.QueryTypes.SELECT }),

      // Hourly distribution (for peak hours)
      sequelize.query(`
        SELECT EXTRACT(HOUR FROM created_at) as hour, COUNT(*) as searches
        FROM user_locations
        WHERE created_at > NOW() - INTERVAL '${days} days'
        GROUP BY EXTRACT(HOUR FROM created_at)
        ORDER BY hour
      `, { type: sequelize.QueryTypes.SELECT })
    ]);

    // Enrich top ZIPs with city/state
    const enrichedZips = topZips.map(z => ({
      zip: z.zip_code,
      searches: parseInt(z.search_count),
      city: zipCoords[z.zip_code]?.city || '--',
      county: zipCoords[z.zip_code]?.county || '--',
      state: zipCoords[z.zip_code]?.state || '--'
    }));

    // Calculate totals
    const totalSearches = dailySearches.reduce((sum, d) => sum + parseInt(d.searches), 0);
    const uniqueZips = topZips.length;

    res.json({
      period: `${days}d`,
      summary: {
        totalSearches,
        uniqueZips,
        avgPerDay: Math.round(totalSearches / days)
      },
      topZips: enrichedZips,
      daily: dailySearches.map(d => ({
        date: d.date,
        searches: parseInt(d.searches)
      })),
      hourly: hourlySearches.map(h => ({
        hour: parseInt(h.hour),
        searches: parseInt(h.searches)
      }))
    });
  } catch (error) {
    logger.error('[Dashboard] Searches error:', error.message);
    res.status(500).json({ error: 'Failed to load search data', details: error.message });
  }
});

// GET /api/dashboard/conversion - Conversion funnel (searches → clicks)
router.get('/conversion', async (req, res) => {
  const logger = req.app.locals.logger;
  const sequelize = req.app.locals.sequelize;

  if (!sequelize) {
    return res.status(503).json({ error: 'Database not available' });
  }

  try {
    const days = parseDays(req, 30);

    const [searches, clicks, dailyFunnel] = await Promise.all([
      // Total searches
      sequelize.query(`
        SELECT COUNT(*) as total
        FROM user_locations
        WHERE created_at > NOW() - INTERVAL '${days} days'
      `, { type: sequelize.QueryTypes.SELECT }),

      // Total clicks
      sequelize.query(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE action_type = 'call') as calls,
          COUNT(*) FILTER (WHERE action_type = 'website') as websites
        FROM supplier_clicks
        WHERE created_at > NOW() - INTERVAL '${days} days'
      `, { type: sequelize.QueryTypes.SELECT }),

      // Daily funnel
      sequelize.query(`
        SELECT
          d.date,
          COALESCE(s.searches, 0) as searches,
          COALESCE(c.clicks, 0) as clicks
        FROM (
          SELECT generate_series(
            (NOW() - INTERVAL '${days} days')::date,
            NOW()::date,
            '1 day'::interval
          )::date as date
        ) d
        LEFT JOIN (
          SELECT DATE(created_at) as date, COUNT(*) as searches
          FROM user_locations
          WHERE created_at > NOW() - INTERVAL '${days} days'
          GROUP BY DATE(created_at)
        ) s ON d.date = s.date
        LEFT JOIN (
          SELECT DATE(created_at) as date, COUNT(*) as clicks
          FROM supplier_clicks
          WHERE created_at > NOW() - INTERVAL '${days} days'
          GROUP BY DATE(created_at)
        ) c ON d.date = c.date
        ORDER BY d.date
      `, { type: sequelize.QueryTypes.SELECT })
    ]);

    const totalSearches = parseInt(searches[0]?.total) || 0;
    const totalClicks = parseInt(clicks[0]?.total) || 0;
    const conversionRate = totalSearches > 0 ? ((totalClicks / totalSearches) * 100).toFixed(2) : 0;

    res.json({
      period: `${days}d`,
      funnel: {
        searches: totalSearches,
        clicks: totalClicks,
        calls: parseInt(clicks[0]?.calls) || 0,
        websites: parseInt(clicks[0]?.websites) || 0,
        conversionRate: parseFloat(conversionRate)
      },
      daily: dailyFunnel.map(d => ({
        date: d.date,
        searches: parseInt(d.searches),
        clicks: parseInt(d.clicks),
        rate: parseInt(d.searches) > 0 ? ((parseInt(d.clicks) / parseInt(d.searches)) * 100).toFixed(1) : 0
      }))
    });
  } catch (error) {
    logger.error('[Dashboard] Conversion error:', error.message);
    res.status(500).json({ error: 'Failed to load conversion data', details: error.message });
  }
});

// GET /api/dashboard/ios-app - iOS app engagement data
// Combines supplier_engagements (orders, quotes) + app_events (saves, views)
router.get('/ios-app', async (req, res) => {
  const logger = req.app.locals.logger;
  const sequelize = req.app.locals.sequelize;

  if (!sequelize) {
    return res.status(503).json({ error: 'Database not available' });
  }

  try {
    const days = parseDays(req, 30);

    const [engagement, bySupplier, daily, appStats] = await Promise.all([
      // Engagement stats from supplier_engagements (order_placed, request_quote)
      sequelize.query(`
        SELECT
          COUNT(*) as total,
          COUNT(DISTINCT ip_hash) as unique_users,
          COUNT(*) FILTER (WHERE engagement_type = 'order_placed') as orders,
          COUNT(*) FILTER (WHERE engagement_type = 'request_quote') as quotes,
          COUNT(*) FILTER (WHERE engagement_type = 'call') as calls
        FROM supplier_engagements
        WHERE created_at > NOW() - INTERVAL '${days} days'
      `, { type: sequelize.QueryTypes.SELECT }),

      // Top suppliers by ALL engagement (supplier_engagements + app_events)
      // Includes flags for unusual patterns (test data detection)
      sequelize.query(`
        WITH all_supplier_actions AS (
          -- From supplier_engagements (orders, quotes)
          SELECT
            COALESCE(s.name, se.supplier_name) as supplier_name,
            se.engagement_type as action_type,
            se.ip_hash as user_hash,
            se.created_at
          FROM supplier_engagements se
          LEFT JOIN suppliers s ON se.supplier_id = s.id
          WHERE se.created_at > NOW() - INTERVAL '${days} days'
          UNION ALL
          -- From app_events (saves, views)
          SELECT
            event_data->>'supplier_name' as supplier_name,
            CASE
              WHEN event_name = 'supplier_saved' THEN 'saved'
              WHEN event_name = 'directory_supplier_viewed' THEN 'viewed'
            END as action_type,
            device_id_hash as user_hash,
            created_at
          FROM app_events
          WHERE event_name IN ('supplier_saved', 'directory_supplier_viewed')
            AND created_at > NOW() - INTERVAL '${days} days'
            AND event_data->>'supplier_name' IS NOT NULL
        ),
        supplier_stats AS (
          SELECT
            supplier_name as name,
            COUNT(*) as total,
            COUNT(DISTINCT user_hash) as unique_users,
            COUNT(*) FILTER (WHERE action_type = 'saved') as saved,
            COUNT(*) FILTER (WHERE action_type = 'viewed') as viewed,
            COUNT(*) FILTER (WHERE action_type = 'order_placed') as orders,
            COUNT(*) FILTER (WHERE action_type = 'request_quote') as quotes,
            COUNT(*) FILTER (WHERE action_type = 'call') as calls,
            -- Detect rapid-fire actions (multiple in < 30 mins from same user)
            MAX(CASE
              WHEN action_type = 'order_placed' THEN 1 ELSE 0
            END) as has_orders,
            -- Check if most actions came from single user
            MAX(user_count) as max_user_actions
          FROM all_supplier_actions
          LEFT JOIN (
            SELECT supplier_name as sn, user_hash as uh, COUNT(*) as user_count
            FROM all_supplier_actions
            GROUP BY supplier_name, user_hash
          ) user_counts ON all_supplier_actions.supplier_name = user_counts.sn
                       AND all_supplier_actions.user_hash = user_counts.uh
          WHERE supplier_name IS NOT NULL
          GROUP BY supplier_name
        )
        SELECT
          name, total, unique_users, saved, viewed, orders, quotes, calls,
          -- Flag rapid orders as test (3+ orders from single user is not normal)
          -- Deliveries/saves/views are OK - users often backfill history
          CASE
            WHEN orders >= 3 AND unique_users = 1 THEN 'rapid_orders'
            ELSE NULL
          END as flag
        FROM supplier_stats
        ORDER BY total DESC
        LIMIT 20
      `, { type: sequelize.QueryTypes.SELECT }),

      // Daily engagement trend (combined)
      sequelize.query(`
        WITH daily_actions AS (
          SELECT DATE(created_at) as date, 'engagement' as source
          FROM supplier_engagements
          WHERE created_at > NOW() - INTERVAL '${days} days'
          UNION ALL
          SELECT DATE(created_at) as date, 'app_event' as source
          FROM app_events
          WHERE event_name IN ('supplier_saved', 'directory_supplier_viewed')
            AND created_at > NOW() - INTERVAL '${days} days'
        )
        SELECT date, COUNT(*) as engagements
        FROM daily_actions
        GROUP BY date
        ORDER BY date
      `, { type: sequelize.QueryTypes.SELECT }),

      // App-level stats from app_events
      sequelize.query(`
        SELECT
          COUNT(*) FILTER (WHERE event_name = 'supplier_saved') as saves,
          COUNT(*) FILTER (WHERE event_name = 'directory_supplier_viewed') as views,
          COUNT(*) FILTER (WHERE event_name = 'directory_searched') as searches,
          COUNT(*) FILTER (WHERE event_name = 'delivery_logged') as deliveries_logged,
          COUNT(DISTINCT device_id_hash) as unique_devices
        FROM app_events
        WHERE created_at > NOW() - INTERVAL '${days} days'
      `, { type: sequelize.QueryTypes.SELECT })
    ]);

    const stats = engagement[0] || {};
    const appEventStats = appStats[0] || {};

    res.json({
      period: `${days}d`,
      summary: {
        totalEngagements: (parseInt(stats.total) || 0) + (parseInt(appEventStats.saves) || 0) + (parseInt(appEventStats.views) || 0),
        uniqueUsers: parseInt(stats.unique_users) || 0,
        uniqueDevices: parseInt(appEventStats.unique_devices) || 0,
        orders: parseInt(stats.orders) || 0,
        quotes: parseInt(stats.quotes) || 0,
        calls: parseInt(stats.calls) || 0,
        saves: parseInt(appEventStats.saves) || 0,
        views: parseInt(appEventStats.views) || 0,
        searches: parseInt(appEventStats.searches) || 0,
        deliveriesLogged: parseInt(appEventStats.deliveries_logged) || 0
      },
      bySupplier: bySupplier.map(s => ({
        name: s.name,
        total: parseInt(s.total),
        uniqueUsers: parseInt(s.unique_users) || 0,
        saved: parseInt(s.saved) || 0,
        viewed: parseInt(s.viewed) || 0,
        orders: parseInt(s.orders) || 0,
        flag: s.flag || null,  // 'test_suspected' if unusual pattern detected
        quotes: parseInt(s.quotes) || 0,
        calls: parseInt(s.calls) || 0
      })),
      daily: daily.map(d => ({
        date: d.date,
        engagements: parseInt(d.engagements)
      }))
    });
  } catch (error) {
    logger.error('[Dashboard] iOS app error:', error.message);
    res.status(500).json({ error: 'Failed to load iOS app data', details: error.message });
  }
});

// GET /api/dashboard/missing-suppliers - Suppliers users mention that we don't have
router.get('/missing-suppliers', async (req, res) => {
  const logger = req.app.locals.logger;
  const sequelize = req.app.locals.sequelize;

  if (!sequelize) {
    return res.status(503).json({ error: 'Database not available' });
  }

  try {
    const days = parseDays(req, 90); // Look back further for supplier leads

    // Find suppliers mentioned by users that aren't in our database
    // Also find near-matches to identify name variations
    const [missingSuppliers] = await sequelize.query(`
      WITH user_suppliers AS (
        -- From app_events (deliveries, saves, views)
        SELECT
          event_data->>'supplier_name' as supplier_name,
          event_data->>'from_directory' as from_directory,
          device_id_hash as user_id,
          created_at
        FROM app_events
        WHERE event_data->>'supplier_name' IS NOT NULL
          AND created_at > NOW() - INTERVAL '${days} days'
        UNION ALL
        -- From supplier_engagements (orders, quotes)
        SELECT
          supplier_name,
          'false' as from_directory,
          ip_hash as user_id,
          created_at
        FROM supplier_engagements
        WHERE supplier_name IS NOT NULL
          AND created_at > NOW() - INTERVAL '${days} days'
      ),
      aggregated AS (
        SELECT
          supplier_name,
          COUNT(*) as mentions,
          COUNT(DISTINCT user_id) as unique_users,
          MAX(created_at) as last_mentioned,
          BOOL_OR(from_directory = 'true') as was_from_directory
        FROM user_suppliers
        GROUP BY supplier_name
      )
      SELECT
        a.supplier_name,
        a.mentions,
        a.unique_users,
        a.last_mentioned,
        a.was_from_directory,
        s.name as matched_supplier,
        s.city as matched_city,
        s.state as matched_state,
        CASE
          WHEN s.id IS NOT NULL THEN 'exact_match'
          WHEN EXISTS (
            SELECT 1 FROM suppliers s2
            WHERE LOWER(s2.name) LIKE '%' || LOWER(SUBSTRING(a.supplier_name, 1, 10)) || '%'
          ) THEN 'near_match'
          ELSE 'not_found'
        END as match_status
      FROM aggregated a
      LEFT JOIN suppliers s ON LOWER(TRIM(a.supplier_name)) = LOWER(TRIM(s.name))
      ORDER BY
        CASE WHEN s.id IS NULL THEN 0 ELSE 1 END,  -- Missing first
        a.mentions DESC
    `, { type: sequelize.QueryTypes.SELECT });

    // Separate into categories
    const missing = missingSuppliers.filter(s => s.match_status === 'not_found');
    const nearMatches = missingSuppliers.filter(s => s.match_status === 'near_match');
    const exact = missingSuppliers.filter(s => s.match_status === 'exact_match');

    // For near matches, find the actual near-match suggestions
    const nearMatchesWithSuggestions = await Promise.all(nearMatches.map(async (nm) => {
      const [suggestions] = await sequelize.query(`
        SELECT name, city, state
        FROM suppliers
        WHERE LOWER(name) LIKE '%' || LOWER(:pattern) || '%'
        LIMIT 3
      `, {
        replacements: { pattern: nm.supplier_name.substring(0, 10) },
        type: sequelize.QueryTypes.SELECT
      });
      return { ...nm, suggestions };
    }));

    res.json({
      period: `${days}d`,
      summary: {
        totalMissing: missing.length,
        totalNearMatches: nearMatches.length,
        totalMentions: missingSuppliers.reduce((sum, s) => sum + parseInt(s.mentions), 0)
      },
      missing: missing.map(s => ({
        name: s.supplier_name,
        mentions: parseInt(s.mentions),
        uniqueUsers: parseInt(s.unique_users),
        lastMentioned: s.last_mentioned,
        wasFromDirectory: s.was_from_directory,
        type: 'new_lead'  // Could be contract-only, out of area, etc.
      })),
      nearMatches: nearMatchesWithSuggestions.map(s => ({
        name: s.supplier_name,
        mentions: parseInt(s.mentions),
        uniqueUsers: parseInt(s.unique_users),
        lastMentioned: s.last_mentioned,
        suggestions: s.suggestions || [],
        type: 'alias_needed'
      })),
      inDatabase: exact.length
    });
  } catch (error) {
    logger.error('[Dashboard] Missing suppliers error:', error.message);
    res.status(500).json({ error: 'Failed to load missing suppliers', details: error.message });
  }
});

// GET /api/dashboard/aliases - List all supplier aliases
router.get('/aliases', async (req, res) => {
  const logger = req.app.locals.logger;
  const sequelize = req.app.locals.sequelize;

  if (!sequelize) {
    return res.status(503).json({ error: 'Database not available' });
  }

  try {
    const [aliases] = await sequelize.query(`
      SELECT
        a.id,
        a.alias_name,
        a.scope_state,
        a.scope_zip_prefix,
        a.created_at,
        s.name as canonical_name,
        s.city as supplier_city,
        s.state as supplier_state,
        s.id as supplier_id
      FROM supplier_aliases a
      JOIN suppliers s ON a.supplier_id = s.id
      ORDER BY a.created_at DESC
    `);

    res.json({
      count: aliases.length,
      aliases: aliases.map(a => ({
        id: a.id,
        aliasName: a.alias_name,
        canonicalName: a.canonical_name,
        supplierId: a.supplier_id,
        supplierCity: a.supplier_city,
        supplierState: a.supplier_state,
        scopeState: a.scope_state,
        scopeZipPrefix: a.scope_zip_prefix,
        createdAt: a.created_at
      }))
    });
  } catch (error) {
    logger.error('[Dashboard] Aliases list error:', error.message);
    res.status(500).json({ error: 'Failed to load aliases', details: error.message });
  }
});

// POST /api/dashboard/aliases - Create a supplier alias
// Use when near-match identified: "Castle Fuel" → "Castle Fuel Inc."
router.post('/aliases', async (req, res) => {
  const logger = req.app.locals.logger;
  const sequelize = req.app.locals.sequelize;

  if (!sequelize) {
    return res.status(503).json({ error: 'Database not available' });
  }

  const { aliasName, supplierId, scopeState, scopeZipPrefix } = req.body;

  if (!aliasName || !supplierId) {
    return res.status(400).json({ error: 'aliasName and supplierId are required' });
  }

  try {
    // Verify supplier exists
    const [suppliers] = await sequelize.query(`
      SELECT id, name FROM suppliers WHERE id = :supplierId
    `, { replacements: { supplierId } });

    if (suppliers.length === 0) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    // Insert alias
    await sequelize.query(`
      INSERT INTO supplier_aliases (supplier_id, alias_name, scope_state, scope_zip_prefix)
      VALUES (:supplierId, :aliasName, :scopeState, :scopeZipPrefix)
    `, {
      replacements: {
        supplierId,
        aliasName: aliasName.trim(),
        scopeState: scopeState || null,
        scopeZipPrefix: scopeZipPrefix || null
      }
    });

    logger.info(`[Dashboard] Created alias: "${aliasName}" → "${suppliers[0].name}"`);

    res.json({
      success: true,
      alias: {
        aliasName: aliasName.trim(),
        canonicalName: suppliers[0].name,
        supplierId,
        scopeState: scopeState || null,
        scopeZipPrefix: scopeZipPrefix || null
      }
    });
  } catch (error) {
    if (error.message.includes('unique constraint')) {
      return res.status(409).json({ error: 'This alias already exists' });
    }
    logger.error('[Dashboard] Create alias error:', error.message);
    res.status(500).json({ error: 'Failed to create alias', details: error.message });
  }
});

// DELETE /api/dashboard/aliases/:id - Remove a supplier alias
router.delete('/aliases/:id', async (req, res) => {
  const logger = req.app.locals.logger;
  const sequelize = req.app.locals.sequelize;

  if (!sequelize) {
    return res.status(503).json({ error: 'Database not available' });
  }

  const { id } = req.params;

  try {
    const [result] = await sequelize.query(`
      DELETE FROM supplier_aliases WHERE id = :id RETURNING alias_name
    `, { replacements: { id } });

    if (result.length === 0) {
      return res.status(404).json({ error: 'Alias not found' });
    }

    logger.info(`[Dashboard] Deleted alias: "${result[0].alias_name}"`);

    res.json({ success: true, deleted: result[0].alias_name });
  } catch (error) {
    logger.error('[Dashboard] Delete alias error:', error.message);
    res.status(500).json({ error: 'Failed to delete alias', details: error.message });
  }
});

// GET /api/dashboard/price-alerts - Significant price changes
router.get('/price-alerts', async (req, res) => {
  const logger = req.app.locals.logger;
  const sequelize = req.app.locals.sequelize;

  if (!sequelize) {
    return res.status(503).json({ error: 'Database not available' });
  }

  try {
    // Find suppliers with significant price changes in last 7 days
    const alerts = await sequelize.query(`
      WITH recent_prices AS (
        SELECT
          supplier_id,
          price_per_gallon,
          scraped_at,
          LAG(price_per_gallon) OVER (PARTITION BY supplier_id ORDER BY scraped_at) as prev_price
        FROM supplier_prices
        WHERE scraped_at > NOW() - INTERVAL '7 days'
          AND is_valid = true
      )
      SELECT
        s.name,
        s.id as supplier_id,
        rp.price_per_gallon as current_price,
        rp.prev_price,
        rp.price_per_gallon - rp.prev_price as change,
        rp.scraped_at
      FROM recent_prices rp
      JOIN suppliers s ON rp.supplier_id = s.id
      WHERE rp.prev_price IS NOT NULL
        AND ABS(rp.price_per_gallon - rp.prev_price) >= 0.10
      ORDER BY ABS(rp.price_per_gallon - rp.prev_price) DESC
      LIMIT 20
    `, { type: sequelize.QueryTypes.SELECT });

    res.json({
      alerts: alerts.map(a => ({
        supplierName: a.name,
        supplierId: a.supplier_id,
        currentPrice: parseFloat(a.current_price),
        previousPrice: parseFloat(a.prev_price),
        change: parseFloat(a.change),
        changePercent: ((parseFloat(a.change) / parseFloat(a.prev_price)) * 100).toFixed(1),
        direction: parseFloat(a.change) > 0 ? 'up' : 'down',
        detectedAt: a.scraped_at
      })),
      threshold: 0.10
    });
  } catch (error) {
    logger.error('[Dashboard] Price alerts error:', error.message);
    res.status(500).json({ error: 'Failed to load price alerts', details: error.message });
  }
});

// GET /api/dashboard/coverage-details - Get detailed ZIP lists for coverage gaps
router.get('/coverage-details', async (req, res) => {
  const logger = req.app.locals.logger;
  const sequelize = req.app.locals.sequelize;

  if (!sequelize) {
    return res.status(503).json({ error: 'Database not available' });
  }

  try {
    const days = parseDays(req, 30);
    const type = req.query.type; // 'no-suppliers' or 'low-engagement'

    // Load ZIP database for city/county info
    const zipDbPath = path.join(__dirname, '../data/zip-database.json');
    let zipCoords = {};
    try {
      zipCoords = JSON.parse(fs.readFileSync(zipDbPath, 'utf8'));
    } catch (e) {
      logger.warn('[Dashboard] Could not load zip-database.json');
    }

    let zips = [];

    if (type === 'no-suppliers') {
      // ZIPs searched but no supplier covers them
      const result = await sequelize.query(`
        SELECT DISTINCT ul.zip_code, COUNT(*) as search_count
        FROM user_locations ul
        WHERE ul.created_at > NOW() - INTERVAL '${days} days'
          AND NOT EXISTS (
            SELECT 1 FROM suppliers s
            WHERE s.active = true
              AND s.postal_codes_served IS NOT NULL
              AND s.postal_codes_served @> to_jsonb(ul.zip_code::text)
          )
        GROUP BY ul.zip_code
        ORDER BY search_count DESC
        LIMIT 100
      `, { type: sequelize.QueryTypes.SELECT });

      zips = result.map(r => ({
        zip: r.zip_code,
        searches: parseInt(r.search_count),
        city: zipCoords[r.zip_code]?.city || '--',
        county: zipCoords[r.zip_code]?.county || '--',
        state: zipCoords[r.zip_code]?.state || '--'
      }));
    } else if (type === 'low-engagement') {
      // ZIPs with suppliers but no clicks
      const result = await sequelize.query(`
        SELECT DISTINCT ul.zip_code, COUNT(*) as search_count
        FROM user_locations ul
        WHERE ul.created_at > NOW() - INTERVAL '${days} days'
          AND EXISTS (
            SELECT 1 FROM suppliers s
            WHERE s.active = true
              AND s.postal_codes_served IS NOT NULL
              AND s.postal_codes_served @> to_jsonb(ul.zip_code::text)
          )
          AND NOT EXISTS (
            SELECT 1 FROM supplier_clicks sc
            WHERE sc.zip_code = ul.zip_code
              AND sc.created_at > NOW() - INTERVAL '${days} days'
          )
        GROUP BY ul.zip_code
        ORDER BY search_count DESC
        LIMIT 100
      `, { type: sequelize.QueryTypes.SELECT });

      zips = result.map(r => ({
        zip: r.zip_code,
        searches: parseInt(r.search_count),
        city: zipCoords[r.zip_code]?.city || '--',
        county: zipCoords[r.zip_code]?.county || '--',
        state: zipCoords[r.zip_code]?.state || '--'
      }));
    } else {
      return res.status(400).json({ error: 'Invalid type. Use "no-suppliers" or "low-engagement"' });
    }

    res.json({
      type,
      period: `${days}d`,
      count: zips.length,
      zips
    });
  } catch (error) {
    logger.error('[Dashboard] Coverage details error:', error.message);
    res.status(500).json({ error: 'Failed to load coverage details', details: error.message });
  }
});

// DELETE /api/dashboard/suppliers/:id - Remove supplier
router.delete('/suppliers/:id', async (req, res) => {
  const logger = req.app.locals.logger;
  const sequelize = req.app.locals.sequelize;

  if (!sequelize) {
    return res.status(503).json({ error: 'Database not available' });
  }

  try {
    const { id } = req.params;

    // Get supplier name for logging
    const [supplier] = await sequelize.query(`
      SELECT name FROM suppliers WHERE id = :id
    `, { replacements: { id }, type: sequelize.QueryTypes.SELECT });

    if (!supplier) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    // Soft delete by setting active = false
    await sequelize.query(`
      UPDATE suppliers SET active = false, updated_at = NOW() WHERE id = :id
    `, { replacements: { id } });

    logger.info(`[Dashboard] Deactivated supplier: ${supplier.name} (${id})`);

    res.json({ success: true, message: `Supplier "${supplier.name}" deactivated` });
  } catch (error) {
    logger.error('[Dashboard] Supplier delete error:', error.message);
    res.status(500).json({ error: 'Failed to delete supplier', details: error.message });
  }
});

// ========================================
// UNIFIED INTELLIGENCE ENDPOINTS
// ========================================

// GET /api/dashboard/unified - Combined metrics from all sources
router.get('/unified', async (req, res) => {
  const logger = req.app.locals.logger;

  try {
    const days = parseDays(req);
    const analytics = getUnifiedAnalytics(req);
    const data = await analytics.getUnifiedOverview(days);

    // Add credentials diagnostic info for debugging
    const fbCreds = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    const credsDiag = {};
    if (!fbCreds) {
      credsDiag.status = 'FIREBASE_SERVICE_ACCOUNT_JSON not set';
    } else {
      const trimmed = fbCreds.trim();
      credsDiag.length = trimmed.length;
      credsDiag.startsWithBrace = trimmed[0] === '{';
      credsDiag.startsWithEwog = trimmed.substring(0, 4) === 'ewog';

      // Try raw JSON first (since that's what Railway has)
      try {
        const parsed = JSON.parse(trimmed);
        credsDiag.rawJsonValid = true;
        credsDiag.projectId = parsed.project_id;
        credsDiag.hasPrivateKey = !!parsed.private_key;
        credsDiag.hasClientEmail = !!parsed.client_email;
        credsDiag.clientEmail = parsed.client_email;
      } catch (e) {
        credsDiag.rawJsonValid = false;
        credsDiag.rawJsonError = e.message;

        // Try base64 decode
        try {
          const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
          const parsed = JSON.parse(decoded);
          credsDiag.base64JsonValid = true;
          credsDiag.projectId = parsed.project_id;
        } catch (e2) {
          credsDiag.base64JsonValid = false;
          credsDiag.base64JsonError = e2.message;
        }
      }
    }
    data.credentialsDiagnostic = credsDiag;

    res.json(data);
  } catch (error) {
    logger.error('[Dashboard] Unified overview error:', error.message);
    res.status(500).json({ error: 'Failed to load unified data', details: error.message });
  }
});

// GET /api/dashboard/retention - Cohort analysis + recommendations
router.get('/retention', async (req, res) => {
  const logger = req.app.locals.logger;

  try {
    const weeks = parseInt(req.query.weeks) || 6;
    const analytics = getUnifiedAnalytics(req);
    const data = await analytics.getRetentionAnalysis(weeks);

    res.json(data);
  } catch (error) {
    logger.error('[Dashboard] Retention analysis error:', error.message);
    res.status(500).json({ error: 'Failed to load retention data', details: error.message });
  }
});

// GET /api/dashboard/acquisition - Channel performance + suggestions
router.get('/acquisition', async (req, res) => {
  const logger = req.app.locals.logger;

  try {
    const days = parseDays(req, 30);
    const analytics = getUnifiedAnalytics(req);
    const data = await analytics.getAcquisitionAnalysis(days);

    res.json(data);
  } catch (error) {
    logger.error('[Dashboard] Acquisition analysis error:', error.message);
    res.status(500).json({ error: 'Failed to load acquisition data', details: error.message });
  }
});

// GET /api/dashboard/growth-signals - Android decision data
router.get('/growth-signals', async (req, res) => {
  const logger = req.app.locals.logger;

  try {
    const analytics = getUnifiedAnalytics(req);
    const data = await analytics.getAndroidDecisionSignals();

    res.json(data);
  } catch (error) {
    logger.error('[Dashboard] Growth signals error:', error.message);
    res.status(500).json({ error: 'Failed to load growth signals', details: error.message });
  }
});

// GET /api/dashboard/zip-users - Analyze unique users by ZIP code
// Helps identify if activity in a ZIP is from one user or multiple users
router.get('/zip-users', async (req, res) => {
  const logger = req.app.locals.logger;
  const sequelize = req.app.locals.sequelize;

  if (!sequelize) {
    return res.status(503).json({ error: 'Database not available' });
  }

  try {
    const zip = req.query.zip || '10549'; // Default to Mount Kisco
    const days = parseDays(req, 90);

    // Get unique users who searched this ZIP
    const userStatsResult = await sequelize.query(`
      SELECT
        COUNT(DISTINCT device_id) as unique_devices,
        COUNT(DISTINCT ip_hash) as unique_ips,
        COUNT(DISTINCT COALESCE(device_id, ip_hash)) as unique_users,
        COUNT(*) as total_requests
      FROM api_activity
      WHERE zip_code = :zip
        AND created_at >= NOW() - INTERVAL '${days} days'
    `, {
      replacements: { zip },
      type: sequelize.QueryTypes.SELECT
    });
    const userStats = userStatsResult[0] || {};

    // Get breakdown by device/IP
    const deviceBreakdown = await sequelize.query(`
      SELECT
        COALESCE(device_id, 'NO_DEVICE') as device_id,
        ip_hash,
        COUNT(*) as request_count,
        MIN(created_at) as first_seen,
        MAX(created_at) as last_seen
      FROM api_activity
      WHERE zip_code = :zip
        AND created_at >= NOW() - INTERVAL '${days} days'
      GROUP BY device_id, ip_hash
      ORDER BY request_count DESC
      LIMIT 50
    `, {
      replacements: { zip },
      type: sequelize.QueryTypes.SELECT
    });

    // Check excluded device IDs
    const excludedDevices = (process.env.EXCLUDED_DEVICE_IDS || '')
      .split(',')
      .map(id => id.trim().toUpperCase())
      .filter(id => id.length > 0);

    // Categorize devices as "yours" vs "other users"
    const yourDevices = deviceBreakdown.filter(d =>
      d.device_id !== 'NO_DEVICE' && excludedDevices.includes(d.device_id.toUpperCase())
    );
    const otherUsers = deviceBreakdown.filter(d =>
      d.device_id === 'NO_DEVICE' || !excludedDevices.includes(d.device_id.toUpperCase())
    );

    res.json({
      zip,
      period: `${days}d`,
      stats: {
        uniqueDevices: parseInt(userStats.unique_devices) || 0,
        uniqueIPs: parseInt(userStats.unique_ips) || 0,
        uniqueUsers: parseInt(userStats.unique_users) || 0,
        totalRequests: parseInt(userStats.total_requests) || 0
      },
      excludedDevicesConfigured: excludedDevices.length,
      breakdown: {
        yourDevices: yourDevices.map(d => ({
          deviceId: d.device_id,
          deviceIdPrefix: d.device_id.substring(0, 8) + '...',
          ipHashPrefix: d.ip_hash ? d.ip_hash.substring(0, 8) + '...' : null,
          requests: parseInt(d.request_count),
          firstSeen: d.first_seen,
          lastSeen: d.last_seen
        })),
        otherUsers: otherUsers.map(d => ({
          hasDeviceId: d.device_id !== 'NO_DEVICE',
          deviceId: d.device_id !== 'NO_DEVICE' ? d.device_id : null,
          deviceIdPrefix: d.device_id !== 'NO_DEVICE' ? d.device_id.substring(0, 8) + '...' : null,
          ipHashPrefix: d.ip_hash ? d.ip_hash.substring(0, 8) + '...' : null,
          requests: parseInt(d.request_count),
          firstSeen: d.first_seen,
          lastSeen: d.last_seen
        }))
      },
      summary: {
        yourDeviceCount: yourDevices.length,
        otherUserCount: otherUsers.length,
        isOnlyYou: otherUsers.length === 0
      }
    });
  } catch (error) {
    logger.error('[Dashboard] ZIP users error:', error.message);
    res.status(500).json({ error: 'Failed to analyze ZIP users', details: error.message });
  }
});

// GET /api/dashboard/recommendations - Smart actionable recommendations
router.get('/recommendations', async (req, res) => {
  const logger = req.app.locals.logger;

  try {
    const days = parseDays(req);
    const analytics = getUnifiedAnalytics(req);
    const engine = getRecommendationsEngine(req);

    // Get unified data for recommendations
    const unifiedData = await analytics.getUnifiedOverview(days);

    // Generate recommendations
    const recommendations = await engine.generateRecommendations(unifiedData);
    const summary = engine.summarize(recommendations);

    res.json({
      period: `${days}d`,
      summary,
      recommendations,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    logger.error('[Dashboard] Recommendations error:', error.message);
    res.status(500).json({ error: 'Failed to generate recommendations', details: error.message });
  }
});

// GET /api/dashboard/activity - Recent activity feed (website clicks + iOS app engagements)
// Supports filtering, pagination, and summary stats
router.get('/activity', async (req, res) => {
  const logger = req.app.locals.logger;
  const sequelize = req.app.locals.sequelize;

  if (!sequelize) {
    return res.status(503).json({ error: 'Database not available' });
  }

  try {
    // Parse query params
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const offset = (page - 1) * limit;
    const sourceFilter = req.query.source; // 'website', 'ios', or null for all
    const actionFilter = req.query.action; // 'call', 'website', etc.
    const pageSourceFilter = req.query.pageSource; // 'prices', 'seo-city', etc.
    const supplierSearch = req.query.supplier ? req.query.supplier.trim() : null;
    const dateFrom = req.query.dateFrom; // ISO date string
    const dateTo = req.query.dateTo; // ISO date string
    const days = parseInt(req.query.days) || null; // Quick filter: last N days

    // Build WHERE clauses
    const websiteWhere = [];
    const iosWhere = [];
    const replacements = {};

    // Date filtering
    if (days) {
      websiteWhere.push(`sc.created_at > NOW() - INTERVAL '${days} days'`);
      iosWhere.push(`se.created_at > NOW() - INTERVAL '${days} days'`);
    } else {
      if (dateFrom) {
        websiteWhere.push(`sc.created_at >= :dateFrom`);
        iosWhere.push(`se.created_at >= :dateFrom`);
        replacements.dateFrom = dateFrom;
      }
      if (dateTo) {
        websiteWhere.push(`sc.created_at <= :dateTo`);
        iosWhere.push(`se.created_at <= :dateTo`);
        replacements.dateTo = dateTo;
      }
    }

    // Action filtering
    if (actionFilter) {
      websiteWhere.push(`sc.action_type = :action`);
      iosWhere.push(`se.engagement_type = :action`);
      replacements.action = actionFilter;
    }

    // Page source filtering
    if (pageSourceFilter) {
      websiteWhere.push(`sc.page_source = :pageSource`);
      iosWhere.push(`1=0`); // iOS doesn't have page_source matching website values
      replacements.pageSource = pageSourceFilter;
    }

    // Supplier search
    if (supplierSearch) {
      websiteWhere.push(`(sc.supplier_name ILIKE :supplier OR s.name ILIKE :supplier)`);
      iosWhere.push(`(se.supplier_name ILIKE :supplier OR s.name ILIKE :supplier)`);
      replacements.supplier = `%${supplierSearch}%`;
    }

    // Source filtering
    if (sourceFilter === 'ios') {
      websiteWhere.push('1=0');
    } else if (sourceFilter === 'website') {
      iosWhere.push('1=0');
    }

    const websiteWhereClause = websiteWhere.length > 0 ? `WHERE ${websiteWhere.join(' AND ')}` : '';
    const iosWhereClause = iosWhere.length > 0 ? `WHERE ${iosWhere.join(' AND ')}` : '';

    // Get total count first
    const [countResult] = await sequelize.query(`
      SELECT COUNT(*) as total FROM (
        SELECT sc.id FROM supplier_clicks sc
        LEFT JOIN suppliers s ON sc.supplier_id = s.id
        ${websiteWhereClause}
        UNION ALL
        SELECT se.id FROM supplier_engagements se
        LEFT JOIN suppliers s ON se.supplier_id = s.id
        ${iosWhereClause}
      ) combined
    `, { replacements });
    const totalCount = parseInt(countResult[0]?.total || 0);

    // Get paginated activity
    const [activity] = await sequelize.query(`
      WITH combined AS (
        SELECT
          sc.id,
          sc.supplier_name,
          sc.action_type as action,
          sc.zip_code,
          sc.device_type,
          sc.platform,
          sc.page_source,
          sc.created_at,
          'website' as source_type,
          s.name as resolved_name,
          s.state as supplier_state,
          s.city as supplier_city
        FROM supplier_clicks sc
        LEFT JOIN suppliers s ON sc.supplier_id = s.id
        ${websiteWhereClause}

        UNION ALL

        SELECT
          se.id,
          se.supplier_name,
          se.engagement_type as action,
          se.user_zip as zip_code,
          'mobile' as device_type,
          'ios' as platform,
          'ios_app' as page_source,
          se.created_at,
          'ios_app' as source_type,
          s.name as resolved_name,
          s.state as supplier_state,
          s.city as supplier_city
        FROM supplier_engagements se
        LEFT JOIN suppliers s ON se.supplier_id = s.id
        ${iosWhereClause}
      )
      SELECT * FROM combined
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `, { replacements });

    // Get summary stats
    const [summaryStats] = await sequelize.query(`
      SELECT
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 day') as today,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as this_week,
        COUNT(*) FILTER (WHERE action_type = 'call' AND created_at > NOW() - INTERVAL '7 days') as calls_week,
        COUNT(*) FILTER (WHERE action_type = 'website' AND created_at > NOW() - INTERVAL '7 days') as websites_week,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '14 days' AND created_at <= NOW() - INTERVAL '7 days') as last_week
      FROM supplier_clicks
    `);

    // Get top supplier this week
    const [topSupplier] = await sequelize.query(`
      SELECT supplier_name, COUNT(*) as clicks
      FROM supplier_clicks
      WHERE created_at > NOW() - INTERVAL '7 days'
        AND supplier_name IS NOT NULL
      GROUP BY supplier_name
      ORDER BY clicks DESC
      LIMIT 1
    `);

    // Format for display
    const formatted = activity.map(a => ({
      id: a.id,
      supplier: a.resolved_name || a.supplier_name || 'Unknown',
      supplierLocation: a.supplier_city && a.supplier_state
        ? `${a.supplier_city}, ${a.supplier_state}`
        : a.supplier_state || null,
      action: a.action,
      userZip: a.zip_code,
      device: a.device_type,
      platform: a.platform,
      source: a.source_type,
      pageSource: a.page_source,
      timestamp: a.created_at
    }));

    // Calculate trend (this week vs last week)
    const thisWeek = parseInt(summaryStats[0]?.this_week || 0);
    const lastWeek = parseInt(summaryStats[0]?.last_week || 0);
    const trend = lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : (thisWeek > 0 ? 100 : 0);

    res.json({
      // Pagination info
      page,
      limit,
      totalCount,
      totalPages: Math.ceil(totalCount / limit),

      // Summary stats
      summary: {
        today: parseInt(summaryStats[0]?.today || 0),
        thisWeek: thisWeek,
        callsThisWeek: parseInt(summaryStats[0]?.calls_week || 0),
        websitesThisWeek: parseInt(summaryStats[0]?.websites_week || 0),
        topSupplier: topSupplier[0]?.supplier_name || null,
        topSupplierClicks: parseInt(topSupplier[0]?.clicks || 0),
        trend: trend,
        trendDirection: trend > 0 ? 'up' : trend < 0 ? 'down' : 'flat'
      },

      // Activity data
      count: formatted.length,
      activity: formatted
    });
  } catch (error) {
    logger.error('[Dashboard] Activity error:', error.message);
    res.status(500).json({ error: 'Failed to fetch activity', details: error.message });
  }
});

/**
 * GET /api/dashboard/onboarding-funnel
 * Returns onboarding step completion rates for funnel analysis.
 * Used to identify drop-off points and measure onboarding effectiveness.
 */
router.get('/onboarding-funnel', async (req, res) => {
  const sequelize = req.app.locals.sequelize;
  const logger = req.app.locals.logger || console;
  const days = parseDays(req, 30);

  try {
    // Get step counts by action
    const [stepData] = await sequelize.query(`
      SELECT
        step_name,
        action,
        COUNT(*) as count,
        COUNT(DISTINCT ip_hash) as unique_users
      FROM onboarding_steps
      WHERE created_at > NOW() - INTERVAL '${days} days'
      GROUP BY step_name, action
      ORDER BY step_name, action
    `);

    // Get daily totals for trend chart
    const [dailyData] = await sequelize.query(`
      SELECT
        DATE(created_at) as date,
        step_name,
        action,
        COUNT(*) as count
      FROM onboarding_steps
      WHERE created_at > NOW() - INTERVAL '${days} days'
      GROUP BY DATE(created_at), step_name, action
      ORDER BY date DESC
    `);

    // Get regional breakdown
    const [regionalData] = await sequelize.query(`
      SELECT
        zip_prefix,
        COUNT(*) as total_events,
        COUNT(*) FILTER (WHERE step_name = 'onboarding' AND action = 'completed') as completions
      FROM onboarding_steps
      WHERE created_at > NOW() - INTERVAL '${days} days'
        AND zip_prefix IS NOT NULL
      GROUP BY zip_prefix
      ORDER BY total_events DESC
      LIMIT 20
    `);

    // Get app version breakdown
    const [versionData] = await sequelize.query(`
      SELECT
        app_version,
        COUNT(*) as total_events,
        COUNT(*) FILTER (WHERE step_name = 'onboarding' AND action = 'completed') as completions
      FROM onboarding_steps
      WHERE created_at > NOW() - INTERVAL '${days} days'
        AND app_version IS NOT NULL
      GROUP BY app_version
      ORDER BY total_events DESC
    `);

    // Calculate funnel metrics
    const stepOrder = [
      'value_screen', 'intent', 'postal_code', 'tank_size',
      'home_size', 'tank_level', 'notifications', 'smartburn', 'consent'
    ];

    const funnelSteps = stepOrder.map(step => {
      const viewed = stepData.find(d => d.step_name === step && d.action === 'viewed');
      const completed = stepData.find(d => d.step_name === step && (d.action === 'completed' || d.action === 'continue' || d.action === 'selected' || d.action === 'granted'));
      const skipped = stepData.find(d => d.step_name === step && d.action === 'skipped');

      return {
        step,
        viewed: parseInt(viewed?.count || 0),
        viewedUnique: parseInt(viewed?.unique_users || 0),
        completed: parseInt(completed?.count || 0),
        skipped: parseInt(skipped?.count || 0),
        completionRate: viewed?.count > 0
          ? Math.round((completed?.count || 0) / viewed.count * 100)
          : 0
      };
    });

    // Calculate overall completion rate
    const firstStep = funnelSteps[0];
    const lastStep = funnelSteps[funnelSteps.length - 1];
    const overallCompletionRate = firstStep.viewed > 0
      ? Math.round(lastStep.completed / firstStep.viewed * 100)
      : 0;

    res.json({
      period: `${days}d`,
      funnel: funnelSteps,
      overallCompletionRate,
      daily: dailyData,
      byRegion: regionalData,
      byVersion: versionData,
      totalEvents: stepData.reduce((sum, d) => sum + parseInt(d.count), 0)
    });

  } catch (error) {
    // Table might not exist yet
    if (error.message.includes('relation "onboarding_steps" does not exist')) {
      return res.json({
        period: `${days}d`,
        funnel: [],
        overallCompletionRate: 0,
        daily: [],
        byRegion: [],
        byVersion: [],
        totalEvents: 0,
        note: 'Onboarding tracking not yet set up - run migration 018'
      });
    }

    logger.error('[Dashboard] Onboarding funnel error:', error.message);
    res.status(500).json({ error: 'Failed to fetch onboarding data', details: error.message });
  }
});

// ============================================================================
// APP ANALYTICS ENDPOINTS (V2.15.0)
// Comprehensive backend tracking without consent requirement
// ============================================================================

/**
 * GET /api/dashboard/app-analytics
 * Overview of all app analytics from app_events table
 */
router.get('/app-analytics', async (req, res) => {
  const sequelize = req.app.locals.sequelize;
  const logger = req.app.locals.logger || console;
  const days = parseDays(req, 30);

  try {
    const [
      // Retention metrics
      [dauData],
      [retentionData],
      // Feature usage
      [featureData],
      // Conversion
      [conversionData],
      // Propane
      [propaneData],
      // Coverage
      [coverageData],
      // Totals
      [totalData]
    ] = await Promise.all([
      // DAU/WAU/MAU
      sequelize.query(`
        SELECT
          COUNT(DISTINCT device_id_hash) FILTER (WHERE created_at > NOW() - INTERVAL '1 day') as dau,
          COUNT(DISTINCT device_id_hash) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as wau,
          COUNT(DISTINCT device_id_hash) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as mau,
          COUNT(DISTINCT device_id_hash) as total_devices
        FROM app_events
        WHERE device_id_hash IS NOT NULL
      `, { type: sequelize.QueryTypes.SELECT }),

      // Retention by cohort (simplified - users who came back)
      sequelize.query(`
        SELECT
          COUNT(DISTINCT device_id_hash) FILTER (
            WHERE device_id_hash IN (
              SELECT device_id_hash FROM app_events
              WHERE event_name = 'app_opened'
              AND created_at > NOW() - INTERVAL '7 days'
              AND created_at < NOW() - INTERVAL '1 day'
            )
            AND created_at > NOW() - INTERVAL '1 day'
          ) as returned_users,
          COUNT(DISTINCT device_id_hash) FILTER (
            WHERE event_name = 'app_opened'
            AND created_at > NOW() - INTERVAL '7 days'
            AND created_at < NOW() - INTERVAL '1 day'
          ) as cohort_size
        FROM app_events
      `, { type: sequelize.QueryTypes.SELECT }),

      // Feature usage
      sequelize.query(`
        SELECT
          event_data->>'feature' as feature,
          COUNT(*) as usage_count,
          COUNT(DISTINCT device_id_hash) as unique_users
        FROM app_events
        WHERE event_name = 'feature_used'
          AND created_at > NOW() - INTERVAL '${days} days'
        GROUP BY event_data->>'feature'
        ORDER BY usage_count DESC
        LIMIT 20
      `, { type: sequelize.QueryTypes.SELECT }),

      // Conversion events
      sequelize.query(`
        SELECT
          event_name,
          COUNT(*) as count,
          COUNT(DISTINCT device_id_hash) as unique_users
        FROM app_events
        WHERE event_name IN ('delivery_logged', 'tank_reading_added', 'supplier_contacted', 'onboarding_completed')
          AND created_at > NOW() - INTERVAL '${days} days'
        GROUP BY event_name
      `, { type: sequelize.QueryTypes.SELECT }),

      // Propane metrics
      sequelize.query(`
        SELECT
          fuel_type,
          COUNT(*) as event_count,
          COUNT(DISTINCT device_id_hash) as unique_devices,
          COUNT(DISTINCT zip_prefix) as unique_regions
        FROM app_events
        WHERE fuel_type IS NOT NULL
          AND created_at > NOW() - INTERVAL '${days} days'
        GROUP BY fuel_type
      `, { type: sequelize.QueryTypes.SELECT }),

      // Coverage gaps (directory searches with no results)
      sequelize.query(`
        SELECT
          zip_prefix,
          COUNT(*) as no_result_count
        FROM app_events
        WHERE event_name = 'directory_no_results'
          AND created_at > NOW() - INTERVAL '${days} days'
          AND zip_prefix IS NOT NULL
        GROUP BY zip_prefix
        ORDER BY no_result_count DESC
        LIMIT 20
      `, { type: sequelize.QueryTypes.SELECT }),

      // Total events
      sequelize.query(`
        SELECT
          COUNT(*) as total_events,
          COUNT(DISTINCT device_id_hash) as total_devices,
          MIN(created_at) as first_event,
          MAX(created_at) as last_event
        FROM app_events
        WHERE created_at > NOW() - INTERVAL '${days} days'
      `, { type: sequelize.QueryTypes.SELECT })
    ]);

    // Calculate retention rate
    const retentionRate = retentionData.cohort_size > 0
      ? Math.round((retentionData.returned_users / retentionData.cohort_size) * 100)
      : 0;

    // Calculate propane percentage
    const propaneEvents = propaneData.find(p => p.fuel_type === 'propane');
    const oilEvents = propaneData.find(p => p.fuel_type === 'heating_oil');
    const propanePercentage = (propaneEvents?.unique_devices && oilEvents?.unique_devices)
      ? Math.round((propaneEvents.unique_devices / (propaneEvents.unique_devices + oilEvents.unique_devices)) * 100)
      : 0;

    res.json({
      period: `${days}d`,
      retention: {
        dau: parseInt(dauData.dau || 0),
        wau: parseInt(dauData.wau || 0),
        mau: parseInt(dauData.mau || 0),
        totalDevices: parseInt(dauData.total_devices || 0),
        retentionRate: retentionRate,
        returnedUsers: parseInt(retentionData.returned_users || 0),
        cohortSize: parseInt(retentionData.cohort_size || 0)
      },
      features: featureData.map(f => ({
        feature: f.feature || 'unknown',
        usageCount: parseInt(f.usage_count),
        uniqueUsers: parseInt(f.unique_users)
      })),
      conversion: conversionData.reduce((acc, c) => {
        acc[c.event_name] = {
          count: parseInt(c.count),
          uniqueUsers: parseInt(c.unique_users)
        };
        return acc;
      }, {}),
      propane: {
        propaneUsers: parseInt(propaneEvents?.unique_devices || 0),
        oilUsers: parseInt(oilEvents?.unique_devices || 0),
        propanePercentage,
        propaneRegions: parseInt(propaneEvents?.unique_regions || 0)
      },
      coverageGaps: coverageData.map(c => ({
        zipPrefix: c.zip_prefix,
        noResultCount: parseInt(c.no_result_count)
      })),
      totals: {
        events: parseInt(totalData.total_events || 0),
        devices: parseInt(totalData.total_devices || 0),
        firstEvent: totalData.first_event,
        lastEvent: totalData.last_event
      }
    });

  } catch (error) {
    // Table might not exist yet
    if (error.message.includes('relation "app_events" does not exist')) {
      return res.json({
        period: `${days}d`,
        retention: { dau: 0, wau: 0, mau: 0, totalDevices: 0, retentionRate: 0 },
        features: [],
        conversion: {},
        propane: { propaneUsers: 0, oilUsers: 0, propanePercentage: 0 },
        coverageGaps: [],
        totals: { events: 0, devices: 0 },
        note: 'App events tracking not yet set up - run migration 020'
      });
    }

    logger.error('[Dashboard] App analytics error:', error.message);
    res.status(500).json({ error: 'Failed to fetch app analytics', details: error.message });
  }
});

/**
 * GET /api/dashboard/app-analytics/daily
 * Daily breakdown of app events
 */
router.get('/app-analytics/daily', async (req, res) => {
  const sequelize = req.app.locals.sequelize;
  const logger = req.app.locals.logger || console;
  const days = parseDays(req, 30);

  try {
    const [dailyData] = await sequelize.query(`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as events,
        COUNT(DISTINCT device_id_hash) as unique_devices,
        COUNT(*) FILTER (WHERE event_name = 'app_opened') as app_opens,
        COUNT(*) FILTER (WHERE event_name = 'delivery_logged') as deliveries,
        COUNT(*) FILTER (WHERE event_name = 'tank_reading_added') as readings,
        COUNT(*) FILTER (WHERE fuel_type = 'propane') as propane_events
      FROM app_events
      WHERE created_at > NOW() - INTERVAL '${days} days'
      GROUP BY DATE(created_at)
      ORDER BY date
    `, { type: sequelize.QueryTypes.SELECT });

    res.json({
      period: `${days}d`,
      daily: dailyData.map(d => ({
        date: d.date,
        events: parseInt(d.events),
        uniqueDevices: parseInt(d.unique_devices),
        appOpens: parseInt(d.app_opens),
        deliveries: parseInt(d.deliveries),
        readings: parseInt(d.readings),
        propaneEvents: parseInt(d.propane_events)
      }))
    });

  } catch (error) {
    if (error.message.includes('relation "app_events" does not exist')) {
      return res.json({ period: `${days}d`, daily: [], note: 'Run migration 020' });
    }
    logger.error('[Dashboard] App daily error:', error.message);
    res.status(500).json({ error: 'Failed to fetch daily data' });
  }
});

/**
 * GET /api/dashboard/app-analytics/propane
 * Detailed propane user analytics
 */
router.get('/app-analytics/propane', async (req, res) => {
  const sequelize = req.app.locals.sequelize;
  const logger = req.app.locals.logger || console;
  const days = parseDays(req, 90);

  try {
    const [
      [propaneOverview],
      [propaneByRegion],
      [propaneByEvent],
      [propaneDaily]
    ] = await Promise.all([
      // Overview
      sequelize.query(`
        SELECT
          COUNT(DISTINCT device_id_hash) as total_propane_users,
          COUNT(DISTINCT zip_prefix) as unique_regions,
          COUNT(*) as total_events
        FROM app_events
        WHERE fuel_type = 'propane'
          AND created_at > NOW() - INTERVAL '${days} days'
      `, { type: sequelize.QueryTypes.SELECT }),

      // By region
      sequelize.query(`
        SELECT
          zip_prefix,
          COUNT(DISTINCT device_id_hash) as users,
          COUNT(*) as events
        FROM app_events
        WHERE fuel_type = 'propane'
          AND zip_prefix IS NOT NULL
          AND created_at > NOW() - INTERVAL '${days} days'
        GROUP BY zip_prefix
        ORDER BY users DESC
        LIMIT 20
      `, { type: sequelize.QueryTypes.SELECT }),

      // By event type
      sequelize.query(`
        SELECT
          event_name,
          COUNT(*) as count,
          COUNT(DISTINCT device_id_hash) as unique_users
        FROM app_events
        WHERE fuel_type = 'propane'
          AND created_at > NOW() - INTERVAL '${days} days'
        GROUP BY event_name
        ORDER BY count DESC
      `, { type: sequelize.QueryTypes.SELECT }),

      // Daily trend
      sequelize.query(`
        SELECT
          DATE(created_at) as date,
          COUNT(DISTINCT device_id_hash) as users,
          COUNT(*) as events
        FROM app_events
        WHERE fuel_type = 'propane'
          AND created_at > NOW() - INTERVAL '${days} days'
        GROUP BY DATE(created_at)
        ORDER BY date
      `, { type: sequelize.QueryTypes.SELECT })
    ]);

    res.json({
      period: `${days}d`,
      overview: {
        totalUsers: parseInt(propaneOverview.total_propane_users || 0),
        uniqueRegions: parseInt(propaneOverview.unique_regions || 0),
        totalEvents: parseInt(propaneOverview.total_events || 0)
      },
      byRegion: propaneByRegion.map(r => ({
        zipPrefix: r.zip_prefix,
        users: parseInt(r.users),
        events: parseInt(r.events)
      })),
      byEvent: propaneByEvent.map(e => ({
        event: e.event_name,
        count: parseInt(e.count),
        uniqueUsers: parseInt(e.unique_users)
      })),
      daily: propaneDaily.map(d => ({
        date: d.date,
        users: parseInt(d.users),
        events: parseInt(d.events)
      }))
    });

  } catch (error) {
    if (error.message.includes('relation "app_events" does not exist')) {
      return res.json({ period: `${days}d`, overview: {}, byRegion: [], byEvent: [], daily: [], note: 'Run migration 020' });
    }
    logger.error('[Dashboard] Propane analytics error:', error.message);
    res.status(500).json({ error: 'Failed to fetch propane data' });
  }
});

// ============================================================================
// SCOPE 18: Dashboard Intelligence Enhancement Endpoints
// ============================================================================

/**
 * GET /api/dashboard/leaderboard
 * Supplier rankings with intelligence signals explaining WHY they rank
 *
 * Signals:
 * - 🔥 brand_power: High clicks despite above-market price
 * - 💰 price_leader: Lowest price drives volume
 * - ⚠️ missing_price: Clicks but no price data (scrape priority)
 * - 📍 local_favorite: 80%+ clicks from single ZIP
 * - 📉 underperformer: Has price, clicks below expected
 * - 🆕 rising_star: Week-over-week growth >50%
 * - 🔄 directory_driven: High directory attribution
 */
router.get('/leaderboard', async (req, res) => {
  const days = parseDays(req, 30);
  const sequelize = req.app.locals.sequelize;
  const logger = req.app.locals.logger || console;

  try {
    // Get supplier engagement with weighted scoring
    // Weights: view=1, call=2, quote=4, order=5
    // Uses FULL OUTER JOIN to include suppliers with clicks OR orders/quotes
    const [suppliers] = await sequelize.query(`
      WITH click_data AS (
        SELECT
          sc.supplier_id,
          COUNT(*) as total_clicks,
          COUNT(*) FILTER (WHERE sc.action_type = 'call') as calls,
          COUNT(*) FILTER (WHERE sc.action_type = 'website') as websites,
          COUNT(DISTINCT sc.zip_code) as unique_zips,
          MODE() WITHIN GROUP (ORDER BY sc.zip_code) as top_zip,
          COUNT(*) FILTER (WHERE sc.created_at > NOW() - INTERVAL '7 days') as clicks_7d,
          COUNT(*) FILTER (WHERE sc.created_at > NOW() - INTERVAL '14 days'
                          AND sc.created_at <= NOW() - INTERVAL '7 days') as clicks_prev_7d
        FROM supplier_clicks sc
        JOIN suppliers s ON sc.supplier_id = s.id
        WHERE sc.created_at > NOW() - INTERVAL '${days} days'
          AND s.active = true
        GROUP BY sc.supplier_id
      ),
      engagement_data AS (
        -- Orders and quotes from supplier_engagements
        -- First try supplier_id, then fallback to name matching, then alias matching
        SELECT
          supplier_id,
          SUM(orders) as orders,
          SUM(quotes) as quotes
        FROM (
          -- Match by supplier_id
          SELECT
            se.supplier_id,
            COUNT(*) FILTER (WHERE se.engagement_type = 'order_placed') as orders,
            COUNT(*) FILTER (WHERE se.engagement_type = 'request_quote') as quotes
          FROM supplier_engagements se
          JOIN suppliers s ON se.supplier_id = s.id
          WHERE se.created_at > NOW() - INTERVAL '${days} days'
            AND s.active = true
            AND se.supplier_id IS NOT NULL
          GROUP BY se.supplier_id
          UNION ALL
          -- Match by supplier_name when supplier_id is NULL
          SELECT
            s.id as supplier_id,
            COUNT(*) FILTER (WHERE se.engagement_type = 'order_placed') as orders,
            COUNT(*) FILTER (WHERE se.engagement_type = 'request_quote') as quotes
          FROM supplier_engagements se
          JOIN suppliers s ON LOWER(TRIM(se.supplier_name)) = LOWER(TRIM(s.name))
          WHERE se.created_at > NOW() - INTERVAL '${days} days'
            AND s.active = true
            AND se.supplier_id IS NULL
          GROUP BY s.id
          UNION ALL
          -- Match by alias_name when supplier_id is NULL and direct name match fails
          SELECT
            sa.supplier_id,
            COUNT(*) FILTER (WHERE se.engagement_type = 'order_placed') as orders,
            COUNT(*) FILTER (WHERE se.engagement_type = 'request_quote') as quotes
          FROM supplier_engagements se
          JOIN supplier_aliases sa ON LOWER(TRIM(se.supplier_name)) = LOWER(TRIM(sa.alias_name))
          JOIN suppliers s ON sa.supplier_id = s.id
          WHERE se.created_at > NOW() - INTERVAL '${days} days'
            AND s.active = true
            AND se.supplier_id IS NULL
          GROUP BY sa.supplier_id
        ) combined
        GROUP BY supplier_id
      ),
      saves_data AS (
        -- Saves from app_events (supplier_saved)
        -- Match by supplier_name OR alias_name since app_events doesn't have supplier_id
        SELECT supplier_id, SUM(saves) as saves FROM (
          -- Direct name match
          SELECT s.id as supplier_id, COUNT(*) as saves
          FROM app_events ae
          JOIN suppliers s ON LOWER(TRIM(ae.event_data->>'supplier_name')) = LOWER(TRIM(s.name))
          WHERE ae.event_name = 'supplier_saved'
            AND ae.created_at > NOW() - INTERVAL '${days} days'
            AND s.active = true
          GROUP BY s.id
          UNION ALL
          -- Alias match
          SELECT sa.supplier_id, COUNT(*) as saves
          FROM app_events ae
          JOIN supplier_aliases sa ON LOWER(TRIM(ae.event_data->>'supplier_name')) = LOWER(TRIM(sa.alias_name))
          JOIN suppliers s ON sa.supplier_id = s.id
          WHERE ae.event_name = 'supplier_saved'
            AND ae.created_at > NOW() - INTERVAL '${days} days'
            AND s.active = true
          GROUP BY sa.supplier_id
        ) combined
        GROUP BY supplier_id
      ),
      -- All suppliers with ANY engagement (clicks OR orders/quotes OR saves)
      all_engaged_suppliers AS (
        SELECT supplier_id FROM click_data
        UNION
        SELECT supplier_id FROM engagement_data
        UNION
        SELECT supplier_id FROM saves_data
      ),
      price_data AS (
        SELECT DISTINCT ON (supplier_id)
          supplier_id,
          price_per_gallon as current_price,
          scraped_at as price_updated
        FROM supplier_prices
        WHERE is_valid = true
        ORDER BY supplier_id, scraped_at DESC
      ),
      market_avg AS (
        SELECT AVG(price_per_gallon) as avg_price
        FROM supplier_prices sp
        JOIN suppliers s ON sp.supplier_id = s.id
        WHERE sp.is_valid = true
          AND sp.scraped_at > NOW() - INTERVAL '7 days'
          AND s.active = true
      )
      SELECT
        aes.supplier_id,
        s.name as supplier_name,
        s.state,
        s.city,
        COALESCE(cd.total_clicks, 0) as total_clicks,
        COALESCE(cd.calls, 0) as calls,
        COALESCE(cd.websites, 0) as websites,
        COALESCE(cd.unique_zips, 0) as unique_zips,
        cd.top_zip,
        COALESCE(cd.clicks_7d, 0) as clicks_7d,
        COALESCE(cd.clicks_prev_7d, 0) as clicks_prev_7d,
        COALESCE(ed.orders, 0) as orders,
        COALESCE(ed.quotes, 0) as quotes,
        COALESCE(sv.saves, 0) as saves,
        pd.current_price,
        pd.price_updated,
        ma.avg_price as market_avg,
        CASE WHEN pd.current_price IS NOT NULL
          THEN pd.current_price - ma.avg_price
          ELSE NULL
        END as price_delta,
        -- Weighted engagement score: website=1, call=2, save=3, quote=4, order=5
        (COALESCE(cd.websites, 0) * 1 + COALESCE(cd.calls, 0) * 2 + COALESCE(sv.saves, 0) * 3 + COALESCE(ed.quotes, 0) * 4 + COALESCE(ed.orders, 0) * 5) as engagement_score,
        -- Revenue risk calculation: clicks * 3% conversion * $500 order * 5% fee
        ROUND((COALESCE(cd.total_clicks, 0) * 0.03 * 500 * 0.05)::numeric, 0) as est_revenue,
        -- Week-over-week growth
        CASE WHEN cd.clicks_prev_7d > 0
          THEN ROUND(((cd.clicks_7d - cd.clicks_prev_7d)::numeric / cd.clicks_prev_7d * 100), 1)
          ELSE NULL
        END as wow_growth
      FROM all_engaged_suppliers aes
      JOIN suppliers s ON aes.supplier_id = s.id
      LEFT JOIN click_data cd ON aes.supplier_id = cd.supplier_id
      LEFT JOIN engagement_data ed ON aes.supplier_id = ed.supplier_id
      LEFT JOIN saves_data sv ON aes.supplier_id = sv.supplier_id
      LEFT JOIN price_data pd ON aes.supplier_id = pd.supplier_id
      CROSS JOIN market_avg ma
      WHERE s.active = true
      ORDER BY (COALESCE(cd.websites, 0) * 1 + COALESCE(cd.calls, 0) * 2 + COALESCE(sv.saves, 0) * 3 + COALESCE(ed.quotes, 0) * 4 + COALESCE(ed.orders, 0) * 5) DESC,
               COALESCE(cd.total_clicks, 0) DESC
      LIMIT 50
    `);

    // Calculate signals for each supplier
    const marketAvg = suppliers[0]?.market_avg || 3.29;

    const leaderboard = suppliers.map((s, index) => {
      const signals = [];
      let primarySignal = null;

      // Missing price (high priority if clicks > 10)
      if (!s.current_price && s.total_clicks >= 10) {
        signals.push({
          type: 'missing_price',
          icon: '⚠️',
          label: 'Missing price',
          description: 'High demand but no price data - SCRAPE PRIORITY',
          priority: 1
        });
        primarySignal = 'missing_price';
      }

      // Brand power (above market but high clicks)
      const priceDelta = s.price_delta ? parseFloat(s.price_delta) : null;
      if (s.current_price && priceDelta && priceDelta > 0.10 && s.total_clicks >= 20) {
        signals.push({
          type: 'brand_power',
          icon: '🔥',
          label: 'Brand power',
          description: `High clicks despite +$${priceDelta.toFixed(2)} above market`,
          priority: 2
        });
        if (!primarySignal) primarySignal = 'brand_power';
      }

      // Price leader (below market and high clicks)
      if (s.current_price && priceDelta && priceDelta < -0.15 && s.total_clicks >= 15) {
        signals.push({
          type: 'price_leader',
          icon: '💰',
          label: 'Price leader',
          description: `Lowest price (-$${Math.abs(priceDelta).toFixed(2)}) drives volume`,
          priority: 2
        });
        if (!primarySignal) primarySignal = 'price_leader';
      }

      // High converter (has orders/quotes)
      const totalConversions = parseInt(s.orders || 0) + parseInt(s.quotes || 0);
      if (totalConversions >= 1) {
        signals.push({
          type: 'converter',
          icon: '✅',
          label: 'Converter',
          description: `${s.orders || 0} orders, ${s.quotes || 0} quotes`,
          priority: 1  // High priority - actual conversions
        });
        if (!primarySignal) primarySignal = 'converter';
      }

      // Rising star (>50% week-over-week growth)
      if (s.wow_growth > 50 && s.clicks_7d >= 5) {
        signals.push({
          type: 'rising_star',
          icon: '🆕',
          label: 'Rising star',
          description: `+${s.wow_growth}% growth this week`,
          priority: 3
        });
        if (!primarySignal) primarySignal = 'rising_star';
      }

      // Local favorite (80%+ from one ZIP)
      const topZipConcentration = s.unique_zips === 1 ? 100 : (s.total_clicks / s.unique_zips > 5 ? 80 : 50);
      if (topZipConcentration >= 80 && s.total_clicks >= 10) {
        signals.push({
          type: 'local_favorite',
          icon: '📍',
          label: 'Local favorite',
          description: `Strong in ${s.top_zip || 'local area'}`,
          priority: 4
        });
        if (!primarySignal) primarySignal = 'local_favorite';
      }

      // Underperformer (has price but low clicks relative to expected)
      if (s.current_price && s.total_clicks < 5 && s.price_delta <= 0) {
        signals.push({
          type: 'underperformer',
          icon: '📉',
          label: 'Underperformer',
          description: 'Good price but low visibility - check SEO',
          priority: 5
        });
        if (!primarySignal) primarySignal = 'underperformer';
      }

      // Default: standard performer
      if (!primarySignal) {
        primarySignal = 'standard';
      }

      // Revenue risk for missing price
      const revenueRisk = !s.current_price ? s.est_revenue : null;

      return {
        rank: index + 1,
        supplierId: s.supplier_id,
        name: s.supplier_name,
        state: s.state,
        city: s.city,
        engagementScore: parseInt(s.engagement_score) || 0,
        clicks: {
          total: parseInt(s.total_clicks),
          calls: parseInt(s.calls),
          websites: parseInt(s.websites),
          last7Days: parseInt(s.clicks_7d),
          wowGrowth: s.wow_growth ? parseFloat(s.wow_growth) : null
        },
        conversions: {
          orders: parseInt(s.orders) || 0,
          quotes: parseInt(s.quotes) || 0,
          saves: parseInt(s.saves) || 0
        },
        price: s.current_price ? {
          current: parseFloat(s.current_price),
          marketAvg: parseFloat(marketAvg),
          delta: s.price_delta ? parseFloat(s.price_delta) : null,
          updatedAt: s.price_updated
        } : null,
        signals,
        primarySignal,
        estRevenue: parseInt(s.est_revenue) || 0,
        revenueRisk
      };
    });

    // Generate quick wins insights
    const quickWins = [];

    // Missing price suppliers with high clicks
    const missingPriceSuppliers = leaderboard.filter(s => s.primarySignal === 'missing_price');
    if (missingPriceSuppliers.length > 0) {
      const totalRisk = missingPriceSuppliers.reduce((sum, s) => sum + (s.revenueRisk || 0), 0);
      quickWins.push({
        priority: 'high',
        title: `${missingPriceSuppliers.length} supplier(s) need price scraping`,
        insight: `$${totalRisk}/month potential at risk`,
        action: 'Fix scraping for these suppliers',
        suppliers: missingPriceSuppliers.slice(0, 3).map(s => s.name)
      });
    }

    // Brand power suppliers (upsell candidates)
    const brandPowerSuppliers = leaderboard.filter(s => s.primarySignal === 'brand_power');
    if (brandPowerSuppliers.length > 0) {
      quickWins.push({
        priority: 'medium',
        title: `${brandPowerSuppliers.length} supplier(s) show brand power`,
        insight: 'High clicks despite above-market prices',
        action: 'Premium listing candidates',
        suppliers: brandPowerSuppliers.slice(0, 3).map(s => s.name)
      });
    }

    // Top 3 concentration
    const top3Clicks = leaderboard.slice(0, 3).reduce((sum, s) => sum + s.clicks.total, 0);
    const totalClicks = leaderboard.reduce((sum, s) => sum + s.clicks.total, 0);
    const top3Percent = totalClicks > 0 ? Math.round((top3Clicks / totalClicks) * 100) : 0;

    res.json({
      period: `${days}d`,
      summary: {
        totalSuppliers: leaderboard.length,
        totalClicks,
        marketAvg: parseFloat(marketAvg),
        top3Concentration: top3Percent
      },
      leaderboard,
      quickWins,
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    logger.error('[Dashboard] Leaderboard error:', error.message);
    res.status(500).json({ error: 'Failed to generate leaderboard', details: error.message });
  }
});

/**
 * GET /api/dashboard/app-analytics/engagement
 * Session engagement breakdown: power users vs casual vs browse-only
 */
router.get('/app-analytics/engagement', async (req, res) => {
  const days = parseDays(req, 30);
  const sequelize = req.app.locals.sequelize;
  const logger = req.app.locals.logger || console;

  try {
    // Check if app_events table exists
    const [tableCheck] = await sequelize.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'app_events'
      ) as exists
    `);

    if (!tableCheck[0]?.exists) {
      return res.json({
        period: `${days}d`,
        engagement: { power: 0, engaged: 0, casual: 0, browseOnly: 0 },
        note: 'app_events table not found'
      });
    }

    // Get engagement level distribution from session_engagement events
    const [engagement] = await sequelize.query(`
      SELECT
        event_data->>'engagement_level' as level,
        COUNT(DISTINCT device_id_hash) as users,
        COUNT(*) as sessions,
        AVG((event_data->>'screen_count')::int) as avg_screens,
        AVG((event_data->>'action_count')::int) as avg_actions
      FROM app_events
      WHERE event_name = 'session_engagement'
        AND created_at > NOW() - INTERVAL '${days} days'
        AND event_data->>'engagement_level' IS NOT NULL
      GROUP BY event_data->>'engagement_level'
      ORDER BY
        CASE event_data->>'engagement_level'
          WHEN 'power_user' THEN 1
          WHEN 'engaged' THEN 2
          WHEN 'casual' THEN 3
          WHEN 'browse_only' THEN 4
          ELSE 5
        END
    `);

    // Get total unique users for percentage calculation
    const [totalUsers] = await sequelize.query(`
      SELECT COUNT(DISTINCT device_id_hash) as total
      FROM app_events
      WHERE event_name = 'session_engagement'
        AND created_at > NOW() - INTERVAL '${days} days'
    `);

    const total = parseInt(totalUsers[0]?.total) || 1;

    // Map engagement levels
    const levels = {
      power_user: { users: 0, sessions: 0, avgScreens: 0, avgActions: 0, percent: 0 },
      engaged: { users: 0, sessions: 0, avgScreens: 0, avgActions: 0, percent: 0 },
      casual: { users: 0, sessions: 0, avgScreens: 0, avgActions: 0, percent: 0 },
      browse_only: { users: 0, sessions: 0, avgScreens: 0, avgActions: 0, percent: 0 }
    };

    engagement.forEach(row => {
      const level = row.level;
      if (levels[level]) {
        levels[level] = {
          users: parseInt(row.users) || 0,
          sessions: parseInt(row.sessions) || 0,
          avgScreens: parseFloat(row.avg_screens) || 0,
          avgActions: parseFloat(row.avg_actions) || 0,
          percent: Math.round((parseInt(row.users) / total) * 100)
        };
      }
    });

    // Get feature usage
    const [features] = await sequelize.query(`
      SELECT
        event_data->>'feature' as feature,
        COUNT(*) as usage_count,
        COUNT(DISTINCT device_id_hash) as unique_users
      FROM app_events
      WHERE event_name = 'feature_used'
        AND created_at > NOW() - INTERVAL '${days} days'
        AND event_data->>'feature' IS NOT NULL
      GROUP BY event_data->>'feature'
      ORDER BY usage_count DESC
      LIMIT 20
    `);

    // Get screen views
    const [screens] = await sequelize.query(`
      SELECT
        event_data->>'screen' as screen,
        COUNT(*) as views,
        COUNT(DISTINCT device_id_hash) as unique_users
      FROM app_events
      WHERE event_name = 'screen_viewed'
        AND created_at > NOW() - INTERVAL '${days} days'
        AND event_data->>'screen' IS NOT NULL
      GROUP BY event_data->>'screen'
      ORDER BY views DESC
      LIMIT 10
    `);

    res.json({
      period: `${days}d`,
      totalUsers: total,
      engagement: levels,
      features: features.map(f => ({
        feature: f.feature,
        usageCount: parseInt(f.usage_count),
        uniqueUsers: parseInt(f.unique_users)
      })),
      screens: screens.map(s => ({
        screen: s.screen,
        views: parseInt(s.views),
        uniqueUsers: parseInt(s.unique_users),
        percent: Math.round((parseInt(s.unique_users) / total) * 100)
      })),
      insights: {
        powerUserPercent: levels.power_user.percent,
        engagedPercent: levels.engaged.percent,
        atRiskPercent: levels.browse_only.percent,
        recommendation: levels.browse_only.percent > 30
          ? 'High browse-only rate - improve onboarding activation'
          : levels.power_user.percent > 20
            ? 'Strong power user base - consider premium features'
            : 'Focus on moving casual users to engaged'
      },
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    logger.error('[Dashboard] Engagement analytics error:', error.message);
    res.status(500).json({ error: 'Failed to fetch engagement data', details: error.message });
  }
});

/**
 * GET /api/dashboard/app-analytics/deliveries
 * Delivery patterns: repeat suppliers, directory attribution, order timing
 */
router.get('/app-analytics/deliveries', async (req, res) => {
  const days = parseDays(req, 30);
  const sequelize = req.app.locals.sequelize;
  const logger = req.app.locals.logger || console;

  try {
    // Check if app_events table exists
    const [tableCheck] = await sequelize.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'app_events'
      ) as exists
    `);

    if (!tableCheck[0]?.exists) {
      return res.json({ period: `${days}d`, deliveries: [], note: 'app_events table not found' });
    }

    // Get delivery statistics
    const [stats] = await sequelize.query(`
      SELECT
        COUNT(*) as total_deliveries,
        COUNT(DISTINCT device_id_hash) as unique_users,
        -- Repeat supplier analysis
        COUNT(*) FILTER (WHERE (event_data->>'is_repeat_supplier')::boolean = true) as repeat_supplier,
        COUNT(*) FILTER (WHERE (event_data->>'is_repeat_supplier')::boolean = false) as new_supplier,
        -- Directory attribution
        COUNT(*) FILTER (WHERE (event_data->>'from_directory')::boolean = true) as from_directory,
        COUNT(*) FILTER (WHERE (event_data->>'from_directory')::boolean = false) as manual_entry,
        -- Order timing
        COUNT(*) FILTER (WHERE event_data->>'order_timing' = 'on_time') as on_time,
        COUNT(*) FILTER (WHERE event_data->>'order_timing' = 'early') as early,
        COUNT(*) FILTER (WHERE event_data->>'order_timing' = 'late') as late,
        COUNT(*) FILTER (WHERE event_data->>'order_timing' = 'critical') as critical,
        COUNT(*) FILTER (WHERE event_data->>'order_timing' = 'overdue') as overdue,
        -- Delivery number (user lifecycle)
        COUNT(*) FILTER (WHERE event_data->>'delivery_number' = 'first') as first_delivery,
        COUNT(*) FILTER (WHERE event_data->>'delivery_number' = 'second') as second_delivery,
        COUNT(*) FILTER (WHERE event_data->>'delivery_number' = 'regular') as regular_delivery,
        COUNT(*) FILTER (WHERE event_data->>'delivery_number' = 'loyal') as loyal_delivery
      FROM app_events
      WHERE event_name = 'delivery_logged'
        AND created_at > NOW() - INTERVAL '${days} days'
    `);

    const s = stats[0] || {};
    const total = parseInt(s.total_deliveries) || 0;

    // Get gallons distribution
    const [gallons] = await sequelize.query(`
      SELECT
        event_data->>'gallons_bucket' as bucket,
        COUNT(*) as count
      FROM app_events
      WHERE event_name = 'delivery_logged'
        AND created_at > NOW() - INTERVAL '${days} days'
        AND event_data->>'gallons_bucket' IS NOT NULL
      GROUP BY event_data->>'gallons_bucket'
      ORDER BY count DESC
    `);

    // Get top suppliers by deliveries
    const [topSuppliers] = await sequelize.query(`
      SELECT
        event_data->>'supplier_name' as supplier,
        COUNT(*) as deliveries,
        COUNT(DISTINCT device_id_hash) as unique_users
      FROM app_events
      WHERE event_name = 'delivery_logged'
        AND created_at > NOW() - INTERVAL '${days} days'
        AND event_data->>'supplier_name' IS NOT NULL
      GROUP BY event_data->>'supplier_name'
      ORDER BY deliveries DESC
      LIMIT 10
    `);

    const calcPercent = (val) => total > 0 ? Math.round((parseInt(val) / total) * 100) : 0;

    res.json({
      period: `${days}d`,
      summary: {
        totalDeliveries: total,
        uniqueUsers: parseInt(s.unique_users) || 0,
        estOrderValue: total * 500 // $500 avg order
      },
      repeatSupplier: {
        repeat: parseInt(s.repeat_supplier) || 0,
        new: parseInt(s.new_supplier) || 0,
        repeatPercent: calcPercent(s.repeat_supplier),
        insight: calcPercent(s.repeat_supplier) > 50
          ? 'High loyalty - users stick with suppliers'
          : 'Users shop around - price comparison value'
      },
      directoryAttribution: {
        fromDirectory: parseInt(s.from_directory) || 0,
        manualEntry: parseInt(s.manual_entry) || 0,
        directoryPercent: calcPercent(s.from_directory),
        insight: `${calcPercent(s.from_directory)}% of orders attributed to your directory`
      },
      orderTiming: {
        onTime: { count: parseInt(s.on_time) || 0, percent: calcPercent(s.on_time) },
        early: { count: parseInt(s.early) || 0, percent: calcPercent(s.early) },
        late: { count: parseInt(s.late) || 0, percent: calcPercent(s.late) },
        critical: { count: parseInt(s.critical) || 0, percent: calcPercent(s.critical) },
        overdue: { count: parseInt(s.overdue) || 0, percent: calcPercent(s.overdue) },
        insight: calcPercent(s.on_time) > 40
          ? 'Predictions are working - users order on time'
          : 'Users often order late - improve alert timing'
      },
      userLifecycle: {
        first: parseInt(s.first_delivery) || 0,
        second: parseInt(s.second_delivery) || 0,
        regular: parseInt(s.regular_delivery) || 0,
        loyal: parseInt(s.loyal_delivery) || 0
      },
      gallonsDistribution: gallons.map(g => ({
        bucket: g.bucket,
        count: parseInt(g.count),
        percent: calcPercent(g.count)
      })),
      topSuppliers: topSuppliers.map(t => ({
        name: t.supplier,
        deliveries: parseInt(t.deliveries),
        uniqueUsers: parseInt(t.unique_users)
      })),
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    logger.error('[Dashboard] Deliveries analytics error:', error.message);
    res.status(500).json({ error: 'Failed to fetch delivery data', details: error.message });
  }
});

/**
 * GET /api/dashboard/fve
 * First Value Event tracking - measures when users first experience value
 */
router.get('/fve', async (req, res) => {
  const days = parseDays(req, 30);
  const sequelize = req.app.locals.sequelize;
  const logger = req.app.locals.logger || console;

  try {
    // Check if app_events table exists
    const [tableCheck] = await sequelize.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'app_events'
      ) as exists
    `);

    if (!tableCheck[0]?.exists) {
      return res.json({ period: `${days}d`, fve: {}, note: 'app_events table not found' });
    }

    // Define First Value Events (FVE)
    // FVE = first delivery_logged OR first prediction_viewed OR first supplier_contacted
    const [fveStats] = await sequelize.query(`
      WITH user_first_events AS (
        SELECT
          device_id_hash,
          MIN(created_at) as first_app_open,
          MIN(created_at) FILTER (WHERE event_name = 'delivery_logged') as first_delivery,
          MIN(created_at) FILTER (WHERE event_name = 'prediction_viewed') as first_prediction,
          MIN(created_at) FILTER (WHERE event_name = 'supplier_contacted') as first_contact,
          MIN(created_at) FILTER (WHERE event_name = 'tank_reading_added') as first_reading
        FROM app_events
        WHERE created_at > NOW() - INTERVAL '${days} days'
        GROUP BY device_id_hash
      ),
      fve_calculated AS (
        SELECT
          device_id_hash,
          first_app_open,
          LEAST(
            COALESCE(first_delivery, '2099-01-01'),
            COALESCE(first_prediction, '2099-01-01'),
            COALESCE(first_contact, '2099-01-01'),
            COALESCE(first_reading, '2099-01-01')
          ) as first_value_event,
          first_delivery IS NOT NULL as reached_delivery,
          first_prediction IS NOT NULL as reached_prediction,
          first_contact IS NOT NULL as reached_contact,
          first_reading IS NOT NULL as reached_reading
        FROM user_first_events
      )
      SELECT
        COUNT(*) as total_users,
        COUNT(*) FILTER (WHERE first_value_event < '2099-01-01') as reached_fve,
        COUNT(*) FILTER (WHERE first_value_event < '2099-01-01'
                         AND first_value_event - first_app_open < INTERVAL '72 hours') as fve_within_72h,
        COUNT(*) FILTER (WHERE reached_delivery) as reached_delivery,
        COUNT(*) FILTER (WHERE reached_prediction) as reached_prediction,
        COUNT(*) FILTER (WHERE reached_contact) as reached_contact,
        COUNT(*) FILTER (WHERE reached_reading) as reached_reading,
        AVG(EXTRACT(EPOCH FROM (first_value_event - first_app_open)) / 3600)
          FILTER (WHERE first_value_event < '2099-01-01') as avg_hours_to_fve
      FROM fve_calculated
    `);

    const s = fveStats[0] || {};
    const totalUsers = parseInt(s.total_users) || 1;

    // Get retention comparison: FVE users vs non-FVE users
    // Users who returned after 7 days
    const [retention] = await sequelize.query(`
      WITH user_cohort AS (
        SELECT
          device_id_hash,
          MIN(created_at) as first_seen,
          MAX(created_at) as last_seen,
          COUNT(DISTINCT DATE(created_at)) as active_days,
          BOOL_OR(event_name = 'delivery_logged') as logged_delivery,
          BOOL_OR(event_name IN ('delivery_logged', 'prediction_viewed', 'supplier_contacted', 'tank_reading_added')) as reached_fve
        FROM app_events
        WHERE created_at > NOW() - INTERVAL '${days} days'
        GROUP BY device_id_hash
      )
      SELECT
        -- FVE users retention
        COUNT(*) FILTER (WHERE reached_fve AND last_seen - first_seen > INTERVAL '7 days') as fve_retained,
        COUNT(*) FILTER (WHERE reached_fve) as fve_total,
        -- Non-FVE users retention
        COUNT(*) FILTER (WHERE NOT reached_fve AND last_seen - first_seen > INTERVAL '7 days') as non_fve_retained,
        COUNT(*) FILTER (WHERE NOT reached_fve) as non_fve_total,
        -- Delivery loggers retention (strongest signal)
        COUNT(*) FILTER (WHERE logged_delivery AND last_seen - first_seen > INTERVAL '7 days') as delivery_retained,
        COUNT(*) FILTER (WHERE logged_delivery) as delivery_total
      FROM user_cohort
    `);

    const r = retention[0] || {};

    const fveRetention = parseInt(r.fve_total) > 0
      ? Math.round((parseInt(r.fve_retained) / parseInt(r.fve_total)) * 100)
      : 0;
    const nonFveRetention = parseInt(r.non_fve_total) > 0
      ? Math.round((parseInt(r.non_fve_retained) / parseInt(r.non_fve_total)) * 100)
      : 0;
    const deliveryRetention = parseInt(r.delivery_total) > 0
      ? Math.round((parseInt(r.delivery_retained) / parseInt(r.delivery_total)) * 100)
      : 0;

    const retentionMultiplier = nonFveRetention > 0
      ? (fveRetention / nonFveRetention).toFixed(1)
      : 'N/A';

    res.json({
      period: `${days}d`,
      summary: {
        totalUsers,
        reachedFVE: parseInt(s.reached_fve) || 0,
        fveRate: Math.round((parseInt(s.reached_fve) / totalUsers) * 100),
        fveWithin72h: parseInt(s.fve_within_72h) || 0,
        fveWithin72hRate: Math.round((parseInt(s.fve_within_72h) / totalUsers) * 100),
        avgHoursToFVE: s.avg_hours_to_fve ? parseFloat(s.avg_hours_to_fve).toFixed(1) : null
      },
      fveBreakdown: {
        delivery: { count: parseInt(s.reached_delivery) || 0, percent: Math.round((parseInt(s.reached_delivery) / totalUsers) * 100) },
        prediction: { count: parseInt(s.reached_prediction) || 0, percent: Math.round((parseInt(s.reached_prediction) / totalUsers) * 100) },
        contact: { count: parseInt(s.reached_contact) || 0, percent: Math.round((parseInt(s.reached_contact) / totalUsers) * 100) },
        reading: { count: parseInt(s.reached_reading) || 0, percent: Math.round((parseInt(s.reached_reading) / totalUsers) * 100) }
      },
      retention: {
        fveUsers: { retained: parseInt(r.fve_retained) || 0, total: parseInt(r.fve_total) || 0, rate: fveRetention },
        nonFveUsers: { retained: parseInt(r.non_fve_retained) || 0, total: parseInt(r.non_fve_total) || 0, rate: nonFveRetention },
        deliveryLoggers: { retained: parseInt(r.delivery_retained) || 0, total: parseInt(r.delivery_total) || 0, rate: deliveryRetention },
        multiplier: retentionMultiplier
      },
      insight: {
        title: `Users who reach FVE retain ${retentionMultiplier}× better`,
        recommendation: deliveryRetention > fveRetention
          ? 'Push users to log first delivery - strongest retention signal'
          : 'Any value event improves retention - focus on activation'
      },
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    logger.error('[Dashboard] FVE analytics error:', error.message);
    res.status(500).json({ error: 'Failed to fetch FVE data', details: error.message });
  }
});

/**
 * GET /api/dashboard/confidence-score
 * User confidence score based on setup completeness
 */
router.get('/confidence-score', async (req, res) => {
  const days = parseDays(req, 30);
  const sequelize = req.app.locals.sequelize;
  const logger = req.app.locals.logger || console;

  try {
    // Check if app_events table exists
    const [tableCheck] = await sequelize.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'app_events'
      ) as exists
    `);

    if (!tableCheck[0]?.exists) {
      return res.json({ period: `${days}d`, confidence: {}, note: 'app_events table not found' });
    }

    // Calculate confidence score per user
    // Points: tank_size (20), notifications (20), delivery_logged (25), prediction_viewed (15), has_supplier_coverage (20)
    const [scores] = await sequelize.query(`
      WITH user_scores AS (
        SELECT
          device_id_hash,
          -- Tank size: check if tank_reading_added with tank_size_bucket
          CASE WHEN BOOL_OR(event_name = 'tank_reading_added' AND event_data->>'tank_size_bucket' IS NOT NULL)
            THEN 20 ELSE 0 END as tank_score,
          -- Notifications: check if notification_action exists
          CASE WHEN BOOL_OR(event_name = 'notification_action')
            THEN 20 ELSE 0 END as notification_score,
          -- Delivery logged
          CASE WHEN BOOL_OR(event_name = 'delivery_logged')
            THEN 25 ELSE 0 END as delivery_score,
          -- Prediction viewed (or forecast tab)
          CASE WHEN BOOL_OR(event_name = 'prediction_viewed' OR
                           (event_name = 'screen_viewed' AND event_data->>'screen' = 'forecast'))
            THEN 15 ELSE 0 END as prediction_score,
          -- Supplier coverage: check if directory_searched with results (not no_results)
          CASE WHEN BOOL_OR(event_name = 'directory_searched' AND
                           (event_data->>'result_count')::int > 0)
            THEN 20 ELSE 0 END as coverage_score
        FROM app_events
        WHERE created_at > NOW() - INTERVAL '${days} days'
        GROUP BY device_id_hash
      ),
      scored AS (
        SELECT
          device_id_hash,
          tank_score + notification_score + delivery_score + prediction_score + coverage_score as total_score,
          tank_score, notification_score, delivery_score, prediction_score, coverage_score
        FROM user_scores
      )
      SELECT
        COUNT(*) as total_users,
        AVG(total_score) as avg_score,
        COUNT(*) FILTER (WHERE total_score >= 80) as high_confidence,
        COUNT(*) FILTER (WHERE total_score >= 50 AND total_score < 80) as medium_confidence,
        COUNT(*) FILTER (WHERE total_score < 50) as low_confidence,
        AVG(tank_score) as avg_tank,
        AVG(notification_score) as avg_notification,
        AVG(delivery_score) as avg_delivery,
        AVG(prediction_score) as avg_prediction,
        AVG(coverage_score) as avg_coverage
      FROM scored
    `);

    const s = scores[0] || {};
    const total = parseInt(s.total_users) || 1;

    res.json({
      period: `${days}d`,
      summary: {
        totalUsers: total,
        averageScore: s.avg_score ? Math.round(parseFloat(s.avg_score)) : 0
      },
      distribution: {
        high: { count: parseInt(s.high_confidence) || 0, percent: Math.round((parseInt(s.high_confidence) / total) * 100), label: 'High (80-100)' },
        medium: { count: parseInt(s.medium_confidence) || 0, percent: Math.round((parseInt(s.medium_confidence) / total) * 100), label: 'Medium (50-79)' },
        low: { count: parseInt(s.low_confidence) || 0, percent: Math.round((parseInt(s.low_confidence) / total) * 100), label: 'Low (0-49)' }
      },
      factors: {
        tankSize: { maxPoints: 20, avgPoints: s.avg_tank ? Math.round(parseFloat(s.avg_tank)) : 0 },
        notifications: { maxPoints: 20, avgPoints: s.avg_notification ? Math.round(parseFloat(s.avg_notification)) : 0 },
        deliveryLogged: { maxPoints: 25, avgPoints: s.avg_delivery ? Math.round(parseFloat(s.avg_delivery)) : 0 },
        predictionViewed: { maxPoints: 15, avgPoints: s.avg_prediction ? Math.round(parseFloat(s.avg_prediction)) : 0 },
        supplierCoverage: { maxPoints: 20, avgPoints: s.avg_coverage ? Math.round(parseFloat(s.avg_coverage)) : 0 }
      },
      insight: {
        atRiskPercent: Math.round((parseInt(s.low_confidence) / total) * 100),
        recommendation: parseInt(s.low_confidence) / total > 0.3
          ? 'Over 30% of users at high churn risk - push notification setup and first delivery'
          : 'Confidence distribution is healthy - focus on converting medium to high'
      },
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    logger.error('[Dashboard] Confidence score error:', error.message);
    res.status(500).json({ error: 'Failed to calculate confidence scores', details: error.message });
  }
});

/**
 * GET /api/dashboard/platforms
 * Platform comparison: iOS vs Android vs Web
 */
router.get('/platforms', async (req, res) => {
  const days = parseDays(req, 30);
  const sequelize = req.app.locals.sequelize;
  const logger = req.app.locals.logger || console;

  try {
    // iOS data from app_events
    const [iosData] = await sequelize.query(`
      SELECT
        COUNT(DISTINCT device_id_hash) as unique_users,
        COUNT(*) as total_events,
        COUNT(DISTINCT device_id_hash) FILTER (WHERE event_name = 'delivery_logged') as users_with_delivery,
        COUNT(*) FILTER (WHERE event_name = 'delivery_logged') as total_deliveries,
        COUNT(*) FILTER (WHERE event_name = 'supplier_contacted') as supplier_contacts
      FROM app_events
      WHERE created_at > NOW() - INTERVAL '${days} days'
    `);

    // Android waitlist
    const [waitlistData] = await sequelize.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '${days} days') as recent
      FROM waitlist
    `);

    // PWA data
    const [pwaData] = await sequelize.query(`
      SELECT
        COUNT(*) FILTER (WHERE event_type = 'installed') as installs,
        COUNT(*) FILTER (WHERE event_type = 'standalone_launch') as launches,
        COUNT(*) FILTER (WHERE event_type = 'prompt_shown') as prompts
      FROM pwa_events
      WHERE created_at > NOW() - INTERVAL '${days} days'
    `);

    // Website data from supplier_clicks
    const [webData] = await sequelize.query(`
      SELECT
        COUNT(DISTINCT ip_address) as unique_visitors,
        COUNT(*) as total_clicks,
        COUNT(*) FILTER (WHERE action_type = 'call') as calls,
        COUNT(*) FILTER (WHERE action_type = 'website') as websites
      FROM supplier_clicks
      WHERE created_at > NOW() - INTERVAL '${days} days'
    `);

    // iOS retention (simplified)
    const [iosRetention] = await sequelize.query(`
      WITH cohort AS (
        SELECT device_id_hash, MIN(DATE(created_at)) as first_day
        FROM app_events
        WHERE created_at > NOW() - INTERVAL '${days} days'
        GROUP BY device_id_hash
      ),
      retained AS (
        SELECT c.device_id_hash
        FROM cohort c
        JOIN app_events ae ON c.device_id_hash = ae.device_id_hash
        WHERE DATE(ae.created_at) >= c.first_day + INTERVAL '7 days'
          AND DATE(ae.created_at) < c.first_day + INTERVAL '14 days'
      )
      SELECT
        COUNT(DISTINCT c.device_id_hash) as cohort_size,
        COUNT(DISTINCT r.device_id_hash) as retained
      FROM cohort c
      LEFT JOIN retained r ON c.device_id_hash = r.device_id_hash
    `);

    const ios = iosData[0] || {};
    const waitlist = waitlistData[0] || {};
    const pwa = pwaData[0] || {};
    const web = webData[0] || {};
    const retention = iosRetention[0] || {};

    const iosRetentionRate = parseInt(retention.cohort_size) > 0
      ? Math.round((parseInt(retention.retained) / parseInt(retention.cohort_size)) * 100)
      : 0;

    // Android decision logic
    const waitlistTotal = parseInt(waitlist.total) || 0;
    const pwaInstalls = parseInt(pwa.installs) || 0;

    let androidStatus = 'WAIT';
    let androidMessage = '';

    // NO-GO conditions
    if (iosRetentionRate < 20) {
      androidStatus = 'NO-GO';
      androidMessage = `iOS retention at ${iosRetentionRate}% - fix core product first`;
    } else if (waitlistTotal >= 200 && pwaInstalls >= 50) {
      androidStatus = 'GO';
      androidMessage = 'All conditions met - ready to build MVP';
    } else {
      const waitlistProgress = Math.round((waitlistTotal / 200) * 100);
      const pwaProgress = Math.round((pwaInstalls / 50) * 100);
      androidMessage = `Waitlist ${waitlistProgress}% (${waitlistTotal}/200), PWA ${pwaProgress}% (${pwaInstalls}/50)`;
    }

    res.json({
      period: `${days}d`,
      ios: {
        status: 'live',
        users: parseInt(ios.unique_users) || 0,
        deliveries: parseInt(ios.total_deliveries) || 0,
        supplierContacts: parseInt(ios.supplier_contacts) || 0,
        retention: iosRetentionRate
      },
      android: {
        status: androidStatus,
        message: androidMessage,
        waitlist: waitlistTotal,
        pwaInstalls,
        pwaLaunches: parseInt(pwa.launches) || 0,
        conditions: {
          waitlist: { current: waitlistTotal, target: 200, met: waitlistTotal >= 200 },
          pwaInstalls: { current: pwaInstalls, target: 50, met: pwaInstalls >= 50 },
          iosRetention: { current: iosRetentionRate, target: 20, met: iosRetentionRate >= 20 }
        }
      },
      web: {
        status: 'live',
        visitors: parseInt(web.unique_visitors) || 0,
        clicks: parseInt(web.total_clicks) || 0,
        calls: parseInt(web.calls) || 0,
        websites: parseInt(web.websites) || 0
      },
      comparison: {
        insight: waitlistTotal > parseInt(ios.unique_users)
          ? `Android waitlist (${waitlistTotal}) exceeds iOS users (${ios.unique_users}) - strong demand signal`
          : 'iOS currently larger user base'
      },
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    logger.error('[Dashboard] Platform comparison error:', error.message);
    res.status(500).json({ error: 'Failed to fetch platform data', details: error.message });
  }
});

module.exports = router;
