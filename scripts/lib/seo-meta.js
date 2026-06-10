/**
 * CTR-optimized SEO title cores + meta descriptions for generated price pages.
 * Titles are returned WITHOUT the " | HomeHeat" brand suffix (the page template appends it)
 * and WITHOUT HTML-escaping (the template escapes at render). Cores kept <= TITLE_CORE_MAX.
 * Descriptions are length-guarded: clampDesc caps the MAX, fitDesc guarantees the MIN floor
 * (Bing flags "too short" descriptions). Wording is the v1 CTR hypothesis (qbd0.2/qbd0.8/qbd0.x)
 * — iterate in ONE place.
 */

const TITLE_CORE_MAX = 57; // leaves room for " | HomeHeat" before SERP truncation
const DESC_MAX = 160;
const DESC_MIN = 150; // Bing "too short" floor; design target within the 150–160 sweet spot

/** Join required + optional title parts, dropping trailing optional parts until <= max. */
function fitTitle(required, optional, max = TITLE_CORE_MAX) {
  const opts = [...optional];
  let out = required + opts.join('');
  while (out.length > max && opts.length) {
    opts.pop();
    out = required + opts.join('');
  }
  return out;
}

/** Trim a description to <= max chars on a word boundary, adding an ellipsis. */
function clampDesc(str, max = DESC_MAX) {
  if (str.length <= max) return str;
  return str.slice(0, max - 1).replace(/\s+\S*$/, '').trim() + '…';
}

/** Reach >= min by appending page-specific enrichment clauses in order, then clamp to <= max.
 *  Enrichments MUST carry unique tokens (place/fuel/supplier) — never a shared constant — to
 *  avoid trading "too short" for Bing "duplicate description". clampDesc guarantees the ceiling;
 *  with normal English copy (no unbounded data lists) the result stays >= min in practice. */
function fitDesc(base, enrichments = [], { min = DESC_MIN, max = DESC_MAX } = {}) {
  let out = base;
  for (const e of enrichments) {
    if (out.length >= min) break;
    out += e;
  }
  return clampDesc(out, max);
}

function priceClause(stats) {
  return stats ? ` from $${stats.min}–$${stats.max}/gal` : '';
}

/** "1 supplier" vs "N suppliers" — avoids the "1 suppliers" grammar slip on
 *  single-supplier pages. Pass cap=true for the title-case form. */
function supplierWord(n, cap = false) {
  const w = n === 1 ? 'supplier' : 'suppliers';
  return cap ? w[0].toUpperCase() + w.slice(1) : w;
}

/** State hub page — /prices/{state}/ */
function stateMeta({ fuelLabel, stateName, supplierCount, stats }) {
  const title = fitTitle(
    `${stateName} ${fuelLabel} Prices`,
    [` — Compare ${supplierCount} ${supplierWord(supplierCount, true)}`],
  );
  const description = fitDesc(
    `Compare today's ${fuelLabel.toLowerCase()} prices${priceClause(stats)} across ` +
    `${supplierCount} ${stateName} ${supplierWord(supplierCount)}, sorted lowest first and updated daily.`,
    [` Find the cheapest delivered ${fuelLabel.toLowerCase()} rate near you and stop overpaying.`],
  );
  return { title, description };
}

/** County page — /prices/{state}/{county}-county */
function countyMeta({ fuelLabel, countyName, stateCode, supplierCount, stats }) {
  const title = fitTitle(
    `${countyName} County ${fuelLabel} Prices`,
    [` (${stateCode})`, ` — ${supplierCount} ${supplierWord(supplierCount, true)}`],
  );
  const description = fitDesc(
    `Today's ${fuelLabel.toLowerCase()} prices in ${countyName} County, ${stateCode}` +
    `${priceClause(stats)}. Compare ${supplierCount} local ${supplierWord(supplierCount)}, sorted lowest first and updated daily.`,
    [` Find the cheapest delivered ${fuelLabel.toLowerCase()} rate across ${countyName} County today.`],
  );
  return { title, description };
}

/** City/town page — /prices/{state}/{city}. countyName (optional) gives a unique mid-clause. */
function cityMeta({ fuelLabel, cityName, stateCode, countyName, supplierCount, stats }) {
  const title = fitTitle(
    `${cityName}, ${stateCode} ${fuelLabel} Prices`,
    [` — Compare ${supplierCount} ${supplierWord(supplierCount, true)}`],
  );
  const countyClause = countyName ? ` serving ${countyName} County` : '';
  const description = fitDesc(
    `Compare ${fuelLabel.toLowerCase()} prices in ${cityName}, ${stateCode} from ${supplierCount} ` +
    `local ${supplierWord(supplierCount)}${countyClause}${priceClause(stats)}, sorted lowest first and updated daily.`,
    [` See today's cheapest delivered ${fuelLabel.toLowerCase()} rate near ${cityName} and stop overpaying.`],
  );
  return { title, description };
}

/** Region page — /prices/{state}/{region} (heatingoil-qbd0.8) */
function regionMeta({ fuelLabel, regionName, stateCode, supplierCount, stats }) {
  const title = fitTitle(
    `${regionName}, ${stateCode} ${fuelLabel} Prices`,
    [` — Compare ${supplierCount} ${supplierWord(supplierCount, true)}`],
  );
  const description = fitDesc(
    `Compare ${fuelLabel.toLowerCase()} prices across ${regionName}, ${stateCode} from ${supplierCount} ` +
    `local ${supplierWord(supplierCount)}${priceClause(stats)}, sorted lowest first and updated daily.`,
    [` Find the cheapest delivered ${fuelLabel.toLowerCase()} rate in the ${regionName} area today.`],
  );
  return { title, description };
}

/** ZIP-prefix elite page — /prices/zip/{NNN} (heatingoil-qbd0.8; heating_oil only) */
function zipMeta({ regionName, zipPrefix, supplierCount, stats }) {
  const title = fitTitle(
    `${regionName} Heating Oil Prices (${zipPrefix}xx)`,
    [` — ${supplierCount} ${supplierWord(supplierCount, true)}`],
  );
  const description = fitDesc(
    `Compare heating oil prices for ZIP codes starting ${zipPrefix} in the ${regionName} area` +
    `${priceClause(stats)} from ${supplierCount} ${supplierWord(supplierCount)}, sorted lowest first and updated daily.`,
    [` Find the cheapest delivered heating oil rate across the ${zipPrefix}xx ZIP codes today.`],
  );
  return { title, description };
}

/** Supplier profile page — /supplier/{slug} (heatingoil-qbd0.2 supplier CTR).
 *  `price` only (no service-area list — a multi-county list overflows 160 and clampDesc
 *  truncates it to a dangling comma). Durable copy leads; the CTA enrichment is the only
 *  expendable (clamp-eaten) tail for long-name+price rows. */
function supplierMeta({ name, city, stateCode, price }) {
  const loc = (city && stateCode) ? ` in ${city}, ${stateCode}` : '';
  const title = fitTitle(name, [' Heating Oil Prices', loc]);
  const where = (city && stateCode) ? ` in ${city}, ${stateCode}` : '';
  const priceBit = price ? ` — currently $${price}/gal` : '';
  const description = fitDesc(
    `Compare ${name} heating oil prices${where}${priceBit}. See their current rate, ` +
    `service area, hours, payment options, and contact info — updated daily.`,
    [` Check whether ${name} offers the cheapest heating oil delivery near you before you order.`],
  );
  return { title, description };
}

module.exports = {
  stateMeta, countyMeta, cityMeta, regionMeta, zipMeta, supplierMeta,
  fitTitle, fitDesc, clampDesc, supplierWord, TITLE_CORE_MAX, DESC_MAX, DESC_MIN,
};
