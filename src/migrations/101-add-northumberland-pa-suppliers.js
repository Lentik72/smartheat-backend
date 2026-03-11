/**
 * Migration 101: Add Northumberland County PA suppliers
 *
 * Aaron's Heating Oil: COD medium confidence — "CALL FOR PRICING" + LIHEAP vendor.
 *   Mount Carmel, PA. Serves Northumberland, Schuylkill, Columbia counties.
 *
 * Kratzer Oil Company: COD high confidence — "we also serve Call In customers"
 *   Sunbury, PA. Serves Northumberland County area.
 *
 * Coverage (postalCodesServed) managed by scrape-config.json, NOT here.
 */

const { upsertSupplier } = require('./lib/upsert-supplier');

module.exports = {
  name: '101-add-northumberland-pa-suppliers',

  async up(sequelize) {
    const suppliers = [
      {
        name: "Aaron's Heating Oil",
        slug: 'aarons-heating-oil',
        phone: '(570) 339-3161',
        email: null,
        website: 'https://aaronsheatingoil.com',
        addressLine1: '171 Colonial Ave',
        city: 'Mount Carmel',
        state: 'PA',
        // postalCodesServed in scrape-config.json
        serviceCities: JSON.stringify([
          'Mount Carmel', 'Shamokin', 'Coal Township', 'Kulpmont', 'Ashland',
          'Shenandoah', 'Frackville', 'Pottsville', 'Bloomsburg', 'Berwick',
          'Sunbury', 'Northumberland', 'Trevorton', 'Elysburg', 'Paxinos',
          'Marion Heights', 'Locust Gap', 'Mahanoy City', 'Girardville',
          'Minersville', 'Catawissa', 'Danville'
        ]),
        serviceCounties: JSON.stringify(['Northumberland', 'Schuylkill', 'Columbia']),
        serviceAreaRadius: 30,
        lat: 40.7976,
        lng: -76.4113,
        hoursWeekday: '8:00 AM - 4:00 PM',
        hoursSaturday: '9:00 AM - 5:00 PM',
        hoursSunday: null,
        emergencyDelivery: false,
        weekendDelivery: true,
        paymentMethods: JSON.stringify(['cash', 'check']),
        fuelTypes: JSON.stringify(['heating_oil']),
        minimumGallons: null,
        seniorDiscount: false,
        allowPriceDisplay: false,
        notes: null,
        active: true,
      },
      {
        name: 'Kratzer Oil Company',
        slug: 'kratzer-oil-company',
        phone: '(570) 286-6731',
        email: null,
        website: 'https://kratzeroil.com',
        addressLine1: '150 East Dr',
        city: 'Sunbury',
        state: 'PA',
        // postalCodesServed in scrape-config.json
        serviceCities: JSON.stringify([
          'Sunbury', 'Northumberland', 'Shamokin', 'Coal Township', 'Milton',
          'Watsontown', 'Turbotville', 'Riverside', 'Danville', 'Elysburg',
          'Paxinos', 'Mount Carmel', 'Kulpmont', 'Trevorton', 'Herndon',
          'Dalmatia', 'Dornsife'
        ]),
        serviceCounties: JSON.stringify(['Northumberland']),
        serviceAreaRadius: 25,
        lat: 40.8626,
        lng: -76.7944,
        hoursWeekday: '8:00 AM - 4:30 PM',
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: false,
        weekendDelivery: false,
        paymentMethods: JSON.stringify(['cash', 'check', 'credit_card']),
        fuelTypes: JSON.stringify(['heating_oil', 'diesel']),
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

    console.log('[Migration 101] Added 2 Northumberland County PA suppliers');
  },

  async down(sequelize) {
    await sequelize.query(
      `DELETE FROM suppliers WHERE slug IN ('aarons-heating-oil', 'kratzer-oil-company')`
    );
  }
};
