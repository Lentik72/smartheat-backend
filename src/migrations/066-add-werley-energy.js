/**
 * Migration 066: Add Werley Energy (Reading, PA)
 *
 * Will-call confirmed: "Call us when you need us" delivery option, no contract required.
 * Prepay by phone or at office. In business 100+ years.
 * Website was missing DB record despite being enabled in scrape-config.
 */

const { v4: uuidv4 } = require('uuid');

module.exports = {
  name: '066-add-werley-energy',

  async up(sequelize) {
    const supplier = {
      id: uuidv4(),
      name: 'Werley Energy',
      slug: 'werley-energy',
      phone: '(610) 375-6166',
      email: 'fuel@werleyenergy.com',
      website: 'https://www.werleyenergy.com',
      addressLine1: '717 Lancaster Ave',
      city: 'Reading',
      state: 'PA',
      postalCodesServed: JSON.stringify([
        // Berks County (core)
        '19601', // Reading
        '19602', // Reading
        '19604', // Reading
        '19605', // Reading
        '19606', // Reading
        '19607', // Reading (HQ)
        '19608', // Reading
        '19609', // Reading
        '19610', // Reading
        '19611', // Reading
        '19506', // Bernville
        '19508', // Birdsboro
        '19510', // Blandon
        '19512', // Boyertown
        '19522', // Fleetwood
        '19526', // Hamburg
        '19533', // Leesport
        '19540', // Mohnton
        '19547', // Oley
        '19551', // Robesonia
        '19565', // Wernersville
        '19567', // Womelsdorf
        '19505', // Bechtelsville
        '19518', // Douglassville
        '19530', // Kutztown
        '19555', // Shoemakersville
        '19560', // Temple
        '19562', // Topton
        '19539', // Mertztown
        '19534', // Lenhartsville
        '19541', // Mohrsville
        '19507', // Bethel
        '19503', // Bally
        '19504', // Barto
        '19525', // Gilbertsville
        '19529', // Kempton
        '19543', // Morgantown
        '19520', // Elverson
        // Lancaster County (partial)
        '17522', // Ephrata
        '17557', // New Holland
        '17517', // Denver
        '17581', // Terre Hill
        '19501', // Adamstown
        '17555', // Narvon
        '17569', // Reinholds
        // Chester County (partial)
        '19344', // Honey Brook
        '19464', // Pottstown
        // Lebanon County (partial)
        '17073', // Newmanstown
      ]),
      serviceCities: JSON.stringify([
        'Reading', 'Bernville', 'Birdsboro', 'Blandon', 'Boyertown',
        'Fleetwood', 'Hamburg', 'Leesport', 'Mohnton', 'Oley',
        'Robesonia', 'Wernersville', 'Womelsdorf', 'Bechtelsville',
        'Douglassville', 'Kutztown', 'Shoemakersville', 'Temple',
        'Topton', 'Mertztown', 'Lenhartsville', 'Mohrsville',
        'Bethel', 'Bally', 'Barto', 'Gilbertsville', 'Kempton',
        'Morgantown', 'Elverson', 'Ephrata', 'New Holland', 'Denver',
        'Terre Hill', 'Adamstown', 'Narvon', 'Reinholds',
        'Honey Brook', 'Pottstown', 'Newmanstown',
      ]),
      serviceCounties: JSON.stringify(['Berks', 'Lancaster', 'Chester', 'Lebanon']),
      serviceAreaRadius: 25,
      lat: 40.3171,
      lng: -75.9384,
      hoursWeekday: '8:00 AM - 5:00 PM',
      hoursSaturday: '8:00 AM - 12:00 PM',
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil', 'diesel', 'kerosene']),
      minimumGallons: 100,
      seniorDiscount: false,
      allowPriceDisplay: true,
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
        postal_codes_served = EXCLUDED.postal_codes_served,
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

    console.log('[Migration 066] Added Werley Energy (Reading, PA)');
  },

  async down(sequelize) {
    await sequelize.query(`DELETE FROM suppliers WHERE slug = 'werley-energy'`);
    console.log('[Migration 066] Rolled back Werley Energy');
  }
};
