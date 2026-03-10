/**
 * Migration 096: Add Walker Valley (12588) Area Suppliers
 *
 * Coverage gap: ZIP 12588 had 0 suppliers.
 *
 * 1. Update Valley Oil coverage — add 12588 (they serve "Dutchess and Ulster counties")
 * 2. Update Bee's Oil coverage — add 12588 (Walker Valley explicitly in their service area)
 * 3. Add Empire Fuel (Poughkeepsie, NY) — COD confirmed, not scrapable
 * 4. Add Ever Ready Oil Inc (Highland, NY) — COD confirmed, not scrapable
 * 5. Add Big O Fuels (Middletown, NY) — COD: "Same price cash, check or credit card", not scrapable (ZIP-form)
 * 6. Add A Better Choice Fuel (Kingston, NY) — COD on third-party only (user approved), scrapable
 * 7. Stage 3 contract-only suppliers in _future_contract_oil (Main-Care Express, SOS Xtreme, Bottini)
 *
 * Empire Fuel: add — COD: "We are a COD company" — scrapable: no
 * Ever Ready Oil: add — COD: "COD and automatic deliveries" — scrapable: no
 * Big O Fuels: add — COD: "Same price cash, check or credit card" — scrapable: no (ZIP-form)
 * A Better Choice Fuel: add — COD: third-party only (user approved) — scrapable: yes
 */

const { v4: uuidv4 } = require('uuid');
const { upsertSupplier } = require('./lib/upsert-supplier');

module.exports = {
  name: '096-add-walker-valley-suppliers',

  async up(sequelize) {
    // ============================================
    // 1. UPDATE VALLEY OIL — add 12588 to coverage
    // Serves "Dutchess and Ulster counties" — Walker Valley is in Ulster County
    // ============================================
    await sequelize.query(`
      UPDATE suppliers
      SET postal_codes_served = (
        CASE
          WHEN postal_codes_served IS NULL THEN '["12588"]'::jsonb
          WHEN NOT postal_codes_served::jsonb ? '12588' THEN postal_codes_served::jsonb || '"12588"'::jsonb
          ELSE postal_codes_served::jsonb
        END
      )::text,
      service_cities = (
        CASE
          WHEN service_cities IS NULL THEN '["Walker Valley"]'::jsonb
          WHEN NOT service_cities::text ILIKE '%Walker Valley%' THEN service_cities::jsonb || '"Walker Valley"'::jsonb
          ELSE service_cities::jsonb
        END
      )::text,
      updated_at = NOW()
      WHERE LOWER(REPLACE(REPLACE(website, 'https://', ''), 'http://', '')) LIKE '%valleyoilpok.com%'
    `);
    console.log('[Migration 096] Updated Valley Oil coverage — added 12588 (Walker Valley)');

    // ============================================
    // 2. UPDATE BEE'S OIL — add 12588 to coverage
    // Walker Valley explicitly listed on their service area page
    // ============================================
    await sequelize.query(`
      UPDATE suppliers
      SET postal_codes_served = (
        CASE
          WHEN postal_codes_served IS NULL THEN '["12588"]'::jsonb
          WHEN NOT postal_codes_served::jsonb ? '12588' THEN postal_codes_served::jsonb || '"12588"'::jsonb
          ELSE postal_codes_served::jsonb
        END
      )::text,
      service_cities = (
        CASE
          WHEN service_cities IS NULL THEN '["Walker Valley"]'::jsonb
          WHEN NOT service_cities::text ILIKE '%Walker Valley%' THEN service_cities::jsonb || '"Walker Valley"'::jsonb
          ELSE service_cities::jsonb
        END
      )::text,
      updated_at = NOW()
      WHERE LOWER(REPLACE(REPLACE(website, 'https://', ''), 'http://', '')) LIKE '%beesfueloil.com%'
    `);
    console.log('[Migration 096] Updated Bee\'s Oil coverage — added 12588 (Walker Valley)');

    // ============================================
    // 3. ADD EMPIRE FUEL — Poughkeepsie, NY
    // COD: "We are a COD company and accept payment via cash, check,
    // and all four major credit/debit cards (at no additional cost)."
    // Source: empirefuelny.com/delivery
    // Not scrapable — no prices on website. SMS outreach candidate.
    // ============================================
    const empireFuelData = {
      id: uuidv4(),
      name: 'Empire Fuel',
      slug: 'empire-fuel',
      phone: '(845) 297-8007',
      email: null,
      website: 'https://empirefuelny.com',
      addressLine1: '220 Overocker Road',
      city: 'Poughkeepsie',
      state: 'NY',
      postalCodesServed: JSON.stringify([
        // Dutchess County
        '12508', // Beacon
        '12524', // Fishkill
        '12531', // Holmes
        '12533', // Hopewell Junction
        '12538', // Hyde Park
        '12540', // Lagrangeville
        '12542', // Marlboro
        '12545', // Millbrook
        '12564', // Pawling
        '12569', // Pleasant Valley
        '12570', // Poughquag
        '12578', // Salt Point
        '12580', // Staatsburg
        '12582', // Stormville
        '12585', // Verbank
        '12590', // Wappingers Falls
        '12601', // Poughkeepsie
        '12603', // Poughkeepsie
        // Ulster County
        '12411', // Bloomington
        '12419', // Cottekill
        '12429', // Esopus
        '12440', // High Falls
        '12471', // Rifton
        '12472', // Rosendale
        '12486', // Tillson
        '12487', // Ulster Park
        '12493', // West Park
        '12515', // Clintondale
        '12525', // Gardiner
        '12528', // Highland
        '12548', // Modena
        '12561', // New Paltz
        '12566', // Pine Bush
        '12568', // Plattekill
        '12588', // Walker Valley
        '12589', // Wallkill
        // Orange County
        '10911', // Bear Mountain
        '10914', // Blooming Grove
        '10915', // Bullville
        '10916', // Campbell Hall
        '10917', // Central Valley
        '10922', // Fort Montgomery
        '10926', // Harriman
        '10928', // Highland Falls
        '10930', // Highland Mills
        '10940', // Middletown
        '10953', // Mountainville
        '10985', // Thompson Ridge
        '10992', // Washingtonville
        '12518', // Cornwall
        '12520', // Cornwall On Hudson
        '12543', // Maybrook
        '12549', // Montgomery
        '12550', // Newburgh
        '12553', // New Windsor
        '12575', // Rock Tavern
        '12577', // Salisbury Mills
        '12584', // Vails Gate
        '12586', // Walden
        // Putnam County
        '10512', // Carmel
        '10516', // Cold Spring
        '10524', // Garrison
        '10537', // Lake Peekskill
        '10541', // Mahopac
        '10579', // Putnam Valley
      ]),
      serviceCities: JSON.stringify([
        'Poughkeepsie', 'Beacon', 'Fishkill', 'Wappingers Falls', 'Hyde Park',
        'Highland', 'Marlboro', 'New Paltz', 'Wallkill', 'Newburgh',
        'New Windsor', 'Cornwall', 'Walden', 'Middletown', 'Montgomery',
        'Gardiner', 'Plattekill', 'Rosendale', 'High Falls', 'Pine Bush',
        'Walker Valley', 'Hopewell Junction', 'Lagrangeville', 'Pleasant Valley',
        'Millbrook', 'Pawling', 'Cold Spring', 'Carmel', 'Mahopac',
        'Garrison', 'Putnam Valley', 'Esopus', 'Clintondale', 'Modena',
        'Salisbury Mills', 'Maybrook', 'Campbell Hall', 'Washingtonville',
        'Central Valley', 'Highland Falls', 'West Park', 'Staatsburg',
        'Stormville', 'Salt Point'
      ]),
      serviceCounties: JSON.stringify(['Dutchess', 'Ulster', 'Orange', 'Putnam']),
      serviceAreaRadius: 35,
      lat: 41.6764,
      lng: -73.8918,
      hoursWeekday: '8:00 AM - 5:00 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'check', 'credit_card', 'debit_card']),
      fuelTypes: JSON.stringify(['heating_oil']),
      minimumGallons: 100,
      seniorDiscount: true,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    };

    await upsertSupplier(sequelize, empireFuelData);
    console.log('[Migration 096] Upserted Empire Fuel (Poughkeepsie, NY)');

    // ============================================
    // 4. ADD EVER READY OIL INC — Highland, NY
    // COD: "COD and automatic deliveries" + "Cash or Credit Card Online Ordering"
    // Source: everreadyoilny.com homepage
    // Not scrapable — prices behind Droplet Fuel portal
    // ============================================
    const everReadyData = {
      id: uuidv4(),
      name: 'Ever Ready Oil Inc',
      slug: 'ever-ready-oil',
      phone: '(845) 691-3538',
      email: null,
      website: 'https://everreadyoilny.com',
      addressLine1: '98 Baileys Gap Rd',
      city: 'Highland',
      state: 'NY',
      postalCodesServed: JSON.stringify([
        // Ulster County (from company website town list)
        '12411', // Bloomington
        '12429', // Esopus
        '12440', // High Falls
        '12466', // Port Ewen
        '12471', // Rifton
        '12472', // Rosendale
        '12486', // Tillson
        '12487', // Ulster Park
        '12493', // West Park
        '12515', // Clintondale
        '12525', // Gardiner
        '12528', // Highland
        '12542', // Marlboro
        '12561', // New Paltz
        '12568', // Plattekill
        '12588', // Walker Valley (within stated Ulster County coverage)
        '12589', // Wallkill
        // Dutchess County
        '12538', // Hyde Park
        '12540', // Lagrangeville
        '12569', // Pleasant Valley
        '12580', // Staatsburg
        '12590', // Wappingers Falls
        '12601', // Poughkeepsie
        '12603', // Poughkeepsie
        // Orange County
        '12550', // Newburgh
        '12586', // Walden
      ]),
      serviceCities: JSON.stringify([
        'Highland', 'Milton', 'Marlboro', 'New Paltz', 'West Park',
        'Esopus', 'Rifton', 'Port Ewen', 'Clintondale', 'Rosendale',
        'Gardiner', 'Wallkill', 'Plattekill', 'Tillson', 'High Falls',
        'Bloomington', 'Ulster Park', 'Walker Valley',
        'Poughkeepsie', 'Hyde Park', 'Staatsburg', 'Pleasant Valley',
        'Lagrangeville', 'Wappingers Falls',
        'Newburgh', 'Walden'
      ]),
      serviceCounties: JSON.stringify(['Ulster', 'Dutchess', 'Orange']),
      serviceAreaRadius: 20,
      lat: 41.7212,
      lng: -73.9624,
      hoursWeekday: '8:00 AM - 4:00 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'diesel', 'propane']),
      minimumGallons: null,
      seniorDiscount: true,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    };

    await upsertSupplier(sequelize, everReadyData);
    console.log('[Migration 096] Upserted Ever Ready Oil Inc (Highland, NY)');

    // ============================================
    // 5. ADD BIG O FUELS — Middletown, NY
    // COD: "Same price cash, check or credit card" + "No hidden cost/fuel surcharge"
    // Source: bigofuels.com/pricing (user approved, medium confidence)
    // Not scrapable — prices behind Droplet Fuel ZIP-form portal
    // ============================================
    const bigOData = {
      id: uuidv4(),
      name: 'Big O Fuels',
      slug: 'big-o-fuels',
      phone: '(845) 733-1930',
      email: 'info.bigofuels@gmail.com',
      website: 'https://www.bigofuels.com',
      addressLine1: '105 Gillen Road',
      city: 'Middletown',
      state: 'NY',
      postalCodesServed: JSON.stringify([
        // From coverage area page (42 towns with ZIPs)
        '10914', // Blooming Grove
        '10915', // Bullville
        '10916', // Campbell Hall
        '10917', // Central Valley
        '10918', // Chester
        '10919', // Circleville
        '10921', // Florida
        '10924', // Goshen
        '10926', // Harriman
        '10930', // Highland Mills
        '10932', // Howells
        '10940', // Middletown
        '10941', // Middletown
        '10950', // Monroe
        '10953', // Mountainville
        '10958', // New Hampton
        '10963', // Otisville
        '10969', // Pine Island
        '10973', // Slate Hill
        '10981', // Sugarloaf
        '10985', // Thompson Ridge
        '10990', // Warwick
        '10992', // Washingtonville
        '10993', // Johnson
        '10998', // Westtown
        '12518', // Cornwall
        '12520', // Cornwall-on-Hudson
        '12543', // Maybrook
        '12549', // Montgomery
        '12550', // Newburgh
        '12553', // New Windsor
        '12566', // Pine Bush
        '12575', // Rock Tavern
        '12577', // Salisbury Mills
        '12586', // Walden
        '12588', // Walker Valley (within stated Ulster County coverage)
        '12589', // Wallkill
        '12721', // Bloomingburg
        '12729', // Cuddebackville
        '12746', // Huguenot
        '12771', // Port Jervis
        '12775', // Rock Hill
        '12785', // Westbrookville
        '12790', // Wurtsboro
      ]),
      serviceCities: JSON.stringify([
        'Middletown', 'Newburgh', 'New Windsor', 'Walden', 'Wallkill',
        'Pine Bush', 'Walker Valley', 'Montgomery', 'Goshen', 'Chester',
        'Warwick', 'Monroe', 'Cornwall', 'Cornwall-on-Hudson', 'Maybrook',
        'Washingtonville', 'Highland Mills', 'Central Valley', 'Harriman',
        'Port Jervis', 'Wurtsboro', 'Blooming Grove', 'Florida',
        'Otisville', 'Rock Tavern', 'Salisbury Mills', 'Campbell Hall',
        'Thompson Ridge', 'Bullville', 'Slate Hill', 'Pine Island',
        'Sugarloaf', 'Mountainville', 'New Hampton', 'Cuddebackville',
        'Bloomingburg', 'Huguenot', 'Rock Hill', 'Westbrookville', 'Westtown'
      ]),
      serviceCounties: JSON.stringify(['Orange', 'Sullivan', 'Ulster']),
      serviceAreaRadius: 30,
      lat: 41.4459,
      lng: -74.4225,
      hoursWeekday: '8:00 AM - 4:00 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'check', 'credit_card', 'debit_card']),
      fuelTypes: JSON.stringify(['heating_oil', 'propane', 'kerosene', 'diesel']),
      minimumGallons: 100,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    };

    await upsertSupplier(sequelize, bigOData);
    console.log('[Migration 096] Upserted Big O Fuels (Middletown, NY)');

    // ============================================
    // 6. ADD A BETTER CHOICE FUEL — Kingston, NY
    // COD: "Automatic & Cod Deliveries" on third-party directory only (user approved)
    // Source: a-better-choice-fuel.hub.biz (NOT on own website)
    // Scrapable — $4.849 visible on homepage in static HTML
    // ============================================
    const betterChoiceData = {
      id: uuidv4(),
      name: 'A Better Choice Fuel',
      slug: 'a-better-choice-fuel',
      phone: '(845) 338-4222',
      email: null,
      website: 'https://www.abetterchoicefuel.com',
      addressLine1: null,
      city: 'Kingston',
      state: 'NY',
      postalCodesServed: JSON.stringify([
        // Ulster County (core — Kingston base)
        '12401', // Kingston
        '12404', // Accord
        '12411', // Bloomington
        '12419', // Cottekill
        '12429', // Esopus
        '12440', // High Falls
        '12443', // Hurley
        '12456', // Lake Katrine
        '12466', // Port Ewen
        '12471', // Rifton
        '12472', // Rosendale
        '12477', // Saugerties
        '12484', // Stone Ridge
        '12486', // Tillson
        '12487', // Ulster Park
        '12489', // Wawarsing
        '12491', // West Hurley
        '12493', // West Park
        '12498', // Woodstock
        '12515', // Clintondale
        '12525', // Gardiner
        '12528', // Highland
        '12542', // Marlboro
        '12561', // New Paltz
        '12568', // Plattekill
        '12588', // Walker Valley
        '12589', // Wallkill
        // Greene County
        '12414', // Catskill
        '12451', // Leeds
        // Orange County
        '12550', // Newburgh
        '12553', // New Windsor
        '12586', // Walden
        // Sullivan County
        '12701', // Monticello
        '12754', // Liberty
        // Delaware County
        '13856', // Walton
      ]),
      serviceCities: JSON.stringify([
        'Kingston', 'Saugerties', 'Woodstock', 'New Paltz', 'Highland',
        'Rosendale', 'Stone Ridge', 'Hurley', 'Esopus', 'Port Ewen',
        'Lake Katrine', 'Walker Valley', 'Wallkill', 'Gardiner',
        'Clintondale', 'Marlboro', 'Plattekill', 'Accord', 'High Falls',
        'Catskill', 'Newburgh', 'Walden', 'Monticello', 'Liberty', 'Walton'
      ]),
      serviceCounties: JSON.stringify(['Ulster', 'Columbia', 'Delaware', 'Greene', 'Orange', 'Sullivan']),
      serviceAreaRadius: 40,
      lat: 41.9270,
      lng: -73.9974,
      hoursWeekday: '8:00 AM - 4:30 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['credit_card']),
      fuelTypes: JSON.stringify(['heating_oil', 'kerosene']),
      minimumGallons: null,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    };

    await upsertSupplier(sequelize, betterChoiceData);
    console.log('[Migration 096] Upserted A Better Choice Fuel (Kingston, NY)');

    console.log('[Migration 096] ✅ Walker Valley area suppliers complete');
  },

  async down(sequelize) {
    // Remove 12588 from Valley Oil and Bee's Oil
    await sequelize.query(`
      UPDATE suppliers
      SET postal_codes_served = (postal_codes_served::jsonb - '12588')::text,
          updated_at = NOW()
      WHERE LOWER(REPLACE(REPLACE(website, 'https://', ''), 'http://', ''))
        LIKE ANY(ARRAY['%valleyoilpok.com%', '%beesfueloil.com%'])
    `);

    // Deactivate new suppliers
    await sequelize.query(`
      UPDATE suppliers SET active = false, updated_at = NOW()
      WHERE slug IN ('empire-fuel', 'ever-ready-oil', 'big-o-fuels', 'a-better-choice-fuel')
    `);

    console.log('[Migration 096] Rollback: Reverted Walker Valley area changes');
  }
};
