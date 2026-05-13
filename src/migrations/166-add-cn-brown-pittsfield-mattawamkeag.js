/**
 * Migration 166: Add CN Brown Energy (Pittsfield) + (Mattawamkeag).
 *
 * Net-new ME branches on cnbrownenergy.com discovered during the
 * cn-brown-brewer rehab (mig 165 / heatingoil-2d66). Both branches were
 * already active CN Brown offices serving Penobscot County ZIPs; we just
 * never had them in our DB because mig 045 originally lumped all 31 ZIPs
 * under one slug. Probed 2026-05-13 — both office details + ZIP routing
 * pulled directly from cnbrownenergy.com's lookup endpoint:
 *   /locations/?location-zip-code=<zip>
 *
 * Pittsfield Energy Office — 400 Main St, Pittsfield ME 04967
 *   Phone: (207) 487-3405
 *   Email: ho3055Group@cnbrown.com
 *   Fuels: Oil, K1, Diesel, Propane
 *   Cash price at add time: $5.099 (heating oil)
 *   12 ZIPs routed via lookup → Pittsfield first (lookupZip 04449):
 *     04401 Bangor, 04419 Carmel, 04427 East Corinth, 04434 Etna,
 *     04444 Hampden, 04449 Hudson, 04450 Kenduskeag, 04456 Levant,
 *     04488 Stetson, 04930 Dexter, 04967 Pittsfield, 04969 Plymouth
 *
 * Mattawamkeag Energy Office — 105 Main St, Mattawamkeag ME 04459
 *   Phone: (207) 736-2193
 *   Email: ho3047Group@cnbrown.com
 *   Fuels: Oil, K1, Offroad, Propane
 *   Cash price at add time: $5.099 (heating oil)
 *   5 ZIPs routed via lookup → Mattawamkeag first (lookupZip 04459):
 *     04430 East Millinocket, 04457 Lincoln, 04459 Mattawamkeag,
 *     04460 Medway, 04462 Millinocket
 *
 * Why direct INSERT (not upsertSupplier): same reason as mig 152 (Lancaster)
 * — upsertSupplier matches by website domain LIKE, and Augusta/Brewer/
 * Lancaster all share website `cnbrownenergy.com`, so the helper would
 * UPDATE one of their rows instead of inserting a new branch. Use
 * slug-based ON CONFLICT to be safe.
 *
 * Coverage managed by scrape-config.json (postal_codes_served NOT written
 * here per post-mig-100 rule). New branches use default union-merge in
 * ScrapeConfigSync — DB starts empty, config has 12/5 ZIPs, sync writes
 * those. No `postalCodesOverride` needed.
 */

const { v4: uuidv4 } = require('uuid');

const PITTSFIELD = {
  id: () => uuidv4(),
  name: 'CN Brown Energy (Pittsfield)',
  slug: 'cn-brown-pittsfield',
  phone: '(207) 487-3405',
  email: 'ho3055Group@cnbrown.com',
  website: 'https://cnbrownenergy.com',
  addressLine1: '400 Main St',
  city: 'Pittsfield',
  state: 'ME',
  serviceCities: [
    'Bangor', 'Carmel', 'East Corinth', 'Etna', 'Hampden',
    'Hudson', 'Kenduskeag', 'Levant', 'Stetson', 'Dexter',
    'Pittsfield', 'Plymouth',
  ],
  serviceCounties: ['Penobscot', 'Somerset'],
  serviceAreaRadius: 35,
  lat: 44.7609,
  lng: -69.3877,
  fuelTypes: ['heating_oil', 'kerosene', 'propane'],
};

const MATTAWAMKEAG = {
  id: () => uuidv4(),
  name: 'CN Brown Energy (Mattawamkeag)',
  slug: 'cn-brown-mattawamkeag',
  phone: '(207) 736-2193',
  email: 'ho3047Group@cnbrown.com',
  website: 'https://cnbrownenergy.com',
  addressLine1: '105 Main St',
  city: 'Mattawamkeag',
  state: 'ME',
  serviceCities: [
    'East Millinocket', 'Lincoln', 'Mattawamkeag',
    'Medway', 'Millinocket',
  ],
  serviceCounties: ['Penobscot'],
  serviceAreaRadius: 30,
  lat: 45.5199,
  lng: -68.3711,
  fuelTypes: ['heating_oil', 'kerosene', 'propane'],
};

async function insertBranch(sequelize, branch) {
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
      branch.id(),
      branch.name,
      branch.slug,
      branch.phone,
      branch.email,
      branch.website,
      branch.addressLine1,
      branch.city,
      branch.state,
      JSON.stringify(branch.serviceCities),
      JSON.stringify(branch.serviceCounties),
      branch.serviceAreaRadius,
      branch.lat,
      branch.lng,
      JSON.stringify(['credit_card', 'cash', 'check']),
      JSON.stringify(branch.fuelTypes),
    ],
  });
}

module.exports = {
  name: '166-add-cn-brown-pittsfield-mattawamkeag',

  async up(sequelize) {
    await insertBranch(sequelize, PITTSFIELD);
    console.log('[Migration 166] ✅ Added CN Brown Energy (Pittsfield) — 12 Penobscot+Somerset ZIPs');

    await insertBranch(sequelize, MATTAWAMKEAG);
    console.log('[Migration 166] ✅ Added CN Brown Energy (Mattawamkeag) — 5 remote Penobscot ZIPs');
  },

  async down(sequelize) {
    await sequelize.query(`
      DELETE FROM suppliers
      WHERE slug IN ('cn-brown-pittsfield', 'cn-brown-mattawamkeag')
    `);
    console.log('[Migration 166] Rolled back Pittsfield + Mattawamkeag branches');
  },
};
