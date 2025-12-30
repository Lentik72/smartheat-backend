// Supplier Directory API Routes
// V1.3.0: Dynamic supplier directory with signed responses
// V1.4.0: County-based matching for better coverage
// V1.5.0: Unified matching with ZIP → City → County → Radius + ranking
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { getSupplierModel } = require('../models/Supplier');
const { Op } = require('sequelize');
const { findSuppliersForZip, getZipInfo } = require('../services/supplierMatcher');

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

    // Get all active suppliers for unified matching
    const allSuppliers = await Supplier.findAll({
      where: { active: true },
      attributes: [
        'id', 'name', 'phone', 'email', 'website',
        'addressLine1', 'city', 'state',
        'postalCodesServed', 'serviceCities', 'serviceCounties',
        'serviceAreaRadius', 'lat', 'lng', 'notes', 'verified'
      ]
    });

    // Use unified matching with ranking (backend includes radius)
    const { suppliers: matchedSuppliers, gapType, userInfo } = findSuppliersForZip(
      normalizedZip,
      allSuppliers.map(s => s.toJSON()),
      { includeRadius: true }
    );

    // Log gap detection for future enrichment
    if (gapType) {
      logger?.warn(`[Suppliers] Gap detected for ZIP ${normalizedZip}: ${gapType}`, {
        zip: normalizedZip,
        county: userInfo?.county,
        city: userInfo?.city,
        gapType,
        resultCount: matchedSuppliers.length
      });
    }

    // Limit results
    const limitedSuppliers = matchedSuppliers.slice(0, maxLimit);

    // Determine primary match type from top result
    const primaryMatchType = limitedSuppliers.length > 0
      ? limitedSuppliers[0].matchType
      : 'none';

    // Build response payload
    const payload = {
      data: limitedSuppliers.map(s => ({
        id: s.id,
        name: s.name,
        phone: s.phone,
        email: s.email,
        website: s.website,
        addressLine1: s.addressLine1,
        city: s.city,
        state: s.state,
        postalCodesServed: s.postalCodesServed || [],
        serviceCities: s.serviceCities || [],
        serviceCounties: s.serviceCounties || [],
        serviceAreaRadius: s.serviceAreaRadius,
        notes: s.notes
      })),
      meta: {
        zip: normalizedZip,
        count: limitedSuppliers.length,
        version: DIRECTORY_VERSION,
        generatedAt: new Date().toISOString(),
        source: 'database',
        matchType: primaryMatchType,
        userCity: userInfo?.city,
        userCounty: userInfo?.county,
        gapType: gapType  // For debugging/admin
      }
    };

    // Sign the payload
    const signature = signPayload(payload);

    logger?.info(`[Suppliers] Returned ${limitedSuppliers.length} suppliers for ZIP ${normalizedZip} (${userInfo?.county || 'unknown'} County) via ${primaryMatchType} match`);

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
