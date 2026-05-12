/**
 * Migration 161: Countryside Fuels (Fultonville NY)
 *
 * Subsidiary of Countryside Management Corp., owned/operated by the
 * Gramuglia family (Vincent — President, Anthony — Operations). Upstate NY
 * family-owned heating oil + kerosene + farm-fuel dealer since 1975. Three
 * depots (Fultonville HQ, Lewis, Otego) covering 10 NY counties:
 *   Fultonville → Fulton, Herkimer, Montgomery, Schenectady, Schoharie
 *   Lewis       → Clinton, Essex
 *   Otego       → Chenango, Delaware, Otsego
 *
 * COD qualification: published per-gallon prices on /service-area/ for all
 * three locations ($5.19 #2 oil / $5.69 kerosene at time of add), call to
 * order, no account required. Auto Delivery is an explicit opt-in via a
 * downloadable agreement (Oct-April heating season). "Countryside has an
 * on call phone system to allow emergency service when needed" — this
 * refers to after-hours dispatch, not the delivery model.
 *   https://countrysidefuels.com/service-area/
 *   https://countrysidefuels.com/about-us/
 *
 * NOT related to Countryside Propane LLC (PA) despite shared "Countryside"
 * branding — different state, phone, ownership, and product mix.
 *
 * Fuels offered: #2 fuel oil, K-1 kerosene, farm fuel (off-road diesel).
 * fuel_types stores heating_oil + kerosene (farm fuel = commercial dyed
 * diesel, not stocked in our home-heating directory).
 *
 * Owns a large NY-licensed/inspected truck fleet ("All trucks are New York
 * State Inspected, Registered and all meters are sealed by the state of
 * New York Weights and Measures division"). NOT an aggregator — the
 * /service-providers page lists HVAC/plumbing partners for service work
 * CSF doesn't perform, not other oil delivery brokers.
 *
 * Phone: 1-800-411-3835 (toll-free) / (518) 853-4399 (office). Email:
 * csfuels@nycap.rr.com. Coverage managed by scrape-config.json (postal
 * codes not written here per post-migration-100 rule).
 */

const { upsertSupplier } = require('./lib/upsert-supplier');

module.exports = {
  name: '161-add-countryside-fuels',

  async up(sequelize) {
    await upsertSupplier(sequelize, {
      name: 'Countryside Fuels',
      slug: 'countryside-fuels',
      phone: '(800) 411-3835',
      email: 'csfuels@nycap.rr.com',
      website: 'https://countrysidefuels.com',
      addressLine1: '58 Riverside Drive',
      city: 'Fultonville',
      state: 'NY',
      serviceCities: JSON.stringify([
        'Fultonville', 'Lewis', 'Otego',
      ]),
      serviceCounties: JSON.stringify([
        'Fulton', 'Herkimer', 'Montgomery', 'Schenectady', 'Schoharie',
        'Clinton', 'Essex',
        'Chenango', 'Delaware', 'Otsego',
      ]),
      serviceAreaRadius: 90,
      lat: 42.9491,
      lng: -74.3631,
      hoursWeekday: '8:00 AM - 5:00 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
      fuelTypes: JSON.stringify(['heating_oil', 'kerosene']),
      minimumGallons: null,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });

    console.log('[Migration 161] ✅ Added Countryside Fuels (Fultonville NY)');
  },

  async down(sequelize) {
    await sequelize.query(`
      DELETE FROM suppliers WHERE slug = 'countryside-fuels'
    `);
    console.log('[Migration 161] Rolled back Countryside Fuels');
  },
};
