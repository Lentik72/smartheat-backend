/**
 * Migration 164: Wardwell Oil + No Frills Oil (Hancock County, ME)
 *
 * Two Blue Hill / Hancock County COD suppliers operated by the same parent
 * (No Frills Oil Co., Inc. — Wardwell's homepage footer reads "© 2026
 * No Frills Oil Co., Inc."). Added as two separate supplier records because
 * they ship under distinct brands, phones, addresses, prices, and overlapping-
 * but-different service areas. Closes 04614 Blue Hill gap (existing
 * hometownfuelme.com covers parts of Hancock but not Blue Hill peninsula).
 *
 * COD qualification (both):
 *   "Will Call Delivery. A customer may call when he/she wishes product to be
 *    delivered."
 *   "C.O.D Accounts. C.O.D accounts require payment before or at the time of
 *    delivery."
 *   — https://wardwelloil.com/terms-and-conditions/
 *   — https://nofrillsoil.com/terms-and-conditions/
 *
 * Both sites use the same WordPress + Genesis template with the
 * `nfo-pricing-widget` widget exposing #2 Oil + Kerosene cash prices on the
 * homepage. Same priceRegex shape for both. If the shared template changes,
 * both break together — backoff will catch it.
 *
 * Wardwell Oil — Sedgwick (since 1960):
 *   $4.69 oil / $5.01 K-1 at time of add; 14 ZIPs across the Blue Hill
 *   peninsula + Castine + Deer Isle.
 *
 * No Frills Oil — Hancock (since 1980):
 *   $4.699 oil / $5.019 K-1 at time of add; 37 ZIPs across broad Hancock
 *   County plus Bangor/Brewer/Hampden (Penobscot) and Cherryfield/Milbridge/
 *   Steuben (Washington).
 *
 * Coverage managed by scrape-config.json (post-migration-100 rule —
 * postal_codes_served not written here).
 */

const { upsertSupplier } = require('./lib/upsert-supplier');

module.exports = {
  name: '164-add-wardwell-no-frills-blue-hill',

  async up(sequelize) {
    await upsertSupplier(sequelize, {
      name: 'Wardwell Oil',
      slug: 'wardwell-oil-sedgwick',
      phone: '(207) 359-8953',
      email: null,
      website: 'https://wardwelloil.com',
      addressLine1: '760 Mines Road',
      city: 'Sedgwick',
      state: 'ME',
      serviceCities: JSON.stringify([
        'Blue Hill', 'East Blue Hill', 'Brooklin', 'Brooksville', 'Bucksport',
        'Cape Rosier', 'Castine', 'Deer Isle', 'Harborside', 'Little Deer Isle',
        'Orland', 'Penobscot', 'Sargentville', 'Sedgwick', 'Surry',
        'Verona Island',
      ]),
      serviceCounties: JSON.stringify(['Hancock']),
      serviceAreaRadius: 30,
      lat: 44.399111,
      lng: -68.701228,
      hoursWeekday: null,
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
      fuelTypes: JSON.stringify(['heating_oil', 'kerosene']),
      minimumGallons: null,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });

    console.log('[Migration 164] ✅ Added Wardwell Oil (Sedgwick ME)');

    await upsertSupplier(sequelize, {
      name: 'No Frills Oil',
      slug: 'no-frills-oil-hancock',
      phone: '(207) 422-3581',
      email: null,
      website: 'https://nofrillsoil.com',
      addressLine1: '1166 US Hwy 1 Ste. A',
      city: 'Hancock',
      state: 'ME',
      serviceCities: JSON.stringify([
        'Bangor', 'Bar Harbor', 'Bass Harbor', 'Bernard', 'Birch Harbor',
        'Blue Hill', 'Brewer', 'Brooksville', 'Bucksport', 'Bunkers Harbor',
        'Cape Rosier', 'Cherryfield', 'Clifton', 'Corea', 'Cranberry Isles',
        'Dedham', 'Deer Isle', 'East Blue Hill', 'Eastbrook', 'Ellsworth',
        'Franklin', 'Gouldsboro', 'Hampden', 'Hancock', 'Islesford',
        'Lamoine', 'Levant', 'Little Deer Isle', 'Manset', 'Mariaville',
        'Marlboro', 'Milbridge', 'Mount Desert', 'North Ellsworth',
        'North Sullivan', 'Northeast Harbor', 'Orland', 'Orrington', 'Otis',
        'Otter Creek', 'Penobscot', 'Prospect Harbor', 'Salisbury Cove',
        'Seal Cove', 'Seal Harbor', 'Sedgwick', 'Somesville', 'Sorrento',
        'Southwest Harbor', 'Steuben', 'Sullivan', 'Surry', 'Swans Island',
        'Town Hill', 'Trenton', 'Verona Island', 'Waltham', 'West Tremont',
        'Winter Harbor',
      ]),
      serviceCounties: JSON.stringify(['Hancock', 'Penobscot', 'Washington']),
      serviceAreaRadius: 50,
      lat: 44.641873,
      lng: -68.391481,
      hoursWeekday: null,
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
      fuelTypes: JSON.stringify(['heating_oil', 'kerosene']),
      minimumGallons: null,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });

    console.log('[Migration 164] ✅ Added No Frills Oil (Hancock ME)');
  },

  async down(sequelize) {
    await sequelize.query(`
      DELETE FROM suppliers
      WHERE slug IN ('wardwell-oil-sedgwick', 'no-frills-oil-hancock')
    `);
    console.log('[Migration 164] Rolled back Wardwell Oil + No Frills Oil');
  },
};
