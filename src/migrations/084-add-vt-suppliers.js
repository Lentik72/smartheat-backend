/**
 * Migration 084: Add 9 Vermont Suppliers
 *
 * VT cross-reference — filling massive gaps (only 1 VT-native supplier existed).
 * All suppliers verified COD/will-call from their own websites.
 *
 * SCRAPABLE (4):
 *  1. Greene's Oil — Bennington, VT (will-call explicit, fuel oil $3.85, kerosene $4.85)
 *  2. Gecha Fuels — Pittsford, VT (Price of the Day $3.60, Revolution Slider)
 *  3. James Plumbing & Heating Oil — Bellows Falls, VT (Cash price $3.849, VT+NH)
 *  4. West Oil Company — North Adams, MA (retail $3.979, serves S. Bennington Co VT)
 *
 * DIRECTORY-ONLY (5):
 *  5. Morse Fuels — Stephentown, NY (no contracts, cash/CC, serves S. Bennington VT)
 *  6. Corse Fuels — Cambridge, VT (will-call explicit, Lamoille/Franklin/Chittenden)
 *  7. Packard Fuels — East Montpelier, VT (will-call explicit, Washington/Orange/Caledonia)
 *  8. Central Vermont Oil Company — Pittsfield, VT (will-call explicit, Windsor/Rutland)
 *  9. Sam's U-Save Fuels — Fair Haven, VT (cash company, broad Rutland County)
 */

const { upsertSupplier } = require('./lib/upsert-supplier');

module.exports = {
  async up(sequelize) {
    // ============================================
    // 1. GREENE'S OIL (Robert Greene, Inc.) — Bennington, VT
    // COD confirmed: "automatic or a will call basis" on homepage.
    // Cash pricing explicit. Since 1946. 24hr emergency service.
    // Price in static HTML: "fuel oil 3.85" and "kerosene 4.85"
    // ============================================
    await upsertSupplier(sequelize, {
      name: "Greene's Oil",
      slug: 'greenes-oil',
      phone: '(802) 442-2705',
      email: null,
      website: 'https://greenesoil.com',
      addressLine1: '675 North Branch St',
      city: 'Bennington',
      state: 'VT',
      postalCodesServed: JSON.stringify([
        '05201','05250','05257','05260','05261','05262'
      ]),
      serviceCities: JSON.stringify([
        'Bennington','Arlington','North Bennington','North Pownal',
        'Pownal','Shaftsbury','Woodford'
      ]),
      serviceCounties: JSON.stringify(['Bennington']),
      serviceAreaRadius: 15,
      lat: 42.892,
      lng: -73.184,
      hoursWeekday: '7:00 AM - 4:00 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash','check','credit_card']),
      fuelTypes: JSON.stringify(['heating_oil','kerosene']),
      minimumGallons: 150,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true
    });
    console.log("[Migration 084] Upserted Greene's Oil (Bennington, VT)");

    // ============================================
    // 2. GECHA FUELS — Pittsford, VT
    // COD confirmed: cash discount within 10 days of delivery.
    // "Price of the Day" on homepage in Revolution Slider: $3.60/gal
    // 24hr emergency service. Owners: Mike and Brian Gecha.
    // ============================================
    await upsertSupplier(sequelize, {
      name: 'Gecha Fuels',
      slug: 'gecha-fuels',
      phone: '(802) 483-9333',
      email: 'gechafuels@gmail.com',
      website: 'https://gechafuels.com',
      addressLine1: '107 Gecha Lane',
      city: 'Pittsford',
      state: 'VT',
      postalCodesServed: JSON.stringify([
        '05701','05733','05735','05736','05737','05738',
        '05739','05742','05743','05744','05750','05757',
        '05758','05759','05761','05763','05764','05765',
        '05773','05774','05777',
        '05251','05769','05778'
      ]),
      serviceCities: JSON.stringify([
        'Brandon','Castleton','Center Rutland','Chittenden','Clarendon',
        'Cuttingsville','Danby','Dorset','East Poultney','East Wallingford',
        'Fair Haven','Florence','Goshen','Hydeville','Ira','Leicester',
        'Mendon','Middletown Springs','Mount Holly','North Clarendon',
        'Pawlet','Pittsford','Poultney','Proctor','Rutland',
        'Salisbury','Shrewsbury','Sudbury','Tinmouth',
        'Wallingford','Wells','West Rutland','Whiting'
      ]),
      serviceCounties: JSON.stringify(['Rutland','Addison','Bennington']),
      serviceAreaRadius: 30,
      lat: 43.695,
      lng: -73.001,
      hoursWeekday: '7:30 AM - 4:00 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash','check','credit_card','debit_card']),
      fuelTypes: JSON.stringify(['heating_oil','kerosene','diesel']),
      minimumGallons: 100,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true
    });
    console.log('[Migration 084] Upserted Gecha Fuels (Pittsford, VT)');

    // ============================================
    // 3. JAMES PLUMBING & HEATING OIL — Bellows Falls, VT
    // COD confirmed: "Cash" price on homepage, COD listed as payment method.
    // $0.10/gal cash/check discount. Founded 1967 (oil added 1995).
    // Serves VT (Windham/Windsor) + NH (Cheshire/Sullivan).
    // ============================================
    await upsertSupplier(sequelize, {
      name: 'James Plumbing & Heating Oil',
      slug: 'james-plumbing-heating-oil',
      phone: '(802) 463-3122',
      email: null,
      website: 'https://jamesfuels.com',
      addressLine1: '91 Paper Mill Rd',
      city: 'Bellows Falls',
      state: 'VT',
      postalCodesServed: JSON.stringify([
        // VT — Windham County
        '05101','05146','05154','05155','05158',
        '05301','05343','05345','05346','05353',
        '05355','05359','05362',
        // VT — Windsor County
        '05030','05142','05143','05148','05149',
        '05150','05151','05156','05161',
        // NH — Cheshire County
        '03431','03443','03448','03456','03457',
        '03462','03464','03466','03467','03469',
        '03602','03604','03607','03608','03609',
        // NH — Sullivan County
        '03601','03603','03743'
      ]),
      serviceCities: JSON.stringify([
        'Bellows Falls','Westminster','Saxtons River','Grafton',
        'Putney','Newfane','Townshend','Jamaica','South Londonderry',
        'Wardsboro','Brattleboro',
        'Springfield','North Springfield','Chester','Perkinsville',
        'Ludlow','Cavendish','Weston','Ascutney','Londonderry',
        'Walpole','North Walpole','Alstead','Keene',
        'Charlestown','Claremont'
      ]),
      serviceCounties: JSON.stringify(['Windham','Windsor','Cheshire','Sullivan']),
      serviceAreaRadius: 30,
      lat: 43.134,
      lng: -72.458,
      hoursWeekday: '7:00 AM - 5:00 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash','check','credit_card']),
      fuelTypes: JSON.stringify(['heating_oil','kerosene','propane']),
      minimumGallons: 100,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true
    });
    console.log('[Migration 084] Upserted James Plumbing & Heating Oil (Bellows Falls, VT)');

    // ============================================
    // 4. WEST OIL COMPANY — North Adams, MA
    // COD confirmed: "Fluctuating Retail Price" billed on delivery day.
    // ACH discount $0.15/gal. Prompt-pay discount. Since 1949.
    // Serves N. Berkshire MA + S. Bennington Co VT.
    // Price in sidebar widget: "$3.979 per gallon"
    // ============================================
    await upsertSupplier(sequelize, {
      name: 'West Oil Company',
      slug: 'west-oil-company',
      phone: '(413) 664-4000',
      email: 'info@westoilcompany.com',
      website: 'https://westoilcompany.com',
      addressLine1: '593 Ashland St',
      city: 'North Adams',
      state: 'MA',
      postalCodesServed: JSON.stringify([
        // MA — Berkshire County (Northern)
        '01220','01225','01237','01247','01256','01267',
        // MA — Franklin County (edge)
        '01346','01367',
        // VT — Bennington County (Southern)
        '05201','05257','05260','05261','05262','05350','05363'
      ]),
      serviceCities: JSON.stringify([
        'Adams','Cheshire','Clarksburg','Florida','Hancock',
        'Lanesborough','Monroe','New Ashford','North Adams',
        'Rowe','Savoy','Williamstown',
        'Bennington','North Bennington','North Pownal','Pownal',
        'Readsboro','Searsburg','Shaftsbury','Woodford'
      ]),
      serviceCounties: JSON.stringify(['Berkshire','Franklin','Bennington']),
      serviceAreaRadius: 25,
      lat: 42.684,
      lng: -73.101,
      hoursWeekday: '8:00 AM - 4:30 PM',
      hoursSaturday: '9:00 AM - 12:00 PM',
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: true,
      paymentMethods: JSON.stringify(['cash','check','credit_card','debit_card']),
      fuelTypes: JSON.stringify(['heating_oil','kerosene','diesel']),
      minimumGallons: 125,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true
    });
    console.log('[Migration 084] Upserted West Oil Company (North Adams, MA)');

    // ============================================
    // 5. MORSE FUELS — Stephentown, NY
    // COD confirmed: "No Contracts Necessary", cash/CC online ordering.
    // NY-based, serves Southern Bennington County VT.
    // ZIP form required for pricing — NOT scrapable.
    // ============================================
    await upsertSupplier(sequelize, {
      name: 'Morse Fuels',
      slug: 'morse-fuels',
      phone: '(518) 658-0072',
      email: 'morsefuelsllc@gmail.com',
      website: 'https://morsefuels.com',
      addressLine1: '15950 State Route 22',
      city: 'Stephentown',
      state: 'NY',
      postalCodesServed: JSON.stringify([
        '05201','05254','05255','05257','05260','05261','05262'
      ]),
      serviceCities: JSON.stringify([
        'Bennington','Manchester','Manchester Center','North Bennington',
        'North Pownal','Pownal','Shaftsbury'
      ]),
      serviceCounties: JSON.stringify(['Bennington']),
      serviceAreaRadius: 30,
      lat: 42.548,
      lng: -73.369,
      hoursWeekday: '7:00 AM - 5:00 PM',
      hoursSaturday: '8:00 AM - 12:00 PM',
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: true,
      paymentMethods: JSON.stringify(['cash','credit_card']),
      fuelTypes: JSON.stringify(['heating_oil','kerosene','propane','diesel']),
      minimumGallons: 100,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true
    });
    console.log('[Migration 084] Upserted Morse Fuels (Stephentown, NY)');

    // ============================================
    // 6. CORSE FUELS (Jack F. Corse, Inc.) — Cambridge, VT
    // COD confirmed: will-call explicit on website.
    // Founded 1947, third generation. 24/7 emergency service.
    // Lamoille + Franklin + Northern Chittenden Counties.
    // ============================================
    await upsertSupplier(sequelize, {
      name: 'Corse Fuels',
      slug: 'corse-fuels',
      phone: '(802) 644-2749',
      email: null,
      website: 'https://www.corsefuels.com',
      addressLine1: '5812 VT-15',
      city: 'Cambridge',
      state: 'VT',
      postalCodesServed: JSON.stringify([
        // Lamoille County
        '05441','05444','05464','05465','05492',
        '05652','05655','05656','05661','05672','05680',
        // Franklin County
        '05442','05448','05450','05454','05455',
        // Northern Chittenden County
        '05452','05468','05489','05490','05494'
      ]),
      serviceCities: JSON.stringify([
        'Bakersfield','Belvidere Center','Cambridge','East Fairfield',
        'Eden','Eden Mills','Enosburg Falls','Essex','Essex Junction',
        'Fairfax','Fairfield','Hyde Park','Jeffersonville','Jericho',
        'Johnson','Lake Elmore','Milton','Morrisville','Moscow',
        'North Hyde Park','Stowe','Underhill','Underhill Center',
        'Waterville','Westford','Wolcott'
      ]),
      serviceCounties: JSON.stringify(['Lamoille','Franklin','Chittenden']),
      serviceAreaRadius: 30,
      lat: 44.650,
      lng: -72.815,
      hoursWeekday: '8:00 AM - 4:30 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash','credit_card']),
      fuelTypes: JSON.stringify(['heating_oil','kerosene','propane','diesel']),
      minimumGallons: null,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true
    });
    console.log('[Migration 084] Upserted Corse Fuels (Cambridge, VT)');

    // ============================================
    // 7. PACKARD FUELS — East Montpelier, VT
    // COD confirmed: will-call explicit, "automatic or will-call delivery".
    // 24/7/365 emergency service. Washington + Orange + Caledonia Counties.
    // Website returns 403 — not scrapable.
    // ============================================
    await upsertSupplier(sequelize, {
      name: 'Packard Fuels',
      slug: 'packard-fuels',
      phone: '(802) 262-3835',
      email: 'office@packardfuels.com',
      website: 'https://www.packardfuels.com',
      addressLine1: '352 Packard Rd',
      city: 'East Montpelier',
      state: 'VT',
      postalCodesServed: JSON.stringify([
        // Washington County
        '05602','05640','05641','05647','05648','05649',
        '05650','05651','05654','05658','05660','05663',
        '05664','05666','05667','05670','05675','05676',
        '05678','05679','05681','05682',
        // Orange County
        '05036','05076','05086',
        // Caledonia County
        '05046','05862','05863'
      ]),
      serviceCities: JSON.stringify([
        'Adamant','Barre','Brookfield','Calais','East Barre',
        'East Calais','East Montpelier','Graniteville','Groton',
        'Marshfield','Montpelier','Moretown','North Montpelier',
        'Northfield','Northfield Falls','Peacham','Plainfield',
        'South Barre','Topsham','Washington','Waterbury',
        'Waterbury Center','Websterville','West Topsham',
        'Williamstown','Woodbury','Worcester'
      ]),
      serviceCounties: JSON.stringify(['Washington','Orange','Caledonia']),
      serviceAreaRadius: 25,
      lat: 44.247,
      lng: -72.501,
      hoursWeekday: '8:00 AM - 4:00 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash','credit_card']),
      fuelTypes: JSON.stringify(['heating_oil','diesel']),
      minimumGallons: null,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true
    });
    console.log('[Migration 084] Upserted Packard Fuels (East Montpelier, VT)');

    // ============================================
    // 8. CENTRAL VERMONT OIL COMPANY (CV Oil) — Pittsfield, VT
    // COD confirmed: will-call explicit (2 weeks notice in winter).
    // Family owned since 1973. Oil + propane delivery.
    // Windsor + Rutland + Addison + Orange Counties.
    // ============================================
    await upsertSupplier(sequelize, {
      name: 'Central Vermont Oil Company',
      slug: 'central-vermont-oil',
      phone: '(802) 746-8018',
      email: null,
      website: 'https://www.cvoil.com',
      addressLine1: '3925 Route 100',
      city: 'Pittsfield',
      state: 'VT',
      postalCodesServed: JSON.stringify([
        '05032','05033','05035','05056','05060','05091',
        '05701','05737','05746','05747','05748',
        '05751','05762','05767','05772'
      ]),
      serviceCities: JSON.stringify([
        'Barnard','Bethel','Bridgewater','Chittenden','Gaysville',
        'Granville','Hancock','Killington','Mendon','Pittsfield',
        'Plymouth','Randolph','Rochester','Stockbridge','Woodstock'
      ]),
      serviceCounties: JSON.stringify(['Windsor','Rutland','Addison','Orange']),
      serviceAreaRadius: 25,
      lat: 43.772,
      lng: -72.813,
      hoursWeekday: '8:00 AM - 4:00 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['check','credit_card']),
      fuelTypes: JSON.stringify(['heating_oil','propane']),
      minimumGallons: null,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true
    });
    console.log('[Migration 084] Upserted Central Vermont Oil Company (Pittsfield, VT)');

    // ============================================
    // 9. SAM'S U-SAVE FUELS — Fair Haven, VT
    // COD confirmed: cash company per HeatFleet.
    // Family owned since 1956. Two terminals: Fair Haven + Rutland.
    // 24hr emergency delivery + burner service. Broad Rutland County coverage.
    // ============================================
    await upsertSupplier(sequelize, {
      name: "Sam's U-Save Fuels",
      slug: 'sams-u-save-fuels',
      phone: '(802) 265-3608',
      email: 'samsusave@myfairpoint.net',
      website: 'https://samsusavefuel.com',
      addressLine1: '352 Route 4-A',
      city: 'Fair Haven',
      state: 'VT',
      postalCodesServed: JSON.stringify([
        '05035','05056','05149',
        '05251','05253','05254','05255',
        '05701','05731','05732','05733','05735','05736',
        '05737','05739','05741','05743','05744','05750',
        '05751','05753','05757','05758','05759','05760',
        '05761','05763','05764','05765','05768','05770',
        '05773','05774','05777','05778'
      ]),
      serviceCities: JSON.stringify([
        'Benson','Bomoseen','Brandon','Bridgewater','Castleton',
        'Chittenden','Clarendon','Cornwall','Danby','Dorset',
        'Fair Haven','Hubbardton','Hydeville','Ira','Killington',
        'Leicester','Ludlow','Manchester','Mendon','Middletown Springs',
        'Mount Holly','Mount Tabor','Orwell','Pawlet','Pittsford',
        'Plymouth','Poultney','Proctor','Rupert','Rutland',
        'Shoreham','Shrewsbury','Sudbury','Tinmouth','Wallingford',
        'Wells','West Haven','West Rutland','Whiting'
      ]),
      serviceCounties: JSON.stringify(['Rutland','Addison','Bennington','Windsor']),
      serviceAreaRadius: 35,
      lat: 43.600,
      lng: -73.254,
      hoursWeekday: '7:00 AM - 5:00 PM',
      hoursSaturday: '7:00 AM - 12:00 PM',
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: true,
      paymentMethods: JSON.stringify(['cash','credit_card']),
      fuelTypes: JSON.stringify(['heating_oil','kerosene','propane']),
      minimumGallons: null,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true
    });
    console.log("[Migration 084] Upserted Sam's U-Save Fuels (Fair Haven, VT)");

    console.log('[Migration 084] VT suppliers migration complete — 4 scrapable + 5 directory');
  },

  async down(sequelize) {
    const slugs = [
      'greenes-oil','gecha-fuels','james-plumbing-heating-oil',
      'west-oil-company','morse-fuels','corse-fuels',
      'packard-fuels','central-vermont-oil','sams-u-save-fuels'
    ];
    for (const slug of slugs) {
      await sequelize.query('DELETE FROM suppliers WHERE slug = $1', { bind: [slug] });
    }
    console.log('[Migration 084] Rolled back VT suppliers');
  }
};
