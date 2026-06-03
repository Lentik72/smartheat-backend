/**
 * Shared price-anomaly guards for BOTH scrape paths (batch scrape-prices.js +
 * all-day DistributedScheduler.js). Single source of truth for the 25%-drop and
 * state-median outlier checks, plus the price_rejections writer (migration 173).
 * See docs/superpowers/specs/2026-06-03-shared-price-anomaly-guards-design.md.
 */

const MAX_PRICE_DROP = 0.25;         // reject new price >25% below previous SAME-fuel price
const MAX_BELOW_MEDIAN = 0.25;       // reject new oil price >25% below its state median
const MIN_SUPPLIERS_FOR_MEDIAN = 5;  // a state needs >=5 suppliers to trust its median

/**
 * PURE. Drop precedence over median (mirrors scrape-prices.js order). Percent
 * fields are whole numbers (e.g. 33) to match CoverageReportMailer .toFixed(0).
 * @returns {{ok:true}} | {{ok:false, rejection}}
 *   drop rejection:   { reason, dropPercent, previousPrice }
 *   median rejection: { reason, belowMedianPercent, marketMedian, state }
 */
function evaluatePriceSanity({ newPrice, prevPrice = null, stateMedian = null, state = null }) {
  if (prevPrice != null) {
    const drop = (prevPrice - newPrice) / prevPrice;
    if (drop > MAX_PRICE_DROP) {
      return { ok: false, rejection: {
        reason: `${(drop * 100).toFixed(0)}% drop exceeds ${MAX_PRICE_DROP * 100}% threshold`,
        dropPercent: drop * 100,
        previousPrice: prevPrice,
      } };
    }
  }
  if (stateMedian != null) {
    const below = (stateMedian - newPrice) / stateMedian;
    if (below > MAX_BELOW_MEDIAN) {
      return { ok: false, rejection: {
        reason: `${(below * 100).toFixed(0)}% below ${state || ''} median exceeds ${MAX_BELOW_MEDIAN * 100}% threshold`,
        belowMedianPercent: below * 100,
        marketMedian: stateMedian,
        state: state || null,
      } };
    }
  }
  return { ok: true };
}

async function getAllStateMedians(sequelize) {
  const [rows] = await sequelize.query(`
    SELECT s.state,
           PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY sp.price_per_gallon::numeric) AS median_price
    FROM supplier_prices sp
    JOIN suppliers s ON sp.supplier_id = s.id
    WHERE sp.is_valid = true AND sp.fuel_type = 'heating_oil' AND sp.expires_at > NOW()
      AND s.active = true AND s.allow_price_display = true AND s.state IS NOT NULL
    GROUP BY s.state
    HAVING COUNT(DISTINCT sp.supplier_id) >= ${MIN_SUPPLIERS_FOR_MEDIAN}
  `);
  const map = {};
  for (const r of rows) map[r.state] = parseFloat(r.median_price);
  return map;
}

// Single-state median for the all-day path. HAVING without GROUP BY is intentional:
// the aggregate is one implicit group, so HAVING gates the whole result → 0 rows
// (=> null) when <5 suppliers, 1 row otherwise. Do NOT "fix" by adding GROUP BY.
// MUST be fault-tolerant: this runs on the scheduler's success path as an await'd
// call argument; an unguarded throw would propagate to executeScrape's catch and
// SKIP recordSuccess (wrongly pushing a healthy supplier toward cooldown). On any
// error we degrade to null → drop-guard-only, never blocking the scrape.
async function getStateMedian(sequelize, state) {
  if (!state) return null;
  try {
    const [rows] = await sequelize.query(`
      SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY sp.price_per_gallon::numeric) AS median_price
      FROM supplier_prices sp
      JOIN suppliers s ON sp.supplier_id = s.id
      WHERE sp.is_valid = true AND sp.fuel_type = 'heating_oil' AND sp.expires_at > NOW()
        AND s.active = true AND s.allow_price_display = true AND s.state = $1
      HAVING COUNT(DISTINCT sp.supplier_id) >= ${MIN_SUPPLIERS_FOR_MEDIAN}
    `, { bind: [state] });
    return rows.length > 0 && rows[0].median_price != null ? parseFloat(rows[0].median_price) : null;
  } catch (err) {
    return null; // degrade to drop-guard-only; never throw on the scrape success path
  }
}

async function recordPriceRejection(sequelize, { supplierId, supplierName, fuelType, newPrice, rejection, source }, logger = null) {
  try {
    await sequelize.query(`
      INSERT INTO price_rejections (
        id, supplier_id, supplier_name, fuel_type, new_price,
        previous_price, market_median, drop_percent, below_median_percent,
        state, reason, source, rejected_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4,
        $5, $6, $7, $8,
        $9, $10, $11, NOW()
      )
    `, { bind: [
      supplierId, supplierName, fuelType, newPrice,
      rejection.previousPrice ?? null,
      rejection.marketMedian ?? null,
      rejection.dropPercent ?? null,
      rejection.belowMedianPercent ?? null,
      rejection.state ?? null,
      rejection.reason,
      source,
    ] });
  } catch (err) {
    (logger && logger.warn ? logger.warn : console.warn)(`[price-rejected] failed to log rejection for ${supplierName}: ${err.message}`);
  }
}

async function checkAndRecordPrice(sequelize, { supplierId, supplierName, fuelType, newPrice, prevPrice = null, stateMedian = null, state = null, source }, logger = null) {
  // Kill switch (no-deploy disable; matches SCRAPE_SKIP_DROPLET precedent). If the
  // guard ever over-rejects legitimate prices, set DISABLE_PRICE_SANITY=true in
  // Railway env to neutralize it instantly — everything is accepted, nothing logged.
  if (process.env.DISABLE_PRICE_SANITY === 'true') return { ok: true };
  const verdict = evaluatePriceSanity({ newPrice, prevPrice, stateMedian, state });
  if (!verdict.ok) {
    await recordPriceRejection(sequelize, { supplierId, supplierName, fuelType, newPrice, rejection: verdict.rejection, source }, logger);
  }
  return verdict;
}

async function getRecentRejections(sequelize) {
  const [rows] = await sequelize.query(`
    SELECT * FROM (
      SELECT DISTINCT ON (supplier_id, fuel_type)
        supplier_name        AS "supplierName",
        new_price::float     AS "newPrice",
        previous_price::float AS "previousPrice",
        market_median::float AS "marketMedian",
        drop_percent::float  AS "dropPercent",
        below_median_percent::float AS "belowMedianPercent",
        state, reason, rejected_at
      FROM price_rejections
      WHERE rejected_at > NOW() - INTERVAL '24 hours'
      ORDER BY supplier_id, fuel_type, rejected_at DESC
    ) d
    ORDER BY d.rejected_at DESC
    LIMIT 50
  `);
  return rows;
}

module.exports = { evaluatePriceSanity, MAX_PRICE_DROP, MAX_BELOW_MEDIAN, MIN_SUPPLIERS_FOR_MEDIAN, getAllStateMedians, getStateMedian, recordPriceRejection, checkAndRecordPrice, getRecentRejections };
