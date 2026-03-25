/**
 * Quote Request Routes (heatingoil-h1fy)
 *
 * POST /api/quote-request          — Create request + send OTP
 * POST /api/quote-request/verify   — Verify OTP + dispatch to suppliers
 * GET  /api/quote-request/availability — Check if ZIP has opted-in suppliers
 * GET  /api/quote-request/supplier-response — Supplier "Called them?" tracking link
 * GET  /api/quote-request/supplier-optin — Render opt-in confirmation page
 * POST /api/quote-request/supplier-optin — Confirm supplier opt-in
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const QuoteRequestService = require('../services/QuoteRequestService');
const { escapeHtml } = require('../utils/html');

// Rate limiters
const createLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: { error: 'Too many requests. Please try again later.' }
});

const verifyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  message: { error: 'Too many verification attempts. Please try again later.' }
});

/**
 * POST /api/quote-request — Create request + send OTP
 */
router.post('/', createLimiter, async (req, res) => {
  const service = req.app.locals.quoteRequestService;
  const logger = req.app.locals.logger;

  if (!service) {
    return res.status(503).json({ error: 'Quote system not available.' });
  }

  try {
    const result = await service.createQuoteRequest(req.body);

    if (result.error) {
      return res.status(400).json({ error: result.error });
    }

    res.json(result);
  } catch (err) {
    logger.error(`[QuoteRequest Route] Create failed: ${err.message}`);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// POST /api/quote-request/verify — DEPRECATED (replaced by link verification at /v/:id)
// Kept as stub to avoid 404 if old JS still cached
router.post('/verify', (req, res) => {
  res.status(410).json({ error: 'Verification is now done via the link in your text message.' });
});

/**
 * GET /api/quote-request/availability?zip=XXXXX
 * Check if Get Quotes is available for a ZIP.
 * Also serves as form impression counter for kill criteria.
 */
router.get('/availability', async (req, res) => {
  const service = req.app.locals.quoteRequestService;

  if (!service) {
    return res.json({ available: false, supplier_count: 0 });
  }

  try {
    const result = await service.checkAvailability(req.query.zip);
    res.json(result);
  } catch (err) {
    res.json({ available: false, supplier_count: 0 });
  }
});

/**
 * GET /api/quote-response?t=TOKEN — Supplier "Called them?" link
 * Returns inline HTML thank-you page.
 */
router.get('/supplier-response', async (req, res) => {
  const service = req.app.locals.quoteRequestService;
  const token = req.query.t;

  if (!service || !token) {
    return res.status(400).send(renderPage('Invalid Link', '<p>This link is not valid.</p>'));
  }

  try {
    const result = await service.handleSupplierResponse(token);

    if (!result.found) {
      return res.send(renderPage('Link Expired', '<p>This link has expired or is not valid.</p>'));
    }

    if (result.already_responded) {
      return res.send(renderPage('Already Confirmed', `
        <div style="max-width:480px; margin:0 auto; text-align:center;">
          <div style="font-size:2rem; margin-bottom:8px;">✓</div>
          <h2 style="margin:0 0 8px; color:#1a1a1a;">Already Confirmed</h2>
          <p style="color:#666;">You already confirmed contacting ${esc(result.consumer_name)}. Thanks, ${esc(result.supplier_name)}!</p>
        </div>
      `));
    }

    res.send(renderPage('Lead Confirmed', `
      <div style="max-width:480px; margin:0 auto; text-align:center;">
        <div style="background:#F0FDF4; border:1px solid #86EFAC; border-radius:12px; padding:24px;">
          <div style="font-size:2rem; margin-bottom:8px;">✓</div>
          <h2 style="color:#16A34A; margin:0 0 8px;">Confirmed</h2>
          <p style="color:#374151; margin:0 0 12px;">
            Thanks, <strong>${esc(result.supplier_name)}</strong>! We've noted that you contacted <strong>${esc(result.consumer_name)}</strong>.
          </p>
          <p style="font-size:13px; color:#666; margin:0;">
            Keep responding to leads to continue receiving them.
          </p>
        </div>
        <p style="margin-top:20px; font-size:13px; color:#999;">
          <a href="https://www.gethomeheat.com/for-suppliers" style="color:#FF6B35;">Learn more about HomeHeat for suppliers →</a>
        </p>
      </div>
    `));
  } catch (err) {
    res.status(500).send(renderPage('Error', '<p>Something went wrong. Please try again.</p>'));
  }
});

/**
 * GET /api/quote-request/supplier-optin?supplier=SLUG&token=HMAC
 * Renders confirmation page (does NOT auto-opt-in — prevents email scanner triggers)
 */
router.get('/supplier-optin', async (req, res) => {
  const { supplier: slug, token } = req.query;
  const sequelize = req.app.locals.sequelize;

  if (!slug || !token || !QuoteRequestService.verifyOptinHMAC(slug, token)) {
    return res.status(400).send(renderPage('Invalid Link', '<p>This link is not valid or has expired.</p>'));
  }

  // Fetch supplier info
  try {
    const [rows] = await sequelize.query(
      `SELECT name, phone, city, state FROM suppliers WHERE slug = :slug AND active = true`,
      { replacements: { slug } }
    );

    if (rows.length === 0) {
      return res.status(404).send(renderPage('Not Found', '<p>Supplier not found.</p>'));
    }

    const s = rows[0];
    res.send(renderPage('Receive Delivery Leads', `
      <div style="background:#fff; border:2px solid #FF6B35; border-radius:12px; padding:24px; max-width:480px; margin:0 auto;">
        <h2 style="margin:0 0 8px; color:#1a1a1a;">Get Free Delivery Leads</h2>
        <p style="color:#666; margin:0 0 16px;">for <strong>${esc(s.name)}</strong> (${esc(s.city)}, ${esc(s.state)})</p>
        <p style="font-size:14px; color:#374151; line-height:1.6;">
          When a homeowner in your area requests a heating oil delivery quote on HomeHeat,
          we'll text the lead details instantly — free during our beta.
        </p>
        <form method="POST" action="/api/quote-request/supplier-optin">
          <input type="hidden" name="supplier" value="${esc(slug)}">
          <input type="hidden" name="token" value="${esc(token)}">
          <div style="margin:16px 0;">
            <label style="display:block; font-size:13px; font-weight:600; color:#374151; margin-bottom:4px;">
              Send leads to this phone number:
            </label>
            <input type="tel" name="lead_phone" value="${esc(s.phone)}" required
              style="width:100%; padding:10px 12px; border:1px solid #D1D5DB; border-radius:8px; font-size:16px; box-sizing:border-box;">
            <p style="font-size:12px; color:#888; margin:4px 0 0;">
              Must be a mobile number that can receive text messages. Update if needed.
            </p>
          </div>
          <p style="font-size:13px; color:#666; margin:8px 0 16px;">
            You can opt out anytime by replying STOP to any lead text.
          </p>
          <button type="submit" style="width:100%; padding:14px; font-size:16px; font-weight:700;
            background:#FF6B35; color:#fff; border:none; border-radius:8px; cursor:pointer;">
            Yes, Send Me Leads
          </button>
        </form>
      </div>
    `));
  } catch (err) {
    res.status(500).send(renderPage('Error', '<p>Something went wrong. Please try again.</p>'));
  }
});

/**
 * POST /api/quote-request/supplier-optin — Confirm opt-in (from the form above)
 */
router.post('/supplier-optin', async (req, res) => {
  const service = req.app.locals.quoteRequestService;
  const sequelize = req.app.locals.sequelize;
  const { supplier: slug, token, lead_phone } = req.body;

  if (!slug || !token || !QuoteRequestService.verifyOptinHMAC(slug, token)) {
    return res.status(400).send(renderPage('Invalid', '<p>This link is not valid.</p>'));
  }

  if (!service) {
    return res.status(503).send(renderPage('Unavailable', '<p>Service temporarily unavailable.</p>'));
  }

  try {
    const { extractLast10, formatPhone } = require('../utils/phone');
    const phone10 = extractLast10(lead_phone);
    if (!phone10) {
      return res.status(400).send(renderPage('Invalid Phone',
        '<p>Please enter a valid 10-digit US phone number that can receive texts.</p>' +
        '<p><a href="javascript:history.back()">Go back</a></p>'
      ));
    }

    const formattedPhone = formatPhone(phone10);
    const clientIp = req.headers['x-forwarded-for'] || req.ip;

    // Check if already opted in — just update phone if changed
    const [existing] = await sequelize.query(
      `SELECT lead_opted_in, lead_phone FROM suppliers WHERE slug = :slug AND active = true`,
      { replacements: { slug } }
    );

    if (existing.length === 0) {
      return res.status(404).send(renderPage('Not Found', '<p>Supplier not found.</p>'));
    }

    // Store lead_phone separately — never overwrite scraped phone
    await sequelize.query(`
      UPDATE suppliers SET lead_phone = :leadPhone, phone_last10 = :phone10, lead_opted_in_ip = :ip
      WHERE slug = :slug
    `, { replacements: { leadPhone: lead_phone.trim(), phone10, ip: clientIp, slug } });

    // Opt in (or re-confirm if already in)
    const result = await service.optInSupplier(slug);
    if (!result) {
      return res.status(404).send(renderPage('Not Found', '<p>Supplier not found.</p>'));
    }

    // Send welcome test SMS to confirm the number works
    const welcomeResult = await service.sendLeadSMS(
      lead_phone,
      `HOMEHEAT\n\nYou're set up for lead alerts.\n\nWhen a homeowner nearby requests heating oil, we'll text you their details here.\n\nReply STOP anytime to opt out.\nMsg rates may apply.`
    );

    // If SMS failed, revert opt-in — don't leave them opted-in but unreachable
    if (!welcomeResult) {
      await sequelize.query(
        `UPDATE suppliers SET lead_opted_in = false WHERE slug = :slug`,
        { replacements: { slug } }
      );

      return res.send(renderPage('Phone Issue', `
        <div style="background:#FEF2F2; border:1px solid #FCA5A5; border-radius:12px; padding:24px; text-align:center; max-width:480px; margin:0 auto;">
          <h2 style="color:#DC2626; margin:0 0 8px;">Could Not Verify Phone</h2>
          <p style="color:#374151; margin:0 0 12px;">
            We couldn't send a text to <strong>${esc(formattedPhone)}</strong>. This may be a landline or a number that can't receive SMS.
          </p>
          <p style="font-size:13px; color:#666;">
            Please try again with a mobile number, or <a href="mailto:support@gethomeheat.com">contact us</a> for help.
          </p>
          <p style="margin-top:16px;"><a href="javascript:history.back()" style="color:#FF6B35; font-weight:600;">Go back and try a different number</a></p>
        </div>
      `));
    }

    const alreadyOptedIn = existing[0].lead_opted_in;
    const statusText = alreadyOptedIn
      ? 'Phone number updated!'
      : 'You\'re In!';

    res.send(renderPage(statusText, `
      <div style="background:#F0FDF4; border:1px solid #86EFAC; border-radius:12px; padding:24px; text-align:center; max-width:480px; margin:0 auto;">
        <h2 style="color:#16A34A; margin:0 0 8px;">${esc(statusText)}</h2>
        <p style="color:#374151; margin:0 0 12px;">
          We'll text <strong>${esc(formattedPhone)}</strong> when homeowners in your area request heating oil quotes.
        </p>
        <p style="color:#16A34A; font-size:13px;">We just sent a test text — check your phone.</p>
        <p style="font-size:13px; color:#666; margin-top:12px;">
          Leads are free during our beta. Reply STOP to any text to unsubscribe.
        </p>
      </div>
    `));
  } catch (err) {
    res.status(500).send(renderPage('Error', '<p>Something went wrong. Please try again.</p>'));
  }
});

// ─── Helpers ──────────────────────────────────────────────────

function esc(text) {
  return escapeHtml(text);
}

function renderPage(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)} — HomeHeat</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
           margin: 0; padding: 40px 20px; background: #FEF3EB; color: #1a1a1a; }
    h2 { font-size: 1.4rem; }
    p { font-size: 15px; line-height: 1.5; }
    a { color: #FF6B35; }
  </style>
</head>
<body>${bodyHtml}</body>
</html>`;
}

module.exports = router;
