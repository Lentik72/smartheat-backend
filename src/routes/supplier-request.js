/**
 * Supplier Request Routes
 * POST /api/supplier-request — web self-service form for unlisted suppliers
 *
 * Uses existing supplier_requests table (defined in database.js SupplierRequest model).
 * Existing columns: company_name, contact_person, primary_phone, email, website,
 *   city, state, zip_code, status, submitter_i_p, notes, admin_notes
 * Migration 105 adds: source, areas_served, delivery_model, matched_supplier_id
 */

const express = require('express');
const router = express.Router();

const MAX_REQUESTS_PER_EMAIL_PER_DAY = 3;
const MAX_REQUESTS_PER_IP_PER_DAY = 5;

const VALID_STATES = [
  'CT','DE','MA','ME','NH','NJ','NY','PA','RI','VT','MD','VA','OH','MI','WI','MN','IL','IN'
];

/**
 * Send admin notification for new supplier request
 */
async function sendAdminNotification(data) {
  const apiKey = process.env.RESEND_API_KEY;
  const recipient = process.env.ADMIN_EMAIL || 'ltsoir@gmail.com';

  if (!apiKey) {
    console.log('[SupplierRequest] RESEND_API_KEY not configured - skipping notification');
    return false;
  }

  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #1a1a1a;">New Supplier Request</h2>

      <div style="background: #f0fdf4; padding: 16px; border-radius: 8px; margin-bottom: 16px; border-left: 4px solid #22c55e;">
        <p style="margin: 0; color: #166534; font-size: 14px;">
          <strong>A supplier wants to be listed on HomeHeat.</strong>
        </p>
      </div>

      <div style="background: #f8f9fa; padding: 16px; border-radius: 8px;">
        <p style="margin: 8px 0;"><strong>Business:</strong> ${data.companyName}</p>
        <p style="margin: 8px 0;"><strong>Contact:</strong> ${data.contactPerson || 'Not provided'}</p>
        <p style="margin: 8px 0;"><strong>Location:</strong> ${data.city}, ${data.state}</p>
        <p style="margin: 8px 0;"><strong>Phone:</strong> ${data.phone}</p>
        <p style="margin: 8px 0;"><strong>Email:</strong> ${data.email}</p>
        ${data.website ? `<p style="margin: 8px 0;"><strong>Website:</strong> <a href="${data.website}">${data.website}</a></p>` : ''}
        ${data.areasServed ? `<p style="margin: 8px 0;"><strong>Areas served:</strong> ${data.areasServed}</p>` : ''}
      </div>

      ${data.matchedName ? `
      <div style="background: #fef3c7; padding: 16px; border-radius: 8px; margin-top: 16px; border-left: 4px solid #d97706;">
        <p style="margin: 0; color: #92400e; font-size: 14px;">
          <strong>Possible duplicate:</strong> "${data.matchedName}" already in directory.
        </p>
      </div>` : ''}

      <p style="color: #999; font-size: 13px; margin-top: 24px;">
        Source: web self-service form. Research supplier, create migration if COD, add to scrape-config if prices scrapable.
      </p>
    </div>
  `;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [recipient],
        subject: `New Supplier Request: ${data.companyName} (${data.city}, ${data.state})`,
        html
      })
    });

    const result = await response.json();
    if (response.ok) {
      console.log(`[SupplierRequest] Admin notification sent: ${result.id}`);
      return true;
    } else {
      console.error('[SupplierRequest] Resend error:', result);
      return false;
    }
  } catch (error) {
    console.error('[SupplierRequest] Notification failed:', error.message);
    return false;
  }
}

/**
 * Send confirmation email to the supplier who submitted the request
 */
async function sendSupplierConfirmation(data) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log('[SupplierRequest] RESEND_API_KEY not configured - skipping confirmation');
    return false;
  }

  const greeting = data.contactPerson ? `Hi ${data.contactPerson},` : 'Hi,';

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 20px;">

      <div style="text-align: center; margin-bottom: 28px; padding-bottom: 20px; border-bottom: 1px solid #eee;">
        <span style="font-size: 22px; font-weight: 700; color: #1a1a1a;">HomeHeat</span>
      </div>

      <p style="color: #333; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
        ${greeting}
      </p>

      <p style="color: #333; font-size: 15px; line-height: 1.6; margin: 0 0 20px;">
        We received your request to list <strong>${data.companyName}</strong> on HomeHeat.
      </p>

      <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin: 0 0 24px;">
        <p style="color: #555; font-size: 14px; line-height: 1.6; margin: 0 0 4px;"><strong>What happens next:</strong></p>
        <ol style="color: #555; font-size: 14px; line-height: 1.8; margin: 8px 0 0; padding-left: 20px;">
          <li>We verify your business information</li>
          <li>Your listing goes live in the directory</li>
          <li>We send you a link to manage your listing and update prices</li>
        </ol>
        <p style="color: #888; font-size: 13px; margin: 12px 0 0;">This typically takes 1–2 business days.</p>
      </div>

      <div style="background: #FEF3EB; padding: 16px 20px; border-radius: 10px; margin: 0 0 24px;">
        <p style="color: #92400e; font-size: 14px; line-height: 1.5; margin: 0;">
          <strong>Did you know?</strong> Once listed, you can update your price anytime by texting
          <strong style="white-space: nowrap;">(845) 335-8855</strong>. No login needed.
        </p>
      </div>

      <p style="color: #555; font-size: 14px; line-height: 1.6; margin: 0 0 8px;">
        Questions? Just reply to this email.
      </p>

      <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #eee; text-align: center;">
        <p style="color: #aaa; font-size: 12px; margin: 0;">
          HomeHeat &middot; Connecting homeowners with local heating oil suppliers
        </p>
      </div>

    </div>
  `;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [data.email],
        subject: `We received your listing request — ${data.companyName}`,
        html
      })
    });

    const result = await response.json();
    if (response.ok) {
      console.log(`[SupplierRequest] Confirmation sent to ${data.email}: ${result.id}`);
      return true;
    } else {
      console.error('[SupplierRequest] Confirmation error:', result);
      return false;
    }
  } catch (error) {
    console.error('[SupplierRequest] Confirmation failed:', error.message);
    return false;
  }
}

/**
 * POST /api/supplier-request
 * Submit a request to add a business to the directory
 */
router.post('/', async (req, res) => {
  const sequelize = req.app.locals.sequelize;
  const logger = req.app.locals.logger;

  try {
    const { businessName, contactName, city, state, phone, email, website, areasServed, deliveryModel, ts } = req.body;

    // Validate required fields
    if (!businessName || !city || !state || !phone || !email) {
      return res.status(400).json({ success: false, error: 'Business name, city, state, phone, and email are required' });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, error: 'Invalid email format' });
    }

    if (!VALID_STATES.includes(state.toUpperCase())) {
      return res.status(400).json({ success: false, error: 'We currently cover the Northeast US. Check back soon.' });
    }

    // Anti-bot timing
    if (!ts) {
      return res.status(400).json({ success: false, error: 'Invalid submission.' });
    }
    const renderTime = parseInt(ts, 10) * 1000;
    const elapsed = Date.now() - renderTime;
    if (isNaN(renderTime) || elapsed < 3000) {
      return res.status(400).json({ success: false, error: 'Please wait a moment before submitting.' });
    }
    if (elapsed > 1800000) {
      return res.status(400).json({ success: false, error: 'Session expired. Please refresh and try again.' });
    }

    // Honeypot
    if (req.body.website_url) {
      return res.json({ success: true, message: 'Request submitted.' });
    }

    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;

    // Rate limit: email
    const [emailCheck] = await sequelize.query(`
      SELECT COUNT(*) as count FROM supplier_requests
      WHERE email = :email AND created_at > NOW() - INTERVAL '24 hours'
    `, { replacements: { email: email.toLowerCase().trim() } });

    if (parseInt(emailCheck[0]?.count || 0) >= MAX_REQUESTS_PER_EMAIL_PER_DAY) {
      return res.status(429).json({ success: false, error: 'Too many requests. Please try again tomorrow.' });
    }

    // Rate limit: IP
    const [ipCheck] = await sequelize.query(`
      SELECT COUNT(*) as count FROM supplier_requests
      WHERE ip_address = :ip AND created_at > NOW() - INTERVAL '24 hours'
    `, { replacements: { ip } });

    if (parseInt(ipCheck[0]?.count || 0) >= MAX_REQUESTS_PER_IP_PER_DAY) {
      return res.status(429).json({ success: false, error: 'Too many requests from this network.' });
    }

    // Dedup check: name + city match against existing suppliers
    const nameLower = businessName.trim().toLowerCase();
    const cityLower = city.trim().toLowerCase();
    const [matches] = await sequelize.query(`
      SELECT id, name, slug, city, state
      FROM suppliers
      WHERE LOWER(name) LIKE :name AND LOWER(city) = :city AND active = true
      LIMIT 1
    `, { replacements: { name: `%${nameLower}%`, city: cityLower } });

    if (matches.length > 0) {
      const match = matches[0];
      return res.json({
        success: false,
        duplicate: true,
        existingSupplier: {
          name: match.name,
          slug: match.slug,
          city: match.city,
          state: match.state
        },
        message: `Did you mean ${match.name} in ${match.city}, ${match.state}?`
      });
    }

    // Insert request
    await sequelize.query(`
      INSERT INTO supplier_requests (
        id, business_name, phone, email, website,
        city, state, admin_notes, source, areas_served, delivery_model,
        ip_address, user_agent, status, created_at, updated_at
      )
      VALUES (
        gen_random_uuid(), :businessName, :phone, :email, :website,
        :city, :state, :adminNotes, 'web', :areasServed, :deliveryModel,
        :ip, :userAgent, 'pending', NOW(), NOW()
      )
    `, {
      replacements: {
        businessName: businessName.trim(),
        phone: phone.trim(),
        email: email.toLowerCase().trim(),
        website: website?.trim() || null,
        city: city.trim(),
        state: state.toUpperCase().trim(),
        adminNotes: contactName ? `Contact: ${contactName}` : null,
        areasServed: areasServed?.trim() || null,
        deliveryModel: deliveryModel === 'contract' ? 'contract' : 'cod',
        ip,
        userAgent: req.headers['user-agent'] || ''
      }
    });

    logger?.info(`[SupplierRequest] New web request: ${businessName} (${city}, ${state}) from ${email}`);

    const requestData = {
      companyName: businessName.trim(),
      contactPerson: contactName?.trim() || null,
      city: city.trim(),
      state: state.toUpperCase().trim(),
      phone: phone.trim(),
      email: email.toLowerCase().trim(),
      website: website?.trim() || null,
      areasServed: areasServed?.trim() || null,
      matchedName: null
    };

    // Send admin notification + supplier confirmation in parallel
    await Promise.allSettled([
      sendAdminNotification(requestData),
      sendSupplierConfirmation(requestData)
    ]);

    res.json({
      success: true,
      message: "We'll verify and add your listing within 1-2 business days."
    });

  } catch (error) {
    logger?.error(`[SupplierRequest] Error: ${error.message}`, error.stack);
    res.status(500).json({ success: false, error: 'Failed to submit request. Please try again.' });
  }
});

module.exports = router;
