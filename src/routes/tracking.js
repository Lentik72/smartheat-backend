/**
 * Tracking Routes - Capture user interactions for "Sniper" outreach
 * V2.12.0: Click tracking for supplier lead notifications
 */

const express = require('express');
const router = express.Router();

/**
 * POST /api/track-click
 * Records when a user clicks "Call" or "Website" for a supplier
 */
router.post('/track-click', async (req, res) => {
  const sequelize = req.app.locals.sequelize;
  const { supplierId, action, zipCode } = req.body;
  const userAgent = req.headers['user-agent'] || '';
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip || '';

  // Validate required fields
  if (!supplierId || !action) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Validate action type
  if (!['call', 'website'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action type' });
  }

  try {
    // Verify supplier exists
    const [suppliers] = await sequelize.query(
      'SELECT id, name FROM suppliers WHERE id = $1 AND active = true',
      { bind: [supplierId] }
    );

    if (!suppliers || suppliers.length === 0) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    const supplier = suppliers[0];

    // Insert click record
    await sequelize.query(
      `INSERT INTO supplier_clicks
       (supplier_id, action_type, zip_code, user_agent, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      { bind: [supplierId, action, zipCode || null, userAgent, ip] }
    );

    console.log(`[Tracking] ${action} click for ${supplier.name} from ZIP ${zipCode || 'unknown'}`);

    res.json({ success: true });

  } catch (err) {
    console.error('[Tracking Error]', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/tracking/pending
 * Get unprocessed clicks for email outreach (admin only)
 */
router.get('/admin/pending', async (req, res) => {
  const sequelize = req.app.locals.sequelize;

  try {
    const [clicks] = await sequelize.query(`
      SELECT
        sc.id,
        sc.supplier_id,
        s.name as supplier_name,
        s.email as supplier_email,
        s.phone as supplier_phone,
        sc.action_type,
        sc.zip_code,
        sc.created_at,
        (
          SELECT MAX(email_sent_at)
          FROM supplier_clicks
          WHERE supplier_id = sc.supplier_id
          AND email_sent_at IS NOT NULL
        ) as last_email_sent
      FROM supplier_clicks sc
      JOIN suppliers s ON sc.supplier_id = s.id
      WHERE sc.processed_for_email = FALSE
      ORDER BY sc.created_at DESC
      LIMIT 50
    `);

    // Filter out suppliers emailed in last 7 days
    const filtered = clicks.filter(c => {
      if (!c.last_email_sent) return true;
      const daysSinceEmail = (Date.now() - new Date(c.last_email_sent).getTime()) / (1000 * 60 * 60 * 24);
      return daysSinceEmail >= 7;
    });

    res.json({
      success: true,
      data: filtered,
      total: clicks.length,
      eligible: filtered.length
    });

  } catch (err) {
    console.error('[Tracking Admin Error]', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/tracking/mark-processed
 * Mark clicks as processed after sending email
 */
router.post('/admin/mark-processed', async (req, res) => {
  const sequelize = req.app.locals.sequelize;
  const { clickIds, supplierId } = req.body;

  if (!clickIds && !supplierId) {
    return res.status(400).json({ error: 'Provide clickIds or supplierId' });
  }

  try {
    if (supplierId) {
      // Mark all unprocessed clicks for this supplier
      await sequelize.query(`
        UPDATE supplier_clicks
        SET processed_for_email = TRUE, email_sent_at = NOW()
        WHERE supplier_id = $1 AND processed_for_email = FALSE
      `, { bind: [supplierId] });
    } else {
      // Mark specific click IDs
      await sequelize.query(`
        UPDATE supplier_clicks
        SET processed_for_email = TRUE, email_sent_at = NOW()
        WHERE id = ANY($1::uuid[])
      `, { bind: [clickIds] });
    }

    res.json({ success: true });

  } catch (err) {
    console.error('[Tracking Mark Error]', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/tracking/stats
 * Get click statistics
 */
router.get('/admin/stats', async (req, res) => {
  const sequelize = req.app.locals.sequelize;

  try {
    const [stats] = await sequelize.query(`
      SELECT
        COUNT(*) as total_clicks,
        COUNT(DISTINCT supplier_id) as unique_suppliers,
        COUNT(*) FILTER (WHERE action_type = 'call') as call_clicks,
        COUNT(*) FILTER (WHERE action_type = 'website') as website_clicks,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as last_24h,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as last_7d,
        COUNT(*) FILTER (WHERE processed_for_email = TRUE) as emails_sent
      FROM supplier_clicks
    `);

    res.json({ success: true, data: stats[0] });

  } catch (err) {
    console.error('[Tracking Stats Error]', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
