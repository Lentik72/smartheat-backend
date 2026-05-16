/**
 * Canonical SQL helpers for health-freshness queries on supplier_prices.
 *
 * Background (heatingoil-kjnt Cluster A audit, 2026-05-14):
 *
 * 32 SQL sites across 12 files build "latest price per supplier" assessments
 * to answer health questions like "is the scraper working" / "is this
 * supplier's data stale" / "should we email the supplier a reminder". They
 * all hard-coded `WHERE is_valid = true AND fuel_type = 'heating_oil'`,
 * which falsely flagged primaryFuelOptional suppliers (e.g. Buxton Oil —
 * site says "Call our office" for oil, propane scrapes fine) as
 * stale/broken even when secondary fuels were fresh.
 *
 * Migration 171 added `suppliers.primary_fuel_optional` (synced from
 * scrape-config.json by ScrapeConfigSync). This helper exposes the
 * canonical fuel predicate + tie-break + CTE shape so the 32 call sites
 * can be migrated consistently without copy-pasting SQL 32 times.
 *
 * SEMANTIC CONTRACT
 * -----------------
 *   - "Latest health price" means the most-recently-scraped valid row that
 *     either is heating_oil OR belongs to a supplier flagged
 *     primary_fuel_optional. For 99% of suppliers (no flag, heating-oil
 *     only) behavior is identical to the old heating_oil-only logic.
 *   - Same-timestamp tie-break PREFERS heating_oil. So if both fuels
 *     scraped at the exact same instant, we pick the oil row — consistent
 *     with the heating-oil-default everywhere else.
 *   - **The helper does NOT bake in source_type policy.** Some call sites
 *     already exclude aggregator_signal; others intentionally include it
 *     as scraper-health evidence. Caller passes its own source_type clause
 *     through `extraWhere` to preserve per-site behavior.
 *   - The CTE JOINs suppliers internally so primary_fuel_optional is in
 *     scope. The outer query may also JOIN suppliers — Postgres handles
 *     the double-join with no real cost at this table size.
 *
 * Bead: heatingoil-kjnt.
 */

/**
 * Returns the fuel predicate fragment:
 *   `(<sp>.fuel_type = 'heating_oil' OR <s>.primary_fuel_optional = true)`
 *
 * Use inside a WHERE clause when you can't / don't want to use the full
 * CTE helper. Caller must JOIN both supplier_prices and suppliers with
 * the given aliases (default `sp` / `s`).
 *
 * @param {object} [opts]
 * @param {string} [opts.pricesAlias='sp']   alias used for supplier_prices
 * @param {string} [opts.suppliersAlias='s'] alias used for suppliers
 * @returns {string} parenthesized SQL fragment, safe to drop into WHERE
 */
function healthFuelPredicate(opts = {}) {
  const sp = opts.pricesAlias || 'sp';
  const s = opts.suppliersAlias || 's';
  return `(${sp}.fuel_type = 'heating_oil' OR ${s}.primary_fuel_optional = true)`;
}

/**
 * Returns the ORDER BY tail that prefers heating_oil on equal scraped_at:
 *   `CASE WHEN <sp>.fuel_type = 'heating_oil' THEN 0 ELSE 1 END`
 *
 * Append AFTER `<sp>.scraped_at DESC` in a DISTINCT ON ORDER BY.
 *
 * @param {object} [opts]
 * @param {string} [opts.pricesAlias='sp']
 * @returns {string} SQL fragment (no leading comma)
 */
function healthTieBreak(opts = {}) {
  const sp = opts.pricesAlias || 'sp';
  return `CASE WHEN ${sp}.fuel_type = 'heating_oil' THEN 0 ELSE 1 END`;
}

/**
 * Build a "latest health price per supplier" CTE.
 *
 * Output shape (with defaults):
 *
 *   WITH latest_health_prices AS (
 *     SELECT DISTINCT ON (sp.supplier_id)
 *       sp.supplier_id,
 *       sp.scraped_at,
 *       sp.fuel_type AS health_fuel_type
 *     FROM supplier_prices sp
 *     JOIN suppliers s ON sp.supplier_id = s.id
 *     WHERE sp.is_valid = true
 *       AND (sp.fuel_type = 'heating_oil' OR s.primary_fuel_optional = true)
 *     ORDER BY sp.supplier_id, sp.scraped_at DESC,
 *              CASE WHEN sp.fuel_type = 'heating_oil' THEN 0 ELSE 1 END
 *   )
 *
 * The `health_fuel_type` column is ALWAYS included so any consumer that
 * surfaces a price to an operator/user can label which fuel it came from
 * (the audit's "unlabeled arbitrary-fuel price" risk).
 *
 * Caller can add `WITH ...latest_health_prices AS (...), <other> AS (...)`
 * by inlining other CTEs after the helper's output — the helper just
 * returns the `WITH <name> AS ( ... )` string.
 *
 * @param {object} [opts]
 * @param {string} [opts.cteName='latest_health_prices'] CTE name
 * @param {boolean} [opts.includePrice=false]  include price_per_gallon column
 * @param {string[]} [opts.extraWhere=[]]      additional WHERE fragments, each
 *                                             a complete clause beginning with
 *                                             AND (e.g. "AND sp.expires_at > NOW()",
 *                                             "AND sp.source_type != 'aggregator_signal'")
 * @param {string} [opts.pricesAlias='sp']
 * @param {string} [opts.suppliersAlias='s']
 * @returns {string} `WITH <cteName> AS ( ... )` SQL fragment
 */
function buildLatestHealthPriceCTE(opts = {}) {
  const cteName = opts.cteName || 'latest_health_prices';
  const sp = opts.pricesAlias || 'sp';
  const s = opts.suppliersAlias || 's';
  const includePrice = opts.includePrice === true;
  const extraWhere = Array.isArray(opts.extraWhere) ? opts.extraWhere : [];

  const priceCol = includePrice ? `,\n      ${sp}.price_per_gallon` : '';
  const extraClauses = extraWhere.length > 0
    ? '\n      ' + extraWhere.map(c => String(c).trim()).join('\n      ')
    : '';

  return `WITH ${cteName} AS (
    SELECT DISTINCT ON (${sp}.supplier_id)
      ${sp}.supplier_id,
      ${sp}.scraped_at,
      ${sp}.fuel_type AS health_fuel_type${priceCol}
    FROM supplier_prices ${sp}
    JOIN suppliers ${s} ON ${sp}.supplier_id = ${s}.id
    WHERE ${sp}.is_valid = true
      AND ${healthFuelPredicate({ pricesAlias: sp, suppliersAlias: s })}${extraClauses}
    ORDER BY ${sp}.supplier_id, ${sp}.scraped_at DESC, ${healthTieBreak({ pricesAlias: sp })}
  )`;
}

module.exports = {
  healthFuelPredicate,
  healthTieBreak,
  buildLatestHealthPriceCTE,
};
