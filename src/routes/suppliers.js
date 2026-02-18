// Supplier Directory API Routes
// V1.3.0: Dynamic supplier directory with signed responses
// V1.4.0: County-based matching for better coverage
// V1.5.0: Unified matching with ZIP → City → County → Radius + ranking
// V1.5.1: City and county search parameters with location→ZIP resolution
// V1.5.2: Terminal proximity as silent ranking factor (closer to terminal = ranked higher)
// V1.5.3: Added currentPrice from scraped/manual price data
// V2.0.0: Fixed HMAC signature - currentPrice excluded from signing to avoid float precision issues
// V2.0.1: Added name search parameter for supplier name lookup
// V2.0.2: Removed notes field from API response (internal only)
// V2.13.0: Removed email field from API response (internal only - for supplier outreach)
// V2.4.0: Price-first sorting - priced suppliers first (sorted by price), then unpriced (sorted by match quality)
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { getSupplierModel } = require('../models/Supplier');
const { getLatestPrices } = require('../models/SupplierPrice');
const { Op } = require('sequelize');
const { findSuppliersForZip, getZipInfo } = require('../services/supplierMatcher');
const { getZipsForCity, getZipsForCounty, normalizeLocation } = require('../services/locationResolver');
const { getTerminalProximityScore } = require('../services/terminalProximity');
const { trackLocation } = require('../models/UserLocation');

// V2.4.0: Price freshness thresholds for sorting and display
const PRICE_FRESH_MS = 48 * 60 * 60 * 1000;   // 48 hours = "fresh" (updated today/yesterday)
const PRICE_RECENT_MS = 96 * 60 * 60 * 1000;  // 96 hours = "recent" (still valid for display)

// Compute price status based on freshness
const getPriceStatus = (price) => {
  if (!price || !price.scrapedAt) return 'none';
  const age = Date.now() - new Date(price.scrapedAt).getTime();
  if (age < PRICE_FRESH_MS) return 'fresh';
  if (age < PRICE_RECENT_MS) return 'recent';
  return 'stale';
};

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
// In production, this SHOULD come from environment variable (but fallback works)
const getSigningSecret = () => {
  const secret = process.env.SUPPLIER_SIGNING_SECRET;
  if (!secret && process.env.NODE_ENV === 'production') {
    // Log warning but don't crash - fallback secret still works with iOS app
    console.warn('[suppliers] WARNING: SUPPLIER_SIGNING_SECRET not set in production, using fallback');
  }
  return secret || 'HomeHeat_Supplier_v1.3.0_SigningKey';
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

// V2.1.0: Dynamic directory version from database
// Increments automatically when supplier data changes
// Used by iOS app for cache invalidation
let cachedDirectoryMeta = null;
let lastMetaFetch = 0;
const META_CACHE_TTL = 60 * 1000; // 1 minute cache for meta

const getDirectoryMeta = async (sequelize) => {
  // Null-safety: return fallback if sequelize not initialized
  if (!sequelize) {
    console.warn('[suppliers] getDirectoryMeta called with null sequelize');
    return { version: 1, supplierCount: 0, lastModified: null };
  }

  const now = Date.now();
  if (cachedDirectoryMeta && (now - lastMetaFetch) < META_CACHE_TTL) {
    return cachedDirectoryMeta;
  }

  try {
    const [rows] = await sequelize.query(
      'SELECT version, supplier_count, last_modified FROM directory_meta WHERE id = 1'
    );
    if (rows.length > 0) {
      cachedDirectoryMeta = {
        version: rows[0].version,
        supplierCount: rows[0].supplier_count,
        lastModified: rows[0].last_modified
      };
      lastMetaFetch = now;
      return cachedDirectoryMeta;
    }
  } catch (error) {
    console.error('[suppliers] Failed to fetch directory meta:', error.message);
  }

  // Fallback if table doesn't exist
  return { version: 1, supplierCount: 0, lastModified: null };
};

// V2.0.0: Signature version - changed when signing contract changes
// Version 2: currentPrice excluded from signed payload (fixes float precision mismatch)
const SIGNATURE_VERSION = 2;

/**
 * Strip volatile fields from supplier for signature computation
 * currentPrice contains floats that serialize differently in Node.js vs Swift
 * V2.0.0: This ensures identical HMAC signatures across platforms
 */
const stripForSignature = (supplier) => {
  // V2.4.1: Only strip currentPrice (float precision issues)
  // priceStatus and sortGroup are strings - safe to include in signature
  const { currentPrice, ...rest } = supplier;
  return rest;
};

/**
 * GET /api/v1/suppliers
 *
 * Query params (mutually exclusive - use exactly one):
 *   - zip: ZIP code to find suppliers for
 *   - city + state: City name and state code (e.g., city=Armonk&state=NY)
 *   - county + state: County name and state code (e.g., county=Westchester&state=NY)
 *   - name: Supplier name search (e.g., name=Domino)
 *   - limit (optional): Max results (default 15, max 30)
 *
 * Returns signed JSON response with suppliers serving that area
 * V1.5.1: Added city and county search support
 * V2.0.1: Added name search parameter
 */
router.get('/', async (req, res) => {
  const { zip, city, county, state, name, limit = 15 } = req.query;
  const logger = req.app.locals.logger;
  const sequelize = req.app.locals.sequelize;

  // V2.1.0: Fetch dynamic directory version for cache invalidation
  const directoryMeta = await getDirectoryMeta(sequelize);

  // Validate: exactly one search type must be provided
  const hasZip = zip && zip.trim();
  const hasCity = city && city.trim();
  const hasCounty = county && county.trim();
  const hasState = state && state.trim();
  const hasName = name && String(name).trim().length > 0;

  // Check for conflicting parameters (mutually exclusive)
  const searchModes = [hasZip, hasCity, hasCounty, hasName].filter(Boolean).length;
  if (searchModes === 0) {
    return res.status(400).json({
      error: 'Provide exactly one search parameter',
      allowed: ['zip', 'city+state', 'county+state', 'name'],
      examples: [
        '/api/v1/suppliers?zip=10549',
        '/api/v1/suppliers?city=Armonk&state=NY',
        '/api/v1/suppliers?county=Westchester&state=NY',
        '/api/v1/suppliers?name=Domino'
      ]
    });
  }
  if (searchModes > 1) {
    return res.status(400).json({
      error: 'Provide exactly one search parameter',
      allowed: ['zip', 'city+state', 'county+state', 'name'],
      received: {
        zip: hasZip ? zip : undefined,
        city: hasCity ? city : undefined,
        county: hasCounty ? county : undefined,
        name: hasName ? name : undefined
      }
    });
  }

  // Validate state is required for city/county
  if ((hasCity || hasCounty) && !hasState) {
    return res.status(400).json({
      error: 'State required when searching by city or county',
      example: hasCity ? '/api/v1/suppliers?city=Armonk&state=NY' : '/api/v1/suppliers?county=Westchester&state=NY'
    });
  }

  // V2.9.0: Detect Canadian postal codes and return waitlist response
  // Canadian format: A1A 1A1 or A1A1A1 (letter-digit-letter digit-letter-digit)
  const canadianPostalRegex = /^[A-Za-z]\d[A-Za-z][\s-]?\d[A-Za-z]\d$/;
  if (hasZip && canadianPostalRegex.test(zip.trim())) {
    const normalizedPostal = zip.trim().toUpperCase().replace(/[\s-]/g, '');
    const formattedPostal = `${normalizedPostal.slice(0, 3)} ${normalizedPostal.slice(3)}`;

    logger?.info(`[Suppliers] Canadian postal code detected: ${formattedPostal} - returning waitlist response`);

    return res.json({
      data: [],
      meta: {
        regionStatus: 'waitlist',
        region: 'CA',
        postalCode: formattedPostal,
        message: 'We are currently focused on the US Northeast. Sign up to be notified when we launch in Canada.',
        waitlistUrl: '/api/waitlist',
        searchType: 'postal_code',
        count: 0,
        version: directoryMeta?.version || '1.0.0',
        supplierCount: 0,
        signatureVersion: SIGNATURE_VERSION,
        generatedAt: new Date().toISOString()
      },
      signature: 'waitlist'  // Special signature for waitlist responses
    });
  }

  // Validate US ZIP format if provided
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
  let searchName = null;
  let normalizedState = hasState ? state.trim().toUpperCase() : null;

  if (hasName) {
    // V2.0.1: Name search - handles separately, no ZIP resolution needed
    searchType = 'name';
    // Normalize for Unicode handling (accents, etc.)
    searchName = String(name).normalize('NFKD').trim();
  } else if (hasZip) {
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
      const fallbackMeta = {
        searchType,
        coverageLevel: searchType,
        dataSource: 'fallback',
        resolvedZips,
        resolvedZipCount: resolvedZips.length,
        ambiguousLocation,
        ...(searchCity && { searchCity }),
        ...(searchCounty && { searchCounty }),
        ...(searchName && { query: searchName }),
        count: 0,
        version: directoryMeta.version,
      supplierCount: directoryMeta.supplierCount,
        signatureVersion: SIGNATURE_VERSION,
        generatedAt: new Date().toISOString(),
        source: 'fallback'
      };
      const signature = signPayload({ data: [], meta: fallbackMeta });
      return res.json({ data: [], meta: fallbackMeta, signature });
    }

    // Get all active suppliers for unified matching
    const allSuppliers = await Supplier.findAll({
      where: { active: true },
      attributes: [
        'id', 'name', 'phone', 'email', 'website',
        'addressLine1', 'city', 'state',
        'postalCodesServed', 'serviceCities', 'serviceCounties',
        'serviceAreaRadius', 'lat', 'lng', 'verified',
        'claimed_at', 'claimed_by_email',  // V2.5.0: Track claimed/verified suppliers
        'slug',  // V2.15.0: For linking to supplier profile pages
        // V2.14.0: Hours & Availability (only exposed when verified)
        'hoursWeekday', 'hoursSaturday', 'hoursSunday',
        'weekendDelivery', 'emergencyDelivery', 'emergencyPhone',
        'hoursVerifiedAt'
      ]
    });

    const suppliersJson = allSuppliers.map(s => s.toJSON());

    // V2.0.1: Handle name search separately (no ZIP-based matching)
    if (searchType === 'name') {
      const nameLower = searchName.toLowerCase();

      // V2.35: Check supplier_aliases table for matching aliases
      // If user searches "Castle Fuel", we check aliases and return "Castle Fuel Inc." (canonical)
      const sequelize = req.app.locals.sequelize;
      let aliasSupplierIds = [];
      if (sequelize) {
        try {
          const [aliasMatches] = await sequelize.query(`
            SELECT supplier_id FROM supplier_aliases
            WHERE LOWER(alias_name) LIKE $1
          `, {
            bind: [`%${nameLower}%`]
          });
          aliasSupplierIds = aliasMatches.map(a => a.supplier_id);
        } catch (err) {
          console.error('Alias lookup error:', err.message);
          // Continue without alias matches - table may not exist yet
        }
      }

      // Filter suppliers by name match OR alias match
      const matchingSuppliers = suppliersJson.filter(s =>
        (s.name || '').toLowerCase().includes(nameLower) ||
        aliasSupplierIds.includes(s.id)
      );

      // Limit and sort alphabetically
      const limitedSuppliers = matchingSuppliers
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, maxLimit);

      // Fetch prices for matching suppliers
      const supplierIds = limitedSuppliers.map(s => s.id);
      const priceMap = await getLatestPrices(supplierIds);

      // Build response with prices
      const responseData = limitedSuppliers.map(s => {
        const price = priceMap[s.id];
        const result = {
          id: s.id,
          name: s.name,
          phone: s.phone,
          // V2.13.0: email removed from public API (internal use only - supplier outreach)
          website: s.website,
          addressLine1: s.addressLine1,
          city: s.city,
          state: s.state,
          postalCodesServed: s.postalCodesServed || [],
          serviceCities: s.serviceCities || [],
          serviceCounties: s.serviceCounties || [],
          serviceAreaRadius: s.serviceAreaRadius,
          currentPrice: price ? {
            pricePerGallon: parseFloat(price.pricePerGallon),
            minGallons: price.minGallons,
            sourceType: price.sourceType,
            scrapedAt: price.scrapedAt,
            expiresAt: price.expiresAt
          } : null,
          // V2.5.0: Claimed supplier info
          claimedAt: s.claimed_at || null,
          // V2.15.0: Slug for profile page links
          slug: s.slug || null
        };
        // V2.14.0: Only include hours if verified
        if (s.hoursVerifiedAt) {
          result.hours = {
            weekday: s.hoursWeekday,
            saturday: s.hoursSaturday,
            sunday: s.hoursSunday,
            weekendDelivery: s.weekendDelivery,
            emergencyDelivery: s.emergencyDelivery,
            emergencyPhone: s.emergencyPhone
          };
        }
        return result;
      });

      // V2.35: Track how many were found via alias
      const aliasMatchCount = responseData.filter(s =>
        aliasSupplierIds.includes(s.id) && !(s.name || '').toLowerCase().includes(nameLower)
      ).length;

      const meta = {
        searchType: 'name',
        query: searchName,
        count: responseData.length,
        aliasMatches: aliasMatchCount,  // V2.35: suppliers found via alias
        version: directoryMeta.version,
      supplierCount: directoryMeta.supplierCount,
        signatureVersion: SIGNATURE_VERSION,
        generatedAt: new Date().toISOString(),
        source: 'database'
      };

      // V2.0.0: Sign WITHOUT currentPrice to avoid float precision issues
      const signedData = responseData.map(stripForSignature);
      const signature = signPayload({ data: signedData, meta });

      // Observability log
      console.info(`[suppliers] searchType=${meta.searchType} count=${responseData.length} aliasMatches=${aliasMatchCount}`);
      logger?.info(`[Suppliers] Returned ${responseData.length} suppliers for name search '${searchName}' (${aliasMatchCount} via alias)`);

      return res.json({ data: responseData, meta, signature });
    }

    // For city/county/zip search: aggregate results across all resolved ZIPs
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

    // V2.4.0: Price-first sorting - fetch prices before sorting
    // Convert to array with match data
    const unsortedSuppliers = Array.from(supplierMatchCounts.values())
      .map(item => ({
        ...item.supplier,
        matchType: item.bestMatchType,
        matchingZipCount: item.matchCount
      }));

    // Fetch prices for ALL matched suppliers (needed for price-first sort)
    const allSupplierIds = unsortedSuppliers.map(s => s.id);
    const priceMap = await getLatestPrices(allSupplierIds);

    // V2.4.0: Price-first sorting with freshness tiers
    // Priced suppliers (fresh/recent) first, sorted by price ASC
    // Unpriced suppliers (stale/none) second, sorted by match quality
    const aggregatedSuppliers = unsortedSuppliers.sort((a, b) => {
      const priceA = priceMap[a.id];
      const priceB = priceMap[b.id];
      const statusA = getPriceStatus(priceA);
      const statusB = getPriceStatus(priceB);

      const isPricedA = statusA === 'fresh' || statusA === 'recent';
      const isPricedB = statusB === 'fresh' || statusB === 'recent';

      // Primary: priced suppliers before unpriced
      if (isPricedA !== isPricedB) {
        return isPricedA ? -1 : 1;
      }

      // Within priced group: sort by price ASC (cheapest first)
      if (isPricedA && isPricedB) {
        const priceValA = parseFloat(priceA.pricePerGallon);
        const priceValB = parseFloat(priceB.pricePerGallon);
        if (priceValA !== priceValB) {
          return priceValA - priceValB;
        }
        // Tie-breaker for same price: terminal proximity
        const aProximity = getTerminalProximityScore(a.city, a.state);
        const bProximity = getTerminalProximityScore(b.city, b.state);
        if (bProximity !== aProximity) {
          return bProximity - aProximity;
        }
        // Final tie-breaker: alphabetical
        return a.name.localeCompare(b.name);
      }

      // Within unpriced group: original sorting logic
      // Primary: more matching ZIPs = higher rank
      if (b.matchingZipCount !== a.matchingZipCount) {
        return b.matchingZipCount - a.matchingZipCount;
      }
      // Secondary: better match type
      const matchOrder = ['zip', 'city', 'county', 'radius'];
      const aOrder = matchOrder.indexOf(a.matchType);
      const bOrder = matchOrder.indexOf(b.matchType);
      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }
      // Tertiary: terminal proximity
      const aProximity = getTerminalProximityScore(a.city, a.state);
      const bProximity = getTerminalProximityScore(b.city, b.state);
      if (bProximity !== aProximity) {
        return bProximity - aProximity;
      }
      // Quaternary: alphabetical
      return a.name.localeCompare(b.name);
    });

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

    // Build response data with prices and V2.4.0 sorting metadata
    const responseData = limitedSuppliers.map(s => {
      const price = priceMap[s.id];
      const priceStatus = getPriceStatus(price);
      const sortGroup = (priceStatus === 'fresh' || priceStatus === 'recent') ? 'priced' : 'unpriced';
      const result = {
        id: s.id,
        name: s.name,
        phone: s.phone,
        // V2.13.0: email removed from public API (internal use only - supplier outreach)
        website: s.website,
        addressLine1: s.addressLine1,
        city: s.city,
        state: s.state,
        postalCodesServed: s.postalCodesServed || [],
        serviceCities: s.serviceCities || [],
        serviceCounties: s.serviceCounties || [],
        serviceAreaRadius: s.serviceAreaRadius,
        // V1.5.3: Current price if available and not opted out
        currentPrice: price ? {
          pricePerGallon: parseFloat(price.pricePerGallon),
          minGallons: price.minGallons,
          sourceType: price.sourceType,
          scrapedAt: price.scrapedAt,
          expiresAt: price.expiresAt
        } : null,
        // V2.4.0: Sorting metadata for iOS display
        priceStatus,  // 'fresh' | 'recent' | 'stale' | 'none'
        sortGroup,    // 'priced' | 'unpriced'
        // V2.5.0: Claimed supplier info (for verified badge)
        claimedAt: s.claimed_at || null,
        // V2.15.0: Slug for profile page links
        slug: s.slug || null
      };
      // V2.14.0: Only include hours if verified
      if (s.hoursVerifiedAt) {
        result.hours = {
          weekday: s.hoursWeekday,
          saturday: s.hoursSaturday,
          sunday: s.hoursSunday,
          weekendDelivery: s.weekendDelivery,
          emergencyDelivery: s.emergencyDelivery,
          emergencyPhone: s.emergencyPhone
        };
      }
      return result;
    });

    // V2.4.0: Count suppliers with prices for iOS display logic
    const pricedCount = responseData.filter(s => s.sortGroup === 'priced').length;

    // Build metadata
    const meta = {
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
      // V2.4.0: Price sorting metadata
      pricedCount,
      version: directoryMeta.version,
      supplierCount: directoryMeta.supplierCount,
      // V2.0.0: Signature version for contract tracking
      signatureVersion: SIGNATURE_VERSION,
      generatedAt: new Date().toISOString(),
      source: 'database',
      matchType: primaryMatchType,
      userCity: aggregatedUserInfo?.city,
      userCounty: aggregatedUserInfo?.county,
      gapType: aggregatedGapType
    };

    // V2.0.0: Sign WITHOUT currentPrice to avoid float precision issues
    const signedData = responseData.map(stripForSignature);
    const signature = signPayload({ data: signedData, meta });

    // Observability log
    console.info(`[suppliers] searchType=${meta.searchType} count=${responseData.length}`);

    const searchDesc = searchType === 'zip'
      ? `ZIP ${resolvedZips[0]}`
      : searchType === 'city'
        ? `city ${searchCity}, ${normalizedState} (${resolvedZips.length} ZIPs)`
        : `county ${searchCounty}, ${normalizedState} (${resolvedZips.length} ZIPs)`;

    logger?.info(`[Suppliers] Returned ${responseData.length} suppliers for ${searchDesc} via ${primaryMatchType} match`);

    // V2.3.0: Track user location for Coverage Intelligence
    // V2.7.0: Skip tracking for test traffic (simulator, excluded devices)
    // Non-blocking - fire and forget
    const analytics = req.app.locals.activityAnalytics;
    const isTestTraffic = analytics?.isTestTraffic?.(req) ?? false;

    if (searchType === 'zip' && resolvedZips.length > 0 && !isTestTraffic) {
      const primaryZip = resolvedZips[0];
      trackLocation(primaryZip, {
        city: aggregatedUserInfo?.city,
        county: aggregatedUserInfo?.county,
        state: normalizedState
      }).catch(err => console.error('[UserLocation] Track error:', err.message));
    }

    res.json({ data: responseData, meta, signature });

  } catch (error) {
    logger?.error('[Suppliers] Error fetching suppliers:', error.message);

    // Return empty with signature on error (graceful degradation)
    const errorMeta = {
      searchType,
      coverageLevel: searchType,
      dataSource: 'error',
      resolvedZipCount: resolvedZips.length,
      ambiguousLocation,
      ...(searchCity && { searchCity }),
      ...(searchCounty && { searchCounty }),
      ...(searchName && { query: searchName }),
      count: 0,
      version: directoryMeta.version,
      supplierCount: directoryMeta.supplierCount,
      signatureVersion: SIGNATURE_VERSION,
      generatedAt: new Date().toISOString(),
      source: 'error',
      error: 'Service temporarily unavailable'
    };
    const signature = signPayload({ data: [], meta: errorMeta });
    res.status(503).json({ data: [], meta: errorMeta, signature });
  }
});

/**
 * GET /api/v1/suppliers/version
 *
 * Returns current directory version for cache invalidation checks
 * V2.1.0: Now returns dynamic version from database + supplierCount
 */
router.get('/version', async (req, res) => {
  const sequelize = req.app.locals.sequelize;
  const meta = await getDirectoryMeta(sequelize);

  const payload = {
    version: meta.version,
    supplierCount: meta.supplierCount,
    lastModified: meta.lastModified,
    generatedAt: new Date().toISOString()
  };
  const signature = signPayload(payload);
  res.json({ ...payload, signature });
});

// Diagnostic: Check price expiration status (temporary - for debugging)
router.get('/debug/prices', async (req, res) => {
  const sequelize = req.app.locals.sequelize;
  if (!sequelize) {
    return res.status(503).json({ error: 'Database not available' });
  }

  try {
    const [result] = await sequelize.query(`
      SELECT
        COUNT(*) FILTER (WHERE expires_at > NOW() AND is_valid = true AND source_type != 'aggregator_signal') as displayable,
        COUNT(*) FILTER (WHERE expires_at <= NOW() AND is_valid = true) as expired,
        COUNT(*) FILTER (WHERE source_type = 'aggregator_signal') as aggregator_only,
        MAX(scraped_at) as most_recent,
        MAX(expires_at) FILTER (WHERE expires_at > NOW()) as latest_valid_expiry
      FROM supplier_prices
      WHERE scraped_at > NOW() - INTERVAL '7 days'
    `);

    res.json({
      priceStatus: result[0],
      serverTime: new Date().toISOString(),
      diagnosis: parseInt(result[0]?.displayable) === 0
        ? 'NO_DISPLAYABLE_PRICES'
        : 'PRICES_AVAILABLE'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Diagnostic: Check if ZIP is in database
router.get('/debug/zip/:zip', async (req, res) => {
  const { zipDatabase } = require('../services/supplierMatcher');
  const zip = req.params.zip?.trim();
  const info = zipDatabase[zip];
  const totalZips = Object.keys(zipDatabase).length;
  const bostonZips = Object.keys(zipDatabase).filter(z => z.startsWith('021')).slice(0, 20);

  res.json({
    zip,
    found: !!info,
    info: info || null,
    totalZipsInDatabase: totalZips,
    sampleBostonZips: bostonZips,
    buildTimestamp: require('../../package.json').buildTimestamp || 'not set'
  });
});

module.exports = router;
// Deploy Mon Jan 13 06:17:00 EST 2026
