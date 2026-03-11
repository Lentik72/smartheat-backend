/**
 * Migration 102: Add Herkimer County NY suppliers
 *
 * Snyder Fuel Service: Will-call high confidence — "Will call means you call
 *   for delivery when you are at 3/8 of a tank"
 *   Newport, NY. Serves Herkimer County / Mohawk Valley area.
 *
 * Coverage (postalCodesServed) managed by scrape-config.json, NOT here.
 */

const { upsertSupplier } = require('./lib/upsert-supplier');

module.exports = {
  name: '102-add-herkimer-ny-suppliers',

  async up(sequelize) {
    const suppliers = [
      {
        name: 'Snyder Fuel Service',
        slug: 'snyder-fuel-service',
        phone: '(315) 845-8742',
        email: 'snyderfuel@snyderfuel.com',
        website: 'https://snyderfuel.com',
        addressLine1: '7432 Main Street',
        city: 'Newport',
        state: 'NY',
        // postalCodesServed in scrape-config.json
        serviceCities: JSON.stringify([
          'Newport', 'Middleville', 'Poland', 'Cold Brook', 'Barneveld',
          'Holland Patent', 'Remsen', 'Schuyler', 'Ilion', 'Mohawk',
          'Herkimer', 'Little Falls', 'St. Johnsville', 'Dolgeville',
          'Oppenheim', 'Salisbury', 'Norway', 'Fairfield', 'Jordanville',
          'Van Hornesville', 'Frankfort', 'Salisbury Center'
        ]),
        serviceCounties: JSON.stringify(['Herkimer', 'Oneida', 'Montgomery']),
        serviceAreaRadius: 25,
        lat: 43.0084,
        lng: -75.0062,
        hoursWeekday: '7:30 AM - 4:30 PM',
        hoursSaturday: '8:00 AM - 11:00 AM',
        hoursSunday: null,
        emergencyDelivery: false,
        weekendDelivery: false,
        paymentMethods: JSON.stringify(['cash', 'check', 'credit_card']),
        fuelTypes: JSON.stringify(['heating_oil', 'diesel', 'kerosene', 'propane']),
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

    console.log('[Migration 102] Added 1 Herkimer County NY supplier');
  },

  async down(sequelize) {
    await sequelize.query(
      `DELETE FROM suppliers WHERE slug IN ('snyder-fuel-service')`
    );
  }
};
