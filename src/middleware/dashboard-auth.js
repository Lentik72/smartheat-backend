/**
 * Dashboard Authentication Middleware
 *
 * Simple password-based authentication for the analytics dashboard.
 * Uses DASHBOARD_PASSWORD environment variable.
 *
 * Features:
 * - Password auth via Authorization header (Basic auth format)
 * - Rate limiting: 100 requests per 15 minutes per IP
 * - Login attempt logging
 */

const rateLimit = require('express-rate-limit');

// Dashboard-specific rate limiter (stricter than general API)
const dashboardRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per 15 minutes
  message: { error: 'Too many dashboard requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  handler: (req, res) => {
    const logger = req.app?.locals?.logger;
    if (logger) {
      logger.warn(`[Dashboard] Rate limit exceeded for IP: ${req.ip}`);
    }
    res.status(429).json({ error: 'Too many requests. Try again in 15 minutes.' });
  }
});

// Track failed login attempts (in-memory, resets on restart)
const failedAttempts = new Map();
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

/**
 * Password authentication middleware
 * Expects: Authorization: Basic base64(admin:password)
 * Or: Authorization: Bearer password (for simplicity)
 */
const dashboardAuth = (req, res, next) => {
  const logger = req.app?.locals?.logger;
  const password = process.env.DASHBOARD_PASSWORD;

  // Check if password is configured
  if (!password) {
    if (logger) {
      logger.error('[Dashboard] DASHBOARD_PASSWORD not configured');
    }
    return res.status(503).json({
      error: 'Dashboard not configured',
      message: 'Set DASHBOARD_PASSWORD environment variable'
    });
  }

  // Check for IP lockout
  const ip = req.ip;
  const attempts = failedAttempts.get(ip);
  if (attempts && attempts.count >= MAX_FAILED_ATTEMPTS) {
    const timeSinceLast = Date.now() - attempts.lastAttempt;
    if (timeSinceLast < LOCKOUT_DURATION) {
      if (logger) {
        logger.warn(`[Dashboard] IP ${ip} locked out (${attempts.count} failed attempts)`);
      }
      return res.status(429).json({
        error: 'Too many failed attempts',
        retryAfter: Math.ceil((LOCKOUT_DURATION - timeSinceLast) / 1000)
      });
    } else {
      // Lockout expired, reset
      failedAttempts.delete(ip);
    }
  }

  // Get authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({
      error: 'Authentication required',
      hint: 'Use Authorization: Bearer <password>'
    });
  }

  let providedPassword = null;

  // Support both "Bearer password" and "Basic base64" formats
  if (authHeader.startsWith('Bearer ')) {
    providedPassword = authHeader.substring(7);
  } else if (authHeader.startsWith('Basic ')) {
    try {
      const decoded = Buffer.from(authHeader.substring(6), 'base64').toString();
      // Basic auth format: username:password - we only care about password
      const colonIndex = decoded.indexOf(':');
      if (colonIndex !== -1) {
        providedPassword = decoded.substring(colonIndex + 1);
      } else {
        providedPassword = decoded;
      }
    } catch (e) {
      return res.status(401).json({ error: 'Invalid authentication format' });
    }
  } else {
    return res.status(401).json({
      error: 'Invalid authentication format',
      hint: 'Use Authorization: Bearer <password>'
    });
  }

  // Validate password
  if (providedPassword !== password) {
    // Track failed attempt
    const current = failedAttempts.get(ip) || { count: 0, lastAttempt: 0 };
    failedAttempts.set(ip, {
      count: current.count + 1,
      lastAttempt: Date.now()
    });

    if (logger) {
      logger.warn(`[Dashboard] Failed login attempt from ${ip} (attempt ${current.count + 1})`);
    }

    return res.status(401).json({ error: 'Invalid password' });
  }

  // Success - clear any failed attempts
  failedAttempts.delete(ip);

  if (logger) {
    logger.debug(`[Dashboard] Authenticated request from ${ip}`);
  }

  next();
};

/**
 * Combined middleware: rate limiter + auth
 */
const dashboardProtection = [dashboardRateLimiter, dashboardAuth];

module.exports = {
  dashboardAuth,
  dashboardRateLimiter,
  dashboardProtection
};
