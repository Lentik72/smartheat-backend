/**
 * Migration 138: Add L & Son Heat/AC Tech (Yonkers, NY)
 *
 * COD confirmed by user (direct customer). HeatFleet "On Demand" listing.
 * Serves Westchester County & the Bronx. Not scrapable (Jottful site, no prices in HTML).
 *
 * Coverage managed by scrape-config.json (postalCodesServed NOT written here).
 */

const { v4: uuidv4 } = require('uuid');

module.exports = {
  name: '138-add-l-and-son-heat-yonkers',

  async up(sequelize) {
    const supplier = {
      id: uuidv4(),
      name: 'L & Son Heat/AC Tech',
      slug: 'l-and-son-heat-ac-tech',
      phone: '(914) 233-1466',
      email: 'landsonheatac@gmail.com',
      website: 'https://landsonheatactech.com',
      addressLine1: '288 Jessamine Ave',
      city: 'Yonkers',
      state: 'NY',
      postalCodesServed: JSON.stringify([]),
      serviceCities: JSON.stringify([
        'Yonkers', 'Mount Vernon', 'New Rochelle', 'White Plains',
        'Scarsdale', 'Bronxville', 'Tuckahoe', 'Eastchester',
        'Hastings-on-Hudson', 'Dobbs Ferry', 'Irvington', 'Tarrytown',
        'Elmsford', 'Ardsley', 'Hartsdale', 'Mamaroneck', 'Larchmont',
        'Rye', 'Port Chester', 'Harrison', 'Armonk', 'Briarcliff Manor',
        'Chappaqua', 'Ossining', 'Pleasantville', 'Hawthorne',
        'Thornwood', 'Valhalla'
      ]),
      serviceCounties: JSON.stringify(['Westchester', 'Bronx']),
      serviceAreaRadius: 20,
      lat: 40.9280,
      lng: -73.9010,
      hoursWeekday: '8:00 AM - 5:00 PM',
      hoursSaturday: 'By Appointment',
      hoursSunday: 'By Appointment',
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil']),
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

    console.log('[Migration 138] ✅ Added L & Son Heat/AC Tech (Yonkers, NY)');
  },

  async down(sequelize) {
    await sequelize.query(`DELETE FROM suppliers WHERE slug = 'l-and-son-heat-ac-tech'`);
    console.log('[Migration 138] Rolled back L & Son Heat/AC Tech');
  }
};
