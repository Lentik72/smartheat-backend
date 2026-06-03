/**
 * CTR-optimized SEO title cores + meta descriptions for generated price pages.
 * Titles are returned WITHOUT the " | HomeHeat" brand suffix (the page template appends it)
 * and WITHOUT HTML-escaping (the template escapes at render). Cores kept <= TITLE_CORE_MAX.
 * Wording is the v1 CTR hypothesis (heatingoil-qbd0.2) — iterate in ONE place.
 */

const TITLE_CORE_MAX = 57; // leaves room for " | HomeHeat" before SERP truncation
const DESC_MAX = 160;

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

function priceClause(stats) {
  return stats ? ` from $${stats.min}–$${stats.max}/gal` : '';
}

/** State hub page — /prices/{state}/ */
function stateMeta({ fuelLabel, stateName, supplierCount, stats }) {
  const title = fitTitle(
    `${stateName} ${fuelLabel} Prices`,
    [` — Compare ${supplierCount} Suppliers`],
  );
  const description = clampDesc(
    `Compare today's ${fuelLabel.toLowerCase()} prices${priceClause(stats)} across ` +
    `${supplierCount} ${stateName} suppliers. Updated daily, sorted lowest first — ` +
    `find the cheapest near you.`,
  );
  return { title, description };
}

/** County page — /prices/{state}/{county}-county */
function countyMeta({ fuelLabel, countyName, stateCode, supplierCount, stats }) {
  const title = fitTitle(
    `${countyName} County ${fuelLabel} Prices`,
    [` (${stateCode})`, ` — ${supplierCount} Suppliers`],
  );
  const description = clampDesc(
    `Today's ${fuelLabel.toLowerCase()} prices in ${countyName} County, ${stateCode}` +
    `${priceClause(stats)}. Compare ${supplierCount} suppliers, sorted lowest first. Updated daily.`,
  );
  return { title, description };
}

/** City/town page — /prices/{state}/{city} */
function cityMeta({ fuelLabel, cityName, stateCode, supplierCount, stats }) {
  const title = fitTitle(
    `${cityName}, ${stateCode} ${fuelLabel} Prices`,
    [` — Compare ${supplierCount} Suppliers`],
  );
  const description = clampDesc(
    `Compare ${fuelLabel.toLowerCase()} prices in ${cityName}, ${stateCode}${priceClause(stats)} ` +
    `from ${supplierCount} local suppliers. Updated daily, lowest first.`,
  );
  return { title, description };
}

/** Region page — /prices/{state}/{region} (heatingoil-qbd0.8) */
function regionMeta({ fuelLabel, regionName, stateCode, supplierCount, stats }) {
  const title = fitTitle(
    `${regionName}, ${stateCode} ${fuelLabel} Prices`,
    [` — Compare ${supplierCount} Suppliers`],
  );
  const description = clampDesc(
    `Compare ${fuelLabel.toLowerCase()} prices in ${regionName}, ${stateCode}${priceClause(stats)} ` +
    `from ${supplierCount} local suppliers. Updated daily, lowest first.`,
  );
  return { title, description };
}

/** ZIP-prefix elite page — /prices/zip/{NNN} (heatingoil-qbd0.8; heating_oil only) */
function zipMeta({ regionName, zipPrefix, supplierCount, stats }) {
  const title = fitTitle(
    `${regionName} Heating Oil Prices (${zipPrefix}xx)`,
    [` — ${supplierCount} Suppliers`],
  );
  const description = clampDesc(
    `Compare heating oil prices for ZIP codes starting ${zipPrefix}` +
    `${priceClause(stats)} from ${supplierCount} suppliers. Updated daily, lowest first.`,
  );
  return { title, description };
}

module.exports = {
  stateMeta, countyMeta, cityMeta, regionMeta, zipMeta,
  fitTitle, clampDesc, TITLE_CORE_MAX, DESC_MAX,
};
