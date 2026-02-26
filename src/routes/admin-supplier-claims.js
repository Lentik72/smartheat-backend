/**
 * Admin Supplier Claims Routes
 * V1.0.0: Admin interface for reviewing and approving supplier claims
 *
 * Endpoints:
 * - GET /api/admin/supplier-claims - List pending claims
 * - POST /api/admin/supplier-claims/:claimId/verify - Approve claim, generate magic link
 * - POST /api/admin/supplier-claims/:claimId/reject - Reject claim
 * - POST /api/admin/supplier-claims/:claimId/revoke - Emergency revoke magic link
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

// Admin master token (same as price-review)
const ADMIN_MASTER_TOKEN = process.env.ADMIN_REVIEW_TOKEN || 'smartheat-price-review-2024';

// Magic link expiry (1 year)
const MAGIC_LINK_EXPIRY_DAYS = 365;

/**
 * Admin authentication middleware
 */
const requireAdmin = (req, res, next) => {
  const token = req.headers['x-admin-token'] || req.query.token;

  if (!token || token !== ADMIN_MASTER_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
};

/**
 * Generate a secure random token
 */
function generateToken() {
  return crypto.randomBytes(32).toString('hex'); // 64 chars
}

/**
 * Send magic link email to verified supplier
 */
async function sendMagicLinkEmail(claimant, supplier, magicLinkUrl) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.log('[AdminClaims] RESEND_API_KEY not configured - skipping magic link email');
    return false;
  }

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <span style="font-size: 48px;">✅</span>
      </div>

      <h1 style="color: #1a1a1a; text-align: center; margin-bottom: 8px;">You're Verified!</h1>

      <div style="background: #d4edda; padding: 20px; border-radius: 12px; margin: 24px 0; border-left: 4px solid #28a745;">
        <p style="color: #155724; font-size: 16px; line-height: 1.6; margin: 0;">
          Your claim for <strong>${supplier.name}</strong> has been verified.
        </p>
      </div>

      <p style="color: #666; font-size: 15px; line-height: 1.6;">
        You can now update your prices anytime using the secure link below. This link is unique to you
        and works for one year.
      </p>

      <div style="text-align: center; margin: 32px 0;">
        <a href="${magicLinkUrl}" style="display: inline-block; background: #F5A623; color: white; padding: 16px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
          Update My Prices
        </a>
      </div>

      <div style="background: #f8f9fa; padding: 16px; border-radius: 8px; margin: 24px 0;">
        <p style="color: #666; font-size: 14px; margin: 0;">
          <strong>📊 Your listing is visible to homeowners searching for heating oil in your area.</strong>
          Keep your prices current to attract more customers.
        </p>
      </div>

      <h3 style="color: #1a1a1a; margin-top: 24px;">How it works:</h3>
      <ul style="color: #666; font-size: 15px; line-height: 1.8; padding-left: 20px;">
        <li>Click the button above anytime to update your price</li>
        <li>Changes appear on HomeHeat within minutes</li>
        <li>Lower prices get shown first to homeowners</li>
        <li>No account or password needed - just use this link</li>
      </ul>

      <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #eee;">
        <p style="color: #999; font-size: 13px; margin: 0;">
          Questions? Just reply to this email.<br><br>
          <strong>Important:</strong> Keep this email safe - the link above is your key to updating prices.
          If you need a new link, just reply to this email.
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
        to: [claimant.email],
        subject: `✅ Verified! Update Your Prices on HomeHeat`,
        html
      })
    });

    const result = await response.json();

    if (response.ok) {
      console.log(`[AdminClaims] Magic link email sent to ${claimant.email}: ${result.id}`);
      return true;
    } else {
      console.error('[AdminClaims] Resend API error:', result);
      return false;
    }
  } catch (error) {
    console.error('[AdminClaims] Failed to send magic link email:', error.message);
    return false;
  }
}

/**
 * GET /api/admin/supplier-claims
 * List pending claims for admin review
 */
router.get('/', requireAdmin, async (req, res) => {
  const sequelize = req.app.locals.sequelize;
  const logger = req.app.locals.logger;

  try {
    const status = req.query.status || 'pending';

    const [claims] = await sequelize.query(`
      SELECT
        sc.id,
        sc.claimant_name,
        sc.claimant_email,
        sc.claimant_phone,
        sc.claimant_role,
        sc.status,
        sc.submitted_at,
        sc.verified_at,
        sc.rejected_at,
        sc.rejection_reason,
        s.id as supplier_id,
        s.name as supplier_name,
        s.phone as supplier_phone,
        s.city as supplier_city,
        s.state as supplier_state,
        s.website as supplier_website
      FROM supplier_claims sc
      JOIN suppliers s ON sc.supplier_id = s.id
      WHERE sc.status = :status
      ORDER BY sc.submitted_at DESC
    `, { replacements: { status } });

    // Get counts by status
    const [counts] = await sequelize.query(`
      SELECT status, COUNT(*) as count
      FROM supplier_claims
      GROUP BY status
    `);

    const statusCounts = {};
    counts.forEach(c => { statusCounts[c.status] = parseInt(c.count); });

    res.json({
      success: true,
      claims: claims.map(c => ({
        id: c.id,
        claimant: {
          name: c.claimant_name,
          email: c.claimant_email,
          phone: c.claimant_phone,
          role: c.claimant_role
        },
        supplier: {
          id: c.supplier_id,
          name: c.supplier_name,
          phone: c.supplier_phone,
          city: c.supplier_city,
          state: c.supplier_state,
          website: c.supplier_website
        },
        status: c.status,
        submittedAt: c.submitted_at,
        verifiedAt: c.verified_at,
        rejectedAt: c.rejected_at,
        rejectionReason: c.rejection_reason
      })),
      counts: statusCounts
    });

  } catch (error) {
    logger?.error('[AdminClaims] List error:', error.message);
    res.status(500).json({ error: 'Failed to list claims' });
  }
});

/**
 * POST /api/admin/supplier-claims/:claimId/verify
 * Approve claim and generate magic link
 */
router.post('/:claimId/verify', requireAdmin, async (req, res) => {
  const sequelize = req.app.locals.sequelize;
  const logger = req.app.locals.logger;

  try {
    const { claimId } = req.params;
    const { notes } = req.body;

    // Get claim details
    const [claims] = await sequelize.query(`
      SELECT
        sc.id,
        sc.supplier_id,
        sc.claimant_name,
        sc.claimant_email,
        sc.status,
        s.name as supplier_name,
        s.city as supplier_city,
        s.state as supplier_state
      FROM supplier_claims sc
      JOIN suppliers s ON sc.supplier_id = s.id
      WHERE sc.id = :claimId
    `, { replacements: { claimId } });

    if (claims.length === 0) {
      return res.status(404).json({ error: 'Claim not found' });
    }

    const claim = claims[0];

    if (claim.status !== 'pending') {
      return res.status(400).json({ error: `Claim is already ${claim.status}` });
    }

    // 1. Update claim status
    await sequelize.query(`
      UPDATE supplier_claims
      SET status = 'verified',
          verified_at = NOW(),
          verified_by = 'admin'
      WHERE id = :claimId
    `, { replacements: { claimId } });

    // 2. Update supplier as verified
    await sequelize.query(`
      UPDATE suppliers
      SET verified = true,
          claimed_by_email = :email,
          claimed_at = NOW()
      WHERE id = :supplierId
    `, {
      replacements: {
        email: claim.claimant_email,
        supplierId: claim.supplier_id
      }
    });

    // 3. Invalidate any existing magic links for this supplier
    await sequelize.query(`
      UPDATE magic_link_tokens
      SET revoked_at = NOW()
      WHERE supplier_id = :supplierId
        AND purpose = 'supplier_price_update'
        AND revoked_at IS NULL
    `, { replacements: { supplierId: claim.supplier_id } });

    // 4. Generate new magic link
    const token = generateToken();
    const expiresAt = new Date(Date.now() + MAGIC_LINK_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    await sequelize.query(`
      INSERT INTO magic_link_tokens (token, purpose, supplier_id, expires_at)
      VALUES (:token, 'supplier_price_update', :supplierId, :expiresAt)
    `, {
      replacements: {
        token,
        supplierId: claim.supplier_id,
        expiresAt
      }
    });

    // 5. Build magic link URL
    const baseUrl = process.env.BACKEND_URL || 'https://gethomeheat.com';
    const magicLinkUrl = `${baseUrl}/update-price.html?token=${token}`;

    logger?.info(`[AdminClaims] Verified claim for ${claim.supplier_name}, magic link generated`);

    // 6. Send magic link email
    const emailSent = await sendMagicLinkEmail(
      { name: claim.claimant_name, email: claim.claimant_email },
      { name: claim.supplier_name },
      magicLinkUrl
    );

    res.json({
      success: true,
      message: `Claim verified for ${claim.supplier_name}`,
      magicLinkSent: emailSent,
      magicLinkUrl, // For admin reference
      expiresAt: expiresAt.toISOString()
    });

  } catch (error) {
    logger?.error('[AdminClaims] Verify error:', error.message);
    res.status(500).json({ error: 'Failed to verify claim' });
  }
});

/**
 * POST /api/admin/supplier-claims/:claimId/reject
 * Reject claim with reason
 */
router.post('/:claimId/reject', requireAdmin, async (req, res) => {
  const sequelize = req.app.locals.sequelize;
  const logger = req.app.locals.logger;

  try {
    const { claimId } = req.params;
    const { reason } = req.body;

    // Get claim
    const [claims] = await sequelize.query(`
      SELECT id, status, supplier_id
      FROM supplier_claims
      WHERE id = :claimId
    `, { replacements: { claimId } });

    if (claims.length === 0) {
      return res.status(404).json({ error: 'Claim not found' });
    }

    if (claims[0].status !== 'pending') {
      return res.status(400).json({ error: `Claim is already ${claims[0].status}` });
    }

    await sequelize.query(`
      UPDATE supplier_claims
      SET status = 'rejected',
          rejected_at = NOW(),
          rejection_reason = :reason
      WHERE id = :claimId
    `, {
      replacements: { claimId, reason: reason || 'Could not verify ownership' }
    });

    logger?.info(`[AdminClaims] Rejected claim ${claimId}: ${reason}`);

    res.json({
      success: true,
      message: 'Claim rejected'
    });

  } catch (error) {
    logger?.error('[AdminClaims] Reject error:', error.message);
    res.status(500).json({ error: 'Failed to reject claim' });
  }
});

/**
 * POST /api/admin/supplier-claims/:claimId/revoke
 * Emergency revoke - invalidate the magic link without generating a new one
 */
router.post('/:claimId/revoke', requireAdmin, async (req, res) => {
  const sequelize = req.app.locals.sequelize;
  const logger = req.app.locals.logger;

  try {
    const { claimId } = req.params;

    // Get claim to find supplier_id
    const [claims] = await sequelize.query(`
      SELECT supplier_id, claimant_email
      FROM supplier_claims
      WHERE id = :claimId AND status = 'verified'
    `, { replacements: { claimId } });

    if (claims.length === 0) {
      return res.status(404).json({ error: 'Verified claim not found' });
    }

    const { supplier_id } = claims[0];

    // Revoke all active magic links for this supplier
    const [result] = await sequelize.query(`
      UPDATE magic_link_tokens
      SET revoked_at = NOW()
      WHERE supplier_id = :supplierId
        AND purpose = 'supplier_price_update'
        AND revoked_at IS NULL
      RETURNING id
    `, { replacements: { supplierId: supplier_id } });

    const revokedCount = result.length;

    logger?.info(`[AdminClaims] Revoked ${revokedCount} magic link(s) for claim ${claimId}`);

    res.json({
      success: true,
      message: `Revoked ${revokedCount} magic link(s)`,
      revokedCount
    });

  } catch (error) {
    logger?.error('[AdminClaims] Revoke error:', error.message);
    res.status(500).json({ error: 'Failed to revoke magic link' });
  }
});

/**
 * POST /api/admin/supplier-claims/:claimId/regenerate
 * Generate a new magic link for a verified claim (if old one was revoked/lost)
 */
router.post('/:claimId/regenerate', requireAdmin, async (req, res) => {
  const sequelize = req.app.locals.sequelize;
  const logger = req.app.locals.logger;

  try {
    const { claimId } = req.params;

    // Get verified claim
    const [claims] = await sequelize.query(`
      SELECT
        sc.supplier_id,
        sc.claimant_name,
        sc.claimant_email,
        s.name as supplier_name
      FROM supplier_claims sc
      JOIN suppliers s ON sc.supplier_id = s.id
      WHERE sc.id = :claimId AND sc.status = 'verified'
    `, { replacements: { claimId } });

    if (claims.length === 0) {
      return res.status(404).json({ error: 'Verified claim not found' });
    }

    const claim = claims[0];

    // Invalidate any existing magic links
    await sequelize.query(`
      UPDATE magic_link_tokens
      SET revoked_at = NOW()
      WHERE supplier_id = :supplierId
        AND purpose = 'supplier_price_update'
        AND revoked_at IS NULL
    `, { replacements: { supplierId: claim.supplier_id } });

    // Generate new magic link
    const token = generateToken();
    const expiresAt = new Date(Date.now() + MAGIC_LINK_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    await sequelize.query(`
      INSERT INTO magic_link_tokens (token, purpose, supplier_id, expires_at)
      VALUES (:token, 'supplier_price_update', :supplierId, :expiresAt)
    `, {
      replacements: {
        token,
        supplierId: claim.supplier_id,
        expiresAt
      }
    });

    const baseUrl = process.env.BACKEND_URL || 'https://gethomeheat.com';
    const magicLinkUrl = `${baseUrl}/update-price.html?token=${token}`;

    // Send email
    const emailSent = await sendMagicLinkEmail(
      { name: claim.claimant_name, email: claim.claimant_email },
      { name: claim.supplier_name },
      magicLinkUrl
    );

    logger?.info(`[AdminClaims] Regenerated magic link for ${claim.supplier_name}`);

    res.json({
      success: true,
      message: `New magic link generated for ${claim.supplier_name}`,
      magicLinkSent: emailSent,
      magicLinkUrl,
      expiresAt: expiresAt.toISOString()
    });

  } catch (error) {
    logger?.error('[AdminClaims] Regenerate error:', error.message);
    res.status(500).json({ error: 'Failed to regenerate magic link' });
  }
});

/**
 * GET /api/admin/supplier-claims/funnel
 * Claim funnel metrics from audit_logs (last 30 days)
 */
router.get('/funnel', requireAdmin, async (req, res) => {
  const sequelize = req.app.locals.sequelize;

  try {
    const [rows] = await sequelize.query(`
      SELECT action, COUNT(*) as count
      FROM audit_logs
      WHERE action IN ('claim_page_view', 'claim_submitted', 'claim_verified', 'claim_rejected')
        AND created_at > NOW() - INTERVAL '30 days'
      GROUP BY action
    `);

    const counts = {};
    rows.forEach(r => { counts[r.action] = parseInt(r.count); });

    res.json({
      success: true,
      views: counts.claim_page_view || 0,
      submits: counts.claim_submitted || 0,
      verifies: counts.claim_verified || 0,
      rejects: counts.claim_rejected || 0
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to load funnel data' });
  }
});

module.exports = router;
