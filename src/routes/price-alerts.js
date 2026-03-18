// src/routes/price-alerts.js
// Price alert subscribe/unsubscribe endpoints

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

// Disposable email domains to block
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'tempmail.com', 'guerrillamail.com', '10minutemail.com',
  'throwaway.email', 'yopmail.com', 'sharklasers.com', 'guerrillamail.info',
  'grr.la', 'guerrillamail.biz', 'guerrillamail.de', 'guerrillamail.net',
  'trashmail.com', 'trashmail.me', 'trashmail.net', 'dispostable.com',
  'maildrop.cc', 'mailnesia.com', 'tempail.com', 'tempmailaddress.com',
  'getairmail.com', 'fakeinbox.com', 'mailcatch.com', 'mintemail.com'
]);

// Email validation
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!re.test(email)) return false;

  // Reject obvious fakes
  const lower = email.toLowerCase();
  if (lower === 'test@test.test' || lower === 'test@test.com') return false;

  // Block disposable domains
  const domain = lower.split('@')[1];
  if (DISPOSABLE_DOMAINS.has(domain)) return false;

  // Reject single-char local parts
  if (lower.split('@')[0].length < 2) return false;

  return true;
}

// ZIP validation
function isValidZip(zip) {
  return /^\d{5}$/.test(zip);
}

/**
 * POST /api/price-alerts/subscribe
 */
router.post('/subscribe', async (req, res) => {
  const sequelize = req.app.locals.sequelize;
  const logger = req.app.locals.logger;

  try {
    const { email, zip_code, threshold_price, source_page, utm_source, utm_campaign } = req.body;

    // Validate inputs
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (!isValidZip(zip_code)) {
      return res.status(400).json({ error: 'Please enter a valid 5-digit ZIP code.' });
    }

    const price = parseFloat(threshold_price);
    if (isNaN(price) || price < 2.00 || price > 6.00) {
      return res.status(400).json({ error: 'Threshold must be between $2.00 and $6.00.' });
    }

    // Generate unsubscribe token
    const unsubscribe_token = crypto.randomBytes(32).toString('hex');

    // Get current min price for this ZIP (to set last_price_seen)
    const [priceRows] = await sequelize.query(`
      SELECT MIN(sp.price_per_gallon) AS min_price
      FROM suppliers s
      JOIN supplier_prices sp ON s.id = sp.supplier_id
      WHERE s.active = true
        AND s.allow_price_display = true
        AND sp.is_valid = true
        AND sp.expires_at > NOW()
        AND sp.scraped_at > NOW() - INTERVAL '72 hours'
        AND sp.source_type != 'aggregator_signal'
        AND sp.fuel_type = 'heating_oil'
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(s.postal_codes_served) AS zip
          WHERE zip = :zip_code
        )
    `, { replacements: { zip_code } });

    const currentMinPrice = priceRows[0]?.min_price ? parseFloat(priceRows[0].min_price) : null;

    // Insert or update subscriber
    // xmax = 0 means INSERT (new row), xmax != 0 means UPDATE (existing row)
    // last_price_seen is intentionally NULL — only set when an alert is actually sent.
    // signup_price_at_time records the price at signup for informational purposes.
    const [rows] = await sequelize.query(`
      INSERT INTO price_alert_subscribers (
        email, zip_code, threshold_price, unsubscribe_token,
        signup_price_at_time,
        source_page, utm_source, utm_campaign
      ) VALUES (
        :email, :zip_code, :threshold_price, :unsubscribe_token,
        :signup_price,
        :source_page, :utm_source, :utm_campaign
      )
      ON CONFLICT (email, zip_code) DO UPDATE SET
        threshold_price = EXCLUDED.threshold_price,
        active = true,
        last_price_seen = NULL,
        signup_price_at_time = COALESCE(price_alert_subscribers.signup_price_at_time, EXCLUDED.signup_price_at_time),
        source_page = COALESCE(EXCLUDED.source_page, price_alert_subscribers.source_page)
      RETURNING (xmax = 0) AS is_new
    `, {
      replacements: {
        email: email.toLowerCase().trim(),
        zip_code,
        threshold_price: price,
        unsubscribe_token,
        signup_price: currentMinPrice,
        source_page: source_page || null,
        utm_source: utm_source || null,
        utm_campaign: utm_campaign || null
      }
    });

    const isNew = rows[0]?.is_new;

    const hasCoverage = currentMinPrice !== null;

    // Send welcome email only on new subscriber (not threshold updates)
    if (isNew) {
      const PriceAlertService = require('../services/PriceAlertService');
      const alertService = new PriceAlertService(sequelize, logger);
      // Fire and forget — don't block the response
      alertService.sendWelcomeEmail(email.toLowerCase().trim(), zip_code, price, currentMinPrice, unsubscribe_token).catch(err => {
        logger.error('[PriceAlert] Welcome email error:', err.message);
      });
    }

    if (hasCoverage) {
      logger.info(`[PriceAlert] ${isNew ? 'New' : 'Updated'} subscriber: ${zip_code} at $${price.toFixed(2)}`);
    } else {
      logger.warn(`[PriceAlert] ${isNew ? 'New' : 'Updated'} subscriber in UNCOVERED ZIP: ${zip_code} at $${price.toFixed(2)}`);
    }
    res.json({
      success: true,
      has_coverage: hasCoverage,
      current_price: currentMinPrice
    });

  } catch (err) {
    logger.error('[PriceAlert] Subscribe error:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

/**
 * GET /api/price-alerts/unsubscribe?token=...
 * Renders confirmation page (does NOT auto-unsubscribe — protects against email link scanners)
 */
router.get('/unsubscribe', async (req, res) => {
  const { token } = req.query;
  if (!token || token.length !== 64) {
    return res.status(400).send(unsubPageHtml('Invalid unsubscribe link.', false));
  }

  res.send(unsubPageHtml(null, true, token));
});

/**
 * POST /api/price-alerts/unsubscribe
 * Actually deactivates the subscriber
 */
router.post('/unsubscribe', async (req, res) => {
  const sequelize = req.app.locals.sequelize;
  const logger = req.app.locals.logger;

  // Support both JSON body and form-encoded
  const token = req.body.token;
  if (!token || token.length !== 64) {
    return res.status(400).send(unsubPageHtml('Invalid unsubscribe link.', false));
  }

  try {
    const [, meta] = await sequelize.query(`
      UPDATE price_alert_subscribers
      SET active = false
      WHERE unsubscribe_token = :token AND active = true
    `, { replacements: { token } });

    const updated = meta?.rowCount || 0;
    if (updated > 0) {
      logger.info(`[PriceAlert] Unsubscribed via token.`);
    }

    res.send(unsubPageHtml("You've been unsubscribed. You won't receive any more price alerts.", false));
  } catch (err) {
    logger.error('[PriceAlert] Unsubscribe error:', err.message);
    res.status(500).send(unsubPageHtml('Something went wrong. Please try again.', false));
  }
});

/**
 * Build unsubscribe page HTML
 */
function unsubPageHtml(message, showButton, token) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Unsubscribe — HomeHeat</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f8f9fa; color: #333; }
    .card { background: #fff; padding: 32px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); max-width: 400px; text-align: center; }
    h1 { font-size: 20px; margin: 0 0 12px; }
    p { font-size: 14px; color: #666; line-height: 1.5; }
    button { background: #dc2626; color: #fff; border: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; cursor: pointer; margin-top: 16px; }
    button:hover { background: #b91c1c; }
    a { color: #2563eb; }
  </style>
</head>
<body>
  <div class="card">
    <h1>HomeHeat Price Alert</h1>
    ${message ? `<p>${message}</p>` : ''}
    ${showButton ? `
      <p>Click below to unsubscribe from price alerts.</p>
      <form method="POST" action="/api/price-alerts/unsubscribe">
        <input type="hidden" name="token" value="${token}">
        <button type="submit">Confirm Unsubscribe</button>
      </form>
    ` : `
      <p><a href="/">Back to HomeHeat</a></p>
    `}
  </div>
</body>
</html>`;
}

// POST /api/price-alerts/trigger — manually run the daily alert check
// Protected by DASHBOARD_PASSWORD
router.post('/trigger', async (req, res) => {
  const password = req.headers.authorization?.replace('Bearer ', '') || req.body?.password;
  if (password !== process.env.DASHBOARD_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  const sequelize = req.app.locals.sequelize;
  const logger = req.app.locals.logger || console;

  try {
    const PriceAlertService = require('../services/PriceAlertService');
    const alertService = new PriceAlertService(sequelize, logger);
    const result = await alertService.runDailyCheck();
    res.json(result);
  } catch (error) {
    logger.error('[PriceAlert] Manual trigger failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
