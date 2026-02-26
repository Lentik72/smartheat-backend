/**
 * Claim Page Route — Server-Rendered
 * GET /claim/:slug
 *
 * Renders a full HTML page with supplier demand data embedded as
 * data attributes. No public demand API — all computation server-side.
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

// ── Caching ──────────────────────────────────────────────────────
// Activity ranks: precomputed percentile rankings for all suppliers (1h TTL)
let activityRanksCache = { data: null, ts: 0 };
const CACHE_TTL = 3600000; // 1 hour

// Per-supplier demand cache (slug → { clicks, calls, websites, ts })
const supplierDemandCache = new Map();

// ── Slug Sweep Detection ─────────────────────────────────────────
// Track distinct slugs per IP in 10-min window
const slugSweepTracker = new Map(); // ip → { slugs: Set, ts }
const SWEEP_WINDOW = 600000; // 10 minutes
const SWEEP_THRESHOLD = 50;

function checkSlugSweep(ip, slug) {
  const now = Date.now();
  let entry = slugSweepTracker.get(ip);
  if (!entry || now - entry.ts > SWEEP_WINDOW) {
    entry = { slugs: new Set(), ts: now };
    slugSweepTracker.set(ip, entry);
  }
  entry.slugs.add(slug);
  return entry.slugs.size > SWEEP_THRESHOLD;
}

// Periodic cleanup of stale sweep entries + cache size logging (every 5 min)
setInterval(() => {
  const cutoff = Date.now() - SWEEP_WINDOW;
  let swept = 0;
  for (const [ip, entry] of slugSweepTracker) {
    if (entry.ts < cutoff) { slugSweepTracker.delete(ip); swept++; }
  }
  if (slugSweepTracker.size > 0 || supplierDemandCache.size > 50) {
    console.log(`[ClaimPage] Cache: ${supplierDemandCache.size} demand entries, ${slugSweepTracker.size} sweep IPs (cleaned ${swept})`);
  }
}, 300000);

// ── Activity Level Computation ───────────────────────────────────
async function getActivityRanks(sequelize) {
  const now = Date.now();
  if (activityRanksCache.data && now - activityRanksCache.ts < CACHE_TTL) {
    return activityRanksCache.data;
  }

  const [rows] = await sequelize.query(`
    SELECT s.slug, COUNT(sc.id) as click_count
    FROM suppliers s
    LEFT JOIN supplier_clicks sc ON sc.supplier_id = s.id
      AND sc.created_at > NOW() - INTERVAL '30 days'
    WHERE s.active = true
    GROUP BY s.slug
    ORDER BY click_count DESC
  `);

  const ranks = {};
  const total = rows.length;

  if (total < 10) {
    // Small dataset: simplified ranking
    const median = total > 0 ? parseInt(rows[Math.floor(total / 2)].click_count) : 0;
    for (const row of rows) {
      const clicks = parseInt(row.click_count);
      if (clicks === 0) ranks[row.slug] = 'new';
      else if (clicks > median) ranks[row.slug] = 'active';
      else ranks[row.slug] = 'growing';
    }
  } else {
    // Percentile-based ranking
    for (let i = 0; i < total; i++) {
      const percentile = ((total - i) / total) * 100;
      const clicks = parseInt(rows[i].click_count);
      if (clicks === 0) ranks[rows[i].slug] = 'new';
      else if (percentile >= 75) ranks[rows[i].slug] = 'high';
      else if (percentile >= 50) ranks[rows[i].slug] = 'active';
      else if (percentile >= 25) ranks[rows[i].slug] = 'growing';
      else ranks[rows[i].slug] = 'new';
    }
  }

  activityRanksCache = { data: ranks, ts: now };
  console.log(`[ClaimPage] Activity ranks recomputed: ${total} suppliers ranked`);
  return ranks;
}

// ── Per-Supplier Demand Data ─────────────────────────────────────
async function getSupplierDemand(sequelize, supplierId, slug) {
  const cached = supplierDemandCache.get(slug);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached;
  }

  const [rows] = await sequelize.query(`
    SELECT
      COUNT(*) as total_clicks,
      COUNT(*) FILTER (WHERE action_type = 'call') as calls,
      COUNT(*) FILTER (WHERE action_type = 'website') as websites
    FROM supplier_clicks
    WHERE supplier_id = :id
      AND created_at > NOW() - INTERVAL '30 days'
  `, { replacements: { id: supplierId } });

  const data = {
    clicks: parseInt(rows[0]?.total_clicks || 0),
    calls: parseInt(rows[0]?.calls || 0),
    websites: parseInt(rows[0]?.websites || 0),
    ts: Date.now()
  };

  supplierDemandCache.set(slug, data);
  return data;
}

// ── HTML Helpers ─────────────────────────────────────────────────
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatPhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

// Activity badge config
const ACTIVITY_LABELS = {
  high: { text: 'HIGH DEMAND', cls: 'badge-high' },
  active: { text: 'ACTIVE', cls: 'badge-active' },
  growing: { text: 'GROWING', cls: 'badge-growing' },
  new: { text: 'NEW', cls: 'badge-new' }
};

// ── Page Renderer ────────────────────────────────────────────────
function renderClaimPage(supplier, demand, activityLevel, hasPrice, isClaimed) {
  const name = escapeHtml(supplier.name);
  const city = escapeHtml(supplier.city) || '';
  const state = supplier.state || '';
  const location = city && state ? `${city}, ${state}` : (city || state);
  const phone = formatPhone(supplier.phone);
  const badge = ACTIVITY_LABELS[activityLevel] || ACTIVITY_LABELS.new;
  const ts = Math.floor(Date.now() / 1000);

  // Build stats section based on state
  let statsHtml;
  if (isClaimed) {
    statsHtml = `
      <div class="claim-card claim-verified-card">
        <div class="claim-card-icon">&#9989;</div>
        <h2>This Listing Has Been Verified</h2>
        <p>This supplier has already claimed and verified their listing on HomeHeat.</p>
        <a href="/for-suppliers" class="btn btn-secondary">Learn More About HomeHeat for Suppliers</a>
      </div>`;
  } else if (demand.clicks === 0) {
    statsHtml = `
      <div class="claim-card demand-card">
        <div class="claim-card-header">
          <span class="activity-badge ${badge.cls}">${badge.text}</span>
        </div>
        <p class="demand-zero">Your listing is live but hasn't received clicks yet. Claimed suppliers with displayed prices get more visibility.</p>
      </div>`;
  } else {
    const priceNudge = !hasPrice
      ? '<p class="demand-nudge">Suppliers displaying prices typically receive more engagement.</p>'
      : '';
    statsHtml = `
      <div class="claim-card demand-card">
        <div class="claim-card-header">
          <span>HOMEOWNERS ARE COMPARING SUPPLIERS IN YOUR AREA</span>
          <span class="activity-badge ${badge.cls}">${badge.text}</span>
        </div>
        <div class="demand-own">
          <p class="demand-headline">Your listing received:</p>
          <p class="demand-number">${demand.clicks} click${demand.clicks !== 1 ? 's' : ''}</p>
          <p class="demand-breakdown">${demand.calls} call${demand.calls !== 1 ? 's' : ''}, ${demand.websites} website visit${demand.websites !== 1 ? 's' : ''}</p>
          <p class="demand-period">in the last 30 days</p>
          <p class="demand-intent">These homeowners were actively comparing prices.</p>
          ${priceNudge}
        </div>
        <div class="locked-grid">
          <div class="locked-stat">
            <span class="locked-number">247</span>
            <span class="lock-icon">&#128274;</span>
            <span class="locked-label">Area searches</span>
          </div>
          <div class="locked-stat">
            <span class="locked-number">83%</span>
            <span class="lock-icon">&#128274;</span>
            <span class="locked-label">Clicks going to competitors</span>
          </div>
          <div class="locked-stat">
            <span class="locked-number">12%</span>
            <span class="lock-icon">&#128274;</span>
            <span class="locked-label">Your click share</span>
          </div>
          <div class="locked-stat">
            <span class="locked-number">+$0.18</span>
            <span class="lock-icon">&#128274;</span>
            <span class="locked-label">Price vs market</span>
          </div>
        </div>
        <p class="locked-tease">See how many homeowners chose competitors instead of you.</p>
      </div>`;
  }

  // Form section (only for unclaimed suppliers)
  let formHtml = '';
  if (!isClaimed) {
    const verifyMethod = phone
      ? `We verify by calling your business: <strong>${phone}</strong>`
      : `We'll verify your ownership by email`;

    formHtml = `
      <div class="claim-card claim-form-card">
        <h2>Claim Your Listing</h2>
        <p class="claim-form-sub">Capture customers already comparing you.</p>

        <form id="claim-form" novalidate>
          <div class="form-group">
            <label for="claimant-name">Your name</label>
            <input type="text" id="claimant-name" name="claimantName" required autocomplete="name" placeholder="John Smith">
          </div>
          <div class="form-group">
            <label for="claimant-email">Email</label>
            <input type="email" id="claimant-email" name="claimantEmail" required autocomplete="email" placeholder="john@company.com">
          </div>
          <div class="form-group">
            <label for="claimant-phone">Your phone</label>
            <input type="tel" id="claimant-phone" name="claimantPhone" autocomplete="tel" placeholder="(555) 123-4567">
          </div>
          <div class="form-group">
            <label for="claimant-role">Role</label>
            <select id="claimant-role" name="claimantRole">
              <option value="owner">Owner</option>
              <option value="manager">Manager</option>
              <option value="employee">Employee</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div style="position:absolute;left:-9999px" aria-hidden="true">
            <input type="text" name="website_url" tabindex="-1" autocomplete="off">
          </div>

          <p class="verify-note">${verifyMethod}</p>

          <div id="form-error" class="form-error" style="display:none"></div>

          <button type="submit" class="btn btn-primary btn-claim" id="claim-submit">Claim My Listing</button>
          <p class="claim-micro">Free. Takes 2 minutes.</p>
        </form>
      </div>

      <div class="claim-card claim-benefits-card">
        <h2>When You Claim, You Get</h2>
        <ul class="benefits-list">
          <li>&#9989; Verified Business badge</li>
          <li>&#128176; Display your current price</li>
          <li>&#128200; Full demand analytics</li>
          <li>&#128241; Update price by text: <strong>(845) 335-8855</strong></li>
        </ul>
      </div>

      <div id="claim-success" class="claim-card claim-success-card" style="display:none">
        <div class="claim-card-icon">&#127881;</div>
        <h2>Claim Submitted!</h2>
        <p>We'll call <strong>${phone || 'you'}</strong> within 24–48 hours to verify.</p>
        <div class="sms-cta">
          <p>While you wait, update your price by texting:</p>
          <p class="sms-number">(845) 335-8855</p>
        </div>
      </div>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-HCNTVGNVJ9"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-HCNTVGNVJ9');
  </script>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Claim ${name} on HomeHeat</title>
  <meta name="description" content="Claim your ${name} listing on HomeHeat to display prices, connect with customers, and access demand analytics.">
  <meta name="robots" content="noindex, nofollow">
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
  <meta name="apple-itunes-app" content="app-id=6747320571">
  <meta name="color-scheme" content="light only">
  <link rel="stylesheet" href="/style.min.css?v=27">
  <link rel="stylesheet" href="/claim.css?v=1">
</head>
<body>
  <nav class="nav">
    <div class="nav-container">
      <a href="/" class="nav-logo">
        <img src="/images/app-icon-small.png" alt="HomeHeat" class="nav-logo-icon">
        HomeHeat
      </a>
      <button class="nav-toggle" aria-label="Toggle navigation">
        <span></span><span></span><span></span>
      </button>
      <ul class="nav-links">
        <li><a href="/">Home</a></li>
        <li><a href="/prices">Prices</a></li>
        <li><a href="/for-suppliers">For Suppliers</a></li>
        <li><a href="/learn/">Learn</a></li>
        <li><a href="/support">Support</a></li>
      </ul>
    </div>
  </nav>

  <main class="claim-page">
    <div class="claim-header">
      <h1>${name}</h1>
      <p class="claim-location">${location}</p>
    </div>

    <div id="demand-stats"
      data-slug="${escapeHtml(supplier.slug)}"
      data-clicks="${demand.clicks}"
      data-calls="${demand.calls}"
      data-websites="${demand.websites}"
      data-activity="${activityLevel}"
      data-has-price="${hasPrice}"
      data-ts="${ts}">
    </div>

    ${statsHtml}
    ${formHtml}
  </main>

  <footer class="footer">
    <div class="footer-container">
      <div class="footer-logo">
        <img src="/images/app-icon-small.png" alt="HomeHeat" class="footer-logo-icon">
        HomeHeat
      </div>
      <div class="footer-links">
        <a href="/prices">Prices</a>
        <a href="/for-suppliers">For Suppliers</a>
        <a href="/learn/">Learn</a>
        <a href="/support">Support</a>
        <a href="/privacy">Privacy</a>
      </div>
      <p class="footer-copy">&copy; ${new Date().getFullYear()} HomeHeat. All rights reserved.</p>
    </div>
  </footer>

  <script src="/js/nav.js?v=24"></script>
  ${!isClaimed ? '<script src="/js/claim.js?v=1"></script>' : ''}
</body>
</html>`;
}

// ── 404 Page ─────────────────────────────────────────────────────
function render404() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Supplier Not Found | HomeHeat</title>
  <meta name="robots" content="noindex, nofollow">
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
  <meta name="color-scheme" content="light only">
  <link rel="stylesheet" href="/style.min.css?v=27">
  <link rel="stylesheet" href="/claim.css?v=1">
</head>
<body>
  <nav class="nav">
    <div class="nav-container">
      <a href="/" class="nav-logo">
        <img src="/images/app-icon-small.png" alt="HomeHeat" class="nav-logo-icon">
        HomeHeat
      </a>
      <button class="nav-toggle" aria-label="Toggle navigation">
        <span></span><span></span><span></span>
      </button>
      <ul class="nav-links">
        <li><a href="/">Home</a></li>
        <li><a href="/prices">Prices</a></li>
        <li><a href="/for-suppliers">For Suppliers</a></li>
        <li><a href="/learn/">Learn</a></li>
        <li><a href="/support">Support</a></li>
      </ul>
    </div>
  </nav>

  <main class="claim-page">
    <div class="claim-card" style="text-align:center; padding:48px 24px;">
      <h1 style="font-size:24px; margin-bottom:12px;">Supplier Not Found</h1>
      <p style="color:#666; margin-bottom:24px;">We couldn't find that supplier. It may have been removed or the link is incorrect.</p>
      <a href="/prices" class="btn btn-primary">Search Heating Oil Prices</a>
    </div>
  </main>

  <footer class="footer">
    <div class="footer-container">
      <p class="footer-copy">&copy; ${new Date().getFullYear()} HomeHeat. All rights reserved.</p>
    </div>
  </footer>
  <script src="/js/nav.js?v=24"></script>
</body>
</html>`;
}

// ── Rate Limiter ─────────────────────────────────────────────────
const rateLimit = require('express-rate-limit');
const claimPageLimiter = rateLimit({
  windowMs: 60000,
  max: 30,
  keyGenerator: (req) => req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress,
  handler: (req, res) => {
    res.status(429).send('<html><body><h1>Too many requests</h1><p>Please try again later.</p></body></html>');
  }
});

// ── Route: /claim/ (no slug) → redirect ──────────────────────────
router.get('/', (req, res) => {
  res.redirect(301, '/for-suppliers');
});

// ── Route: /claim/:slug ──────────────────────────────────────────
router.get('/:slug', claimPageLimiter, async (req, res) => {
  const sequelize = req.app.locals.sequelize;
  const logger = req.app.locals.logger;
  const { slug } = req.params;
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;

  // Slug sweep detection: progressive delay
  if (checkSlugSweep(ip, slug)) {
    await new Promise(resolve => setTimeout(resolve, 800));
    logger?.warn(`[ClaimPage] Slug sweep detected: IP ${ip}, ${slugSweepTracker.get(ip)?.slugs.size} slugs`);
  }

  if (!sequelize) {
    return res.status(503).send('<html><body><h1>Service temporarily unavailable</h1></body></html>');
  }

  try {
    // Resolve supplier by slug (active only)
    const [supplierRows] = await sequelize.query(`
      SELECT id, name, slug, phone, city, state, claimed_at
      FROM suppliers
      WHERE slug = :slug AND active = true
      LIMIT 1
    `, { replacements: { slug } });

    if (supplierRows.length === 0) {
      return res.status(404).send(render404());
    }

    const supplier = supplierRows[0];
    const supplierId = supplier.id;
    const isClaimed = !!supplier.claimed_at;

    // Get demand data + activity level + price check in parallel
    const [demand, activityRanks, priceRows] = await Promise.all([
      getSupplierDemand(sequelize, supplierId, slug),
      getActivityRanks(sequelize),
      sequelize.query(`
        SELECT 1 FROM supplier_prices
        WHERE supplier_id = :id AND is_valid = true
        LIMIT 1
      `, { replacements: { id: supplierId } })
    ]);

    const activityLevel = activityRanks[slug] || 'new';
    const hasPrice = priceRows[0]?.length > 0;

    // Log page view for funnel tracking
    try {
      const ipHash = crypto.createHash('sha256').update(ip + 'claim-salt').digest('hex').slice(0, 16);
      await sequelize.query(`
        INSERT INTO audit_logs (action, details, ip_address, created_at, updated_at)
        VALUES ('claim_page_view', :details, :ip, NOW(), NOW())
      `, {
        replacements: {
          details: JSON.stringify({ slug, ipHash }),
          ip
        }
      });
    } catch (logErr) {
      // Non-critical — don't break page render
      logger?.warn(`[ClaimPage] Audit log error: ${logErr.message}`);
    }

    const html = renderClaimPage(supplier, demand, activityLevel, hasPrice, isClaimed);
    res.set('Cache-Control', 'no-store');
    res.send(html);

  } catch (error) {
    logger?.error(`[ClaimPage] Error rendering /claim/${slug}: ${error.message}`);
    res.status(500).send('<html><body><h1>Something went wrong</h1><p>Please try again later.</p></body></html>');
  }
});

module.exports = router;
