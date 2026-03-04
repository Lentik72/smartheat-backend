/**
 * Outreach Routes
 * Handles email unsubscribe and Resend bounce/complaint webhooks
 *
 * Endpoints:
 * - GET /api/outreach/unsubscribe - Supplier email unsubscribe (signed link)
 * - POST /api/webhook/resend - Resend bounce/complaint webhook
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

/**
 * Generate HMAC token for unsubscribe link
 */
function generateUnsubscribeToken(slug, secret) {
  return crypto.createHmac('sha256', secret).update(slug).digest('hex');
}

/**
 * Build unsubscribe URL for outreach emails
 * Exported for use by OutreachSequenceService and claim-targets.js
 */
function buildUnsubscribeUrl(slug) {
  const secret = process.env.CLAIM_VERIFY_SECRET;
  if (!secret) return null;

  const baseUrl = process.env.BACKEND_URL || 'https://gethomeheat.com';
  const token = generateUnsubscribeToken(slug, secret);
  return `${baseUrl}/api/outreach/unsubscribe?supplier=${encodeURIComponent(slug)}&token=${token}`;
}

/**
 * GET /api/outreach/unsubscribe
 * Supplier clicks unsubscribe link in outreach email
 */
router.get('/unsubscribe', async (req, res) => {
  const sequelize = req.app.locals.sequelize;
  const logger = req.app.locals.logger;

  const { supplier: slug, token } = req.query;
  const secret = process.env.CLAIM_VERIFY_SECRET;

  if (!slug || !token || !secret) {
    return res.status(400).send('Invalid unsubscribe link.');
  }

  // Verify HMAC
  const expectedToken = generateUnsubscribeToken(slug, secret);
  try {
    if (!crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expectedToken))) {
      return res.status(403).send('Invalid unsubscribe token.');
    }
  } catch {
    return res.status(403).send('Invalid unsubscribe token.');
  }

  try {
    const [result] = await sequelize.query(`
      UPDATE suppliers
      SET email_unsubscribed = true
      WHERE slug = :slug
      RETURNING name
    `, { replacements: { slug } });

    const name = result[0]?.name || slug;
    logger?.info(`[Outreach] ${name} (${slug}) unsubscribed from emails`);

    res.send(`
      <!DOCTYPE html>
      <html>
      <head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Unsubscribed</title></head>
      <body style="font-family: -apple-system, sans-serif; max-width: 500px; margin: 40px auto; padding: 20px; text-align: center;">
        <h1>Unsubscribed</h1>
        <p><strong>${name}</strong> has been removed from our outreach emails.</p>
        <p style="color: #666; font-size: 14px;">You will no longer receive marketing emails from HomeHeat. Your listing remains active on the site.</p>
      </body>
      </html>
    `);

  } catch (error) {
    logger?.error('[Outreach] Unsubscribe error:', error.message);
    res.status(500).send('Something went wrong. Please try again.');
  }
});

/**
 * POST /api/webhook/resend
 * Resend bounce and complaint webhook
 * On hard bounce or spam complaint, auto-unsubscribe the supplier
 */
router.post('/resend-webhook', async (req, res) => {
  const sequelize = req.app.locals.sequelize;
  const logger = req.app.locals.logger;

  try {
    const { type, data } = req.body;

    // We care about bounces and complaints
    if (!['email.bounced', 'email.complained'].includes(type)) {
      return res.json({ received: true });
    }

    const email = data?.to?.[0] || data?.email_address;
    if (!email) {
      return res.json({ received: true });
    }

    logger?.info(`[Outreach] Resend webhook: ${type} for ${email}`);

    // Find supplier by email and unsubscribe
    const [result] = await sequelize.query(`
      UPDATE suppliers
      SET email_unsubscribed = true
      WHERE email = :email
      RETURNING slug, name
    `, { replacements: { email: email.toLowerCase() } });

    if (result.length > 0) {
      logger?.info(`[Outreach] Auto-unsubscribed ${result[0].name} (${result[0].slug}) due to ${type}`);
    }

    res.json({ received: true });

  } catch (error) {
    logger?.error('[Outreach] Resend webhook error:', error.message);
    res.json({ received: true }); // Always 200 to prevent webhook retries
  }
});

module.exports = router;
module.exports.buildUnsubscribeUrl = buildUnsubscribeUrl;
