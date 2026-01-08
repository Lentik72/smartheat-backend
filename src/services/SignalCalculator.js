/**
 * Signal Calculator Service
 * V2.1.0: Core utilities for computing market signals from various data sources
 *
 * Signal Structure:
 * {
 *   direction: -1 | 0 | 1,      // -1=falling, 0=stable, 1=rising
 *   strength: 0.0 - 1.0,        // Confidence in direction
 *   coverage: 'sparse' | 'adequate' | 'good',
 *   staleHours: number,         // Hours since freshest data point
 *   scope: string               // 'zip' | 'radius_20mi' | 'radius_30mi' | 'state' | 'national'
 * }
 */

const fs = require('fs');
const path = require('path');

// Load configurable thresholds
let signalConfig = null;

function loadSignalConfig() {
  if (signalConfig) return signalConfig;

  const configPath = path.join(__dirname, '../../config/signal-weights.json');
  try {
    if (fs.existsSync(configPath)) {
      signalConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return signalConfig;
    }
  } catch (error) {
    console.warn('⚠️  Failed to load signal-weights.json:', error.message);
  }

  // Fallback defaults
  signalConfig = {
    thresholds: {
      direction: { rising: 2.0, falling: -2.0 },
      coverage: { good: 10, adequate: 5, sparse: 0 },
      confidence: { high: 0.70, medium: 0.40, low: 0.0 }
    },
    staleness_decay: { rate_per_24h: 0.10, minimum_weight: 0.30 },
    aggregator_caps: { max_strength: 0.60, max_weight: 0.15 }
  };
  return signalConfig;
}

/**
 * Create an empty/null signal for when no data is available
 * @param {string} scope - The scope of the signal
 * @returns {object} Empty signal structure
 */
function createEmptySignal(scope = 'unknown') {
  return {
    direction: 0,
    strength: 0,
    coverage: 'sparse',
    staleHours: Infinity,
    scope,
    dataPoints: 0
  };
}

/**
 * Calculate direction from week-over-week price change
 * @param {number} percentChange - Week-over-week percentage change
 * @returns {number} Direction: -1 (falling), 0 (stable), 1 (rising)
 */
function calculateDirection(percentChange) {
  const config = loadSignalConfig();
  const thresholds = config.thresholds.direction;

  if (percentChange >= thresholds.rising) return 1;
  if (percentChange <= thresholds.falling) return -1;
  return 0;
}

/**
 * Determine coverage level from data point count
 * @param {number} dataPoints - Number of data points
 * @returns {string} Coverage: 'sparse' | 'adequate' | 'good'
 */
function determineCoverage(dataPoints) {
  const config = loadSignalConfig();
  const thresholds = config.thresholds.coverage;

  if (dataPoints >= thresholds.good) return 'good';
  if (dataPoints >= thresholds.adequate) return 'adequate';
  return 'sparse';
}

/**
 * Calculate staleness in hours from most recent data point
 * @param {Date|string} mostRecentTimestamp - Timestamp of freshest data point
 * @returns {number} Hours since data point (0 if null)
 */
function calculateStaleHours(mostRecentTimestamp) {
  if (!mostRecentTimestamp) return Infinity;

  const now = new Date();
  const dataTime = new Date(mostRecentTimestamp);
  const diffMs = now - dataTime;

  return Math.max(0, diffMs / (1000 * 60 * 60));
}

/**
 * Calculate strength based on data quality factors
 * @param {object} params - Parameters for strength calculation
 * @param {number} params.dataPoints - Number of data points
 * @param {number} params.staleHours - Hours since freshest data
 * @param {number} params.consistency - Agreement between data points (0-1)
 * @param {boolean} params.isAggregator - Whether this is an aggregator signal
 * @returns {number} Strength: 0.0 - 1.0
 */
function calculateStrength({ dataPoints, staleHours, consistency = 1.0, isAggregator = false }) {
  const config = loadSignalConfig();

  // Base strength from data point count
  let baseStrength = 0;
  if (dataPoints >= 20) baseStrength = 1.0;
  else if (dataPoints >= 10) baseStrength = 0.8;
  else if (dataPoints >= 5) baseStrength = 0.6;
  else if (dataPoints >= 2) baseStrength = 0.4;
  else if (dataPoints >= 1) baseStrength = 0.2;

  // Apply staleness decay
  const decayRate = config.staleness_decay.rate_per_24h;
  const minWeight = config.staleness_decay.minimum_weight;
  const decayMultiplier = Math.max(minWeight, 1 - (staleHours / 24) * decayRate);

  // Apply consistency factor (how much data points agree)
  let strength = baseStrength * decayMultiplier * consistency;

  // Cap aggregator strength
  if (isAggregator) {
    const maxStrength = config.aggregator_caps.max_strength;
    strength = Math.min(strength, maxStrength);
  }

  return Math.round(strength * 100) / 100;
}

/**
 * Calculate week-over-week price change percentage
 * @param {Array} prices - Array of price objects with scrapedAt and pricePerGallon
 * @returns {object} { percentChange, currentAvg, priorAvg, dataPoints }
 */
function calculateWeekOverWeekChange(prices) {
  if (!prices || prices.length === 0) {
    return { percentChange: 0, currentAvg: null, priorAvg: null, dataPoints: 0 };
  }

  const now = new Date();
  const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now - 14 * 24 * 60 * 60 * 1000);

  // Split prices into current week and prior week
  const currentWeekPrices = prices.filter(p => {
    const date = new Date(p.scrapedAt || p.scraped_at);
    return date >= oneWeekAgo;
  });

  const priorWeekPrices = prices.filter(p => {
    const date = new Date(p.scrapedAt || p.scraped_at);
    return date >= twoWeeksAgo && date < oneWeekAgo;
  });

  // Calculate averages
  const avgPrice = arr => {
    if (arr.length === 0) return null;
    const sum = arr.reduce((acc, p) => acc + parseFloat(p.pricePerGallon || p.price_per_gallon), 0);
    return sum / arr.length;
  };

  const currentAvg = avgPrice(currentWeekPrices);
  const priorAvg = avgPrice(priorWeekPrices);

  // Calculate percentage change
  let percentChange = 0;
  if (currentAvg && priorAvg && priorAvg > 0) {
    percentChange = ((currentAvg - priorAvg) / priorAvg) * 100;
  }

  return {
    percentChange: Math.round(percentChange * 100) / 100,
    currentAvg: currentAvg ? Math.round(currentAvg * 1000) / 1000 : null,
    priorAvg: priorAvg ? Math.round(priorAvg * 1000) / 1000 : null,
    dataPoints: currentWeekPrices.length + priorWeekPrices.length,
    currentWeekCount: currentWeekPrices.length,
    priorWeekCount: priorWeekPrices.length
  };
}

/**
 * Calculate price consistency (how much prices agree with each other)
 * @param {Array} prices - Array of price values
 * @returns {number} Consistency: 0.0 - 1.0 (1.0 = all prices identical)
 */
function calculateConsistency(prices) {
  if (!prices || prices.length < 2) return 1.0;

  const values = prices.map(p => parseFloat(p.pricePerGallon || p.price_per_gallon || p));
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);

  // Convert std dev to consistency (lower std dev = higher consistency)
  // Assume $0.20 std dev = low consistency (0.2), $0 std dev = perfect consistency (1.0)
  const consistency = Math.max(0, 1 - (stdDev / 0.20));

  return Math.round(consistency * 100) / 100;
}

/**
 * Build a complete signal from price data
 * @param {Array} prices - Array of price records
 * @param {string} scope - The scope of this signal
 * @param {object} options - Additional options
 * @param {boolean} options.isAggregator - Whether this is an aggregator signal
 * @returns {object} Complete signal structure
 */
function buildSignal(prices, scope, options = {}) {
  const { isAggregator = false } = options;

  if (!prices || prices.length === 0) {
    return createEmptySignal(scope);
  }

  // Calculate week-over-week change
  const wowChange = calculateWeekOverWeekChange(prices);

  // Find most recent data point
  const sortedPrices = [...prices].sort((a, b) => {
    const dateA = new Date(a.scrapedAt || a.scraped_at);
    const dateB = new Date(b.scrapedAt || b.scraped_at);
    return dateB - dateA;
  });
  const mostRecent = sortedPrices[0];
  const staleHours = calculateStaleHours(mostRecent.scrapedAt || mostRecent.scraped_at);

  // Calculate consistency
  const consistency = calculateConsistency(prices);

  // Build the signal
  const direction = calculateDirection(wowChange.percentChange);
  const coverage = determineCoverage(prices.length);
  const strength = calculateStrength({
    dataPoints: prices.length,
    staleHours,
    consistency,
    isAggregator
  });

  return {
    direction,
    strength,
    coverage,
    staleHours: Math.round(staleHours * 10) / 10,
    scope,
    dataPoints: prices.length,
    // Additional metadata for debugging
    _meta: {
      percentChange: wowChange.percentChange,
      currentAvg: wowChange.currentAvg,
      priorAvg: wowChange.priorAvg,
      consistency
    }
  };
}

/**
 * Determine confidence level from continuous confidence value
 * @param {number} confidence - Confidence value 0.0 - 1.0
 * @returns {string} Confidence level: 'high' | 'medium' | 'low'
 */
function getConfidenceLevel(confidence) {
  const config = loadSignalConfig();
  const thresholds = config.thresholds.confidence;

  if (confidence >= thresholds.high) return 'high';
  if (confidence >= thresholds.medium) return 'medium';
  return 'low';
}

/**
 * Apply staleness decay to a weight
 * @param {number} weight - Base weight
 * @param {number} staleHours - Hours since data was fresh
 * @returns {number} Decayed weight
 */
function applyStalenesDecay(weight, staleHours) {
  const config = loadSignalConfig();
  const decayRate = config.staleness_decay.rate_per_24h;
  const minWeight = config.staleness_decay.minimum_weight;

  const decayMultiplier = Math.max(minWeight, 1 - (staleHours / 24) * decayRate);
  return weight * decayMultiplier;
}

/**
 * Normalize weights to sum to 1.0
 * @param {object} weights - Object with signal weights
 * @returns {object} Normalized weights
 */
function normalizeWeights(weights) {
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  if (sum === 0) return weights;

  const normalized = {};
  for (const [key, value] of Object.entries(weights)) {
    normalized[key] = Math.round((value / sum) * 1000) / 1000;
  }
  return normalized;
}

/**
 * Calculate weighted direction from multiple signals
 * @param {object} signals - Object with signal keys and signal values
 * @param {object} weights - Object with signal keys and weight values
 * @returns {number} Weighted direction: -1.0 to 1.0
 */
function calculateWeightedDirection(signals, weights) {
  let totalWeight = 0;
  let weightedSum = 0;

  for (const [key, signal] of Object.entries(signals)) {
    if (!signal || typeof signal.direction === 'undefined') continue;

    const weight = weights[key] || 0;
    const effectiveWeight = weight * signal.strength;

    weightedSum += signal.direction * effectiveWeight;
    totalWeight += effectiveWeight;
  }

  if (totalWeight === 0) return 0;
  return Math.round((weightedSum / totalWeight) * 100) / 100;
}

/**
 * Calculate overall confidence from multiple signals
 * @param {object} signals - Object with signal keys and signal values
 * @param {object} weights - Object with signal keys and weight values
 * @returns {number} Overall confidence: 0.0 to 1.0
 */
function calculateOverallConfidence(signals, weights) {
  let totalWeight = 0;
  let weightedStrength = 0;

  for (const [key, signal] of Object.entries(signals)) {
    if (!signal || typeof signal.strength === 'undefined') continue;

    const weight = weights[key] || 0;
    weightedStrength += signal.strength * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) return 0;
  return Math.round((weightedStrength / totalWeight) * 100) / 100;
}

// Reload config (for testing or after config changes)
function reloadConfig() {
  signalConfig = null;
  return loadSignalConfig();
}

module.exports = {
  // Core signal building
  createEmptySignal,
  buildSignal,
  calculateWeekOverWeekChange,

  // Direction and coverage
  calculateDirection,
  determineCoverage,
  calculateStaleHours,
  calculateStrength,
  calculateConsistency,

  // Aggregation utilities
  calculateWeightedDirection,
  calculateOverallConfidence,
  getConfidenceLevel,

  // Weight management
  applyStalenesDecay,
  normalizeWeights,

  // Config
  loadSignalConfig,
  reloadConfig
};
