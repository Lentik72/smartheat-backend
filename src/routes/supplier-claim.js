/**
 * Supplier Claim Routes
 * V1.0.0: Allow suppliers to claim their listings
 *
 * Flow:
 * 1. Supplier submits claim via POST /api/supplier-claim
 * 2. Auto-emails confirmation to claimant + notification to admin
 * 3. Admin verifies via phone call to business number on file
 * 4. Admin approves via admin/supplier-claims route → magic link sent
 */

const express = require('express');
const router = express.Router();

// Rate limit: max claims per email per day
const MAX_CLAIMS_PER_EMAIL_PER_DAY = 3;
// Rate limit: max claims per IP per day
const MAX_CLAIMS_PER_IP_PER_DAY = 10;

/**
 * Send confirmation email to the claimant
 */
async function sendClaimConfirmationEmail(claim, supplierName) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.log('[SupplierClaim] RESEND_API_KEY not configured - skipping confirmation email');
    return false;
  }

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <span style="font-size: 48px;">📋</span>
      </div>

      <h1 style="color: #1a1a1a; text-align: center; margin-bottom: 8px;">Claim Received</h1>

      <div style="background: #f8f9fa; padding: 20px; border-radius: 12px; margin: 24px 0;">
        <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0;">
          We received your claim for <strong>${supplierName}</strong>.
        </p>
      </div>

      <h3 style="color: #1a1a1a; margin-top: 24px;">What happens next?</h3>
      <ol style="color: #666; font-size: 15px; line-height: 1.8; padding-left: 20px;">
        <li>We'll verify your claim by calling the business phone on file</li>
        <li>Verification typically takes 24-48 hours</li>
        <li>Once verified, you'll receive a secure link to update your prices anytime</li>
      </ol>

      <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #eee;">
        <p style="color: #999; font-size: 13px; margin: 0;">
          Questions? Just reply to this email.
        </p>
      </div>

      <p style="color: #999; font-size: 12px; text-align: center; margin-top: 32px;">
        HomeHeat · Connecting homeowners with local heating oil suppliers
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
        from: process.env.EMAIL_FROM || 'HomeHeat <onboarding@resend.dev>',
        to: [claim.claimantEmail],
        subject: `Claim Received - ${supplierName}`,
        html
      })
    });

    const result = await response.json();

    if (response.ok) {
      console.log(`[SupplierClaim] Confirmation sent to ${claim.claimantEmail}: ${result.id}`);
      return true;
    } else {
      console.error('[SupplierClaim] Resend API error (confirmation):', result);
      return false;
    }
  } catch (error) {
    console.error('[SupplierClaim] Failed to send confirmation:', error.message);
    return false;
  }
}

/**
 * Send notification email to admin about new claim
 */
async function sendAdminNotificationEmail(claim, supplier, pendingCount) {
  const apiKey = process.env.RESEND_API_KEY;
  const recipient = process.env.ADMIN_EMAIL || 'ltsoir@gmail.com';

  if (!apiKey) {
    console.log('[SupplierClaim] RESEND_API_KEY not configured - skipping admin notification');
    return false;
  }

  const adminUrl = `${process.env.BACKEND_URL || 'https://gethomeheat.com'}/admin/claims.html`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #1a1a1a; margin-bottom: 16px;">🔔 New Supplier Claim</h2>

      <div style="background: #fff3cd; padding: 16px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #F5A623;">
        <p style="margin: 0; color: #856404; font-size: 14px;">
          <strong>Action Required:</strong> Call to verify
        </p>
      </div>

      <h3 style="color: #666; margin: 20px 0 12px; font-size: 14px; text-transform: uppercase;">Supplier</h3>
      <div style="background: #f8f9fa; padding: 16px; border-radius: 8px;">
        <p style="margin: 8px 0;"><strong>Name:</strong> ${supplier.name}</p>
        <p style="margin: 8px 0;"><strong>Location:</strong> ${supplier.city}, ${supplier.state}</p>
        <p style="margin: 8px 0; font-size: 18px;"><strong>📞 Phone to Call:</strong> <a href="tel:${supplier.phone}" style="color: #007bff;">${supplier.phone}</a></p>
      </div>

      <h3 style="color: #666; margin: 20px 0 12px; font-size: 14px; text-transform: uppercase;">Claimant</h3>
      <div style="background: #f8f9fa; padding: 16px; border-radius: 8px;">
        <p style="margin: 8px 0;"><strong>Name:</strong> ${claim.claimantName}</p>
        <p style="margin: 8px 0;"><strong>Email:</strong> ${claim.claimantEmail}</p>
        <p style="margin: 8px 0;"><strong>Phone:</strong> ${claim.claimantPhone || 'Not provided'}</p>
        <p style="margin: 8px 0;"><strong>Role:</strong> ${claim.claimantRole || 'Not specified'}</p>
      </div>

      <div style="text-align: center; margin: 32px 0;">
        <a href="${adminUrl}" style="display: inline-block; background: #F5A623; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600;">
          Review Claims (${pendingCount} pending)
        </a>
      </div>

      <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #eee;">
        <p style="color: #999; font-size: 13px; margin: 0;">
          <strong>Verification steps:</strong><br>
          1. Call ${supplier.phone}<br>
          2. Ask: "Did ${claim.claimantName} submit a claim on HomeHeat?"<br>
          3. If yes → Click Verify in admin panel
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
        from: process.env.EMAIL_FROM || 'HomeHeat <onboarding@resend.dev>',
        to: [recipient],
        subject: `🔔 New Supplier Claim: ${supplier.name}`,
        html
      })
    });

    const result = await response.json();

    if (response.ok) {
      console.log(`[SupplierClaim] Admin notification sent: ${result.id}`);
      return true;
    } else {
      console.error('[SupplierClaim] Resend API error (admin):', result);
      return false;
    }
  } catch (error) {
    console.error('[SupplierClaim] Failed to send admin notification:', error.message);
    return false;
  }
}

/**
 * POST /api/supplier-claim
 * Submit a new claim for a supplier listing
 * Accepts slug (not supplierId) — ID resolved server-side
 */
router.post('/', async (req, res) => {
  const sequelize = req.app.locals.sequelize;
  const logger = req.app.locals.logger;

  try {
    const { slug, claimantName, claimantEmail, claimantPhone, claimantRole, ts } = req.body;

    // Validate required fields
    if (!slug || !claimantName || !claimantEmail) {
      return res.status(400).json({
        success: false,
        error: 'Supplier, name, and email are required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(claimantEmail)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }

    // Server-side timing validation (anti-bot) — ts is required
    if (!ts) {
      logger?.warn(`[SupplierClaim] Missing ts for ${slug} — direct POST without page load`);
      return res.status(400).json({ success: false, error: 'Invalid submission. Please use the claim page.' });
    }
    const renderTime = parseInt(ts, 10) * 1000;
    const elapsed = Date.now() - renderTime;
    if (isNaN(renderTime) || elapsed < 3000) {
      logger?.warn(`[SupplierClaim] Bot-speed submission for ${slug}: ${elapsed}ms`);
      return res.status(400).json({ success: false, error: 'Please wait a moment before submitting.' });
    }
    if (elapsed > 1800000) {
      return res.status(400).json({ success: false, error: 'Session expired. Please refresh and try again.' });
    }

    // Check honeypot (simple spam prevention)
    if (req.body.website_url) {
      logger?.warn(`[SupplierClaim] Honeypot triggered for ${claimantEmail}`);
      return res.json({ success: true, claimId: 'submitted', message: 'Claim submitted.' });
    }

    // Get IP for rate limiting and audit
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'] || '';

    // Check rate limit: max claims per email per day
    const [rateLimitCheck] = await sequelize.query(`
      SELECT COUNT(*) as count
      FROM supplier_claims
      WHERE claimant_email = :email
        AND submitted_at > NOW() - INTERVAL '24 hours'
    `, { replacements: { email: claimantEmail.toLowerCase().trim() } });

    if (parseInt(rateLimitCheck[0]?.count || 0) >= MAX_CLAIMS_PER_EMAIL_PER_DAY) {
      return res.status(429).json({
        success: false,
        error: 'Too many claims. Please try again tomorrow.'
      });
    }

    // Check rate limit: max claims per IP per day
    const [ipRateCheck] = await sequelize.query(`
      SELECT COUNT(*) as count
      FROM supplier_claims
      WHERE ip_address = :ip
        AND submitted_at > NOW() - INTERVAL '24 hours'
    `, { replacements: { ip } });

    if (parseInt(ipRateCheck[0]?.count || 0) >= MAX_CLAIMS_PER_IP_PER_DAY) {
      return res.status(429).json({
        success: false,
        error: 'Too many claims from this network. Please try again tomorrow.'
      });
    }

    // Resolve supplier by slug (active only) — no internal ID on client
    const [supplierRows] = await sequelize.query(`
      SELECT id, name, phone, city, state, claimed_at
      FROM suppliers
      WHERE slug = :slug AND active = true
    `, { replacements: { slug } });

    if (supplierRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Supplier not found'
      });
    }

    const supplier = supplierRows[0];
    const supplierId = supplier.id;

    // Block claims on already-verified suppliers
    if (supplier.claimed_at) {
      return res.status(400).json({
        success: false,
        error: 'This listing has already been verified'
      });
    }

    // Check for existing pending claim (user-friendly check before DB constraint)
    const [existingClaim] = await sequelize.query(`
      SELECT id, status
      FROM supplier_claims
      WHERE supplier_id = :supplierId
        AND status IN ('pending', 'verified')
      LIMIT 1
    `, { replacements: { supplierId } });

    if (existingClaim.length > 0) {
      const status = existingClaim[0].status;
      if (status === 'verified') {
        return res.status(400).json({
          success: false,
          error: 'This listing has already been claimed'
        });
      } else {
        return res.status(400).json({
          success: false,
          error: 'A claim for this listing is already pending review'
        });
      }
    }

    // Insert claim (unique index guards against race conditions)
    let insertResult;
    try {
      [insertResult] = await sequelize.query(`
        INSERT INTO supplier_claims (
          supplier_id, claimant_name, claimant_email, claimant_phone, claimant_role,
          ip_address, user_agent
        )
        VALUES (
          :supplierId, :name, :email, :phone, :role,
          :ip, :userAgent
        )
        RETURNING id
      `, {
        replacements: {
          supplierId,
          name: claimantName.trim(),
          email: claimantEmail.toLowerCase().trim(),
          phone: claimantPhone?.trim() || null,
          role: claimantRole || 'other',
          ip,
          userAgent
        }
      });
    } catch (insertError) {
      // Catch unique index violation (race condition: two simultaneous claims)
      if (insertError.original?.code === '23505') {
        return res.status(400).json({
          success: false,
          error: 'This listing already has a pending or verified claim.'
        });
      }
      throw insertError;
    }

    const claimId = insertResult[0]?.id;

    // Log claim_submitted event for funnel tracking
    try {
      await sequelize.query(`
        INSERT INTO audit_logs (id, admin_user_id, admin_email, action, details, ip_address, created_at, updated_at)
        VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'system', 'claim_submitted', :details, :ip, NOW(), NOW())
      `, {
        replacements: {
          details: JSON.stringify({ slug, claimId }),
          ip
        }
      });
    } catch (logErr) {
      // Non-critical
    }

    // Get pending claim count for admin notification
    const [pendingCount] = await sequelize.query(
      "SELECT COUNT(*) as count FROM supplier_claims WHERE status = 'pending'"
    );

    logger?.info(`[SupplierClaim] New claim submitted: ${supplier.name} by ${claimantEmail}`);

    // Send emails
    const claim = {
      claimantName: claimantName.trim(),
      claimantEmail: claimantEmail.toLowerCase().trim(),
      claimantPhone: claimantPhone?.trim(),
      claimantRole
    };

    await sendClaimConfirmationEmail(claim, supplier.name);
    await sendAdminNotificationEmail(claim, supplier, parseInt(pendingCount[0]?.count || 0));

    res.json({
      success: true,
      claimId,
      message: "Claim submitted! We'll call the business to verify within 24-48 hours."
    });

  } catch (error) {
    logger?.error('[SupplierClaim] Error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to submit claim. Please try again.'
    });
  }
});

/**
 * GET /api/supplier-claim/:claimId
 * Check claim status
 */
router.get('/:claimId', async (req, res) => {
  const sequelize = req.app.locals.sequelize;
  const logger = req.app.locals.logger;

  try {
    const { claimId } = req.params;

    const [rows] = await sequelize.query(`
      SELECT
        sc.id,
        sc.status,
        sc.submitted_at,
        sc.verified_at,
        sc.rejected_at,
        sc.rejection_reason,
        s.name as supplier_name
      FROM supplier_claims sc
      JOIN suppliers s ON sc.supplier_id = s.id
      WHERE sc.id = :claimId
    `, { replacements: { claimId } });

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Claim not found'
      });
    }

    const claim = rows[0];

    res.json({
      success: true,
      claim: {
        id: claim.id,
        supplierName: claim.supplier_name,
        status: claim.status,
        submittedAt: claim.submitted_at,
        verifiedAt: claim.verified_at,
        rejectedAt: claim.rejected_at,
        rejectionReason: claim.rejection_reason
      }
    });

  } catch (error) {
    logger?.error('[SupplierClaim] Status check error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to check claim status'
    });
  }
});

module.exports = router;
