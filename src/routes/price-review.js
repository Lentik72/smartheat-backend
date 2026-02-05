/**
 * Price Review Routes
 * Admin interface for manual price verification
 *
 * Workflow:
 * 1. Daily email generates magic link via POST /api/price-review/generate-link
 * 2. Admin clicks link in email → opens portal with valid token
 * 3. GET /api/price-review - Returns list of sites needing review
 * 4. POST /api/price-review/submit - Submit verified price(s)
 *
 * Authentication: Magic link tokens (48-hour expiry) or admin master token
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

// Master admin token for internal/emergency access (set in Railway env vars)
const ADMIN_MASTER_TOKEN = process.env.ADMIN_REVIEW_TOKEN || 'smartheat-price-review-2024';

// Secret for generating magic links (should be set in env vars)
const MAGIC_LINK_SECRET = process.env.MAGIC_LINK_SECRET || 'smartheat-magic-link-secret-2024';

/**
 * Generate a secure random token
 */
function generateToken() {
  return crypto.randomBytes(32).toString('hex'); // 64 chars
}

/**
 * Validate magic link token or master admin token
 */
const requireAuth = async (req, res, next) => {
  const sequelize = req.app.locals.sequelize;
  const logger = req.app.locals.logger;

  // Check for token in header or query param
  const token = req.headers['x-review-token'] || req.query.token || req.query.mltoken;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Check if it's the master admin token (for internal/emergency use)
  if (token === ADMIN_MASTER_TOKEN) {
    req.authType = 'master';
    return next();
  }

  // Check if it's a valid magic link token
  try {
    const [rows] = await sequelize.query(`
      SELECT id, expires_at, revoked_at, use_count
      FROM magic_link_tokens
      WHERE token = :token
        AND purpose = 'price_review'
    `, { replacements: { token } });

    if (rows.length === 0) {
      logger?.warn(`[PriceReview] Invalid token attempted`);
      return res.status(401).json({ error: 'Invalid or expired link' });
    }

    const magicLink = rows[0];

    // Check if revoked
    if (magicLink.revoked_at) {
      return res.status(401).json({ error: 'This link has been revoked' });
    }

    // Check if expired
    if (new Date(magicLink.expires_at) < new Date()) {
      return res.status(401).json({ error: 'This link has expired. Check your email for a newer one.' });
    }

    // Update usage stats
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'] || '';

    await sequelize.query(`
      UPDATE magic_link_tokens
      SET
        first_used_at = COALESCE(first_used_at, NOW()),
        last_used_at = NOW(),
        use_count = use_count + 1,
        ip_address = :ip,
        user_agent = :userAgent
      WHERE id = :id
    `, {
      replacements: { id: magicLink.id, ip, userAgent }
    });

    req.authType = 'magic_link';
    req.magicLinkId = magicLink.id;
    next();

  } catch (error) {
    logger?.error('[PriceReview] Auth error:', error.message);
    return res.status(500).json({ error: 'Authentication failed' });
  }
};

/**
 * POST /api/price-review/generate-link
 * Generate a new magic link for email (internal use only - requires master token)
 *
 * Returns: { url, token, expiresAt }
 */
router.post('/generate-link', async (req, res) => {
  const sequelize = req.app.locals.sequelize;
  const logger = req.app.locals.logger;

  // Only allow with master token or internal secret
  const authToken = req.headers['x-internal-token'] || req.headers['x-review-token'];
  if (authToken !== ADMIN_MASTER_TOKEN && authToken !== MAGIC_LINK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

    await sequelize.query(`
      INSERT INTO magic_link_tokens (token, purpose, expires_at)
      VALUES (:token, 'price_review', :expiresAt)
    `, {
      replacements: { token, expiresAt }
    });

    // Build the full URL
    const baseUrl = process.env.BACKEND_URL || 'https://smartheat-backend-production.up.railway.app';
    const url = `${baseUrl}/price-review.html?mltoken=${token}`;

    logger?.info(`[PriceReview] Generated new magic link, expires: ${expiresAt.toISOString()}`);

    res.json({
      success: true,
      url,
      token,
      expiresAt: expiresAt.toISOString()
    });

  } catch (error) {
    logger?.error('[PriceReview] Generate link error:', error.message);
    res.status(500).json({ error: 'Failed to generate link' });
  }
});

/**
 * POST /api/price-review/revoke-link
 * Revoke a magic link (internal use only)
 */
router.post('/revoke-link', async (req, res) => {
  const sequelize = req.app.locals.sequelize;

  const authToken = req.headers['x-internal-token'] || req.headers['x-review-token'];
  if (authToken !== ADMIN_MASTER_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ error: 'Token required' });
  }

  try {
    await sequelize.query(`
      UPDATE magic_link_tokens
      SET revoked_at = NOW()
      WHERE token = :token
    `, { replacements: { token } });

    res.json({ success: true, message: 'Link revoked' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to revoke link' });
  }
});

/**
 * GET /api/price-review
 * Returns sites that need manual price verification:
 * - Sites with suspicious prices (< $2.50 or > $4.50)
 * - Sites in cooldown (recent failures)
 * - Sites marked phone_only
 * - Sites with stale prices (> 7 days old)
 */
router.get('/', requireAuth, async (req, res) => {
  const sequelize = req.app.locals.sequelize;
  const logger = req.app.locals.logger;

  try {
    // 1. Sites with suspicious prices
    const [suspiciousPrices] = await sequelize.query(`
      SELECT DISTINCT ON (s.id)
        s.id,
        s.name,
        s.website,
        s.city,
        s.state,
        sp.price_per_gallon as current_price,
        sp.scraped_at,
        sp.source_type,
        sp.notes,
        'suspicious_price' as review_reason
      FROM suppliers s
      JOIN supplier_prices sp ON s.id = sp.supplier_id
      WHERE s.active = true
        AND s.website IS NOT NULL
        AND sp.is_valid = true
        AND (sp.price_per_gallon < 2.00 OR sp.price_per_gallon > 5.00)
      ORDER BY s.id, sp.scraped_at DESC
    `);

    // 2. Sites in cooldown or phone_only (from scrape_status column on suppliers)
    let blockedSites = [];
    try {
      const [result] = await sequelize.query(`
        SELECT
          id,
          name,
          website,
          city,
          state,
          scrape_status as status,
          consecutive_scrape_failures,
          last_scrape_failure_at,
          scrape_cooldown_until as cooldown_until,
          'scrape_blocked' as review_reason
        FROM suppliers
        WHERE active = true
          AND website IS NOT NULL
          AND allow_price_display = true
          AND (scrape_status = 'cooldown' OR scrape_status = 'phone_only')
      `);
      blockedSites = result;
    } catch (err) {
      // scrape_status column may not exist - skip this check
      logger?.info('[PriceReview] scrape_status column not found, skipping blocked sites check');
    }

    // 3. Sites with stale prices (> 7 days, no recent update)
    // V2.10.3: Fixed query to check LATEST price per supplier, not any old price
    const [stalePrices] = await sequelize.query(`
      WITH latest_prices AS (
        SELECT DISTINCT ON (supplier_id)
          supplier_id,
          price_per_gallon,
          scraped_at
        FROM supplier_prices
        WHERE is_valid = true
        ORDER BY supplier_id, scraped_at DESC
      )
      SELECT
        s.id,
        s.name,
        s.website,
        s.city,
        s.state,
        lp.price_per_gallon as current_price,
        lp.scraped_at,
        'stale_price' as review_reason
      FROM suppliers s
      LEFT JOIN latest_prices lp ON s.id = lp.supplier_id
      WHERE s.active = true
        AND s.website IS NOT NULL
        AND s.allow_price_display = true
        AND (lp.scraped_at < NOW() - INTERVAL '7 days' OR lp.supplier_id IS NULL)
      ORDER BY lp.scraped_at NULLS FIRST
      LIMIT 20
    `);

    // 4. V2.11.0: Suppliers that need initial manual pricing (never had a price, have website)
    // These are suppliers we've added but can't auto-scrape (JS-loaded prices, 403, etc.)
    const [needsInitialPrice] = await sequelize.query(`
      SELECT
        s.id,
        s.name,
        s.website,
        s.city,
        s.state,
        NULL as current_price,
        NULL as scraped_at,
        'needs_initial_price' as review_reason
      FROM suppliers s
      WHERE s.active = true
        AND s.website IS NOT NULL
        AND s.allow_price_display = true
        AND NOT EXISTS (
          SELECT 1 FROM supplier_prices sp
          WHERE sp.supplier_id = s.id AND sp.is_valid = true
        )
      ORDER BY s.created_at DESC
      LIMIT 15
    `);

    // Combine and deduplicate by supplier ID
    const reviewItems = [];
    const seenIds = new Set();

    for (const item of [...suspiciousPrices, ...blockedSites, ...needsInitialPrice, ...stalePrices]) {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        reviewItems.push({
          supplierId: item.id,
          name: item.name,
          website: item.website,
          city: item.city,
          state: item.state,
          currentPrice: item.current_price ? parseFloat(item.current_price) : null,
          lastScraped: item.scraped_at,
          reviewReason: item.review_reason,
          status: item.status || null,
          notes: item.notes || null
        });
      }
    }

    // Sort by review reason priority: suspicious > blocked > needs_initial > stale
    const priorityOrder = { suspicious_price: 0, scrape_blocked: 1, needs_initial_price: 2, stale_price: 3 };
    reviewItems.sort((a, b) => priorityOrder[a.reviewReason] - priorityOrder[b.reviewReason]);

    logger?.info(`[PriceReview] Returning ${reviewItems.length} items for review`);

    res.json({
      success: true,
      count: reviewItems.length,
      items: reviewItems,
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    logger?.error('[PriceReview] Error fetching review items:', error.message);
    res.status(500).json({ error: 'Failed to fetch review items', message: error.message });
  }
});

/**
 * POST /api/price-review/submit
 * Submit verified price(s) from manual review
 *
 * Body: { prices: [{ supplierId, price, minGallons? }] }
 */
router.post('/submit', requireAuth, async (req, res) => {
  const sequelize = req.app.locals.sequelize;
  const logger = req.app.locals.logger;

  try {
    const { prices } = req.body;

    if (!prices || !Array.isArray(prices) || prices.length === 0) {
      return res.status(400).json({ error: 'prices array required' });
    }

    const results = [];

    for (const { supplierId, price, minGallons } of prices) {
      if (!supplierId || !price) {
        results.push({ supplierId, success: false, error: 'Missing supplierId or price' });
        continue;
      }

      const priceNum = parseFloat(price);
      if (isNaN(priceNum) || priceNum < 1.50 || priceNum > 6.00) {
        results.push({ supplierId, success: false, error: 'Price must be between $1.50 and $6.00' });
        continue;
      }

      try {
        // Get supplier info for logging
        const [supplier] = await sequelize.query(
          'SELECT name, website FROM suppliers WHERE id = :id',
          { replacements: { id: supplierId } }
        );

        if (supplier.length === 0) {
          results.push({ supplierId, success: false, error: 'Supplier not found' });
          continue;
        }

        // Insert new price with manual source_type
        await sequelize.query(`
          INSERT INTO supplier_prices (
            id, supplier_id, price_per_gallon, min_gallons, fuel_type,
            source_type, scraped_at, expires_at, is_valid, notes,
            verified_at, verification_method, verified_by, created_at, updated_at
          ) VALUES (
            gen_random_uuid(), :supplierId, :price, :minGallons, 'heating_oil',
            'manual', NOW(), NOW() + INTERVAL '7 days', true, 'Admin manual verification',
            NOW(), 'admin_review_portal', 'admin', NOW(), NOW()
          )
        `, {
          replacements: {
            supplierId,
            price: priceNum,
            minGallons: minGallons || 100
          }
        });

        logger?.info(`[PriceReview] Updated ${supplier[0].name}: $${priceNum.toFixed(3)}`);
        results.push({
          supplierId,
          name: supplier[0].name,
          price: priceNum,
          success: true
        });

      } catch (err) {
        results.push({ supplierId, success: false, error: err.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    logger?.info(`[PriceReview] Submitted ${successCount}/${prices.length} prices`);

    res.json({
      success: true,
      submitted: successCount,
      total: prices.length,
      results
    });

  } catch (error) {
    logger?.error('[PriceReview] Submit error:', error.message);
    res.status(500).json({ error: 'Failed to submit prices', message: error.message });
  }
});

/**
 * GET /api/price-review/stats
 * Get overview of price data health
 */
router.get('/stats', requireAuth, async (req, res) => {
  const sequelize = req.app.locals.sequelize;

  try {
    const [stats] = await sequelize.query(`
      SELECT
        COUNT(DISTINCT s.id) FILTER (WHERE s.active = true AND s.website IS NOT NULL) as total_with_website,
        COUNT(DISTINCT s.id) FILTER (WHERE s.active = true AND s.allow_price_display = true) as price_enabled,
        COUNT(DISTINCT sp.supplier_id) FILTER (WHERE sp.scraped_at > NOW() - INTERVAL '24 hours') as updated_24h,
        COUNT(DISTINCT sp.supplier_id) FILTER (WHERE sp.scraped_at > NOW() - INTERVAL '7 days') as updated_7d,
        COUNT(DISTINCT sp.supplier_id) FILTER (WHERE sp.price_per_gallon < 2.00 OR sp.price_per_gallon > 5.00) as suspicious_prices,
        COUNT(DISTINCT sp.supplier_id) FILTER (WHERE sp.source_type = 'manual') as manual_prices
      FROM suppliers s
      LEFT JOIN supplier_prices sp ON s.id = sp.supplier_id AND sp.is_valid = true
    `);

    // Get backoff stats from suppliers table
    let backoffStats = [{ active_scraping: 0, in_cooldown: 0, phone_only: 0 }];
    try {
      const [result] = await sequelize.query(`
        SELECT
          COUNT(*) FILTER (WHERE scrape_status = 'active' OR scrape_status IS NULL) as active_scraping,
          COUNT(*) FILTER (WHERE scrape_status = 'cooldown') as in_cooldown,
          COUNT(*) FILTER (WHERE scrape_status = 'phone_only') as phone_only
        FROM suppliers
        WHERE active = true AND website IS NOT NULL
      `);
      backoffStats = result;
    } catch (err) {
      // scrape_status column may not exist
    }

    res.json({
      success: true,
      stats: {
        suppliers: {
          totalWithWebsite: parseInt(stats[0].total_with_website),
          priceEnabled: parseInt(stats[0].price_enabled),
          updatedLast24h: parseInt(stats[0].updated_24h),
          updatedLast7d: parseInt(stats[0].updated_7d),
          suspiciousPrices: parseInt(stats[0].suspicious_prices),
          manualPrices: parseInt(stats[0].manual_prices)
        },
        scraping: {
          activeScraping: parseInt(backoffStats[0]?.active_scraping || 0),
          inCooldown: parseInt(backoffStats[0]?.in_cooldown || 0),
          phoneOnly: parseInt(backoffStats[0]?.phone_only || 0)
        }
      },
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    res.status(500).json({ error: 'Failed to get stats', message: error.message });
  }
});

module.exports = router;
