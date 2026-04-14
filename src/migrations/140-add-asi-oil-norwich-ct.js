/**
 * Migration 140: Add ASI Oil (Norwich, CT)
 *
 * COD/on-demand confirmed: "On-demand delivery options" on /oil-delivery-service;
 * FAQ states automatic delivery is opt-in ("Any customer can set up automatic delivery").
 * Cash accepted. Same-day delivery. 24-hour emergency. Family-owned since 1989.
 * Serves ~29 towns across New London County, CT.
 *
 * Not scrapable — no public prices on website (Hibu/Duda template, call for pricing).
 *
 * Coverage managed by scrape-config.json (postalCodesServed NOT written here).
 */

const { v4: uuidv4 } = require('uuid');

module.exports = {
  name: '140-add-asi-oil-norwich-ct',

  async up(sequelize) {
    const supplier = {
      id: uuidv4(),
      name: 'ASI Oil',
      slug: 'asi-oil',
      phone: '(860) 255-2446',
      email: 'asioil6451@yahoo.com',
      website: 'https://www.asi-oil.com',
      addressLine1: '208 West Main St',
      city: 'Norwich',
      state: 'CT',
      postalCodesServed: JSON.stringify([]),
      serviceCities: JSON.stringify([
        'Baltic', 'Bozrah', 'Colchester', 'East Lyme', 'Franklin',
        'Gales Ferry', 'Griswold', 'Groton', 'Jewett City', 'Lebanon',
        'Ledyard', 'Lisbon', 'Montville', 'Mystic', 'New London',
        'Niantic', 'North Franklin', 'North Stonington', 'Norwich',
        'Oakdale', 'Pawcatuck', 'Preston', 'Quaker Hill', 'Salem',
        'Sprague', 'Stonington', 'Taftville', 'Uncasville', 'Versailles',
        'Yantic'
      ]),
      serviceCounties: JSON.stringify(['New London']),
      serviceAreaRadius: 25,
      lat: 41.5239,
      lng: -72.0759,
      hoursWeekday: '8:00 AM - 5:00 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'credit_card', 'debit_card']),
      fuelTypes: JSON.stringify(['heating_oil']),
      minimumGallons: 100,
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

    console.log('[Migration 140] ✅ Added ASI Oil (Norwich, CT)');
  },

  async down(sequelize) {
    await sequelize.query(`DELETE FROM suppliers WHERE slug = 'asi-oil'`);
    console.log('[Migration 140] Rolled back ASI Oil');
  }
};
