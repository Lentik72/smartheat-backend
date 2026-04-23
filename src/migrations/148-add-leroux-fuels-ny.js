/**
 * Migration 148: Add Leroux Fuels (Plattsburgh, NY — Clinton County)
 *
 * Surfaced during 12901/12992 coverage-gap research. First live COD entry
 * for Clinton County NY. Covers both target ZIPs (Plattsburgh + West Chazy).
 *
 * COD confirmed verbatim on own site:
 *   "Contact us for today's cash price for fuel."
 *   — https://www.lerouxfuels.com/fuel-oil/2022377
 *
 * `today's cash price` is accepted COD language per skill rules.
 *
 * Not scrapable: website uses base64-encoded inline data bindings for all
 * numeric content (phone numbers use `data-encoded-value` attributes). Prices
 * are phone-only by design — their CTA is literally "Contact us for today's
 * cash price." allowPriceDisplay=false, scrape-config disabled with reason.
 *
 * Coverage: all 21 Clinton County NY ZIPs + 3 adjacent northern Essex County
 * ZIPs (Bloomingdale, Keeseville, Willsboro) that are within Plattsburgh
 * delivery range. Company states "Clinton and Northern Essex counties" but
 * doesn't enumerate towns — conservative selection based on geographic
 * proximity to Leroux's 994 Military Tpke Plattsburgh base.
 *
 * Coverage managed by scrape-config.json (postal_codes_served NOT written
 * here per post-migration-100 rule).
 */

const { upsertSupplier } = require('./lib/upsert-supplier');

module.exports = {
  name: '148-add-leroux-fuels-ny',

  async up(sequelize) {
    await upsertSupplier(sequelize, {
      name: 'Leroux Fuels',
      slug: 'leroux-fuels',
      phone: '(518) 563-3653',
      email: 'info@lerouxfuels.com',
      website: 'https://www.lerouxfuels.com',
      addressLine1: '994 Military Tpke',
      city: 'Plattsburgh',
      state: 'NY',
      serviceCities: JSON.stringify([
        'Plattsburgh', 'Altona', 'Au Sable Chasm', 'Au Sable Forks',
        'Cadyville', 'Champlain', 'Chazy', 'Churubusco', 'Ellenburg Center',
        'Ellenburg Depot', 'Lyon Mountain', 'Merrill', 'Mooers', 'Mooers Forks',
        'Morrisonville', 'Peru', 'Rouses Point', 'Saranac', 'Schuyler Falls',
        'West Chazy', 'Bloomingdale', 'Keeseville', 'Willsboro',
      ]),
      serviceCounties: JSON.stringify(['Clinton', 'Essex']),
      serviceAreaRadius: 30,
      lat: 44.71187,
      lng: -73.465102,
      hoursWeekday: null,
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'check', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'diesel']),
      minimumGallons: null,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    });

    console.log('[Migration 148] ✅ Added Leroux Fuels (Plattsburgh NY — Clinton + N. Essex)');
  },

  async down(sequelize) {
    await sequelize.query(`DELETE FROM suppliers WHERE slug = 'leroux-fuels'`);
    console.log('[Migration 148] Rolled back Leroux Fuels');
  },
};
