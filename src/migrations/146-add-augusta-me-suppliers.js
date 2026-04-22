/**
 * Migration 146: Add 3 Augusta ME (04330) Area Suppliers
 *
 * Kennebec County coverage gap — 04330 had 0 enabled suppliers in scrape-config
 * (ggcashfuel down, cbhaskellfuel JS-rendered, onlinefuel.net is aggregator).
 *
 * ALL THREE SCRAPABLE (heating oil direct via got-scraping-compatible fetch):
 *
 *  1. Litchfield Fuel Co — Litchfield, ME (04350)
 *     COD: "Automatic (Keep Full) Delivery as well as will-call deliveries"
 *     + senior discount + 24h emergency. Est. 1988, 35+ yrs.
 *     Prices served from /price/price.txt iframe (status 200 with proper Accept headers).
 *     Scrapes oil ($4.899) + K-1 kerosene ($5.699).
 *
 *  2. M.A. Haskell Fuel Company LLC — Palermo, ME (04354)
 *     COD: "DAILY CASH PRICE" displayed on homepage with #2 $4.899 and K-1 $5.899.
 *     Serves 30+ central Maine towns incl. Augusta, Manchester, Gardiner, Waterville.
 *     FMCSA/D&B registered, est. 2009. Scrapes oil + K-1.
 *
 *  3. CN Brown Energy (Augusta) — Augusta, ME (04330)
 *     COD: Cash price publicly displayed per ZIP via /locations/?location-zip-code={zip}.
 *     Augusta Energy Office at 362 Riverside Dr. Family-owned 75+ yrs, 23 heating oil
 *     offices, vertically integrated (owns trucks + locations). lookupUrl pattern
 *     with lookupZip=04330 returns $4.999 cash price in static HTML.
 *     This DB record scoped to the Augusta branch only (12 ZIPs verified via
 *     probing the lookup form — other branches have distinct pricing).
 *
 * Coverage managed by scrape-config.json (postal_codes_served NOT written here per
 * post-migration-100 rule).
 */

const { upsertSupplier } = require('./lib/upsert-supplier');

module.exports = {
  name: '146-add-augusta-me-suppliers',

  async up(sequelize) {
    // ============================================
    // 1. LITCHFIELD FUEL CO — Litchfield, ME
    // Will-call explicit. Senior discount. 24hr emergency. Est. 1988.
    // ============================================
    await upsertSupplier(sequelize, {
      name: 'Litchfield Fuel Co',
      slug: 'litchfield-fuel',
      phone: '(207) 268-4438',
      email: 'info@litchfieldfuel.com',
      website: 'https://www.litchfieldfuel.com',
      addressLine1: '549 Richmond Rd',
      city: 'Litchfield',
      state: 'ME',
      serviceCities: JSON.stringify([
        'Augusta', 'Bowdoin', 'Chelsea', 'Farmingdale', 'Gardiner',
        'Hallowell', 'Litchfield', 'Manchester', 'Monmouth', 'Randolph',
        'Richmond', 'Sabattus', 'Wales', 'West Gardiner', 'Winthrop',
      ]),
      serviceCounties: JSON.stringify(['Kennebec', 'Androscoggin', 'Sagadahoc']),
      serviceAreaRadius: 25,
      lat: 44.158104,
      lng: -69.95404,
      hoursWeekday: null,
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['credit_card', 'check', 'cash']),
      fuelTypes: JSON.stringify(['heating_oil', 'kerosene']),
      minimumGallons: null,
      seniorDiscount: true,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });

    // ============================================
    // 2. M.A. HASKELL FUEL COMPANY LLC — Palermo, ME
    // "DAILY CASH PRICE" on homepage. Family-owned. Diesel/off-road too.
    // Propane offered but listed as "Call for Pricing" → NOT scrapable for propane.
    // ============================================
    await upsertSupplier(sequelize, {
      name: 'M.A. Haskell Fuel Company LLC',
      slug: 'm-a-haskell-fuel',
      phone: '(207) 993-2265',
      email: 'hhaskell@mahaskellfuel.com',
      website: 'https://mahaskellfuel.com',
      addressLine1: '316 Maine Highway 3',
      city: 'Palermo',
      state: 'ME',
      serviceCities: JSON.stringify([
        'Augusta', 'Manchester', 'Chelsea', 'Hallowell', 'Farmingdale',
        'Gardiner', 'South Gardiner', 'Randolph', 'Winthrop', 'East Winthrop',
        'Belgrade', 'Belgrade Lakes', 'South China', 'China Village', 'China',
        'East Vassalboro', 'Vassalboro', 'North Vassalboro', 'Waterville',
        'Palermo', 'Windsor', 'Albion', 'Washington', 'Liberty', 'Freedom',
        'Coopers Mills', 'Jefferson', 'Whitefield', 'Fairfield', 'Unity',
        'Thorndike', 'Searsmont', 'Morrill', 'Clinton', 'Hope', 'Union', 'Burnham',
      ]),
      serviceCounties: JSON.stringify(['Kennebec', 'Waldo', 'Lincoln', 'Knox']),
      serviceAreaRadius: 35,
      lat: 44.39559,
      lng: -69.4168,
      hoursWeekday: '8:00 AM - 4:00 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
      fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'propane', 'diesel']),
      minimumGallons: 100,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });

    // ============================================
    // 3. CN BROWN ENERGY (AUGUSTA) — Augusta, ME
    // Augusta Energy Office at 362 Riverside Dr. Family-owned 75+ years.
    // National chain (ME/NH/VT/MA) but vertically integrated, not a franchise.
    // Per-ZIP cash price via ?location-zip-code=ZIP lookup. This record is scoped
    // to the Augusta branch's 12 confirmed ZIPs (probed via lookup form).
    // ============================================
    await upsertSupplier(sequelize, {
      name: 'CN Brown Energy (Augusta)',
      slug: 'cn-brown-augusta',
      phone: '(207) 622-6262',
      email: 'ho3030Group@cnbrown.com',
      website: 'https://cnbrownenergy.com',
      addressLine1: '362 Riverside Dr',
      city: 'Augusta',
      state: 'ME',
      serviceCities: JSON.stringify([
        'Augusta', 'Farmingdale', 'Gardiner', 'Hallowell', 'Manchester',
        'Randolph', 'Readfield', 'South China', 'Vassalboro', 'Windsor',
        'Winthrop', 'North Whitefield',
      ]),
      serviceCounties: JSON.stringify(['Kennebec', 'Lincoln']),
      serviceAreaRadius: 25,
      lat: 44.351642,
      lng: -69.803773,
      hoursWeekday: null,
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
      fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'diesel', 'propane']),
      minimumGallons: null,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });

    console.log('[Migration 146] ✅ Added 3 Augusta ME suppliers (Litchfield, Haskell, CN Brown Augusta)');
  },

  async down(sequelize) {
    await sequelize.query(`
      DELETE FROM suppliers
      WHERE slug IN ('litchfield-fuel', 'm-a-haskell-fuel', 'cn-brown-augusta')
    `);
    console.log('[Migration 146] Rolled back Augusta ME suppliers');
  },
};
