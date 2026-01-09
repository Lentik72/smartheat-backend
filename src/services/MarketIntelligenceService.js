/**
 * Market Intelligence Service
 * V2.1.0: Core engine for market snapshot computation
 *
 * Features:
 * - Urgency pre-gate (skip engine if tank critical)
 * - Multi-signal blending (scraped, aggregator, community, market)
 * - Configurable weights with dynamic adjustment
 * - Graceful degradation when data is sparse
 *
 * IMPORTANT: Aggregator signals are NEVER displayed to users.
 * They only contribute to trend/direction calculation.
 */

const fs = require('fs');
const path = require('path');
const { Sequelize, Op } = require('sequelize');

const SignalCalculator = require('./SignalCalculator');

// Lazy-load database connection
let sequelize = null;

function getSequelize() {
  if (sequelize) return sequelize;

  if (!process.env.DATABASE_URL) {
    console.warn('⚠️  DATABASE_URL not set - MarketIntelligenceService limited');
    return null;
  }

  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: {
      ssl: process.env.DATABASE_URL?.includes('railway') ? {
        require: true,
        rejectUnauthorized: false
      } : false
    }
  });

  return sequelize;
}

// Load weights config
function loadWeights() {
  const config = SignalCalculator.loadSignalConfig();
  return config.weights || {
    scraped: 0.45,
    aggregator: 0.15,
    community: 0.15,
    market: 0.25
  };
}

function loadThresholds() {
  const config = SignalCalculator.loadSignalConfig();
  return config.thresholds || {
    urgency: { critical: 0.15, low_tank: 0.25 },
    market_state: { favorable: -0.3, elevated: 0.3 }
  };
}

/**
 * URGENCY PRE-GATE
 * Evaluated BEFORE signal blending. If urgent, skip the engine entirely.
 *
 * @param {number|null} tankLevel - Tank level 0.0 to 1.0 (null if unknown)
 * @returns {object|null} Urgency response if urgent, null if should continue to engine
 */
function evaluateUrgency(tankLevel) {
  if (tankLevel === null || tankLevel === undefined) {
    return null; // Unknown tank level - proceed to engine
  }

  const thresholds = loadThresholds();
  const urgencyThresholds = thresholds.urgency || { critical: 0.15, low_tank: 0.25 };

  if (tankLevel < urgencyThresholds.critical) {
    return {
      marketState: 'order_now',
      urgency: 'critical',
      confidence: 1.0,
      confidenceLevel: 'high',
      direction: 0,
      signals: null, // No signal blending performed
      explanation: 'Tank critically low. Order immediately.',
      dataQuality: 'n/a',
      nextUpdate: null,
      _preGated: true
    };
  }

  if (tankLevel < urgencyThresholds.low_tank) {
    return {
      marketState: 'order_now',
      urgency: 'low_tank',
      confidence: 1.0,
      confidenceLevel: 'high',
      direction: 0,
      signals: null,
      explanation: 'Tank below 25%. Time to order.',
      dataQuality: 'n/a',
      nextUpdate: null,
      _preGated: true
    };
  }

  return null; // Not urgent - proceed to engine
}

/**
 * Compute scraped signal from direct supplier prices
 * @param {string} zipCode - 5-digit ZIP code
 * @param {number} radiusMiles - Search radius in miles
 * @returns {object} Signal structure
 */
async function computeScrapedSignal(zipCode, radiusMiles = 20) {
  const db = getSequelize();
  if (!db) {
    return SignalCalculator.createEmptySignal('unknown');
  }

  try {
    // Get scraped prices from last 14 days (for week-over-week comparison)
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    // First try: exact ZIP match
    // Note: postal_codes_served is JSONB array, use ? operator
    let [prices] = await db.query(`
      SELECT sp.price_per_gallon, sp.scraped_at, sp.source_type
      FROM supplier_prices sp
      JOIN suppliers s ON sp.supplier_id = s.id
      WHERE sp.is_valid = true
      AND sp.scraped_at >= $1
      AND sp.source_type = 'scraped'
      AND s.postal_codes_served ? $2
    `, { bind: [twoWeeksAgo.toISOString(), zipCode] });

    let scope = 'zip';

    // Expand search if sparse
    if (prices.length < 5) {
      // Get nearby ZIPs (simplified: same first 3 digits = ~20mi radius)
      // Note: postal_codes_served is JSONB, use jsonb_array_elements_text
      const zipPrefix = zipCode.substring(0, 3);
      [prices] = await db.query(`
        SELECT sp.price_per_gallon, sp.scraped_at, sp.source_type
        FROM supplier_prices sp
        JOIN suppliers s ON sp.supplier_id = s.id
        WHERE sp.is_valid = true
        AND sp.scraped_at >= $1
        AND sp.source_type = 'scraped'
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(s.postal_codes_served) AS z
          WHERE z LIKE $2
        )
      `, { bind: [twoWeeksAgo.toISOString(), `${zipPrefix}%`] });
      scope = 'radius_20mi';
    }

    // Expand further if still sparse
    if (prices.length < 5) {
      // State-level: first 2 digits
      const statePrefix = zipCode.substring(0, 2);
      [prices] = await db.query(`
        SELECT sp.price_per_gallon, sp.scraped_at, sp.source_type
        FROM supplier_prices sp
        JOIN suppliers s ON sp.supplier_id = s.id
        WHERE sp.is_valid = true
        AND sp.scraped_at >= $1
        AND sp.source_type = 'scraped'
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(s.postal_codes_served) AS z
          WHERE z LIKE $2
        )
      `, { bind: [twoWeeksAgo.toISOString(), `${statePrefix}%`] });
      scope = 'state';
    }

    return SignalCalculator.buildSignal(prices, scope, { isAggregator: false });

  } catch (error) {
    console.error('Error computing scraped signal:', error.message);
    return SignalCalculator.createEmptySignal('unknown');
  }
}

/**
 * Compute aggregator signal (capped strength, never displayed)
 * @param {string} zipCode - 5-digit ZIP code
 * @returns {object} Signal structure with capped strength
 */
async function computeAggregatorSignal(zipCode) {
  const db = getSequelize();
  if (!db) {
    return SignalCalculator.createEmptySignal('state');
  }

  try {
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    // Aggregators are regional, so use state-level
    const statePrefix = zipCode.substring(0, 2);

    const [prices] = await db.query(`
      SELECT sp.price_per_gallon, sp.scraped_at, sp.source_type
      FROM supplier_prices sp
      WHERE sp.is_valid = true
      AND sp.scraped_at >= $1
      AND sp.source_type = 'aggregator_signal'
    `, { bind: [twoWeeksAgo.toISOString()] });

    // Build signal with aggregator flag (caps strength)
    return SignalCalculator.buildSignal(prices, 'state', { isAggregator: true });

  } catch (error) {
    console.error('Error computing aggregator signal:', error.message);
    return SignalCalculator.createEmptySignal('state');
  }
}

/**
 * Compute community signal from user-reported prices
 * @param {string} zipCode - 5-digit ZIP code
 * @returns {object} Signal structure
 */
async function computeCommunitySignal(zipCode) {
  const db = getSequelize();
  if (!db) {
    return SignalCalculator.createEmptySignal('radius_30mi');
  }

  try {
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const zipPrefix = zipCode.substring(0, 3);

    // User-reported prices (source_type = 'user_reported' or from community table)
    const [prices] = await db.query(`
      SELECT sp.price_per_gallon, sp.scraped_at
      FROM supplier_prices sp
      WHERE sp.is_valid = true
      AND sp.scraped_at >= $1
      AND sp.source_type = 'user_reported'
    `, { bind: [twoWeeksAgo.toISOString()] });

    // Also check community_prices if that table exists
    let communityPrices = [];
    try {
      const [community] = await db.query(`
        SELECT price_per_gallon, created_at as scraped_at
        FROM community_prices
        WHERE verified = true
        AND created_at >= $1
        AND zip_code LIKE $2
      `, { bind: [twoWeeksAgo.toISOString(), `${zipPrefix}%`] });
      communityPrices = community;
    } catch {
      // community_prices table may not exist
    }

    const allPrices = [...prices, ...communityPrices];

    return SignalCalculator.buildSignal(allPrices, 'radius_30mi', { isAggregator: false });

  } catch (error) {
    console.error('Error computing community signal:', error.message);
    return SignalCalculator.createEmptySignal('radius_30mi');
  }
}

/**
 * Compute market signal from FRED/EIA wholesale data
 * @returns {object} Signal structure
 */
async function computeMarketSignal() {
  try {
    const fetch = (await import('node-fetch')).default;
    const FRED_API_KEY = process.env.FRED_API_KEY;

    if (!FRED_API_KEY) {
      console.warn('⚠️  FRED_API_KEY not set - market signal limited');
      return SignalCalculator.createEmptySignal('national');
    }

    // Fetch last 30 days of WTI crude data
    const response = await fetch(
      `https://api.stlouisfed.org/fred/series/observations?series_id=DCOILWTICO&api_key=${FRED_API_KEY}&file_type=json&limit=30&sort_order=desc`,
      { timeout: 8000 }
    );

    if (!response.ok) {
      return SignalCalculator.createEmptySignal('national');
    }

    const data = await response.json();
    const observations = (data.observations || []).filter(obs => obs.value !== '.');

    if (observations.length < 2) {
      return SignalCalculator.createEmptySignal('national');
    }

    // Convert to price format expected by SignalCalculator
    // Use heating oil retail estimate: WTI * 0.045 * 1.15
    const prices = observations.map(obs => ({
      pricePerGallon: parseFloat(obs.value) * 0.045 * 1.15,
      scrapedAt: new Date(obs.date)
    }));

    return SignalCalculator.buildSignal(prices, 'national', { isAggregator: false });

  } catch (error) {
    console.error('Error computing market signal:', error.message);
    return SignalCalculator.createEmptySignal('national');
  }
}

/**
 * Determine market state from weighted direction
 * @param {number} weightedDirection - Blended direction -1.0 to 1.0
 * @returns {string} Market state: 'favorable' | 'typical' | 'elevated'
 */
function determineMarketState(weightedDirection) {
  const thresholds = loadThresholds();
  const stateThresholds = thresholds.market_state || { favorable: -0.3, elevated: 0.3 };

  if (weightedDirection <= stateThresholds.favorable) return 'favorable';
  if (weightedDirection >= stateThresholds.elevated) return 'elevated';
  return 'typical';
}

/**
 * Determine data quality from signals
 * @param {object} signals - All computed signals
 * @returns {string} Data quality: 'high' | 'medium' | 'low'
 */
function determineDataQuality(signals) {
  const scraped = signals.scraped || {};
  const market = signals.market || {};

  // High quality: good scraped coverage + fresh market data
  if (scraped.coverage === 'good' && market.staleHours < 24) {
    return 'high';
  }

  // Medium quality: adequate scraped OR fresh market
  if (scraped.coverage === 'adequate' || market.staleHours < 48) {
    return 'medium';
  }

  return 'low';
}

/**
 * Generate human-readable explanation
 * @param {object} signals - All computed signals
 * @param {string} marketState - Computed market state
 * @param {string} dataQuality - Computed data quality
 * @returns {string} Explanation text
 */
function generateExplanation(signals, marketState, dataQuality) {
  const scraped = signals.scraped || {};
  const market = signals.market || {};

  // Low data quality disclaimer
  if (dataQuality === 'low') {
    return 'Limited local data. Based primarily on regional market trends.';
  }

  // Build explanation from signals
  const parts = [];

  // Scraped signal insight
  if (scraped.coverage !== 'sparse' && scraped._meta) {
    const change = scraped._meta.percentChange;
    if (Math.abs(change) > 0.5) {
      if (change < 0) {
        parts.push(`Local prices down ${Math.abs(change).toFixed(1)}% this week`);
      } else {
        parts.push(`Local prices up ${change.toFixed(1)}% this week`);
      }
    }
  }

  // Market state conclusion
  switch (marketState) {
    case 'favorable':
      parts.push('Favorable conditions for ordering');
      break;
    case 'elevated':
      parts.push('Prices trending higher');
      break;
    default:
      parts.push('Normal market conditions');
  }

  return parts.join('. ') + '.';
}

/**
 * Main entry point: Compute market snapshot
 *
 * @param {string} zipCode - 5-digit ZIP code
 * @param {number|null} tankLevel - Tank level 0.0 to 1.0 (null if unknown)
 * @returns {object} Market snapshot
 */
async function computeMarketSnapshot(zipCode, tankLevel = null) {
  // URGENCY PRE-GATE: Check before any signal computation
  const urgencyResult = evaluateUrgency(tankLevel);
  if (urgencyResult) {
    return urgencyResult;
  }

  // Compute all signals in parallel
  const [scrapedSignal, aggregatorSignal, communitySignal, marketSignal] = await Promise.all([
    computeScrapedSignal(zipCode),
    computeAggregatorSignal(zipCode),
    computeCommunitySignal(zipCode),
    computeMarketSignal()
  ]);

  const signals = {
    scraped: scrapedSignal,
    aggregator: aggregatorSignal,
    community: communitySignal,
    market: marketSignal
  };

  // Load base weights
  let weights = { ...loadWeights() };

  // Dynamic weight adjustment for sparse scraped data
  const config = SignalCalculator.loadSignalConfig();
  if (scrapedSignal.coverage === 'sparse') {
    const sparseWeights = config.coverage_adjustments?.sparse_scraped;
    if (sparseWeights) {
      weights = { ...sparseWeights };
    } else {
      // Fallback: shift from scraped to market
      weights.scraped = 0.25;
      weights.market = 0.45;
    }
  }

  // Apply staleness decay to each weight
  const adjustedWeights = {};
  for (const [key, signal] of Object.entries(signals)) {
    const baseWeight = weights[key] || 0;
    const staleHours = signal?.staleHours || Infinity;
    adjustedWeights[key] = SignalCalculator.applyStalenesDecay(baseWeight, staleHours);
  }

  // Normalize weights
  const normalizedWeights = SignalCalculator.normalizeWeights(adjustedWeights);

  // Calculate weighted direction and confidence
  const weightedDirection = SignalCalculator.calculateWeightedDirection(signals, normalizedWeights);
  const confidence = SignalCalculator.calculateOverallConfidence(signals, normalizedWeights);
  const confidenceLevel = SignalCalculator.getConfidenceLevel(confidence);

  // Determine market state and data quality
  const marketState = determineMarketState(weightedDirection);
  const dataQuality = determineDataQuality(signals);

  // Generate explanation
  const explanation = generateExplanation(signals, marketState, dataQuality);

  // Calculate next update time (next 10 AM EST or 1 hour, whichever is sooner)
  const now = new Date();
  const nextUpdate = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour

  // Remove internal metadata from signals for API response
  const cleanSignals = {};
  for (const [key, signal] of Object.entries(signals)) {
    const { _meta, ...rest } = signal || {};
    cleanSignals[key] = rest;
  }

  return {
    marketState,
    confidence: Math.round(confidence * 100) / 100,
    confidenceLevel,
    direction: Math.round(weightedDirection * 100) / 100,
    signals: cleanSignals,
    explanation,
    urgency: null,
    dataQuality,
    nextUpdate: nextUpdate.toISOString(),
    _weights: normalizedWeights // For debugging, can be removed in production
  };
}

/**
 * Close database connection (for cleanup)
 */
async function closeConnection() {
  if (sequelize) {
    await sequelize.close();
    sequelize = null;
  }
}

module.exports = {
  // Main entry point
  computeMarketSnapshot,

  // Individual signal computers (for testing/debugging)
  computeScrapedSignal,
  computeAggregatorSignal,
  computeCommunitySignal,
  computeMarketSignal,

  // Helpers
  evaluateUrgency,
  determineMarketState,
  determineDataQuality,
  generateExplanation,

  // Cleanup
  closeConnection
};
