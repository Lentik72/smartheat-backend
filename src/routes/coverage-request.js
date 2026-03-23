// src/routes/coverage-request.js
// Coverage request: email capture for empty ZIPs + unsubscribe + welcome email

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { isValidEmail, isValidZip } = require('../utils/email-validation');

const usZipLookup = require('../data/us-zip-lookup.json');

const VALID_FUEL_TYPES = ['heating_oil', 'kerosene', 'propane'];
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = 'Leo from HomeHeat <hello@gethomeheat.com>';
const REPLY_TO = 'support@gethomeheat.com';
const SITE_URL = 'https://www.gethomeheat.com';

/**
 * POST /api/coverage-request
 */
router.post('/', async (req, res) => {
  // Kill switch
  if (process.env.DISABLE_COVERAGE_REQUESTS === 'true') {
    return res.json({ success: false, error: 'Coverage requests temporarily disabled.' });
  }

  const sequelize = req.app.locals.sequelize;
  const logger = req.app.locals.logger || console;

  try {
    // Honeypot — silent accept for bots (matches supplier-claim.js convention)
    if (req.body.website_url) {
      logger.warn('[CoverageRequest] Honeypot triggered');
      return res.json({ success: true });
    }

    const { email, zip_code, fuel_types: rawFuelTypes, source_page } = req.body;

    // Validate email
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    // Validate ZIP
    if (!isValidZip(zip_code)) {
      return res.status(400).json({ error: 'Please enter a valid 5-digit ZIP code.' });
    }

    // Validate fuel_types
    let fuelTypes = ['heating_oil'];
    if (Array.isArray(rawFuelTypes) && rawFuelTypes.length > 0) {
      fuelTypes = rawFuelTypes.filter(ft => VALID_FUEL_TYPES.includes(ft));
      if (fuelTypes.length === 0) fuelTypes = ['heating_oil'];
    }

    // Per-email abuse cap
    const emailLower = email.toLowerCase().trim();
    const [countRows] = await sequelize.query(`
      SELECT COUNT(*) AS cnt FROM coverage_requests
      WHERE email = :email AND active = true
    `, { replacements: { email: emailLower } });
    if (parseInt(countRows[0].cnt, 10) > 20) {
      return res.status(400).json({ error: 'Too many coverage requests for this email.' });
    }

    // Look up ZIP for geo data
    const zipData = usZipLookup[zip_code] || {};
    const state = zipData.state || null;
    const county = zipData.county || null;
    const city = zipData.city || null;

    // Generate unsubscribe token
    const unsubscribe_token = crypto.randomBytes(32).toString('hex');

    // Upsert — preserve existing unsubscribe_token on conflict
    const [rows] = await sequelize.query(`
      INSERT INTO coverage_requests (
        email, zip_code, fuel_types, source_page,
        state, county, city, unsubscribe_token
      ) VALUES (
        :email, :zip_code, :fuel_types, :source_page,
        :state, :county, :city, :unsubscribe_token
      )
      ON CONFLICT (email, zip_code) DO UPDATE SET
        fuel_types = EXCLUDED.fuel_types,
        active = true,
        updated_at = NOW()
      RETURNING (xmax = 0) AS is_new
    `, {
      replacements: {
        email: emailLower,
        zip_code,
        fuel_types: `{${fuelTypes.join(',')}}`,
        source_page: source_page || null,
        state,
        county,
        city,
        unsubscribe_token
      }
    });

    const isNew = rows[0]?.is_new;

    // Fire-and-forget welcome email on new signup only
    if (isNew) {
      sendWelcomeEmail({ email: emailLower, zip_code, city, state, fuelTypes, unsubscribe_token }, logger)
        .catch(err => logger.error('[CoverageRequest] Welcome email error:', err.message));
    }

    logger.info(`[CoverageRequest] ${isNew ? 'New' : 'Updated'} request: ${zip_code} (${fuelTypes.join(',')})`);
    res.json({ success: true, city, state, county });

  } catch (err) {
    logger.error('[CoverageRequest] Error:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

/**
 * GET /api/coverage-request/unsubscribe?token=...
 * Renders confirmation page (does NOT auto-deactivate — protects against email link scanners)
 */
router.get('/unsubscribe', async (req, res) => {
  const { token } = req.query;
  if (!token || token.length !== 64) {
    return res.status(400).send(unsubPageHtml('Invalid unsubscribe link.', false));
  }

  res.send(unsubPageHtml(null, true, token));
});

/**
 * POST /api/coverage-request/unsubscribe
 * Actually deactivates the coverage request
 */
router.post('/unsubscribe', async (req, res) => {
  const sequelize = req.app.locals.sequelize;
  const logger = req.app.locals.logger || console;

  const token = req.body.token;
  if (!token || token.length !== 64) {
    return res.status(400).send(unsubPageHtml('Invalid unsubscribe link.', false));
  }

  try {
    const [updateRows] = await sequelize.query(`
      UPDATE coverage_requests
      SET active = false, updated_at = NOW()
      WHERE unsubscribe_token = :token AND active = true
      RETURNING zip_code
    `, { replacements: { token } });

    const zip = updateRows[0]?.zip_code || 'your area';
    if (updateRows.length > 0) {
      logger.info('[CoverageRequest] Unsubscribed via token.');
    }

    res.send(unsubPageHtml(`You've been unsubscribed from coverage notifications for ${zip}.`, false));
  } catch (err) {
    logger.error('[CoverageRequest] Unsubscribe error:', err.message);
    res.status(500).send(unsubPageHtml('Something went wrong. Please try again.', false));
  }
});

/**
 * Send welcome email via Resend
 */
async function sendWelcomeEmail({ email, zip_code, city, state, fuelTypes, unsubscribe_token }, logger) {
  if (!RESEND_API_KEY) {
    logger.warn('[CoverageRequest] RESEND_API_KEY not set, skipping welcome email.');
    return false;
  }

  const location = city && state ? `${city}, ${state.toUpperCase()}` : zip_code;
  const fuelList = fuelTypes.map(ft => ft.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())).join(', ');
  const unsubUrl = `${SITE_URL}/api/coverage-request/unsubscribe?token=${unsubscribe_token}`;
  const appUrl = 'https://apps.apple.com/us/app/homeheat/id6747320571?utm_source=coverage_request&utm_campaign=welcome';

  const subject = `We'll notify you as soon as ${fuelList.toLowerCase()} prices are available near ${zip_code}`;

  const html = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; background: #fff;">
  <div style="background: #f8f9fa; padding: 16px 20px; margin-bottom: 24px; border-radius: 8px 8px 0 0;">
    <a href="${SITE_URL}" style="text-decoration: none; display: inline-flex; align-items: center; gap: 10px;">
      <img src="${SITE_URL}/images/app-icon-192.png" alt="HomeHeat" width="40" height="40" style="border-radius: 10px;">
      <span style="font-size: 20px; font-weight: 700; color: #1a1a1a;">HomeHeat</span>
    </a>
  </div>

  <div style="padding: 0 20px;">
    <h2 style="font-size: 20px; color: #1a1a1a; margin: 0 0 16px;">You're on the list for ${location}</h2>

    <div style="background: #f0f7ff; border-radius: 8px; padding: 16px; margin: 16px 0;">
      <p style="margin: 0; font-size: 15px; color: #333;">We'll email you as soon as <strong>${fuelList.toLowerCase()}</strong> pricing data is available near <strong>${zip_code}</strong>.</p>
    </div>

    <p style="color: #666; font-size: 14px;">That's it — no newsletters, no spam. Just a one-time heads-up when we add suppliers in your area.</p>

    <div style="background: #fef3c7; border-radius: 8px; padding: 12px 16px; margin: 20px 0; font-size: 13px;">
      📱 <strong>Track your tank level and predict refills.</strong> The HomeHeat app works even without local pricing data.
      <a href="${appUrl}" style="color: #2563eb;">Download free →</a>
    </div>
  </div>

  <p style="font-size: 12px; color: #888; margin-top: 32px; padding: 0 20px; border-top: 1px solid #eee; padding-top: 16px; text-align: center;">
    <a href="${unsubUrl}" style="color: #888;">Unsubscribe</a> · <a href="${SITE_URL}/privacy.html" style="color: #888;">Privacy Policy</a>
    <br><br>HomeHeat · Katonah, NY 10536
  </p>
</div>`;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [email],
        reply_to: REPLY_TO,
        subject,
        html
      })
    });

    const result = await response.json();

    if (response.ok && result.id) {
      logger.info(`[CoverageRequest] Welcome email sent to ${email}`);
      return true;
    }

    logger.error(`[CoverageRequest] Welcome email failed for ${email}:`, result);
    return false;
  } catch (err) {
    logger.error(`[CoverageRequest] Welcome email error for ${email}:`, err.message);
    return false;
  }
}

/**
 * Build unsubscribe page HTML (matches price-alerts.js pattern)
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
    <h1>HomeHeat Coverage Notification</h1>
    ${message ? `<p>${message}</p>` : ''}
    ${showButton ? `
      <p>Click below to unsubscribe from coverage notifications.</p>
      <form method="POST" action="/api/coverage-request/unsubscribe">
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

module.exports = router;
