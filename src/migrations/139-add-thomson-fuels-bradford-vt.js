/**
 * Migration 139: Add Thomson Fuels (Bradford, VT)
 *
 * COD confirmed by user. Serves VT Upper Valley + NH Grafton County (incl. North Haverhill).
 * Not scrapable — no public prices on website. Directory-only listing.
 *
 * Coverage managed by scrape-config.json (postalCodesServed NOT written here).
 */

const { v4: uuidv4 } = require('uuid');

module.exports = {
  name: '139-add-thomson-fuels-bradford-vt',

  async up(sequelize) {
    const supplier = {
      id: uuidv4(),
      name: 'Thomson Fuels',
      slug: 'thomson-fuels',
      phone: '(802) 222-3330',
      email: 'info@thomsonfuels.com',
      website: 'https://www.thomsonfuels.com',
      addressLine1: '177 Main St',
      city: 'Bradford',
      state: 'VT',
      postalCodesServed: JSON.stringify([]),
      serviceCities: JSON.stringify([
        'Bradford', 'Chelsea', 'Corinth', 'East Corinth', 'East Thetford',
        'Fairlee', 'Groton', 'Newbury', 'North Thetford', 'Norwich',
        'Post Mills', 'South Ryegate', 'South Strafford', 'Thetford',
        'Thetford Center', 'Topsham', 'Vershire', 'West Fairlee',
        'West Newbury', 'West Topsham', 'Wells River',
        'Bath', 'Etna', 'Glencliff', 'Hanover', 'Haverhill', 'Lisbon',
        'Lyme', 'Lyme Center', 'Monroe', 'North Haverhill', 'Orford',
        'Piermont', 'Pike', 'Warren', 'Wentworth', 'Woodsville'
      ]),
      serviceCounties: JSON.stringify(['Orange', 'Windsor', 'Grafton']),
      serviceAreaRadius: 30,
      lat: 44.0047,
      lng: -72.1585,
      hoursWeekday: '8:00 AM - 5:00 PM',
      hoursSaturday: '9:00 AM - 12:00 PM (Oct-Apr)',
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'check', 'credit_card', 'debit_card']),
      fuelTypes: JSON.stringify(['heating_oil', 'propane', 'diesel']),
      minimumGallons: null,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    };

    await sequelize.query(`
      INSERT INTO suppliers (
        id, name, slug, phone, email, website, address_line1, city, state,
        postal_codes_served, service_cities, service_counties, service_area_radius,
        lat, lng, hours_weekday, hours_saturday, hours_sunday,
        emergency_delivery, weekend_delivery, payment_methods, fuel_types,
        minimum_gallons, senior_discount, allow_price_display, notes, active,
        created_at, updated_at
      ) VALUES (
        :id, :name, :slug, :phone, :email, :website, :addressLine1, :city, :state,
        :postalCodesServed, :serviceCities, :serviceCounties, :serviceAreaRadius,
        :lat, :lng, :hoursWeekday, :hoursSaturday, :hoursSunday,
        :emergencyDelivery, :weekendDelivery, :paymentMethods, :fuelTypes,
        :minimumGallons, :seniorDiscount, :allowPriceDisplay, :notes, :active,
        NOW(), NOW()
      )
      ON CONFLICT (slug) DO UPDATE SET
        -- postal_codes_served intentionally NOT updated: ScrapeConfigSync owns
        -- this column post-migration-100 (backend/CLAUDE.md "Coverage Authority").
        service_cities = EXCLUDED.service_cities,
        service_counties = EXCLUDED.service_counties,
        service_area_radius = EXCLUDED.service_area_radius,
        hours_weekday = EXCLUDED.hours_weekday,
        hours_saturday = EXCLUDED.hours_saturday,
        hours_sunday = EXCLUDED.hours_sunday,
        emergency_delivery = EXCLUDED.emergency_delivery,
        weekend_delivery = EXCLUDED.weekend_delivery,
        payment_methods = EXCLUDED.payment_methods,
        minimum_gallons = EXCLUDED.minimum_gallons,
        senior_discount = EXCLUDED.senior_discount,
        allow_price_display = EXCLUDED.allow_price_display,
        updated_at = NOW()
    `, {
      replacements: {
        ...supplier,
        emergencyDelivery: supplier.emergencyDelivery === true,
        weekendDelivery: supplier.weekendDelivery === true,
        seniorDiscount: supplier.seniorDiscount === true,
        allowPriceDisplay: supplier.allowPriceDisplay === true,
        minimumGallons: supplier.minimumGallons || null,
        notes: supplier.notes || null,
        email: supplier.email || null,
      }
    });

    console.log('[Migration 139] ✅ Added Thomson Fuels (Bradford, VT)');
  },

  async down(sequelize) {
    await sequelize.query(`DELETE FROM suppliers WHERE slug = 'thomson-fuels'`);
    console.log('[Migration 139] Rolled back Thomson Fuels');
  }
};
