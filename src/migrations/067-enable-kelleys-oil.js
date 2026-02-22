/**
 * Migration 067: Enable Kelley's Oil (South Weymouth, MA)
 *
 * Previously disabled in scrape-config because price was "loaded via JavaScript."
 * Verified 2026-02-22: price $3.88/gal (150+) is now in static HTML.
 * COD confirmed: "Automatic or Will Call Delivery Service", COD payments accepted.
 * 24-hour burner service, same-day delivery available.
 * Serves 15 South Shore towns per their website.
 */

const { v4: uuidv4 } = require('uuid');

module.exports = {
  name: '067-enable-kelleys-oil',

  async up(sequelize) {
    const supplier = {
      id: uuidv4(),
      name: "Kelley's Oil",
      slug: 'kelleys-oil',
      phone: '(781) 331-1055',
      email: null,
      website: 'https://www.kelleysoil.com',
      addressLine1: null,
      city: 'South Weymouth',
      state: 'MA',
      postalCodesServed: JSON.stringify([
        '02351', // Abington
        '02184', // Braintree
        '02025', // Cohasset
        '02339', // Hanover
        '02341', // Hanson
        '02043', // Hingham
        '02343', // Holbrook
        '02186', // Milton
        '02061', // Norwell
        '02359', // Pembroke
        '02169', // Quincy
        '02170', // Quincy
        '02171', // Quincy
        '02368', // Randolph
        '02370', // Rockland
        '02190', // South Weymouth
        '02188', // Weymouth
        '02189', // Weymouth (East)
        '02191', // Weymouth (North)
        '02382', // Whitman
      ]),
      serviceCities: JSON.stringify([
        'Abington', 'Braintree', 'Cohasset', 'Hanover', 'Hanson',
        'Hingham', 'Holbrook', 'Milton', 'Norwell', 'Pembroke',
        'Quincy', 'Randolph', 'Rockland', 'South Weymouth',
        'Weymouth', 'Whitman',
      ]),
      serviceCounties: JSON.stringify(['Norfolk', 'Plymouth']),
      serviceAreaRadius: 15,
      lat: 42.1713,
      lng: -70.9529,
      hoursWeekday: null,
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'check', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil']),
      minimumGallons: 150,
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
        phone = EXCLUDED.phone,
        website = EXCLUDED.website,
        postal_codes_served = EXCLUDED.postal_codes_served,
        service_cities = EXCLUDED.service_cities,
        service_counties = EXCLUDED.service_counties,
        service_area_radius = EXCLUDED.service_area_radius,
        emergency_delivery = EXCLUDED.emergency_delivery,
        weekend_delivery = EXCLUDED.weekend_delivery,
        payment_methods = EXCLUDED.payment_methods,
        minimum_gallons = EXCLUDED.minimum_gallons,
        allow_price_display = EXCLUDED.allow_price_display,
        active = EXCLUDED.active,
        updated_at = NOW()
    `, {
      replacements: supplier,
      type: sequelize.QueryTypes.INSERT
    });

    console.log("[Migration 067] Kelley's Oil (South Weymouth, MA) enabled for price scraping");
  },

  async down(sequelize) {
    await sequelize.query(`
      UPDATE suppliers SET allow_price_display = false, updated_at = NOW()
      WHERE slug = 'kelleys-oil'
    `);
    console.log("[Migration 067] Kelley's Oil price display disabled");
  }
};
