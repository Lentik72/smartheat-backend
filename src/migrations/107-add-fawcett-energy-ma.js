/**
 * Migration 107: Add Fawcett Energy — Massachusetts
 *
 * Will-call confirmed: "Will Call (Credit Card) — Prices are kept as low as
 * possible as payment is required at time of delivery resulting in no
 * receivables as balances for our company." — fawcettenergy.com/payment-options/
 *
 * Family-owned since 1894, 6 MA locations. Heating oil (BioHeat).
 * No prices published — directory-only listing.
 *
 * Coverage (postalCodesServed) managed by scrape-config.json, NOT here.
 */

const { upsertSupplier } = require('./lib/upsert-supplier');

module.exports = {
  name: '107-add-fawcett-energy-ma',

  async up(sequelize) {
    const suppliers = [
      {
        name: 'Fawcett Energy',
        slug: 'fawcett-energy',
        phone: '(800) 792-5678',
        email: 'info@fawcettenergy.com',
        website: 'https://www.fawcettenergy.com',
        addressLine1: '31 Holton Street',
        city: 'Winchester',
        state: 'MA',
        zipCode: '01890',
        // postalCodesServed in scrape-config.json
        serviceCities: JSON.stringify([
          'Winchester', 'Blackstone', 'North Dartmouth', 'Worcester',
          'Weymouth', 'Kingston', 'Boston', 'Braintree', 'Quincy',
          'Cambridge', 'Somerville', 'Brookline', 'Newton', 'Dedham',
          'Norwood', 'Canton', 'Stoughton', 'Brockton', 'Hingham',
          'Cohasset', 'Scituate', 'Hanover', 'Rockland', 'Abington',
          'Whitman', 'Pembroke', 'Marshfield', 'Plymouth', 'Norwell',
          'Sharon', 'Needham', 'Westwood', 'Walpole', 'Milton',
          'Randolph', 'Holbrook', 'Avon', 'Malden', 'Everett',
          'Chelsea', 'Revere', 'Winthrop', 'Hull', 'Fall River',
          'New Bedford', 'Taunton', 'Attleboro', 'North Attleborough',
          'Mansfield', 'Foxborough', 'Franklin', 'Milford', 'Hopkinton',
          'Framingham', 'Natick', 'Wellesley', 'Waltham', 'Watertown',
          'Arlington', 'Medford', 'Woburn', 'Burlington', 'Lexington',
          'Concord', 'Acton', 'Lowell', 'Lawrence', 'Haverhill',
          'Newburyport', 'Beverly', 'Salem', 'Peabody', 'Lynn',
          'Gloucester', 'Marblehead', 'Swampscott'
        ]),
        serviceCounties: JSON.stringify([
          'Norfolk', 'Plymouth', 'Suffolk', 'Middlesex',
          'Essex', 'Bristol', 'Worcester'
        ]),
        serviceAreaRadius: 50,
        lat: 42.4529,
        lng: -71.1370,
        hoursWeekday: null,
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: true,
        weekendDelivery: false,
        paymentMethods: JSON.stringify(['credit_card']),
        fuelTypes: JSON.stringify(['heating_oil']),
        minimumGallons: null,
        seniorDiscount: false,
        allowPriceDisplay: false,
        notes: null,
        active: true,
      },
    ];

    for (const s of suppliers) {
      await upsertSupplier(sequelize, s);
    }

    console.log('[Migration 107] Added 1 MA supplier (Fawcett Energy)');
  },

  async down(sequelize) {
    await sequelize.query(
      `DELETE FROM suppliers WHERE slug IN ('fawcett-energy')`
    );
  }
};
