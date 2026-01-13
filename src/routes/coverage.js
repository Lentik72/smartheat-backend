/**
 * Coverage Intelligence API Routes
 * V2.3.0: Admin endpoints for coverage monitoring
 */

const express = require('express');
const router = express.Router();
const { getUserLocationModel } = require('../models/UserLocation');
const CoverageIntelligenceService = require('../services/CoverageIntelligenceService');
const CoverageReportMailer = require('../services/CoverageReportMailer');
const { Op } = require('sequelize');

/**
 * GET /api/admin/coverage/dashboard
 *
 * Returns current coverage statistics
 */
router.get('/dashboard', async (req, res) => {
  try {
    const sequelize = req.app.locals.sequelize;
    if (!sequelize) {
      return res.status(503).json({ error: 'Database not available' });
    }

    const intelligence = new CoverageIntelligenceService(sequelize);
    const stats = await intelligence.getCoverageStats();

    if (!stats) {
      return res.status(503).json({ error: 'Could not retrieve stats' });
    }

    res.json({
      success: true,
      data: {
        totalLocations: parseInt(stats.total_locations) || 0,
        noCoverage: parseInt(stats.no_coverage) || 0,
        poorCoverage: parseInt(stats.poor_coverage) || 0,
        adequateCoverage: parseInt(stats.adequate_coverage) || 0,
        goodCoverage: parseInt(stats.good_coverage) || 0,
        totalRequests: parseInt(stats.total_requests) || 0,
        newLast24h: parseInt(stats.new_last_24h) || 0,
        newLast7d: parseInt(stats.new_last_7d) || 0
      },
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Coverage API] Dashboard error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/coverage/locations
 *
 * Returns all tracked user locations with filtering
 * Query params: state, quality, limit, offset
 */
router.get('/locations', async (req, res) => {
  try {
    const UserLocation = getUserLocationModel();
    if (!UserLocation) {
      return res.status(503).json({ error: 'Database not available' });
    }

    const { state, quality, limit = 100, offset = 0 } = req.query;

    const where = {};
    if (state) where.state = state.toUpperCase();
    if (quality) where.coverageQuality = quality;

    const locations = await UserLocation.findAndCountAll({
      where,
      order: [['requestCount', 'DESC'], ['firstSeenAt', 'DESC']],
      limit: Math.min(parseInt(limit), 500),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      data: locations.rows,
      pagination: {
        total: locations.count,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    console.error('[Coverage API] Locations error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/coverage/gaps
 *
 * Returns locations with poor or no coverage, sorted by user activity
 */
router.get('/gaps', async (req, res) => {
  try {
    const UserLocation = getUserLocationModel();
    if (!UserLocation) {
      return res.status(503).json({ error: 'Database not available' });
    }

    const { limit = 50 } = req.query;

    const gaps = await UserLocation.findAll({
      where: {
        coverageQuality: { [Op.in]: ['none', 'poor'] }
      },
      order: [
        ['coverageQuality', 'ASC'], // 'none' before 'poor'
        ['requestCount', 'DESC']
      ],
      limit: Math.min(parseInt(limit), 200)
    });

    res.json({
      success: true,
      data: gaps,
      count: gaps.length
    });
  } catch (error) {
    console.error('[Coverage API] Gaps error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/coverage/new
 *
 * Returns locations first seen in the last 24 hours
 */
router.get('/new', async (req, res) => {
  try {
    const UserLocation = getUserLocationModel();
    if (!UserLocation) {
      return res.status(503).json({ error: 'Database not available' });
    }

    const { hours = 24 } = req.query;
    const since = new Date(Date.now() - parseInt(hours) * 60 * 60 * 1000);

    const locations = await UserLocation.findAll({
      where: {
        firstSeenAt: { [Op.gte]: since }
      },
      order: [['firstSeenAt', 'DESC']]
    });

    res.json({
      success: true,
      data: locations,
      count: locations.length,
      since: since.toISOString()
    });
  } catch (error) {
    console.error('[Coverage API] New locations error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/admin/coverage/analyze
 *
 * Trigger manual coverage analysis (same as daily job)
 */
router.post('/analyze', async (req, res) => {
  try {
    const sequelize = req.app.locals.sequelize;
    if (!sequelize) {
      return res.status(503).json({ error: 'Database not available' });
    }

    const mailer = new CoverageReportMailer();
    const intelligence = new CoverageIntelligenceService(sequelize, mailer);

    console.log('[Coverage API] Manual analysis triggered');
    const report = await intelligence.runDailyAnalysis();

    res.json({
      success: true,
      report: {
        date: report.date,
        newLocations: report.newLocations.length,
        coverageGaps: report.coverageGaps.length,
        expansionPatterns: report.expansionPatterns.length,
        supplierHealth: report.supplierHealth.length,
        recommendations: report.recommendations.length,
        emailSent: intelligence.mailer?.initialized || false
      }
    });
  } catch (error) {
    console.error('[Coverage API] Analyze error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/admin/coverage/report
 *
 * Send a coverage report email immediately
 */
router.post('/report', async (req, res) => {
  try {
    const sequelize = req.app.locals.sequelize;
    if (!sequelize) {
      return res.status(503).json({ error: 'Database not available' });
    }

    const mailer = new CoverageReportMailer();
    if (!mailer.initialized) {
      return res.status(503).json({ error: 'Email not configured' });
    }

    const intelligence = new CoverageIntelligenceService(sequelize, mailer);
    const report = await intelligence.runDailyAnalysis();

    // Force send even if no actionable items
    await mailer.sendDailyReport(report);

    res.json({
      success: true,
      message: 'Report sent',
      recipient: mailer.getRecipient()
    });
  } catch (error) {
    console.error('[Coverage API] Report error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/coverage/stats/by-state
 *
 * Returns location counts grouped by state
 */
router.get('/stats/by-state', async (req, res) => {
  try {
    const sequelize = req.app.locals.sequelize;
    if (!sequelize) {
      return res.status(503).json({ error: 'Database not available' });
    }

    const [results] = await sequelize.query(`
      SELECT
        state,
        COUNT(*) as location_count,
        SUM(request_count) as total_requests,
        COUNT(CASE WHEN coverage_quality IN ('none', 'poor') THEN 1 END) as gaps_count
      FROM user_locations
      WHERE state IS NOT NULL
      GROUP BY state
      ORDER BY location_count DESC
    `);

    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    console.error('[Coverage API] Stats by state error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
