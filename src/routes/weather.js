// src/routes/weather.js - Enhanced Weather API with Heating Intelligence
const express = require('express');
const { param, validationResult } = require('express-validator');
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

// GET /api/weather/current/:zipCode - Enhanced current weather
router.get('/current/:zipCode', [validateZipCode, handleValidationErrors], async (req, res) => {
  try {
    const { zipCode } = req.params;
    const cache = req.app.locals.cache;
    const logger = req.app.locals.logger;
    const cacheKey = `enhanced_weather_current_${zipCode}`;
    
    const cached = cache.get(cacheKey);
    if (cached) {
      logger.info(`📦 Cache hit: enhanced current weather for ${zipCode}`);
      return res.json(cached);
    }
    
    logger.info(`🌤️ Fetching enhanced current weather for ${zipCode}`);
    
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?zip=${zipCode},US&appid=${process.env.OPENWEATHER_API_KEY}&units=imperial`,
      { timeout: 10000 }
    );
    
    if (!response.ok) {
      throw new Error(`Weather API error: ${response.status}`);
    }
    
    const weatherData = await response.json();
    
    // Enhance with heating-specific intelligence
    const enhancedData = {
      ...weatherData,
      heatingIntelligence: {
        heatingDemand: calculateHeatingDemand(weatherData.main.temp),
        oilConsumptionFactor: calculateConsumptionFactor(weatherData.main.temp, weatherData.wind?.speed || 0),
        comfortLevel: getComfortLevel(weatherData.main.temp, weatherData.main.humidity),
        recommendations: getHeatingRecommendations(weatherData),
        degreeDay: calculateDegreeDays(weatherData.main.temp),
        energyEfficiencyTips: getEfficiencyTips(weatherData.main.temp)
      },
      extendedMetrics: {
        heatIndex: calculateHeatIndex(weatherData.main.temp, weatherData.main.humidity),
        windChill: calculateWindChill(weatherData.main.temp, weatherData.wind?.speed || 0),
        dewPoint: calculateDewPoint(weatherData.main.temp, weatherData.main.humidity)
      },
      timestamp: new Date().toISOString()
    };
    
    // Cache for 10 minutes (weather changes frequently)
    cache.set(cacheKey, enhancedData, 600);
    
    res.json(enhancedData);
    
  } catch (error) {
    req.app.locals.logger.error('Enhanced weather current error:', error);
    res.status(500).json({
      error: 'Failed to fetch current weather data',
      message: error.message
    });
  }
});

// GET /api/weather/forecast/:zipCode - Enhanced forecast with heating predictions
router.get('/forecast/:zipCode', [validateZipCode, handleValidationErrors], async (req, res) => {
  try {
    const { zipCode } = req.params;
    const cache = req.app.locals.cache;
    const logger = req.app.locals.logger;
    const cacheKey = `enhanced_weather_forecast_${zipCode}`;
    
    const cached = cache.get(cacheKey);
    if (cached) {
      logger.info(`📦 Cache hit: enhanced weather forecast for ${zipCode}`);
      return res.json(cached);
    }
    
    logger.info(`🌤️ Fetching enhanced forecast for ${zipCode}`);
    
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/forecast?zip=${zipCode},US&appid=${process.env.OPENWEATHER_API_KEY}&units=imperial`,
      { timeout: 10000 }
    );
    
    if (!response.ok) {
      throw new Error(`Forecast API error: ${response.status}`);
    }
    
    const forecastData = await response.json();
    
    // Process forecast with heating intelligence
    const enhancedForecast = forecastData.list.map(item => ({
      ...item,
      heatingMetrics: {
        heatingDemand: calculateHeatingDemand(item.main.temp),
        oilConsumptionFactor: calculateConsumptionFactor(item.main.temp, item.wind?.speed || 0),
        degreeDay: calculateDegreeDays(item.main.temp),
        heatingCost: estimateHeatingCost(item.main.temp)
      }
    }));
    
    // Calculate weekly heating summary
    const weeklyAnalysis = analyzeWeeklyHeatingNeeds(enhancedForecast);
    
    const enhancedData = {
      ...forecastData,
      list: enhancedForecast,
      heatingAnalysis: {
        weeklyConsumption: weeklyAnalysis.estimatedConsumption,
        peakDemandDay: weeklyAnalysis.peakDay,
        costEstimate: weeklyAnalysis.totalCost,
        recommendations: weeklyAnalysis.recommendations,
        weatherPatterns: analyzeWeatherPatterns(forecastData.list)
      },
      timestamp: new Date().toISOString()
    };
    
    // Cache for 30 minutes
    cache.set(cacheKey, enhancedData, 1800);
    
    res.json(enhancedData);
    
  } catch (error) {
    req.app.locals.logger.error('Enhanced weather forecast error:', error);
    res.status(500).json({
      error: 'Failed to fetch forecast data',
      message: error.message
    });
  }
});

// Helper functions for heating intelligence
function calculateHeatingDemand(temperature) {
  if (temperature >= 70) return 'none';
  if (temperature >= 60) return 'minimal';
  if (temperature >= 50) return 'low';
  if (temperature >= 40) return 'moderate';
  if (temperature >= 30) return 'high';
  if (temperature >= 20) return 'very_high';
  return 'extreme';
}

function calculateConsumptionFactor(temperature, windSpeed) {
  // Base consumption factor (1.0 = normal, >1.0 = higher consumption)
  let factor = 1.0;
  
  // Temperature effect
  if (temperature < 32) factor += 0.5;
  else if (temperature < 50) factor += (50 - temperature) * 0.02;
  
  // Wind chill effect
  if (windSpeed > 10) factor += windSpeed * 0.01;
  
  return Math.round(factor * 100) / 100;
}

function getComfortLevel(temperature, humidity) {
  if (temperature < 32) return 'very_cold';
  if (temperature < 50) return 'cold';
  if (temperature < 65) return 'cool';
  if (temperature < 75) return 'comfortable';
  if (temperature < 85) return 'warm';
  return 'hot';
}

function getHeatingRecommendations(weatherData) {
  const temp = weatherData.main.temp;
  const recommendations = [];
  
  if (temp < 20) {
    recommendations.push('Consider increasing thermostat setting gradually');
    recommendations.push('Check heating system efficiency');
    recommendations.push('Monitor oil consumption closely');
  } else if (temp < 40) {
    recommendations.push('Optimal heating weather - normal consumption expected');
    recommendations.push('Good time for regular system maintenance');
  } else if (temp > 60) {
    recommendations.push('Consider lowering thermostat to save oil');
    recommendations.push('Good weather for system servicing');
  }
  
  if (weatherData.wind?.speed > 15) {
    recommendations.push('High winds increase heat loss - check weatherstripping');
  }
  
  return recommendations;
}

function calculateDegreeDays(temperature) {
  // Heating degree days (base 65°F)
  const baseTemp = 65;
  return Math.max(0, baseTemp - temperature);
}

function getEfficiencyTips(temperature) {
  const tips = [];
  
  if (temperature < 32) {
    tips.push('Use programmable thermostat to avoid overheating');
    tips.push('Close curtains at night to retain heat');
    tips.push('Check for air leaks around windows and doors');
  } else if (temperature < 50) {
    tips.push('Layer clothing instead of raising thermostat');
    tips.push('Use ceiling fans on low to circulate warm air');
  } else {
    tips.push('Take advantage of solar heat during sunny days');
    tips.push('Consider turning down thermostat during mild weather');
  }
  
  return tips;
}

function calculateHeatIndex(temperature, humidity) {
  if (temperature < 80) return temperature;
  
  const hi = -42.379 + 2.04901523 * temperature + 10.14333127 * humidity
    - 0.22475541 * temperature * humidity - 0.00683783 * temperature * temperature
    - 0.05481717 * humidity * humidity + 0.00122874 * temperature * temperature * humidity
    + 0.00085282 * temperature * humidity * humidity - 0.00000199 * temperature * temperature * humidity * humidity;
  
  return Math.round(hi);
}

function calculateWindChill(temperature, windSpeed) {
  if (temperature > 50 || windSpeed < 3) return temperature;
  
  const windChill = 35.74 + 0.6215 * temperature - 35.75 * Math.pow(windSpeed, 0.16) + 0.4275 * temperature * Math.pow(windSpeed, 0.16);
  return Math.round(windChill);
}

function calculateDewPoint(temperature, humidity) {
  const a = 17.27;
  const b = 237.7;
  const alpha = ((a * temperature) / (b + temperature)) + Math.log(humidity / 100.0);
  const dewPoint = (b * alpha) / (a - alpha);
  return Math.round(dewPoint * 10) / 10;
}

function estimateHeatingCost(temperature) {
  // Estimate daily heating cost based on temperature
  const baseCost = 5.0; // Base daily cost in dollars
  const tempFactor = Math.max(0, (65 - temperature) / 65);
  return Math.round((baseCost * (1 + tempFactor * 2)) * 100) / 100;
}

function analyzeWeeklyHeatingNeeds(forecast) {
  const dailyData = [];
  let totalConsumption = 0;
  let totalCost = 0;
  let peakDemandDay = null;
  let maxConsumption = 0;
  
  // Group by day and analyze
  for (let i = 0; i < forecast.length; i += 8) { // Every 8 items = 1 day (3-hour intervals)
    const dayForecast = forecast.slice(i, i + 8);
    const avgTemp = dayForecast.reduce((sum, item) => sum + item.main.temp, 0) / dayForecast.length;
    const consumption = calculateConsumptionFactor(avgTemp, 0) * 10; // Gallons per day
    const cost = estimateHeatingCost(avgTemp);
    
    totalConsumption += consumption;
    totalCost += cost;
    
    if (consumption > maxConsumption) {
      maxConsumption = consumption;
      peakDemandDay = {
        date: new Date(dayForecast[0].dt * 1000).toLocaleDateString(),
        temperature: Math.round(avgTemp),
        consumption: Math.round(consumption * 10) / 10
      };
    }
    
    dailyData.push({
      date: new Date(dayForecast[0].dt * 1000).toLocaleDateString(),
      avgTemp: Math.round(avgTemp),
      consumption: Math.round(consumption * 10) / 10,
      cost: Math.round(cost * 100) / 100
    });
  }
  
  const recommendations = [];
  if (totalConsumption > 50) {
    recommendations.push('High heating demand expected - monitor oil levels');
  }
  if (peakDemandDay && peakDemandDay.consumption > 8) {
    recommendations.push(`Peak consumption expected on ${peakDemandDay.date}`);
  }
  
  return {
    dailyBreakdown: dailyData,
    estimatedConsumption: Math.round(totalConsumption * 10) / 10,
    totalCost: Math.round(totalCost * 100) / 100,
    peakDay: peakDemandDay,
    recommendations
  };
}

function analyzeWeatherPatterns(forecast) {
  const patterns = {
    temperatureTrend: 'stable',
    precipitationDays: 0,
    windyDays: 0,
    coldSnaps: 0
  };
  
  let tempSum = 0;
  let tempCount = 0;
  let prevTemp = null;
  
  forecast.forEach(item => {
    tempSum += item.main.temp;
    tempCount++;
    
    if (item.weather[0].main.includes('Rain') || item.weather[0].main.includes('Snow')) {
      patterns.precipitationDays++;
    }
    
    if (item.wind?.speed > 15) {
      patterns.windyDays++;
    }
    
    if (item.main.temp < 20) {
      patterns.coldSnaps++;
    }
    
    if (prevTemp && Math.abs(item.main.temp - prevTemp) > 20) {
      patterns.temperatureTrend = 'volatile';
    }
    
    prevTemp = item.main.temp;
  });
  
  const avgTemp = tempSum / tempCount;
  if (avgTemp > 55) patterns.temperatureTrend = 'warming';
  else if (avgTemp < 35) patterns.temperatureTrend = 'cooling';
  
  return patterns;
}

module.exports = router;