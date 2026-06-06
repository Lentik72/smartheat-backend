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

// Admin master token (same as price-review). REQUIRED in Railway env vars — no
// hardcoded default, so a missing env var fails closed. (heatingoil-3fv5)
const ADMIN_MASTER_TOKEN = process.env.ADMIN_REVIEW_TOKEN;

// Magic link expiry (30 days — short-lived for security; suppliers can request a new link)
const MAGIC_LINK_EXPIRY_DAYS = 30;

/**
 * Admin authentication middleware
 * Accepts: X-Admin-Token header, Authorization: Bearer, or ?token= query param.
 * Checks against ADMIN_REVIEW_TOKEN first, then DASHBOARD_PASSWORD as fallback.
 */
const requireAdmin = (req, res, next) => {
  const token = req.headers['x-admin-token']
    || req.query.token
    || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const dashboardPassword = process.env.DASHBOARD_PASSWORD;
  if ((ADMIN_MASTER_TOKEN && token === ADMIN_MASTER_TOKEN) || (dashboardPassword && token === dashboardPassword)) {
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized' });
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
        and works for 30 days.
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
          <strong>Important:</strong> This link expires in 30 days. Need a new one? Just reply to this email
          and we'll send a fresh link right away.
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
        from: process.env.EMAIL_FROM,
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
        s.slug as supplier_slug,
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

    // For verified claims, enrich with dashboard engagement data
    let engagementMap = {};
    if (status === 'verified' && claims.length > 0) {
      try {
        const supplierIds = claims.map(c => c.supplier_id);
        const [engRows] = await sequelize.query(`
          SELECT
            details::jsonb->>'supplier_id' as supplier_id,
            COUNT(*) FILTER (WHERE action = 'dashboard_view') as total_visits,
            MAX(created_at) FILTER (WHERE action = 'dashboard_view') as last_dashboard_visit,
            MAX(created_at) FILTER (WHERE action = 'supplier_price_update') as last_price_update,
            MAX(CASE WHEN action = 'supplier_price_update' THEN (details::jsonb->>'source') END) as last_price_source
          FROM audit_logs
          WHERE (details::jsonb->>'supplier_id')::uuid = ANY(:ids)
            AND action IN ('dashboard_view', 'supplier_price_update')
          GROUP BY details::jsonb->>'supplier_id'
        `, { replacements: { ids: supplierIds } });

        engRows.forEach(r => { engagementMap[r.supplier_id] = r; });
      } catch (e) {
        // Engagement enrichment is best-effort
      }
    }

    res.json({
      success: true,
      claims: claims.map(c => {
        const eng = engagementMap[c.supplier_id];
        const result = {
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
            slug: c.supplier_slug,
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
        };

        if (eng) {
          result.engagement = {
            totalVisits: parseInt(eng.total_visits || 0),
            lastDashboardVisit: eng.last_dashboard_visit || null,
            lastPriceUpdate: eng.last_price_update || null,
            lastPriceSource: eng.last_price_source || null
          };
        }

        return result;
      }),
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
        sc.claimant_phone,
        sc.status,
        s.name as supplier_name,
        s.slug as supplier_slug,
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
    const magicLinkUrl = `${baseUrl}/supplier-dashboard.html?token=${token}`;

    logger?.info(`[AdminClaims] Verified claim for ${claim.supplier_name}, magic link generated`);

    // 6. Send magic link email
    const emailSent = await sendMagicLinkEmail(
      { name: claim.claimant_name, email: claim.claimant_email },
      { name: claim.supplier_name },
      magicLinkUrl
    );

    // 7. Audit log
    try {
      await sequelize.query(`
        INSERT INTO audit_logs (id, admin_user_id, admin_email, action, details, created_at, updated_at)
        VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'admin', 'claim_verified', :details, NOW(), NOW())
      `, {
        replacements: {
          details: JSON.stringify({
            claimId,
            supplier_slug: claim.supplier_slug,
            adminEmail: 'admin',
            method: 'admin_panel'
          })
        }
      });
    } catch (auditErr) {
      logger?.warn('[AdminClaims] Failed to write verify audit log:', auditErr.message);
    }

    // 8. Enrich supplier data from claimant if fields are empty
    try {
      await sequelize.query(`
        UPDATE suppliers
        SET email = COALESCE(email, :email),
            phone = COALESCE(phone, :phone),
            contact_name = COALESCE(contact_name, :contactName),
            contact_source = 'supplier_claim',
            contact_updated_at = NOW()
        WHERE id = :supplierId
      `, {
        replacements: {
          email: claim.claimant_email,
          phone: claim.claimant_phone || null,
          contactName: claim.claimant_name,
          supplierId: claim.supplier_id
        }
      });
    } catch (enrichErr) {
      logger?.warn('[AdminClaims] Failed to enrich supplier from claim:', enrichErr.message);
    }

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
      SELECT sc.id, sc.status, sc.supplier_id, s.slug as supplier_slug
      FROM supplier_claims sc
      JOIN suppliers s ON sc.supplier_id = s.id
      WHERE sc.id = :claimId
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

    // Audit log
    try {
      await sequelize.query(`
        INSERT INTO audit_logs (id, admin_user_id, admin_email, action, details, created_at, updated_at)
        VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'admin', 'claim_rejected', :details, NOW(), NOW())
      `, {
        replacements: {
          details: JSON.stringify({
            claimId,
            supplier_slug: claims[0].supplier_slug,
            adminEmail: 'admin',
            method: 'admin_panel',
            reason: reason || 'Could not verify ownership'
          })
        }
      });
    } catch (auditErr) {
      logger?.warn('[AdminClaims] Failed to write reject audit log:', auditErr.message);
    }

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
      SELECT sc.supplier_id, sc.claimant_email, s.slug as supplier_slug
      FROM supplier_claims sc
      JOIN suppliers s ON sc.supplier_id = s.id
      WHERE sc.id = :claimId AND sc.status = 'verified'
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

    // Audit log
    try {
      await sequelize.query(`
        INSERT INTO audit_logs (id, admin_user_id, admin_email, action, details, created_at, updated_at)
        VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'admin', 'claim_revoked', :details, NOW(), NOW())
      `, {
        replacements: {
          details: JSON.stringify({
            claimId,
            supplier_slug: claims[0].supplier_slug,
            adminEmail: 'admin',
            method: 'admin_panel',
            revokedCount
          })
        }
      });
    } catch (auditErr) {
      logger?.warn('[AdminClaims] Failed to write revoke audit log:', auditErr.message);
    }

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
        s.name as supplier_name,
        s.slug as supplier_slug
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
    const magicLinkUrl = `${baseUrl}/supplier-dashboard.html?token=${token}`;

    // Send email
    const emailSent = await sendMagicLinkEmail(
      { name: claim.claimant_name, email: claim.claimant_email },
      { name: claim.supplier_name },
      magicLinkUrl
    );

    logger?.info(`[AdminClaims] Regenerated magic link for ${claim.supplier_name}`);

    // Audit log
    try {
      await sequelize.query(`
        INSERT INTO audit_logs (id, admin_user_id, admin_email, action, details, created_at, updated_at)
        VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'admin', 'claim_regenerated', :details, NOW(), NOW())
      `, {
        replacements: {
          details: JSON.stringify({
            claimId,
            supplier_slug: claim.supplier_slug,
            adminEmail: 'admin',
            method: 'admin_panel'
          })
        }
      });
    } catch (auditErr) {
      logger?.warn('[AdminClaims] Failed to write regenerate audit log:', auditErr.message);
    }

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
 * Comprehensive claim funnel metrics from audit_logs (last 30 days)
 * Includes outreach tracking, conversion rates, timing, grid/price impact
 */
router.get('/funnel', requireAdmin, async (req, res) => {
  const sequelize = req.app.locals.sequelize;

  try {
    // 1. Basic funnel counts
    const [countRows] = await sequelize.query(`
      SELECT action, COUNT(*) as count
      FROM audit_logs
      WHERE action IN (
        'claim_page_view', 'claim_submitted', 'claim_verified',
        'claim_rejected', 'outreach_email_sent'
      )
        AND created_at > NOW() - INTERVAL '30 days'
      GROUP BY action
    `);

    const counts = {};
    countRows.forEach(r => { counts[r.action] = parseInt(r.count); });

    const outreachSent = counts.outreach_email_sent || 0;
    const pageViewsTotal = counts.claim_page_view || 0;
    const formSubmits = counts.claim_submitted || 0;
    const verified = counts.claim_verified || 0;
    const rejected = counts.claim_rejected || 0;

    // 2. Outreach slugs + outreach-related page views
    const [outreachSlugs] = await sequelize.query(`
      SELECT DISTINCT COALESCE(details::jsonb->>'supplier_slug', details::jsonb->>'slug') as slug
      FROM audit_logs
      WHERE action = 'outreach_email_sent'
        AND created_at > NOW() - INTERVAL '30 days'
    `);
    const outreachSlugSet = outreachSlugs.map(r => r.slug).filter(Boolean);

    let outreachOpened = 0;
    let pageViewsOrganic = pageViewsTotal;
    if (outreachSlugSet.length > 0) {
      const [outreachViews] = await sequelize.query(`
        SELECT COUNT(DISTINCT COALESCE(details::jsonb->>'supplier_slug', details::jsonb->>'slug')) as opened
        FROM audit_logs
        WHERE action = 'claim_page_view'
          AND COALESCE(details::jsonb->>'supplier_slug', details::jsonb->>'slug') = ANY(:slugs)
          AND created_at > NOW() - INTERVAL '30 days'
      `, { replacements: { slugs: outreachSlugSet } });
      outreachOpened = parseInt(outreachViews[0]?.opened || 0);

      const [outreachViewCount] = await sequelize.query(`
        SELECT COUNT(*) as count
        FROM audit_logs
        WHERE action = 'claim_page_view'
          AND COALESCE(details::jsonb->>'supplier_slug', details::jsonb->>'slug') = ANY(:slugs)
          AND created_at > NOW() - INTERVAL '30 days'
      `, { replacements: { slugs: outreachSlugSet } });
      const outreachPageViews = parseInt(outreachViewCount[0]?.count || 0);
      pageViewsOrganic = pageViewsTotal - outreachPageViews;
    }

    // 3. Grid impact breakdown (from gridState in page view details)
    const [gridRows] = await sequelize.query(`
      SELECT
        (details::jsonb)->>'gridState' as grid_state,
        COUNT(*) as views,
        COUNT(DISTINCT COALESCE(details::jsonb->>'supplier_slug', details::jsonb->>'slug')) as unique_slugs
      FROM audit_logs
      WHERE action = 'claim_page_view'
        AND created_at > NOW() - INTERVAL '30 days'
        AND (details::jsonb)->>'gridState' IS NOT NULL
      GROUP BY (details::jsonb)->>'gridState'
    `);

    const gridCounts = {};
    gridRows.forEach(r => { gridCounts[r.grid_state] = parseInt(r.views); });
    const unlockedViews = gridCounts.unlocked || 0;
    const lockedViews = gridCounts.locked || 0;

    // 4. Price visibility impact (from hasPrice in page view details)
    const [priceRows] = await sequelize.query(`
      SELECT
        ((details::jsonb)->>'hasPrice')::text as has_price,
        COUNT(*) as views
      FROM audit_logs
      WHERE action = 'claim_page_view'
        AND created_at > NOW() - INTERVAL '30 days'
        AND (details::jsonb)->>'hasPrice' IS NOT NULL
      GROUP BY ((details::jsonb)->>'hasPrice')::text
    `);

    const priceCounts = {};
    priceRows.forEach(r => { priceCounts[r.has_price] = parseInt(r.views); });
    const pricedViews = priceCounts['true'] || 0;
    const unpricedViews = priceCounts['false'] || 0;

    // 5. Timing: average hours between funnel stages
    let timingData = {};
    try {
      // Avg time from outreach to first page view (for outreach slugs)
      if (outreachSlugSet.length > 0) {
        const [timingRows] = await sequelize.query(`
          SELECT AVG(EXTRACT(EPOCH FROM (pv.created_at - oe.created_at)) / 3600) as avg_hours
          FROM (
            SELECT COALESCE(details::jsonb->>'supplier_slug', details::jsonb->>'slug') as slug, MIN(created_at) as created_at
            FROM audit_logs
            WHERE action = 'outreach_email_sent'
              AND created_at > NOW() - INTERVAL '30 days'
            GROUP BY COALESCE(details::jsonb->>'supplier_slug', details::jsonb->>'slug')
          ) oe
          INNER JOIN (
            SELECT COALESCE(details::jsonb->>'supplier_slug', details::jsonb->>'slug') as slug, MIN(created_at) as created_at
            FROM audit_logs
            WHERE action = 'claim_page_view'
              AND created_at > NOW() - INTERVAL '30 days'
            GROUP BY COALESCE(details::jsonb->>'supplier_slug', details::jsonb->>'slug')
          ) pv ON oe.slug = pv.slug
          WHERE pv.created_at > oe.created_at
        `);
        timingData.avg_hours_outreach_to_view = timingRows[0]?.avg_hours
          ? Math.round(parseFloat(timingRows[0].avg_hours))
          : null;
      }

      // Avg time from page view to submit
      const [viewToSubmit] = await sequelize.query(`
        SELECT AVG(EXTRACT(EPOCH FROM (sub.created_at - pv.created_at)) / 3600) as avg_hours
        FROM (
          SELECT COALESCE(details::jsonb->>'supplier_slug', details::jsonb->>'slug') as slug, MIN(created_at) as created_at
          FROM audit_logs
          WHERE action = 'claim_page_view'
            AND created_at > NOW() - INTERVAL '30 days'
          GROUP BY COALESCE(details::jsonb->>'supplier_slug', details::jsonb->>'slug')
        ) pv
        INNER JOIN (
          SELECT COALESCE(details::jsonb->>'supplier_slug', details::jsonb->>'slug') as slug, MIN(created_at) as created_at
          FROM audit_logs
          WHERE action = 'claim_submitted'
            AND created_at > NOW() - INTERVAL '30 days'
          GROUP BY COALESCE(details::jsonb->>'supplier_slug', details::jsonb->>'slug')
        ) sub ON pv.slug = sub.slug
        WHERE sub.created_at > pv.created_at
      `);
      timingData.avg_hours_view_to_submit = viewToSubmit[0]?.avg_hours
        ? Math.round(parseFloat(viewToSubmit[0].avg_hours))
        : null;

      // Avg time from submit to verify
      const [submitToVerify] = await sequelize.query(`
        SELECT AVG(EXTRACT(EPOCH FROM (ver.created_at - sub.created_at)) / 3600) as avg_hours
        FROM (
          SELECT COALESCE(details::jsonb->>'supplier_slug', details::jsonb->>'slug') as slug, MIN(created_at) as created_at
          FROM audit_logs
          WHERE action = 'claim_submitted'
            AND created_at > NOW() - INTERVAL '30 days'
          GROUP BY COALESCE(details::jsonb->>'supplier_slug', details::jsonb->>'slug')
        ) sub
        INNER JOIN (
          SELECT COALESCE(details::jsonb->>'supplier_slug', details::jsonb->>'slug') as slug, MIN(created_at) as created_at
          FROM audit_logs
          WHERE action = 'claim_verified'
            AND created_at > NOW() - INTERVAL '30 days'
          GROUP BY COALESCE(details::jsonb->>'supplier_slug', details::jsonb->>'slug')
        ) ver ON sub.slug = ver.slug
        WHERE ver.created_at > sub.created_at
      `);
      timingData.avg_hours_submit_to_verify = submitToVerify[0]?.avg_hours
        ? Math.round(parseFloat(submitToVerify[0].avg_hours))
        : null;
    } catch (e) {
      // Timing queries are best-effort
    }

    // 6. Submit rates by grid/price state (match submits to page view state by slug)
    let submitRateUnlocked = null;
    let submitRateLocked = null;
    let submitRatePriced = null;
    let submitRateUnpriced = null;
    try {
      // Get the grid state of each submitted slug's most recent page view before submit
      const [submitGrid] = await sequelize.query(`
        SELECT
          pv.grid_state,
          COUNT(DISTINCT sub.slug) as submits
        FROM (
          SELECT COALESCE(details::jsonb->>'supplier_slug', details::jsonb->>'slug') as slug, MIN(created_at) as created_at
          FROM audit_logs
          WHERE action = 'claim_submitted'
            AND created_at > NOW() - INTERVAL '30 days'
          GROUP BY COALESCE(details::jsonb->>'supplier_slug', details::jsonb->>'slug')
        ) sub
        INNER JOIN LATERAL (
          SELECT (details::jsonb)->>'gridState' as grid_state
          FROM audit_logs
          WHERE action = 'claim_page_view'
            AND COALESCE(details::jsonb->>'supplier_slug', details::jsonb->>'slug') = sub.slug
            AND created_at <= sub.created_at
          ORDER BY created_at DESC
          LIMIT 1
        ) pv ON true
        WHERE pv.grid_state IS NOT NULL
        GROUP BY pv.grid_state
      `);

      const submitsByGrid = {};
      submitGrid.forEach(r => { submitsByGrid[r.grid_state] = parseInt(r.submits); });

      if (unlockedViews > 0) submitRateUnlocked = ((submitsByGrid.unlocked || 0) / unlockedViews * 100).toFixed(1) + '%';
      if (lockedViews > 0) submitRateLocked = ((submitsByGrid.locked || 0) / lockedViews * 100).toFixed(1) + '%';

      // Price visibility submit rates
      const [submitPrice] = await sequelize.query(`
        SELECT
          pv.has_price,
          COUNT(DISTINCT sub.slug) as submits
        FROM (
          SELECT COALESCE(details::jsonb->>'supplier_slug', details::jsonb->>'slug') as slug, MIN(created_at) as created_at
          FROM audit_logs
          WHERE action = 'claim_submitted'
            AND created_at > NOW() - INTERVAL '30 days'
          GROUP BY COALESCE(details::jsonb->>'supplier_slug', details::jsonb->>'slug')
        ) sub
        INNER JOIN LATERAL (
          SELECT ((details::jsonb)->>'hasPrice')::text as has_price
          FROM audit_logs
          WHERE action = 'claim_page_view'
            AND COALESCE(details::jsonb->>'supplier_slug', details::jsonb->>'slug') = sub.slug
            AND created_at <= sub.created_at
          ORDER BY created_at DESC
          LIMIT 1
        ) pv ON true
        WHERE pv.has_price IS NOT NULL
        GROUP BY pv.has_price
      `);

      const submitsByPrice = {};
      submitPrice.forEach(r => { submitsByPrice[r.has_price] = parseInt(r.submits); });

      if (pricedViews > 0) submitRatePriced = ((submitsByPrice['true'] || 0) / pricedViews * 100).toFixed(1) + '%';
      if (unpricedViews > 0) submitRateUnpriced = ((submitsByPrice['false'] || 0) / unpricedViews * 100).toFixed(1) + '%';
    } catch (e) {
      // Submit rate queries are best-effort
    }

    // Helper for safe percentage
    const pct = (num, den) => den > 0 ? (num / den * 100).toFixed(1) + '%' : '0%';

    // 7. Post-verify funnel stages: dashboard_visit, price_update, return_visit
    let postVerify = { dashboard_visit: 0, price_update: 0, return_visit: 0 };
    try {
      // Dashboard visits by verified suppliers
      const [dashVisits] = await sequelize.query(`
        SELECT COUNT(DISTINCT details::jsonb->>'supplier_id') as cnt
        FROM audit_logs
        WHERE action = 'dashboard_view'
          AND created_at > NOW() - INTERVAL '30 days'
      `);
      postVerify.dashboard_visit = parseInt(dashVisits[0]?.cnt || 0);

      // Price updates by verified suppliers (supplier_direct source)
      const [priceUpdates] = await sequelize.query(`
        SELECT COUNT(DISTINCT details::jsonb->>'supplier_id') as cnt
        FROM audit_logs
        WHERE action = 'supplier_price_update'
          AND created_at > NOW() - INTERVAL '30 days'
          AND (details::jsonb->>'source') = 'supplier_direct'
      `);
      postVerify.price_update = parseInt(priceUpdates[0]?.cnt || 0);

      // Return visits (suppliers with 2+ distinct dashboard visit dates)
      const [returnVisits] = await sequelize.query(`
        SELECT COUNT(*) as cnt FROM (
          SELECT details::jsonb->>'supplier_id' as sid
          FROM audit_logs
          WHERE action = 'dashboard_view'
            AND created_at > NOW() - INTERVAL '30 days'
          GROUP BY details::jsonb->>'supplier_id'
          HAVING COUNT(DISTINCT created_at::date) >= 2
        ) t
      `);
      postVerify.return_visit = parseInt(returnVisits[0]?.cnt || 0);
    } catch (e) {
      // Post-verify stages are best-effort
    }

    res.json({
      success: true,
      funnel: {
        outreach_sent: outreachSent,
        outreach_opened: outreachOpened,
        page_views_total: pageViewsTotal,
        page_views_organic: pageViewsOrganic,
        form_submits: formSubmits,
        verified,
        rejected,
        dashboard_visit: postVerify.dashboard_visit,
        price_update: postVerify.price_update,
        return_visit: postVerify.return_visit
      },
      conversion_rates: {
        outreach_to_view: pct(outreachOpened, outreachSent),
        view_to_submit: pct(formSubmits, pageViewsTotal),
        submit_to_verify: pct(verified, formSubmits),
        verify_to_dashboard: pct(postVerify.dashboard_visit, verified),
        dashboard_to_price: pct(postVerify.price_update, postVerify.dashboard_visit),
        dashboard_to_return: pct(postVerify.return_visit, postVerify.dashboard_visit)
      },
      timing: {
        avg_hours_outreach_to_view: timingData.avg_hours_outreach_to_view,
        avg_hours_view_to_submit: timingData.avg_hours_view_to_submit,
        avg_hours_submit_to_verify: timingData.avg_hours_submit_to_verify
      },
      grid_impact: {
        unlocked_views: unlockedViews,
        locked_views: lockedViews,
        submit_rate_unlocked: submitRateUnlocked,
        submit_rate_locked: submitRateLocked
      },
      price_impact: {
        priced_views: pricedViews,
        unpriced_views: unpricedViews,
        submit_rate_priced: submitRatePriced,
        submit_rate_unpriced: submitRateUnpriced
      },
      period: 'last_30_days'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to load funnel data' });
  }
});

/**
 * GET /api/admin/supplier-claims/verify-quick
 * One-click verify from admin notification email
 * Token = HMAC-SHA256(secret, claimId + supplierSlug + exp)
 * Valid for 7 days from generation
 */
router.get('/verify-quick', async (req, res) => {
  const sequelize = req.app.locals.sequelize;
  const logger = req.app.locals.logger;

  const secret = process.env.CLAIM_VERIFY_SECRET;
  if (!secret) {
    return res.status(500).send('Server misconfigured: CLAIM_VERIFY_SECRET not set.');
  }

  const { claimId, exp, token } = req.query;

  if (!claimId || !exp || !token) {
    return res.status(400).send('Missing parameters.');
  }

  // Validate expiration
  const expMs = parseInt(exp, 10);
  const now = Date.now();
  if (isNaN(expMs) || expMs <= now) {
    return res.status(410).send('This verification link has expired.');
  }
  // Reject manipulated expiry (max 7 days from now)
  if (expMs > now + 7 * 24 * 60 * 60 * 1000) {
    return res.status(400).send('Invalid expiration.');
  }

  try {
    // Get claim + supplier slug for HMAC verification
    const [claims] = await sequelize.query(`
      SELECT
        sc.id, sc.supplier_id, sc.claimant_name, sc.claimant_email, sc.claimant_phone, sc.status,
        s.name as supplier_name, s.slug as supplier_slug
      FROM supplier_claims sc
      JOIN suppliers s ON sc.supplier_id = s.id
      WHERE sc.id = :claimId
    `, { replacements: { claimId } });

    if (claims.length === 0) {
      return res.status(404).send('Claim not found.');
    }

    const claim = claims[0];

    // Verify HMAC
    const expectedToken = crypto
      .createHmac('sha256', secret)
      .update(`${claimId}${claim.supplier_slug}${exp}`)
      .digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expectedToken))) {
      logger?.warn(`[AdminClaims] Invalid quick-verify token for claim ${claimId}`);
      return res.status(403).send('Invalid verification token.');
    }

    if (claim.status !== 'pending') {
      return res.status(400).send(`Claim is already ${claim.status}. No action needed.`);
    }

    // Perform verification (same steps as POST /:claimId/verify)
    await sequelize.query(`
      UPDATE supplier_claims
      SET status = 'verified', verified_at = NOW(), verified_by = 'admin_quick_link'
      WHERE id = :claimId
    `, { replacements: { claimId } });

    await sequelize.query(`
      UPDATE suppliers
      SET verified = true, claimed_by_email = :email, claimed_at = NOW()
      WHERE id = :supplierId
    `, { replacements: { email: claim.claimant_email, supplierId: claim.supplier_id } });

    // Invalidate existing magic links
    await sequelize.query(`
      UPDATE magic_link_tokens SET revoked_at = NOW()
      WHERE supplier_id = :supplierId AND purpose = 'supplier_price_update' AND revoked_at IS NULL
    `, { replacements: { supplierId: claim.supplier_id } });

    // Generate new magic link
    const magicToken = generateToken();
    const expiresAt = new Date(Date.now() + MAGIC_LINK_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    await sequelize.query(`
      INSERT INTO magic_link_tokens (token, purpose, supplier_id, expires_at)
      VALUES (:token, 'supplier_price_update', :supplierId, :expiresAt)
    `, { replacements: { token: magicToken, supplierId: claim.supplier_id, expiresAt } });

    const baseUrl = process.env.BACKEND_URL || 'https://gethomeheat.com';
    const magicLinkUrl = `${baseUrl}/supplier-dashboard.html?token=${magicToken}`;

    // Send magic link email
    await sendMagicLinkEmail(
      { name: claim.claimant_name, email: claim.claimant_email },
      { name: claim.supplier_name },
      magicLinkUrl
    );

    // Enrich supplier data from claimant
    try {
      await sequelize.query(`
        UPDATE suppliers
        SET email = COALESCE(email, :email),
            phone = COALESCE(phone, :phone),
            contact_name = COALESCE(contact_name, :contactName),
            contact_source = 'supplier_claim',
            contact_updated_at = NOW()
        WHERE id = :supplierId
      `, {
        replacements: {
          email: claim.claimant_email,
          phone: claim.claimant_phone || null,
          contactName: claim.claimant_name,
          supplierId: claim.supplier_id
        }
      });
    } catch (enrichErr) {
      logger?.warn('[AdminClaims] Quick-verify: enrichment failed:', enrichErr.message);
    }

    // Audit log
    try {
      await sequelize.query(`
        INSERT INTO audit_logs (id, admin_user_id, admin_email, action, details, created_at, updated_at)
        VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'admin', 'claim_verified', :details, NOW(), NOW())
      `, {
        replacements: {
          details: JSON.stringify({
            claimId,
            supplier_slug: claim.supplier_slug,
            adminEmail: 'admin',
            method: 'quick_link'
          })
        }
      });
    } catch (auditErr) {
      logger?.warn('[AdminClaims] Quick-verify audit log failed:', auditErr.message);
    }

    logger?.info(`[AdminClaims] Quick-verified claim for ${claim.supplier_name}`);

    // Return a simple HTML success page
    res.send(`
      <!DOCTYPE html>
      <html>
      <head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Claim Verified</title></head>
      <body style="font-family: -apple-system, sans-serif; max-width: 500px; margin: 40px auto; padding: 20px; text-align: center;">
        <div style="font-size: 48px; margin-bottom: 16px;">&#10003;</div>
        <h1 style="color: #28a745;">Verified!</h1>
        <p><strong>${claim.supplier_name}</strong> is now verified.</p>
        <p>Magic link email sent to <strong>${claim.claimant_email}</strong>.</p>
        <a href="${baseUrl}/admin/claims.html" style="display: inline-block; margin-top: 20px; background: #F5A623; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">View All Claims</a>
      </body>
      </html>
    `);

  } catch (error) {
    logger?.error('[AdminClaims] Quick-verify error:', error.message);
    res.status(500).send('Verification failed. Please use the admin panel.');
  }
});

module.exports = router;
