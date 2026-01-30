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

// Apply protection to all dashboard routes
router.use(dashboardProtection);

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
    }
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
      dataFreshness
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
          (SELECT MAX(scraped_at) FROM supplier_prices WHERE is_valid = true) as last_price
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
        lastUpdated: freshness.last_click || null
      },
      pwa: {
        promptsShown: parseInt(pwa.prompts_shown) || 0,
        installs: parseInt(pwa.installs) || 0,
        conversionRate: parseFloat(conversionRate),
        lastUpdated: freshness.last_click || null
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

    // Get all ZIPs that suppliers serve (postal_codes_served is JSONB array)
    const supplierCoverage = await sequelize.query(`
      SELECT DISTINCT jsonb_array_elements_text(postal_codes_served) as zip_code
      FROM suppliers
      WHERE active = true AND postal_codes_served IS NOT NULL AND jsonb_array_length(postal_codes_served) > 0
    `, { type: sequelize.QueryTypes.SELECT });
    const coveredZips = new Set(supplierCoverage.map(r => r.zip_code));

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

    // Enrich demand with coordinates and identify coverage gaps
    const demandHeatmap = [];
    const coverageGaps = [];

    demand.forEach(d => {
      const zipData = zipCoords[d.zip_code];
      if (!zipData?.lat || !zipData?.lng) return; // Skip if no coordinates

      const entry = {
        zip: d.zip_code,
        count: parseInt(d.search_count),
        lat: zipData.lat,
        lng: zipData.lng,
        city: zipData.city || null,
        county: zipData.county || null,
        state: zipData.state || null
      };

      demandHeatmap.push(entry);

      // If this ZIP has searches but no supplier coverage, it's a gap
      if (!coveredZips.has(d.zip_code)) {
        coverageGaps.push(entry);
      }
    });

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
      coverageGaps,     // Red circles - searches with no supplier coverage
      allClicks,        // Table data - supplier clicks
      stats: {
        totalDemandZips: demandHeatmap.length,
        totalGapZips: coverageGaps.length,
        coveredZips: coveredZips.size
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
    const { state, hasPrice, scrapeStatus, search, limit = 50, offset = 0 } = req.query;

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
    if (search) {
      whereClause += ` AND (s.name ILIKE $${paramIndex} OR s.website ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

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
          (SELECT COUNT(*) FROM supplier_clicks sc WHERE sc.supplier_id = s.id AND sc.created_at > NOW() - INTERVAL '7 days') as "recentClicks"
        FROM suppliers s
        LEFT JOIN latest_prices lp ON s.id = lp.supplier_id
        ${whereClause}
        ORDER BY s.name
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
        recentClicks: parseInt(s.recentClicks) || 0
      })),
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
      SELECT s.*, lp.price_per_gallon, lp.scraped_at as price_updated_at
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
        current_price: supplier.price_per_gallon ? parseFloat(supplier.price_per_gallon) : null,
        scraping_enabled: supplier.price_updated_at &&
          (new Date() - new Date(supplier.price_updated_at)) < 48 * 60 * 60 * 1000
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

    // Whitelist allowed fields (using actual column names)
    const allowedFields = [
      'name', 'phone', 'website', 'state', 'city',
      'active', 'allow_price_display'
    ];

    const setClause = [];
    const replacements = { id };

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        setClause.push(`${field} = :${field}`);
        replacements[field] = updates[field];
      }
    }

    if (setClause.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    setClause.push('updated_at = NOW()');

    await sequelize.query(`
      UPDATE suppliers SET ${setClause.join(', ')} WHERE id = :id
    `, { replacements });

    logger.info(`[Dashboard] Updated supplier ${id}: ${Object.keys(updates).join(', ')}`);

    // Return updated supplier
    const [updated] = await sequelize.query(`
      SELECT * FROM suppliers WHERE id = :id
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

module.exports = router;
