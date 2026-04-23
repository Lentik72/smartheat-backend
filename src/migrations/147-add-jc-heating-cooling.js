/**
 * Migration 147: Add JC Heating & Cooling (Levittown/Yardley, PA)
 *
 * Bucks County PA addition surfaced during 18974 Warminster research.
 *
 * COD confirmed on dedicated /cash-on-delivery-oil page:
 *   - "cash on delivery (COD) basis"
 *   - "you must pay for the delivery at the time your fuel oil is delivered"
 *   - "There are no additional services (AUTOMATIC DELIVERY, CREDIT OR SERVICE
 *      AGREEMENTS) connected to this option."
 *
 * Two offices (Levittown + Yardley) with unified service area (40 Bucks + 2
 * Montgomery County towns) and shared pricing — ONE DB record is appropriate
 * here (distinct from the CN Brown multi-branch model where each office has its
 * own price).
 *
 * Prices scrape as Pattern 5 (table) on /discount-home-heating-oil. Six tiers
 * (300/150/100/75/50/25 gal); the 150 gal tier matches the 100 and 300 gal
 * tiers at the lowest price, so the scraper's default sort-ascending + return
 * lowest correctly yields the 150 gal price.
 *
 * Disambiguation: "JC Discount Fuel Oil" (slug `jc-discount-fuel-oil`) already
 * exists in DB but is a DIFFERENT company — Long Island NY with 631 area code.
 * This record is Pennsylvania with 215 area code. No duplicate.
 *
 * Coverage managed by scrape-config.json (postal_codes_served NOT written here
 * per post-migration-100 rule).
 */

const { upsertSupplier } = require('./lib/upsert-supplier');

module.exports = {
  name: '147-add-jc-heating-cooling',

  async up(sequelize) {
    await upsertSupplier(sequelize, {
      name: 'JC Heating & Cooling',
      slug: 'jc-heating-cooling',
      phone: '(215) 945-4833',
      email: null,
      website: 'https://www.jcheatingoil.com',
      addressLine1: '181 Fallsington-Tullytown Rd',
      city: 'Levittown',
      state: 'PA',
      serviceCities: JSON.stringify([
        'Andalusia', 'Bensalem', 'Bristol', 'Buckingham', 'Chalfont',
        'Churchville', 'Cornwell Heights', 'Croydon', 'Doylestown',
        'Fairless Hills', 'Fallsington', 'Feasterville', 'Furlong',
        'Hatboro', 'Holland', 'Hulmeville', 'Ivyland', 'Jamison',
        'Langhorne', 'Levittown', 'Lower Makefield', 'Lower Moreland',
        'Morrisville', 'New Hope', 'Newtown', 'Parkland', 'Penndel',
        'Penns Park', 'Pineville', 'Richboro', 'Rushland', 'Southampton',
        'Tullytown', 'Upper Makefield', 'Upper Moreland', 'Warminster',
        'Warrington', 'Washington Crossing', 'Wrightstown', 'Yardley',
      ]),
      serviceCounties: JSON.stringify(['Bucks', 'Montgomery']),
      serviceAreaRadius: 20,
      lat: 40.174246,
      lng: -74.821857,
      hoursWeekday: null,
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'check', 'credit_card', 'debit_card']),
      fuelTypes: JSON.stringify(['heating_oil']),
      minimumGallons: null,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });

    console.log('[Migration 147] ✅ Added JC Heating & Cooling (Levittown/Yardley, PA — 40 Bucks/Montgomery towns)');
  },

  async down(sequelize) {
    await sequelize.query(`DELETE FROM suppliers WHERE slug = 'jc-heating-cooling'`);
    console.log('[Migration 147] Rolled back JC Heating & Cooling');
  },
};
