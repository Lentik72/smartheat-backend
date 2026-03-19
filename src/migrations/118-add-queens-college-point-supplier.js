/**
 * Migration 118: Add Angelo's Fuel Oil (Queens / College Point area)
 *
 * Coverage gap: ZIP 11356 (College Point, Queens) had 0 active suppliers.
 * Adding Angelo's Fuel Oil — Flushing-based, 60+ years, will-call/COD confirmed.
 * Also expanding ssfuel.com and dominofuel.com coverage to include 11356 (via scrape-config).
 *
 * New suppliers:
 *   - Angelo's Fuel Oil Co (Flushing, NY) — Will-call/COD confirmed, no scrapable prices.
 *
 * Coverage (postalCodesServed) managed by scrape-config.json, NOT here.
 */

const { upsertSupplier } = require('./lib/upsert-supplier');

module.exports = {
  name: '118-add-queens-college-point-supplier',

  async up(sequelize) {
    const suppliers = [
      {
        name: "Angelo's Fuel Oil Co",
        slug: 'angelos-fuel-oil-co',
        phone: '(718) 357-3315',
        email: 'angelosfuel@gmail.com',
        website: 'https://angelosfuel.com',
        addressLine1: '132-41 34th Ave',
        city: 'Flushing',
        state: 'NY',
        // postalCodesServed in scrape-config.json
        serviceCities: JSON.stringify([
          'College Point', 'Flushing', 'Whitestone', 'Bayside', 'Astoria',
          'Long Island City', 'Corona', 'East Elmhurst', 'Elmhurst',
          'Jackson Heights', 'Woodside', 'Forest Hills', 'Rego Park',
          'Maspeth', 'Middle Village', 'Ridgewood', 'Fresh Meadows',
          'Jamaica', 'Ozone Park', 'Howard Beach', 'Richmond Hill',
          'South Ozone Park', 'Woodhaven', 'Cambria Heights', 'Springfield Gardens',
          'St. Albans', 'Hollis', 'Queens Village', 'Bellerose', 'Laurelton',
          'Rosedale',
        ]),
        serviceCounties: JSON.stringify([
          'Queens',
        ]),
        serviceAreaRadius: 15,
        lat: 40.7610,
        lng: -73.8375,
        hoursWeekday: null,
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: true,
        weekendDelivery: true,
        paymentMethods: JSON.stringify(['cash', 'credit_card', 'check']),
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

    console.log("[Migration 118] Added Angelo's Fuel Oil Co (Queens/College Point)");
  },

  async down(sequelize) {
    await sequelize.query(
      `DELETE FROM suppliers WHERE slug IN ('angelos-fuel-oil-co')`
    );
  }
};
