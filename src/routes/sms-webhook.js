/**
 * SMS Webhook Routes — Twilio inbound SMS handler
 *
 * POST /api/webhook/twilio/sms  — Receive inbound SMS from Twilio
 * GET  /api/webhook/twilio/status — SMS system stats (dashboard-auth protected)
 */

const express = require('express');
const router = express.Router();
const twilio = require('twilio');

/**
 * POST /sms
 * Twilio sends form-urlencoded POST with From, Body, MessageSid
 * Must return TwiML XML response
 */
router.post('/sms', async (req, res) => {
  const logger = req.app.locals.logger;
  const smsPriceService = req.app.locals.smsPriceService;

  // Validate Twilio signature (reject spoofed requests)
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (authToken && process.env.NODE_ENV === 'production') {
    // Build the URL Twilio sees. Behind Railway's proxy, use X-Forwarded-Proto.
    const proto = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['host'];
    const url = `${proto}://${host}${req.originalUrl}`;

    const signature = req.headers['x-twilio-signature'];
    const valid = twilio.validateRequest(authToken, signature, url, req.body);

    if (!valid) {
      logger.warn('[SMS Webhook] Invalid Twilio signature — rejecting request');
      return res.status(403).send('<Response></Response>');
    }
  }

  const { From, Body, MessageSid } = req.body;

  if (!From || !smsPriceService) {
    logger.warn('[SMS Webhook] Missing From or SmsPriceService not initialized');
    return res.type('text/xml').send('<Response></Response>');
  }

  try {
    const reply = await smsPriceService.handleIncoming(From, Body, MessageSid);

    // Return TwiML
    if (reply) {
      const escaped = escapeXml(reply);
      res.type('text/xml').send(`<Response><Message>${escaped}</Message></Response>`);
    } else {
      // No reply (e.g., duplicate SID) — return empty TwiML
      res.type('text/xml').send('<Response></Response>');
    }
  } catch (err) {
    logger.error('[SMS Webhook] Error processing SMS:', err.message);
    const errorReply = "Something went wrong. Please try again or email support@gethomeheat.com";
    res.type('text/xml').send(`<Response><Message>${escapeXml(errorReply)}</Message></Response>`);
  }
});

/**
 * GET /status
 * Returns SMS system stats. Protected by dashboard password.
 */
router.get('/status', async (req, res) => {
  const sequelize = req.app.locals.sequelize;
  const logger = req.app.locals.logger;

  // Simple auth check (same as dashboard)
  const password = req.query.password || req.headers['x-dashboard-password'];
  if (password !== process.env.DASHBOARD_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const [stats] = await sequelize.query(`
      SELECT
        COUNT(*) as total_sms,
        COUNT(*) FILTER (WHERE type = 'price_update' AND status = 'success') as price_updates,
        COUNT(*) FILTER (WHERE type = 'confirm' AND status = 'success') as confirmations,
        COUNT(DISTINCT supplier_id) FILTER (WHERE type IN ('price_update', 'confirm') AND status = 'success') as active_suppliers,
        MAX(created_at) as last_activity
      FROM sms_price_updates
    `);

    const [recentUpdates] = await sequelize.query(`
      SELECT
        spu.from_phone,
        spu.parsed_price,
        spu.type,
        spu.status,
        spu.created_at,
        s.name as supplier_name
      FROM sms_price_updates spu
      LEFT JOIN suppliers s ON spu.supplier_id = s.id
      ORDER BY spu.created_at DESC
      LIMIT 20
    `);

    res.json({
      stats: stats[0],
      recentUpdates
    });
  } catch (err) {
    logger.error('[SMS Status] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch SMS stats' });
  }
});

/**
 * Escape XML special characters for TwiML responses
 */
function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

module.exports = router;
