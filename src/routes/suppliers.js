// Supplier Directory API Routes
// V1.3.0: Dynamic supplier directory with signed responses
// V1.4.0: County-based matching for better coverage
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { getSupplierModel } = require('../models/Supplier');
const { Op } = require('sequelize');
const { getCountyForZip } = require('../data/zip-to-county');

// Rate limiting specifically for supplier endpoint
// More restrictive than global limit to prevent scraping
const supplierRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 60, // 60 requests per hour per IP
  message: {
    error: 'Too many requests for supplier data',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(supplierRateLimit);

// HMAC signing secret - should match iOS app
// In production, this comes from environment variable
const getSigningSecret = () => {
  return process.env.SUPPLIER_SIGNING_SECRET || 'HomeHeat_Supplier_v1.3.0_SigningKey';
};

// Recursively sort object keys for canonical JSON
const sortObjectKeys = (obj) => {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys);
  }
  const sorted = {};
  Object.keys(obj).sort().forEach(key => {
    sorted[key] = sortObjectKeys(obj[key]);
  });
  return sorted;
};

// Sign a payload with HMAC-SHA256 using canonical JSON (sorted keys)
// Phase B: Deterministic signing for cross-platform verification
const signPayload = (payload) => {
  const secret = getSigningSecret();
  // Recursively sort all keys for canonical JSON representation
  // This ensures identical signatures regardless of object construction order
  const canonical = sortObjectKeys(payload);
  const canonicalString = JSON.stringify(canonical);
  const signature = crypto
    .createHmac('sha256', secret)
    .update(canonicalString)
    .digest('hex');
  return signature;
};

// Directory version - increment when data changes significantly
const DIRECTORY_VERSION = 1;

/**
 * GET /api/v1/suppliers
 *
 * Query params:
 *   - zip (required): ZIP code to find suppliers for
 *   - limit (optional): Max results (default 15, max 30)
 *
 * Returns signed JSON response with suppliers serving that area
 */
router.get('/', async (req, res) => {
  const { zip, limit = 15 } = req.query;
  const logger = req.app.locals.logger;

  // Validate ZIP
  if (!zip || !/^\d{5}(-\d{4})?$/.test(zip.trim())) {
    return res.status(400).json({
      error: 'Valid ZIP code required',
      example: '/api/v1/suppliers?zip=01340'
    });
  }

  const normalizedZip = zip.trim().substring(0, 5);
  const maxLimit = Math.min(parseInt(limit) || 15, 30);

  try {
    const Supplier = getSupplierModel();

    if (!Supplier) {
      // Fallback: return empty with signature
      const payload = {
        data: [],
        meta: {
          zip: normalizedZip,
          count: 0,
          version: DIRECTORY_VERSION,
          generatedAt: new Date().toISOString(),
          source: 'fallback'
        }
      };
      const signature = signPayload(payload);
      return res.json({ ...payload, signature });
    }

    // Find suppliers serving this ZIP code
    // PostgreSQL JSONB containment query
    const suppliers = await Supplier.findAll({
      where: {
        active: true,
        postalCodesServed: {
          [Op.contains]: [normalizedZip]
        }
      },
      attributes: [
        'id', 'name', 'phone', 'email', 'website',
        'addressLine1', 'city', 'state',
        'postalCodesServed', 'serviceAreaRadius', 'notes'
      ],
      order: [
        ['verified', 'DESC'],
        ['name', 'ASC']
      ],
      limit: maxLimit
    });

    // Fallback chain: exact ZIP -> county match -> ZIP prefix
    let finalSuppliers = suppliers;
    let matchType = 'zip';

    // Step 2: If no exact ZIP match, try county-based match
    if (suppliers.length === 0) {
      const userCounty = getCountyForZip(normalizedZip);

      if (userCounty) {
        logger?.info(`[Suppliers] No exact ZIP match for ${normalizedZip}, trying county: ${userCounty}`);

        const countySuppliers = await Supplier.findAll({
          where: {
            active: true,
            serviceCounties: {
              [Op.contains]: [userCounty]
            }
          },
          attributes: [
            'id', 'name', 'phone', 'email', 'website',
            'addressLine1', 'city', 'state',
            'postalCodesServed', 'serviceAreaRadius', 'notes'
          ],
          order: [
            ['verified', 'DESC'],
            ['name', 'ASC']
          ],
          limit: maxLimit
        });

        if (countySuppliers.length > 0) {
          finalSuppliers = countySuppliers;
          matchType = 'county';
          logger?.info(`[Suppliers] Found ${countySuppliers.length} suppliers for ${userCounty} County`);
        }
      }
    }

    // Step 3: If still no match, try ZIP prefix (last resort)
    if (finalSuppliers.length === 0) {
      const zipPrefix = normalizedZip.substring(0, 3);
      logger?.info(`[Suppliers] No county match, trying ZIP prefix: ${zipPrefix}xx`);

      // Raw query for JSONB array element prefix matching
      const sequelize = req.app.locals.sequelize;
      const prefixSuppliers = await sequelize.query(`
        SELECT id, name, phone, email, website,
               address_line1 as "addressLine1", city, state,
               postal_codes_served as "postalCodesServed",
               service_area_radius as "serviceAreaRadius", notes
        FROM suppliers
        WHERE active = true
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(postal_codes_served) AS zip
            WHERE zip LIKE :prefix
          )
        ORDER BY verified DESC, name ASC
        LIMIT :limit
      `, {
        replacements: { prefix: `${zipPrefix}%`, limit: maxLimit },
        type: sequelize.QueryTypes.SELECT
      });

      finalSuppliers = prefixSuppliers;
      if (prefixSuppliers.length > 0) {
        matchType = 'prefix';
      }
    }

    // Build response payload
    const payload = {
      data: finalSuppliers.map(s => ({
        id: s.id,
        name: s.name,
        phone: s.phone,
        email: s.email,
        website: s.website,
        addressLine1: s.addressLine1,
        city: s.city,
        state: s.state,
        postalCodesServed: s.postalCodesServed || [],
        serviceAreaRadius: s.serviceAreaRadius,
        notes: s.notes
      })),
      meta: {
        zip: normalizedZip,
        count: finalSuppliers.length,
        version: DIRECTORY_VERSION,
        generatedAt: new Date().toISOString(),
        source: 'database',
        matchType: matchType  // 'zip', 'county', or 'prefix'
      }
    };

    // Sign the payload
    const signature = signPayload(payload);

    const county = getCountyForZip(normalizedZip);
    logger?.info(`[Suppliers] Returned ${finalSuppliers.length} suppliers for ZIP ${normalizedZip} (${county || 'unknown'} County) via ${matchType} match`);

    res.json({
      ...payload,
      signature
    });

  } catch (error) {
    logger?.error('[Suppliers] Error fetching suppliers:', error.message);

    // Return empty with signature on error (graceful degradation)
    const payload = {
      data: [],
      meta: {
        zip: normalizedZip,
        count: 0,
        version: DIRECTORY_VERSION,
        generatedAt: new Date().toISOString(),
        source: 'error',
        error: 'Service temporarily unavailable'
      }
    };
    const signature = signPayload(payload);
    res.status(503).json({ ...payload, signature });
  }
});

/**
 * GET /api/v1/suppliers/version
 *
 * Returns current directory version for cache invalidation checks
 */
router.get('/version', (req, res) => {
  const payload = {
    version: DIRECTORY_VERSION,
    generatedAt: new Date().toISOString()
  };
  const signature = signPayload(payload);
  res.json({ ...payload, signature });
});

module.exports = router;
