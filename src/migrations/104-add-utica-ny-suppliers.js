/**
 * Migration 104: Add Utica NY supplier — Thermo Petroleum Products
 *
 * Will-call confirmed: "Phone orders" + "Scheduled deliveries to suit your needs"
 * Also offers budget programs and automatic deliveries.
 * Prices on homepage: $X.XXX/Gal (oil + kerosene). 24hr service.
 *
 * Coverage (postalCodesServed) managed by scrape-config.json, NOT here.
 */

const { upsertSupplier } = require('./lib/upsert-supplier');

module.exports = {
  name: '104-add-utica-ny-suppliers',

  async up(sequelize) {
    const suppliers = [
      {
        name: 'Thermo Petroleum Products',
        slug: 'thermo-petroleum-products',
        phone: '(315) 737-7361',
        email: null,
        website: 'https://www.thermoheatingcny.com',
        addressLine1: '718 Whitesboro Street',
        city: 'Utica',
        state: 'NY',
        // postalCodesServed in scrape-config.json
        serviceCities: JSON.stringify([
          'Utica', 'New Hartford', 'Yorkville', 'Marcy', 'Whitesboro',
          'New York Mills', 'Clark Mills', 'Oriskany', 'Sauquoit',
          'Barneveld', 'Herkimer', 'Ilion', 'Frankfort', 'Mohawk', 'Newport'
        ]),
        serviceCounties: JSON.stringify(['Oneida', 'Herkimer']),
        serviceAreaRadius: 20,
        lat: 43.1050,
        lng: -75.2400,
        hoursWeekday: '9:00 AM - 5:00 PM',
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: true,
        weekendDelivery: false,
        paymentMethods: JSON.stringify(['cash', 'check', 'credit_card']),
        fuelTypes: JSON.stringify(['heating_oil', 'kerosene']),
        minimumGallons: 100,
        seniorDiscount: false,
        allowPriceDisplay: true,
        notes: null,
        active: true,
      },
    ];

    for (const s of suppliers) {
      await upsertSupplier(sequelize, s);
    }

    console.log('[Migration 104] Added 1 Utica NY supplier');
  },

  async down(sequelize) {
    await sequelize.query(
      `DELETE FROM suppliers WHERE slug IN ('thermo-petroleum-products')`
    );
  }
};
