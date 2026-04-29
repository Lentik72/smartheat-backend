/**
 * Migration 153: Central PA suppliers — Lewistown 17044 (Mifflin Co) gap fill
 *
 * 17044 had zero supplier coverage; Mifflin County had no entries at all. Four
 * suppliers added in this batch:
 *
 * 1. Nittany Energy (Lewistown branch) — multi-branch chain (5 offices: State
 *    College HQ, Lewistown, Mifflintown, Belleville, Philipsburg, Williamsport,
 *    Lock Haven). Per-gallon prices uniform across all branches on /pricing/
 *    ($4.499 with Prompt Pay discount). Slug-based upsert ensures sister
 *    branches can be added later without clobbering this row (cn-brown pattern).
 *    Lewistown branch covers Mifflin/Juniata/Huntingdon/Perry/Snyder corridor.
 *    COD: "Heating Oil On Demand" + "Order Online Now" + "Prompt Pay discount".
 *    Phone: 717-248-0189. Address: 401 E Walnut Street, Lewistown PA.
 *
 * 2. Snedeker Energy — single Lewistown location, since 1958. Will-call
 *    confirmed verbatim on /heating-oil/heating-oil-delivery/ ("Will-Call:
 *    Customers manually request deliveries and must monitor tank levels
 *    themselves"). No public price page. allowPriceDisplay=false. Phone:
 *    717-248-2665. Address: 709 E Walnut Street, Lewistown PA.
 *
 * 3. J.J. Powell Inc (Lewistown branch) — multi-branch chain (HQ Philipsburg PA,
 *    Lewistown branch + 32-county PA service area). On-demand confirmed on
 *    /heating-oil/heating-oil-delivery/ ("We offer heating oil on a per gallon
 *    basis based on the current market. You can order online or give our office
 *    a call.") No public per-gallon price posted. allowPriceDisplay=false.
 *    Slug-based upsert. Phone: 717-248-3717. Address: 520 S Main St, Lewistown PA.
 *
 * 4. Oakland Fuel Oil — single Mifflintown location, since 1999. Juniata County
 *    only ("Proudly Serving Juniata County, PA"). COD: "ALL PRICES LISTED AND
 *    QUOTED ARE FOR DEBIT CARD, CASH OR CHECK" banner. WooCommerce tier table
 *    on /product/heating-oil/, $4.499 at 150+ gal tier. Scrapable via Pattern 5
 *    (table). Phone: 717-436-8098. Address: 450 Auker Rd, Mifflintown PA 17059.
 *
 * Sidebar finding (not actioned): Hilltop Oil Company (HeatFleet listing,
 * 4313 William Penn Hwy Mifflintown 17059, phone 717-436-2647) shares phone
 * AND near-identical address with Nittany Energy's Mifflintown branch
 * (4314 William Penn Hwy Ste. 1, also 717-436-2647). Strong signal that
 * Hilltop has been merged into / now operates as Nittany Mifflintown — not
 * adding Hilltop as a separate supplier. If the Mifflintown Nittany branch
 * is added in a future migration, that record subsumes Hilltop.
 *
 * Coverage managed by scrape-config.json (postal_codes_served NOT written
 * here per post-migration-100 rule).
 */

const { v4: uuidv4 } = require('uuid');
const { upsertSupplier } = require('./lib/upsert-supplier');

module.exports = {
  name: '153-add-central-pa-suppliers',

  async up(sequelize) {
    // 1) Nittany Energy (Lewistown branch) — slug-based upsert (multi-branch chain)
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
        $15, NULL, NULL,
        false, false,
        $16::jsonb, $17::jsonb, NULL, false,
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
        hours_weekday = EXCLUDED.hours_weekday,
        payment_methods = EXCLUDED.payment_methods,
        fuel_types = EXCLUDED.fuel_types,
        allow_price_display = EXCLUDED.allow_price_display,
        active = EXCLUDED.active,
        updated_at = NOW()
    `, {
      bind: [
        uuidv4(),
        'Nittany Energy (Lewistown)',
        'nittany-energy-lewistown',
        '(717) 248-0189',
        null,
        'https://nittanyenergy.com',
        '401 E Walnut Street',
        'Lewistown',
        'PA',
        JSON.stringify([
          'Lewistown', 'Mifflintown', 'Belleville', 'Mt. Union', 'Allensville',
          'McClure', 'Burnham', 'Port Royal', 'Newport',
        ]),
        JSON.stringify(['Mifflin', 'Juniata', 'Huntingdon', 'Perry', 'Snyder']),
        25,
        40.5984,
        -77.5722,
        '8:00 AM - 4:30 PM',
        JSON.stringify(['credit_card', 'cash', 'check']),
        JSON.stringify(['heating_oil']),
      ],
    });

    // 2) Snedeker Energy — single Lewistown location, will-call only (no scrapable price)
    await upsertSupplier(sequelize, {
      name: 'Snedeker Energy',
      slug: 'snedeker-energy',
      phone: '(717) 248-2665',
      email: null,
      website: 'https://www.snedenergy.com',
      addressLine1: '709 E Walnut Street',
      city: 'Lewistown',
      state: 'PA',
      serviceCities: JSON.stringify(['Lewistown']),
      serviceCounties: JSON.stringify(['Mifflin']),
      serviceAreaRadius: 20,
      lat: 40.5984,
      lng: -77.5722,
      hoursWeekday: null,
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
      fuelTypes: JSON.stringify(['heating_oil', 'propane']),
      minimumGallons: null,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    });

    // 3) J.J. Powell, Inc. (Lewistown branch) — slug-based upsert (multi-branch chain)
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
        $15, NULL, NULL,
        false, false,
        $16::jsonb, $17::jsonb, NULL, false,
        false, NULL, true, NOW(), NOW()
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
        hours_weekday = EXCLUDED.hours_weekday,
        payment_methods = EXCLUDED.payment_methods,
        fuel_types = EXCLUDED.fuel_types,
        allow_price_display = EXCLUDED.allow_price_display,
        active = EXCLUDED.active,
        updated_at = NOW()
    `, {
      bind: [
        uuidv4(),
        'J.J. Powell, Inc. (Lewistown)',
        'jj-powell-lewistown',
        '(717) 248-3717',
        null,
        'https://jjpowell.com',
        '520 S Main St',
        'Lewistown',
        'PA',
        JSON.stringify(['Lewistown']),
        JSON.stringify(['Mifflin']),
        25,
        40.5984,
        -77.5722,
        '8:00 AM - 4:00 PM',
        JSON.stringify(['credit_card', 'cash', 'check']),
        JSON.stringify(['heating_oil', 'propane', 'diesel']),
      ],
    });

    // 4) Oakland Fuel Oil — single Mifflintown location, COD on own site, scrapable
    await upsertSupplier(sequelize, {
      name: 'Oakland Fuel Oil',
      slug: 'oakland-fuel-oil',
      phone: '(717) 436-8098',
      email: 'info@myoaklandfuel.com',
      website: 'https://myoaklandfuel.com',
      addressLine1: '450 Auker Rd',
      city: 'Mifflintown',
      state: 'PA',
      serviceCities: JSON.stringify([
        'Mifflintown', 'Mifflin', 'East Waterford', 'Honey Grove',
        'McAlisterville', 'Oakland Mills', 'Port Royal', 'Richfield',
        'Thompsontown',
      ]),
      serviceCounties: JSON.stringify(['Juniata']),
      serviceAreaRadius: 20,
      lat: 40.5701,
      lng: -77.4017,
      hoursWeekday: '8:00 AM - 5:00 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['credit_card', 'debit_card', 'cash', 'check']),
      fuelTypes: JSON.stringify(['heating_oil', 'propane', 'diesel']),
      minimumGallons: 100,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });

    console.log('[Migration 153] ✅ Added Nittany Energy (Lewistown), Snedeker Energy, J.J. Powell (Lewistown), Oakland Fuel Oil');
  },

  async down(sequelize) {
    await sequelize.query(`
      DELETE FROM suppliers
      WHERE slug IN (
        'nittany-energy-lewistown',
        'snedeker-energy',
        'jj-powell-lewistown',
        'oakland-fuel-oil'
      )
    `);
    console.log('[Migration 153] Rolled back central PA suppliers');
  },
};
