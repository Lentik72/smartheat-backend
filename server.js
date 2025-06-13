// backend/server.js - Node.js Express Proxy Server
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const NodeCache = require('node-cache');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Cache with 5 minute TTL for weather, 1 hour for market data
const cache = new NodeCache({ stdTTL: 300 });

// Middleware
app.use(cors());
app.use(express.json());

// Rate limiting - per IP address
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// API Keys from environment variables
const API_KEYS = {
  OPENWEATHER: process.env.OPENWEATHER_API_KEY,
  FRED: process.env.FRED_API_KEY,
  ALPHA_VANTAGE: process.env.ALPHA_VANTAGE_API_KEY,
  EIA: process.env.EIA_API_KEY
};

// Validate API keys on startup
const missingKeys = Object.entries(API_KEYS)
  .filter(([key, value]) => !value)
  .map(([key]) => key);

if (missingKeys.length > 0) {
  console.error('Missing API keys:', missingKeys);
  console.error('Please check your .env file');
  process.exit(1);
}

console.log('✅ All API keys loaded successfully');

// Routes

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      weather: !!API_KEYS.OPENWEATHER,
      marketData: !!(API_KEYS.FRED && API_KEYS.ALPHA_VANTAGE)
    }
  });
});

// Weather API Proxy
app.get('/api/weather/current/:zipCode', async (req, res) => {
  try {
    const { zipCode } = req.params;
    
    // Validate ZIP code
    if (!/^\d{5}$/.test(zipCode)) {
      return res.status(400).json({ error: 'Invalid ZIP code format' });
    }
    
    const cacheKey = `weather_current_${zipCode}`;
    const cached = cache.get(cacheKey);
    
    if (cached) {
      console.log(`📦 Cache hit: weather current for ${zipCode}`);
      return res.json(cached);
    }
    
    console.log(`🌤️ Fetching current weather for ${zipCode}`);
    
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?zip=${zipCode},US&appid=${API_KEYS.OPENWEATHER}&units=imperial`,
      { timeout: 10000 }
    );
    
    if (!response.ok) {
      throw new Error(`Weather API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Cache for 5 minutes
    cache.set(cacheKey, data, 300);
    
    res.json(data);
    
  } catch (error) {
    console.error('Weather API error:', error);
    res.status(500).json({
      error: 'Failed to fetch weather data',
      message: error.message
    });
  }
});

// Weather Forecast API Proxy
app.get('/api/weather/forecast/:zipCode', async (req, res) => {
  try {
    const { zipCode } = req.params;
    
    if (!/^\d{5}$/.test(zipCode)) {
      return res.status(400).json({ error: 'Invalid ZIP code format' });
    }
    
    const cacheKey = `weather_forecast_${zipCode}`;
    const cached = cache.get(cacheKey);
    
    if (cached) {
      console.log(`📦 Cache hit: weather forecast for ${zipCode}`);
      return res.json(cached);
    }
    
    console.log(`🌤️ Fetching forecast for ${zipCode}`);
    
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/forecast?zip=${zipCode},US&appid=${API_KEYS.OPENWEATHER}&units=imperial`,
      { timeout: 10000 }
    );
    
    if (!response.ok) {
      throw new Error(`Forecast API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Cache for 10 minutes
    cache.set(cacheKey, data, 600);
    
    res.json(data);
    
  } catch (error) {
    console.error('Forecast API error:', error);
    res.status(500).json({
      error: 'Failed to fetch forecast data',
      message: error.message
    });
  }
});

// Oil Price Data API Proxy
app.get('/api/market/oil-prices', async (req, res) => {
  try {
    const cacheKey = 'oil_prices_data';
    const cached = cache.get(cacheKey);
    
    if (cached) {
      console.log('📦 Cache hit: oil prices');
      return res.json(cached);
    }
    
    console.log('🛢️ Fetching oil price data from FRED');
    
    const fetch = (await import('node-fetch')).default;
    
    // Try FRED API first
    try {
      const fredResponse = await fetch(
        `https://api.stlouisfed.org/fred/series/observations?series_id=DCOILWTICO&api_key=${API_KEYS.FRED}&file_type=json&limit=30&sort_order=desc`,
        { timeout: 8000 }
      );
      
      if (fredResponse.ok) {
        const fredData = await fredResponse.json();
        
        // Process FRED data
        const validObservations = fredData.observations.filter(obs => obs.value !== '.');
        if (validObservations.length > 0) {
          const latestPrice = parseFloat(validObservations[0].value);
          
          const oilData = {
            source: 'FRED',
            crudeOilWTI: latestPrice,
            crudeOilBrent: latestPrice + 3.0,
            heatingOilFutures: latestPrice * 0.045,
            retailHeatingOil: latestPrice * 0.045 * 1.15,
            lastUpdated: new Date().toISOString(),
            dataSource: 'Federal Reserve Economic Data'
          };
          
          // Cache for 1 hour
          cache.set(cacheKey, oilData, 3600);
          
          return res.json(oilData);
        }
      }
    } catch (fredError) {
      console.log('FRED API failed, trying Alpha Vantage...');
    }
    
    // Fallback to Alpha Vantage
    try {
      const alphaResponse = await fetch(
        `https://www.alphavantage.co/query?function=WTI&interval=daily&apikey=${API_KEYS.ALPHA_VANTAGE}`,
        { timeout: 8000 }
      );
      
      if (alphaResponse.ok) {
        const alphaData = await alphaResponse.json();
        
        if (alphaData.data && alphaData.data.length > 0) {
          const latestPrice = alphaData.data[0].value;
          
          const oilData = {
            source: 'AlphaVantage',
            crudeOilWTI: latestPrice,
            crudeOilBrent: latestPrice + 3.0,
            heatingOilFutures: latestPrice * 0.045,
            retailHeatingOil: latestPrice * 0.045 * 1.15,
            lastUpdated: new Date().toISOString(),
            dataSource: 'Alpha Vantage API'
          };
          
          // Cache for 1 hour
          cache.set(cacheKey, oilData, 3600);
          
          return res.json(oilData);
        }
      }
    } catch (alphaError) {
      console.log('Alpha Vantage API failed...');
    }
    
    // Final fallback - mock data with current market approximation
    const mockData = {
      source: 'Mock',
      crudeOilWTI: 75.0 + (Math.random() * 10 - 5), // $70-80 range
      crudeOilBrent: 78.0 + (Math.random() * 10 - 5),
      heatingOilFutures: 3.25 + (Math.random() * 0.5 - 0.25),
      retailHeatingOil: 3.75 + (Math.random() * 0.5 - 0.25),
      lastUpdated: new Date().toISOString(),
      dataSource: 'Estimated Market Data (APIs Unavailable)'
    };
    
    // Cache mock data for shorter time
    cache.set(cacheKey, mockData, 300);
    
    res.json(mockData);
    
  } catch (error) {
    console.error('Market data error:', error);
    res.status(500).json({
      error: 'Failed to fetch market data',
      message: error.message
    });
  }
});

// Regional pricing API
app.get('/api/market/regional-pricing/:zipCode', async (req, res) => {
  try {
    const { zipCode } = req.params;
    
    if (!/^\d{5}$/.test(zipCode)) {
      return res.status(400).json({ error: 'Invalid ZIP code format' });
    }
    
    const cacheKey = `regional_pricing_${zipCode}`;
    const cached = cache.get(cacheKey);
    
    if (cached) {
      console.log(`📦 Cache hit: regional pricing for ${zipCode}`);
      return res.json(cached);
    }
    
    // Get base oil price first
    const oilPriceResponse = await fetch(`http://localhost:${PORT}/api/market/oil-prices`);
    const oilData = await oilPriceResponse.json();
    
    // Calculate regional multiplier based on ZIP code
    const firstDigit = parseInt(zipCode[0]);
    let regionalMultiplier = 1.0;
    
    switch (firstDigit) {
      case 0: regionalMultiplier = 1.15; break; // Northeast
      case 1: regionalMultiplier = 1.12; break; // Mid-Atlantic
      case 2: regionalMultiplier = 0.95; break; // Southeast
      case 3: regionalMultiplier = 0.90; break; // Deep South
      case 4: regionalMultiplier = 1.05; break; // Great Lakes
      case 5: regionalMultiplier = 1.08; break; // Upper Midwest
      case 6: regionalMultiplier = 0.93; break; // Plains
      case 7: regionalMultiplier = 0.88; break; // South Central
      case 8: regionalMultiplier = 1.02; break; // Mountain
      case 9: regionalMultiplier = 1.10; break; // Pacific
    }
    
    const regionalData = {
      zipCode,
      basePrice: oilData.retailHeatingOil,
      regionalPrice: oilData.retailHeatingOil * regionalMultiplier,
      regionalMultiplier,
      priceRange: {
        low: oilData.retailHeatingOil * regionalMultiplier * 0.95,
        high: oilData.retailHeatingOil * regionalMultiplier * 1.05
      },
      lastUpdated: new Date().toISOString(),
      dataSource: 'Regional Price Estimation'
    };
    
    // Cache for 2 hours
    cache.set(cacheKey, regionalData, 7200);
    
    res.json(regionalData);
    
  } catch (error) {
    console.error('Regional pricing error:', error);
    res.status(500).json({
      error: 'Failed to fetch regional pricing',
      message: error.message
    });
  }
});

// Cache status endpoint
app.get('/api/cache/status', (req, res) => {
  const stats = cache.getStats();
  res.json({
    keys: cache.keys().length,
    hits: stats.hits,
    misses: stats.misses,
    hitRate: stats.hits / (stats.hits + stats.misses) || 0
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Smart Heat API Proxy Server running on port ${PORT}`);
    console.log(`📍 Health check: http://localhost:${PORT}/health`);
    console.log(`🌤️ Weather API: http://localhost:${PORT}/api/weather/current/{zipCode}`);
    console.log(`🛢️ Oil prices: http://localhost:${PORT}/api/market/oil-prices`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('Process terminated');
    });
});

module.exports = app;
