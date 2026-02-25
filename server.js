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
const fs = require('fs');
require('dotenv').config();

// Load package.json for version info
const pkg = require('./package.json');

// V1.6.0: Import price scraper for scheduled runs
const { runScraper } = require('./scripts/scrape-prices');

// V2.1.0: Import distributed scheduler (shadow mode initially)
const { initScheduler } = require('./src/services/DistributedScheduler');

// V2.6.0: Import scrape backoff for monthly reset
const { monthlyReset } = require('./src/services/scrapeBackoff');

// V2.32.0: Import ZIP stats computer for pre-computed aggregates
const ZipStatsComputer = require('./src/services/ZipStatsComputer');

// Platform metrics for Command Center liquidity dashboard
const PlatformMetricsService = require('./src/services/PlatformMetricsService');
const CountyStatsComputer = require('./src/services/CountyStatsComputer');

// V2.4.0: Import Activity Analytics
const ActivityAnalyticsService = require('./src/services/ActivityAnalyticsService');

// V2.5.0: Import Coverage Report Mailer for manual report sending
const CoverageReportMailer = require('./src/services/CoverageReportMailer');

// V2.15.0: Import ScrapeConfigSync for syncing config to database
const ScrapeConfigSync = require('./src/services/ScrapeConfigSync');

// V2.18.0: Import SMS Price Service for supplier price updates via text
const SmsPriceService = require('./src/services/sms-price-service');

// Import route modules with error handling
let weatherRoutes, marketRoutes, communityRoutes, analyticsRoutes, authRoutes, adminRoutes, suppliersRoutes, intelligenceRoutes, activityAnalyticsRoutes, waitlistRoutes, priceReviewRoutes, dashboardRoutes, smsWebhookRoutes;

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
  smsWebhookRoutes = require('./src/routes/sms-webhook');  // V2.18.0: SMS price updates
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
const { initCommunityDeliveryRawModel } = require('./src/models/CommunityDeliveryRaw');  // V2.3.1: Raw telemetry
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
      connectSrc: ["'self'", "https://www.google-analytics.com", "https://analytics.google.com", "https://www.googletagmanager.com", "https://cdn.jsdelivr.net", "https://unpkg.com", "https://ipapi.co", "https://static.cloudflareinsights.com", "https://*.tile.openstreetmap.org"],
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
  skip: (req) => !req.path.startsWith('/api') || req.path.startsWith('/api/webhook/'), // Skip rate limiting for non-API routes and webhooks
});
app.use(limiter);

// Compression and body parsing
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// V2.27.0: Clean URL support - Redirect .html to clean URLs (301)
// V2.28.0: Also redirect /index to / (Google found /index as separate page)
app.use((req, res, next) => {
  if (req.path.startsWith('/api') ||
      req.path.match(/\.(js|css|png|jpg|jpeg|webp|gif|ico|svg|woff2?|json|xml|txt)$/)) {
    return next();
  }
  // Redirect /index to / (homepage canonical)
  if (req.path === '/index') {
    return res.redirect(301, '/' + (req._parsedUrl.search || ''));
  }
  // Redirect .html to clean URL (except functional pages like update-price.html)
  if (req.path.endsWith('.html') && !req.path.includes('update-price') && !req.path.includes('price-review') && !req.path.startsWith('/admin')) {
    const cleanPath = req.path.slice(0, -5);
    return res.redirect(301, cleanPath + (req._parsedUrl.search || ''));
  }
  next();
});

// V2.27.0: Clean URL support - Serve clean URLs by resolving to .html files
app.use((req, res, next) => {
  if (req.path.startsWith('/api') ||
      req.path.match(/\.(js|css|png|jpg|jpeg|webp|gif|ico|svg|woff2?|json|xml|txt|html)$/) ||
      req.path.endsWith('/')) {
    return next();
  }
  const htmlPath = path.join(__dirname, 'website', req.path + '.html');
  if (fs.existsSync(htmlPath)) {
    req.url = req.path + '.html';
  }
  next();
});

// V2.6.0: Serve static website files
// This allows Railway to host both API and website
// Cache JS files for 1 hour, immutable assets (with hash/version) can cache longer
app.use(express.static(path.join(__dirname, 'website'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      // HTML pages: cache 1 hour, revalidate after (SEO pages regenerate daily)
      res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
    } else if (filePath.endsWith('.js') || filePath.endsWith('.css')) {
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
  EMAIL_PASS: process.env.EMAIL_PASS,
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
  TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER
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

        // V2.35.17: Each model wrapped in try/catch to prevent cascading failures

        // V1.3.0: Initialize Supplier model and sync table
        try {
          const Supplier = initSupplierModel(sequelize);
          if (Supplier) {
            await Supplier.sync({ alter: false });
            logger.info('✅ Supplier model synced');
          } else {
            logger.error('❌ Supplier model failed to initialize');
          }
        } catch (err) {
          logger.error('❌ Supplier model sync failed:', err.message || err);
        }

        // V18.0: Initialize CommunityDelivery model for benchmarking
        try {
          const CommunityDelivery = initCommunityDeliveryModel(sequelize);
          if (CommunityDelivery) {
            await CommunityDelivery.sync({ alter: true });
            logger.info('✅ CommunityDelivery model synced');

            // V2.3.1: Initialize CommunityDeliveryRaw model for exact telemetry data
            try {
              const CommunityDeliveryRaw = initCommunityDeliveryRawModel(sequelize, CommunityDelivery);
              if (CommunityDeliveryRaw) {
                await CommunityDeliveryRaw.sync({ alter: true });
                logger.info('✅ CommunityDeliveryRaw model synced');
              } else {
                logger.warn('⚠️  CommunityDeliveryRaw model failed to initialize - raw telemetry disabled');
              }
            } catch (err) {
              logger.error('❌ CommunityDeliveryRaw model sync failed:', err.message);
            }
          } else {
            logger.error('❌ CommunityDelivery model failed to initialize');
          }
        } catch (err) {
          logger.error('❌ CommunityDelivery model sync failed:', err.message);
        }

        // V2.0.2: Initialize SupplierPrice model for price tracking
        try {
          const SupplierPrice = initSupplierPriceModel(sequelize);
          if (SupplierPrice) {
            await SupplierPrice.sync({ alter: false });
            logger.info('✅ SupplierPrice model synced');
            app.locals.SupplierPrice = SupplierPrice;  // Store for route access
          } else {
            logger.error('❌ SupplierPrice model failed to initialize');
          }
        } catch (err) {
          logger.error('❌ SupplierPrice model sync failed:', err.message);
        }

        // V2.3.0: Initialize UserLocation model for Coverage Intelligence
        try {
          const { initUserLocationModel } = require('./src/models/UserLocation');
          const UserLocation = initUserLocationModel(sequelize);
          if (UserLocation) {
            await UserLocation.sync({ alter: false });
            logger.info('✅ UserLocation model synced');
          } else {
            logger.warn('⚠️  UserLocation model failed to initialize');
          }
        } catch (err) {
          logger.error('❌ UserLocation model error:', err.message);
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

        // Run all migrations sequentially, then ScrapeConfigSync.
        // Migrations must complete before ScrapeConfigSync starts to prevent
        // duplicate supplier records (ScrapeConfigSync matches by domain and
        // will create new records if migrations haven't inserted yet).
        const migrations = [
          { path: './src/migrations/006-activity-analytics', label: 'Activity analytics' },
          { path: './src/migrations/008-add-device-id-tracking', label: 'Device ID tracking' },
          { path: './src/migrations/009-add-waitlist', label: 'Waitlist' },
          { path: './src/migrations/014-add-pwa-events', label: 'PWA events' },
          { path: './src/migrations/015-add-tc-fuel-oil', label: 'TC Fuel Oil' },
          { path: './src/migrations/016-add-tevis-energy', label: 'Tevis Energy' },
          { path: './src/migrations/017-add-delaware-suppliers', label: 'Delaware suppliers' },
          { path: './src/migrations/024-fix-abc-fuel-location', label: 'ABC Fuel location' },
          { path: './src/migrations/025-add-sherman-ct-suppliers', label: 'Sherman CT suppliers' },
          { path: './src/migrations/026-add-hometown-reliable-fuel', label: 'Hometown/Reliable' },
          { path: './src/migrations/027-add-gaylordsville-suppliers', label: 'Gaylordsville suppliers' },
          { path: './src/migrations/028-add-vernon-area-suppliers', label: 'Vernon area suppliers' },
          { path: './src/migrations/029-add-portland-pa-suppliers', label: 'Portland PA suppliers' },
          { path: './src/migrations/030-add-elizabethtown-pa-suppliers', label: 'Elizabethtown PA suppliers' },
          { path: './src/migrations/031-add-york-pa-suppliers', label: 'York PA suppliers' },
          { path: './src/migrations/032-add-dighton-ma-suppliers', label: 'Dighton MA suppliers' },
          { path: './src/migrations/033-add-kent-county-de-suppliers', label: 'Kent County DE suppliers' },
          { path: './src/migrations/034-add-western-ct-suppliers', label: 'Western CT suppliers' },
          { path: './src/migrations/035-add-hudson-valley-ny-suppliers', label: 'Hudson Valley NY suppliers' },
          { path: './src/migrations/036-add-sms-price-support', label: 'SMS price support' },
          { path: './src/migrations/037-add-alaska-suppliers', label: 'Alaska suppliers' },
          { path: './src/migrations/038-add-347-oil', label: '347 Oil' },
          { path: './src/migrations/039-add-cod-suppliers', label: 'COD suppliers' },
          { path: './src/migrations/040-add-jennison-fuels', label: 'Jennison Fuels' },
          { path: './src/migrations/041-add-ace-fueling', label: 'Ace Fueling' },
          { path: './src/migrations/042-add-regional-cod-suppliers', label: 'Regional COD suppliers' },
          { path: './src/migrations/043-add-pa-regional-suppliers', label: 'PA regional suppliers' },
          { path: './src/migrations/044-add-bangor-me-suppliers', label: 'Bangor ME suppliers' },
          { path: './src/migrations/045-add-cn-brown-energy', label: 'CN Brown Energy' },
          { path: './src/migrations/046-add-casco-me-suppliers', label: 'Casco ME suppliers' },
          { path: './src/migrations/047-add-coverage-gap-suppliers', label: 'Coverage gap suppliers' },
          { path: './src/migrations/048-add-ip-hash-to-user-locations', label: 'IP hash' },
          { path: './src/migrations/049-add-cheshire-nh-suppliers', label: 'Cheshire NH suppliers' },
          { path: './src/migrations/050-add-northern-nh-suppliers', label: 'Northern NH suppliers' },
          { path: './src/migrations/051-add-fairfield-ct-suppliers', label: 'Fairfield CT suppliers' },
          { path: './src/migrations/052-add-ct-coverage-suppliers', label: 'CT coverage suppliers' },
          { path: './src/migrations/053-add-eastern-ct-suppliers', label: 'Eastern CT suppliers' },
          { path: './src/migrations/054-add-ct-directory-suppliers', label: 'CT directory suppliers' },
          { path: './src/migrations/055-add-ct-cod-suppliers', label: 'CT COD suppliers' },
          { path: './src/migrations/056-add-delivery-model-column', label: 'Delivery model column' },
          { path: './src/migrations/057-add-zip-price-stats-tables', label: 'ZIP price stats' },
          { path: './src/migrations/058-add-zip-to-county-table', label: 'ZIP to County' },
          { path: './src/migrations/059-cleanup-duplicate-suppliers', label: 'Duplicate cleanup' },
          { path: './src/migrations/060-fix-expired-prices', label: 'Fix expired prices' },
          { path: './src/migrations/061-add-dragon-fuel-llc', label: 'Dragon Fuel LLC' },
          { path: './src/migrations/062-add-port-jervis-area-suppliers', label: 'Port Jervis area' },
          { path: './src/migrations/063-add-quakertown-area-suppliers', label: 'Quakertown area' },
          { path: './src/migrations/064-add-recovered-403-suppliers', label: 'Recovered 403 suppliers' },
          { path: './src/migrations/065-add-metro-energy-boston', label: 'Metro Energy Boston' },
          { path: './src/migrations/066-add-werley-energy', label: 'Werley Energy' },
          { path: './src/migrations/067-enable-kelleys-oil', label: "Kelley's Oil" },
          { path: './src/migrations/068-enable-seven-suppliers', label: 'Seven suppliers' },
          { path: './src/migrations/069-fix-cooldown-suppliers', label: 'Cooldown fix' },
          { path: './src/migrations/070-fix-stale-suppliers', label: 'Stale suppliers fix' },
          { path: './src/migrations/071-fix-remaining-stale', label: 'Remaining stale fix' },
          { path: './src/migrations/072-add-westchester-putnam-suppliers', label: 'Westchester/Putnam suppliers' },
          { path: './src/migrations/073-cleanup-scrapeconfig-duplicates', label: 'ScrapeConfigSync duplicate cleanup' },
          { path: './src/migrations/074-add-daily-platform-metrics', label: 'Daily platform metrics' },
          { path: './src/migrations/075-supplier-data-integrity', label: 'Supplier data integrity' },
          { path: './src/migrations/076-add-me-ct-incomplete-suppliers', label: 'ME/CT incomplete suppliers' },
          { path: './src/migrations/077-add-ma-suppliers-batch1', label: 'MA suppliers batch 1' },
        ];

        let migrationErrors = 0;
        for (const { path: migPath, label } of migrations) {
          try {
            const migration = require(migPath);
            await migration.up(sequelize);
          } catch (err) {
            migrationErrors++;
            logger.warn(`⚠️  ${label} migration: ${err.message}`);
          }
        }
        logger.info(`✅ Migrations complete (${migrations.length - migrationErrors}/${migrations.length} succeeded)`);

        // ScrapeConfigSync runs AFTER all migrations to avoid creating
        // duplicate records for suppliers that migrations already inserted
        const scrapeConfigSync = new ScrapeConfigSync(sequelize);
        try {
          const result = await scrapeConfigSync.sync();
          if (result.success) {
            logger.info(`✅ ScrapeConfigSync: ${result.stats.created} created, ${result.stats.updated} updated`);
          } else {
            logger.warn('⚠️  ScrapeConfigSync:', result.reason);
          }
        } catch (err) {
          logger.warn('⚠️  ScrapeConfigSync error:', err.message);
        }

        // V2.18.0: Initialize SMS Price Service
        const smsPriceService = new SmsPriceService(sequelize, logger);
        app.locals.smsPriceService = smsPriceService;
        logger.info('✅ SMS Price Service initialized');

        logger.info('📊 Database ready for operations');
      })
      .catch(err => {
        // V2.35.17: More accurate error message - could be connection OR model sync failure
        logger.error('❌ Database initialization failed:', err.message || err);
        logger.error('Error stack:', err.stack);
        logger.warn('Connection string format:', API_KEYS.DATABASE_URL ? 'postgresql://[hidden]' : 'Not provided');
        logger.warn('Database features may be partially unavailable');
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
app.use('/api/zip', require('./src/routes/zip-stats'));  // V2.32.0: ZIP price intelligence
app.use('/api/webhook/twilio', smsWebhookRoutes);  // V2.18.0: SMS price updates via Twilio

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
  // V2.32.0: Also triggers ZIP stats computation after scrape completes
  cron.schedule('0 21 * * *', async () => {
    logger.info('⏰ Starting afternoon price scrape (4:00 PM EST)...');
    try {
      const result = await runScraper({ sequelize, logger });
      logger.info(`✅ Afternoon scrape complete: ${result.success} success, ${result.failed} failed`);

      // V2.32.0: Compute ZIP price stats after scrape
      logger.info('📊 Computing ZIP price statistics...');
      const zipStatsComputer = new ZipStatsComputer(sequelize, logger);
      const statsResult = await zipStatsComputer.compute();
      if (statsResult.success) {
        logger.info(`✅ ZIP stats computed: ${statsResult.updated} ZIPs updated in ${statsResult.durationMs}ms`);
      } else {
        logger.warn('⚠️  ZIP stats computation failed:', statsResult.error);
      }

      // V2.33.0: Compute County price stats after ZIP stats
      logger.info('📊 Computing County price statistics...');
      const countyStatsComputer = new CountyStatsComputer(sequelize, logger);
      const countyResult = await countyStatsComputer.compute();
      if (countyResult.success) {
        logger.info(`✅ County stats computed: ${countyResult.updated} counties updated in ${countyResult.durationMs}ms`);
      } else {
        logger.warn('⚠️  County stats computation failed:', countyResult.error);
      }
    } catch (error) {
      logger.error('❌ Afternoon scrape failed:', error.message);
    }
  }, {
    timezone: 'UTC' // 21:00 UTC = 4:00 PM EST
  });
  logger.info('⏰ Afternoon scrape scheduled: daily at 4:00 PM EST (+ ZIP/County stats)');

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

    // V2.32.0: Generate ZIP Elite pages
    try {
      const { generateZipElitePages } = require('./scripts/generate-zip-elite-pages');

      const result = await generateZipElitePages({
        sequelize,
        logger,
        outputDir: websiteDir,
        dryRun: false
      });

      if (result.success) {
        logger.info(`✅ ZIP Elite pages generated: ${result.generated} pages`);
      } else {
        logger.error(`❌ ZIP Elite page generation failed`);
      }
    } catch (error) {
      logger.error('❌ ZIP Elite page generation failed:', error.message);
    }

    // V2.33.0: Generate County Elite pages (auto-promotes when quality threshold met)
    try {
      const { generateCountyElitePages } = require('./scripts/generate-county-elite-pages');

      const result = await generateCountyElitePages({
        sequelize,
        logger,
        outputDir: websiteDir,
        dryRun: false
      });

      if (result.success) {
        logger.info(`✅ County Elite pages generated: ${result.generated} pages`);
      } else {
        logger.error(`❌ County Elite page generation failed`);
      }
    } catch (error) {
      logger.error('❌ County Elite page generation failed:', error.message);
    }
  }, {
    timezone: 'America/New_York'
  });
  logger.info('📄 SEO + Supplier + ZIP/County Elite page generator scheduled: daily at 11:00 PM EST');

  // Regenerate all pages on startup (after healthcheck passes)
  // Generated pages live on the filesystem but git has stale versions.
  // Each Railway deploy creates a fresh container from git, so pages must
  // be regenerated every time the server starts.
  setTimeout(async () => {
    const websiteDir = path.join(__dirname, 'website');
    try {
      const { generateSEOPages } = require('./scripts/generate-seo-pages');
      const seoResult = await generateSEOPages({ sequelize, logger, outputDir: websiteDir, dryRun: false });
      if (seoResult.success) {
        logger.info(`✅ [Startup] SEO pages regenerated: ${seoResult.statePages} state, ${seoResult.totalSuppliers} suppliers`);
      } else {
        logger.warn(`⚠️ [Startup] SEO generation skipped: ${seoResult.reason}`);
      }
    } catch (e) { logger.error('[Startup] SEO page generation failed:', e.message); }
    try {
      const { generateSupplierPages } = require('./scripts/generate-supplier-pages');
      const supplierLogger = { log: (...args) => logger.info(args.join(' ')), error: (...args) => logger.error(args.join(' ')) };
      const supResult = await generateSupplierPages({ sequelize, logger: supplierLogger, websiteDir });
      if (supResult.success) {
        logger.info(`✅ [Startup] Supplier pages regenerated: ${supResult.generated} pages`);
      } else {
        logger.error(`❌ [Startup] Supplier page generation failed: ${supResult.error}`);
      }
    } catch (e) { logger.error('[Startup] Supplier page generation failed:', e.message); }
    try {
      const { generateZipElitePages } = require('./scripts/generate-zip-elite-pages');
      const zipResult = await generateZipElitePages({ sequelize, logger, outputDir: websiteDir, dryRun: false });
      if (zipResult.success) {
        logger.info(`✅ [Startup] ZIP Elite pages regenerated: ${zipResult.generated} pages`);
      } else {
        logger.error(`❌ [Startup] ZIP Elite page generation failed`);
      }
    } catch (e) { logger.error('[Startup] ZIP Elite page generation failed:', e.message); }
  }, 10000);

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

  // Platform metrics snapshot (2:15 AM ET daily)
  cron.schedule('15 2 * * *', async () => {
    logger.info('[PlatformMetrics] Starting daily computation...');
    try {
      const metricsService = new PlatformMetricsService(sequelize, logger);
      const result = await metricsService.computeDaily();
      if (result.success) {
        logger.info(`[PlatformMetrics] Complete: ${result.day} (${result.durationMs}ms)`);
      } else {
        logger.info(`[PlatformMetrics] Skipped: ${result.reason}`);
      }
    } catch (error) {
      logger.error('[PlatformMetrics] Cron failed:', error.message);
    }
  }, { timezone: 'America/New_York' });
  logger.info('📊 Platform metrics scheduled: daily at 2:15 AM ET');

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

            const baseUrl = process.env.BACKEND_URL || 'https://www.gethomeheat.com';
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