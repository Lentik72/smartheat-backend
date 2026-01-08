/**
 * Market Intelligence API Routes
 * V2.3.0: Unified market summary with data-driven progressive disclosure
 *
 * Endpoints:
 * - GET /api/v1/market/snapshot - Get market snapshot for a ZIP code
 * - GET /api/v1/market/summary - Consolidated market intelligence (V2.3.0)
 *
 * Design notes:
 * - Aggregator data is NEVER exposed in responses
 * - Urgency pre-gate is evaluated server-side
 * - Backend decides what to show via "show" flags - iOS just renders
 * - "Tracked prices" = scraped, "Logged deliveries" = community
 * - Maturity levels unlock features as data grows
 */

const express = require('express');
const { query, validationResult } = require('express-validator');
const router = express.Router();

const MarketIntelligenceService = require('../services/MarketIntelligenceService');
const { getCommunityDeliveryModel, FUEL_TYPES, DEFAULT_FUEL_TYPE } = require('../models/CommunityDelivery');
const { getSupplierModel } = require('../models/Supplier');
const { getSupplierPriceModel } = require('../models/SupplierPrice');
const { findSuppliersForZip } = require('../services/supplierMatcher');
const { Op } = require('sequelize');

// V2.3.0: Visibility thresholds for progressive disclosure
const VISIBILITY_THRESHOLDS = {
  priceContext: {
    minTotal: 3,           // At least 3 data points
    maxAgeDays: 14         // Oldest data within 14 days
  },
  trend: {
    minTotal: 5,           // At least 5 data points
    minSpanDays: 7,        // Data spanning at least 7 days
    minPercentChange: 1.0  // At least 1% change to be meaningful
  },
  chart: {
    minTotal: 5,           // At least 5 data points
    minSpanDays: 14,       // Data spanning at least 14 days
    minVariancePercent: 2.0 // At least 2% variance to be interesting
  }
};

// V2.3.0: Maturity level definitions
const MATURITY_LEVELS = [
  {
    level: 0,
    label: 'Getting Started',
    requirement: 'First data point',
    unlocks: 'Basic market signals'
  },
  {
    level: 1,
    label: 'Building Data',
    requirement: '3+ tracked prices or logged deliveries',
    unlocks: 'Price range display'
  },
  {
    level: 2,
    label: 'Tracking Trends',
    requirement: '5+ data points over 7+ days',
    unlocks: 'Price trends'
  },
  {
    level: 3,
    label: 'Full Insights',
    requirement: '5+ data points over 14+ days with variance',
    unlocks: 'Price charts and detailed analysis'
  }
];

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
 * V2.3.0: Consolidated market intelligence with progressive disclosure.
 * Backend decides what to show via "show" flags - iOS just renders.
 *
 * Query params:
 * - zip (required): 5-digit ZIP code
 * - tankLevel (optional): Tank level 0.0 to 1.0
 * - fuelType (optional): 'heating_oil' or 'propane' (default: heating_oil)
 *
 * Response structure:
 * {
 *   market: { state, displayText, icon, color, explanation, confidence },
 *   priceContext: { show, range, sources, freshness, label },
 *   trend: { show, direction, percentChange, icon },
 *   chart: { show, hasVariance, variancePercent, data, spanDays },
 *   seasonalContext: { season, text, icon },
 *   maturity: { level, label, nextLevel },
 *   truthNotes: [...],
 *   meta: { zip, fuelType, computeTime, generatedAt }
 * }
 */
// Middleware to disable ETag for this route (prevents 304 issues on iOS)
const disableETag = (req, res, next) => {
  const originalEtag = req.app.get('etag');
  req.app.set('etag', false);
  res.on('finish', () => {
    req.app.set('etag', originalEtag);
  });
  next();
};

router.get('/summary', disableETag, [
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
  handleValidationErrors
], async (req, res) => {
  const startTime = Date.now();

  try {
    const { zip, tankLevel } = req.query;
    const fuelType = req.query.fuelType || DEFAULT_FUEL_TYPE;
    const cache = req.app.locals.cache;
    const logger = req.app.locals.logger || console;

    // Cache key
    const cacheKey = `market_summary_v2_${zip}_${fuelType}_${tankLevel !== undefined ? Math.round(tankLevel * 100) : 'none'}`;

    // Check cache
    const cached = cache?.get(cacheKey);
    if (cached) {
      logger.info(`📦 Cache hit: market summary for ${zip}`);
      return res.json({ ...cached, _cached: true });
    }

    logger.info(`📊 Computing market summary for ZIP ${zip} (${fuelType})`);

    // Step 1: Gather all raw data in parallel
    const [
      marketSnapshot,
      priceData
    ] = await Promise.all([
      computeMarketSection(zip, tankLevel),
      gatherPriceData(zip, fuelType, logger)
    ]);

    // Step 2: Compute derived sections based on data
    const priceContext = computePriceContext(priceData);
    const trend = computeTrend(priceData);
    const chart = computeChart(priceData);
    const maturity = computeMaturityLevel(priceData);
    const seasonalContext = computeSeasonalContext();
    const truthNotes = generateTruthNotes(priceData, priceContext, trend);

    const response = {
      market: marketSnapshot,
      priceContext,
      trend,
      chart,
      seasonalContext,
      maturity,
      truthNotes,
      meta: {
        zip,
        fuelType,
        computeTime: Date.now() - startTime,
        generatedAt: new Date().toISOString()
      }
    };

    // Cache for 30 minutes
    if (cache) {
      cache.set(cacheKey, response, 1800);
    }

    logger.info(`✅ Market summary for ${zip}: ${marketSnapshot.state}, maturity L${maturity.level} (${Date.now() - startTime}ms)`);

    // Disable HTTP caching
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
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
 * V2.3.0: Gather all price data from both scraped and community sources
 * Returns unified data structure for computing priceContext, trend, and chart
 */
async function gatherPriceData(zip, fuelType, logger) {
  const CommunityDelivery = getCommunityDeliveryModel();
  const SupplierPrice = getSupplierPriceModel();
  const Supplier = getSupplierModel();

  const now = new Date();
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const zipPrefix = zip.substring(0, 3);

  const result = {
    trackedPrices: [],   // Scraped from supplier websites
    loggedDeliveries: [], // User-submitted community deliveries
    allDataPoints: [],   // Combined for calculations
    stats: {
      trackedCount: 0,
      loggedCount: 0,
      totalCount: 0,
      newestTimestamp: null,
      oldestTimestamp: null,
      spanDays: 0
    }
  };

  try {
    // 1. Get scraped prices from suppliers serving this ZIP
    if (SupplierPrice && Supplier) {
      // Get suppliers for this ZIP
      const allSuppliers = await Supplier.findAll({
        where: { active: true },
        attributes: ['id', 'name', 'postalCodesServed']
      });

      const suppliersJson = allSuppliers.map(s => s.toJSON());
      const { suppliers: matchedSuppliers } = findSuppliersForZip(zip, suppliersJson, { includeRadius: true });
      const supplierIds = matchedSuppliers.map(s => s.id);

      if (supplierIds.length > 0) {
        // Get scraped prices (not aggregator_signal) from last 14 days
        const scrapedPrices = await SupplierPrice.findAll({
          where: {
            supplierId: { [Op.in]: supplierIds },
            isValid: true,
            sourceType: { [Op.ne]: 'aggregator_signal' },
            scrapedAt: { [Op.gte]: fourteenDaysAgo }
          },
          order: [['scrapedAt', 'DESC']]
        });

        result.trackedPrices = scrapedPrices.map(p => ({
          price: parseFloat(p.pricePerGallon),
          timestamp: p.scrapedAt,
          source: 'tracked',
          supplierId: p.supplierId
        }));
      }
    }

    // 2. Get community deliveries (user-logged)
    if (CommunityDelivery) {
      const deliveries = await CommunityDelivery.findAll({
        where: {
          zipPrefix,
          fuelType,
          validationStatus: 'valid',
          createdAt: { [Op.gte]: thirtyDaysAgo }
        },
        order: [['createdAt', 'DESC']]
      });

      result.loggedDeliveries = deliveries.map(d => ({
        price: parseFloat(d.pricePerGallon),
        timestamp: d.createdAt,
        source: 'logged',
        contributorHash: d.contributorHash
      }));
    }

    // 3. Combine all data points (community weighted slightly higher)
    result.allDataPoints = [
      ...result.trackedPrices.map(p => ({ ...p, weight: 1.0 })),
      ...result.loggedDeliveries.map(p => ({ ...p, weight: 1.2 })) // Community weighted 1.2x
    ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // 4. Calculate stats
    result.stats.trackedCount = result.trackedPrices.length;
    result.stats.loggedCount = result.loggedDeliveries.length;
    result.stats.totalCount = result.allDataPoints.length;

    if (result.allDataPoints.length > 0) {
      result.stats.newestTimestamp = result.allDataPoints[0].timestamp;
      result.stats.oldestTimestamp = result.allDataPoints[result.allDataPoints.length - 1].timestamp;
      result.stats.spanDays = Math.ceil(
        (new Date(result.stats.newestTimestamp) - new Date(result.stats.oldestTimestamp)) / (1000 * 60 * 60 * 24)
      );
    }

  } catch (error) {
    logger.error('gatherPriceData error:', error.message);
  }

  return result;
}

/**
 * V2.3.0: Compute price context with source tracking
 * Show flag based on visibility thresholds
 */
function computePriceContext(priceData) {
  const { allDataPoints, stats } = priceData;
  const threshold = VISIBILITY_THRESHOLDS.priceContext;

  // Base response when not showing
  const baseResponse = {
    show: false,
    range: null,
    sources: {
      trackedPrices: stats.trackedCount,
      loggedDeliveries: stats.loggedCount,
      total: stats.totalCount
    },
    freshness: null,
    label: null
  };

  // Check visibility thresholds
  if (stats.totalCount < threshold.minTotal) {
    return baseResponse;
  }

  // Check data freshness (oldest data within threshold)
  const now = new Date();
  const oldestAgeDays = stats.oldestTimestamp
    ? Math.ceil((now - new Date(stats.oldestTimestamp)) / (1000 * 60 * 60 * 24))
    : 999;

  if (oldestAgeDays > threshold.maxAgeDays) {
    return baseResponse;
  }

  // Calculate price range
  const prices = allDataPoints.map(d => d.price).sort((a, b) => a - b);
  const low = prices[0];
  const high = prices[prices.length - 1];

  // Calculate freshness
  const newestAgeHours = stats.newestTimestamp
    ? Math.floor((now - new Date(stats.newestTimestamp)) / (1000 * 60 * 60))
    : null;

  // Build label based on sources
  let label = '';
  if (stats.trackedCount > 0 && stats.loggedCount > 0) {
    label = 'Tracked prices and logged deliveries in your area';
  } else if (stats.trackedCount > 0) {
    label = 'Tracked prices in your area';
  } else {
    label = 'Logged deliveries in your area';
  }

  return {
    show: true,
    range: {
      low: Math.round(low * 100) / 100,
      high: Math.round(high * 100) / 100
    },
    sources: {
      trackedPrices: stats.trackedCount,
      loggedDeliveries: stats.loggedCount,
      total: stats.totalCount
    },
    freshness: {
      newestAgeHours,
      newestTimestamp: stats.newestTimestamp,
      oldestAgeDays
    },
    label
  };
}

/**
 * V2.3.0: Compute trend with visibility thresholds
 */
function computeTrend(priceData) {
  const { allDataPoints, stats } = priceData;
  const threshold = VISIBILITY_THRESHOLDS.trend;

  // Base response when not showing
  const baseResponse = {
    show: false,
    direction: null,
    percentChange: null,
    icon: null
  };

  // Check visibility thresholds
  if (stats.totalCount < threshold.minTotal || stats.spanDays < threshold.minSpanDays) {
    return baseResponse;
  }

  // Calculate week-over-week change using weighted averages
  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const recentPrices = allDataPoints.filter(d => new Date(d.timestamp) >= oneWeekAgo);
  const olderPrices = allDataPoints.filter(d => new Date(d.timestamp) < oneWeekAgo);

  if (recentPrices.length === 0 || olderPrices.length === 0) {
    return baseResponse;
  }

  // Weighted averages
  const recentAvg = recentPrices.reduce((sum, d) => sum + d.price * d.weight, 0) /
    recentPrices.reduce((sum, d) => sum + d.weight, 0);
  const olderAvg = olderPrices.reduce((sum, d) => sum + d.price * d.weight, 0) /
    olderPrices.reduce((sum, d) => sum + d.weight, 0);

  const percentChange = ((recentAvg - olderAvg) / olderAvg) * 100;

  // Check if change is meaningful
  if (Math.abs(percentChange) < threshold.minPercentChange) {
    return {
      show: true,
      direction: 'stable',
      percentChange: Math.round(percentChange * 10) / 10,
      icon: 'arrow.right'
    };
  }

  return {
    show: true,
    direction: percentChange < 0 ? 'down' : 'up',
    percentChange: Math.round(percentChange * 10) / 10,
    icon: percentChange < 0 ? 'arrow.down' : 'arrow.up'
  };
}

/**
 * V2.3.0: Compute chart eligibility with variance check
 */
function computeChart(priceData) {
  const { allDataPoints, stats } = priceData;
  const threshold = VISIBILITY_THRESHOLDS.chart;

  // Base response when not showing
  const baseResponse = {
    show: false,
    hasVariance: false,
    variancePercent: null,
    data: [],
    spanDays: stats.spanDays
  };

  // Check visibility thresholds
  if (stats.totalCount < threshold.minTotal || stats.spanDays < threshold.minSpanDays) {
    return baseResponse;
  }

  // Calculate variance
  const prices = allDataPoints.map(d => d.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const variancePercent = ((maxPrice - minPrice) / minPrice) * 100;

  // Check if chart would be interesting (has variance)
  const hasVariance = variancePercent >= threshold.minVariancePercent;

  if (!hasVariance) {
    return {
      ...baseResponse,
      hasVariance: false,
      variancePercent: Math.round(variancePercent * 10) / 10
    };
  }

  // Prepare chart data (limit to 30 points for performance)
  const chartData = allDataPoints
    .slice(0, 30)
    .map(d => ({
      date: d.timestamp,
      price: d.price,
      source: d.source
    }))
    .reverse(); // Oldest first for chart

  return {
    show: true,
    hasVariance: true,
    variancePercent: Math.round(variancePercent * 10) / 10,
    data: chartData,
    spanDays: stats.spanDays
  };
}

/**
 * V2.3.0: Compute maturity level based on data availability
 */
function computeMaturityLevel(priceData) {
  const { stats } = priceData;
  const chartThreshold = VISIBILITY_THRESHOLDS.chart;
  const trendThreshold = VISIBILITY_THRESHOLDS.trend;
  const contextThreshold = VISIBILITY_THRESHOLDS.priceContext;

  // Calculate variance for level 3 check
  let variancePercent = 0;
  if (priceData.allDataPoints.length > 0) {
    const prices = priceData.allDataPoints.map(d => d.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    variancePercent = ((maxPrice - minPrice) / minPrice) * 100;
  }

  // Level 3: Full Insights - 5+ data over 14+ days with variance
  if (stats.totalCount >= chartThreshold.minTotal &&
      stats.spanDays >= chartThreshold.minSpanDays &&
      variancePercent >= chartThreshold.minVariancePercent) {
    return {
      level: 3,
      label: MATURITY_LEVELS[3].label,
      nextLevel: null // Already at max
    };
  }

  // Level 2: Tracking Trends - 5+ data over 7+ days
  if (stats.totalCount >= trendThreshold.minTotal &&
      stats.spanDays >= trendThreshold.minSpanDays) {
    return {
      level: 2,
      label: MATURITY_LEVELS[2].label,
      nextLevel: {
        requirement: MATURITY_LEVELS[3].requirement,
        unlocks: MATURITY_LEVELS[3].unlocks
      }
    };
  }

  // Level 1: Building Data - 3+ data points
  if (stats.totalCount >= contextThreshold.minTotal) {
    return {
      level: 1,
      label: MATURITY_LEVELS[1].label,
      nextLevel: {
        requirement: MATURITY_LEVELS[2].requirement,
        unlocks: MATURITY_LEVELS[2].unlocks
      }
    };
  }

  // Level 0: Getting Started
  return {
    level: 0,
    label: MATURITY_LEVELS[0].label,
    nextLevel: {
      requirement: MATURITY_LEVELS[1].requirement,
      unlocks: MATURITY_LEVELS[1].unlocks
    }
  };
}

/**
 * V2.3.0: Generate truthNotes - transparency about data sources
 */
function generateTruthNotes(priceData, priceContext, trend) {
  const notes = [];
  const { stats } = priceData;

  // Source composition note
  if (stats.totalCount > 0) {
    const parts = [];
    if (stats.trackedCount > 0) {
      parts.push(`${stats.trackedCount} tracked ${stats.trackedCount === 1 ? 'price' : 'prices'}`);
    }
    if (stats.loggedCount > 0) {
      parts.push(`${stats.loggedCount} logged ${stats.loggedCount === 1 ? 'delivery' : 'deliveries'}`);
    }
    notes.push(`Based on ${parts.join(' and ')}`);
  }

  // Freshness note
  if (priceContext.show && priceContext.freshness?.newestAgeHours !== null) {
    const hours = priceContext.freshness.newestAgeHours;
    if (hours < 24) {
      notes.push('Includes data from today');
    } else if (hours < 48) {
      notes.push('Most recent data from yesterday');
    } else {
      const days = Math.floor(hours / 24);
      notes.push(`Most recent data ${days} days ago`);
    }
  }

  // Limited data note
  if (stats.totalCount < VISIBILITY_THRESHOLDS.priceContext.minTotal) {
    notes.push('Limited local data - market signal based on regional trends');
  }

  // Trend confidence note
  if (trend.show && trend.direction !== 'stable') {
    if (stats.spanDays >= 14) {
      notes.push('Trend based on 2+ weeks of data');
    } else {
      notes.push('Short-term trend - may not reflect longer patterns');
    }
  }

  return notes;
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
