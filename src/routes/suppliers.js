// Supplier Directory API Routes
// V1.3.0: Dynamic supplier directory with signed responses
// V1.4.0: County-based matching for better coverage
// V1.5.0: Unified matching with ZIP → City → County → Radius + ranking
// V1.5.1: City and county search parameters with location→ZIP resolution
// V1.5.2: Terminal proximity as silent ranking factor (closer to terminal = ranked higher)
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { getSupplierModel } = require('../models/Supplier');
const { Op } = require('sequelize');
const { findSuppliersForZip, getZipInfo } = require('../services/supplierMatcher');
const { getZipsForCity, getZipsForCounty, normalizeLocation } = require('../services/locationResolver');
const { getTerminalProximityScore } = require('../services/terminalProximity');

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
 * Query params (mutually exclusive - use exactly one):
 *   - zip: ZIP code to find suppliers for
 *   - city + state: City name and state code (e.g., city=Armonk&state=NY)
 *   - county + state: County name and state code (e.g., county=Westchester&state=NY)
 *   - limit (optional): Max results (default 15, max 30)
 *
 * Returns signed JSON response with suppliers serving that area
 * V1.5.1: Added city and county search support
 */
router.get('/', async (req, res) => {
  const { zip, city, county, state, limit = 15 } = req.query;
  const logger = req.app.locals.logger;

  // Validate: exactly one location type must be provided
  const hasZip = zip && zip.trim();
  const hasCity = city && city.trim();
  const hasCounty = county && county.trim();
  const hasState = state && state.trim();

  // Check for conflicting parameters
  const locationTypes = [hasZip, hasCity, hasCounty].filter(Boolean).length;
  if (locationTypes === 0) {
    return res.status(400).json({
      error: 'Location required: provide zip, city+state, or county+state',
      examples: [
        '/api/v1/suppliers?zip=10549',
        '/api/v1/suppliers?city=Armonk&state=NY',
        '/api/v1/suppliers?county=Westchester&state=NY'
      ]
    });
  }
  if (locationTypes > 1) {
    return res.status(400).json({
      error: 'Only one location type allowed: zip, city, or county',
      received: { zip: hasZip ? zip : undefined, city: hasCity ? city : undefined, county: hasCounty ? county : undefined }
    });
  }

  // Validate state is required for city/county
  if ((hasCity || hasCounty) && !hasState) {
    return res.status(400).json({
      error: 'State required when searching by city or county',
      example: hasCity ? '/api/v1/suppliers?city=Armonk&state=NY' : '/api/v1/suppliers?county=Westchester&state=NY'
    });
  }

  // Validate ZIP format if provided
  if (hasZip && !/^\d{5}(-\d{4})?$/.test(zip.trim())) {
    return res.status(400).json({
      error: 'Invalid ZIP code format',
      example: '/api/v1/suppliers?zip=10549'
    });
  }

  // Determine search type and resolve ZIPs
  let searchType = 'zip';
  let resolvedZips = [];
  let searchCity = null;
  let searchCounty = null;
  let normalizedState = hasState ? state.trim().toUpperCase() : null;

  if (hasZip) {
    searchType = 'zip';
    resolvedZips = [zip.trim().substring(0, 5)];
  } else if (hasCity) {
    searchType = 'city';
    searchCity = city.trim();
    resolvedZips = getZipsForCity(searchCity, normalizedState);
    if (resolvedZips.length === 0) {
      logger?.info(`[Suppliers] City not found: ${searchCity}, ${normalizedState}`);
    }
  } else if (hasCounty) {
    searchType = 'county';
    searchCounty = county.trim();
    resolvedZips = getZipsForCounty(searchCounty, normalizedState);
    if (resolvedZips.length === 0) {
      logger?.info(`[Suppliers] County not found: ${searchCounty}, ${normalizedState}`);
    }
  }

  const maxLimit = Math.min(parseInt(limit) || 15, 30);
  const ambiguousLocation = resolvedZips.length > 30;

  try {
    const Supplier = getSupplierModel();

    if (!Supplier) {
      // Fallback: return empty with signature
      const payload = {
        data: [],
        meta: {
          searchType,
          coverageLevel: searchType,
          dataSource: 'fallback',
          resolvedZips,
          resolvedZipCount: resolvedZips.length,
          ambiguousLocation,
          ...(searchCity && { searchCity }),
          ...(searchCounty && { searchCounty }),
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

    const suppliersJson = allSuppliers.map(s => s.toJSON());

    // For city/county search: aggregate results across all resolved ZIPs
    // Track how many ZIPs each supplier matches (for ranking)
    const supplierMatchCounts = new Map(); // supplier.id -> { supplier, matchCount, bestMatchType }
    let aggregatedUserInfo = null;
    let aggregatedGapType = null;

    if (resolvedZips.length === 0) {
      // No ZIPs resolved - return empty result
      logger?.info(`[Suppliers] No ZIPs found for ${searchType} search: ${searchCity || searchCounty}, ${normalizedState}`);
    } else {
      // Run matching for each resolved ZIP
      for (const zipCode of resolvedZips) {
        const { suppliers: matchedForZip, gapType, userInfo } = findSuppliersForZip(
          zipCode,
          suppliersJson,
          { includeRadius: true }
        );

        // Capture first userInfo for response
        if (!aggregatedUserInfo && userInfo) {
          aggregatedUserInfo = userInfo;
        }
        if (!aggregatedGapType && gapType) {
          aggregatedGapType = gapType;
        }

        // Aggregate suppliers with match counts
        for (const supplier of matchedForZip) {
          const existing = supplierMatchCounts.get(supplier.id);
          if (existing) {
            existing.matchCount++;
            // Keep better match type (lower enum value = better)
            const matchOrder = ['zip', 'city', 'county', 'radius'];
            if (matchOrder.indexOf(supplier.matchType) < matchOrder.indexOf(existing.bestMatchType)) {
              existing.bestMatchType = supplier.matchType;
            }
          } else {
            supplierMatchCounts.set(supplier.id, {
              supplier,
              matchCount: 1,
              bestMatchType: supplier.matchType
            });
          }
        }
      }
    }

    // Convert to array and sort by match count (descending), then alphabetically
    // V1.5.2: Added terminal proximity as silent ranking factor
    const aggregatedSuppliers = Array.from(supplierMatchCounts.values())
      .sort((a, b) => {
        // Primary: more matching ZIPs = higher rank
        if (b.matchCount !== a.matchCount) {
          return b.matchCount - a.matchCount;
        }
        // Secondary: better match type
        const matchOrder = ['zip', 'city', 'county', 'radius'];
        const aOrder = matchOrder.indexOf(a.bestMatchType);
        const bOrder = matchOrder.indexOf(b.bestMatchType);
        if (aOrder !== bOrder) {
          return aOrder - bOrder;
        }
        // Tertiary: terminal proximity (closer to wholesale terminal = likely better pricing)
        const aProximity = getTerminalProximityScore(a.supplier.city, a.supplier.state);
        const bProximity = getTerminalProximityScore(b.supplier.city, b.supplier.state);
        if (bProximity !== aProximity) {
          return bProximity - aProximity; // Higher score = closer to terminal = ranked higher
        }
        // Quaternary: alphabetical
        return a.supplier.name.localeCompare(b.supplier.name);
      })
      .map(item => ({
        ...item.supplier,
        matchType: item.bestMatchType,
        matchingZipCount: item.matchCount
      }));

    // Log gap detection for future enrichment (only for single-ZIP search)
    if (searchType === 'zip' && aggregatedGapType) {
      const primaryZip = resolvedZips[0];
      logger?.warn(`[Suppliers] Gap detected for ZIP ${primaryZip}: ${aggregatedGapType}`, {
        zip: primaryZip,
        county: aggregatedUserInfo?.county,
        city: aggregatedUserInfo?.city,
        gapType: aggregatedGapType,
        resultCount: aggregatedSuppliers.length
      });
    }

    // Limit results
    const limitedSuppliers = aggregatedSuppliers.slice(0, maxLimit);

    // Determine primary match type from top result
    const primaryMatchType = limitedSuppliers.length > 0
      ? limitedSuppliers[0].matchType
      : 'none';

    // Build response payload with new metadata fields
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
        // V1.5.1: New metadata fields
        searchType,
        coverageLevel: searchType,
        dataSource: 'api',
        resolvedZipCount: resolvedZips.length,
        ambiguousLocation,
        ...(searchCity && { searchCity }),
        ...(searchCounty && { searchCounty }),
        ...(searchType !== 'zip' && { resolvedZips: resolvedZips.slice(0, 10) }), // Limit for response size
        // Existing fields
        zip: resolvedZips[0] || null,
        count: limitedSuppliers.length,
        version: DIRECTORY_VERSION,
        generatedAt: new Date().toISOString(),
        source: 'database',
        matchType: primaryMatchType,
        userCity: aggregatedUserInfo?.city,
        userCounty: aggregatedUserInfo?.county,
        gapType: aggregatedGapType
      }
    };

    // Sign the payload
    const signature = signPayload(payload);

    const searchDesc = searchType === 'zip'
      ? `ZIP ${resolvedZips[0]}`
      : searchType === 'city'
        ? `city ${searchCity}, ${normalizedState} (${resolvedZips.length} ZIPs)`
        : `county ${searchCounty}, ${normalizedState} (${resolvedZips.length} ZIPs)`;

    logger?.info(`[Suppliers] Returned ${limitedSuppliers.length} suppliers for ${searchDesc} via ${primaryMatchType} match`);

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
        searchType,
        coverageLevel: searchType,
        dataSource: 'error',
        resolvedZipCount: resolvedZips.length,
        ambiguousLocation,
        ...(searchCity && { searchCity }),
        ...(searchCounty && { searchCounty }),
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
