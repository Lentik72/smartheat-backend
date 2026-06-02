/**
 * Canonical SQL for the price-review "queue" BLOCKED + COUNT logic, shared so
 * these two surfaces stay in lockstep:
 *   - portal GET /api/price-review  → buildBlockedSitesSQL() (full blocked rows)
 *   - daily ops email + admin trigger → buildReviewCountSQL() (COUNT)
 *
 * SCOPE: this shares the BLOCKED query and the email/admin COUNT. The portal's
 * inline `suspicious_price` bucket (price-review.js ~214) is NOT yet routed
 * through here — it already matches these semantics (latest-oil out-of-band) by
 * construction, so there's no behavior drift today. A follow-up could add a
 * buildSuspiciousPricesSQL() to make the no-drift guarantee total.
 *
 * Both are LATEST-heating-oil based. A supplier needs review only if:
 *   - suspicious: its LATEST valid oil price is out-of-band, OR
 *   - blocked:    it is cooldown/phone_only AND lacks a fresh (<48h) in-band
 *                 latest oil price, OR
 *   - needs_initial: it has no valid price at all.
 *
 * Why latest-oil: scrapers INSERT without invalidating prior rows, so suppliers
 * accumulate many is_valid=true rows. An "any is_valid out-of-band" check (the
 * old email query) flags suppliers for a stale/kerosene out-of-band row even
 * when the current oil price is fine. The portal already used latest-oil; this
 * brings the email/admin count in line.
 *
 * Freshness clock = scraped_at within 48h (operator-review suppression), NOT
 * expires_at (user display validity: scraped 48h, manual 7d). Suspicious has no
 * freshness filter — an out-of-band latest price is worth review whenever.
 *
 * All literals, no user input → no binds.
 */

const REVIEW_FRESH_INTERVAL = "INTERVAL '48 hours'";

// out-of-band predicate for a given price column
const outOfBand = (col) => `(${col} < 2.00 OR ${col} > 5.50)`;

// "this blocked supplier still needs review" — no fresh in-band latest oil price
const blockedNeedsReview = (priceCol, scrapedCol) =>
  `(${priceCol} IS NULL OR ${scrapedCol} < NOW() - ${REVIEW_FRESH_INTERVAL} OR ${outOfBand(priceCol)})`;

function buildBlockedSitesSQL() {
  return `
    WITH latest_prices AS (
      SELECT DISTINCT ON (supplier_id)
        supplier_id,
        price_per_gallon AS current_price,
        scraped_at
      FROM supplier_prices
      WHERE is_valid = true
        AND fuel_type = 'heating_oil'
      ORDER BY supplier_id, scraped_at DESC
    )
    SELECT
      s.id, s.name, s.website, s.city, s.state,
      s.last_scrape_error,
      s.scrape_status as status,
      s.consecutive_scrape_failures,
      s.last_scrape_failure_at,
      s.scrape_cooldown_until as cooldown_until,
      lp.current_price,
      lp.scraped_at,
      'scrape_blocked' as review_reason
    FROM suppliers s
    LEFT JOIN latest_prices lp ON lp.supplier_id = s.id
    WHERE s.active = true
      AND s.website IS NOT NULL
      AND s.allow_price_display = true
      AND (s.scrape_status = 'cooldown' OR s.scrape_status = 'phone_only')
      AND ${blockedNeedsReview('lp.current_price', 'lp.scraped_at')}
  `;
}

function buildReviewCountSQL() {
  return `
    WITH latest_oil AS (
      SELECT DISTINCT ON (supplier_id)
        supplier_id,
        price_per_gallon AS current_price,
        scraped_at
      FROM supplier_prices
      WHERE is_valid = true
        AND fuel_type = 'heating_oil'
      ORDER BY supplier_id, scraped_at DESC
    )
    SELECT COUNT(DISTINCT s.id) as cnt
    FROM suppliers s
    LEFT JOIN latest_oil lo ON lo.supplier_id = s.id
    WHERE s.active = true AND s.website IS NOT NULL AND s.allow_price_display = true
      AND NOT EXISTS (
        SELECT 1 FROM price_review_dismissals d
        WHERE d.supplier_id = s.id AND d.dismiss_until > NOW()
      )
      AND (
        ${outOfBand('lo.current_price')}
        OR (
          s.scrape_status IN ('cooldown', 'phone_only')
          AND ${blockedNeedsReview('lo.current_price', 'lo.scraped_at')}
        )
        OR NOT EXISTS (
          SELECT 1 FROM supplier_prices sp2
          WHERE sp2.supplier_id = s.id AND sp2.is_valid = true
        )
      )
  `;
}

module.exports = { buildBlockedSitesSQL, buildReviewCountSQL, REVIEW_FRESH_INTERVAL };
