/**
 * Shared magic link token validation
 *
 * Used by supplier-update.js and supplier-dashboard.js.
 * Single source of truth for token lookup, revocation check, and expiry check.
 *
 * Returns uniform error messages to avoid leaking token state (exists vs expired vs revoked).
 * Exception: revoked tokens get a specific message since the supplier needs to know
 * their claim was removed (actionable info, not a security leak).
 */

async function validateMagicLink(sequelize, token, logger) {
  if (!token) {
    return { valid: false, error: 'Invalid or expired link.', status: 'missing' };
  }

  const [rows] = await sequelize.query(`
    SELECT
      mlt.id as token_id,
      mlt.supplier_id,
      mlt.expires_at,
      mlt.revoked_at,
      mlt.use_count,
      s.name as supplier_name,
      s.slug as supplier_slug,
      s.city as supplier_city,
      s.state as supplier_state,
      s.phone as supplier_phone,
      s.postal_codes_served IS NOT NULL as has_zips,
      s.verified,
      sc.status as claim_status
    FROM magic_link_tokens mlt
    JOIN suppliers s ON mlt.supplier_id = s.id
    LEFT JOIN supplier_claims sc ON sc.supplier_id = s.id AND sc.status = 'verified'
    WHERE mlt.token = :token
      AND mlt.purpose = 'supplier_price_update'
  `, { replacements: { token } });

  if (rows.length === 0) {
    logger?.warn('[MagicLink] Invalid token attempted');
    return { valid: false, error: 'Invalid or expired link.', status: 'invalid' };
  }

  const t = rows[0];

  if (t.revoked_at) {
    return { valid: false, error: 'Your listing claim has been removed. Contact support@gethomeheat.com.', status: 'revoked' };
  }

  if (new Date(t.expires_at) < new Date()) {
    return { valid: false, error: 'Invalid or expired link.', status: 'expired' };
  }

  return {
    valid: true,
    tokenId: t.token_id,
    supplierId: t.supplier_id,
    supplierName: t.supplier_name,
    supplierSlug: t.supplier_slug,
    supplierCity: t.supplier_city,
    supplierState: t.supplier_state,
    supplierPhone: t.supplier_phone,
    hasZips: t.has_zips,
    claimStatus: t.claim_status,
    useCount: t.use_count
  };
}

module.exports = { validateMagicLink };
