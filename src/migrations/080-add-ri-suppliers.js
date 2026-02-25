/**
 * Migration 080: Add 5 Rhode Island Suppliers + Expand 5 Cross-Border MA→RI
 *
 * NewEnglandOil.com banner advertiser cross-reference — Rhode Island batch.
 * All suppliers verified COD/will-call from their own websites.
 *
 * NEW SUPPLIERS:
 *  1. Wicked Warm Oil — Scituate, RI (Providence/Kent)
 *     COD confirmed: "COD delivery company" on own site. Family-owned.
 *     Prices NOT scrapable (Droplet widget, ZIP form required).
 *     Also serves CT (Windham) and MA (Worcester/Norfolk).
 *  2. Rambone & Sprague Oil Service — North Scituate, RI (Providence/Kent)
 *     COD confirmed: "call-in" + "Payment is due upon delivery" on own site.
 *     Prices scrapable: <div class="price">3.84</div> (Drupal 7 static HTML).
 *  3. Dudek Oil Co. — Warren, RI (Bristol/Providence/Newport)
 *     COD confirmed: posted cash price + "upon order request" language.
 *     Prices scrapable via dudekoilri.com: "Total Fuel Oil Price 3.50".
 *     NOTE: dudekoilco.com is Wix (not scrapable); dudekoilri.com is WordPress.
 *  4. Charlie's Oil Co. — Fall River, MA → RI (Bristol MA + Bristol/Newport RI)
 *     Will-call confirmed: "Call us when you're in need of an oil delivery" on own site.
 *     Prices NOT scrapable (no prices on site). 75 years in business.
 *  5. Stop & Go Oil — West Warwick, RI (statewide)
 *     COD confirmed: "No Contracts Necessary", "On-Demand" on own site.
 *     Prices NOT scrapable (ZIP form/dynamic pricing). BBB A+.
 *
 * CROSS-BORDER EXPANSIONS (append RI ZIPs to existing MA suppliers):
 *  6. T & M Fuel (tandmfuel.com) — Attleboro, MA → northern/central RI
 *  7. Affordable Fuel (orderaffordablefuel.com) — Seekonk, MA → broad RI
 *  8. Pricerite Heating Oil (priceriteheatingoil.com) — Seekonk, MA → East Bay RI
 *  9. M.J. Meehan / Order Your Oil (orderyouroil.com) — Bellingham, MA → Providence County RI
 * 10. Universal Oil (univoil.com) — Providence area → statewide RI
 */

const { v4: uuidv4 } = require('uuid');
const { upsertSupplier } = require('./lib/upsert-supplier');

module.exports = {
  name: '080-add-ri-suppliers',

  async up(sequelize) {
    // ============================================
    // 1. WICKED WARM OIL — Scituate, RI
    // COD confirmed: "Rhode Island based family-owned home heating oil COD delivery company"
    // Payment due at time of or before all deliveries.
    // Serves RI (Providence/Kent), CT (Windham), MA (Worcester/Norfolk).
    // Prices via Droplet widget — NOT scrapable.
    // NOTE: Different company from wickedwarm.com (NH prepaid).
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Wicked Warm Oil',
      slug: 'wicked-warm-oil',
      phone: '(401) 999-8121',
      email: 'wickedwarmoil@gmail.com',
      website: 'https://wickedwarmoil.com',
      addressLine1: '71 Rocky Hill Road',
      city: 'Scituate',
      state: 'RI',
      postalCodesServed: JSON.stringify([
        // RI — Providence County
        '02814', '02825', '02828', '02830', '02831', '02857', '02859',
        '02864', '02865', '02895', '02896', '02910', '02911', '02917',
        '02919', '02920', '02921',
        // RI — Kent County
        '02816', '02827',
        // CT — Windham County
        '06234', '06239', '06259', '06260', '06277', '06281', '06374', '06377',
        // MA — Worcester/Norfolk
        '01504', '01516', '01529', '01569', '02019'
      ]),
      serviceCities: JSON.stringify([
        // RI
        'Burrillville', 'Chepachet', 'Coventry', 'Cranston', 'Cumberland',
        'Foster', 'Glocester', 'Harrisville', 'Hope', 'Johnston', 'Lincoln',
        'North Providence', 'North Smithfield', 'Pascoag', 'Scituate',
        'Smithfield', 'Woonsocket',
        // CT
        'Brooklyn', 'Killingly', 'Plainfield', 'Pomfret', 'Putnam',
        'Sterling', 'Thompson', 'Woodstock',
        // MA
        'Bellingham', 'Blackstone', 'Douglas', 'Millville', 'Uxbridge'
      ]),
      serviceCounties: JSON.stringify([
        'Providence', 'Kent', 'Windham', 'Worcester', 'Norfolk'
      ]),
      serviceAreaRadius: 25,
      lat: 41.8497,
      lng: -71.6160,
      hoursWeekday: '8:00 AM - 6:00 PM',
      hoursSaturday: '9:00 AM - 12:00 PM',
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: true,
      paymentMethods: JSON.stringify(['credit_card', 'debit_card']),
      fuelTypes: JSON.stringify(['heating_oil', 'diesel']),
      minimumGallons: 100,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    });
    console.log('[Migration 080] Upserted Wicked Warm Oil (Scituate, RI)');

    // ============================================
    // 2. RAMBONE & SPRAGUE OIL SERVICE — North Scituate, RI
    // COD confirmed: "call-in" deliveries + "Payment is due upon delivery"
    // BBB A+ since 2013. Family-owned since 1995. 100 gal min.
    // Drupal 7 site — price in static HTML: <div class="price">3.84</div>
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Rambone & Sprague Oil Service',
      slug: 'rambone-sprague-oil',
      phone: '(401) 647-1455',
      email: 'info@rambonespragueoil.com',
      website: 'https://rambonespragueoil.com',
      addressLine1: '1024 Danielson Pike',
      city: 'North Scituate',
      state: 'RI',
      postalCodesServed: JSON.stringify([
        // Providence County
        '02802', '02814', '02815', '02823', '02824', '02825', '02826',
        '02828', '02829', '02830', '02831', '02838', '02839', '02857',
        '02858', '02859', '02860', '02861', '02863', '02864', '02865',
        '02876', '02895', '02896', '02903', '02904', '02905', '02906',
        '02907', '02908', '02909', '02910', '02911', '02914', '02915',
        '02916', '02917', '02919', '02920', '02921',
        // Kent County
        '02816', '02817', '02818', '02827', '02886', '02887', '02888',
        '02889', '02893'
      ]),
      serviceCities: JSON.stringify([
        'Albion', 'Central Falls', 'Chepachet', 'Clayville', 'Coventry',
        'Cranston', 'Cumberland', 'East Greenwich', 'East Providence',
        'Fiskeville', 'Forestdale', 'Foster', 'Glendale', 'Greene',
        'Greenville', 'Harmony', 'Harrisville', 'Hope', 'Johnston',
        'Lincoln', 'Manville', 'Mapleville', 'North Providence',
        'North Scituate', 'North Smithfield', 'Oakland', 'Pascoag',
        'Pawtucket', 'Providence', 'Riverside', 'Rumford', 'Slatersville',
        'Smithfield', 'Warwick', 'West Greenwich', 'West Warwick',
        'Woonsocket'
      ]),
      serviceCounties: JSON.stringify(['Providence', 'Kent']),
      serviceAreaRadius: 30,
      lat: 41.8287,
      lng: -71.6412,
      hoursWeekday: '8:30 AM - 4:30 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
      fuelTypes: JSON.stringify(['heating_oil', 'diesel', 'kerosene']),
      minimumGallons: 100,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });
    console.log('[Migration 080] Upserted Rambone & Sprague Oil Service (North Scituate, RI)');

    // ============================================
    // 3. DUDEK OIL CO. — Warren, RI
    // COD confirmed: posted cash price, "upon order request" = will-call.
    // Since 1930. East Bay RI + southern Bristol County MA. 150 gal min.
    // Prices on dudekoilri.com (WordPress): "Total Fuel Oil Price 3.50"
    // dudekoilco.com is Wix — NOT scrapable. Use dudekoilri.com for scraping.
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Dudek Oil Co.',
      slug: 'dudek-oil-co',
      phone: '(401) 245-7843',
      email: null,
      website: 'https://dudekoilri.com',
      addressLine1: '417 Child Street',
      city: 'Warren',
      state: 'RI',
      postalCodesServed: JSON.stringify([
        // RI — Bristol County
        '02885', '02809', '02806',
        // RI — Providence County
        '02914', '02915', '02916',
        // RI — Newport County
        '02842', '02871',
        // MA — Bristol County
        '02777', '02771'
      ]),
      serviceCities: JSON.stringify([
        'Warren', 'Bristol', 'Barrington', 'East Providence', 'Riverside',
        'Rumford', 'Middletown', 'Portsmouth', 'Swansea', 'Seekonk'
      ]),
      serviceCounties: JSON.stringify([
        'Bristol County, RI', 'Providence', 'Newport', 'Bristol County, MA'
      ]),
      serviceAreaRadius: 20,
      lat: 41.7291,
      lng: -71.2672,
      hoursWeekday: '9:00 AM - 4:30 PM',
      hoursSaturday: '9:00 AM - 4:30 PM',
      hoursSunday: '9:00 AM - 12:00 PM',
      emergencyDelivery: true,
      weekendDelivery: true,
      paymentMethods: JSON.stringify(['cash', 'check', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil', 'propane', 'kerosene', 'diesel']),
      minimumGallons: 150,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });
    console.log('[Migration 080] Upserted Dudek Oil Co. (Warren, RI)');

    // ============================================
    // 4. CHARLIE'S OIL CO. — Fall River, MA → RI
    // Will-call confirmed: "Call us when you're in need of an oil delivery"
    // Est. 1950, 75 years. Fall River base, serves SE MA + East Bay RI.
    // No prices on site. Accepts major credit cards.
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: "Charlie's Oil Co.",
      slug: 'charlies-oil-co',
      phone: '(508) 674-0709',
      email: null,
      website: 'https://www.charliesoil.com',
      addressLine1: '46 Oak Grove Ave',
      city: 'Fall River',
      state: 'MA',
      postalCodesServed: JSON.stringify([
        // MA — Bristol County
        '02702', '02715', '02717', '02719', '02720', '02721', '02722',
        '02723', '02724', '02725', '02726', '02740', '02742', '02744',
        '02745', '02746', '02747', '02748', '02769', '02771', '02777',
        '02779', '02790',
        // MA — Plymouth County
        '02347', '02348',
        // RI — Bristol County
        '02806', '02809', '02885',
        // RI — Newport County
        '02835', '02837', '02840', '02841', '02842', '02871', '02878',
        // RI — Providence County
        '02914', '02915'
      ]),
      serviceCities: JSON.stringify([
        // MA
        'Assonet', 'Berkley', 'Dartmouth', 'Dighton', 'Fairhaven',
        'Fall River', 'Freetown', 'Lakeville', 'New Bedford', 'Rehoboth',
        'Seekonk', 'Somerset', 'Swansea', 'Westport',
        // RI
        'Barrington', 'Bristol', 'East Providence', 'Jamestown',
        'Little Compton', 'Middletown', 'Newport', 'Portsmouth',
        'Tiverton', 'Warren'
      ]),
      serviceCounties: JSON.stringify([
        'Bristol County, MA', 'Plymouth', 'Bristol County, RI', 'Newport', 'Providence'
      ]),
      serviceAreaRadius: 25,
      lat: 41.6987,
      lng: -71.1343,
      hoursWeekday: '8:00 AM - 4:00 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['credit_card']),
      fuelTypes: JSON.stringify(['heating_oil']),
      minimumGallons: null,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    });
    console.log("[Migration 080] Upserted Charlie's Oil Co. (Fall River, MA → RI)");

    // ============================================
    // 5. STOP & GO OIL — West Warwick, RI
    // COD confirmed: "No Contracts Necessary", "On-Demand Heating Oil supplier"
    // BBB A+. Same-day delivery. Text ordering accepted. Est. 2021.
    // Prices via ZIP form — NOT scrapable.
    // Broad RI coverage (all 5 counties).
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Stop & Go Oil',
      slug: 'stop-and-go-oil',
      phone: '(401) 313-3333',
      email: 'stopandgooilri@gmail.com',
      website: 'https://stopandgooil.com',
      addressLine1: '929 Providence St',
      city: 'West Warwick',
      state: 'RI',
      postalCodesServed: JSON.stringify([
        // Providence County
        '02802', '02814', '02815', '02823', '02824', '02825', '02826',
        '02828', '02829', '02830', '02831', '02838', '02839', '02857',
        '02859', '02860', '02861', '02863', '02864', '02865', '02876',
        '02895', '02896', '02903', '02904', '02905', '02906', '02907',
        '02908', '02909', '02910', '02911', '02914', '02915', '02916',
        '02917', '02919', '02920', '02921',
        // Kent County
        '02816', '02817', '02818', '02827', '02886', '02887', '02888',
        '02889', '02893',
        // Bristol County
        '02806', '02809', '02872', '02885',
        // Newport County
        '02835', '02871',
        // Washington County
        '02804', '02808', '02813', '02822', '02832', '02833', '02852',
        '02874', '02877', '02879', '02881', '02882', '02891'
      ]),
      serviceCities: JSON.stringify([
        'Albion', 'Ashaway', 'Barrington', 'Bradford', 'Bristol',
        'Central Falls', 'Charlestown', 'Chepachet', 'Clayville',
        'Coventry', 'Cranston', 'Cumberland', 'East Greenwich',
        'East Providence', 'Exeter', 'Fiskeville', 'Foster', 'Greene',
        'Greenville', 'Harmony', 'Harrisville', 'Hope', 'Hope Valley',
        'Hopkinton', 'Jamestown', 'Johnston', 'Kingston', 'Lincoln',
        'Manville', 'Narragansett', 'North Kingstown', 'North Providence',
        'North Scituate', 'North Smithfield', 'Pascoag', 'Pawtucket',
        'Portsmouth', 'Providence', 'Riverside', 'Rumford', 'Saunderstown',
        'Smithfield', 'Wakefield', 'Warren', 'Warwick', 'West Greenwich',
        'West Warwick', 'Westerly', 'Woonsocket'
      ]),
      serviceCounties: JSON.stringify([
        'Providence', 'Kent', 'Bristol', 'Newport', 'Washington'
      ]),
      serviceAreaRadius: 30,
      lat: 41.7294,
      lng: -71.4879,
      hoursWeekday: '8:00 AM - 8:00 PM',
      hoursSaturday: '8:00 AM - 8:00 PM',
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: true,
      paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
      fuelTypes: JSON.stringify(['heating_oil']),
      minimumGallons: null,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    });
    console.log('[Migration 080] Upserted Stop & Go Oil (West Warwick, RI)');

    // ============================================
    // CROSS-BORDER EXPANSIONS: Append RI ZIPs to existing MA suppliers
    // Uses jsonb array merging to preserve existing data.
    // ============================================

    // 6. T & M FUEL (tandmfuel.com) — Attleboro, MA → northern/central RI
    const tmRiZips = [
      '02860', '02861', '02863', '02864', '02865', '02895', '02896',
      '02903', '02904', '02905', '02906', '02907', '02908', '02909',
      '02910', '02911', '02914', '02915', '02916', '02917', '02919',
      '02920', '02921', '02886', '02888', '02889', '02893', '02885'
    ];
    const tmRiCities = [
      'Pawtucket', 'Central Falls', 'Cumberland', 'Lincoln', 'Woonsocket',
      'North Smithfield', 'Providence', 'Cranston', 'North Providence',
      'East Providence', 'Riverside', 'Rumford', 'Smithfield', 'Johnston',
      'Warwick', 'West Warwick', 'Warren'
    ];
    const tmRiCounties = ['Providence', 'Kent', 'Bristol'];

    await sequelize.query(`
      UPDATE suppliers SET
        postal_codes_served = (
          SELECT jsonb_agg(DISTINCT val)
          FROM (
            SELECT jsonb_array_elements_text(COALESCE(postal_codes_served, '[]'::jsonb)) AS val
            UNION
            SELECT unnest(ARRAY[:riZips]) AS val
          ) combined
        ),
        service_cities = (
          SELECT jsonb_agg(DISTINCT val)
          FROM (
            SELECT jsonb_array_elements_text(COALESCE(service_cities, '[]'::jsonb)) AS val
            UNION
            SELECT unnest(ARRAY[:riCities]) AS val
          ) combined
        ),
        service_counties = (
          SELECT jsonb_agg(DISTINCT val)
          FROM (
            SELECT jsonb_array_elements_text(COALESCE(service_counties, '[]'::jsonb)) AS val
            UNION
            SELECT unnest(ARRAY[:riCounties]) AS val
          ) combined
        ),
        updated_at = NOW()
      WHERE LOWER(REPLACE(REPLACE(website, 'https://', ''), 'http://', '')) LIKE '%tandmfuel.com%'
        AND active = true
    `, {
      replacements: { riZips: tmRiZips, riCities: tmRiCities, riCounties: tmRiCounties }
    });
    console.log('[Migration 080] Expanded T & M Fuel with RI coverage');

    // 7. AFFORDABLE FUEL (orderaffordablefuel.com) — Seekonk, MA → broad RI
    const afRiZips = [
      '02860', '02861', '02863', '02864', '02865', '02895', '02896',
      '02903', '02904', '02905', '02906', '02907', '02908', '02909',
      '02910', '02911', '02914', '02915', '02916', '02917', '02919',
      '02920', '02921', '02802', '02823', '02824', '02828', '02829',
      '02831', '02838', '02839', '02857', '02876',
      '02816', '02818', '02827', '02886', '02888', '02889', '02893', '02817',
      '02806', '02809', '02885', '02872',
      '02840', '02842', '02871', '02835', '02878', '02837',
      '02852', '02874', '02877'
    ];
    const afRiCities = [
      'Pawtucket', 'Central Falls', 'Cumberland', 'Lincoln', 'Woonsocket',
      'North Smithfield', 'Providence', 'Cranston', 'North Providence',
      'East Providence', 'Riverside', 'Rumford', 'Smithfield', 'Johnston',
      'Albion', 'Fiskeville', 'Forestdale', 'Greenville', 'Harmony',
      'Hope', 'Manville', 'Mapleville', 'North Scituate', 'Slatersville',
      'Coventry', 'East Greenwich', 'Greene', 'Warwick', 'West Warwick',
      'West Greenwich', 'Barrington', 'Bristol', 'Warren',
      'Newport', 'Middletown', 'Portsmouth', 'Jamestown', 'Tiverton',
      'Little Compton', 'North Kingstown', 'Saunderstown'
    ];
    const afRiCounties = ['Providence', 'Kent', 'Bristol', 'Newport', 'Washington'];

    await sequelize.query(`
      UPDATE suppliers SET
        postal_codes_served = (
          SELECT jsonb_agg(DISTINCT val)
          FROM (
            SELECT jsonb_array_elements_text(COALESCE(postal_codes_served, '[]'::jsonb)) AS val
            UNION
            SELECT unnest(ARRAY[:riZips]) AS val
          ) combined
        ),
        service_cities = (
          SELECT jsonb_agg(DISTINCT val)
          FROM (
            SELECT jsonb_array_elements_text(COALESCE(service_cities, '[]'::jsonb)) AS val
            UNION
            SELECT unnest(ARRAY[:riCities]) AS val
          ) combined
        ),
        service_counties = (
          SELECT jsonb_agg(DISTINCT val)
          FROM (
            SELECT jsonb_array_elements_text(COALESCE(service_counties, '[]'::jsonb)) AS val
            UNION
            SELECT unnest(ARRAY[:riCounties]) AS val
          ) combined
        ),
        updated_at = NOW()
      WHERE LOWER(REPLACE(REPLACE(website, 'https://', ''), 'http://', '')) LIKE '%orderaffordablefuel.com%'
        AND active = true
    `, {
      replacements: { riZips: afRiZips, riCities: afRiCities, riCounties: afRiCounties }
    });
    console.log('[Migration 080] Expanded Affordable Fuel with RI coverage');

    // 8. PRICERITE HEATING OIL (priceriteheatingoil.com) — Seekonk, MA → East Bay RI
    // Most precise data: from their own delivery map with day-specific schedules.
    const prRiZips = [
      '02860', '02861', '02863', '02864', '02865', '02895',
      '02914', '02915', '02916', '02806'
    ];
    const prRiCities = [
      'Pawtucket', 'Central Falls', 'Cumberland', 'Lincoln', 'Woonsocket',
      'East Providence', 'Riverside', 'Rumford', 'Barrington'
    ];
    const prRiCounties = ['Providence', 'Bristol'];

    await sequelize.query(`
      UPDATE suppliers SET
        postal_codes_served = (
          SELECT jsonb_agg(DISTINCT val)
          FROM (
            SELECT jsonb_array_elements_text(COALESCE(postal_codes_served, '[]'::jsonb)) AS val
            UNION
            SELECT unnest(ARRAY[:riZips]) AS val
          ) combined
        ),
        service_cities = (
          SELECT jsonb_agg(DISTINCT val)
          FROM (
            SELECT jsonb_array_elements_text(COALESCE(service_cities, '[]'::jsonb)) AS val
            UNION
            SELECT unnest(ARRAY[:riCities]) AS val
          ) combined
        ),
        service_counties = (
          SELECT jsonb_agg(DISTINCT val)
          FROM (
            SELECT jsonb_array_elements_text(COALESCE(service_counties, '[]'::jsonb)) AS val
            UNION
            SELECT unnest(ARRAY[:riCounties]) AS val
          ) combined
        ),
        updated_at = NOW()
      WHERE LOWER(REPLACE(REPLACE(website, 'https://', ''), 'http://', '')) LIKE '%priceriteheatingoil.com%'
        AND active = true
    `, {
      replacements: { riZips: prRiZips, riCities: prRiCities, riCounties: prRiCounties }
    });
    console.log('[Migration 080] Expanded Pricerite Heating Oil with RI coverage');

    // 9. M.J. MEEHAN / ORDER YOUR OIL (orderyouroil.com) — Bellingham, MA → Providence County RI
    const mjRiZips = [
      '02895', '02896', '02864', '02865', '02917', '02828', '02829',
      '02826', '02802', '02838', '02876', '02857', '02860', '02861',
      '02863', '02911', '02903', '02904', '02905', '02906', '02907',
      '02908', '02909', '02910', '02914', '02916', '02919', '02920', '02921'
    ];
    const mjRiCities = [
      'Woonsocket', 'North Smithfield', 'Cumberland', 'Lincoln', 'Smithfield',
      'Greenville', 'Harmony', 'Glendale', 'Albion', 'Manville', 'Slatersville',
      'North Scituate', 'Pawtucket', 'Central Falls', 'North Providence',
      'Providence', 'Cranston', 'East Providence', 'Rumford', 'Johnston'
    ];
    const mjRiCounties = ['Providence'];

    await sequelize.query(`
      UPDATE suppliers SET
        postal_codes_served = (
          SELECT jsonb_agg(DISTINCT val)
          FROM (
            SELECT jsonb_array_elements_text(COALESCE(postal_codes_served, '[]'::jsonb)) AS val
            UNION
            SELECT unnest(ARRAY[:riZips]) AS val
          ) combined
        ),
        service_cities = (
          SELECT jsonb_agg(DISTINCT val)
          FROM (
            SELECT jsonb_array_elements_text(COALESCE(service_cities, '[]'::jsonb)) AS val
            UNION
            SELECT unnest(ARRAY[:riCities]) AS val
          ) combined
        ),
        service_counties = (
          SELECT jsonb_agg(DISTINCT val)
          FROM (
            SELECT jsonb_array_elements_text(COALESCE(service_counties, '[]'::jsonb)) AS val
            UNION
            SELECT unnest(ARRAY[:riCounties]) AS val
          ) combined
        ),
        updated_at = NOW()
      WHERE LOWER(REPLACE(REPLACE(website, 'https://', ''), 'http://', '')) LIKE '%orderyouroil.com%'
        AND active = true
    `, {
      replacements: { riZips: mjRiZips, riCities: mjRiCities, riCounties: mjRiCounties }
    });
    console.log('[Migration 080] Expanded M.J. Meehan with RI coverage');

    // 10. UNIVERSAL OIL (univoil.com) — Providence area → statewide RI
    const uoRiZips = [
      // Providence County
      '02802', '02814', '02815', '02823', '02824', '02825', '02826',
      '02828', '02829', '02830', '02831', '02838', '02839', '02857',
      '02858', '02859', '02860', '02861', '02863', '02864', '02865',
      '02876', '02895', '02896', '02903', '02904', '02905', '02906',
      '02907', '02908', '02909', '02910', '02911', '02914', '02915',
      '02916', '02917', '02919', '02920', '02921',
      // Kent County
      '02816', '02817', '02818', '02827', '02886', '02888', '02889', '02893',
      // Bristol County
      '02806', '02809', '02871', '02885',
      // Newport County
      '02835', '02840', '02842',
      // Washington County
      '02813', '02822', '02832', '02852', '02874', '02877', '02879',
      '02881', '02882', '02883', '02892'
    ];
    const uoRiCities = [
      'Albion', 'Barrington', 'Bristol', 'Central Falls', 'Charlestown',
      'Chepachet', 'Clayville', 'Coventry', 'Cranston', 'Cumberland',
      'East Greenwich', 'East Providence', 'Exeter', 'Fiskeville',
      'Forestdale', 'Foster', 'Glendale', 'Greene', 'Greenville',
      'Harmony', 'Harrisville', 'Hope', 'Hope Valley', 'Jamestown',
      'Johnston', 'Kingston', 'Lincoln', 'Manville', 'Mapleville',
      'Middletown', 'Narragansett', 'Newport', 'North Kingstown',
      'North Providence', 'North Scituate', 'North Smithfield', 'Oakland',
      'Pascoag', 'Pawtucket', 'Peace Dale', 'Portsmouth', 'Providence',
      'Riverside', 'Rumford', 'Saunderstown', 'Slatersville', 'Smithfield',
      'South Kingstown', 'Wakefield', 'Warren', 'Warwick', 'West Greenwich',
      'West Kingston', 'West Warwick', 'Woonsocket'
    ];
    const uoRiCounties = ['Providence', 'Kent', 'Bristol', 'Newport', 'Washington'];

    await sequelize.query(`
      UPDATE suppliers SET
        postal_codes_served = (
          SELECT jsonb_agg(DISTINCT val)
          FROM (
            SELECT jsonb_array_elements_text(COALESCE(postal_codes_served, '[]'::jsonb)) AS val
            UNION
            SELECT unnest(ARRAY[:riZips]) AS val
          ) combined
        ),
        service_cities = (
          SELECT jsonb_agg(DISTINCT val)
          FROM (
            SELECT jsonb_array_elements_text(COALESCE(service_cities, '[]'::jsonb)) AS val
            UNION
            SELECT unnest(ARRAY[:riCities]) AS val
          ) combined
        ),
        service_counties = (
          SELECT jsonb_agg(DISTINCT val)
          FROM (
            SELECT jsonb_array_elements_text(COALESCE(service_counties, '[]'::jsonb)) AS val
            UNION
            SELECT unnest(ARRAY[:riCounties]) AS val
          ) combined
        ),
        updated_at = NOW()
      WHERE LOWER(REPLACE(REPLACE(website, 'https://', ''), 'http://', '')) LIKE '%univoil.com%'
        AND active = true
    `, {
      replacements: { riZips: uoRiZips, riCities: uoRiCities, riCounties: uoRiCounties }
    });
    console.log('[Migration 080] Expanded Universal Oil with RI coverage');

    console.log('[Migration 080] ✅ RI suppliers complete (5 new + 5 expanded)');
  },

  async down(sequelize) {
    const domains = [
      'wickedwarmoil.com',
      'rambonespragueoil.com',
      'dudekoilri.com',
      'charliesoil.com',
      'stopandgooil.com',
    ];
    for (const domain of domains) {
      await sequelize.query(`
        UPDATE suppliers SET active = false, updated_at = NOW()
        WHERE LOWER(REPLACE(REPLACE(website, 'https://', ''), 'http://', '')) LIKE $1
      `, { bind: [`%${domain}%`] });
    }
    // Note: Cross-border ZIP expansions are not rolled back (additive data).
    console.log('[Migration 080] Rollback: Deactivated RI suppliers');
  }
};
