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
const CronMonitor = require('./src/services/CronMonitor');
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

// Price alert email service for website subscribers
const PriceAlertService = require('./src/services/PriceAlertService');

// V2.37.0: Trailing-slash → no-slash redirect helper (heatingoil-x0ak)
const { trailingSlashRedirectTarget } = require('./src/utils/trailing-slash-redirect');
const { cityCountyRedirectTarget } = require('./src/utils/city-county-redirect');
const { legacyHeatingOilRedirectTarget } = require('./src/utils/legacy-heating-oil-redirect');
const { subpathIndexRedirectTarget } = require('./src/utils/subpath-index-redirect');

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
const { retryModelInit } = require('./src/services/retryModelInit');

const app = express();
const PORT = process.env.PORT || 8080;

// Page generation tracking — does NOT gate health endpoint (Railway healthcheck timeout is 120s,
// but generation can take longer and shouldn't block API/webhook availability).
// Generator uses safe generate-then-swap: old pages survive if generation fails.
let pagesReady = false;

// V2.36.0 (heatingoil-36uz): model init retry bookkeeping.
// initialStartupComplete gates /health 503→200. Flips true when:
//   (a) all 5 models call markReady(), OR
//   (b) STARTUP_HARD_TIMEOUT_MS elapses — prevents permanent 503 deploy-loop
//       if any model has a non-DB bug (bad migration, code error).
// The markReady function + hard-timeout setTimeout + retryModelInit calls
// live inside the app.listen() callback AFTER cronMonitor is instantiated (see Task 5).
let initialStartupComplete = false;
const modelsReady = new Set();
const EXPECTED_MODELS = ['Supplier', 'CommunityDelivery', 'CommunityDeliveryRaw',
                         'SupplierPrice', 'UserLocation'];
const STARTUP_HARD_TIMEOUT_MS = 60000;

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

// Startup env var validation — fail loudly in production instead of silently using sandbox defaults
const REQUIRED_EMAIL_VARS = ['EMAIL_FROM'];
const RECOMMENDED_VARS = ['CLAIM_VERIFY_SECRET'];
for (const v of REQUIRED_EMAIL_VARS) {
  if (!process.env[v]) {
    if (process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production') {
      logger.error(`FATAL: ${v} is not set. Emails will not send from verified domain.`);
      process.exit(1);
    } else {
      logger.warn(`WARNING: ${v} is not set. Set it before deploying to production.`);
    }
  }
}
for (const v of RECOMMENDED_VARS) {
  if (!process.env[v]) {
    logger.warn(`WARNING: ${v} is not set. One-click verify links will not work.`);
  }
}

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
      workerSrc: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
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
// V2.35.0: Redirect old full-state-name URLs to abbreviated (SEO consolidation)
const OLD_STATE_NAMES = {
  'connecticut': 'ct', 'new-york': 'ny', 'new-jersey': 'nj', 'new-hampshire': 'nh',
  'maine': 'me', 'massachusetts': 'ma', 'pennsylvania': 'pa', 'rhode-island': 'ri',
  'alaska': 'ak', 'delaware': 'de', 'maryland': 'md', 'virginia': 'va', 'vermont': 'vt'
};
app.use((req, res, next) => {
  if (req.path.startsWith('/api') ||
      req.path.match(/\.(js|css|png|jpg|jpeg|webp|gif|ico|svg|woff2?|json|xml|txt)$/)) {
    return next();
  }
  // Redirect /index to / (homepage canonical)
  if (req.path === '/index') {
    return res.redirect(301, '/' + (req._parsedUrl.search || ''));
  }
  // Subpath /{prefix}/index → /{prefix} (heatingoil-2e1s — bead evidence /prices/ny/index)
  const sipTarget = subpathIndexRedirectTarget(req.path);
  if (sipTarget !== null) {
    return res.redirect(301, sipTarget + (req._parsedUrl.search || ''));
  }
  // Redirect /suppliers/ to /prices (bots guess parent from /supplier/{slug} pages)
  if (req.path === '/suppliers' || req.path === '/suppliers/') {
    return res.redirect(301, '/prices' + (req._parsedUrl.search || ''));
  }
  // /suppliers/{slug} → /supplier/{slug} (heatingoil-2e1s; bare /suppliers is handled by the rule above)
  if (req.path.startsWith('/suppliers/')) {
    return res.redirect(301, '/supplier' + req.path.slice('/suppliers'.length) + (req._parsedUrl.search || ''));
  }
  // /how-it-works → /how-prices-work (heatingoil-2e1s, legacy renamed page)
  if (req.path === '/how-it-works') {
    return res.redirect(301, '/how-prices-work' + (req._parsedUrl.search || ''));
  }
  // /learn/average-heating-bill[/] → /average-heating-bill/ (heatingoil-okug)
  // The canonical "Average Heating Bills by State" hub lives at the site root,
  // not under /learn/. GSC indexed the wrong path. Cover both forms because
  // x0ak's trailing-slash redirect only fires when /learn/average-heating-bill.html
  // exists — it doesn't.
  if (req.path === '/learn/average-heating-bill' || req.path === '/learn/average-heating-bill/') {
    return res.redirect(301, '/average-heating-bill/' + (req._parsedUrl.search || ''));
  }
  // Redirect old full-state-name price URLs to abbreviated form
  // e.g. /prices/connecticut/fairfield-county → /prices/ct/fairfield-county
  //      /prices/new-york → /prices/ny
  const stateMatch = req.path.match(/^\/prices\/([\w-]+)(\/.*)?$/);
  if (stateMatch && OLD_STATE_NAMES[stateMatch[1]]) {
    const abbr = OLD_STATE_NAMES[stateMatch[1]];
    let rest = stateMatch[2] || '';
    // Strip .html from subpath to minimize redirect chains
    if (rest.endsWith('.html')) rest = rest.slice(0, -5);
    const qs = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
    return res.redirect(301, `/prices/${abbr}${rest}${qs}`);
  }
  // Legacy /heating-oil[-prices]/{state}/{city}-county → /prices/county/{abbr}/{city} (heatingoil-2e1s)
  const lhoTarget = legacyHeatingOilRedirectTarget(req.path, OLD_STATE_NAMES);
  if (lhoTarget !== null) {
    return res.redirect(301, lhoTarget + (req._parsedUrl.search || ''));
  }
  // V2.37.0: Trailing-slash → no-slash when a sibling .html exists and no directory index.
  // Fixes heatingoil-x0ak — /prices/ was 404ing because the clean-URL middleware below
  // skips paths that end with '/', so /prices/ never resolved to website/prices.html
  // and Express static fell through.
  // Placed AFTER the state-name redirect so /prices/connecticut/ → /prices/ct/ in a
  // single hop, not /prices/connecticut → /prices/ct (2-hop chain).
  const tsTarget = trailingSlashRedirectTarget(req.path, path.join(__dirname, 'website'), fs.existsSync);
  if (tsTarget !== null) {
    const qs = req._parsedUrl.search || '';
    return res.redirect(301, tsTarget + qs);
  }
  // Redirect ZIP-in-town-path: /prices/nh/03064 → /prices?zip=03064
  const zipInPath = req.path.match(/^\/prices\/[a-z]{2}\/(\d{5})$/);
  if (zipInPath) {
    return res.redirect(301, `/prices?zip=${zipInPath[1]}`);
  }
  // Redirect .html to clean URL (except functional pages like update-price.html)
  if (req.path.endsWith('.html') && !req.path.includes('update-price') && !req.path.includes('supplier-dashboard') && !req.path.includes('price-review') && !req.path.startsWith('/admin')) {
    const cleanPath = req.path.slice(0, -5);
    return res.redirect(301, cleanPath + (req._parsedUrl.search || ''));
  }
  // .htm strip (heatingoil-2e1s — same exclusion list as .html strip above)
  if (req.path.endsWith('.htm') && !req.path.includes('update-price') && !req.path.includes('supplier-dashboard') && !req.path.includes('price-review') && !req.path.startsWith('/admin')) {
    const cleanPath = req.path.slice(0, -4);
    return res.redirect(301, cleanPath + (req._parsedUrl.search || ''));
  }
  next();
});

// V2.27.0: Clean URL support - Serve clean URLs by resolving to .html files
// V2.35.0: Supplier slug normalization — redirect old/variant slugs to canonical
app.use((req, res, next) => {
  if (req.path.startsWith('/api') ||
      req.path.match(/\.(js|css|png|jpg|jpeg|webp|gif|ico|svg|woff2?|json|xml|txt|html)$/) ||
      req.path.endsWith('/')) {
    return next();
  }
  const htmlPath = path.join(__dirname, 'website', req.path + '.html');
  if (fs.existsSync(htmlPath)) {
    req.url = req.path + '.html';
    return next();
  }

  // City → -county fuzzy fallback (heatingoil-vwpi). Runs after the exact-match
  // {path}.html lookup above failed. Recovers /prices/va/fairfax when the file
  // is prices/va/fairfax-county.html. One-way, no-slash; scoped by the helper's
  // regex to /prices/{2-letter-state}/{city}.
  const ccTarget = cityCountyRedirectTarget(req.path, path.join(__dirname, 'website'), fs.existsSync);
  if (ccTarget !== null) {
    // _parsedUrl.search is the same idiom as the x0ak trailing-slash block above (kept consistent intentionally; the supplier-fuzzy block below uses the originalUrl form for historical reasons).
    const qs = req._parsedUrl.search || '';
    return res.redirect(301, ccTarget + qs);
  }

  // Supplier slug redirects: known old/changed slugs → current canonical slugs
  // Handles removed suppliers, renames, and merges discovered via GSC 404s
  if (req.path.startsWith('/supplier/')) {
    const SLUG_REDIRECTS = {
      'town-country-fuel': 'town-and-country-fuel-pa',
      'getcodoil': null,             // removed broker — 410 Gone
      'discount-oil-llc': null,      // never listed — 410 Gone (heatingoil-xaef)
      's-s-fuel': 's-s-fuel',        // merged duplicate, keep canonical

      // heatingoil-qbd0.9: deactivated suppliers whose pages stopped generating
      // and now 404. 301 only where the SAME business has a live active listing
      // (verified same name + same city, target 200); otherwise 410 Gone.
      // 301 — renamed/same business, active successor verified live:
      'ss-fuel': 's-s-fuel',                          // SS Fuel → S&S Fuel, Oakdale NY
      'check-oil': 'check-oil-and-propane',           // Check Oil → Check Oil & Propane, Peekskill NY
      'chrysalis-fuel-inc': 'chrysalis-fuel',         // Cold Spring NY
      'economy-fuel': 'economy-fuel-peekskill',       // Economy Fuel, Peekskill NY (NOT the CT/New City ones)
      'johns-fuel-oil': 'john-s-fuel-oil',            // John's Fuel Oil, Holtsville NY
      'john-s-oil': 'johns-oil-service',              // John's Oil Service, Lynn MA
      'kelleys-oil': 'kelley-s-oil',                  // Kelley's Oil, S. Weymouth MA
      'superior-fuel-oil': 'superior-fuel-oil-inc',   // Superior Fuel Oil, Peekskill NY
      'jurassic-fuels': 'jurassic-fuels-inc',         // Poughkeepsie → Lower Hudson Valley NY
      // 410 — no active successor (conservative default for deactivated listings):
      'bees-fuel-oil': null,                          // Bee's Fuel Oil, Walden NY
      'simsbury-oil-company': null,                   // Newington CT
      'martin-heating-oil-llc': null,                 // Wolcott CT
      'brazos-oil-llc': null,                         // Portland CT
      'terroco-oil-de': null,                         // Dover DE
      'springers-oil-service': null,                  // Feeding Hills MA
      'online-fuel-company': null,                    // Scarborough ME
      'online-fuel-co': null,                         // Portsmouth NH
      'bruce-hall-corp': null,                        // Cooperstown NY
      'dutile-sons': null,                            // Laconia NH
      'direct-oil': null,                             // Thornwood NY (direct-oil-north is a distinct entity — NOT a redirect)
      'absolute-energy': null,                        // Dobbs Ferry NY
      'fielding-s-oil-propane': null,                 // Dover NH
      'presby-oil': null,                             // Bethlehem NH
      'jc-discount-oil': null,                        // Coram NY
      'coastal-energy-ct': null,                      // Norwalk CT
      'the-oil-club': null,                           // Emmaus PA
      'oil-discounters': null,                        // Emmaus PA
      'affordable-fuel-inc': null,                    // Seekonk MA
      'romeos-fuel': null,                            // Holtsville NY
      'trinks-brothers-oil-llc': null,                // Manchester CT
      'piro-paving-petroleum': null,                  // Norwalk CT
      'state-fuel-inc': null,                         // Rochester NY
      'long-island-cod': null,                        // Mineola NY
      'cod-oil-long-island': null,                    // Hicksville NY
      'nj-easy': null,                                // Central NJ
      'miller-s-energy': null,                        // Chesapeake VA
      'sandri-energy': null,                          // Greenfield MA
      'oilex-fuel': null,                             // Mineola NY
      'leonard-splaine-co': null,                     // Woodbridge VA
      'aj-s-discount-oil': 'ajs-discount-oil',        // AJ's Discount Oil, Portland ME (active successor)
    };
    const slug = req.path.slice('/supplier/'.length);
    if (slug in SLUG_REDIRECTS) {
      const target = SLUG_REDIRECTS[slug];
      if (target === null) return res.status(410).send('This supplier listing has been removed.');
      return res.redirect(301, `/supplier/${target}`);
    }
    const candidates = new Set();

    // Strip trailing hyphens: "dan-s-oil-co-" → "dan-s-oil-co"
    const stripped = slug.replace(/-+$/, '');
    if (stripped !== slug) candidates.add(stripped);

    // Collapse apostrophe pattern: "joel-s-oil" → "joels-oil", "john-s" → "johns"
    // Matches -s before another hyphen or end of string
    const collapsed = slug.replace(/-s(?=-|$)/g, 's');
    if (collapsed !== slug) candidates.add(collapsed);

    // Both: strip trailing + collapse apostrophe
    const both = stripped.replace(/-s(?=-|$)/g, 's');
    if (both !== slug) candidates.add(both);

    // Remove duplicate-suffix: "express-cod-1" → "express-cod"
    const noSuffix = slug.replace(/-\d+$/, '');
    if (noSuffix !== slug) candidates.add(noSuffix);

    for (const candidate of candidates) {
      const candidatePath = path.join(__dirname, 'website', 'supplier', candidate + '.html');
      if (fs.existsSync(candidatePath)) {
        const qs = req.originalUrl.includes('?')
          ? req.originalUrl.slice(req.originalUrl.indexOf('?'))
          : '';
        return res.redirect(301, `/supplier/${candidate}${qs}`);
      }
    }
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
      // Long cache for CSS/JS - versioned via query params (?v=hash), so content changes = new URL
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
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
// Timeouts are env-tunable without redeploy. Defaults bound failure without killing
// legitimate long-running cron queries (County/ZIP stats CTEs, page generators).
// 0 is a valid Postgres value meaning "no timeout" and is respected as a kill switch.
const parseMsEnv = (value, fallback) => {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};
const DB_STATEMENT_TIMEOUT_MS = parseMsEnv(process.env.DB_STATEMENT_TIMEOUT_MS, 60000);
const DB_IDLE_TX_TIMEOUT_MS = parseMsEnv(process.env.DB_IDLE_TX_TIMEOUT_MS, 60000);
const DB_CONNECT_TIMEOUT_MS = parseMsEnv(process.env.DB_CONNECT_TIMEOUT_MS, 15000);
const DB_HEALTH_RACE_MS = parseMsEnv(process.env.DB_HEALTH_RACE_MS, 2000);

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
        },
        // pg driver options — snake_case are Postgres SET params, camelCase are pg client options
        statement_timeout: DB_STATEMENT_TIMEOUT_MS,
        idle_in_transaction_session_timeout: DB_IDLE_TX_TIMEOUT_MS,
        connectionTimeoutMillis: DB_CONNECT_TIMEOUT_MS
      },
      pool: {
        max: 25,
        min: 2,
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

        // V2.36.0 (heatingoil-36uz): model init moved to after cronMonitor instantiation
        // (see block after `const cronMonitor = new CronMonitor(...)` in the app.listen callback below).
        // Old try/catch blocks deleted here — retry helper handles init + sync + logging.

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
        const { migrations, loadMigrationModule } = require('./src/migrations-list');

        // Migration runner contract: each migration file MUST export `{ up }` where
        // `up` is `async function(sequelize)` and uses `sequelize.query(...)` directly.
        // DO NOT write migrations using the queryInterface convention — the runner
        // passes the raw Sequelize instance, so `queryInterface.sequelize.query()`
        // will throw "Cannot read properties of undefined (reading 'query')" and
        // be silently caught here. (See plan: snappy-bubbling-cascade.md)
        let migrationErrors = 0;
        const failedMigrations = [];
        for (const m of migrations) {
          try {
            const { up } = loadMigrationModule(m);
            await up(sequelize);
          } catch (err) {
            migrationErrors++;
            // /health body shows truncated error (200 char cap to avoid leaking long
            // traces via a publicly-cacheable endpoint). Full message is in the warn
            // log below — operators must cross-reference Railway logs for full context.
            const safeError = String(err.message || err).slice(0, 200);
            failedMigrations.push({ label: m.label, error: safeError });
            logger.warn(`⚠️  ${m.label} migration: ${err.message}`);
          }
        }

        // Stash for /health visibility (matches feedback_silent_degradation.md).
        app.locals.migrationStatus = {
          total: migrations.length,
          succeeded: migrations.length - migrationErrors,
          errors: migrationErrors,
          failed: failedMigrations,
        };

        if (migrationErrors > 0) {
          // Escalate to error-level when anything failed — visible in Railway log filter.
          // NOTE: Railway does NOT auto-alert on error-level logs alone; this is for
          // human dashboard visibility. The /health body is the machine-checkable signal.
          logger.error(`❌ ${migrationErrors}/${migrations.length} migration(s) failed: ${failedMigrations.map(f => f.label).join(', ')}`);
        } else {
          logger.info(`✅ Migrations complete (${migrations.length}/${migrations.length} succeeded)`);
        }

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

        // Smart Quote Request Service (heatingoil-h1fy)
        const QuoteRequestService = require('./src/services/QuoteRequestService');
        const quoteRequestService = new QuoteRequestService(sequelize, logger);
        app.locals.quoteRequestService = quoteRequestService;
        logger.info('✅ Quote Request Service initialized');

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
const { raceDbAuthenticate } = require('./src/services/healthCheck');
app.get('/health', async (req, res) => {
  // Tri-state so operators can distinguish a Postgres blip (timeout) from an outage (down).
  // Race bounds /health latency so UptimeRobot doesn't false-alert on transient DB slowness.
  const { state: dbState } = await raceDbAuthenticate(sequelize, DB_HEALTH_RACE_MS);
  if (dbState === 'timeout') {
    logger.warn(`[health] DB authenticate exceeded ${DB_HEALTH_RACE_MS}ms — reporting database:timeout`);
  }
  const databaseStatus = dbState === 'up';

  // V21.0: Check model availability
  const { getCommunityDeliveryModel } = require('./src/models/CommunityDelivery');
  const { getSupplierModel } = require('./src/models/Supplier');
  const { getCommunityDeliveryRawModel } = require('./src/models/CommunityDeliveryRaw');
  const { getSupplierPriceModel } = require('./src/models/SupplierPrice');
  const { getUserLocationModel } = require('./src/models/UserLocation');

  const statusCode = initialStartupComplete ? 200 : 503;

  res.status(statusCode).json({
    status: initialStartupComplete ? 'healthy' : 'initializing',
    timestamp: new Date().toISOString(),
    version: pkg.version,
    services: {
      weather: !!API_KEYS.OPENWEATHER,
      marketData: !!(API_KEYS.FRED || API_KEYS.ALPHA_VANTAGE),
      database: databaseStatus,
      databaseState: dbState,
      authentication: !!API_KEYS.JWT_SECRET,
      email: !!process.env.RESEND_API_KEY,
      communityModel: !!getCommunityDeliveryModel(),
      supplierModel: !!getSupplierModel(),
      communityDeliveryRawModel: !!getCommunityDeliveryRawModel(),
      supplierPriceModel: !!getSupplierPriceModel(),
      userLocationModel: !!getUserLocationModel()
    },
    startup: {
      initialStartupComplete,
      modelsReady: Array.from(modelsReady),
      modelsPending: EXPECTED_MODELS.filter(n => !modelsReady.has(n)),
      retryDisabled: process.env.DISABLE_MODEL_RETRY === 'true',
      migrations: app.locals.migrationStatus || { total: 0, succeeded: 0, errors: 0, failed: [] },
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
app.use('/claim', require('./src/routes/claim-page'));  // Server-rendered claim page
app.use('/api/supplier-claim', require('./src/routes/supplier-claim'));  // V2.11.0: Supplier claim system
app.use('/api/supplier-request', require('./src/routes/supplier-request'));  // Add My Business self-service
app.use('/api/admin/supplier-claims', require('./src/routes/admin-supplier-claims'));  // V2.11.0: Admin claim review
app.use('/api/supplier-update', require('./src/routes/supplier-update'));  // V2.11.0: Supplier magic link price update
app.use('/api/supplier-dashboard', require('./src/routes/supplier-dashboard'));  // V2.15.0: Supplier value dashboard
app.use('/api', require('./src/routes/tracking'));  // V2.12.0: Click tracking for sniper outreach
app.use('/api/dashboard', dashboardRoutes);  // V2.14.0: Analytics dashboard
app.use('/api/zip', require('./src/routes/zip-stats'));  // V2.32.0: ZIP price intelligence
app.use('/api/webhook/twilio', smsWebhookRoutes);  // V2.18.0: SMS price updates via Twilio
app.use('/api/outreach', require('./src/routes/outreach'));  // Supplier email unsubscribe
app.use('/api/webhook', require('./src/routes/outreach'));  // Resend bounce/complaint webhook
app.use('/api/price-alerts', require('./src/routes/price-alerts'));  // Price alert subscribe/unsubscribe
app.use('/api/coverage-request', require('./src/routes/coverage-request'));  // Coverage request for empty ZIPs
app.use('/api/quote-request', require('./src/routes/quote-request'));  // Smart Quote Request system (heatingoil-h1fy)
app.use('/api/webhook/twilio-leads', require('./src/routes/lead-sms-webhook'));  // Lead SMS inbound (separate from price SMS)
// Short URL for supplier "Confirm you called" link (keeps SMS clean)
app.get('/r/:token', (req, res) => res.redirect(301, `/api/quote-request/supplier-response?t=${req.params.token}`));
// Consumer verify link — user taps this in SMS to confirm their quote request
app.get('/v/:requestId', async (req, res) => {
  const service = req.app.locals.quoteRequestService;
  const { escapeHtml } = require('./src/utils/html');
  if (!service) return res.status(503).send('Service unavailable');
  try {
    const result = await service.verifyByLink(req.params.requestId, req.query.h);
    if (result.error) {
      return res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HomeHeat</title><style>body{font-family:-apple-system,sans-serif;margin:0;padding:40px 20px;background:#FEF3EB;color:#1a1a1a;text-align:center;}a{color:#FF6B35;}</style></head><body><h2>Link Issue</h2><p>${escapeHtml(result.error)}</p><p><a href="/prices">Search for suppliers →</a></p></body></html>`);
    }
    const n = result.suppliers_notified || 0;
    const phones = (result.fallback_phones || []).map(s =>
      `<div style="padding:8px 0;border-bottom:1px solid #E5D8D0;"><strong>${escapeHtml(s.name)}</strong>${s.price ? ' — $' + Number(s.price).toFixed(2) + '/gal' : ''}<br><a href="tel:${escapeHtml(s.phone)}" style="color:#FF6B35;font-weight:500;">${escapeHtml(s.phone)}</a></div>`
    ).join('');
    const statusMsg = n > 0
      ? (n === 1 ? 'We\'ve notified the best available supplier.' : `We\'ve notified ${n} local suppliers.`)
      : 'We\'re expanding in your area.';
    const expectMsg = n > 0
      ? 'Expect a call shortly. Suppliers may call from unknown numbers.'
      : 'We\'ll notify local suppliers about demand here.';
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Request Confirmed — HomeHeat</title><style>body{font-family:-apple-system,sans-serif;margin:0;padding:20px;background:#FEF3EB;color:#1a1a1a;}a{color:#FF6B35;}.card{max-width:480px;margin:20px auto;background:#fff;border-radius:12px;padding:24px;box-shadow:0 2px 8px rgba(0,0,0,0.08);}.ok{background:#F0FDF4;border:1px solid #86EFAC;border-radius:10px;padding:16px;text-align:center;margin-bottom:16px;}.ok h2{color:#16A34A;margin:0 0 4px;}.ok p{color:#666;margin:4px 0 0;font-size:14px;}</style></head><body><div class="card"><div class="ok"><div style="font-size:2rem;">✓</div><h2>${statusMsg}</h2><p>${expectMsg}</p></div>${phones ? '<div style="font-size:0.9rem;color:#666;margin-bottom:4px;">Or call directly:</div>' + phones : ''}<p style="text-align:center;margin-top:16px;font-size:13px;color:#999;"><a href="/prices">Back to prices</a></p></div></body></html>`);
  } catch (err) {
    res.status(500).send('Something went wrong.');
  }
});
app.use('/api/v1/heating-cost', require('./src/routes/heating-cost'));  // Multi-fuel cost comparison
app.use('/api/v1', require('./src/routes/user-events'));  // Lightweight user event tracking

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

// V2.35.0: 404 handler — HTML for website visitors, JSON for API consumers
// V2.36.0 (heatingoil-03yc): Disable long-lived caching of 404 responses.
// Without this, Cloudflare cached 404s for 24hr (max-age=86400) so any
// newly-generated page that had a prior 404 served stale 404 from CF for
// a full day after origin was fixed. Two headers are needed:
//   - Cache-Control: no-cache, must-revalidate → for browsers + CDNs that
//     don't have an override rule active
//   - CDN-Cache-Control: no-store, max-age=0   → for Cloudflare specifically;
//     overrides any CF Cache Rule that would otherwise force caching of
//     4xx responses for /prices/* and /supplier/* (CF respects this header
//     ahead of its own rules per CF docs).
app.use((req, res) => {
  res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  res.setHeader('CDN-Cache-Control', 'no-store, max-age=0');
  if (req.path.startsWith('/api')) {
    return res.status(404).json({
      error: 'Endpoint not found',
      suggestion: 'Visit /api/docs for available endpoints'
    });
  }
  // Serve the branded 404 page for all non-API requests
  res.status(404).sendFile(path.join(__dirname, 'website', '404.html'));
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  logger.info(`🚀 SmartHeat Backend API Server running on port ${PORT}`);
  logger.info(`📍 Health check: http://localhost:${PORT}/health`);
  logger.info(`📖 API docs: http://localhost:${PORT}/api/docs`);
  logger.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info('🔒 Security: Helmet, CORS, Rate limiting enabled');

  // V3.1.0: Initialize CronMonitor for heartbeat tracking, auto-retry, and drift detection
  const cronMonitor = new CronMonitor(sequelize, logger);

  // V2.36.0 (heatingoil-36uz): model init retry scaffolding.
  // cronMonitor is now in scope; define markReady + hard-timeout here
  // before firing off the 5 retryModelInit calls.
  function markReady(name) {
    modelsReady.add(name);
    if (modelsReady.size === EXPECTED_MODELS.length && !initialStartupComplete) {
      initialStartupComplete = true;
      logger.info(`✅ [Startup] All ${EXPECTED_MODELS.length} models ready — /health returning 200`);
    }
  }

  // Hard-timeout escape hatch: flips initialStartupComplete true regardless
  // of model state after 60s. Without this, a single broken model would
  // keep /health at 503 forever, causing Railway to reject every deploy.
  const hardTimeoutHandle = setTimeout(() => {
    if (!initialStartupComplete) {
      initialStartupComplete = true;
      const missing = EXPECTED_MODELS.filter(n => !modelsReady.has(n));
      logger.error(`❌ [Startup] HARD TIMEOUT after ${STARTUP_HARD_TIMEOUT_MS}ms — ${missing.length}/${EXPECTED_MODELS.length} models still initializing: ${missing.join(', ')}. /health forced to 200 but site may be degraded.`);
      cronMonitor.logError('startup-hard-timeout', new Error(`Missing models: ${missing.join(', ')}`))
        .catch(() => {});
    }
  }, STARTUP_HARD_TIMEOUT_MS);
  if (hardTimeoutHandle.unref) hardTimeoutHandle.unref();

  // V2.36.0 (heatingoil-36uz): Supplier model — retries via retryModelInit
  retryModelInit({
    name: 'Supplier',
    initFn: () => initSupplierModel(sequelize),
    syncFn: (m) => m.sync({ alter: false }),
    cronMonitor, logger,
    onReady: () => markReady('Supplier'),
  });

  // V2.36.0 (heatingoil-36uz): CommunityDelivery model — retries via retryModelInit
  retryModelInit({
    name: 'CommunityDelivery',
    initFn: () => initCommunityDeliveryModel(sequelize),
    syncFn: (m) => m.sync({ alter: true }),
    cronMonitor, logger,
    onReady: () => markReady('CommunityDelivery'),
  });

  // V2.36.0 (heatingoil-36uz): CommunityDeliveryRaw model.
  // Depends on CommunityDelivery being ready — the `if (!CD) return null`
  // guard forces retry until Delivery's getter returns a non-null model.
  // Without this guard, initCommunityDeliveryRawModel(sequelize, null)
  // returns a non-null-but-associationless model (CommunityDeliveryRaw.js:100
  // skips the associations block when arg is null), which would silently
  // poison include:[{ as:'rawData' }] queries at runtime.
  retryModelInit({
    name: 'CommunityDeliveryRaw',
    initFn: () => {
      const { getCommunityDeliveryModel } = require('./src/models/CommunityDelivery');
      const CD = getCommunityDeliveryModel();
      if (!CD) return null;
      return initCommunityDeliveryRawModel(sequelize, CD);
    },
    syncFn: (m) => m.sync({ alter: true }),
    cronMonitor, logger,
    onReady: () => markReady('CommunityDeliveryRaw'),
  });

  // V2.36.0 (heatingoil-36uz): SupplierPrice model — retries via retryModelInit
  retryModelInit({
    name: 'SupplierPrice',
    initFn: () => initSupplierPriceModel(sequelize),
    syncFn: (m) => m.sync({ alter: false }),
    cronMonitor, logger,
    onReady: (model) => {
      app.locals.SupplierPrice = model;  // preserve existing side effect from old L480
      markReady('SupplierPrice');
    },
  });

  // V2.36.0 (heatingoil-36uz): UserLocation model — retries via retryModelInit.
  // Preserves the inline require pattern of the original code.
  retryModelInit({
    name: 'UserLocation',
    initFn: () => {
      const { initUserLocationModel } = require('./src/models/UserLocation');
      return initUserLocationModel(sequelize);
    },
    syncFn: (m) => m.sync({ alter: false }),
    cronMonitor, logger,
    onReady: () => markReady('UserLocation'),
  });

  cronMonitor.cleanup(); // Clean old heartbeats/errors on startup (non-blocking)

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
    await cronMonitor.run('afternoon-scrape', async () => {
      const result = await runScraper({ sequelize, logger });
      logger.info(`✅ Afternoon scrape: ${result.success} success, ${result.failed} failed`);

      // Check scraper health (drift + anomaly detection)
      const alerts = cronMonitor.checkScraperHealth(result);
      if (alerts.length > 0) {
        alerts.forEach(a => logger.warn(`[ScraperHealth] ${a.level}: ${a.message}`));
      }

      // V2.32.0: Compute ZIP price stats after scrape
      const zipStatsComputer = new ZipStatsComputer(sequelize, logger);
      const statsResult = await zipStatsComputer.compute();
      if (statsResult.success) {
        logger.info(`✅ ZIP stats: ${statsResult.updated} ZIPs (${statsResult.durationMs}ms)`);
      }

      // V2.33.0: Compute County price stats after ZIP stats
      const countyStatsComputer = new CountyStatsComputer(sequelize, logger);
      const countyResult = await countyStatsComputer.compute();
      if (countyResult.success) {
        logger.info(`✅ County stats: ${countyResult.updated} counties (${countyResult.durationMs}ms)`);
      }

      return { success: result.success, failed: result.failed, rejected: result.rejected, alerts };
    });
  }, {
    timezone: 'UTC' // 21:00 UTC = 4:00 PM EST
  });
  logger.info('⏰ Afternoon scrape scheduled: daily at 4:00 PM EST (+ ZIP/County stats)');

  // V2.17.0: Schedule SEO + Supplier page generation at 11:00 PM EST (low traffic period)
  // Generates static HTML pages directly on Railway for Google indexability
  cron.schedule('0 23 * * *', async () => {
    const websiteDir = path.join(__dirname, 'website');

    // SEO + Supplier pages (tracked together as the main 11 PM job)
    await cronMonitor.run('seo-pages', async () => {
      const { generateSEOPages } = require('./scripts/generate-seo-pages');
      const result = await generateSEOPages({ sequelize, logger, outputDir: websiteDir, dryRun: false });
      if (result.success) logger.info(`✅ SEO pages: ${result.statePages} state pages`);
      return result;
    }, { retry: true });

    await cronMonitor.run('supplier-pages', async () => {
      const { generateSupplierPages } = require('./scripts/generate-supplier-pages');
      const supplierLogger = { log: (...args) => logger.info(args.join(' ')), error: (...args) => logger.error(args.join(' ')) };
      const result = await generateSupplierPages({ sequelize, logger: supplierLogger, websiteDir });
      if (result.success) logger.info(`✅ Supplier pages: ${result.generated} pages`);
      return result;
    }, { retry: true });

    await cronMonitor.run('zip-elite-pages', async () => {
      const { generateZipElitePages } = require('./scripts/generate-zip-elite-pages');
      const result = await generateZipElitePages({ sequelize, logger, outputDir: websiteDir, dryRun: false });
      if (result.success) logger.info(`✅ ZIP Elite pages: ${result.generated} pages`);
      return result;
    }, { retry: false });

    await cronMonitor.run('county-elite-pages', async () => {
      const { generateCountyElitePages } = require('./scripts/generate-county-elite-pages');
      const result = await generateCountyElitePages({ sequelize, logger, outputDir: websiteDir, dryRun: false });
      if (result.success) logger.info(`✅ County Elite pages: ${result.generated} pages`);
      return result;
    }, { retry: false });

    // Kerosene pages (less critical, no retry)
    await cronMonitor.run('kerosene-pages', async () => {
      const { generateSEOPages: generateSEOKerosene } = require('./scripts/generate-seo-pages');
      const result = await generateSEOKerosene({ sequelize, logger, outputDir: websiteDir, dryRun: false, fuelType: 'kerosene' });
      if (result.success) logger.info(`✅ Kerosene SEO: ${result.statePages} states`);

      const { generateCountyElitePages: generateCountyKerosene } = require('./scripts/generate-county-elite-pages');
      const countyResult = await generateCountyKerosene({ sequelize, logger, outputDir: websiteDir, dryRun: false, fuelType: 'kerosene' });
      if (countyResult.success) logger.info(`✅ Kerosene county: ${countyResult.generated} pages`);

      const { generateFuelHub } = require('./scripts/generate-fuel-hub');
      const hubResult = await generateFuelHub({ sequelize, logger, dryRun: false, fuel: 'kerosene' });
      if (hubResult.success) logger.info(`✅ Kerosene hub: ${hubResult.states} states`);

      return { seo: result, county: countyResult, hub: hubResult };
    }, { retry: false });

    // Propane pages (V1.8)
    await cronMonitor.run('propane-pages', async () => {
      const { generateSEOPages: generateSEOPropane } = require('./scripts/generate-seo-pages');
      const result = await generateSEOPropane({ sequelize, logger, outputDir: websiteDir, dryRun: false, fuelType: 'propane' });
      if (result.success) logger.info(`✅ Propane SEO: ${result.statePages} states`);

      const { generateCountyElitePages: generateCountyPropane } = require('./scripts/generate-county-elite-pages');
      const countyResult = await generateCountyPropane({ sequelize, logger, outputDir: websiteDir, dryRun: false, fuelType: 'propane' });
      if (countyResult.success) logger.info(`✅ Propane county: ${countyResult.generated} pages`);

      const { generateFuelHub: generateFuelHubPropane } = require('./scripts/generate-fuel-hub');
      const hubResult = await generateFuelHubPropane({ sequelize, logger, dryRun: false, fuel: 'propane' });
      if (hubResult.success) logger.info(`✅ Propane hub: ${hubResult.states} states`);

      return { seo: result, county: countyResult, hub: hubResult };
    }, { retry: false });
  }, {
    timezone: 'America/New_York'
  });
  // Generate heating cost estimator pages (runs after SEO pages so sitemap fragment is fresh)
  cron.schedule('15 23 * * *', async () => {
    await cronMonitor.run('heating-cost-pages', async () => {
      const { generateHeatingCostPages } = require('./scripts/generate-heating-cost-pages');
      const result = await generateHeatingCostPages({ sequelize, dryRun: false });
      logger.info(`✅ Heating cost pages: ${result.totalStatePages} state, ${result.totalCountyPages} county`);
      return result;
    }, { retry: true });
  }, { timezone: 'America/New_York' });
  // Generate average heating bill pages (C2)
  cron.schedule('20 23 * * *', async () => {
    await cronMonitor.run('avg-bill-pages', async () => {
      const { generateAvgBillPages } = require('./scripts/generate-avg-bill-pages');
      const result = await generateAvgBillPages({ sequelize, dryRun: false });
      logger.info(`✅ Avg Bill pages: ${result.totalStatePages} state, ${result.totalCountyPages} county`);
      return result;
    }, { retry: true });
  }, { timezone: 'America/New_York' });
  // Generate price trend pages (C4)
  cron.schedule('25 23 * * *', async () => {
    await cronMonitor.run('price-trend-pages', async () => {
      const { generatePriceTrendPages } = require('./scripts/generate-price-trend-pages');
      const result = await generatePriceTrendPages({ sequelize, dryRun: false });
      logger.info(`✅ Price Trend pages: ${result.totalStatePages} state, ${result.totalCountyPages} county`);
      return result;
    }, { retry: true });
  }, { timezone: 'America/New_York' });
  // Regenerate sitemap after all page generators have completed
  cron.schedule('30 23 * * *', async () => {
    await cronMonitor.run('sitemap', async () => {
      const { regenerateSitemap } = require('./scripts/generate-sitemap');
      const result = regenerateSitemap({ logger, dryRun: false });
      logger.info(`✅ Sitemap: ${result.urlCount} URLs`);
      return result;
    }, { retry: false });
  }, { timezone: 'America/New_York' });
  // Update for-suppliers page stats (after all page generators)
  cron.schedule('35 23 * * *', async () => {
    await cronMonitor.run('supplier-page-stats', async () => {
      const { main: updateSupplierStats } = require('./scripts/update-supplier-page-stats');
      await updateSupplierStats();
      logger.info('✅ Supplier page stats updated');
      return { success: true };
    }, { retry: false });
  }, { timezone: 'America/New_York' });

  logger.info('📄 SEO + Supplier + ZIP/County Elite page generator scheduled: daily at 11:00 PM EST');
  logger.info('📄 Heating cost + Avg Bill + Price Trend page generators scheduled: daily at 11:15/11:20/11:25 PM EST');
  logger.info('📄 Sitemap regeneration scheduled: daily at 11:30 PM EST');
  logger.info('📊 Supplier page stats scheduled: daily at 11:35 PM EST');

  // Regenerate all pages on startup. Generated pages are gitignored — fresh
  // containers start with empty regen folders and populate them from the DB here.
  // Each generator uses generate-then-swap — if generation fails for a state and
  // an earlier run on this container left pages in place, old pages survive;
  // on a truly fresh Railway container, a state-level failure results in missing
  // pages (acceptable — 404 is better than stale/wrong data; cronMonitor.run
  // wraps each generator so failures surface in the 6AM email).
  // Health endpoint does NOT gate on pagesReady (API must be available immediately).
  (async () => {
    const websiteDir = path.join(__dirname, 'website');
    // Hang backstop only — NOT a deploy gate. The original 90s value was a
    // fail-fast threshold for the pagesReady /health gate, which was removed
    // 2026-03-04 (f26e7a956). Normal SEO-page generation runs ~83s, so 90s
    // produced false "timed out" failures on any deploy that booted under DB
    // load. 300s only ever trips on a genuine hang, while still bounding a
    // stuck generator so its CronMonitor heartbeat can't sit at "running"
    // forever.
    const GENERATOR_TIMEOUT = 300000; // 300s per generator (hang backstop)

    const withTimeout = (promise, name) => Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(`${name} timed out after ${GENERATOR_TIMEOUT / 1000}s`)), GENERATOR_TIMEOUT))
    ]);

    const startTime = Date.now();
    logger.info('📄 [Startup] Beginning page generation (health gated)...');

    try {
      const results = await Promise.allSettled([
        (async () => {
          const monitored = await cronMonitor.run('startup-seo-pages', () => withTimeout((async () => {
            const { generateSEOPages } = require('./scripts/generate-seo-pages');
            return generateSEOPages({ sequelize, logger, outputDir: websiteDir, dryRun: false });
          })(), 'SEO pages'), { retry: false, lock: false });
          if (!monitored.success) throw new Error(monitored.error || 'SEO pages failed');
          return monitored.result;
        })(),

        (async () => {
          const monitored = await cronMonitor.run('startup-supplier-pages', () => withTimeout((async () => {
            const { generateSupplierPages } = require('./scripts/generate-supplier-pages');
            const supplierLogger = { log: (...args) => logger.info(args.join(' ')), error: (...args) => logger.error(args.join(' ')) };
            return generateSupplierPages({ sequelize, logger: supplierLogger, websiteDir });
          })(), 'Supplier pages'), { retry: false, lock: false });
          if (!monitored.success) throw new Error(monitored.error || 'Supplier pages failed');
          return monitored.result;
        })(),

        (async () => {
          const monitored = await cronMonitor.run('startup-zip-elite-pages', () => withTimeout((async () => {
            const { generateZipElitePages } = require('./scripts/generate-zip-elite-pages');
            return generateZipElitePages({ sequelize, logger, outputDir: websiteDir, dryRun: false });
          })(), 'ZIP Elite pages'), { retry: false, lock: false });
          if (!monitored.success) throw new Error(monitored.error || 'ZIP Elite pages failed');
          return monitored.result;
        })(),

        (async () => {
          const monitored = await cronMonitor.run('startup-county-elite-pages', () => withTimeout((async () => {
            const { generateCountyElitePages } = require('./scripts/generate-county-elite-pages');
            return generateCountyElitePages({ sequelize, logger, outputDir: websiteDir, dryRun: false });
          })(), 'County Elite pages'), { retry: false, lock: false });
          if (!monitored.success) throw new Error(monitored.error || 'County Elite pages failed');
          return monitored.result;
        })(),

        (async () => {
          const monitored = await cronMonitor.run('startup-heating-cost-pages', () => withTimeout((async () => {
            const { generateHeatingCostPages } = require('./scripts/generate-heating-cost-pages');
            return generateHeatingCostPages({ sequelize, dryRun: false });
          })(), 'Heating Cost pages'), { retry: false, lock: false });
          if (!monitored.success) throw new Error(monitored.error || 'Heating Cost pages failed');
          return monitored.result;
        })(),

        (async () => {
          const monitored = await cronMonitor.run('startup-avg-bill-pages', () => withTimeout((async () => {
            const { generateAvgBillPages } = require('./scripts/generate-avg-bill-pages');
            return generateAvgBillPages({ sequelize, dryRun: false });
          })(), 'Avg Bill pages'), { retry: false, lock: false });
          if (!monitored.success) throw new Error(monitored.error || 'Avg Bill pages failed');
          return monitored.result;
        })(),

        (async () => {
          const monitored = await cronMonitor.run('startup-price-trend-pages', () => withTimeout((async () => {
            const { generatePriceTrendPages } = require('./scripts/generate-price-trend-pages');
            return generatePriceTrendPages({ sequelize, dryRun: false });
          })(), 'Price Trend pages'), { retry: false, lock: false });
          if (!monitored.success) throw new Error(monitored.error || 'Price Trend pages failed');
          return monitored.result;
        })()
      ]);

      const names = ['SEO', 'Supplier', 'ZIP Elite', 'County Elite', 'Heating Cost', 'Avg Bill', 'Price Trend'];
      let allSucceeded = true;

      results.forEach((result, i) => {
        if (result.status === 'fulfilled' && result.value.success) {
          logger.info(`✅ [Startup] ${names[i]} pages generated`);
        } else {
          allSucceeded = false;
          const reason = result.status === 'rejected' ? result.reason.message : (result.value.error || result.value.reason || 'unknown');
          logger.error(`❌ [Startup] ${names[i]} page generation failed: ${reason}`);
        }
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      if (allSucceeded) {
        pagesReady = true;
        logger.info(`✅ [Startup] All pages generated in ${elapsed}s — health endpoint now returning 200`);

        // V2.34.0: Generate kerosene pages after health gate passes (non-blocking)
        try {
          const keroResults = await Promise.allSettled([
            (async () => {
              const monitored = await cronMonitor.run('startup-kerosene-seo', async () => {
                const { generateSEOPages: genSEOKero } = require('./scripts/generate-seo-pages');
                return genSEOKero({ sequelize, logger, outputDir: websiteDir, dryRun: false, fuelType: 'kerosene' });
              }, { retry: false, lock: false });
              if (!monitored.success) throw new Error(monitored.error || 'Kerosene SEO failed');
              return monitored.result;
            })(),
            (async () => {
              const monitored = await cronMonitor.run('startup-kerosene-county', async () => {
                const { generateCountyElitePages: genCountyKero } = require('./scripts/generate-county-elite-pages');
                return genCountyKero({ sequelize, logger, outputDir: websiteDir, dryRun: false, fuelType: 'kerosene' });
              }, { retry: false, lock: false });
              if (!monitored.success) throw new Error(monitored.error || 'Kerosene County failed');
              return monitored.result;
            })(),
            (async () => {
              const monitored = await cronMonitor.run('startup-kerosene-hub', async () => {
                const { generateFuelHub } = require('./scripts/generate-fuel-hub');
                return generateFuelHub({ sequelize, logger, dryRun: false, fuel: 'kerosene' });
              }, { retry: false, lock: false });
              if (!monitored.success) throw new Error(monitored.error || 'Kerosene Hub failed');
              return monitored.result;
            })(),
            (async () => {
              const monitored = await cronMonitor.run('startup-propane-seo', async () => {
                const { generateSEOPages: genSEOPropane } = require('./scripts/generate-seo-pages');
                return genSEOPropane({ sequelize, logger, outputDir: websiteDir, dryRun: false, fuelType: 'propane' });
              }, { retry: false, lock: false });
              if (!monitored.success) throw new Error(monitored.error || 'Propane SEO failed');
              return monitored.result;
            })(),
            (async () => {
              const monitored = await cronMonitor.run('startup-propane-county', async () => {
                const { generateCountyElitePages: genCountyPropane } = require('./scripts/generate-county-elite-pages');
                return genCountyPropane({ sequelize, logger, outputDir: websiteDir, dryRun: false, fuelType: 'propane' });
              }, { retry: false, lock: false });
              if (!monitored.success) throw new Error(monitored.error || 'Propane County failed');
              return monitored.result;
            })(),
            (async () => {
              const monitored = await cronMonitor.run('startup-propane-hub', async () => {
                const { generateFuelHub: generateFuelHubPropane } = require('./scripts/generate-fuel-hub');
                return generateFuelHubPropane({ sequelize, logger, dryRun: false, fuel: 'propane' });
              }, { retry: false, lock: false });
              if (!monitored.success) throw new Error(monitored.error || 'Propane Hub failed');
              return monitored.result;
            })()
          ]);
          const keroNames = ['Kerosene SEO', 'Kerosene County', 'Kerosene Hub', 'Propane SEO', 'Propane County', 'Propane Hub'];
          keroResults.forEach((r, i) => {
            if (r.status === 'fulfilled' && r.value.success) {
              logger.info(`✅ [Startup] ${keroNames[i]} pages generated`);
            } else {
              const reason = r.status === 'rejected' ? r.reason.message : (r.value?.error || 'unknown');
              logger.warn(`⚠️ [Startup] ${keroNames[i]} generation failed (non-blocking): ${reason}`);
            }
          });
        } catch (error) {
          logger.warn('⚠️ [Startup] Kerosene page generation failed (non-blocking):', error.message);
        }

        // Regenerate sitemap after ALL generators have completed (replaces legacy fragment-based approach)
        try {
          const monitored = await cronMonitor.run('startup-sitemap', async () => {
            const { regenerateSitemap } = require('./scripts/generate-sitemap');
            return regenerateSitemap({ logger, dryRun: false });
          }, { retry: false, lock: false });
          if (monitored.success && monitored.result) {
            logger.info(`✅ [Startup] Sitemap regenerated: ${monitored.result.urlCount} URLs`);
          } else if (!monitored.success) {
            logger.warn('⚠️ [Startup] Sitemap regeneration failed:', monitored.error);
          }
        } catch (error) {
          logger.warn('⚠️ [Startup] Sitemap regeneration failed (non-blocking):', error.message);
        }
      } else {
        logger.error(`❌ [Startup] Page generation incomplete after ${elapsed}s — health returning 503, Railway will keep old deploy`);
      }
    } catch (error) {
      logger.error(`❌ [Startup] Page generation crashed: ${error.message}`);
    }
  })();

  // V2.6.0: Monthly reset of phone_only suppliers (1st of each month at 6 AM EST)
  // Gives blocked sites another chance after a month
  cron.schedule('0 11 1 * *', async () => {
    await cronMonitor.run('monthly-reset', async () => {
      const count = await monthlyReset(sequelize, logger);
      logger.info(`✅ Monthly reset: ${count} suppliers reset`);
      return { suppliersReset: count };
    }, { retry: false });
  }, {
    timezone: 'UTC' // 11 AM UTC = 6 AM EST
  });
  logger.info('🔄 Monthly phone_only reset scheduled: 1st of each month at 6 AM EST');

  // Platform metrics snapshot (2:15 AM ET daily)
  cron.schedule('15 2 * * *', async () => {
    await cronMonitor.run('platform-metrics', async () => {
      const metricsService = new PlatformMetricsService(sequelize, logger);
      const result = await metricsService.computeDaily();
      if (result.success) {
        logger.info(`[PlatformMetrics] Complete: ${result.day} (${result.durationMs}ms)`);
      }
      return result;
    });
  }, { timezone: 'America/New_York' });
  logger.info('📊 Platform metrics scheduled: daily at 2:15 AM ET');

  // Monthly EIA energy rates refresh (18th at 3:30 AM ET — after EIA's mid-month publish window)
  // Updates electricity-rates.json + gas-rates.json from EIA API v2 (residential by state).
  // EIA publishes monthly with ~2-month lag; running on the 18th catches the latest period.
  cron.schedule('30 3 18 * *', async () => {
    await cronMonitor.run('eia-energy-rates', async () => {
      const { refreshEnergyRates } = require('./scripts/refresh-energy-rates');
      const result = await refreshEnergyRates();
      logger.info(`[EIA] Refresh complete: electric=${result.electric.period} gas=${result.gas.period}`);
      return { success: true, ...result };
    });
  }, { timezone: 'America/New_York' });
  logger.info('⚡ EIA energy rates refresh scheduled: monthly on 18th at 3:30 AM ET');

  // Price alert daily check (8:00 AM ET)
  cron.schedule('0 8 * * *', async () => {
    await cronMonitor.run('price-alerts', async () => {
      const alertService = new PriceAlertService(sequelize, logger);
      const result = await alertService.runDailyCheck();
      if (result.success) {
        logger.info(`[PriceAlert] sent=${result.alerts_sent}, skipped=${result.alerts_skipped} (${result.durationMs}ms)`);
      }
      return result;
    });
  }, { timezone: 'America/New_York' });
  logger.info('🔔 Price alerts scheduled: daily at 8:00 AM ET');

  // Smart Quote Request crons (heatingoil-h1fy)
  if (process.env.DISABLE_QUOTE_SYSTEM !== 'true') {
    const quoteService = app.locals.quoteRequestService;
    if (quoteService) {
      // 6:00 AM ET — Dispatch queued after-hours quote requests (suppliers plan routes early)
      cron.schedule('0 6 * * *', async () => {
        await cronMonitor.run('quote-queue', async () => {
          return await quoteService.processQueue();
        });
      }, { timezone: 'America/New_York' });

      // Every hour — Fallback notifications + outcome checks + expiration
      cron.schedule('0 * * * *', async () => {
        await cronMonitor.run('quote-maintenance', async () => {
          const [fallbacks, outcomes, expired] = await Promise.all([
            quoteService.sendFallbackNotification(),
            quoteService.sendOutcomeCheck(),
            quoteService.expireStaleRequests(),
          ]);
          return { fallbacks, outcomes, expired };
        });
      }, { timezone: 'America/New_York' });

      logger.info('📋 Quote request crons scheduled: 7 AM dispatch + hourly maintenance');
    }
  }

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
  // V3.1.0: Pass cronMonitor for cron health in daily email
  scheduleCoverageIntelligence(cronMonitor);
});

// V2.3.0: Coverage Intelligence Scheduler
// V2.4.0: Also sends Activity Analytics report
function scheduleCoverageIntelligence(cronMonitor) {
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

  // Calculate time until 6 AM Eastern (DST-aware)
  const getNext6amEastern = () => {
    const now = new Date();
    // Round-trip through toLocaleString to get Eastern wall-clock time
    const etStr = now.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false
    });
    const etNow = new Date(etStr); // Eastern wall-clock interpreted as UTC
    const offsetMs = now - etNow; // UTC-to-Eastern offset (4h EDT, 5h EST)

    // Build 6 AM target in Eastern wall-clock space, then convert to real UTC
    const etTarget = new Date(etNow);
    etTarget.setHours(6, 0, 0, 0);
    if (etNow >= etTarget) {
      etTarget.setDate(etTarget.getDate() + 1);
    }
    return new Date(etTarget.getTime() + offsetMs);
  };

  const scheduleNextRun = () => {
    const now = new Date();
    const target = getNext6amEastern();

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

      // 2.5. Run outreach email sequence (E2/E3 follow-ups)
      try {
        const OutreachSequenceService = require('./src/services/OutreachSequenceService');
        const outreach = new OutreachSequenceService(sequelize, logger);
        const outreachResult = await outreach.runSequence();
        if (!outreachResult.skipped) {
          logger.info(`[OutreachSequence] E2=${outreachResult.e2_sent}, E3=${outreachResult.e3_sent}, complete=${outreachResult.complete}`);
        }
      } catch (error) {
        logger.error('[OutreachSequence] Daily run failed:', error.message);
      }

      // 2.6. V2.5.0: Check for stale supplier prices and send reminders
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
            const priceReviewUrl = `${baseUrl}/price-review.html?mltoken=${token}`;

            // Count review items (excluding dismissed) for the email
            let reviewCount = 0;
            try {
              const [countResult] = await sequelize.query(`
                SELECT COUNT(DISTINCT s.id) as cnt FROM suppliers s
                WHERE s.active = true AND s.website IS NOT NULL AND s.allow_price_display = true
                  AND NOT EXISTS (SELECT 1 FROM price_review_dismissals d WHERE d.supplier_id = s.id AND d.dismiss_until > NOW())
                  AND (
                    EXISTS (
                      SELECT 1 FROM supplier_prices sp WHERE sp.supplier_id = s.id AND sp.is_valid = true
                      AND (sp.price_per_gallon < 2.00 OR sp.price_per_gallon > 5.50)
                    )
                    OR s.scrape_status IN ('cooldown', 'phone_only')
                    OR NOT EXISTS (SELECT 1 FROM supplier_prices sp2 WHERE sp2.supplier_id = s.id AND sp2.is_valid = true)
                  )
              `);
              reviewCount = parseInt(countResult[0]?.cnt || 0);
            } catch (countErr) {
              // price_review_dismissals table may not exist yet
            }

            priceReviewLink = { url: priceReviewUrl, count: reviewCount };
            logger.info(`[DailyReports] Generated price review magic link (${reviewCount} items)`);
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

          // Gather claim funnel data for daily email
          let claimFunnel = null;
          try {
            const [funnelCounts] = await sequelize.query(`
              SELECT action, COUNT(*) as count
              FROM audit_logs
              WHERE action IN ('outreach_email_sent', 'claim_page_view', 'claim_submitted', 'claim_verified')
                AND created_at > NOW() - INTERVAL '7 days'
              GROUP BY action
            `);
            const fc = {};
            funnelCounts.forEach(r => { fc[r.action] = parseInt(r.count); });

            const [pendingRows] = await sequelize.query(
              "SELECT COUNT(*) as count FROM supplier_claims WHERE status = 'pending'"
            );

            // Sequence status
            const [seqStatus] = await sequelize.query(`
              SELECT
                COUNT(*) FILTER (WHERE action = 'outreach_email_sent'
                  AND NOT EXISTS (SELECT 1 FROM audit_logs a2 WHERE a2.action = 'outreach_email_2_sent'
                    AND COALESCE(a2.details::jsonb->>'supplier_slug', a2.details::jsonb->>'slug') =
                        COALESCE(audit_logs.details::jsonb->>'supplier_slug', audit_logs.details::jsonb->>'slug'))
                ) as awaiting_e2,
                COUNT(*) FILTER (WHERE action = 'outreach_email_2_sent'
                  AND NOT EXISTS (SELECT 1 FROM audit_logs a2 WHERE a2.action = 'outreach_email_3_sent'
                    AND COALESCE(a2.details::jsonb->>'supplier_slug', a2.details::jsonb->>'slug') =
                        COALESCE(audit_logs.details::jsonb->>'supplier_slug', audit_logs.details::jsonb->>'slug'))
                ) as awaiting_e3,
                COUNT(*) FILTER (WHERE action = 'outreach_sequence_complete') as complete
              FROM audit_logs
              WHERE action IN ('outreach_email_sent', 'outreach_email_2_sent', 'outreach_sequence_complete')
                AND created_at > NOW() - INTERVAL '60 days'
            `);

            claimFunnel = {
              outreach_sent: fc.outreach_email_sent || 0,
              pages_viewed: fc.claim_page_view || 0,
              claims_submitted: fc.claim_submitted || 0,
              pending_review: parseInt(pendingRows[0]?.count || 0),
              sequence_status: seqStatus[0] ? {
                awaiting_e2: parseInt(seqStatus[0].awaiting_e2 || 0),
                awaiting_e3: parseInt(seqStatus[0].awaiting_e3 || 0),
                complete: parseInt(seqStatus[0].complete || 0)
              } : null
            };

            logger.info(`[DailyReports] Claim funnel: ${claimFunnel.outreach_sent} sent, ${claimFunnel.pending_review} pending`);
          } catch (err) {
            logger.warn('[DailyReports] Failed to gather claim funnel data:', err.message);
          }

          // V2.13.0: Generate supplier diagnostics (categorized failure analysis)
          let supplierDiagnostics = null;
          try {
            const { SupplierDiagnosticsService } = require('./src/services/SupplierDiagnosticsService');
            const diagService = new SupplierDiagnosticsService(sequelize);
            supplierDiagnostics = await diagService.generateDiagnostics();
            logger.info(`[DailyReports] Supplier diagnostics: ${supplierDiagnostics.totalIssues} issues in ${supplierDiagnostics.groups.length} categories, ${supplierDiagnostics.probedCount} probed`);
          } catch (err) {
            logger.warn('[DailyReports] Failed to generate supplier diagnostics:', err.message);
          }

          // V3.1.1: Gather recent price rejections (outliers + drops) from last 24h
          let priceRejections = null;
          try {
            const [rejectRows] = await sequelize.query(`
              SELECT rejections FROM scrape_runs
              WHERE run_at > NOW() - INTERVAL '24 hours'
                AND rejections != '[]'::jsonb
              ORDER BY run_at DESC LIMIT 1
            `);
            if (rejectRows.length > 0 && rejectRows[0].rejections && rejectRows[0].rejections.length > 0) {
              priceRejections = rejectRows[0].rejections;
              logger.info(`[DailyReports] ${priceRejections.length} price rejection(s) in last 24h`);
            }
          } catch (err) {
            logger.warn('[DailyReports] Failed to gather price rejections:', err.message);
          }

          // V3.1.0: Gather cron health for daily email
          let cronHealth = null;
          try {
            cronHealth = await cronMonitor.getDailyHealth();
            const failedJobs = cronHealth.jobs.filter(j => j.status === 'failed' || j.status === 'missing');
            if (failedJobs.length > 0) {
              logger.warn(`[DailyReports] ${failedJobs.length} cron job(s) need attention: ${failedJobs.map(j => j.name).join(', ')}`);
            }
          } catch (err) {
            logger.warn('[DailyReports] Failed to gather cron health:', err.message);
          }

          const emailSent = await mailer.sendCombinedDailyReport(coverageReport, activityReport, priceReviewLink, clickStats, claimFunnel, supplierDiagnostics, cronHealth, priceRejections);
          if (emailSent) {
            logger.info('[DailyReports] Combined report sent');
          } else {
            logger.error('[DailyReports] Combined report FAILED to send');
          }
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

        // V3.1.0: Add business metrics with week-over-week deltas
        let businessMetrics = null;
        try {
          const [thisWeek] = await sequelize.query(`
            SELECT
              COUNT(DISTINCT aa.zip_code) FILTER (WHERE aa.created_at > NOW() - INTERVAL '7 days') as searches_7d,
              COUNT(DISTINCT aa.zip_code) FILTER (WHERE aa.created_at BETWEEN NOW() - INTERVAL '14 days' AND NOW() - INTERVAL '7 days') as searches_prev_7d,
              (SELECT COUNT(*) FROM supplier_prices WHERE scraped_at > NOW() - INTERVAL '7 days' AND is_valid = true) as prices_scraped_7d,
              (SELECT COUNT(*) FROM supplier_prices WHERE scraped_at BETWEEN NOW() - INTERVAL '14 days' AND NOW() - INTERVAL '7 days' AND is_valid = true) as prices_scraped_prev_7d,
              (SELECT COUNT(*) FROM supplier_clicks WHERE created_at > NOW() - INTERVAL '7 days') as clicks_7d,
              (SELECT COUNT(*) FROM supplier_clicks WHERE created_at BETWEEN NOW() - INTERVAL '14 days' AND NOW() - INTERVAL '7 days') as clicks_prev_7d,
              (SELECT COUNT(*) FROM supplier_clicks WHERE action_type = 'call' AND created_at > NOW() - INTERVAL '7 days') as calls_7d,
              (SELECT COUNT(*) FROM supplier_clicks WHERE action_type = 'call' AND created_at BETWEEN NOW() - INTERVAL '14 days' AND NOW() - INTERVAL '7 days') as calls_prev_7d,
              (SELECT COUNT(*) FROM price_alert_subscribers WHERE active = true) as alert_subscribers,
              (SELECT COUNT(*) FROM suppliers WHERE active = true AND allow_price_display = true) as active_suppliers
            FROM api_activity aa
            WHERE aa.created_at > NOW() - INTERVAL '14 days'
          `);
          businessMetrics = thisWeek[0];
        } catch (bmErr) {
          logger.warn('[WeeklySummary] Business metrics query failed:', bmErr.message);
        }

        if (stats) {
          await mailer.sendWeeklySummary(stats, businessMetrics);
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