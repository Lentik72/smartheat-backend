/**
 * Supplier Dashboard API Route
 * GET /api/supplier-dashboard?token=XXX
 *
 * Returns the 5-panel dashboard data for a verified supplier's magic link.
 * Reuses token validation from supplier-update.js pattern.
 *
 * POST /api/supplier-dashboard/event — lightweight event logging
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { validateMagicLink } = require('../lib/validate-magic-link');
const router = express.Router();

// Constants
const ORDER_RATE = 0.05;      // 5% of clicks → orders
const AVG_FILL = 175;         // gallons per order
const MIN_AREA_CLICKS = 20;   // threshold for full vs growth mode
const STALE_HOURS = 72;       // 3 days = stale price
const PRIMARY_ZIP_LIMIT = 10; // top ZIPs by click concentration for competitive scoping

// Rate limit: 30 requests/hour per token
const dashboardLimiter = rateLimit({
  windowMs: 3600000,
  max: 30,
  keyGenerator: (req) => req.query.token || req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress,
  handler: (req, res) => {
    res.status(429).json({ success: false, error: 'Too many requests. Please try again later.' });
  }
});

/**
 * GET /api/supplier-dashboard?token=XXX
 */
router.get('/', dashboardLimiter, async (req, res) => {
  const sequelize = req.app.locals.sequelize;
  const logger = req.app.locals.logger;

  try {
    const { token } = req.query;
    const validation = await validateMagicLink(sequelize, token, logger);

    if (!validation.valid) {
      return res.status(401).json({
        success: false,
        error: validation.error,
        status: validation.status
      });
    }

    const supplierId = validation.supplierId;
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'] || '';

    // Update token usage + log dashboard_view
    await Promise.all([
      sequelize.query(`
        UPDATE magic_link_tokens
        SET first_used_at = COALESCE(first_used_at, NOW()),
            last_used_at = NOW(),
            use_count = use_count + 1,
            ip_address = :ip,
            user_agent = :userAgent
        WHERE id = :tokenId
      `, { replacements: { tokenId: validation.tokenId, ip, userAgent } }),

      sequelize.query(`
        INSERT INTO audit_logs (id, admin_user_id, admin_email, action, details, ip_address, created_at, updated_at)
        VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'system', 'dashboard_view',
          :details, :ip, NOW(), NOW())
      `, {
        replacements: {
          details: JSON.stringify({ supplier_id: supplierId, supplier_name: validation.supplierName }),
          ip
        }
      })
    ]);

    // Check if first visit (no prior dashboard_view for this supplier)
    const [firstVisitRows] = await sequelize.query(`
      SELECT COUNT(*) as cnt FROM audit_logs
      WHERE action = 'dashboard_view'
        AND details::jsonb->>'supplier_id' = :supplierId
        AND created_at < NOW() - INTERVAL '10 seconds'
    `, { replacements: { supplierId } });
    const isFirstVisit = parseInt(firstVisitRows[0]?.cnt || 0) === 0;

    // Run all dashboard queries in parallel with graceful degradation
    const [demandResult, competitiveResult, priceResult, priceImpactResult, seasonalResult] = await Promise.all([
      getDemandData(sequelize, supplierId).catch(e => {
        logger?.error('[Dashboard] Demand query error:', e.message);
        return null;
      }),
      getCompetitiveData(sequelize, supplierId).catch(e => {
        logger?.error('[Dashboard] Competitive query error:', e.message);
        return null;
      }),
      getPriceData(sequelize, supplierId).catch(e => {
        logger?.error('[Dashboard] Price query error:', e.message);
        return null;
      }),
      getPriceImpact(sequelize, supplierId).catch(e => {
        logger?.error('[Dashboard] Price impact query error:', e.message);
        return null;
      }),
      getSeasonalContext(sequelize).catch(e => {
        logger?.error('[Dashboard] Seasonal query error:', e.message);
        return null;
      })
    ]);

    // Determine mode
    const areaClicks = demandResult?.areaClicks || 0;
    const hasPrice = !!(priceResult?.comparisonPrice);
    const mode = areaClicks >= MIN_AREA_CLICKS ? 'full' : 'growth';

    // Determine state
    let state = mode; // 'full' or 'growth'
    if (priceResult?.stale) state = 'stale-price';
    if (!hasPrice && demandResult?.clicksLast30Days > 0) state = 'no-price';
    if (hasPrice && (demandResult?.clicksLast30Days || 0) === 0) state = 'zero-traffic';

    // Build competitive section
    let competitive = null;
    if (competitiveResult) {
      const currentPrice = priceResult?.comparisonPrice;
      const lowestInArea = competitiveResult.lowestInArea;
      const avgInArea = competitiveResult.avgInArea;
      const totalCompetitors = competitiveResult.totalCompetitors;

      let deltaFromLowest = null;
      let qualitativeNudge = null;
      let isLowest = false;
      let isTiedForLowest = false;
      let isOnlySupplier = totalCompetitors === 0;

      if (currentPrice && lowestInArea) {
        deltaFromLowest = Math.round((currentPrice - lowestInArea) * 1000) / 1000;

        if (deltaFromLowest <= 0 && competitiveResult.suppliersAtLowest > 1) {
          isTiedForLowest = true;
          qualitativeNudge = "You're tied for lowest with " + (competitiveResult.suppliersAtLowest - 1) +
            " other supplier" + (competitiveResult.suppliersAtLowest > 2 ? "s" : "") +
            " \u2014 freshness and responsiveness determine who homeowners call first.";
        } else if (deltaFromLowest <= 0) {
          isLowest = true;
          qualitativeNudge = "You're the lowest in your area \u2014 stay competitive to maintain your lead.";
        } else if (isOnlySupplier) {
          qualitativeNudge = "You're the only listed supplier in this area \u2014 every search leads to you.";
        } else if (deltaFromLowest > 0.10) {
          qualitativeNudge = `Dropping closer to $${lowestInArea.toFixed(2)} would likely increase your clicks.`;
        } else {
          qualitativeNudge = `You're close to the lowest price. Small adjustments can make a difference.`;
        }
      } else if (!currentPrice) {
        qualitativeNudge = null; // No-price state handled by frontend
      }

      competitive = {
        currentPrice: currentPrice || null,
        lowestInArea: lowestInArea || null,
        avgInArea: avgInArea || null,
        priceSpread: competitiveResult.priceSpread || null,
        deltaFromLowest: deltaFromLowest !== null ? Math.max(0, deltaFromLowest) : null,
        qualitativeNudge,
        isLowest,
        isTiedForLowest,
        isOnlySupplier,
        totalCompetitors,
        ifMatchLowest: {
          estClickIncrease: deltaFromLowest > 0.10 ? '18-30%' : deltaFromLowest > 0 ? '5-15%' : null,
          _tier: 'paid'
        }
      };
    }

    // Build click share section
    let clickShare = null;
    if (competitiveResult?.clickShare) {
      const cs = competitiveResult.clickShare;
      clickShare = {
        ownClicks: cs.ownClicks,
        areaClicks: cs.areaClicks,
        sharePercent: cs.sharePercent,
        shareTrend: cs.shareTrend,
        shareTrendRaw: cs.shareTrendRaw,
        rank: cs.rank,
        totalRanked: cs.totalRanked,
        leaderSharePercent: cs.leaderSharePercent,
        captureVsLeader: cs.captureVsLeader
      };
    }

    // Build demand section
    let demand = null;
    if (demandResult) {
      const d = demandResult;
      const estGallonsPerWeek = mode === 'full' && hasPrice
        ? Math.round(d.areaClicks * ORDER_RATE * AVG_FILL / 4.3)
        : null;
      const estRevenuePerWeek = estGallonsPerWeek && priceResult?.comparisonPrice
        ? Math.round(estGallonsPerWeek * priceResult.comparisonPrice)
        : null;

      demand = {
        viewsLast7Days: d.viewsLast7Days,
        clicksLast30Days: d.clicksLast30Days,
        clicksTrend: d.clicksTrend,
        clicksTrendRaw: d.clicksTrendRaw,
        calls: d.calls,
        websites: d.websites,
        areaSearches: d.areaSearches,
        estGallonsPerWeek,
        estRevenuePerWeek
      };
    }

    // Build missed volume section
    let missedVolume = null;
    if (mode === 'full' && competitiveResult?.clickShare && !competitive?.isOnlySupplier) {
      const cs = competitiveResult.clickShare;
      const missedClicks = cs.areaClicks - cs.ownClicks;
      if (missedClicks > 0 && !competitive?.isLowest) {
        const estGalPerWeek = Math.round(missedClicks * ORDER_RATE * AVG_FILL / 4.3);
        missedVolume = {
          missedClicks,
          missedClicksLabel: `${missedClicks} clicks went to other suppliers in your area`,
          estGalPerWeek: hasPrice ? estGalPerWeek : null,
          estRevenuePerWeek: hasPrice && priceResult?.comparisonPrice
            ? Math.round(estGalPerWeek * priceResult.comparisonPrice)
            : null,
          estFormula: '5% of clicks \u2192 orders \u00d7 175 gal avg fill',
          confidence: cs.areaClicks >= 100 ? 'high' : cs.areaClicks >= 50 ? 'medium' : 'low',
          confidenceBasis: `${cs.areaClicks} area clicks`
        };
      }
    }

    // Build urgency section
    let urgency = null;
    if (competitiveResult?.urgency) {
      urgency = competitiveResult.urgency;
    }

    // Build price section
    let price = null;
    if (priceResult) {
      price = {
        tiers: priceResult.tiers,
        comparisonTier: 150,
        comparisonPrice: priceResult.comparisonPrice,
        stale: priceResult.stale,
        fuelType: 'heating_oil',
        lastUpdated: priceResult.lastUpdated
      };
    }

    // Suppress WoW trends during seasonal decline
    const suppressWoW = seasonalResult?.active && seasonalResult.suppressWoW;

    const response = {
      success: true,
      supplier: {
        id: supplierId,
        name: validation.supplierName,
        slug: validation.supplierSlug,
        city: validation.supplierCity,
        state: validation.supplierState
      },
      generatedAt: new Date().toISOString(),
      mode,
      state,
      isFirstVisit,
      demand: suppressWoW ? { ...demand, clicksTrend: null, clicksTrendRaw: demand?.clicksTrendRaw } : demand,
      competitive,
      clickShare: suppressWoW ? { ...clickShare, shareTrend: null, shareTrendRaw: clickShare?.shareTrendRaw } : clickShare,
      missedVolume,
      urgency,
      priceImpact: priceImpactResult,
      seasonalContext: seasonalResult,
      price
    };

    logger?.info(`[Dashboard] Served dashboard for ${validation.supplierName} (mode=${mode}, state=${state})`);
    res.json(response);

  } catch (error) {
    logger?.error('[Dashboard] Error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to load dashboard' });
  }
});

/**
 * POST /api/supplier-dashboard/event — lightweight event logging
 * Body: { token, event, data }
 */
router.post('/event', async (req, res) => {
  const sequelize = req.app.locals.sequelize;

  try {
    const { token, event, data } = req.body;

    if (!token || !event) {
      return res.status(400).json({ success: false });
    }

    // Lightweight token check (just verify it exists and isn't revoked)
    const [rows] = await sequelize.query(`
      SELECT supplier_id FROM magic_link_tokens
      WHERE token = :token AND purpose = 'supplier_price_update'
        AND revoked_at IS NULL AND expires_at > NOW()
      LIMIT 1
    `, { replacements: { token } });

    if (rows.length === 0) {
      return res.status(401).json({ success: false });
    }

    const allowedEvents = ['panel_viewed', 'price_form_focused', 'locked_preview_clicked'];
    if (!allowedEvents.includes(event)) {
      return res.status(400).json({ success: false });
    }

    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
    await sequelize.query(`
      INSERT INTO audit_logs (id, admin_user_id, admin_email, action, details, ip_address, created_at, updated_at)
      VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'system', :event, :details, :ip, NOW(), NOW())
    `, {
      replacements: {
        event,
        details: JSON.stringify({ supplier_id: rows[0].supplier_id, ...(data || {}) }),
        ip
      }
    });

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false });
  }
});


// ═══════════════════════════════════════════════════════════════
// Query functions — all ZIP scoping uses CTEs with
// jsonb_array_elements_text to expand postal_codes_served in SQL.
// This is the proven pattern from claim-page.js. Never pass JS
// arrays as bind params for ANY().
// ═══════════════════════════════════════════════════════════════

/**
 * Get demand data: clicks, calls, websites, trends, area searches
 * All ZIP scoping derived from suppliers.postal_codes_served in SQL.
 */
async function getDemandData(sequelize, supplierId) {
  const [rows] = await sequelize.query(`
    WITH supplier_zips AS (
      SELECT DISTINCT LEFT(z::text, 5) as zip
      FROM suppliers s,
        jsonb_array_elements_text(s.postal_codes_served) z
      WHERE s.id = :supplierId
        AND s.postal_codes_served IS NOT NULL
    ),
    own_clicks AS (
      SELECT
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as clicks_7d,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '14 days'
                          AND created_at <= NOW() - INTERVAL '7 days') as clicks_prev_7d,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as clicks_30d,
        COUNT(*) FILTER (WHERE action_type = 'call' AND created_at > NOW() - INTERVAL '30 days') as calls_30d,
        COUNT(*) FILTER (WHERE action_type = 'website' AND created_at > NOW() - INTERVAL '30 days') as websites_30d
      FROM supplier_clicks
      WHERE supplier_id = :supplierId
    ),
    area_searches AS (
      SELECT COALESCE(SUM(ul.request_count), 0) as total
      FROM user_locations ul
      INNER JOIN supplier_zips sz ON LEFT(ul.zip_code, 5) = sz.zip
    ),
    area_clicks AS (
      SELECT COUNT(*) as total
      FROM supplier_clicks sc
      INNER JOIN supplier_zips sz ON LEFT(sc.zip_code, 5) = sz.zip
      WHERE sc.created_at > NOW() - INTERVAL '30 days'
    )
    SELECT
      (SELECT clicks_7d FROM own_clicks) as clicks_7d,
      (SELECT clicks_prev_7d FROM own_clicks) as clicks_prev_7d,
      (SELECT clicks_30d FROM own_clicks) as clicks_30d,
      (SELECT calls_30d FROM own_clicks) as calls_30d,
      (SELECT websites_30d FROM own_clicks) as websites_30d,
      (SELECT total FROM area_searches) as area_searches,
      (SELECT total FROM area_clicks) as area_clicks
  `, { replacements: { supplierId } });

  const row = rows[0] || {};
  const clicks7d = parseInt(row.clicks_7d || 0);
  const clicksPrev7d = parseInt(row.clicks_prev_7d || 0);
  const clicks30d = parseInt(row.clicks_30d || 0);
  const calls30d = parseInt(row.calls_30d || 0);
  const websites30d = parseInt(row.websites_30d || 0);
  const areaSearches = parseInt(row.area_searches || 0);
  const areaClicks = parseInt(row.area_clicks || 0);

  // Trend: suppress percentage when absolute clicks < 10
  let clicksTrend = null;
  let clicksTrendRaw = { thisWeek: clicks7d, lastWeek: clicksPrev7d };
  if (clicks7d >= 10 || clicksPrev7d >= 10) {
    if (clicksPrev7d > 0) {
      const pct = Math.round(((clicks7d - clicksPrev7d) / clicksPrev7d) * 100);
      clicksTrend = (pct >= 0 ? '+' : '') + pct + '%';
    } else if (clicks7d > 0) {
      clicksTrend = 'new';
    }
  }

  return {
    viewsLast7Days: clicks7d,
    clicksLast30Days: clicks30d,
    clicksTrend,
    clicksTrendRaw,
    calls: calls30d,
    websites: websites30d,
    areaSearches,
    areaClicks
  };
}

/**
 * Get competitive data: prices, rank, click share, urgency
 * Uses primary ZIP cluster (top N by click concentration) when supplier
 * covers many ZIPs, so "lowest in area" stays meaningful.
 */
async function getCompetitiveData(sequelize, supplierId) {
  // Step 1: Compute scope ZIPs once — top N by click concentration, fallback to all.
  // This result is reused by steps 2-4 so the definition of "area" is consistent.
  const [scopeRows] = await sequelize.query(`
    WITH supplier_zips AS (
      SELECT DISTINCT LEFT(z::text, 5) as zip
      FROM suppliers s,
        jsonb_array_elements_text(s.postal_codes_served) z
      WHERE s.id = :supplierId
        AND s.postal_codes_served IS NOT NULL
    ),
    zip_clicks AS (
      SELECT LEFT(sc.zip_code, 5) as zip, COUNT(*) as cnt
      FROM supplier_clicks sc
      INNER JOIN supplier_zips sz ON LEFT(sc.zip_code, 5) = sz.zip
      WHERE sc.created_at > NOW() - INTERVAL '30 days'
      GROUP BY LEFT(sc.zip_code, 5)
      ORDER BY cnt DESC
      LIMIT :zipLimit
    ),
    scope AS (
      SELECT zip FROM zip_clicks
      WHERE (SELECT COUNT(*) FROM zip_clicks) >= 3
      UNION ALL
      SELECT zip FROM supplier_zips
      WHERE (SELECT COUNT(*) FROM zip_clicks) < 3
    )
    SELECT DISTINCT zip FROM scope
  `, { replacements: { supplierId, zipLimit: PRIMARY_ZIP_LIMIT } });

  if (scopeRows.length === 0) {
    return { lowestInArea: null, avgInArea: null, priceSpread: null, totalCompetitors: 0, clickShare: null, urgency: null };
  }

  // Build a SQL VALUES list from the computed scope ZIPs for reuse in steps 2-4.
  // This ensures "area" is defined once (step 1) and consumed consistently.
  const scopeZips = scopeRows.map(r => r.zip);
  const scopeValues = scopeZips.map((_, i) => `(:zip${i})`).join(', ');
  const scopeReplacements = {};
  scopeZips.forEach((z, i) => { scopeReplacements[`zip${i}`] = z; });

  // Step 2: Competitive pricing — all suppliers serving the scope ZIPs
  const [priceRows] = await sequelize.query(`
    WITH active_scope(zip) AS (VALUES ${scopeValues}),
    area_suppliers AS (
      SELECT DISTINCT s.id
      FROM suppliers s,
        jsonb_array_elements_text(s.postal_codes_served) z
      WHERE s.active = true
        AND s.postal_codes_served IS NOT NULL
        AND LEFT(z::text, 5) IN (SELECT zip FROM active_scope)
    ),
    latest_prices AS (
      SELECT DISTINCT ON (sp.supplier_id)
        sp.supplier_id, sp.price_per_gallon, sp.min_gallons, sp.scraped_at
      FROM supplier_prices sp
      JOIN area_suppliers a ON sp.supplier_id = a.id
      WHERE sp.is_valid = true AND sp.fuel_type = 'heating_oil'
      ORDER BY sp.supplier_id, sp.scraped_at DESC
    )
    SELECT supplier_id, price_per_gallon::numeric as price, min_gallons, scraped_at
    FROM latest_prices
    WHERE price_per_gallon > 0
    ORDER BY price_per_gallon ASC
  `, { replacements: scopeReplacements });

  const prices = priceRows.map(r => parseFloat(r.price));
  const lowestInArea = prices.length > 0 ? prices[0] : null;
  const avgInArea = prices.length > 0 ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length * 1000) / 1000 : null;
  const priceSpread = prices.length >= 2 ? Math.round((prices[prices.length - 1] - prices[0]) * 1000) / 1000 : null;
  const totalCompetitors = Math.max(0, priceRows.length - 1);
  const suppliersAtLowest = lowestInArea ? priceRows.filter(r => Math.abs(parseFloat(r.price) - lowestInArea) < 0.005).length : 0;

  // Step 3: Click share — rank by clicks in scope ZIPs (last 30 days)
  const [shareRows] = await sequelize.query(`
    WITH active_scope(zip) AS (VALUES ${scopeValues}),
    area_clicks AS (
      SELECT
        sc.supplier_id,
        COUNT(*) as clicks,
        COUNT(*) FILTER (WHERE sc.created_at > NOW() - INTERVAL '7 days') as clicks_7d,
        COUNT(*) FILTER (WHERE sc.created_at > NOW() - INTERVAL '14 days'
                          AND sc.created_at <= NOW() - INTERVAL '7 days') as clicks_prev_7d
      FROM supplier_clicks sc
      WHERE LEFT(sc.zip_code, 5) IN (SELECT zip FROM active_scope)
        AND sc.created_at > NOW() - INTERVAL '30 days'
      GROUP BY sc.supplier_id
    )
    SELECT supplier_id, clicks, clicks_7d, clicks_prev_7d
    FROM area_clicks
    ORDER BY clicks DESC
  `, { replacements: scopeReplacements });

  let clickShare = null;
  if (shareRows.length > 0) {
    const totalAreaClicks = shareRows.reduce((sum, r) => sum + parseInt(r.clicks), 0);
    const ownRow = shareRows.find(r => r.supplier_id === supplierId);
    const ownClicks = ownRow ? parseInt(ownRow.clicks) : 0;
    const rank = ownRow ? shareRows.indexOf(ownRow) + 1 : shareRows.length + 1;
    const leaderClicks = parseInt(shareRows[0]?.clicks || 0);
    const sharePercent = totalAreaClicks > 0 ? Math.round((ownClicks / totalAreaClicks) * 100) : 0;
    const leaderSharePercent = totalAreaClicks > 0 ? Math.round((leaderClicks / totalAreaClicks) * 100) : 0;
    const captureVsLeader = leaderClicks > 0 ? Math.round((ownClicks / leaderClicks) * 100) : 0;

    // Share trend (7d vs prev 7d)
    const own7d = ownRow ? parseInt(ownRow.clicks_7d) : 0;
    const ownPrev7d = ownRow ? parseInt(ownRow.clicks_prev_7d) : 0;
    const total7d = shareRows.reduce((s, r) => s + parseInt(r.clicks_7d), 0);
    const totalPrev7d = shareRows.reduce((s, r) => s + parseInt(r.clicks_prev_7d), 0);
    const share7d = total7d > 0 ? (own7d / total7d) * 100 : 0;
    const sharePrev7d = totalPrev7d > 0 ? (ownPrev7d / totalPrev7d) * 100 : 0;

    let shareTrend = null;
    let shareTrendRaw = { thisWeek: Math.round(share7d), lastWeek: Math.round(sharePrev7d) };
    if (own7d >= 10 || ownPrev7d >= 10) {
      const diff = Math.round(share7d - sharePrev7d);
      shareTrend = (diff >= 0 ? '+' : '') + diff + '%';
    }

    clickShare = {
      ownClicks,
      areaClicks: totalAreaClicks,
      sharePercent,
      shareTrend,
      shareTrendRaw,
      rank,
      totalRanked: shareRows.length,
      leaderSharePercent,
      captureVsLeader
    };
  }

  // Step 4: Urgency — competitor price drops in last 24h
  let urgency = null;
  const [urgencyRows] = await sequelize.query(`
    WITH active_scope(zip) AS (VALUES ${scopeValues}),
    area_competitors AS (
      SELECT DISTINCT s.id
      FROM suppliers s,
        jsonb_array_elements_text(s.postal_codes_served) z
      WHERE s.active = true AND s.id != :supplierId
        AND s.postal_codes_served IS NOT NULL
        AND LEFT(z::text, 5) IN (SELECT zip FROM active_scope)
    )
    SELECT COUNT(DISTINCT sp.supplier_id) as drops
    FROM supplier_prices sp
    JOIN area_competitors ac ON sp.supplier_id = ac.id
    WHERE sp.is_valid = true AND sp.fuel_type = 'heating_oil'
      AND sp.scraped_at > NOW() - INTERVAL '24 hours'
      AND sp.price_per_gallon < (
        SELECT sp2.price_per_gallon FROM supplier_prices sp2
        WHERE sp2.supplier_id = sp.supplier_id AND sp2.is_valid = true AND sp2.fuel_type = 'heating_oil'
          AND sp2.scraped_at < sp.scraped_at
        ORDER BY sp2.scraped_at DESC LIMIT 1
      )
  `, { replacements: { supplierId, ...scopeReplacements } });

  const drops = parseInt(urgencyRows[0]?.drops || 0);
  if (drops > 0) {
    urgency = { pricesChangedToday: true, areaCompetitorPriceDrops: drops };
  }

  return {
    lowestInArea,
    avgInArea,
    priceSpread,
    totalCompetitors,
    suppliersAtLowest,
    clickShare,
    urgency
  };
}

/**
 * Get price data: current tiers, staleness, history
 */
async function getPriceData(sequelize, supplierId) {
  const [tierRows] = await sequelize.query(`
    SELECT price_per_gallon, min_gallons, scraped_at, source_type
    FROM supplier_prices
    WHERE supplier_id = :supplierId AND is_valid = true AND fuel_type = 'heating_oil'
    ORDER BY scraped_at DESC
  `, { replacements: { supplierId } });

  if (tierRows.length === 0) {
    return { tiers: [], comparisonPrice: null, stale: false, lastUpdated: null };
  }

  // Group by min_gallons to get latest per tier
  const tierMap = new Map();
  for (const row of tierRows) {
    const key = row.min_gallons || 100;
    if (!tierMap.has(key)) {
      tierMap.set(key, {
        minGallons: key,
        price: parseFloat(row.price_per_gallon),
        lastUpdated: row.scraped_at,
        source: row.source_type
      });
    }
  }

  const tiers = Array.from(tierMap.values()).sort((a, b) => a.minGallons - b.minGallons);

  // Comparison price: the 150-gal tier (or closest)
  const comparisonTier = tiers.find(t => t.minGallons <= 150) || tiers[0];
  const comparisonPrice = comparisonTier?.price || null;

  // Staleness: most recent price older than STALE_HOURS
  const mostRecent = tierRows[0];
  const hoursSinceUpdate = (Date.now() - new Date(mostRecent.scraped_at).getTime()) / 3600000;
  const stale = hoursSinceUpdate > STALE_HOURS;

  return {
    tiers,
    comparisonPrice,
    stale,
    lastUpdated: mostRecent.scraped_at
  };
}

/**
 * Get price impact: before/after attribution for most recent price change
 */
async function getPriceImpact(sequelize, supplierId) {
  const [priceChanges] = await sequelize.query(`
    SELECT price_per_gallon, scraped_at, source_type
    FROM supplier_prices
    WHERE supplier_id = :supplierId AND is_valid = true AND fuel_type = 'heating_oil'
      AND scraped_at > NOW() - INTERVAL '30 days'
    ORDER BY scraped_at DESC
    LIMIT 2
  `, { replacements: { supplierId } });

  if (priceChanges.length < 2) return null;

  const current = priceChanges[0];
  const previous = priceChanges[1];
  const priceAfter = parseFloat(current.price_per_gallon);
  const priceBefore = parseFloat(previous.price_per_gallon);

  if (Math.abs(priceAfter - priceBefore) < 0.005) return null;

  const changeDate = current.scraped_at;

  // Suppress when post-change window is too short for meaningful attribution
  const hoursSinceChange = (Date.now() - new Date(changeDate).getTime()) / 3600000;
  if (hoursSinceChange < 24) return null;

  const [impactRows] = await sequelize.query(`
    SELECT
      COUNT(*) FILTER (WHERE created_at >= :changeDate AND created_at < :changeDate::timestamp + INTERVAL '7 days') as clicks_after,
      COUNT(*) FILTER (WHERE created_at < :changeDate AND created_at >= :changeDate::timestamp - INTERVAL '7 days') as clicks_before,
      COUNT(*) FILTER (WHERE action_type = 'call' AND created_at >= :changeDate AND created_at < :changeDate::timestamp + INTERVAL '7 days') as calls_after,
      COUNT(*) FILTER (WHERE action_type = 'call' AND created_at < :changeDate AND created_at >= :changeDate::timestamp - INTERVAL '7 days') as calls_before
    FROM supplier_clicks
    WHERE supplier_id = :supplierId
  `, { replacements: { supplierId, changeDate } });

  const row = impactRows[0];
  return {
    updatedAt: changeDate,
    priceBefore,
    priceAfter,
    direction: priceAfter < priceBefore ? 'drop' : 'raise',
    clicksBefore7d: parseInt(row?.clicks_before || 0),
    clicksAfter7d: parseInt(row?.clicks_after || 0),
    callsBefore7d: parseInt(row?.calls_before || 0),
    callsAfter7d: parseInt(row?.calls_after || 0)
  };
}

/**
 * Detect seasonal decline: compare this week's platform-wide searches to last week
 */
async function getSeasonalContext(sequelize) {
  const [rows] = await sequelize.query(`
    SELECT
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as this_week,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '14 days'
                        AND created_at <= NOW() - INTERVAL '7 days') as last_week
    FROM user_locations
    WHERE created_at > NOW() - INTERVAL '14 days'
  `);

  const thisWeek = parseInt(rows[0]?.this_week || 0);
  const lastWeek = parseInt(rows[0]?.last_week || 0);

  if (lastWeek === 0) return null;

  const declinePct = ((lastWeek - thisWeek) / lastWeek) * 100;

  if (declinePct > 30) {
    const month = new Date().toLocaleDateString('en-US', { month: 'long' });
    return {
      active: true,
      message: `Summer volumes are lower industry-wide. Your area is tracking normally for ${month}.`,
      suppressWoW: true
    };
  }

  return null;
}

module.exports = router;
