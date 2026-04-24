/**
 * Migration 152: Add CN Brown Energy (Lancaster) — NEK VT + Coos NH
 *
 * Third CN Brown branch on cnbrownenergy.com (sister to cn-brown-augusta at
 * 362 Riverside Dr, Augusta ME and cn-brown-energy at Berlin NH on cnbrown.com).
 * Lancaster office at 202 Main Street, Suite C, Lancaster NH — serves 10 NH
 * ZIPs (Coos County + northern Grafton) and 4 VT ZIPs (Caledonia/Essex counties
 * in the Northeast Kingdom).
 *
 * COD/will-call confirmed on cnbrownenergy.com/residential (same site as
 * Augusta — "Will-Call Delivery" + "WILL CALL customers"). Prices scrapable
 * via the existing lookup pattern: `?location-zip-code=03584` returns
 * "Lancaster Energy Office" with $5.419 in static HTML.
 *
 * First multi-branch supplier shipped via the heatingoil-jx8r architecture:
 * scrape-config.json `branches` map keyed by supplier slug, priceScraper
 * `getConfigForSupplier` merges branch fields over shared top-level.
 *
 * **IMPORTANT — slug-based upsert, NOT website-based.**
 * Does NOT use shared lib/upsert-supplier.js because that utility matches by
 * website LIKE, which for multi-branch chains would UPDATE the sister Augusta
 * row (same website `cnbrownenergy.com`) and overwrite its identity. Instead
 * this migration does a direct INSERT ... ON CONFLICT (slug) DO UPDATE so the
 * Augusta row is never touched. See commit history 2026-04-24 for the bug
 * this guards against. Long-term fix: lib/upsert-supplier.js should gain an
 * optional matchBy='slug' argument — tracked separately.
 *
 * Phone verified on https://cnbrownenergy.com/locations/?location-zip-code=03584:
 *   "Lancaster Energy Office / 202 Main Street, Suite C, Lancaster, NH 03584
 *    / Telephone: 603-788-2012 / Email: ho3061Group@cnbrown.com"
 *
 * Spec: docs/superpowers/specs/2026-04-24-multi-branch-scrape-config-design.md
 * Bead: heatingoil-jx8r
 *
 * Coverage managed by scrape-config.json (postal_codes_served NOT written
 * here per post-migration-100 rule).
 */

const { v4: uuidv4 } = require('uuid');

module.exports = {
  name: '152-add-cn-brown-lancaster',

  async up(sequelize) {
    await sequelize.query(`
      INSERT INTO suppliers (
        id, name, slug, phone, email, website, address_line1, city, state,
        service_cities, service_counties, service_area_radius, lat, lng,
        hours_weekday, hours_saturday, hours_sunday,
        emergency_delivery, weekend_delivery,
        payment_methods, fuel_types, minimum_gallons, senior_discount,
        allow_price_display, notes, active, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        $10::jsonb, $11::jsonb, $12, $13, $14,
        NULL, NULL, NULL,
        false, false,
        $15::jsonb, $16::jsonb, NULL, false,
        true, NULL, true, NOW(), NOW()
      )
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        phone = EXCLUDED.phone,
        email = EXCLUDED.email,
        website = EXCLUDED.website,
        address_line1 = EXCLUDED.address_line1,
        city = EXCLUDED.city,
        state = EXCLUDED.state,
        service_cities = EXCLUDED.service_cities,
        service_counties = EXCLUDED.service_counties,
        service_area_radius = EXCLUDED.service_area_radius,
        lat = EXCLUDED.lat,
        lng = EXCLUDED.lng,
        payment_methods = EXCLUDED.payment_methods,
        fuel_types = EXCLUDED.fuel_types,
        allow_price_display = EXCLUDED.allow_price_display,
        active = EXCLUDED.active,
        updated_at = NOW()
    `, {
      bind: [
        uuidv4(),
        'CN Brown Energy (Lancaster)',
        'cn-brown-lancaster',
        '(603) 788-2012',
        'ho3061Group@cnbrown.com',
        'https://cnbrownenergy.com',
        '202 Main Street, Suite C',
        'Lancaster',
        'NH',
        JSON.stringify([
          'Lancaster', 'Whitefield', 'Jefferson', 'Dalton', 'Groveton',
          'Littleton', 'Bethlehem', 'Twin Mountain', 'Gorham', 'Berlin',
          'St. Johnsbury', 'Lyndonville', 'West Burke', 'Barton',
        ]),
        JSON.stringify(['Coos', 'Grafton', 'Caledonia', 'Essex']),
        40,
        44.4878,
        -71.5707,
        JSON.stringify(['credit_card', 'cash', 'check']),
        JSON.stringify(['heating_oil', 'kerosene', 'propane']),
      ],
    });

    console.log('[Migration 152] ✅ Added CN Brown Energy (Lancaster) — Coos NH + Caledonia/Essex VT (slug-based upsert)');
  },

  async down(sequelize) {
    await sequelize.query(`DELETE FROM suppliers WHERE slug = 'cn-brown-lancaster'`);
    console.log('[Migration 152] Rolled back CN Brown Energy (Lancaster)');
  },
};
