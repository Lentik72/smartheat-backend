/**
 * Supplier Update Routes
 * V1.0.0: Allow verified suppliers to update their prices via magic link
 *
 * Endpoints:
 * - GET /api/supplier-update?token=xxx - Validate token, get supplier info + view stats
 * - POST /api/supplier-update/price - Submit price update
 */

const express = require('express');
const router = express.Router();

/**
 * Validate magic link token
 * Returns supplier info if valid, or error if invalid/expired
 */
async function validateToken(sequelize, token, logger) {
  if (!token) {
    return { valid: false, error: 'Token required' };
  }

  const [rows] = await sequelize.query(`
    SELECT
      mlt.id as token_id,
      mlt.supplier_id,
      mlt.expires_at,
      mlt.revoked_at,
      mlt.use_count,
      s.name as supplier_name,
      s.city as supplier_city,
      s.state as supplier_state,
      s.phone as supplier_phone
    FROM magic_link_tokens mlt
    JOIN suppliers s ON mlt.supplier_id = s.id
    WHERE mlt.token = :token
      AND mlt.purpose = 'supplier_price_update'
  `, { replacements: { token } });

  if (rows.length === 0) {
    logger?.warn('[SupplierUpdate] Invalid token attempted');
    return { valid: false, error: 'Invalid link. Please request a new one.' };
  }

  const tokenData = rows[0];

  // Check if revoked
  if (tokenData.revoked_at) {
    return { valid: false, error: 'This link has been revoked. Contact support for a new link.' };
  }

  // Check if expired
  if (new Date(tokenData.expires_at) < new Date()) {
    return { valid: false, error: 'This link has expired. Contact support for a new link.' };
  }

  return {
    valid: true,
    tokenId: tokenData.token_id,
    supplierId: tokenData.supplier_id,
    supplierName: tokenData.supplier_name,
    supplierCity: tokenData.supplier_city,
    supplierState: tokenData.supplier_state,
    supplierPhone: tokenData.supplier_phone,
    useCount: tokenData.use_count
  };
}

/**
 * GET /api/supplier-update
 * Validate magic link and return supplier info + engagement stats
 */
router.get('/', async (req, res) => {
  const sequelize = req.app.locals.sequelize;
  const logger = req.app.locals.logger;

  try {
    const { token } = req.query;

    const validation = await validateToken(sequelize, token, logger);

    if (!validation.valid) {
      return res.status(401).json({
        success: false,
        error: validation.error
      });
    }

    // Get current price
    const [priceRows] = await sequelize.query(`
      SELECT price_per_gallon, min_gallons, scraped_at, source_type
      FROM supplier_prices
      WHERE supplier_id = :supplierId AND is_valid = true
      ORDER BY scraped_at DESC
      LIMIT 1
    `, { replacements: { supplierId: validation.supplierId } });

    const currentPrice = priceRows[0] || null;

    // Get view count from analytics (last 7 days)
    // This uses audit_logs or a similar tracking table
    let viewsLast7Days = 0;
    try {
      const [viewRows] = await sequelize.query(`
        SELECT COUNT(*) as count
        FROM audit_logs
        WHERE action = 'supplier_viewed'
          AND details->>'supplier_id' = :supplierId
          AND created_at > NOW() - INTERVAL '7 days'
      `, { replacements: { supplierId: validation.supplierId } });
      viewsLast7Days = parseInt(viewRows[0]?.count || 0);
    } catch (e) {
      // Fallback: estimate from general activity
      // If no specific tracking, show a motivating number
      viewsLast7Days = 0;
    }

    // Get price history (last 5 updates)
    const [historyRows] = await sequelize.query(`
      SELECT price_per_gallon, min_gallons, scraped_at, source_type
      FROM supplier_prices
      WHERE supplier_id = :supplierId
      ORDER BY scraped_at DESC
      LIMIT 5
    `, { replacements: { supplierId: validation.supplierId } });

    // Update token usage stats
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'] || '';

    await sequelize.query(`
      UPDATE magic_link_tokens
      SET
        first_used_at = COALESCE(first_used_at, NOW()),
        last_used_at = NOW(),
        use_count = use_count + 1,
        ip_address = :ip,
        user_agent = :userAgent
      WHERE id = :tokenId
    `, {
      replacements: { tokenId: validation.tokenId, ip, userAgent }
    });

    logger?.info(`[SupplierUpdate] Token validated for ${validation.supplierName}`);

    res.json({
      success: true,
      supplier: {
        id: validation.supplierId,
        name: validation.supplierName,
        city: validation.supplierCity,
        state: validation.supplierState,
        phone: validation.supplierPhone,
        currentPrice: currentPrice ? parseFloat(currentPrice.price_per_gallon) : null,
        currentMinGallons: currentPrice ? currentPrice.min_gallons : null,
        lastUpdated: currentPrice?.scraped_at || null,
        lastUpdateSource: currentPrice?.source_type || null,
        viewsLast7Days
      },
      priceHistory: historyRows.map(p => ({
        price: parseFloat(p.price_per_gallon),
        minGallons: p.min_gallons,
        date: p.scraped_at,
        source: p.source_type
      }))
    });

  } catch (error) {
    logger?.error('[SupplierUpdate] Validate error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to validate link'
    });
  }
});

/**
 * POST /api/supplier-update/price
 * Submit a price update via magic link
 */
router.post('/price', async (req, res) => {
  const sequelize = req.app.locals.sequelize;
  const logger = req.app.locals.logger;

  try {
    const { token, price, minGallons, notes } = req.body;

    // Validate token
    const validation = await validateToken(sequelize, token, logger);

    if (!validation.valid) {
      return res.status(401).json({
        success: false,
        error: validation.error
      });
    }

    // Validate price
    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum < 1.50 || priceNum > 6.00) {
      return res.status(400).json({
        success: false,
        error: 'Price must be between $1.50 and $6.00'
      });
    }

    // Validate minGallons
    const minGal = parseInt(minGallons) || 100;
    if (minGal < 50 || minGal > 500) {
      return res.status(400).json({
        success: false,
        error: 'Minimum gallons must be between 50 and 500'
      });
    }

    // Insert new price
    await sequelize.query(`
      INSERT INTO supplier_prices (
        id, supplier_id, price_per_gallon, min_gallons, fuel_type,
        source_type, scraped_at, expires_at, is_valid, notes,
        verified_at, verification_method, verified_by, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), :supplierId, :price, :minGallons, 'heating_oil',
        'supplier_direct', NOW(), NOW() + INTERVAL '7 days', true, :notes,
        NOW(), 'magic_link', 'supplier', NOW(), NOW()
      )
    `, {
      replacements: {
        supplierId: validation.supplierId,
        price: priceNum,
        minGallons: minGal,
        notes: notes?.trim() || 'Updated by supplier via magic link'
      }
    });

    // Update token usage
    await sequelize.query(`
      UPDATE magic_link_tokens
      SET
        last_used_at = NOW(),
        use_count = use_count + 1
      WHERE id = :tokenId
    `, { replacements: { tokenId: validation.tokenId } });

    logger?.info(`[SupplierUpdate] Price updated for ${validation.supplierName}: $${priceNum.toFixed(3)}`);

    // Log the update for analytics
    try {
      await sequelize.query(`
        INSERT INTO audit_logs (action, details, ip_address, created_at)
        VALUES ('supplier_price_update', :details, :ip, NOW())
      `, {
        replacements: {
          details: JSON.stringify({
            supplier_id: validation.supplierId,
            supplier_name: validation.supplierName,
            price: priceNum,
            min_gallons: minGal,
            source: 'supplier_direct'
          }),
          ip: req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress
        }
      });
    } catch (e) {
      // Audit logging is optional
    }

    res.json({
      success: true,
      message: `Price updated to $${priceNum.toFixed(2)}/gallon`,
      price: priceNum,
      minGallons: minGal,
      supplierName: validation.supplierName
    });

  } catch (error) {
    logger?.error('[SupplierUpdate] Price update error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to update price. Please try again.'
    });
  }
});

module.exports = router;
