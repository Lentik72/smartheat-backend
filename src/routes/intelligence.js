/**
 * Market Intelligence API Routes
 * V2.1.0: Endpoints for market snapshot and intelligence data
 *
 * Endpoints:
 * - GET /api/v1/market/snapshot - Get market snapshot for a ZIP code
 *
 * Design notes:
 * - Aggregator data is NEVER exposed in responses
 * - Urgency pre-gate is evaluated server-side
 * - Responses are cached for 1 hour
 */

const express = require('express');
const { query, validationResult } = require('express-validator');
const router = express.Router();

const MarketIntelligenceService = require('../services/MarketIntelligenceService');
const { getCommunityDeliveryModel, FUEL_TYPES, DEFAULT_FUEL_TYPE } = require('../models/CommunityDelivery');
const { getSupplierModel } = require('../models/Supplier');
const { getLatestPrices } = require('../models/SupplierPrice');
const { findSuppliersForZip } = require('../services/supplierMatcher');
const { Op } = require('sequelize');

// Validation middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

/**
 * GET /api/v1/market/snapshot
 *
 * Get market snapshot for a ZIP code with optional tank level.
 *
 * Query params:
 * - zip (required): 5-digit ZIP code
 * - tankLevel (optional): Tank level 0.0 to 1.0
 *
 * Response:
 * {
 *   marketState: 'favorable' | 'typical' | 'elevated' | 'order_now',
 *   confidence: 0.0 - 1.0,
 *   confidenceLevel: 'high' | 'medium' | 'low',
 *   direction: -1.0 to 1.0,
 *   signals: { scraped, aggregator, community, market },
 *   explanation: string,
 *   urgency: null | 'critical' | 'low_tank',
 *   dataQuality: 'high' | 'medium' | 'low' | 'n/a',
 *   nextUpdate: ISO timestamp
 * }
 */
router.get('/snapshot', [
  query('zip')
    .matches(/^\d{5}$/)
    .withMessage('ZIP code must be exactly 5 digits'),
  query('tankLevel')
    .optional()
    .isFloat({ min: 0.0, max: 1.0 })
    .withMessage('Tank level must be between 0.0 and 1.0')
    .toFloat(),
  handleValidationErrors
], async (req, res) => {
  const startTime = Date.now();

  try {
    const { zip, tankLevel } = req.query;
    const cache = req.app.locals.cache;
    const logger = req.app.locals.logger || console;

    // Build cache key (include tankLevel only if provided)
    // For urgency pre-gate, different tank levels can produce different results
    const cacheKey = tankLevel !== undefined
      ? `market_snapshot_${zip}_${Math.round(tankLevel * 100)}`
      : `market_snapshot_${zip}`;

    // Check cache
    const cached = cache?.get(cacheKey);
    if (cached) {
      logger.info(`📦 Cache hit: market snapshot for ${zip}`);
      return res.json({
        ...cached,
        _cached: true
      });
    }

    // Compute market snapshot
    logger.info(`🔮 Computing market snapshot for ZIP ${zip}${tankLevel !== undefined ? ` (tank: ${(tankLevel * 100).toFixed(0)}%)` : ''}`);

    const snapshot = await MarketIntelligenceService.computeMarketSnapshot(
      zip,
      tankLevel !== undefined ? tankLevel : null
    );

    // Add timing
    const duration = Date.now() - startTime;
    snapshot._computeTime = duration;

    // Cache for 1 hour (or 5 minutes if urgent/pre-gated)
    const ttl = snapshot._preGated ? 300 : 3600;
    if (cache) {
      cache.set(cacheKey, snapshot, ttl);
    }

    // Remove internal fields before response
    const { _weights, _preGated, ...response } = snapshot;

    logger.info(`✅ Market snapshot for ${zip}: ${snapshot.marketState} (${duration}ms)`);

    res.json(response);

  } catch (error) {
    const logger = req.app.locals.logger || console;
    logger.error('Market snapshot error:', error.message);
    logger.error(error.stack);

    res.status(500).json({
      error: 'Failed to compute market snapshot',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/market/health
 *
 * Health check endpoint for the market intelligence service.
 * Returns signal coverage and freshness metrics.
 */
router.get('/health', async (req, res) => {
  try {
    const logger = req.app.locals.logger || console;

    // Test with a sample ZIP code
    const testZip = '10001';

    const [scraped, aggregator, community, market] = await Promise.all([
      MarketIntelligenceService.computeScrapedSignal(testZip),
      MarketIntelligenceService.computeAggregatorSignal(testZip),
      MarketIntelligenceService.computeCommunitySignal(testZip),
      MarketIntelligenceService.computeMarketSignal()
    ]);

    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      signals: {
        scraped: {
          coverage: scraped.coverage,
          dataPoints: scraped.dataPoints,
          staleHours: scraped.staleHours
        },
        aggregator: {
          coverage: aggregator.coverage,
          dataPoints: aggregator.dataPoints,
          staleHours: aggregator.staleHours
        },
        community: {
          coverage: community.coverage,
          dataPoints: community.dataPoints,
          staleHours: community.staleHours
        },
        market: {
          coverage: market.coverage,
          dataPoints: market.dataPoints,
          staleHours: market.staleHours
        }
      },
      issues: []
    };

    // Check for issues
    if (scraped.coverage === 'sparse' && scraped.dataPoints === 0) {
      health.issues.push('No scraped price data');
    }
    if (market.staleHours > 48) {
      health.issues.push('Market data stale (>48 hours)');
    }
    if (!process.env.FRED_API_KEY) {
      health.issues.push('FRED_API_KEY not configured');
    }

    if (health.issues.length > 0) {
      health.status = 'degraded';
    }

    logger.info(`🏥 Market intelligence health: ${health.status}`);
    res.json(health);

  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

/**
 * GET /api/v1/market/summary
 *
 * Consolidated market intelligence for dashboard and full market view.
 * Combines: Market Snapshot + Local Benchmark + Suppliers + Seasonal Context
 *
 * Query params:
 * - zip (required): 5-digit ZIP code
 * - tankLevel (optional): Tank level 0.0 to 1.0
 * - fuelType (optional): 'heating_oil' or 'propane' (default: heating_oil)
 * - supplierLimit (optional): Max suppliers to return (default: 10, max: 20)
 *
 * Response structure:
 * {
 *   market: { state, displayText, direction, confidence, explanation },
 *   localBenchmark: { hasData, medianPrice, typicalRange, deliveryCount, freshness },
 *   suppliers: { count, list, hasScrapedPrices },
 *   seasonalContext: { text, season }
 * }
 */
router.get('/summary', [
  query('zip')
    .matches(/^\d{5}$/)
    .withMessage('ZIP code must be exactly 5 digits'),
  query('tankLevel')
    .optional()
    .isFloat({ min: 0.0, max: 1.0 })
    .withMessage('Tank level must be between 0.0 and 1.0')
    .toFloat(),
  query('fuelType')
    .optional()
    .isIn(FUEL_TYPES)
    .withMessage(`Fuel type must be one of: ${FUEL_TYPES.join(', ')}`),
  query('supplierLimit')
    .optional()
    .isInt({ min: 1, max: 20 })
    .withMessage('Supplier limit must be 1-20')
    .toInt(),
  handleValidationErrors
], async (req, res) => {
  const startTime = Date.now();

  try {
    const { zip, tankLevel, supplierLimit = 10 } = req.query;
    const fuelType = req.query.fuelType || DEFAULT_FUEL_TYPE;
    const cache = req.app.locals.cache;
    const logger = req.app.locals.logger || console;

    // Cache key includes all parameters
    const cacheKey = `market_summary_${zip}_${fuelType}_${tankLevel !== undefined ? Math.round(tankLevel * 100) : 'none'}`;

    // Check cache
    const cached = cache?.get(cacheKey);
    if (cached) {
      logger.info(`📦 Cache hit: market summary for ${zip}`);
      return res.json({ ...cached, _cached: true });
    }

    logger.info(`📊 Computing market summary for ZIP ${zip} (${fuelType})`);

    // Run all data fetches in parallel
    const [
      marketSnapshot,
      localBenchmark,
      supplierData
    ] = await Promise.all([
      computeMarketSection(zip, tankLevel),
      computeLocalBenchmark(zip, fuelType, logger),
      computeSupplierSection(zip, supplierLimit, req.app.locals)
    ]);

    // Compute seasonal context
    const seasonalContext = computeSeasonalContext();

    const response = {
      market: marketSnapshot,
      localBenchmark,
      suppliers: supplierData,
      seasonalContext,
      meta: {
        zip,
        fuelType,
        computeTime: Date.now() - startTime,
        generatedAt: new Date().toISOString()
      }
    };

    // Cache for 30 minutes (shorter than snapshot to keep benchmark fresh)
    if (cache) {
      cache.set(cacheKey, response, 1800);
    }

    logger.info(`✅ Market summary for ${zip}: ${marketSnapshot.state} (${Date.now() - startTime}ms)`);
    res.json(response);

  } catch (error) {
    const logger = req.app.locals.logger || console;
    logger.error('Market summary error:', error.message);
    logger.error(error.stack);

    res.status(500).json({
      error: 'Failed to compute market summary',
      message: error.message
    });
  }
});

/**
 * Helper: Compute market section from MarketIntelligenceService
 */
async function computeMarketSection(zip, tankLevel) {
  const snapshot = await MarketIntelligenceService.computeMarketSnapshot(
    zip,
    tankLevel !== undefined ? tankLevel : null
  );

  // Map market state to display values
  const stateDisplayMap = {
    favorable: { displayText: 'Favorable', icon: 'arrow.down.circle.fill', color: 'green' },
    typical: { displayText: 'Typical', icon: 'equal.circle.fill', color: 'gray' },
    elevated: { displayText: 'Elevated', icon: 'arrow.up.circle.fill', color: 'orange' },
    order_now: { displayText: 'Time to Order', icon: 'exclamationmark.circle.fill', color: 'red' }
  };

  const stateInfo = stateDisplayMap[snapshot.marketState] || stateDisplayMap.typical;

  // Determine direction icon
  let directionIcon = 'arrow.right';
  if (snapshot.direction < -0.3) {
    directionIcon = 'arrow.down';
  } else if (snapshot.direction > 0.3) {
    directionIcon = 'arrow.up';
  }

  return {
    state: snapshot.marketState,
    displayText: stateInfo.displayText,
    icon: stateInfo.icon,
    color: stateInfo.color,
    direction: snapshot.direction,
    directionIcon,
    confidence: snapshot.confidenceLevel,
    confidenceScore: snapshot.confidence,
    explanation: snapshot.explanation,
    urgency: snapshot.urgency,
    dataQuality: snapshot.dataQuality
  };
}

/**
 * Helper: Compute local benchmark from delivery data
 * Uses 7-day primary window, 14-day fallback
 * Language: "local deliveries" not "community"
 */
async function computeLocalBenchmark(zip, fuelType, logger) {
  const CommunityDelivery = getCommunityDeliveryModel();
  if (!CommunityDelivery) {
    return {
      hasData: false,
      message: 'Local delivery data unavailable'
    };
  }

  const zipPrefix = zip.substring(0, 3);
  const now = new Date();

  // 7-day primary window
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  // 14-day fallback
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  try {
    // Try 7-day window first
    let deliveries = await CommunityDelivery.findAll({
      where: {
        zipPrefix,
        fuelType,
        validationStatus: 'valid',
        createdAt: { [Op.gte]: sevenDaysAgo }
      },
      order: [['createdAt', 'DESC']]
    });

    let freshness = '7_days';
    let freshnessText = 'this week';

    // Fallback to 14-day if insufficient data
    if (deliveries.length < 3) {
      deliveries = await CommunityDelivery.findAll({
        where: {
          zipPrefix,
          fuelType,
          validationStatus: 'valid',
          createdAt: { [Op.gte]: fourteenDaysAgo }
        },
        order: [['createdAt', 'DESC']]
      });
      freshness = '14_days';
      freshnessText = 'in the last 2 weeks';
    }

    // Need at least 3 deliveries from 2+ contributors
    const contributors = new Set(deliveries.map(d => d.contributorHash));
    if (deliveries.length < 3 || contributors.size < 2) {
      return {
        hasData: false,
        deliveryCount: deliveries.length,
        contributorCount: contributors.size,
        message: deliveries.length === 0
          ? 'No recent local deliveries'
          : 'Not enough local data yet'
      };
    }

    // Calculate stats
    const prices = deliveries.map(d => parseFloat(d.pricePerGallon)).sort((a, b) => a - b);
    const medianPrice = prices[Math.floor(prices.length / 2)];
    const avgPrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;

    // IQR for typical range (if enough data)
    let typicalRange = null;
    if (prices.length >= 5) {
      const q1Idx = Math.floor(prices.length * 0.25);
      const q3Idx = Math.floor(prices.length * 0.75);
      typicalRange = {
        low: prices[q1Idx],
        high: prices[q3Idx]
      };
    }

    // Calculate days since newest delivery
    const newestDelivery = deliveries[0];
    const daysSinceNewest = Math.floor((now - new Date(newestDelivery.createdAt)) / (1000 * 60 * 60 * 24));

    return {
      hasData: true,
      medianPrice: Math.round(medianPrice * 100) / 100,
      avgPrice: Math.round(avgPrice * 100) / 100,
      typicalRange,
      deliveryCount: deliveries.length,
      contributorCount: contributors.size,
      freshness,
      freshnessText: `Based on ${deliveries.length} local ${deliveries.length === 1 ? 'delivery' : 'deliveries'} ${freshnessText}`,
      daysSinceNewest,
      lastUpdated: newestDelivery.createdAt
    };

  } catch (error) {
    logger.error('Local benchmark error:', error.message);
    return {
      hasData: false,
      message: 'Could not load local data'
    };
  }
}

/**
 * Helper: Compute supplier section
 * Returns suppliers with scraped prices where available
 */
async function computeSupplierSection(zip, limit, appLocals) {
  const Supplier = getSupplierModel();
  if (!Supplier) {
    return {
      count: 0,
      list: [],
      hasScrapedPrices: false,
      message: 'Supplier data unavailable'
    };
  }

  try {
    // Get all active suppliers
    const allSuppliers = await Supplier.findAll({
      where: { active: true },
      attributes: [
        'id', 'name', 'phone', 'email', 'website',
        'city', 'state', 'postalCodesServed', 'notes'
      ]
    });

    const suppliersJson = allSuppliers.map(s => s.toJSON());

    // Find suppliers for this ZIP
    const { suppliers: matchedSuppliers } = findSuppliersForZip(
      zip,
      suppliersJson,
      { includeRadius: true }
    );

    // Limit results
    const limitedSuppliers = matchedSuppliers.slice(0, limit);

    // Fetch current prices
    const supplierIds = limitedSuppliers.map(s => s.id);
    const priceMap = await getLatestPrices(supplierIds);

    // Count how many have scraped prices
    const suppliersWithPrices = supplierIds.filter(id => priceMap[id]).length;

    // Build response list
    const supplierList = limitedSuppliers.map(s => {
      const price = priceMap[s.id];
      return {
        id: s.id,
        name: s.name,
        phone: s.phone,
        website: s.website,
        city: s.city,
        state: s.state,
        // Price info (if available) - framed positively
        currentPrice: price ? {
          pricePerGallon: parseFloat(price.pricePerGallon),
          minGallons: price.minGallons,
          scrapedAt: price.scrapedAt
        } : null,
        // "Call for today's price" framing when no scraped price
        callForPrice: !price
      };
    });

    return {
      count: supplierList.length,
      totalAvailable: matchedSuppliers.length,
      list: supplierList,
      hasScrapedPrices: suppliersWithPrices > 0,
      scrapedPriceCount: suppliersWithPrices
    };

  } catch (error) {
    const logger = appLocals?.logger || console;
    logger.error('Supplier section error:', error.message);
    return {
      count: 0,
      list: [],
      hasScrapedPrices: false,
      message: 'Could not load suppliers'
    };
  }
}

/**
 * Helper: Compute seasonal context
 */
function computeSeasonalContext() {
  const month = new Date().getMonth() + 1; // 1-12

  // Peak heating season: Nov-Feb
  if (month >= 11 || month <= 2) {
    return {
      season: 'peak',
      text: 'Peak heating season. Prices typically highest Dec-Feb.',
      icon: 'thermometer.snowflake'
    };
  }

  // Shoulder season: Mar-Apr, Oct
  if (month >= 3 && month <= 4) {
    return {
      season: 'shoulder_spring',
      text: 'Spring shoulder season. Prices often stabilize.',
      icon: 'leaf'
    };
  }
  if (month === 10) {
    return {
      season: 'shoulder_fall',
      text: 'Fall is a good time to fill up before winter.',
      icon: 'leaf.fill'
    };
  }

  // Off-season: May-Sep
  return {
    season: 'off_peak',
    text: 'Summer off-season. Historically lower prices.',
    icon: 'sun.max'
  };
}

/**
 * GET /api/v1/market/debug/:zip
 *
 * Debug endpoint for inspecting signal computation.
 * Only available in development mode.
 */
router.get('/debug/:zip', async (req, res) => {
  // Only in development
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    const { zip } = req.params;
    const tankLevel = req.query.tankLevel ? parseFloat(req.query.tankLevel) : null;

    // Get full snapshot with internal data
    const snapshot = await MarketIntelligenceService.computeMarketSnapshot(zip, tankLevel);

    // Re-compute signals with full metadata
    const [scraped, aggregator, community, market] = await Promise.all([
      MarketIntelligenceService.computeScrapedSignal(zip),
      MarketIntelligenceService.computeAggregatorSignal(zip),
      MarketIntelligenceService.computeCommunitySignal(zip),
      MarketIntelligenceService.computeMarketSignal()
    ]);

    res.json({
      snapshot,
      detailedSignals: {
        scraped,
        aggregator,
        community,
        market
      },
      config: require('../services/SignalCalculator').loadSignalConfig()
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
