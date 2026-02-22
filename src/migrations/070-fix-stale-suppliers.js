/**
 * Migration 070: Fix stale suppliers
 *
 * 1. Central Bucks Oil (Quakertown, PA) — has DB record from migration 047
 *    with allowPriceDisplay=false. Price $3.749 is now scrapable. Enable it.
 *
 * 2. Family Fuel & Heating Service (Long Island, NY) — no DB record.
 *    Wix SSR now has static tiered prices ($3.899–$3.999). Create record.
 *
 * 3. Disable 4 broken enabled suppliers (price fields empty or in images):
 *    - AAA Fuel & Service (Kingston, NY) — empty price field
 *    - Falcon Oil (NJ) — var price = '' (empty)
 *    - Gaski Energy (PA) — JS-populated price field
 *    - Neighbors Oil (Plaistow, NH) — price in JPG image
 */

const { v4: uuidv4 } = require('uuid');

module.exports = {
  name: '070-fix-stale-suppliers',

  async up(sequelize) {
    // --- 1. Central Bucks Oil — enable price display (existing record from 047) ---
    const [, cbMeta] = await sequelize.query(`
      UPDATE suppliers SET
        allow_price_display = true,
        scrape_status = 'active',
        consecutive_scrape_failures = 0,
        last_scrape_failure_at = NULL,
        scrape_failure_dates = NULL,
        scrape_cooldown_until = NULL,
        updated_at = NOW()
      WHERE slug = 'central-bucks-oil'
    `);
    console.log(`[Migration 070] Central Bucks Oil enabled (${cbMeta?.rowCount || 0} rows)`);

    // --- 2. Family Fuel & Heating Service — new DB record ---
    const familyFuel = {
      id: uuidv4(),
      name: 'Family Fuel & Heating Service',
      slug: 'family-fuel-heating-service',
      phone: '(516) 678-1227',
      email: null,
      website: 'https://www.familyfueloil.com',
      addressLine1: null,
      city: 'Bellmore',
      state: 'NY',
      postalCodesServed: JSON.stringify([
        '11001', '11003', '11010', '11020', '11021', '11023', '11024', '11030',
        '11040', '11050', '11096', '11501', '11507', '11509', '11510', '11514',
        '11516', '11518', '11520', '11530', '11542', '11545', '11547', '11548',
        '11550', '11552', '11553', '11554', '11557', '11558', '11559', '11560',
        '11561', '11563', '11565', '11566', '11568', '11569', '11570', '11575',
        '11576', '11577', '11580', '11581', '11590', '11596', '11598',
        '11701', '11702', '11703', '11704', '11706', '11710', '11714',
        '11735', '11756', '11758', '11762', '11771', '11783', '11793',
        '11413', '11416', '11418', '11419', '11420', '11421', '11422', '11423',
        '11427', '11428', '11429', '11432', '11433', '11434', '11435', '11436'
      ]),
      serviceCities: JSON.stringify([
        'Bellmore', 'Merrick', 'Freeport', 'Wantagh', 'Levittown', 'Seaford',
        'Massapequa', 'Baldwin', 'Rockville Centre', 'Hempstead', 'Valley Stream',
        'Franklin Square', 'Lynbrook', 'Malverne', 'Garden City', 'Westbury',
        'Mineola', 'Floral Park', 'Elmont', 'Uniondale', 'East Meadow',
        'West Hempstead', 'Oceanside', 'Long Beach', 'Island Park',
        'Amityville', 'Lindenhurst', 'Babylon', 'West Babylon',
        'South Jamaica', 'Jamaica', 'Springfield Gardens', 'Rosedale',
        'St. Albans', 'Hollis', 'Queens Village'
      ]),
      serviceCounties: JSON.stringify(['Nassau', 'Queens', 'Suffolk']),
      serviceAreaRadius: 25,
      lat: 40.6687,
      lng: -73.5268,
      hoursWeekday: null,
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'credit_card']),
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
      replacements: familyFuel,
      type: sequelize.QueryTypes.INSERT
    });
    console.log('[Migration 070] Family Fuel & Heating Service (Bellmore, NY) enabled');

    // --- 3. Disable 4 broken suppliers ---
    const brokenSlugs = [
      'aaa-fuel-and-service',   // empty price field
      'falcon-oil',             // var price = '' (empty)
      'gaski-energy',           // JS-populated price field
      'neighbors-oil',          // price in JPG image
    ];

    // Try by slug first, then by website for any that don't match
    for (const slug of brokenSlugs) {
      await sequelize.query(`
        UPDATE suppliers SET
          allow_price_display = false,
          updated_at = NOW()
        WHERE slug = :slug
      `, { replacements: { slug } });
    }

    // Also match by website in case slugs differ
    const brokenWebsites = [
      'aaafuelandservice.com',
      'falconoil.net',
      'gaskienergy.com',
      'neighborsoil.com',
    ];

    for (const domain of brokenWebsites) {
      await sequelize.query(`
        UPDATE suppliers SET
          allow_price_display = false,
          updated_at = NOW()
        WHERE website LIKE :domain AND allow_price_display = true
      `, { replacements: { domain: `%${domain}%` } });
    }

    console.log('[Migration 070] Disabled 4 broken suppliers (AAA Fuel, Falcon Oil, Gaski Energy, Neighbors Oil)');
  },

  async down(sequelize) {
    // Revert Central Bucks Oil
    await sequelize.query(`
      UPDATE suppliers SET allow_price_display = false, updated_at = NOW()
      WHERE slug = 'central-bucks-oil'
    `);

    // Revert Family Fuel
    await sequelize.query(`
      UPDATE suppliers SET allow_price_display = false, updated_at = NOW()
      WHERE slug = 'family-fuel-heating-service'
    `);

    // Re-enable the 4 broken ones
    const domains = ['aaafuelandservice.com', 'falconoil.net', 'gaskienergy.com', 'neighborsoil.com'];
    for (const domain of domains) {
      await sequelize.query(`
        UPDATE suppliers SET allow_price_display = true, updated_at = NOW()
        WHERE website LIKE :domain
      `, { replacements: { domain: `%${domain}%` } });
    }

    console.log('[Migration 070] Reverted stale supplier fixes');
  }
};
