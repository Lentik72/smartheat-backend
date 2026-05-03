/**
 * User Event Tracking Route
 * POST /api/v1/track — lightweight event tracking for website interactions
 */

const express = require('express');
const router = express.Router();

router.post('/track', async (req, res) => {
  const sequelize = req.app.locals.sequelize;
  const logger = req.app.locals.logger || console;

  // Reject oversized payloads (1KB max)
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength > 1024) {
    return res.status(413).json({ error: 'Payload too large' });
  }

  const { event, zip, supplier_id, page_type, referrer, county, state, meta } = req.body;

  if (!event || typeof event !== 'string') {
    return res.status(400).json({ error: 'Missing event' });
  }

  // Sanitize: truncate strings to column limits
  const safeEvent = event.slice(0, 50);
  const safeZip = zip ? String(zip).slice(0, 5) : null;
  const safePageType = page_type ? String(page_type).slice(0, 30) : null;
  const safeReferrer = referrer ? String(referrer).slice(0, 20) : null;
  const safeCounty = county ? String(county).slice(0, 50) : null;
  const safeState = state ? String(state).slice(0, 2) : null;
  const safeSupplierId = supplier_id ? parseInt(supplier_id, 10) || null : null;
  const safeMeta = meta && typeof meta === 'object' ? JSON.stringify(meta) : null;

  try {
    await sequelize.query(
      `INSERT INTO user_events (event_type, zip_prefix, supplier_id, page_type, referrer_type, county, state_code, meta)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      { bind: [safeEvent, safeZip, safeSupplierId, safePageType, safeReferrer, safeCounty, safeState, safeMeta] }
    );
    res.json({ ok: true });
  } catch (err) {
    // sendBeacon is fire-and-forget; don't 500 the user. But surface the failure
    // at warn level so persistent INSERT errors (e.g. missing table, schema drift)
    // are visible in Railway's warn filter — info-level console.log hid a missing
    // user_events table for weeks (heatingoil-wjdy 2026-05-03; this bead heatingoil-ydmb).
    logger.warn(`[UserEvent] ${safeEvent} not persisted: ${err.message}`);
    res.json({ ok: true });
  }
});

module.exports = router;
