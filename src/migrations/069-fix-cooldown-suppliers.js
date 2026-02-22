/**
 * Migration 069: Fix 3 cooldown suppliers
 *
 * 1. Oil Patch Fuel (Philadelphia, PA) — was disabled, now has $4.09/gal static price.
 *    Creates new DB record.
 * 2. Swanzey Oil (West Swanzey, NH) — price is in iframe todayprice.htm ($3.69).
 *    Config updated with pricePath. Reset cooldown.
 * 3. Eco-Fuel Oil (Netcong, NJ) — price works fine ($3.75). Just reset cooldown.
 */

const { v4: uuidv4 } = require('uuid');

module.exports = {
  name: '069-fix-cooldown-suppliers',

  async up(sequelize) {
    // --- 1. Oil Patch Fuel — new DB record ---
    const oilPatch = {
      id: uuidv4(),
      name: 'Oil Patch Fuel',
      slug: 'oil-patch-fuel',
      phone: '(215) 492-1900',
      email: null,
      website: 'https://oilpatchfuel.com',
      addressLine1: null,
      city: 'Philadelphia',
      state: 'PA',
      postalCodesServed: JSON.stringify([
        '19113', '19142', '19143', '19145', '19148', '19150', '19151', '19153',
        '19013', '19014', '19015', '19018', '19022', '19023', '19026', '19029',
        '19032', '19036', '19050', '19063', '19064', '19070', '19074', '19076',
        '19078', '19079', '19082'
      ]),
      serviceCities: JSON.stringify([
        'Philadelphia', 'Chester', 'Aston', 'Brookhaven', 'Clifton Heights',
        'Crum Lynne', 'Darby', 'Drexel Hill', 'Essington', 'Folcroft',
        'Glenolden', 'Lansdowne', 'Media', 'Springfield', 'Morton',
        'Norwood', 'Prospect Park', 'Ridley Park', 'Sharon Hill', 'Upper Darby'
      ]),
      serviceCounties: JSON.stringify(['Philadelphia', 'Delaware']),
      serviceAreaRadius: 15,
      lat: 39.8950,
      lng: -75.2432,
      hoursWeekday: null,
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil', 'diesel']),
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
        scrape_status, consecutive_scrape_failures,
        created_at, updated_at
      ) VALUES (
        :id, :name, :slug, :phone, :email, :website, :addressLine1, :city, :state,
        :postalCodesServed, :serviceCities, :serviceCounties, :serviceAreaRadius,
        :lat, :lng, :hoursWeekday, :hoursSaturday, :hoursSunday,
        :emergencyDelivery, :weekendDelivery, :paymentMethods, :fuelTypes,
        :minimumGallons, :seniorDiscount, :allowPriceDisplay, :notes, :active,
        'active', 0,
        NOW(), NOW()
      )
      ON CONFLICT (slug) DO UPDATE SET
        phone = EXCLUDED.phone,
        website = EXCLUDED.website,
        postal_codes_served = EXCLUDED.postal_codes_served,
        service_cities = EXCLUDED.service_cities,
        service_counties = EXCLUDED.service_counties,
        allow_price_display = EXCLUDED.allow_price_display,
        active = EXCLUDED.active,
        scrape_status = 'active',
        consecutive_scrape_failures = 0,
        last_scrape_failure_at = NULL,
        scrape_failure_dates = NULL,
        updated_at = NOW()
    `, {
      replacements: oilPatch,
      type: sequelize.QueryTypes.INSERT
    });
    console.log('[Migration 069] Oil Patch Fuel (Philadelphia, PA) enabled');

    // --- 2. Swanzey Oil — reset cooldown ---
    await sequelize.query(`
      UPDATE suppliers SET
        scrape_status = 'active',
        consecutive_scrape_failures = 0,
        last_scrape_failure_at = NULL,
        scrape_failure_dates = NULL,
        scrape_cooldown_until = NULL,
        updated_at = NOW()
      WHERE website LIKE '%swanzeyoil.com%'
    `);
    console.log('[Migration 069] Swanzey Oil cooldown reset');

    // --- 3. Eco-Fuel Oil — reset cooldown ---
    await sequelize.query(`
      UPDATE suppliers SET
        scrape_status = 'active',
        consecutive_scrape_failures = 0,
        last_scrape_failure_at = NULL,
        scrape_failure_dates = NULL,
        scrape_cooldown_until = NULL,
        updated_at = NOW()
      WHERE slug = 'eco-fuel-oil' OR website LIKE '%eco-fuel.com%'
    `);
    console.log('[Migration 069] Eco-Fuel Oil cooldown reset');
  },

  async down(sequelize) {
    await sequelize.query(`
      UPDATE suppliers SET allow_price_display = false, updated_at = NOW()
      WHERE slug = 'oil-patch-fuel'
    `);
    console.log('[Migration 069] Oil Patch Fuel disabled');
  }
};
