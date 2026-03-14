/**
 * Claim Page Route — Server-Rendered
 * GET /claim/:slug
 *
 * Renders a full HTML page with supplier demand data embedded as
 * data attributes. No public demand API — all computation server-side.
 */

const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const router = express.Router();

// Shared nav helper
const { getNavHTML, init: initCountyData } = require('../../scripts/lib/county-data');
initCountyData(path.join(__dirname, '../../website'));

// ── CSS cache-busting (computed once at startup) ─────────────
const WEBSITE_DIR = path.join(__dirname, '../../website');
function getCssHash(filename) {
  const fullPath = path.join(WEBSITE_DIR, filename);
  if (fs.existsSync(fullPath)) {
    return crypto.createHash('md5').update(fs.readFileSync(fullPath)).digest('hex').slice(0, 8);
  }
  return '1';
}
const STYLE_HASH = getCssHash('style.min.css');
const CLAIM_CSS_HASH = getCssHash('claim.css');

// ── Caching ──────────────────────────────────────────────────────
// Activity ranks: precomputed percentile rankings for all suppliers (1h TTL)
let activityRanksCache = { data: null, ts: 0 };
const CACHE_TTL = 3600000; // 1 hour

// Per-supplier demand cache (slug → { clicks, calls, websites, ts })
const supplierDemandCache = new Map();
const supplierMarketCache = new Map();

// Social proof cache: { supplierCount, stateCount, ts }
let socialProofCache = { supplierCount: 0, stateCount: 0, ts: 0 };

async function getSocialProof(sequelize) {
  const now = Date.now();
  if (socialProofCache.ts && now - socialProofCache.ts < CACHE_TTL) {
    return socialProofCache;
  }

  const [rows] = await sequelize.query(`
    SELECT COUNT(*) as total, COUNT(DISTINCT state) as states
    FROM suppliers WHERE active = true
  `);

  socialProofCache = {
    supplierCount: parseInt(rows[0]?.total || 0),
    stateCount: parseInt(rows[0]?.states || 0),
    ts: now
  };
  return socialProofCache;
}

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
    console.log(`[ClaimPage] Cache: ${supplierDemandCache.size} demand, ${supplierMarketCache.size} market, ${slugSweepTracker.size} sweep IPs (cleaned ${swept})`);
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

// ── Per-Supplier Market Data ─────────────────────────────────────
async function getSupplierMarketData(sequelize, supplierId, slug) {
  const cached = supplierMarketCache.get(slug);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached;
  }

  const [rows] = await sequelize.query(`
    WITH supplier_info AS (
      SELECT id, postal_codes_served,
        (SELECT price_per_gallon FROM supplier_prices
         WHERE supplier_id = s.id AND is_valid = true
         ORDER BY scraped_at DESC LIMIT 1) as current_price
      FROM suppliers s WHERE id = :supplierId
    ),
    supplier_zips AS (
      SELECT DISTINCT LEFT(jsonb_array_elements_text(
        (SELECT postal_codes_served FROM supplier_info)
      ), 5) as zip
    ),
    area_searches AS (
      SELECT COALESCE(SUM(request_count), 0) as total
      FROM user_locations ul
      INNER JOIN supplier_zips sz ON LEFT(ul.zip_code, 5) = sz.zip
    ),
    competitor_clicks AS (
      SELECT COUNT(*) as total
      FROM supplier_clicks sc
      INNER JOIN supplier_zips sz ON LEFT(sc.zip_code, 5) = sz.zip
      WHERE sc.supplier_id != :supplierId
        AND sc.created_at > NOW() - INTERVAL '30 days'
    ),
    zip_demand AS (
      SELECT DISTINCT LEFT(sz.zip, 3) as prefix,
        COALESCE(SUM(ul.request_count), 0) as demand_weight
      FROM supplier_zips sz
      LEFT JOIN user_locations ul ON LEFT(ul.zip_code, 5) = sz.zip
      GROUP BY LEFT(sz.zip, 3)
    ),
    market_price AS (
      SELECT CASE
        WHEN SUM(zd.demand_weight) > 0
        THEN ROUND(
          SUM(zcs.median_price::numeric * zd.demand_weight) /
          SUM(zd.demand_weight), 3)
        ELSE ROUND(AVG(zcs.median_price::numeric), 3)
        END as avg_median
      FROM zip_current_stats zcs
      INNER JOIN zip_demand zd ON zcs.zip_prefix = zd.prefix
      WHERE zcs.fuel_type = 'heating_oil'
        AND zcs.median_price IS NOT NULL
    )
    SELECT
      (SELECT total FROM area_searches) as area_searches,
      (SELECT total FROM competitor_clicks) as competitor_clicks,
      (SELECT current_price FROM supplier_info) as current_price,
      (SELECT avg_median FROM market_price) as market_avg_price
  `, { replacements: { supplierId } });

  const row = rows[0] || {};
  const data = {
    areaSearches: parseInt(row.area_searches || 0),
    competitorClicks: parseInt(row.competitor_clicks || 0),
    currentPrice: row.current_price ? parseFloat(row.current_price) : null,
    marketAvgPrice: row.market_avg_price ? parseFloat(row.market_avg_price) : null,
    ts: Date.now()
  };

  supplierMarketCache.set(slug, data);
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

// Activity badge config — reflects area demand, not supplier performance
const ACTIVITY_LABELS = {
  high: { text: 'ACTIVE AREA', cls: 'badge-high' },
  active: { text: 'ACTIVE AREA', cls: 'badge-active' },
  growing: { text: 'GROWING AREA', cls: 'badge-growing' },
  new: { text: 'UNCLAIMED', cls: 'badge-new' }
};

// ── Page Renderer ────────────────────────────────────────────────
function renderClaimPage(supplier, demand, marketData, activityLevel, hasPrice, isClaimed, socialProof) {
  const name = escapeHtml(supplier.name);
  const city = escapeHtml(supplier.city) || '';
  const state = supplier.state || '';
  const location = city && state ? `${city}, ${state}` : (city || state);
  const phone = formatPhone(supplier.phone);
  const badge = ACTIVITY_LABELS[activityLevel] || ACTIVITY_LABELS.new;
  const ts = Math.floor(Date.now() / 1000);
  const hasZips = marketData && marketData.hasZips !== false;

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
  } else if (!hasZips) {
    // No postal_codes_served — can't compute market data
    statsHtml = `
      <div class="claim-card demand-card">
        <p class="demand-zero" style="color:#999;font-style:italic;">No service area configured. Claim to define your coverage.</p>
      </div>`;
  } else if (marketData.areaSearches > 0) {
    // ── Unlocked grid: real computed stats ──
    const ownClicks = demand.clicks;
    const competitorClicks = marketData.competitorClicks;
    const areaSearches = marketData.areaSearches;

    // Click share
    let clickShareHtml;
    if (ownClicks === 0 && competitorClicks === 0) {
      clickShareHtml = '<span class="stat-value stat-neutral">&mdash;</span>';
    } else {
      const share = Math.min(100, Math.max(0, Math.round(ownClicks / (ownClicks + competitorClicks) * 100)));
      const shareClass = share === 0 ? 'stat-negative' : (share < 30 ? 'stat-negative' : '');
      clickShareHtml = `<span class="stat-value ${shareClass}">${share}%</span>`;
    }

    // Price vs market
    let priceVsHtml;
    if (!marketData.currentPrice) {
      priceVsHtml = '<span class="stat-value stat-negative" style="font-size:14px">&#9888; No price listed</span>';
    } else if (!marketData.marketAvgPrice) {
      priceVsHtml = '<span class="stat-value stat-neutral" style="font-size:14px">No market data</span>';
    } else {
      const delta = marketData.currentPrice - marketData.marketAvgPrice;
      if (Math.abs(delta) <= 0.02) {
        priceVsHtml = '<span class="stat-value stat-neutral">At market</span>';
      } else if (delta > 0) {
        priceVsHtml = `<span class="stat-value stat-negative">+$${delta.toFixed(2)}</span>`;
      } else {
        priceVsHtml = `<span class="stat-value stat-positive">-$${Math.abs(delta).toFixed(2)}</span>`;
      }
    }

    // Contextual tease CTA
    const clickShare = (ownClicks + competitorClicks > 0)
      ? Math.round(ownClicks / (ownClicks + competitorClicks) * 100)
      : -1;
    let teaseText;
    if (!hasPrice) {
      teaseText = "Suppliers without prices don\u2019t appear in comparisons. Add yours to start getting clicks.";
    } else if (ownClicks === 0 && competitorClicks > 0) {
      teaseText = `Competitors received ${competitorClicks} click${competitorClicks !== 1 ? 's' : ''} in your area. Claim your listing to start competing.`;
    } else if (ownClicks === 0) {
      teaseText = "Homeowners are searching in your area. Claim to appear when they compare prices.";
    } else if (clickShare >= 0 && clickShare < 30) {
      const competitorShare = 100 - clickShare;
      teaseText = `Competitors are capturing ${competitorShare}% of clicks in your area. Claim to display your price.`;
    } else {
      teaseText = "You're getting attention. Claim to convert these clicks into calls.";
    }

    const priceNudge = !hasPrice
      ? '<p class="demand-nudge">Suppliers displaying prices typically receive more engagement.</p>'
      : '';

    statsHtml = `
      <div class="claim-card demand-card">
        <div class="claim-card-header">
          <span>YOUR LISTING ACTIVITY</span>
          <span class="activity-badge ${badge.cls}">${badge.text}</span>
        </div>
        ${ownClicks > 0 ? `
        <div class="demand-own">
          <div class="demand-own-row">
            <p class="demand-number">${ownClicks}</p>
            <div>
              <p class="demand-number-label">homeowner visit${ownClicks !== 1 ? 's' : ''}</p>
              <p class="demand-breakdown">${demand.calls > 0 ? `${demand.calls} call${demand.calls !== 1 ? 's' : ''} &middot; ` : ''}${demand.websites} website click${demand.websites !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <p class="demand-period">Last 30 days</p>
          ${priceNudge}
        </div>` : `
        <div class="demand-own">
          <div class="demand-own-row">
            <p class="demand-number">0</p>
            <div>
              <p class="demand-number-label">homeowner visits</p>
              <p class="demand-breakdown">${!hasPrice ? 'Suppliers without prices rarely get clicks' : 'Claim to start appearing in comparisons'}</p>
            </div>
          </div>
          ${priceNudge}
        </div>`}
        <div class="locked-grid">
          <div class="unlocked-stat">
            <span class="stat-value">${areaSearches.toLocaleString()}</span>
            <span class="stat-label">Area searches</span>
          </div>
          <div class="unlocked-stat">
            <span class="stat-value">${competitorClicks.toLocaleString()}</span>
            <span class="stat-label">Clicked competitors</span>
          </div>
          <div class="unlocked-stat">
            ${clickShareHtml}
            <span class="stat-label">Your click share</span>
          </div>
          <div class="unlocked-stat">
            ${priceVsHtml}
            <span class="stat-label">Price vs market</span>
          </div>
        </div>
        <p class="locked-tease">${escapeHtml(teaseText)}</p>
      </div>`;
  } else if (demand.clicks === 0) {
    // No area searches, no own clicks — generic prompt
    statsHtml = `
      <div class="claim-card demand-card">
        <div class="claim-card-header">
          <span class="activity-badge ${badge.cls}">${badge.text}</span>
        </div>
        <p class="demand-zero">Homeowners in your area are searching for heating oil. Claim your listing to appear when they compare prices.</p>
      </div>`;
  } else {
    // Has own clicks but no area searches — locked grid as incentive
    const priceNudge = !hasPrice
      ? '<p class="demand-nudge">Suppliers displaying prices typically receive more engagement.</p>'
      : '';
    statsHtml = `
      <div class="claim-card demand-card">
        <div class="claim-card-header">
          <span>YOUR LISTING ACTIVITY</span>
          <span class="activity-badge ${badge.cls}">${badge.text}</span>
        </div>
        <div class="demand-own">
          <div class="demand-own-row">
            <p class="demand-number">${demand.clicks}</p>
            <div>
              <p class="demand-number-label">homeowner visit${demand.clicks !== 1 ? 's' : ''}</p>
              <p class="demand-breakdown">${demand.calls > 0 ? `${demand.calls} call${demand.calls !== 1 ? 's' : ''} &middot; ` : ''}${demand.websites} website click${demand.websites !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <p class="demand-period">Last 30 days</p>
          ${priceNudge}
        </div>
        <div class="locked-grid">
          <div class="locked-stat">
            <span class="lock-icon">&#128274;</span>
            <span class="locked-label">Area searches</span>
          </div>
          <div class="locked-stat">
            <span class="lock-icon">&#128274;</span>
            <span class="locked-label">Clicks going to competitors</span>
          </div>
          <div class="locked-stat">
            <span class="lock-icon">&#128274;</span>
            <span class="locked-label">Your click share</span>
          </div>
          <div class="locked-stat">
            <span class="lock-icon">&#128274;</span>
            <span class="locked-label">Price vs market</span>
          </div>
        </div>
        <p class="locked-tease">See how many homeowners chose competitors instead of you.</p>
      </div>`;
  }

  // Headline + social proof (unclaimed only)
  let headlineHtml = '';
  if (!isClaimed) {
    const proofLine = socialProof.supplierCount > 0
      ? `<p class="claim-social-proof">Join ${socialProof.supplierCount.toLocaleString()} suppliers listed across ${socialProof.stateCount} states</p>`
      : '';
    headlineHtml = `
      <div class="claim-headline">
        <h2>Get calls from homeowners comparing heating oil near you.</h2>
        ${proofLine}
      </div>`;
  }

  // Form section (only for unclaimed suppliers)
  let formHtml = '';
  if (!isClaimed) {
    const verifyMethod = phone
      ? `To confirm you work here, we'll call <strong>${phone}</strong> (the number on file for ${name}).`
      : `We'll verify your connection to this business by email.`;

    formHtml = `
      <div class="claim-card claim-benefits-card">
        <div class="benefits-header">
          <h2>When You Claim, You Get</h2>
          <span class="benefits-free">Free to claim</span>
        </div>
        <div class="benefits-grid">
          <div class="benefit-item">
            <span class="benefit-icon">&#9989;</span>
            <span class="benefit-label">Verified Business badge</span>
          </div>
          <div class="benefit-item">
            <span class="benefit-icon">&#128176;</span>
            <span class="benefit-label">Display your current price</span>
          </div>
          <div class="benefit-item">
            <span class="benefit-icon">&#128200;</span>
            <span class="benefit-label">Full demand analytics</span>
          </div>
          <div class="benefit-item">
            <span class="benefit-icon">&#128241;</span>
            <span class="benefit-label">Update price by text<br><strong>(845) 335-8855</strong></span>
          </div>
        </div>
      </div>

      <div class="claim-card claim-form-card">
        <h2>Claim Your Listing</h2>
        <p class="claim-form-sub">Takes 60 seconds. We'll verify and send your management link.</p>

        <form id="claim-form" novalidate>
          <div class="form-group">
            <label for="claimant-name">Your name</label>
            <input type="text" id="claimant-name" name="claimantName" required autocomplete="name" placeholder="John Smith">
          </div>
          <div class="form-group">
            <label for="claimant-email">Email</label>
            <input type="email" id="claimant-email" name="claimantEmail" required autocomplete="email" inputmode="email" placeholder="john@company.com">
          </div>
          <div class="form-group">
            <label for="claimant-phone">Your phone</label>
            <input type="tel" id="claimant-phone" name="claimantPhone" autocomplete="tel" inputmode="tel" placeholder="(555) 123-4567">
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
          <p class="claim-micro">Free. No contract.</p>
        </form>
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
  <link rel="stylesheet" href="/style.min.css?v=${STYLE_HASH}">
  <link rel="stylesheet" href="/claim.css?v=${CLAIM_CSS_HASH}">
</head>
<body>
  ${getNavHTML(1, '/for-suppliers')}

  <main class="claim-page">
    <div class="claim-header">
      <h1>${name}</h1>
      <p class="claim-location">${location}</p>
      ${!isClaimed ? '<p class="claim-unclaimed-tag">This listing is unclaimed</p>' : ''}
      ${headlineHtml}
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
    <div class="footer-links">
      <a href="/for-suppliers">For Suppliers</a>
      <a href="/prices">Prices</a>
      <a href="/privacy">Privacy Policy</a>
      <a href="/terms">Terms of Service</a>
      <a href="/support">Support</a>
    </div>
    <p class="footer-audience">Built for homeowners who rely on heating oil or propane.</p>
    <p>&copy; ${new Date().getFullYear()} HomeHeat by Tsoir Advisors LLC. All rights reserved.</p>
  </footer>

  <script src="/js/nav.js"></script>
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
  <link rel="stylesheet" href="/style.min.css?v=${STYLE_HASH}">
  <link rel="stylesheet" href="/claim.css?v=${CLAIM_CSS_HASH}">
</head>
<body>
  ${getNavHTML(1, '/for-suppliers')}

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
  <script src="/js/nav.js"></script>
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
      SELECT id, name, slug, phone, city, state, postal_codes_served, claimed_at
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
    const postalCodes = supplier.postal_codes_served;
    const hasZips = Array.isArray(postalCodes) && postalCodes.length > 0;

    // Get demand data + activity level + price check + market data + social proof in parallel
    const fetchPromises = [
      getSupplierDemand(sequelize, supplierId, slug),
      getActivityRanks(sequelize),
      sequelize.query(`
        SELECT 1 FROM supplier_prices
        WHERE supplier_id = :id AND is_valid = true
        LIMIT 1
      `, { replacements: { id: supplierId } }),
      getSocialProof(sequelize)
    ];
    if (hasZips) {
      fetchPromises.push(getSupplierMarketData(sequelize, supplierId, slug));
    }

    const results = await Promise.all(fetchPromises);
    const demand = results[0];
    const activityRanks = results[1];
    const priceRows = results[2];
    const socialProof = results[3];
    const marketData = hasZips ? { ...results[4], hasZips: true } : { hasZips: false };

    const activityLevel = activityRanks[slug] || 'new';
    const hasPrice = priceRows[0]?.length > 0;
    const gridState = !hasZips ? 'no_zips' : (marketData.areaSearches > 0 ? 'unlocked' : 'locked');

    // Log page view for funnel tracking
    try {
      const ipHash = crypto.createHash('sha256').update(ip + 'claim-salt').digest('hex').slice(0, 16);
      await sequelize.query(`
        INSERT INTO audit_logs (id, admin_user_id, admin_email, action, details, ip_address, created_at, updated_at)
        VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'system', 'claim_page_view', :details, :ip, NOW(), NOW())
      `, {
        replacements: {
          details: JSON.stringify({ slug, ipHash, gridState, hasPrice }),
          ip
        }
      });
    } catch (logErr) {
      // Non-critical — don't break page render
      logger?.warn(`[ClaimPage] Audit log error: ${logErr.message}`);
    }

    const html = renderClaimPage(supplier, demand, marketData, activityLevel, hasPrice, isClaimed, socialProof);
    res.set('Cache-Control', 'no-store');
    res.send(html);

  } catch (error) {
    logger?.error(`[ClaimPage] Error rendering /claim/${slug}: ${error.message}`);
    res.status(500).send('<html><body><h1>Something went wrong</h1><p>Please try again later.</p></body></html>');
  }
});

module.exports = router;
