// Production SmartHeat Backend API
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const NodeCache = require('node-cache');
const winston = require('winston');
const expressWinston = require('express-winston');
const { Sequelize } = require('sequelize');
const cron = require('node-cron');
const path = require('path');
require('dotenv').config();

// Load package.json for version info
const pkg = require('./package.json');

// V1.6.0: Import price scraper for scheduled runs
const { runScraper } = require('./scripts/scrape-prices');

// V2.1.0: Import distributed scheduler (shadow mode initially)
const { initScheduler } = require('./src/services/DistributedScheduler');

// V2.6.0: Import scrape backoff for monthly reset
const { monthlyReset } = require('./src/services/scrapeBackoff');

// V2.4.0: Import Activity Analytics
const ActivityAnalyticsService = require('./src/services/ActivityAnalyticsService');

// V2.5.0: Import Coverage Report Mailer for manual report sending
const CoverageReportMailer = require('./src/services/CoverageReportMailer');

// V2.15.0: Import ScrapeConfigSync for syncing config to database
const ScrapeConfigSync = require('./src/services/ScrapeConfigSync');

// Import route modules with error handling
let weatherRoutes, marketRoutes, communityRoutes, analyticsRoutes, authRoutes, adminRoutes, suppliersRoutes, intelligenceRoutes, activityAnalyticsRoutes, waitlistRoutes, priceReviewRoutes, dashboardRoutes;

try {
  weatherRoutes = require('./src/routes/weather');
  marketRoutes = require('./src/routes/market');
  communityRoutes = require('./src/routes/community');
  analyticsRoutes = require('./src/routes/analytics');
  authRoutes = require('./src/routes/auth');
  adminRoutes = require('./src/routes/admin');
  suppliersRoutes = require('./src/routes/suppliers');  // V1.3.0: Dynamic supplier directory
  intelligenceRoutes = require('./src/routes/intelligence');  // V2.2.0: Market intelligence
  activityAnalyticsRoutes = require('./src/routes/activity-analytics');  // V2.4.0: Activity analytics
  waitlistRoutes = require('./src/routes/waitlist');  // V2.9.0: Canada waitlist
  trackingRoutes = require('./src/routes/tracking');  // V2.12.0: Click tracking for sniper outreach
  dashboardRoutes = require('./src/routes/dashboard');  // V2.14.0: Analytics dashboard
} catch (error) {
  console.error('Error loading route modules:', error.message);
  // Create placeholder routers if routes fail to load
  weatherRoutes = express.Router();
  marketRoutes = express.Router();
  communityRoutes = express.Router();
  analyticsRoutes = express.Router();
  authRoutes = express.Router();
  adminRoutes = express.Router();
  suppliersRoutes = express.Router();
  intelligenceRoutes = express.Router();
  activityAnalyticsRoutes = express.Router();
  dashboardRoutes = express.Router();

  // Add basic error responses
  weatherRoutes.get('*', (req, res) => res.status(503).json({ error: 'Weather service temporarily unavailable' }));
  marketRoutes.get('*', (req, res) => res.status(503).json({ error: 'Market service temporarily unavailable' }));
  communityRoutes.get('*', (req, res) => res.status(503).json({ error: 'Community service temporarily unavailable' }));
  analyticsRoutes.get('*', (req, res) => res.status(503).json({ error: 'Analytics service temporarily unavailable' }));
  authRoutes.get('*', (req, res) => res.status(503).json({ error: 'Auth service temporarily unavailable' }));
  adminRoutes.get('*', (req, res) => res.status(503).json({ error: 'Admin service temporarily unavailable' }));
  suppliersRoutes.get('*', (req, res) => res.status(503).json({ error: 'Suppliers service temporarily unavailable' }));
  intelligenceRoutes.get('*', (req, res) => res.status(503).json({ error: 'Intelligence service temporarily unavailable' }));
}

// Import model initializers
const { initSupplierModel } = require('./src/models/Supplier');
const { initCommunityDeliveryModel } = require('./src/models/CommunityDelivery');
const { initSupplierPriceModel } = require('./src/models/SupplierPrice');

const app = express();
const PORT = process.env.PORT || 8080;

// Trust Railway's proxy for accurate IP detection in rate limiting
app.set('trust proxy', 1);

// Configure Winston Logger (Railway-compatible)
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.colorize(),
    winston.format.simple()
  ),
  transports: [
    new winston.transports.Console()
    // File logging disabled for Railway deployment
  ]
});

// Global cache with different TTLs
const cache = new NodeCache({ 
  stdTTL: 300, // 5 minutes default
  checkperiod: 60, // Check for expired keys every minute
  useClones: false
});

// Redirect non-www to www and Railway origin to production domain
// Skip /health so Railway's healthcheck still gets a 200
app.use((req, res, next) => {
  if (req.path === '/health') return next();
  const host = req.get('host');
  if (host === 'gethomeheat.com' || (host && host.endsWith('.railway.app'))) {
    return res.redirect(301, `https://www.gethomeheat.com${req.originalUrl}`);
  }
  next();
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://www.googletagmanager.com", "https://cdn.jsdelivr.net", "https://unpkg.com", "https://static.cloudflareinsights.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://www.google-analytics.com", "https://analytics.google.com", "https://cdn.jsdelivr.net", "https://unpkg.com", "https://ipapi.co"],
    },
  },
  crossOriginEmbedderPolicy: false
}));

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? ['https://smartheat.app', 'https://www.smartheat.app', 'https://gethomeheat.com', 'https://www.gethomeheat.com']
    : ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID']
}));

// Rate limiting - only for API routes, not static website
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 100 : 1000, // limit each IP
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => !req.path.startsWith('/api'), // Skip rate limiting for non-API routes
});
app.use(limiter);

// Compression and body parsing
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// V2.6.0: Serve static website files
// This allows Railway to host both API and website
// Cache JS files for 1 hour, immutable assets (with hash/version) can cache longer
app.use(express.static(path.join(__dirname, 'website'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js') || filePath.endsWith('.css')) {
      // Short cache for CSS/JS - versioned via query params
      res.setHeader('Cache-Control', 'public, max-age=3600');
    } else if (filePath.match(/\.(png|jpg|jpeg|webp|gif|ico|svg|woff2?)$/)) {
      // Longer cache for images/fonts
      res.setHeader('Cache-Control', 'public, max-age=86400');
    }
  }
}));

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

// Log environment info for debugging
if (process.env.NODE_ENV === 'production') {
  logger.info('🔍 Available environment variables:', Object.keys(process.env).filter(key => 
    key.includes('DATABASE') || key.includes('PG') || key.includes('POSTGRES')
  ));
}

// Validate critical API keys
const requiredKeys = ['OPENWEATHER', 'DATABASE_URL', 'JWT_SECRET'];
const missingKeys = requiredKeys.filter(key => !API_KEYS[key]);

if (missingKeys.length > 0) {
  logger.error('Missing required environment variables:', missingKeys);
  logger.warn('⚠️  Running in degraded mode without all API keys');
  logger.warn('Configure environment variables in Railway dashboard for full functionality');
} else {
  logger.info('✅ All required API keys loaded successfully');
}

// Database connection (PostgreSQL)
let sequelize;
if (API_KEYS.DATABASE_URL) {
  try {
    // Railway provides the DATABASE_URL in the correct format
    sequelize = new Sequelize(API_KEYS.DATABASE_URL, {
      dialect: 'postgres',
      logging: false, // Disable logging in production
      dialectOptions: {
        ssl: {
          require: true,
          rejectUnauthorized: false
        }
      },
      pool: {
        max: 10,
        min: 0,
        acquire: 30000,
        idle: 10000
      }
    });

    // Test the connection
    sequelize.authenticate()
      .then(async () => {
        logger.info('✅ Connected to PostgreSQL database');

        // Run pending migrations
        try {
          logger.info('🔧 Running database migrations...');
          // Add ip_hash column to supplier_engagements if missing
          await sequelize.query(`
            ALTER TABLE supplier_engagements
            ADD COLUMN IF NOT EXISTS ip_hash VARCHAR(64);
          `).catch(() => {}); // Ignore if column exists or table doesn't exist
          await sequelize.query(`
            CREATE INDEX IF NOT EXISTS idx_supplier_engagements_ip_hash
            ON supplier_engagements(ip_hash);
          `).catch(() => {}); // Ignore if index exists
          logger.info('✅ Database migrations complete');
        } catch (migrationError) {
          logger.warn('⚠️ Migration warning:', migrationError.message);
        }

        // V1.3.0: Initialize Supplier model and sync table
        const Supplier = initSupplierModel(sequelize);
        if (Supplier) {
          await Supplier.sync({ alter: false }); // Don't alter in production, use migrations
          logger.info('✅ Supplier model synced');
        }

        // V18.0: Initialize CommunityDelivery model for benchmarking
        const CommunityDelivery = initCommunityDeliveryModel(sequelize);
        if (CommunityDelivery) {
          await CommunityDelivery.sync({ alter: true }); // alter: true for initial deployment
          logger.info('✅ CommunityDelivery model synced');
        } else {
          logger.error('❌ CommunityDelivery model failed to initialize');
        }

        // V2.0.2: Initialize SupplierPrice model for price tracking
        const SupplierPrice = initSupplierPriceModel(sequelize);
        if (SupplierPrice) {
          await SupplierPrice.sync({ alter: false });
          logger.info('✅ SupplierPrice model synced');
        } else {
          logger.error('❌ SupplierPrice model failed to initialize');
        }

        // V2.3.0: Initialize UserLocation model for Coverage Intelligence
        const { initUserLocationModel } = require('./src/models/UserLocation');
        const UserLocation = initUserLocationModel(sequelize);
        if (UserLocation) {
          await UserLocation.sync({ alter: false });
          logger.info('✅ UserLocation model synced');
        } else {
          logger.warn('⚠️  UserLocation model failed to initialize');
        }

        // V2.4.0: Initialize Activity Analytics Service
        logger.info('🔧 Initializing Activity Analytics Service...');
        const activityAnalytics = new ActivityAnalyticsService(sequelize);
        app.locals.activityAnalytics = activityAnalytics;
        logger.info('✅ Activity Analytics Service initialized');

        // V2.5.0: Initialize Coverage Report Mailer for manual reports
        const coverageMailer = new CoverageReportMailer();
        app.locals.coverageMailer = coverageMailer;
        logger.info('✅ Coverage Report Mailer initialized');

        // Run migration for activity analytics tables (idempotent - won't fail if tables exist)
        const { up: runActivityMigration } = require('./src/migrations/006-activity-analytics');
        runActivityMigration(sequelize).catch(err => {
          logger.warn('⚠️  Activity analytics migration:', err.message);
        });

        // V2.8.0: Run migration for device ID tracking (adds device_id column)
        const { up: runDeviceIdMigration } = require('./src/migrations/008-add-device-id-tracking');
        runDeviceIdMigration(sequelize).catch(err => {
          logger.warn('⚠️  Device ID tracking migration:', err.message);
        });

        // V2.9.0: Run migration for Canada waitlist
        const { up: runWaitlistMigration } = require('./src/migrations/009-add-waitlist');
        runWaitlistMigration(sequelize).catch(err => {
          logger.warn('⚠️  Waitlist migration:', err.message);
        });

        // V2.13.0: Run migration for PWA events table
        const { up: runPwaEventsMigration } = require('./src/migrations/014-add-pwa-events');
        runPwaEventsMigration(sequelize).catch(err => {
          logger.warn('⚠️  PWA events migration:', err.message);
        });

        // V2.16.0: Add Town & Country Fuel supplier
        const { up: runTcFuelMigration } = require('./src/migrations/015-add-tc-fuel-oil');
        runTcFuelMigration(sequelize).catch(err => {
          logger.warn('⚠️  TC Fuel Oil migration:', err.message);
        });

        // V2.16.1: Add Tevis Energy supplier
        const { up: runTevisEnergyMigration } = require('./src/migrations/016-add-tevis-energy');
        runTevisEnergyMigration(sequelize).catch(err => {
          logger.warn('⚠️  Tevis Energy migration:', err.message);
        });

        // V2.16.2: Add Delaware area suppliers
        const { up: runDelawareMigration } = require('./src/migrations/017-add-delaware-suppliers');
        runDelawareMigration(sequelize).catch(err => {
          logger.warn('⚠️  Delaware suppliers migration:', err.message);
        });

        // V2.17.0: Fix ABC Fuel Oil location
        const { up: runAbcFuelMigration } = require('./src/migrations/024-fix-abc-fuel-location');
        runAbcFuelMigration(sequelize).catch(err => {
          logger.warn('⚠️  ABC Fuel location migration:', err.message);
        });

        // V2.17.0: Add Sherman CT area COD suppliers
        const { up: runShermanMigration } = require('./src/migrations/025-add-sherman-ct-suppliers');
        runShermanMigration(sequelize).catch(err => {
          logger.warn('⚠️  Sherman CT suppliers migration:', err.message);
        });

        // V2.17.0: Add Hometown Fuel and Reliable Fuel
        const { up: runHometownMigration } = require('./src/migrations/026-add-hometown-reliable-fuel');
        runHometownMigration(sequelize).catch(err => {
          logger.warn('⚠️  Hometown/Reliable migration:', err.message);
        });

        // V2.17.1: Add Gaylordsville suppliers (Jennings Oil, Marandola Fuel)
        const { up: runGaylordsville } = require('./src/migrations/027-add-gaylordsville-suppliers');
        runGaylordsville(sequelize).catch(err => {
          logger.warn('⚠️  Gaylordsville suppliers migration:', err.message);
        });

        // V2.17.2: Add Vernon/Tolland County suppliers (Gottier, Troiano, Ferguson, etc.)
        const { up: runVernon } = require('./src/migrations/028-add-vernon-area-suppliers');
        runVernon(sequelize).catch(err => {
          logger.warn('⚠️  Vernon area suppliers migration:', err.message);
        });

        // V2.17.3: Add Portland PA suppliers (R.F. Ohl, Tolino's, Fuel Cell Petrol, Pennywise)
        const { up: runPortland } = require('./src/migrations/029-add-portland-pa-suppliers');
        runPortland(sequelize).catch(err => {
          logger.warn('⚠️  Portland PA suppliers migration:', err.message);
        });

        // V2.17.4: Add Elizabethtown PA suppliers (Capitol City Oil, Rolling Hills Energy)
        const { up: runElizabethtown } = require('./src/migrations/030-add-elizabethtown-pa-suppliers');
        runElizabethtown(sequelize).catch(err => {
          logger.warn('⚠️  Elizabethtown PA suppliers migration:', err.message);
        });

        // V2.17.5: Add York PA suppliers (Edris Oil, Marstellar, RA Bair, Best Price Oil)
        const { up: runYork } = require('./src/migrations/031-add-york-pa-suppliers');
        runYork(sequelize).catch(err => {
          logger.warn('⚠️  York PA suppliers migration:', err.message);
        });

        // V2.17.6: Add Dighton MA suppliers (Affordable Fuel, Freedom Fuel, Forni Bros, T&M Fuel, Eastern Petroleum, Brodeur & Sons)
        const { up: runDighton } = require('./src/migrations/032-add-dighton-ma-suppliers');
        runDighton(sequelize).catch(err => {
          logger.warn('⚠️  Dighton MA suppliers migration:', err.message);
        });

        // V2.17.7: Add Kent County DE suppliers (Terroco, PepUp, JC Eisenbrey, Barkley)
        const { up: runKentDE } = require('./src/migrations/033-add-kent-county-de-suppliers');
        runKentDE(sequelize).catch(err => {
          logger.warn('⚠️  Kent County DE suppliers migration:', err.message);
        });

        // V2.15.0: Sync scrape-config.json to suppliers table
        const scrapeConfigSync = new ScrapeConfigSync(sequelize);
        scrapeConfigSync.sync().then(result => {
          if (result.success) {
            logger.info(`✅ ScrapeConfigSync: ${result.stats.created} created, ${result.stats.updated} updated`);
          } else {
            logger.warn('⚠️  ScrapeConfigSync:', result.reason);
          }
        }).catch(err => {
          logger.warn('⚠️  ScrapeConfigSync error:', err.message);
        });

        logger.info('📊 Database ready for operations');
      })
      .catch(err => {
        logger.warn('⚠️  PostgreSQL connection failed:', err.message || err);
        logger.warn('Connection string format:', API_KEYS.DATABASE_URL ? 'postgresql://[hidden]' : 'Not provided');
        logger.warn('Database features will be unavailable until PostgreSQL is configured');
        // Don't exit - allow server to run without database
      });
  } catch (error) {
    logger.error('❌ Database initialization error:', error.message);
    logger.warn('Server will continue without database features');
  }
} else {
  logger.warn('⚠️  DATABASE_URL not configured - database features disabled');
}

// Make cache, logger, and database available to routes
app.locals.cache = cache;
app.locals.logger = logger;
app.locals.apiKeys = API_KEYS;
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

// Health check endpoint
app.get('/health', async (req, res) => {
  let databaseStatus = false;
  if (sequelize) {
    try {
      await sequelize.authenticate();
      databaseStatus = true;
    } catch (error) {
      databaseStatus = false;
    }
  }

  // V21.0: Check model availability
  const { getCommunityDeliveryModel } = require('./src/models/CommunityDelivery');
  const { getSupplierModel } = require('./src/models/Supplier');
  const communityModelReady = !!getCommunityDeliveryModel();
  const supplierModelReady = !!getSupplierModel();

  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: pkg.version,
    services: {
      weather: !!API_KEYS.OPENWEATHER,
      marketData: !!(API_KEYS.FRED || API_KEYS.ALPHA_VANTAGE),
      database: databaseStatus,
      authentication: !!API_KEYS.JWT_SECRET,
      email: !!process.env.RESEND_API_KEY,
      communityModel: communityModelReady,
      supplierModel: supplierModelReady
    },
    system: {
      nodeVersion: process.version,
      platform: process.platform,
      uptime: process.uptime(),
      memory: {
        used: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
        total: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`
      },
      cache: {
        keys: cache.keys().length,
        hits: cache.getStats().hits,
        misses: cache.getStats().misses,
        hitRate: cache.getStats().hits / (cache.getStats().hits + cache.getStats().misses) || 0
      }
    }
  });
});

// API Documentation
app.get('/api/docs', (req, res) => {
  res.json({
    name: 'SmartHeat Backend API',
    version: pkg.version,
    description: 'Community & Market Intelligence Platform for Heating Oil',
    endpoints: {
      health: '/health',
      weather: {
        current: '/api/weather/current?zip=12345',
        forecast: '/api/weather/forecast?zip=12345'
      },
      market: {
        oilPrices: '/api/market/oil-prices?region=northeast',
        regionalPricing: '/api/market/regional-pricing?zip=12345'
      },
      community: {
        suppliers: '/api/community/suppliers?zip=12345',
        activities: '/api/community/activities?zip=12345',
        share: 'POST /api/community/share'
      },
      analytics: {
        usage: '/api/analytics/usage-patterns',
        efficiency: '/api/analytics/efficiency-metrics'
      },
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login'
      },
      admin: {
        supplierRequests: '/api/admin/supplier-requests',
        dashboard: '/api/admin/dashboard',
        auditLogs: '/api/admin/audit-logs'
      },
      suppliers: {
        byZip: '/api/v1/suppliers?zip=01340',
        version: '/api/v1/suppliers/version',
        note: 'Returns signed JSON response for verification'
      }
    },
    rateLimit: '100 requests per 15 minutes (60/hour for suppliers)',
    security: ['Helmet', 'CORS', 'Rate Limiting', 'JWT Authentication', 'HMAC Signed Responses']
  });
});

// Root endpoint - moved to /api for website hosting
// Website is now served at / via express.static
app.get('/api', (req, res) => {
  res.json({
    message: 'SmartHeat Backend API v2.0.0',
    status: 'Production Ready',
    docs: '/api/docs',
    health: '/health',
    environment: process.env.NODE_ENV || 'development'
  });
});

// API Routes
app.use('/api/weather', weatherRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/community', communityRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/coverage', require('./src/routes/coverage')); // V2.3.0: Coverage Intelligence
app.use('/api/admin/activity', activityAnalyticsRoutes); // V2.4.0: Activity Analytics (admin)
app.use('/api/activity', activityAnalyticsRoutes); // V2.4.0: Activity Analytics (app)
app.use('/api/v1/suppliers', suppliersRoutes);  // V1.3.0: Dynamic supplier directory
app.use('/api/v1/market', intelligenceRoutes);  // V2.2.0: Market intelligence
app.use('/api/waitlist', waitlistRoutes);  // V2.9.0: Canada waitlist
app.use('/api/price-review', require('./src/routes/price-review'));  // V2.10.0: Admin price review portal
app.use('/api/supplier-claim', require('./src/routes/supplier-claim'));  // V2.11.0: Supplier claim system
app.use('/api/admin/supplier-claims', require('./src/routes/admin-supplier-claims'));  // V2.11.0: Admin claim review
app.use('/api/supplier-update', require('./src/routes/supplier-update'));  // V2.11.0: Supplier magic link price update
app.use('/api', require('./src/routes/tracking'));  // V2.12.0: Click tracking for sniper outreach
app.use('/api/dashboard', dashboardRoutes);  // V2.14.0: Analytics dashboard

// V2.10.0: Serve static files for admin tools
app.use(express.static(path.join(__dirname, 'public')));

// Geolocation endpoint - Cloudflare headers + fallback to ipapi.co (server-side, no CORS)
// Returns county for more accurate location display (IP geolocation is imprecise at city level)
app.get('/api/geo', async (req, res) => {
  const axios = require('axios');

  // Cloudflare adds these headers automatically
  const country = req.headers['cf-ipcountry'] || null;
  let region = req.headers['cf-region-code'] || req.headers['cf-region'] || null;
  let postal = null;
  let county = null;
  let lat = null;
  let lon = null;
  const ip = req.headers['cf-connecting-ip'] || req.ip;

  // Only return data for US (our coverage area)
  if (country !== 'US') {
    return res.json({ supported: false, country });
  }

  // If Cloudflare didn't provide state, use ipapi.co server-side (no CORS issue)
  if (!region && ip) {
    try {
      const geoRes = await axios.get(`https://ipapi.co/${ip}/json/`, { timeout: 3000 });
      if (geoRes.data) {
        region = geoRes.data.region_code || region;
        postal = geoRes.data.postal;
        lat = geoRes.data.latitude;
        lon = geoRes.data.longitude;
      }
    } catch (e) {
      // Fallback failed, continue without detailed geo
    }
  }

  // Look up county using FCC Census Block API (free, accurate, returns county)
  if (lat && lon) {
    try {
      const fccRes = await axios.get(
        `https://geo.fcc.gov/api/census/block/find?latitude=${lat}&longitude=${lon}&format=json`,
        { timeout: 3000 }
      );
      if (fccRes.data && fccRes.data.County && fccRes.data.County.name) {
        county = fccRes.data.County.name;
        // Only add "County" suffix if not already present
        if (!county.toLowerCase().includes('county')) {
          county += ' County';
        }
      }
    } catch (e) {
      // County lookup failed
    }
  }

  // Fallback to state name if no county
  if (!county && region) {
    const stateNames = {
      'NY': 'New York', 'CT': 'Connecticut', 'MA': 'Massachusetts',
      'NJ': 'New Jersey', 'PA': 'Pennsylvania', 'NH': 'New Hampshire',
      'RI': 'Rhode Island', 'ME': 'Maine', 'MD': 'Maryland',
      'DE': 'Delaware', 'VA': 'Virginia', 'AK': 'Alaska'
    };
    county = stateNames[region] || region;
  }

  res.json({
    supported: true,
    country,
    state: region,
    county: county,
    ip: ip
  });
});

// Cache status endpoint
app.get('/api/cache/status', (req, res) => {
  const stats = cache.getStats();
  res.json({
    keys: cache.keys().length,
    stats: stats,
    hitRate: stats.hits / (stats.hits + stats.misses) || 0
  });
});

// Error handling middleware
app.use(expressWinston.errorLogger({
  winstonInstance: logger
}));

app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Endpoint not found',
    suggestion: 'Visit /api/docs for available endpoints'
  });
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  logger.info(`🚀 SmartHeat Backend API Server running on port ${PORT}`);
  logger.info(`📍 Health check: http://localhost:${PORT}/health`);
  logger.info(`📖 API docs: http://localhost:${PORT}/api/docs`);
  logger.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info('🔒 Security: Helmet, CORS, Rate limiting enabled');

  // V2.6.0: DISABLED fixed 10 AM scrape - now using distributed scheduler (8AM-6PM)
  // Keeping commented for rollback if needed
  // cron.schedule('0 15 * * *', async () => {
  //   logger.info('⏰ Starting scheduled price scrape (10:00 AM EST)...');
  //   try {
  //     const result = await runScraper({ logger });
  //     logger.info(`✅ Scheduled scrape complete: ${result.success} success, ${result.failed} failed`);
  //   } catch (error) {
  //     logger.error('❌ Scheduled scrape failed:', error.message);
  //   }
  // }, {
  //   timezone: 'America/New_York'
  // });
  // logger.info('⏰ Price scraper scheduled: daily at 10:00 AM EST');
  logger.info('⏰ Fixed 10 AM scrape DISABLED - using distributed scheduler instead');

  // V2.7.0: Second daily scrape at 4 PM EST to catch afternoon price updates
  // Catches suppliers who update prices after their morning distributed scrape
  cron.schedule('0 21 * * *', async () => {
    logger.info('⏰ Starting afternoon price scrape (4:00 PM EST)...');
    try {
      const result = await runScraper({ sequelize, logger });
      logger.info(`✅ Afternoon scrape complete: ${result.success} success, ${result.failed} failed`);
    } catch (error) {
      logger.error('❌ Afternoon scrape failed:', error.message);
    }
  }, {
    timezone: 'UTC' // 21:00 UTC = 4:00 PM EST
  });
  logger.info('⏰ Afternoon scrape scheduled: daily at 4:00 PM EST');

  // V2.17.0: Schedule SEO + Supplier page generation at 11:00 PM EST (low traffic period)
  // Generates static HTML pages directly on Railway for Google indexability
  cron.schedule('0 23 * * *', async () => {
    logger.info('📄 Starting page generation (11:00 PM EST)...');
    const websiteDir = path.join(__dirname, 'website');

    // Generate SEO pages (city/county/state)
    try {
      const { generateSEOPages } = require('./scripts/generate-seo-pages');

      const result = await generateSEOPages({
        sequelize,
        logger,
        outputDir: websiteDir,
        dryRun: false
      });

      if (result.success) {
        logger.info(`✅ SEO pages generated: ${result.statePages} state pages, ${result.totalSuppliers} suppliers`);
      } else {
        logger.warn(`⚠️ SEO generation skipped: ${result.reason} (${result.totalSuppliers} suppliers)`);
      }
    } catch (error) {
      logger.error('❌ SEO page generation failed:', error.message);
    }

    // Generate supplier profile pages
    try {
      const { generateSupplierPages } = require('./scripts/generate-supplier-pages');

      const supplierLogger = { log: (...args) => logger.info(args.join(' ')), error: (...args) => logger.error(args.join(' ')) };
      const result = await generateSupplierPages({
        sequelize,
        logger: supplierLogger,
        websiteDir
      });

      if (result.success) {
        logger.info(`✅ Supplier pages generated: ${result.generated} pages`);
      } else {
        logger.error(`❌ Supplier page generation failed: ${result.error}`);
      }
    } catch (error) {
      logger.error('❌ Supplier page generation failed:', error.message);
    }
  }, {
    timezone: 'America/New_York'
  });
  logger.info('📄 SEO + Supplier page generator scheduled: daily at 11:00 PM EST');

  // V2.6.0: Monthly reset of phone_only suppliers (1st of each month at 6 AM EST)
  // Gives blocked sites another chance after a month
  cron.schedule('0 11 1 * *', async () => {
    logger.info('🔄 Starting monthly phone_only reset (1st of month)...');
    try {
      const count = await monthlyReset(sequelize, logger);
      if (count > 0) {
        logger.info(`✅ Monthly reset complete: ${count} suppliers reset to active`);
      } else {
        logger.info('✅ Monthly reset: No phone_only suppliers to reset');
      }
    } catch (error) {
      logger.error('❌ Monthly reset failed:', error.message);
    }
  }, {
    timezone: 'UTC' // 11 AM UTC = 6 AM EST
  });
  logger.info('🔄 Monthly phone_only reset scheduled: 1st of each month at 6 AM EST');

  // V2.6.0: Distributed scheduler - ACTIVE MODE
  // Spreads scrapes across 8AM-6PM to reduce detection risk
  // Each supplier gets a consistent daily time based on ID hash + jitter
  const distributedScheduler = initScheduler({
    sequelize,
    logger,
    shadowMode: false  // ACTIVE: Actually scraping now
  });

  if (distributedScheduler) {
    distributedScheduler.start();
    logger.info('📅 Distributed scheduler started (ACTIVE - scrapes spread 8AM-6PM EST)');
  }

  // V2.3.0: Schedule Coverage Intelligence daily analysis
  scheduleCoverageIntelligence();
});

// V2.3.0: Coverage Intelligence Scheduler
// V2.4.0: Also sends Activity Analytics report
function scheduleCoverageIntelligence() {
  const CoverageIntelligenceService = require('./src/services/CoverageIntelligenceService');
  const CoverageReportMailer = require('./src/services/CoverageReportMailer');
  const ActivityAnalyticsService = require('./src/services/ActivityAnalyticsService');

  if (!sequelize) {
    logger.warn('[CoverageIntelligence] No database connection - scheduler disabled');
    return;
  }

  const mailer = new CoverageReportMailer();
  const intelligence = new CoverageIntelligenceService(sequelize, mailer);
  const activityAnalytics = new ActivityAnalyticsService(sequelize);

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

    logger.info(`[DailyReports] Scheduled for ${target.toISOString()} (${hoursUntil}h from now)`);

    setTimeout(async () => {
      logger.info('[DailyReports] Running scheduled daily reports...');

      let coverageReport = null;
      let activityReport = null;

      // 1. Generate Coverage Intelligence Report
      try {
        coverageReport = await intelligence.runDailyAnalysis();
        logger.info(`[CoverageIntelligence] Analysis complete: ${coverageReport.newLocations.length} new locations, ${coverageReport.coverageGaps.length} gaps`);
      } catch (error) {
        logger.error('[CoverageIntelligence] Scheduled analysis failed:', error.message);
      }

      // 2. Generate Activity Analytics Report
      try {
        logger.info('[ActivityAnalytics] Generating daily report...');
        activityReport = await activityAnalytics.generateDailyReport();
        if (activityReport) {
          logger.info(`[ActivityAnalytics] Report ready: ${activityReport.summary.uniqueUsers} users, ${activityReport.summary.totalRequests} requests`);
        }
      } catch (error) {
        logger.error('[ActivityAnalytics] Daily report failed:', error.message);
      }

      // 2.5. V2.5.0: Check for stale supplier prices and send reminders
      try {
        const { getSupplierStalenessService } = require('./src/services/SupplierPriceStalenessService');
        const stalenessService = getSupplierStalenessService(sequelize);
        if (stalenessService) {
          const stalenessResult = await stalenessService.runDailyCheck();
          if (stalenessResult.remindersSent > 0) {
            logger.info(`[SupplierStaleness] Sent ${stalenessResult.remindersSent} reminder emails`);
          }
        }
      } catch (error) {
        logger.error('[SupplierStaleness] Daily check failed:', error.message);
      }

      // 3. V2.5.2: Send combined report (single email)
      try {
        const hasActionable = coverageReport && (
          coverageReport.newLocations.length > 0 ||
          coverageReport.recommendations.some(r => r.priority === 'HIGH') ||
          coverageReport.expansionPatterns.length > 0
        );
        const hasActivity = activityReport && activityReport.summary.uniqueUsers > 0;

        if (hasActionable || hasActivity) {
          // V2.10.2: Generate magic link for price review portal
          let priceReviewLink = null;
          try {
            const crypto = require('crypto');
            const token = crypto.randomBytes(32).toString('hex');
            const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

            await sequelize.query(`
              INSERT INTO magic_link_tokens (token, purpose, expires_at)
              VALUES (:token, 'price_review', :expiresAt)
            `, { replacements: { token, expiresAt } });

            const baseUrl = process.env.BACKEND_URL || 'https://smartheat-backend-production.up.railway.app';
            priceReviewLink = `${baseUrl}/price-review.html?mltoken=${token}`;
            logger.info('[DailyReports] Generated price review magic link');
          } catch (err) {
            logger.warn('[DailyReports] Failed to generate price review link:', err.message);
          }

          // V2.12.0: Gather click tracking stats for "Sniper" outreach
          let clickStats = null;
          try {
            const [stats] = await sequelize.query(`
              SELECT
                COUNT(*) as total_clicks,
                COUNT(DISTINCT supplier_id) as unique_suppliers,
                COUNT(*) FILTER (WHERE action_type = 'call') as call_clicks,
                COUNT(*) FILTER (WHERE action_type = 'website') as website_clicks,
                COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as last_24h,
                COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as last_7d,
                COUNT(*) FILTER (WHERE processed_for_email = TRUE) as emails_sent,
                COUNT(*) FILTER (WHERE processed_for_email = FALSE) as pending_outreach
              FROM supplier_clicks
            `);
            clickStats = stats[0];

            // Get top clicked suppliers in last 7 days
            const [topSuppliers] = await sequelize.query(`
              SELECT s.name, s.city, s.state, COUNT(*) as clicks
              FROM supplier_clicks sc
              JOIN suppliers s ON sc.supplier_id = s.id
              WHERE sc.created_at > NOW() - INTERVAL '7 days'
              GROUP BY s.id, s.name, s.city, s.state
              ORDER BY clicks DESC
              LIMIT 5
            `);
            clickStats.topSuppliers = topSuppliers;

            // V2.12.1: Hit List - suppliers with clicks in last 24h (for manual outreach)
            const [hitList] = await sequelize.query(`
              SELECT
                s.name,
                s.phone,
                s.email,
                s.city,
                s.state,
                COUNT(sc.id) as click_count,
                STRING_AGG(DISTINCT sc.zip_code, ', ') as zips,
                (
                  SELECT sp.price_per_gallon
                  FROM supplier_prices sp
                  WHERE sp.supplier_id = s.id
                  ORDER BY sp.scraped_at DESC
                  LIMIT 1
                ) as current_price
              FROM supplier_clicks sc
              JOIN suppliers s ON sc.supplier_id = s.id
              WHERE sc.created_at > NOW() - INTERVAL '24 hours'
              GROUP BY s.id, s.name, s.phone, s.email, s.city, s.state
              ORDER BY click_count DESC
              LIMIT 10
            `);
            clickStats.hitList = hitList;

            logger.info(`[DailyReports] Click stats: ${clickStats.last_24h} clicks (24h), ${clickStats.pending_outreach} pending outreach`);
          } catch (err) {
            logger.warn('[DailyReports] Failed to gather click stats:', err.message);
          }

          await mailer.sendCombinedDailyReport(coverageReport, activityReport, priceReviewLink, clickStats);
          logger.info('[DailyReports] Combined report sent');
        } else {
          logger.info('[DailyReports] No actionable items or activity - skipping email');
        }
      } catch (error) {
        logger.error('[DailyReports] Failed to send combined report:', error.message);
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

  logger.info('[DailyReports] Scheduler initialized (Coverage + Activity Analytics at 6 AM EST)');
}

// Handle server errors
server.on('error', (error) => {
  if (error.syscall !== 'listen') {
    throw error;
  }

  switch (error.code) {
    case 'EACCES':
      logger.error(`Port ${PORT} requires elevated privileges`);
      process.exit(1);
      break;
    case 'EADDRINUSE':
      logger.error(`Port ${PORT} is already in use`);
      process.exit(1);
      break;
    default:
      throw error;
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  if (sequelize) {
    await sequelize.close();
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully');
  if (sequelize) {
    await sequelize.close();
  }
  process.exit(0);
});

// Export for testing purposes
module.exports = app;