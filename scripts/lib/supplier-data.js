/**
 * Shared supplier data queries — used by SEO and County Elite generators
 *
 * Extracts common supplier/price retrieval logic so both generators
 * use identical queries and filtering.
 */

/**
 * Get all active suppliers with service areas
 * allow_price_display filtering is done at price level — suppliers without
 * displayable prices show as "Call for price"
 */
async function getAllSuppliers(sequelize) {
  const [results] = await sequelize.query(`
    SELECT
      id,
      name,
      city,
      state,
      phone,
      website,
      slug,
      postal_codes_served,
      service_counties,
      fuel_types,
      allow_price_display,
      claimed_at,
      verified
    FROM suppliers
    WHERE active = true
    ORDER BY name
  `);
  return results;
}

/**
 * Get current valid prices for suppliers with allow_price_display = true
 * @param {object} sequelize - Sequelize instance
 * @param {number} minPrice - Minimum valid price (filter data errors)
 * @param {number} maxPrice - Maximum valid price (filter data errors)
 * @param {string} [fuelType='heating_oil'] - V2.12.0: Filter by fuel type
 */
async function getCurrentPrices(sequelize, minPrice, maxPrice, fuelType = 'heating_oil') {
  const [results] = await sequelize.query(`
    SELECT DISTINCT ON (sp.supplier_id)
      sp.supplier_id,
      sp.price_per_gallon as price,
      sp.min_gallons,
      sp.scraped_at,
      sp.source_type,
      sp.fuel_type
    FROM supplier_prices sp
    JOIN suppliers s ON sp.supplier_id = s.id
    WHERE sp.is_valid = true
      AND sp.expires_at > NOW()
      AND sp.scraped_at > NOW() - INTERVAL '36 hours'
      AND sp.price_per_gallon BETWEEN $1 AND $2
      AND sp.fuel_type = $3
      AND s.active = true
      AND s.allow_price_display = true
    ORDER BY sp.supplier_id, sp.scraped_at DESC
  `, {
    bind: [minPrice, maxPrice, fuelType]
  });

  return results.map(r => ({
    ...r,
    price: parseFloat(r.price)
  }));
}

/**
 * Get suppliers serving a specific set of ZIP codes, enriched with prices
 * Sorted: priced suppliers first (by price ASC), then unpriced alphabetically
 */
function getSuppliersForZips(suppliers, zips, priceMap) {
  const zipSet = new Set(zips);
  const matching = [];

  for (const supplier of suppliers) {
    const servedZips = supplier.postal_codes_served || [];
    const servesArea = servedZips.some(z => zipSet.has(z));

    if (servesArea) {
      const priceInfo = priceMap.get(supplier.id);
      matching.push({
        ...supplier,
        price: priceInfo?.price || null,
        minGallons: priceInfo?.min_gallons || null,
        scrapedAt: priceInfo?.scraped_at || null,
        priceSource: priceInfo?.source_type || null,
        hasPrice: !!priceInfo
      });
    }
  }

  // Sort: priced suppliers first (by price), then phone-only
  matching.sort((a, b) => {
    if (a.hasPrice && !b.hasPrice) return -1;
    if (!a.hasPrice && b.hasPrice) return 1;
    if (a.hasPrice && b.hasPrice) return a.price - b.price;
    return a.name.localeCompare(b.name);
  });

  return matching;
}

/**
 * Compute freshness label + dot class from a scraped_at timestamp
 */
function computeFreshness(scrapedAt) {
  if (!scrapedAt) return { text: '', dotClass: '' };
  const hours = (Date.now() - new Date(scrapedAt).getTime()) / 3600000;
  if (hours < 1) return { text: 'just now', dotClass: 'freshness-green' };
  if (hours < 12) return { text: Math.round(hours) + 'h ago', dotClass: 'freshness-green' };
  if (hours < 36) return { text: 'today', dotClass: 'freshness-green' };
  if (hours < 60) return { text: '1d ago', dotClass: 'freshness-yellow' };
  return { text: Math.round(hours / 24) + 'd ago', dotClass: 'freshness-gray' };
}

/**
 * Returns the set of supplier IDs that had a fresh price in the last `days` days
 * for the given fuel, restricted to active + displayable suppliers and valid prices.
 *
 * Used by the SEO generator to decide whether a state/county/city page is
 * substantive enough to be indexable. The window is wider than the 36h display
 * freshness so that single-day scraper outages do not flap pages between
 * indexed and noindexed.
 *
 * Filters mirror getCurrentPrices except the freshness window. Aggregator-signal
 * prices are excluded — they are market signals only and never user-facing
 * (see SupplierPrice.js:50,132,162).
 *
 * @param {object} sequelize - Sequelize instance
 * @param {string} fuelType - 'heating_oil', 'kerosene', or 'propane'
 * @param {number} days - Window size in days
 * @param {{minPrice: number, maxPrice: number}} range - Valid price range
 * @returns {Promise<Set<string>>} Set of supplier UUIDs.
 */
async function getRecentPricedSupplierIds(sequelize, fuelType, days, { minPrice, maxPrice }) {
  // `days` is interpolated into the SQL template literal because it's a
  // hardcoded numeric constant (INDEX_PRICE_WINDOW_DAYS = 14) at the call
  // site, never user input. Matches the inline-INTERVAL convention in
  // getCurrentPrices (lib/supplier-data.js:56). For belt-and-suspenders,
  // we coerce to integer with parseInt before interpolation.
  const intervalDays = parseInt(days, 10);
  if (!Number.isFinite(intervalDays) || intervalDays < 1) {
    throw new Error(`getRecentPricedSupplierIds: days must be a positive integer, got ${days}`);
  }
  const [rows] = await sequelize.query(`
    SELECT DISTINCT sp.supplier_id
    FROM supplier_prices sp
    JOIN suppliers s ON sp.supplier_id = s.id
    WHERE sp.is_valid = true
      AND sp.source_type != 'aggregator_signal'
      AND sp.scraped_at > NOW() - INTERVAL '${intervalDays} days'
      AND sp.price_per_gallon BETWEEN $1 AND $2
      AND sp.fuel_type = $3
      AND s.active = true
      AND s.allow_price_display = true
  `, { bind: [minPrice, maxPrice, fuelType] });
  return new Set(rows.map(r => r.supplier_id));
}

module.exports = {
  getAllSuppliers,
  getCurrentPrices,
  getSuppliersForZips,
  getRecentPricedSupplierIds,
  computeFreshness
};
