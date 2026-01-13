/**
 * Activity Analytics API Routes
 *
 * Admin endpoints for viewing user activity, DAU metrics, and supplier engagement.
 * Also includes iOS app endpoints for reporting user-added suppliers.
 */

const express = require('express');
const router = express.Router();

// ==================== ADMIN ENDPOINTS ====================

/**
 * GET /api/admin/activity/dashboard
 * Real-time activity dashboard
 */
router.get('/dashboard', async (req, res) => {
  try {
    const analytics = req.app.locals.activityAnalytics;
    if (!analytics) {
      return res.status(503).json({ error: 'Analytics service not available' });
    }

    const [realTime, dauHistory] = await Promise.all([
      analytics.getRealTimeStats(),
      analytics.getDAUHistory(7)
    ]);

    res.json({
      success: true,
      data: {
        realTime: {
          uniqueUsers24h: parseInt(realTime.summary?.unique_users_24h) || 0,
          uniqueZips24h: parseInt(realTime.summary?.unique_zips_24h) || 0,
          totalRequests24h: parseInt(realTime.summary?.total_requests_24h) || 0,
          avgResponseTimeMs: parseInt(realTime.summary?.avg_response_time_ms) || 0,
          errors24h: parseInt(realTime.summary?.errors_24h) || 0,
          requestsLastHour: parseInt(realTime.summary?.requests_last_hour) || 0
        },
        topEndpoints: realTime.topEndpoints,
        hourlyActivity: realTime.hourlyActivity,
        dauHistory: dauHistory.map(d => ({
          date: d.date,
          uniqueUsers: d.unique_users,
          uniqueZips: d.unique_zips,
          totalRequests: d.total_requests,
          avgResponseTimeMs: d.avg_response_time_ms,
          errorCount: d.error_count,
          supplierLookups: d.supplier_lookups,
          priceChecks: d.price_checks,
          directoryViews: d.directory_views,
          usersByState: d.users_by_state
        }))
      }
    });
  } catch (error) {
    console.error('[ActivityAnalytics] Dashboard error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

/**
 * GET /api/admin/activity/dau
 * Daily Active Users history
 */
router.get('/dau', async (req, res) => {
  try {
    const analytics = req.app.locals.activityAnalytics;
    if (!analytics) {
      return res.status(503).json({ error: 'Analytics service not available' });
    }

    const days = parseInt(req.query.days) || 30;
    const history = await analytics.getDAUHistory(days);

    // Calculate trends
    const current = history[0];
    const previous = history[1];
    const weekAgo = history[6];

    res.json({
      success: true,
      data: {
        today: current ? {
          date: current.date,
          uniqueUsers: current.unique_users,
          uniqueZips: current.unique_zips,
          totalRequests: current.total_requests,
          usersByState: current.users_by_state
        } : null,
        trends: {
          dayOverDay: current && previous ? {
            usersChange: current.unique_users - previous.unique_users,
            usersChangePercent: previous.unique_users > 0
              ? Math.round(((current.unique_users - previous.unique_users) / previous.unique_users) * 100)
              : 0
          } : null,
          weekOverWeek: current && weekAgo ? {
            usersChange: current.unique_users - weekAgo.unique_users,
            usersChangePercent: weekAgo.unique_users > 0
              ? Math.round(((current.unique_users - weekAgo.unique_users) / weekAgo.unique_users) * 100)
              : 0
          } : null
        },
        history: history.map(d => ({
          date: d.date,
          uniqueUsers: d.unique_users,
          uniqueZips: d.unique_zips,
          totalRequests: d.total_requests,
          supplierLookups: d.supplier_lookups,
          directoryViews: d.directory_views,
          usersByState: d.users_by_state
        }))
      }
    });
  } catch (error) {
    console.error('[ActivityAnalytics] DAU error:', error);
    res.status(500).json({ error: 'Failed to fetch DAU data' });
  }
});

/**
 * POST /api/admin/activity/dau/aggregate
 * Trigger DAU aggregation (for manual refresh)
 */
router.post('/dau/aggregate', async (req, res) => {
  try {
    const analytics = req.app.locals.activityAnalytics;
    if (!analytics) {
      return res.status(503).json({ error: 'Analytics service not available' });
    }

    const date = req.body.date || null;
    const result = await analytics.aggregateDAU(date);

    res.json({
      success: true,
      message: 'DAU aggregation complete',
      data: result
    });
  } catch (error) {
    console.error('[ActivityAnalytics] Aggregation error:', error);
    res.status(500).json({ error: 'Failed to aggregate DAU' });
  }
});

/**
 * GET /api/admin/activity/suppliers
 * Supplier engagement stats
 */
router.get('/suppliers', async (req, res) => {
  try {
    const analytics = req.app.locals.activityAnalytics;
    if (!analytics) {
      return res.status(503).json({ error: 'Analytics service not available' });
    }

    const days = parseInt(req.query.days) || 30;
    const supplierId = req.query.supplierId || null;

    const stats = await analytics.getSupplierEngagementStats(supplierId, days);

    res.json({
      success: true,
      data: {
        period: `${days} days`,
        suppliers: stats.map(s => ({
          supplierId: s.supplier_id,
          supplierName: s.supplier_name,
          views: parseInt(s.views) || 0,
          calls: parseInt(s.calls) || 0,
          texts: parseInt(s.texts) || 0,
          emails: parseInt(s.emails) || 0,
          saves: parseInt(s.saves) || 0,
          quoteRequests: parseInt(s.quote_requests) || 0,
          totalEngagements: parseInt(s.total_engagements) || 0
        }))
      }
    });
  } catch (error) {
    console.error('[ActivityAnalytics] Supplier stats error:', error);
    res.status(500).json({ error: 'Failed to fetch supplier engagement stats' });
  }
});

/**
 * GET /api/admin/activity/user-added-suppliers
 * List suppliers added by users (for directory expansion)
 */
router.get('/user-added-suppliers', async (req, res) => {
  try {
    const analytics = req.app.locals.activityAnalytics;
    if (!analytics) {
      return res.status(503).json({ error: 'Analytics service not available' });
    }

    const reviewed = req.query.reviewed === 'true';
    const limit = parseInt(req.query.limit) || 50;

    const suppliers = await analytics.getUserAddedSuppliers(reviewed, limit);

    res.json({
      success: true,
      data: {
        reviewed,
        suppliers: suppliers.map(s => ({
          id: s.id,
          companyName: s.company_name,
          phone: s.phone,
          city: s.city,
          state: s.state,
          zipCode: s.zip_code,
          reportCount: s.report_count,
          firstReportedAt: s.first_reported_at,
          lastReportedAt: s.last_reported_at,
          addedToDirectory: s.added_to_directory,
          notes: s.notes
        }))
      }
    });
  } catch (error) {
    console.error('[ActivityAnalytics] User-added suppliers error:', error);
    res.status(500).json({ error: 'Failed to fetch user-added suppliers' });
  }
});

/**
 * PATCH /api/admin/activity/user-added-suppliers/:id/review
 * Mark a user-added supplier as reviewed
 */
router.patch('/user-added-suppliers/:id/review', async (req, res) => {
  try {
    const sequelize = req.app.locals.sequelize;
    const { id } = req.params;
    const { addedToDirectory, notes } = req.body;

    await sequelize.query(`
      UPDATE user_added_suppliers
      SET reviewed = true,
          reviewed_at = NOW(),
          added_to_directory = :addedToDirectory,
          notes = :notes
      WHERE id = :id
    `, {
      replacements: {
        id,
        addedToDirectory: addedToDirectory || false,
        notes: notes || null
      }
    });

    res.json({
      success: true,
      message: 'Supplier marked as reviewed'
    });
  } catch (error) {
    console.error('[ActivityAnalytics] Review error:', error);
    res.status(500).json({ error: 'Failed to review supplier' });
  }
});

/**
 * GET /api/admin/activity/geographic
 * Geographic distribution of users
 */
router.get('/geographic', async (req, res) => {
  try {
    const sequelize = req.app.locals.sequelize;
    const days = parseInt(req.query.days) || 30;

    // Get users by state
    const [byState] = await sequelize.query(`
      SELECT state, COUNT(DISTINCT ip_hash) as users, COUNT(DISTINCT zip_code) as zips
      FROM api_activity
      WHERE created_at >= NOW() - INTERVAL '${days} days'
        AND state IS NOT NULL
      GROUP BY state
      ORDER BY users DESC
    `);

    // Get top ZIP codes
    const [topZips] = await sequelize.query(`
      SELECT zip_code, state, COUNT(*) as requests, COUNT(DISTINCT ip_hash) as users
      FROM api_activity
      WHERE created_at >= NOW() - INTERVAL '${days} days'
        AND zip_code IS NOT NULL
      GROUP BY zip_code, state
      ORDER BY users DESC
      LIMIT 25
    `);

    res.json({
      success: true,
      data: {
        period: `${days} days`,
        byState: byState.map(s => ({
          state: s.state,
          users: parseInt(s.users),
          zips: parseInt(s.zips)
        })),
        topZips: topZips.map(z => ({
          zipCode: z.zip_code,
          state: z.state,
          requests: parseInt(z.requests),
          users: parseInt(z.users)
        }))
      }
    });
  } catch (error) {
    console.error('[ActivityAnalytics] Geographic error:', error);
    res.status(500).json({ error: 'Failed to fetch geographic data' });
  }
});

// ==================== iOS APP ENDPOINTS ====================

/**
 * POST /api/activity/supplier-added
 * iOS app reports a manually added supplier
 */
router.post('/supplier-added', async (req, res) => {
  try {
    const analytics = req.app.locals.activityAnalytics;
    if (!analytics) {
      return res.json({ received: true }); // Graceful degradation
    }

    const { companyName, phone, city, state, zipCode, userZipCode } = req.body;

    if (!companyName) {
      return res.status(400).json({ error: 'Company name required' });
    }

    await analytics.trackUserAddedSupplier(
      { companyName, phone, city, state, zipCode },
      { zipCode: userZipCode, ip: req.ip }
    );

    res.json({ received: true });
  } catch (error) {
    console.error('[ActivityAnalytics] Supplier-added error:', error);
    res.json({ received: true }); // Don't fail the app
  }
});

/**
 * POST /api/activity/supplier-engagement
 * iOS app reports supplier interaction
 */
router.post('/supplier-engagement', async (req, res) => {
  try {
    const analytics = req.app.locals.activityAnalytics;
    if (!analytics) {
      return res.json({ received: true });
    }

    const { supplierId, supplierName, engagementType, userZipCode, source } = req.body;

    if (!supplierName || !engagementType) {
      return res.status(400).json({ error: 'Supplier name and engagement type required' });
    }

    await analytics.trackSupplierEngagement(
      supplierId,
      supplierName,
      engagementType,
      { zipCode: userZipCode, ip: req.ip, source }
    );

    res.json({ received: true });
  } catch (error) {
    console.error('[ActivityAnalytics] Engagement error:', error);
    res.json({ received: true });
  }
});

/**
 * POST /api/admin/activity/send-report
 * Manually trigger and send the activity report email
 */
router.post('/send-report', async (req, res) => {
  try {
    const analytics = req.app.locals.activityAnalytics;
    const mailer = req.app.locals.coverageMailer;

    if (!analytics) {
      return res.status(503).json({ error: 'Analytics service not available' });
    }
    if (!mailer) {
      return res.status(503).json({ error: 'Mailer service not available' });
    }

    console.log('[ActivityAnalytics] Manual report requested');
    const report = await analytics.generateDailyReport();

    if (!report) {
      return res.status(500).json({ error: 'Failed to generate report' });
    }

    const success = await mailer.sendActivityReport(report);

    res.json({
      success,
      summary: {
        users: report.summary.uniqueUsers,
        zips: report.summary.uniqueZips,
        requests: report.summary.totalRequests,
        oilUsers: report.byFuelType?.heating_oil?.users || 0,
        propaneUsers: report.byFuelType?.propane?.users || 0
      }
    });
  } catch (error) {
    console.error('[ActivityAnalytics] Send report error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
