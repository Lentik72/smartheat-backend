// src/routes/analytics.js - Privacy-Compliant Analytics & Insights
// V1.4.0: Added coverage gap reporting (check /api/analytics/coverage-gaps)
const express = require('express');
const { body, validationResult, param } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

// In-memory storage for aggregated analytics (privacy-compliant)
let regionalConsumption = new Map(); // zipCode prefix -> aggregated data
let marketInsights = new Map(); // zipCode prefix -> insights
let anonymousUsagePatterns = []; // Anonymous consumption patterns

// V1.4.0: Coverage gap tracking
let coverageGapReports = new Map(); // ZIP -> { count, firstReported, lastReported, county }

// Validation middleware
const validateZipCode = [param('zipCode').matches(/^\d{5}$/).withMessage('Invalid ZIP code format')];
const validateConsumptionData = [
  body('zipCode').matches(/^\d{5}$/).withMessage('Invalid ZIP code format'),
  body('tankSize').isFloat({ min: 100, max: 2000 }).withMessage('Tank size must be 100-2000 gallons'),
  body('consumptionRate').isFloat({ min: 0.1, max: 20 }).withMessage('Consumption rate must be 0.1-20 gallons/day'),
  body('homeSize').optional().isInt({ min: 500, max: 10000 }).withMessage('Home size must be 500-10000 sq ft'),
  body('homeAge').optional().isInt({ min: 0, max: 200 }).withMessage('Home age must be 0-200 years'),
  body('heatingSystemType').optional().isIn(['boiler', 'furnace', 'radiant', 'other']),
  body('insulationLevel').optional().isIn(['poor', 'fair', 'good', 'excellent']),
  body('userConsent').equals('true').withMessage('Analytics consent required')
];

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

// POST /api/analytics/consumption - Submit anonymous consumption data
router.post('/consumption', validateConsumptionData, handleValidationErrors, (req, res) => {
  try {
    const {
      zipCode,
      tankSize,
      consumptionRate,
      homeSize,
      homeAge,
      heatingSystemType,
      insulationLevel,
      userConsent
    } = req.body;
    
    const logger = req.app.locals.logger;
    
    // Verify user consent
    if (userConsent !== 'true') {
      return res.status(403).json({
        error: 'Consent required',
        message: 'Analytics data submission requires user consent'
      });
    }
    
    // Use only ZIP code prefix for regional grouping (privacy-compliant)
    const zipPrefix = zipCode.substring(0, 3);
    
    // Create anonymous consumption record
    const consumptionRecord = {
      id: uuidv4(),
      zipPrefix,
      tankSize: Math.round(tankSize / 25) * 25, // Round to nearest 25 gallons for privacy
      consumptionRate: Math.round(consumptionRate * 10) / 10,
      homeSize: homeSize ? Math.round(homeSize / 100) * 100 : null, // Round to nearest 100 sq ft
      homeAge: homeAge ? Math.round(homeAge / 5) * 5 : null, // Round to nearest 5 years
      heatingSystemType,
      insulationLevel,
      submittedAt: new Date().toISOString(),
      // No personal identifiers stored
    };
    
    // Add to anonymous usage patterns
    anonymousUsagePatterns.push(consumptionRecord);
    
    // Keep only recent 1000 records for privacy
    if (anonymousUsagePatterns.length > 1000) {
      anonymousUsagePatterns = anonymousUsagePatterns.slice(-1000);
    }
    
    // Update regional aggregation
    updateRegionalAggregation(zipPrefix, consumptionRecord);
    
    logger.info(`📊 Anonymous consumption data received for region ${zipPrefix}`);
    
    res.json({
      success: true,
      message: 'Consumption data submitted successfully',
      anonymousId: consumptionRecord.id,
      regionalInsights: getBasicRegionalInsights(zipPrefix)
    });
    
  } catch (error) {
    req.app.locals.logger.error('Consumption data submission error:', error);
    res.status(500).json({
      error: 'Failed to submit consumption data',
      message: error.message
    });
  }
});

// GET /api/analytics/insights/:zipCode - Get market insights for region
router.get('/insights/:zipCode', [validateZipCode, handleValidationErrors], (req, res) => {
  try {
    const { zipCode } = req.params;
    const cache = req.app.locals.cache;
    const logger = req.app.locals.logger;
    const zipPrefix = zipCode.substring(0, 3);
    const cacheKey = `analytics_insights_${zipPrefix}`;
    
    const cached = cache.get(cacheKey);
    if (cached) {
      logger.info(`📦 Cache hit: analytics insights for ${zipPrefix}`);
      return res.json(cached);
    }
    
    // Generate regional insights
    const insights = generateRegionalInsights(zipPrefix);
    
    // Cache for 4 hours
    cache.set(cacheKey, insights, 14400);
    
    logger.info(`🧠 Generated analytics insights for region ${zipPrefix}`);
    res.json(insights);
    
  } catch (error) {
    req.app.locals.logger.error('Analytics insights error:', error);
    res.status(500).json({
      error: 'Failed to generate insights',
      message: error.message
    });
  }
});

// GET /api/analytics/benchmarks/:zipCode - Get consumption benchmarks
router.get('/benchmarks/:zipCode', [validateZipCode, handleValidationErrors], (req, res) => {
  try {
    const { zipCode } = req.params;
    const zipPrefix = zipCode.substring(0, 3);
    const cache = req.app.locals.cache;
    const logger = req.app.locals.logger;
    const cacheKey = `benchmarks_${zipPrefix}`;
    
    const cached = cache.get(cacheKey);
    if (cached) {
      logger.info(`📦 Cache hit: benchmarks for ${zipPrefix}`);
      return res.json(cached);
    }
    
    const benchmarks = generateConsumptionBenchmarks(zipPrefix);
    
    // Cache for 6 hours
    cache.set(cacheKey, benchmarks, 21600);
    
    res.json(benchmarks);
    
  } catch (error) {
    req.app.locals.logger.error('Benchmarks error:', error);
    res.status(500).json({
      error: 'Failed to generate benchmarks',
      message: error.message
    });
  }
});

// GET /api/analytics/efficiency-tips/:zipCode - Get personalized efficiency tips
router.get('/efficiency-tips/:zipCode', [validateZipCode, handleValidationErrors], (req, res) => {
  try {
    const { zipCode } = req.params;
    const zipPrefix = zipCode.substring(0, 3);
    
    const tips = generateEfficiencyTips(zipPrefix);
    
    res.json({
      zipCode: zipPrefix,
      tips,
      lastUpdated: new Date().toISOString()
    });
    
  } catch (error) {
    req.app.locals.logger.error('Efficiency tips error:', error);
    res.status(500).json({
      error: 'Failed to generate efficiency tips',
      message: error.message
    });
  }
});

// Helper functions
function updateRegionalAggregation(zipPrefix, record) {
  if (!regionalConsumption.has(zipPrefix)) {
    regionalConsumption.set(zipPrefix, {
      recordCount: 0,
      totalConsumption: 0,
      avgTankSize: 0,
      homeSizes: [],
      heatingSystemTypes: {},
      insulationLevels: {},
      lastUpdated: new Date().toISOString()
    });
  }
  
  const regional = regionalConsumption.get(zipPrefix);
  regional.recordCount++;
  regional.totalConsumption += record.consumptionRate;
  regional.avgTankSize = (regional.avgTankSize * (regional.recordCount - 1) + record.tankSize) / regional.recordCount;
  
  if (record.homeSize) {
    regional.homeSizes.push(record.homeSize);
  }
  
  if (record.heatingSystemType) {
    regional.heatingSystemTypes[record.heatingSystemType] = (regional.heatingSystemTypes[record.heatingSystemType] || 0) + 1;
  }
  
  if (record.insulationLevel) {
    regional.insulationLevels[record.insulationLevel] = (regional.insulationLevels[record.insulationLevel] || 0) + 1;
  }
  
  regional.lastUpdated = new Date().toISOString();
  regionalConsumption.set(zipPrefix, regional);
}

function getBasicRegionalInsights(zipPrefix) {
  const regional = regionalConsumption.get(zipPrefix);
  if (!regional || regional.recordCount < 3) {
    return {
      message: 'Insufficient regional data for insights',
      participantCount: regional?.recordCount || 0
    };
  }
  
  const avgConsumption = regional.totalConsumption / regional.recordCount;
  
  return {
    participantCount: regional.recordCount,
    averageConsumption: Math.round(avgConsumption * 10) / 10,
    averageTankSize: Math.round(regional.avgTankSize),
    commonHeatingSystem: getMostCommon(regional.heatingSystemTypes),
    commonInsulationLevel: getMostCommon(regional.insulationLevels)
  };
}

function generateRegionalInsights(zipPrefix) {
  const regional = regionalConsumption.get(zipPrefix);
  const patterns = analyzeUsagePatterns(zipPrefix);
  
  return {
    region: zipPrefix,
    dataAvailability: regional ? 'sufficient' : 'limited',
    insights: {
      consumption: generateConsumptionInsights(regional, zipPrefix),
      efficiency: generateEfficiencyInsights(regional, patterns),
      market: generateMarketInsights(zipPrefix),
      recommendations: generateRecommendations(regional, patterns)
    },
    benchmarks: generateConsumptionBenchmarks(zipPrefix),
    lastUpdated: new Date().toISOString()
  };
}

function generateConsumptionInsights(regional, zipPrefix) {
  if (!regional || regional.recordCount < 5) {
    return {
      message: 'Insufficient data for detailed consumption insights',
      participantCount: regional?.recordCount || 0
    };
  }
  
  const avgConsumption = regional.totalConsumption / regional.recordCount;
  const season = getCurrentSeason();
  
  return {
    averageDailyConsumption: Math.round(avgConsumption * 10) / 10,
    seasonalAdjustment: getSeasonalAdjustment(season),
    regionalComparison: getRegionalComparison(zipPrefix, avgConsumption),
    efficiencyRating: getEfficiencyRating(avgConsumption, regional.avgTankSize),
    trends: {
      direction: 'stable', // Would calculate from historical data
      confidence: regional.recordCount > 20 ? 'high' : 'moderate'
    }
  };
}

function generateEfficiencyInsights(regional, patterns) {
  const insights = [];
  
  if (regional && regional.recordCount >= 5) {
    const mostCommonSystem = getMostCommon(regional.heatingSystemTypes);
    const mostCommonInsulation = getMostCommon(regional.insulationLevels);
    
    insights.push({
      category: 'heating_system',
      insight: `Most common heating system in your area: ${mostCommonSystem}`,
      impact: 'medium'
    });
    
    insights.push({
      category: 'insulation',
      insight: `Most common insulation level: ${mostCommonInsulation}`,
      impact: mostCommonInsulation === 'poor' ? 'high' : 'medium'
    });
  }
  
  insights.push({
    category: 'seasonal',
    insight: `${getCurrentSeason()} heating patterns suggest ${getSeasonalRecommendation()}`,
    impact: 'medium'
  });
  
  return insights;
}

function generateMarketInsights(zipPrefix) {
  // Regional market insights based on ZIP prefix
  const regionName = getRegionName(zipPrefix);
  
  return {
    regionalMarket: regionName,
    priceVolatility: 'moderate', // Would calculate from market data
    supplyStatus: 'normal',
    demandLevel: getCurrentDemandLevel(),
    seasonalFactor: getSeasonalFactor(),
    competitiveLevel: getCompetitiveLevel(zipPrefix)
  };
}

function generateRecommendations(regional, patterns) {
  const recommendations = [];
  
  // Efficiency recommendations
  recommendations.push({
    type: 'efficiency',
    priority: 'high',
    title: 'Optimize Thermostat Settings',
    description: 'Lower thermostat by 1-2°F when away to save 5-10% on heating costs',
    estimatedSavings: '5-10%'
  });
  
  // Maintenance recommendations
  recommendations.push({
    type: 'maintenance',
    priority: 'medium',
    title: 'Schedule System Maintenance',
    description: 'Annual heating system maintenance can improve efficiency by 10-15%',
    estimatedSavings: '10-15%'
  });
  
  // Market timing recommendations
  recommendations.push({
    type: 'purchasing',
    priority: 'medium',
    title: 'Monitor Market Trends',
    description: 'Track oil prices and consider bulk purchases during price dips',
    estimatedSavings: 'Variable'
  });
  
  return recommendations;
}

function generateConsumptionBenchmarks(zipPrefix) {
  const regional = regionalConsumption.get(zipPrefix);
  
  // Default benchmarks if no regional data
  const defaultBenchmarks = {
    lowEfficiency: 8.0,
    average: 5.5,
    highEfficiency: 3.5,
    excellent: 2.5
  };
  
  if (!regional || regional.recordCount < 10) {
    return {
      region: zipPrefix,
      benchmarks: defaultBenchmarks,
      sampleSize: regional?.recordCount || 0,
      reliability: 'estimated'
    };
  }
  
  const avgConsumption = regional.totalConsumption / regional.recordCount;
  
  return {
    region: zipPrefix,
    benchmarks: {
      lowEfficiency: Math.round((avgConsumption * 1.4) * 10) / 10,
      average: Math.round(avgConsumption * 10) / 10,
      highEfficiency: Math.round((avgConsumption * 0.7) * 10) / 10,
      excellent: Math.round((avgConsumption * 0.5) * 10) / 10
    },
    sampleSize: regional.recordCount,
    reliability: regional.recordCount > 50 ? 'high' : 'moderate'
  };
}

function generateEfficiencyTips(zipPrefix) {
  const season = getCurrentSeason();
  const regionName = getRegionName(zipPrefix);
  
  const tips = [
    {
      category: 'thermostat',
      tip: 'Use a programmable thermostat to automatically lower temperature when away',
      impact: 'high',
      savings: '10-15%'
    },
    {
      category: 'insulation',
      tip: 'Check and seal air leaks around windows, doors, and other openings',
      impact: 'high',
      savings: '5-20%'
    },
    {
      category: 'maintenance',
      tip: 'Replace heating system filters regularly for optimal efficiency',
      impact: 'medium',
      savings: '5-10%'
    }
  ];
  
  // Add seasonal tips
  if (season === 'winter') {
    tips.push({
      category: 'seasonal',
      tip: 'Use ceiling fans on low speed to circulate warm air downward',
      impact: 'medium',
      savings: '3-8%'
    });
  }
  
  // Add regional tips
  if (regionName.includes('Northeast') || regionName.includes('Northern')) {
    tips.push({
      category: 'regional',
      tip: 'Consider upgrading insulation - cold climates benefit most from improved insulation',
      impact: 'high',
      savings: '15-30%'
    });
  }
  
  return tips;
}

// Utility functions
function analyzeUsagePatterns(zipPrefix) {
  const regionalData = anonymousUsagePatterns.filter(record => record.zipPrefix === zipPrefix);
  
  return {
    recordCount: regionalData.length,
    avgConsumption: regionalData.length ? regionalData.reduce((sum, r) => sum + r.consumptionRate, 0) / regionalData.length : 0,
    patterns: {
      peakSeason: 'winter',
      efficiency: 'varies'
    }
  };
}

function getMostCommon(obj) {
  if (!obj || Object.keys(obj).length === 0) return 'unknown';
  return Object.keys(obj).reduce((a, b) => obj[a] > obj[b] ? a : b);
}

function getCurrentSeason() {
  const month = new Date().getMonth() + 1;
  if (month >= 12 || month <= 2) return 'winter';
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  return 'fall';
}

function getSeasonalAdjustment(season) {
  switch (season) {
    case 'winter': return 1.3;
    case 'spring': return 0.8;
    case 'summer': return 0.3;
    case 'fall': return 1.1;
    default: return 1.0;
  }
}

function getSeasonalRecommendation() {
  const season = getCurrentSeason();
  switch (season) {
    case 'winter': return 'focus on heat retention and efficient usage';
    case 'spring': return 'good time for system maintenance and repairs';
    case 'summer': return 'ideal for system upgrades and insulation improvements';
    case 'fall': return 'prepare for heating season and stock up on fuel';
    default: return 'maintain regular efficiency practices';
  }
}

function getRegionalComparison(zipPrefix, consumption) {
  // Simplified regional comparison
  const nationalAvg = 5.5;
  if (consumption > nationalAvg * 1.2) return 'above_average';
  if (consumption < nationalAvg * 0.8) return 'below_average';
  return 'average';
}

function getEfficiencyRating(consumption, tankSize) {
  const normalizedConsumption = consumption / (tankSize / 275); // Normalize to 275-gallon tank
  if (normalizedConsumption < 3.0) return 'excellent';
  if (normalizedConsumption < 4.5) return 'good';
  if (normalizedConsumption < 6.0) return 'average';
  return 'needs_improvement';
}

function getRegionName(zipPrefix) {
  const regionMap = {
    '0': 'Northeast',
    '1': 'Mid-Atlantic', 
    '2': 'Southeast',
    '3': 'Deep South',
    '4': 'Great Lakes',
    '5': 'Upper Midwest',
    '6': 'Plains',
    '7': 'South Central',
    '8': 'Mountain',
    '9': 'Pacific'
  };
  return regionMap[zipPrefix[0]] || 'Unknown';
}

function getCurrentDemandLevel() {
  const month = new Date().getMonth() + 1;
  if (month >= 12 || month <= 2) return 'high';
  if (month >= 3 && month <= 4) return 'moderate';
  if (month >= 5 && month <= 9) return 'low';
  return 'moderate';
}

function getSeasonalFactor() {
  const season = getCurrentSeason();
  return season === 'winter' ? 1.2 : season === 'summer' ? 0.7 : 1.0;
}

function getCompetitiveLevel(zipPrefix) {
  // Urban areas typically have more competition
  const urbanPrefixes = ['0', '1', '9'];
  return urbanPrefixes.includes(zipPrefix[0]) ? 'high' : 'moderate';
}

// ============================================
// V1.4.0: Coverage Gap Reporting
// ============================================

// Import ZIP-to-county mapping
let getCountyForZip;
try {
  getCountyForZip = require('../data/zip-to-county').getCountyForZip;
} catch (e) {
  getCountyForZip = () => null;
}

/**
 * POST /api/analytics/coverage-gap
 * Report a coverage gap (no suppliers found for user's ZIP)
 * Tracked for admin review at GET /api/analytics/coverage-gaps
 */
router.post('/coverage-gap', [
  body('zipCode').matches(/^\d{5}$/).withMessage('Invalid ZIP code format'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { zipCode } = req.body;
    const logger = req.app.locals.logger;
    const county = getCountyForZip(zipCode) || 'Unknown';

    const existing = coverageGapReports.get(zipCode);

    if (existing) {
      existing.count++;
      existing.lastReported = new Date().toISOString();
    } else {
      coverageGapReports.set(zipCode, {
        count: 1,
        firstReported: new Date().toISOString(),
        lastReported: new Date().toISOString(),
        county
      });
    }

    logger?.info(`[CoverageGap] ZIP ${zipCode} (${county} County) - report #${coverageGapReports.get(zipCode).count}`);

    res.json({
      received: true,
      county,
      reportCount: coverageGapReports.get(zipCode).count
    });

  } catch (error) {
    req.app.locals.logger?.error('[CoverageGap] Error:', error.message);
    res.status(500).json({
      error: 'Failed to process coverage gap report',
      message: error.message
    });
  }
});

/**
 * GET /api/analytics/coverage-gaps
 * Admin endpoint: List all reported coverage gaps
 */
router.get('/coverage-gaps', (req, res) => {
  const gaps = [];
  coverageGapReports.forEach((data, zipCode) => {
    gaps.push({
      zipCode,
      county: data.county,
      reportCount: data.count,
      firstReported: data.firstReported,
      lastReported: data.lastReported
    });
  });

  // Sort by report count (most reported first)
  gaps.sort((a, b) => b.reportCount - a.reportCount);

  res.json({
    totalGaps: gaps.length,
    gaps
  });
});

module.exports = router;