// src/server.js - Enhanced SmartHeat Backend API
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const NodeCache = require('node-cache');
const winston = require('winston');
const expressWinston = require('express-winston');
require('dotenv').config();

// Import Sequelize
const { Sequelize } = require('sequelize');

// Import route modules
const weatherRoutes = require('./routes/weather');
const marketRoutes = require('./routes/market');
const communityRoutes = require('./routes/community');
const analyticsRoutes = require('./routes/analytics');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const suppliersRoutes = require('./routes/suppliers');
const intelligenceRoutes = require('./routes/intelligence');
const activityAnalyticsRoutes = require('./routes/activity-analytics');
const ActivityAnalyticsService = require('./services/ActivityAnalyticsService');

const app = express();
const PORT = process.env.PORT || 8080;

// Trust proxy for Railway/reverse proxy deployments
// Required for express-rate-limit to correctly identify users by X-Forwarded-For header
app.set('trust proxy', 1);

// Configure Winston Logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.colorize(),
    winston.format.simple()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

// Global cache with different TTLs
const cache = new NodeCache({ 
  stdTTL: 300, // 5 minutes default
  checkperiod: 60, // Check for expired keys every minute
  useClones: false
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

app.use(compression());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['*'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Enhanced rate limiting with different tiers
const createRateLimit = (windowMs, max, message) => rateLimit({
  windowMs,
  max,
  message: { error: message },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({ error: message });
  }
});

// Different rate limits for different endpoints
app.use('/api/auth', createRateLimit(15 * 60 * 1000, 5, 'Too many authentication attempts'));
app.use('/api/admin', createRateLimit(15 * 60 * 1000, 20, 'Too many admin requests'));
app.use('/api/community', createRateLimit(15 * 60 * 1000, 100, 'Too many community requests'));
app.use('/api', createRateLimit(15 * 60 * 1000, 200, 'Too many API requests'));

// Request logging
app.use(expressWinston.logger({
  winstonInstance: logger,
  meta: true,
  msg: "HTTP {{req.method}} {{req.url}}",
  expressFormat: true,
  colorize: false,
  ignoreRoute: function (req, res) { return false; }
}));

// API Keys validation
const API_KEYS = {
  OPENWEATHER: process.env.OPENWEATHER_API_KEY,
  FRED: process.env.FRED_API_KEY,
  ALPHA_VANTAGE: process.env.ALPHA_VANTAGE_API_KEY,
  EIA: process.env.EIA_API_KEY,
  DATABASE_URL: process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL,
  JWT_SECRET: process.env.JWT_SECRET,
  EMAIL_USER: process.env.EMAIL_USER,
  EMAIL_PASS: process.env.EMAIL_PASS
};

// Validate critical API keys
const requiredKeys = ['OPENWEATHER', 'DATABASE_URL', 'JWT_SECRET'];
const missingKeys = requiredKeys.filter(key => !API_KEYS[key]);

if (missingKeys.length > 0) {
  logger.error('Missing required environment variables:', missingKeys);
  // In production/Railway, this will cause deployment failure if env vars aren't set
  // For development, we can run in degraded mode
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  } else {
    logger.warn('⚠️  Running in degraded mode without all API keys');
  }
}

logger.info('✅ All required API keys loaded successfully');

// Database connection (PostgreSQL)
let sequelize;
if (API_KEYS.DATABASE_URL) {
  try {
    sequelize = new Sequelize(API_KEYS.DATABASE_URL, {
      dialect: 'postgres',
      logging: false,
      dialectOptions: {
        ssl: {
          require: true,
          rejectUnauthorized: false
        }
      },
      pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
      }
    });

    // Test the connection and initialize ML tables
    sequelize.authenticate()
      .then(async () => {
        logger.info('✅ Connected to PostgreSQL database');
        logger.info('📊 Database ready for operations');

        // Initialize ML tables
        const { initializeMLTables, seedMLData } = require('./models/init-ml-tables');
        await initializeMLTables(sequelize);
        await seedMLData(sequelize);

        // Initialize Supplier models
        const { initSupplierModel } = require('./models/Supplier');
        const { initSupplierPriceModel, getSupplierPriceModel } = require('./models/SupplierPrice');
        logger.info('🔧 Initializing Supplier models...');
        initSupplierModel(sequelize);
        const priceModel = initSupplierPriceModel(sequelize);
        logger.info(`🔧 SupplierPrice model result: ${priceModel ? 'SUCCESS' : 'FAILED'}`);

        // Sync SupplierPrice table
        if (priceModel) {
          await priceModel.sync({ alter: false });
          logger.info('✅ SupplierPrice model synced');
        }

        // V2.3.0: Initialize UserLocation model for Coverage Intelligence
        const { initUserLocationModel } = require('./models/UserLocation');
        logger.info('🔧 Initializing UserLocation model...');
        const userLocationModel = initUserLocationModel(sequelize);
        logger.info(`🔧 UserLocation model result: ${userLocationModel ? 'SUCCESS' : 'FAILED'}`);

        // V2.4.0: Initialize Activity Analytics Service
        logger.info('🔧 Initializing Activity Analytics Service...');
        const activityAnalytics = new ActivityAnalyticsService(sequelize);
        app.locals.activityAnalytics = activityAnalytics;
        logger.info('✅ Activity Analytics Service initialized');

        // Run migration for activity analytics tables
        const { up: runActivityMigration } = require('./migrations/006-activity-analytics');
        runActivityMigration(sequelize).catch(err => {
          logger.warn('⚠️  Activity analytics migration:', err.message);
        });
      })
      .catch(err => {
        logger.warn('⚠️  PostgreSQL connection failed:', err.message || err);
      });
  } catch (error) {
    logger.error('❌ Database initialization error:', error.message);
  }
} else {
  logger.warn('⚠️  No DATABASE_URL provided - admin features will use memory storage');
}

// Make cache, logger, and database available to routes
app.locals.cache = cache;
app.locals.logger = logger;
app.locals.sequelize = sequelize;

// V2.4.0: Request logging middleware (captures all API requests for analytics)
app.use((req, res, next) => {
  const startTime = Date.now();
  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    const analytics = req.app.locals.activityAnalytics;
    if (analytics && req.path.startsWith('/api/') && !req.path.includes('/health')) {
      analytics.logRequest(req, res, responseTime);
    }
  });
  next();
});

// Routes
app.use('/api/weather', weatherRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/community', communityRoutes);
app.use('/api/ml', require('./routes/ml-predictions'));
app.use('/api/analytics', analyticsRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/coverage', require('./routes/coverage')); // V2.3.0: Coverage Intelligence
app.use('/api/admin/activity', activityAnalyticsRoutes); // V2.4.0: Activity Analytics (admin)
app.use('/api/activity', activityAnalyticsRoutes); // V2.4.0: Activity Analytics (app)
app.use('/api/v1/suppliers', suppliersRoutes);
app.use('/api/v1/market', intelligenceRoutes);

// Health check endpoint
app.get('/health', async (req, res) => {
  const memoryUsage = process.memoryUsage();
  const cacheStats = cache.getStats();
  
  // Test database connection
  let databaseStatus = 'disconnected';
  if (sequelize) {
    try {
      await sequelize.authenticate();
      databaseStatus = 'connected';
    } catch (error) {
      databaseStatus = 'error';
      logger.warn('Database health check failed:', error.message);
    }
  }
  
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    services: {
      weather: !!API_KEYS.OPENWEATHER,
      marketData: !!(API_KEYS.FRED || API_KEYS.ALPHA_VANTAGE),
      database: databaseStatus,
      authentication: !!API_KEYS.JWT_SECRET,
      email: !!(API_KEYS.EMAIL_USER && API_KEYS.EMAIL_PASS)
    },
    system: {
      nodeVersion: process.version,
      platform: process.platform,
      uptime: process.uptime(),
      memory: {
        used: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB',
        total: Math.round(memoryUsage.heapTotal / 1024 / 1024) + 'MB'
      },
      cache: {
        keys: cache.keys().length,
        hits: cacheStats.hits,
        misses: cacheStats.misses,
        hitRate: cacheStats.hits / (cacheStats.hits + cacheStats.misses) || 0
      }
    }
  });
});

// API Documentation endpoint
app.get('/api/docs', (req, res) => {
  res.json({
    name: 'SmartHeat Backend API',
    version: '2.0.0',
    description: 'Community-driven heating oil management platform',
    endpoints: {
      weather: {
        'GET /api/weather/current/:zipCode': 'Get current weather for ZIP code',
        'GET /api/weather/forecast/:zipCode': 'Get weather forecast for ZIP code'
      },
      market: {
        'GET /api/market/oil-prices': 'Get current oil prices',
        'GET /api/market/regional-pricing/:zipCode': 'Get regional pricing for ZIP code',
        'GET /api/market/trends': 'Get market trends and analysis'
      },
      community: {
        'GET /api/community/suppliers': 'Get community suppliers',
        'POST /api/community/suppliers': 'Add supplier to community',
        'POST /api/community/suppliers/invite': 'Invite supplier to join',
        'GET /api/community/stats': 'Get community statistics',
        'POST /api/community/report': 'Report supplier issue'
      },
      analytics: {
        'POST /api/analytics/consumption': 'Submit consumption data',
        'GET /api/analytics/insights/:zipCode': 'Get market insights for ZIP code'
      },
      ml: {
        'POST /api/ml/predictions/consumption': 'Get oil consumption prediction',
        'POST /api/ml/data/submit': 'Submit consumption data for ML training',
        'GET /api/ml/analytics': 'Get usage analytics and insights',
        'GET /api/ml/model/status': 'Get ML model status and metrics'
      },
      auth: {
        'POST /api/auth/register': 'Register anonymous user',
        'POST /api/auth/verify': 'Verify user token'
      }
    },
    privacy: {
      dataCollection: 'Minimal - ZIP codes only for regional pricing',
      storage: 'Encrypted community supplier data',
      sharing: 'Explicit user consent required',
      compliance: 'GDPR & CCPA compliant'
    }
  });
});

// Error handling middleware
app.use(expressWinston.errorLogger({
  winstonInstance: logger,
  meta: true,
  msg: "HTTP {{req.method}} {{req.url}} - {{err.message}}"
}));

app.use((error, req, res, next) => {
  logger.error('Unhandled server error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    requestId: req.headers['x-request-id'] || 'unknown'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Endpoint not found',
    path: req.path,
    method: req.method 
  });
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  logger.info(`🚀 SmartHeat Backend API Server running on port ${PORT}`);
  logger.info(`📍 Health check: http://localhost:${PORT}/health`);
  logger.info(`📖 API docs: http://localhost:${PORT}/api/docs`);
  logger.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`🔒 Security: Helmet, CORS, Rate limiting enabled`);

  // V2.3.0: Schedule Coverage Intelligence daily analysis
  scheduleCoverageIntelligence();

  // V2.4.0: Schedule DAU aggregation (hourly)
  scheduleDAUAggregation();
});

// V2.4.0: DAU Aggregation Scheduler
function scheduleDAUAggregation() {
  const analytics = app.locals.activityAnalytics;
  if (!analytics) {
    logger.warn('[DAU] Analytics service not available - scheduler disabled');
    return;
  }

  // Run immediately, then every hour
  setTimeout(async () => {
    try {
      await analytics.aggregateDAU();
    } catch (err) {
      logger.warn('[DAU] Initial aggregation failed:', err.message);
    }
  }, 5000); // 5 seconds after startup

  setInterval(async () => {
    try {
      await analytics.aggregateDAU();
    } catch (err) {
      logger.warn('[DAU] Hourly aggregation failed:', err.message);
    }
  }, 60 * 60 * 1000); // Every hour

  logger.info('[DAU] Hourly aggregation scheduled');
}

// V2.3.0: Coverage Intelligence Scheduler
function scheduleCoverageIntelligence() {
  const CoverageIntelligenceService = require('./services/CoverageIntelligenceService');
  const CoverageReportMailer = require('./services/CoverageReportMailer');

  const sequelize = app.locals.sequelize;
  if (!sequelize) {
    logger.warn('[CoverageIntelligence] No database connection - scheduler disabled');
    return;
  }

  const mailer = new CoverageReportMailer();
  const intelligence = new CoverageIntelligenceService(sequelize, mailer);

  // Calculate time until 6 AM EST (11 AM UTC)
  const TARGET_HOUR_UTC = 11; // 6 AM EST = 11 AM UTC

  const scheduleNextRun = () => {
    const now = new Date();
    const target = new Date(now);
    target.setUTCHours(TARGET_HOUR_UTC, 0, 0, 0);

    // If past today's target time, schedule for tomorrow
    if (now >= target) {
      target.setDate(target.getDate() + 1);
    }

    const msUntilTarget = target - now;
    const hoursUntil = Math.round(msUntilTarget / (1000 * 60 * 60) * 10) / 10;

    logger.info(`[CoverageIntelligence] Daily analysis scheduled for ${target.toISOString()} (${hoursUntil}h from now)`);

    setTimeout(async () => {
      logger.info('[CoverageIntelligence] Running scheduled daily analysis...');
      try {
        const report = await intelligence.runDailyAnalysis();
        logger.info(`[CoverageIntelligence] Analysis complete: ${report.newLocations.length} new locations, ${report.coverageGaps.length} gaps`);
      } catch (error) {
        logger.error('[CoverageIntelligence] Scheduled analysis failed:', error.message);
      }

      // Schedule next run (tomorrow)
      scheduleNextRun();
    }, msUntilTarget);
  };

  // Also schedule weekly summary for Monday 8 AM EST (1 PM UTC)
  const scheduleWeeklySummary = () => {
    const now = new Date();
    const target = new Date(now);

    // Find next Monday
    const daysUntilMonday = (8 - now.getUTCDay()) % 7 || 7;
    target.setDate(target.getDate() + daysUntilMonday);
    target.setUTCHours(13, 0, 0, 0); // 8 AM EST = 1 PM UTC

    const msUntilTarget = target - now;

    logger.info(`[CoverageIntelligence] Weekly summary scheduled for ${target.toISOString()}`);

    setTimeout(async () => {
      logger.info('[CoverageIntelligence] Running weekly summary...');
      try {
        const stats = await intelligence.getCoverageStats();
        if (stats) {
          await mailer.sendWeeklySummary(stats);
        }
      } catch (error) {
        logger.error('[CoverageIntelligence] Weekly summary failed:', error.message);
      }

      // Schedule next week
      scheduleWeeklySummary();
    }, msUntilTarget);
  };

  // Start schedulers
  scheduleNextRun();
  scheduleWeeklySummary();

  logger.info('[CoverageIntelligence] Scheduler initialized');
}

// Graceful shutdown
const gracefulShutdown = (signal) => {
  logger.info(`${signal} received, shutting down gracefully`);
  server.close(() => {
    logger.info('HTTP server closed');
    cache.close();
    process.exit(0);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Global error handlers
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

module.exports = app;