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

module.exports = { evaluatePriceSanity, MAX_PRICE_DROP, MAX_BELOW_MEDIAN, MIN_SUPPLIERS_FOR_MEDIAN };
