// src/routes/market.js - Enhanced Market Intelligence API
const express = require('express');
const { param, query, validationResult } = require('express-validator');
const router = express.Router();

// Validation middleware
const validateZipCode = param('zipCode').matches(/^\d{5}$/).withMessage('Invalid ZIP code format');

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

// Oil price data fetching helper
const fetchOilPriceData = async (logger) => {
  const fetch = (await import('node-fetch')).default;
  const API_KEYS = {
    FRED: process.env.FRED_API_KEY,
    ALPHA_VANTAGE: process.env.ALPHA_VANTAGE_API_KEY
  };
  
  // Try FRED API first (most reliable)
  if (API_KEYS.FRED) {
    try {
      logger.info('🛢️ Fetching oil prices from FRED API');
      const fredResponse = await fetch(
        `https://api.stlouisfed.org/fred/series/observations?series_id=DCOILWTICO&api_key=${API_KEYS.FRED}&file_type=json&limit=30&sort_order=desc`,
        { timeout: 8000 }
      );
      
      if (fredResponse.ok) {
        const fredData = await fredResponse.json();
        const validObservations = fredData.observations.filter(obs => obs.value !== '.');
        
        if (validObservations.length > 0) {
          const latestPrice = parseFloat(validObservations[0].value);
          const previousPrice = validObservations.length > 1 ? parseFloat(validObservations[1].value) : latestPrice;
          
          return {
            source: 'FRED',
            wtiCrude: latestPrice,
            brentCrude: latestPrice + 3.0 + (Math.random() * 2 - 1), // Approximate spread
            heatingOilWholesale: latestPrice * 0.045 + (Math.random() * 0.02 - 0.01),
            heatingOilRetail: latestPrice * 0.045 * 1.15 + (Math.random() * 0.05 - 0.025),
            naturalGas: 2.5 + (Math.random() * 1.0 - 0.5), // $/MCF
            change24h: latestPrice - previousPrice,
            changePercent24h: ((latestPrice - previousPrice) / previousPrice) * 100,
            lastUpdated: new Date().toISOString(),
            dataSource: 'Federal Reserve Economic Data',
            reliability: 'high'
          };
        }
      }
    } catch (error) {
      logger.warn('FRED API failed:', error.message);
    }
  }
  
  // Fallback to Alpha Vantage
  if (API_KEYS.ALPHA_VANTAGE) {
    try {
      logger.info('🛢️ Fetching oil prices from Alpha Vantage API');
      const alphaResponse = await fetch(
        `https://www.alphavantage.co/query?function=WTI&interval=daily&apikey=${API_KEYS.ALPHA_VANTAGE}`,
        { timeout: 8000 }
      );
      
      if (alphaResponse.ok) {
        const alphaData = await alphaResponse.json();
        
        if (alphaData.data && alphaData.data.length > 1) {
          const latestPrice = parseFloat(alphaData.data[0].value);
          const previousPrice = parseFloat(alphaData.data[1].value);
          
          return {
            source: 'AlphaVantage',
            wtiCrude: latestPrice,
            brentCrude: latestPrice + 3.0,
            heatingOilWholesale: latestPrice * 0.045,
            heatingOilRetail: latestPrice * 0.045 * 1.15,
            naturalGas: 2.5 + (Math.random() * 1.0 - 0.5),
            change24h: latestPrice - previousPrice,
            changePercent24h: ((latestPrice - previousPrice) / previousPrice) * 100,
            lastUpdated: new Date().toISOString(),
            dataSource: 'Alpha Vantage API',
            reliability: 'medium'
          };
        }
      }
    } catch (error) {
      logger.warn('Alpha Vantage API failed:', error.message);
    }
  }
  
  // Final fallback - realistic mock data
  logger.warn('All market APIs failed, using estimated data');
  const baseWTI = 75.0 + (Math.random() * 15 - 7.5); // $67.50-$82.50 range
  const dailyChange = (Math.random() * 6 - 3); // ±$3 daily change
  
  return {
    source: 'Estimated',
    wtiCrude: baseWTI,
    brentCrude: baseWTI + 2.5 + (Math.random() * 2 - 1),
    heatingOilWholesale: baseWTI * 0.045 + (Math.random() * 0.1 - 0.05),
    heatingOilRetail: baseWTI * 0.045 * 1.15 + (Math.random() * 0.15 - 0.075),
    naturalGas: 2.5 + (Math.random() * 1.5 - 0.75),
    change24h: dailyChange,
    changePercent24h: (dailyChange / baseWTI) * 100,
    lastUpdated: new Date().toISOString(),
    dataSource: 'Market Estimation (APIs Unavailable)',
    reliability: 'low'
  };
};

// GET /api/market/pulse - Market Pulse (live supplier stats for website)
router.get('/pulse', async (req, res) => {
  try {
    const cache = req.app.locals.cache;
    const logger = req.app.locals.logger;
    const sequelize = req.app.locals.sequelize;
    const cacheKey = 'market_pulse';

    // Check cache (1 hour TTL)
    const cached = cache.get(cacheKey);
    if (cached) {
      logger.info('📦 Cache hit: market pulse');
      return res.json(cached);
    }

    // Query live stats from database - V2.17.0: Filter by allow_price_display
    const [stats] = await sequelize.query(`
      SELECT
        (SELECT COUNT(*) FROM suppliers WHERE active = true) as supplier_count,
        (SELECT COUNT(DISTINCT state) FROM suppliers WHERE active = true) as state_count,
        MIN(sp.price_per_gallon) as price_min,
        MAX(sp.price_per_gallon) as price_max,
        AVG(sp.price_per_gallon) as price_avg
      FROM supplier_prices sp
      JOIN suppliers s ON sp.supplier_id = s.id
      WHERE s.active = true
        AND s.allow_price_display = true
        AND sp.scraped_at > NOW() - INTERVAL '14 days'
        AND sp.price_per_gallon BETWEEN 2.00 AND 6.00
    `);

    const row = stats[0] || {};

    const pulseData = {
      supplierCount: parseInt(row.supplier_count) || 0,
      stateCount: parseInt(row.state_count) || 0,
      priceMin: row.price_min ? parseFloat(row.price_min).toFixed(2) : null,
      priceMax: row.price_max ? parseFloat(row.price_max).toFixed(2) : null,
      priceAvg: row.price_avg ? parseFloat(row.price_avg).toFixed(2) : null,
      lastUpdated: new Date().toISOString()
    };

    // Cache for 1 hour
    cache.set(cacheKey, pulseData, 3600);

    logger.info(`📊 Market Pulse: ${pulseData.supplierCount} suppliers, ${pulseData.stateCount} states`);
    res.json(pulseData);

  } catch (error) {
    req.app.locals.logger.error('Market pulse error:', error);
    res.status(500).json({
      error: 'Failed to fetch market pulse',
      message: error.message
    });
  }
});

// GET /api/market/leaderboard - Live state averages and top deals for prices.html
// V2.17.0: Real-time leaderboard data so prices.html always shows current prices
router.get('/leaderboard', async (req, res) => {
  try {
    const cache = req.app.locals.cache;
    const logger = req.app.locals.logger;
    const sequelize = req.app.locals.sequelize;
    const cacheKey = 'market_leaderboard';

    // Check cache (30 min TTL - more frequent updates for leaderboard)
    const cached = cache.get(cacheKey);
    if (cached) {
      logger.info('📦 Cache hit: market leaderboard');
      return res.json(cached);
    }

    // State averages - group by state, filter displayable prices
    const [stateStats] = await sequelize.query(`
      SELECT
        s.state,
        COUNT(DISTINCT s.id) as supplier_count,
        ROUND(AVG(sp.price_per_gallon)::numeric, 2) as avg_price,
        ROUND(MIN(sp.price_per_gallon)::numeric, 2) as min_price,
        ROUND(MAX(sp.price_per_gallon)::numeric, 2) as max_price
      FROM suppliers s
      JOIN supplier_prices sp ON s.id = sp.supplier_id
      WHERE s.active = true
        AND s.allow_price_display = true
        AND sp.is_valid = true
        AND sp.expires_at > NOW()
        AND sp.price_per_gallon BETWEEN 2.00 AND 6.00
        AND sp.scraped_at = (
          SELECT MAX(sp2.scraped_at)
          FROM supplier_prices sp2
          WHERE sp2.supplier_id = s.id
            AND sp2.is_valid = true
            AND sp2.expires_at > NOW()
        )
      GROUP BY s.state
      HAVING COUNT(DISTINCT s.id) >= 3
      ORDER BY avg_price ASC
    `);

    // State name mapping
    const STATE_NAMES = {
      'NY': 'New York', 'CT': 'Connecticut', 'MA': 'Massachusetts',
      'NJ': 'New Jersey', 'PA': 'Pennsylvania', 'RI': 'Rhode Island',
      'NH': 'New Hampshire', 'ME': 'Maine', 'MD': 'Maryland',
      'VA': 'Virginia', 'DE': 'Delaware', 'AK': 'Alaska', 'OH': 'Ohio'
    };

    const stateAverages = stateStats.map(s => ({
      state: s.state,
      stateName: STATE_NAMES[s.state] || s.state,
      avgPrice: parseFloat(s.avg_price),
      minPrice: parseFloat(s.min_price),
      maxPrice: parseFloat(s.max_price),
      supplierCount: parseInt(s.supplier_count)
    }));

    // Top 5 deals - lowest priced suppliers with valid displayable prices
    const [topDeals] = await sequelize.query(`
      SELECT DISTINCT ON (s.id)
        s.name as supplier_name,
        s.city,
        s.state,
        s.slug,
        sp.price_per_gallon as price
      FROM suppliers s
      JOIN supplier_prices sp ON s.id = sp.supplier_id
      WHERE s.active = true
        AND s.allow_price_display = true
        AND sp.is_valid = true
        AND sp.expires_at > NOW()
        AND sp.price_per_gallon BETWEEN 2.00 AND 6.00
      ORDER BY s.id, sp.scraped_at DESC
    `);

    // Sort by price and take top 5
    const sortedDeals = topDeals
      .sort((a, b) => parseFloat(a.price) - parseFloat(b.price))
      .slice(0, 5)
      .map(d => ({
        supplierName: d.supplier_name,
        city: d.city,
        state: d.state,
        slug: d.slug,
        price: parseFloat(d.price).toFixed(2)
      }));

    const leaderboardData = {
      stateAverages,
      topDeals: sortedDeals,
      lastUpdated: new Date().toISOString(),
      generatedAt: new Date().toLocaleString('en-US', {
        timeZone: 'America/New_York',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      })
    };

    // Cache for 30 minutes
    cache.set(cacheKey, leaderboardData, 1800);

    logger.info(`📊 Market Leaderboard: ${stateAverages.length} states, ${sortedDeals.length} top deals`);
    res.json(leaderboardData);

  } catch (error) {
    req.app.locals.logger.error('Market leaderboard error:', error);
    res.status(500).json({
      error: 'Failed to fetch market leaderboard',
      message: error.message
    });
  }
});

// GET /api/market/oil-prices - Enhanced oil price data
router.get('/oil-prices', async (req, res) => {
  try {
    const cache = req.app.locals.cache;
    const logger = req.app.locals.logger;
    const cacheKey = 'enhanced_oil_prices';
    
    const cached = cache.get(cacheKey);
    if (cached) {
      logger.info('📦 Cache hit: enhanced oil prices');
      return res.json(cached);
    }
    
    const oilData = await fetchOilPriceData(logger);
    
    // Add market context and trends
    const enhancedData = {
      ...oilData,
      marketContext: {
        volatility: Math.abs(oilData.changePercent24h) > 3 ? 'high' : 'moderate',
        trend: oilData.change24h > 1 ? 'bullish' : oilData.change24h < -1 ? 'bearish' : 'stable',
        recommendation: oilData.change24h < -2 ? 'consider_buying' : oilData.change24h > 2 ? 'monitor_closely' : 'normal_conditions'
      },
      regionalFactors: {
        winterPremium: isWinterSeason() ? 1.05 : 1.0,
        supplyStatus: 'normal', // Would integrate with EIA inventory data
        demandLevel: getCurrentDemandLevel()
      },
      forecast: {
        nextWeek: 'stable_to_slightly_higher',
        confidence: oilData.reliability === 'high' ? 0.75 : 0.60,
        factors: ['seasonal_demand', 'inventory_levels', 'geopolitical_events']
      }
    };
    
    // Cache for 30 minutes (oil prices change frequently)
    cache.set(cacheKey, enhancedData, 1800);
    
    res.json(enhancedData);
    
  } catch (error) {
    req.app.locals.logger.error('Enhanced oil prices error:', error);
    res.status(500).json({
      error: 'Failed to fetch oil price data',
      message: error.message
    });
  }
});

// GET /api/market/regional-pricing/:zipCode - Smart regional pricing
router.get('/regional-pricing/:zipCode', [validateZipCode, handleValidationErrors], async (req, res) => {
  try {
    const { zipCode } = req.params;
    const cache = req.app.locals.cache;
    const logger = req.app.locals.logger;
    const cacheKey = `enhanced_regional_pricing_${zipCode}`;
    
    const cached = cache.get(cacheKey);
    if (cached) {
      logger.info(`📦 Cache hit: enhanced regional pricing for ${zipCode}`);
      return res.json(cached);
    }
    
    // Get base oil prices
    const oilData = await fetchOilPriceData(logger);
    
    // Regional pricing calculations
    const regionalData = calculateRegionalPricing(zipCode, oilData);
    
    // Add market intelligence
    const enhancedRegionalData = {
      ...regionalData,
      marketIntelligence: {
        priceHistory: generatePriceHistory(regionalData.retailPrice),
        seasonalTrends: getSeasonalTrends(zipCode),
        competitiveAnalysis: {
          avgMarketPrice: regionalData.retailPrice,
          priceRange: {
            budget: regionalData.retailPrice * 0.92,
            premium: regionalData.retailPrice * 1.08
          },
          recommendation: getPurchaseRecommendation(oilData, regionalData)
        }
      },
      suppliers: {
        estimatedCount: getEstimatedSupplierCount(zipCode),
        competitionLevel: getCompetitionLevel(zipCode),
        serviceQuality: 'varies' // Would integrate with community data
      }
    };
    
    // Cache for 1 hour
    cache.set(cacheKey, enhancedRegionalData, 3600);
    
    logger.info(`💰 Regional pricing calculated for ${zipCode}: $${enhancedRegionalData.retailPrice.toFixed(2)}/gal`);
    res.json(enhancedRegionalData);
    
  } catch (error) {
    req.app.locals.logger.error('Regional pricing error:', error);
    res.status(500).json({
      error: 'Failed to calculate regional pricing',
      message: error.message
    });
  }
});

// GET /api/market/trends - Market trends and analysis
router.get('/trends', [
  query('period').optional().isIn(['7d', '30d', '90d', '1y']).withMessage('Invalid period'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    const cache = req.app.locals.cache;
    const logger = req.app.locals.logger;
    const cacheKey = `market_trends_${period}`;
    
    const cached = cache.get(cacheKey);
    if (cached) {
      logger.info(`📦 Cache hit: market trends for ${period}`);
      return res.json(cached);
    }
    
    const oilData = await fetchOilPriceData(logger);
    
    const trendsData = {
      period,
      currentPrice: oilData.heatingOilRetail,
      trends: {
        price: {
          direction: oilData.change24h > 0 ? 'up' : 'down',
          magnitude: Math.abs(oilData.changePercent24h),
          confidence: oilData.reliability === 'high' ? 0.85 : 0.65
        },
        volatility: {
          level: Math.abs(oilData.changePercent24h) > 3 ? 'high' : 'moderate',
          trend: 'stable' // Would calculate from historical data
        },
        demand: {
          seasonal: isWinterSeason() ? 'high' : 'moderate',
          regional: 'varies',
          forecast: 'stable'
        }
      },
      insights: [
        {
          type: 'price_movement',
          message: `Oil prices ${oilData.change24h > 0 ? 'increased' : 'decreased'} by ${Math.abs(oilData.changePercent24h).toFixed(1)}% today`,
          impact: Math.abs(oilData.changePercent24h) > 3 ? 'high' : 'moderate'
        },
        {
          type: 'seasonal',
          message: isWinterSeason() ? 'Winter heating season - expect higher demand' : 'Off-season - typically lower prices',
          impact: 'moderate'
        },
        {
          type: 'market_conditions',
          message: getMarketConditionsMessage(oilData),
          impact: 'low'
        }
      ],
      recommendations: [
        getPurchaseTimingRecommendation(oilData),
        getQuantityRecommendation(oilData),
        getMonitoringRecommendation(oilData)
      ],
      lastUpdated: new Date().toISOString()
    };
    
    // Cache for 2 hours
    cache.set(cacheKey, trendsData, 7200);
    
    res.json(trendsData);
    
  } catch (error) {
    req.app.locals.logger.error('Market trends error:', error);
    res.status(500).json({
      error: 'Failed to fetch market trends',
      message: error.message
    });
  }
});

// Helper functions
function calculateRegionalPricing(zipCode, oilData) {
  const firstDigit = parseInt(zipCode[0]);
  let regionalMultiplier = 1.0;
  let stateName = 'Unknown';
  let transportCost = 0.05;
  
  // Regional multipliers based on ZIP code (approximate)
  switch (firstDigit) {
    case 0: // Northeast (CT, MA, ME, NH, RI, VT)
      regionalMultiplier = 1.15;
      stateName = 'Northeast';
      transportCost = 0.08;
      break;
    case 1: // NY, PA, DE
      regionalMultiplier = 1.12;
      stateName = 'Mid-Atlantic';
      transportCost = 0.07;
      break;
    case 2: // DC, MD, NC, SC, VA, WV
      regionalMultiplier = 0.95;
      stateName = 'Southeast';
      transportCost = 0.04;
      break;
    case 3: // AL, FL, GA, MS, TN
      regionalMultiplier = 0.90;
      stateName = 'Deep South';
      transportCost = 0.03;
      break;
    case 4: // IN, KY, MI, OH
      regionalMultiplier = 1.05;
      stateName = 'Great Lakes';
      transportCost = 0.06;
      break;
    case 5: // IA, MN, MT, ND, SD, WI
      regionalMultiplier = 1.08;
      stateName = 'Upper Midwest';
      transportCost = 0.07;
      break;
    case 6: // IL, KS, MO, NE
      regionalMultiplier = 0.93;
      stateName = 'Plains';
      transportCost = 0.05;
      break;
    case 7: // AR, LA, OK, TX
      regionalMultiplier = 0.88;
      stateName = 'South Central';
      transportCost = 0.03;
      break;
    case 8: // AZ, CO, ID, NM, NV, UT, WY
      regionalMultiplier = 1.02;
      stateName = 'Mountain';
      transportCost = 0.06;
      break;
    case 9: // AK, CA, HI, OR, WA
      regionalMultiplier = 1.10;
      stateName = 'Pacific';
      transportCost = 0.09;
      break;
  }
  
  // Add seasonal adjustment
  const seasonalMultiplier = isWinterSeason() ? 1.03 : 0.98;
  
  const retailPrice = oilData.heatingOilRetail * regionalMultiplier * seasonalMultiplier;
  
  return {
    zipCode,
    region: stateName,
    wholesalePrice: oilData.heatingOilWholesale,
    retailPrice,
    regionalMultiplier,
    seasonalMultiplier,
    transportCost,
    taxes: retailPrice * 0.08, // Estimated
    margins: retailPrice * 0.12, // Estimated dealer margin
    priceBreakdown: {
      commodity: oilData.heatingOilWholesale,
      transport: transportCost,
      taxes: retailPrice * 0.08,
      margin: retailPrice * 0.12,
      total: retailPrice
    },
    priceRange: {
      low: retailPrice * 0.93,
      average: retailPrice,
      high: retailPrice * 1.07
    },
    lastUpdated: new Date().toISOString()
  };
}

function isWinterSeason() {
  const month = new Date().getMonth() + 1; // 1-12
  return month >= 11 || month <= 3; // Nov-Mar
}

function getCurrentDemandLevel() {
  const month = new Date().getMonth() + 1;
  if (month >= 12 || month <= 2) return 'high';
  if (month >= 3 && month <= 4) return 'moderate';
  if (month >= 5 && month <= 9) return 'low';
  return 'moderate'; // Oct-Nov
}

function generatePriceHistory(currentPrice) {
  const history = [];
  for (let i = 30; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const variation = (Math.random() - 0.5) * 0.2; // ±10% variation
    history.push({
      date: date.toISOString().split('T')[0],
      price: Math.max(currentPrice * (1 + variation), 1.0)
    });
  }
  return history;
}

function getSeasonalTrends(zipCode) {
  const region = parseInt(zipCode[0]);
  const isNorthern = region <= 2 || region >= 8;
  
  return {
    winterPeak: isNorthern ? 'December-February' : 'January-February',
    summerLow: 'June-August',
    shoulderSeasons: ['March-April', 'September-November'],
    averageWinterPremium: isNorthern ? 0.15 : 0.08
  };
}

function getEstimatedSupplierCount(zipCode) {
  const firstDigit = parseInt(zipCode[0]);
  // Urban vs rural estimation
  if ([0, 1, 9].includes(firstDigit)) return '15-25'; // Urban areas
  if ([2, 4, 8].includes(firstDigit)) return '10-20';
  return '5-15'; // Rural areas
}

function getCompetitionLevel(zipCode) {
  const firstDigit = parseInt(zipCode[0]);
  if ([0, 1, 9].includes(firstDigit)) return 'high';
  if ([2, 4, 8].includes(firstDigit)) return 'moderate';
  return 'low';
}

function getPurchaseRecommendation(oilData, regionalData) {
  if (oilData.changePercent24h < -3) return 'favorable_buying_opportunity';
  if (oilData.changePercent24h > 3) return 'consider_waiting';
  if (isWinterSeason()) return 'normal_seasonal_purchase';
  return 'good_time_to_buy';
}

function getMarketConditionsMessage(oilData) {
  if (Math.abs(oilData.changePercent24h) > 5) return 'High volatility detected - monitor closely';
  if (oilData.changePercent24h > 2) return 'Upward price pressure - consider timing purchases';
  if (oilData.changePercent24h < -2) return 'Favorable price movement - good buying opportunity';
  return 'Stable market conditions';
}

function getPurchaseTimingRecommendation(oilData) {
  return {
    timing: oilData.change24h < -1 ? 'buy_now' : oilData.change24h > 2 ? 'wait' : 'normal',
    reasoning: oilData.change24h < -1 ? 'Prices dropped significantly' : 
               oilData.change24h > 2 ? 'Prices rising rapidly' : 'Stable conditions',
    confidence: oilData.reliability === 'high' ? 0.8 : 0.6
  };
}

function getQuantityRecommendation(oilData) {
  return {
    suggestion: isWinterSeason() ? 'consider_larger_purchase' : 'normal_purchase',
    reasoning: isWinterSeason() ? 'Winter season - ensure adequate supply' : 'Off-season pricing typically stable',
    quantityRange: isWinterSeason() ? '75-100%_capacity' : '50-75%_capacity'
  };
}

function getMonitoringRecommendation(oilData) {
  return {
    frequency: Math.abs(oilData.changePercent24h) > 3 ? 'daily' : 'weekly',
    reasoning: 'Market volatility indicates need for ' + (Math.abs(oilData.changePercent24h) > 3 ? 'frequent' : 'regular') + ' monitoring',
    keyIndicators: ['crude_oil_prices', 'inventory_levels', 'weather_forecasts']
  };
}

module.exports = router;