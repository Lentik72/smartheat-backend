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
