/**
 * Migration 098: Backfill Limited-Coverage ZIPs + Add Hilton Oil
 *
 * Dashboard showed "LIMITED COVERAGE" (≤2 explicit suppliers) for 4 ZIPs:
 *
 * 12185 (Valley Falls, NY):
 *   - Append to Morse Fuels (morsefuels.com) — serves Valley Falls per website, only had VT ZIPs
 *   - Append to Buhrmaster (buhrmaster.com) — Albany area, serves Rensselaer County
 *
 * 13491 (West Winfield, NY):
 *   - Append to Glider Oil (glideroil.com) — serves Herkimer County, had 13490/13492 but not 13491
 *
 * 13364 (Leonardsville, NY):
 *   - Append to Glider Oil (glideroil.com) — serves Madison County
 *
 * 01879 (Tyngsboro, MA):
 *   - Append to County Energy Products (countyenergyproducts.com) — Chelmsford MA, serves Middlesex County
 *   - Add Hilton Oil Co. (hiltonoil.com) — Lawrence MA, COD: "Cash | Check (Time of delivery)"
 *
 * Also expands Morse Fuels postalCodesServed with NY towns they explicitly list on their website.
 */

const { upsertSupplier } = require('./lib/upsert-supplier');

module.exports = {
  name: '098-backfill-limited-coverage-zips',

  async up(sequelize) {
    // Helper: append ZIPs and cities to an existing supplier's coverage
    async function appendCoverage(sequelize, domainPattern, zips, cities) {
      const [rows] = await sequelize.query(`
        SELECT id, name, postal_codes_served, service_cities
        FROM suppliers
        WHERE LOWER(REPLACE(REPLACE(website, 'https://', ''), 'http://', '')) LIKE $1
        LIMIT 1
      `, { bind: [`%${domainPattern}%`] });

      if (!rows || rows.length === 0) {
        console.log(`[Migration 098] Supplier matching ${domainPattern} not found — skipping`);
        return;
      }

      const supplier = rows[0];
      let existingZips = [];
      let existingCities = [];
      try { existingZips = JSON.parse(supplier.postal_codes_served || '[]'); } catch (e) { existingZips = []; }
      try { existingCities = JSON.parse(supplier.service_cities || '[]'); } catch (e) { existingCities = []; }

      for (const zip of zips) {
        if (!existingZips.includes(zip)) existingZips.push(zip);
      }
      for (const city of cities) {
        if (!existingCities.includes(city)) existingCities.push(city);
      }

      await sequelize.query(`
        UPDATE suppliers
        SET postal_codes_served = $1, service_cities = $2, updated_at = NOW()
        WHERE id = $3
      `, { bind: [JSON.stringify(existingZips), JSON.stringify(existingCities), supplier.id] });

      console.log(`[Migration 098] Updated ${supplier.name} — added ${zips.length} ZIPs`);
    }

    // ============================================
    // 1. MORSE FUELS — expand with NY ZIPs
    // Currently only has VT ZIPs (05201, etc.) but explicitly lists
    // Valley Falls, Schaghticoke, Troy, Cohoes, etc. on their website.
    // COD confirmed: "No Contracts Necessary"
    // ============================================
    await appendCoverage(sequelize, 'morsefuels.com',
      [
        '12185', // Valley Falls
        '12154', // Schaghticoke
        '12118', // Mechanicville
        '12092', // Hoosick Falls
        '12090', // Hoosick
        '12180', // Troy
        '12047', // Cohoes
        '12188', // Waterford
        '12170', // Stillwater
        '12168', // Stephentown (home base)
        '12022', // Berlin
        '12153', // Sand Lake
        '12083', // Grafton
        '12065', // Clifton Park
        '12866', // Saratoga Springs
        '12144', // Rensselaer
        '12061', // East Greenbush
        '12033', // Castleton On Hudson
        '12037', // Chatham
        '12534', // Hudson
        '12106', // Kinderhook
        '12816', // Cambridge
      ],
      [
        'Valley Falls', 'Schaghticoke', 'Mechanicville', 'Hoosick Falls',
        'Hoosick', 'Troy', 'Cohoes', 'Waterford', 'Stillwater',
        'Stephentown', 'Berlin', 'Sand Lake', 'Grafton', 'Clifton Park',
        'Saratoga Springs', 'Rensselaer', 'East Greenbush',
        'Castleton On Hudson', 'Chatham', 'Hudson', 'Kinderhook', 'Cambridge',
      ]
    );

    // ============================================
    // 2. BUHRMASTER — add Valley Falls (12185)
    // Scotia/Albany area, serves Rensselaer County via radius.
    // Making it explicit for dashboard coverage count.
    // ============================================
    await appendCoverage(sequelize, 'buhrmaster.com',
      ['12185'],
      ['Valley Falls']
    );

    // ============================================
    // 3. GLIDER OIL — add West Winfield (13491) + Leonardsville (13364)
    // Serves 11 counties including Herkimer and Madison.
    // Had nearby ZIPs (13490, 13492) but was missing these two.
    // ============================================
    await appendCoverage(sequelize, 'glideroil.com',
      ['13491', '13364'],
      ['West Winfield', 'Leonardsville']
    );

    // ============================================
    // 4. COUNTY ENERGY PRODUCTS — add Tyngsboro (01879)
    // Chelmsford MA, serves Middlesex/Essex counties.
    // Tyngsboro is ~5 miles from Chelmsford.
    // ============================================
    await appendCoverage(sequelize, 'countyenergyproducts.com',
      ['01879'],
      ['Tyngsboro']
    );

    // ============================================
    // 5. ADD HILTON OIL CO. — Lawrence, MA
    // COD confirmed: Order form has "Cash | Check (Time of delivery)"
    // and "Credit Card (Time of delivery)" — pay-at-delivery on own site.
    // Source: hiltonoil.com/order-oil-delivery.html
    // NOT scrapable — Weebly site, no prices in HTML.
    // ============================================
    await upsertSupplier(sequelize, {
      name: 'Hilton Oil Co.',
      slug: 'hilton-oil-co',
      phone: '(978) 687-9793',
      email: null,
      website: 'https://hiltonoil.com',
      addressLine1: '101 S Union St',
      city: 'Lawrence',
      state: 'MA',
      postalCodesServed: JSON.stringify([
        // MA — Merrimack Valley + Greater Lowell
        '01840','01841','01842','01843', // Lawrence
        '01844',                         // Methuen
        '01845',                         // North Andover
        '01810','01812',                 // Andover
        '01830','01831','01832','01835', // Haverhill
        '01850','01851','01852','01853','01854', // Lowell
        '01824',                         // Chelmsford
        '01826',                         // Dracut
        '01879',                         // Tyngsboro
        // NH — border towns mentioned on site
        '03076',                         // Pelham
        '03079',                         // Salem
      ]),
      serviceCities: JSON.stringify([
        'Lawrence','Methuen','North Andover','Andover',
        'Haverhill','Lowell','Chelmsford','Dracut','Tyngsboro',
        'Pelham','Salem',
      ]),
      serviceCounties: JSON.stringify(['Essex','Middlesex','Hillsborough','Rockingham']),
      serviceAreaRadius: 25,
      lat: 42.7070,
      lng: -71.1631,
      hoursWeekday: '8:00 AM - 4:00 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash','check','credit_card']),
      fuelTypes: JSON.stringify(['heating_oil','kerosene']),
      minimumGallons: 100,
      seniorDiscount: true,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    });
    console.log('[Migration 098] Upserted Hilton Oil Co. (Lawrence, MA)');

    console.log('[Migration 098] ✅ Limited-coverage backfill complete');
  },

  async down(sequelize) {
    // Remove Hilton Oil
    await sequelize.query(`DELETE FROM suppliers WHERE slug = 'hilton-oil-co'`);

    // Note: coverage appends are not reversed (idempotent data — ZIPs stay)
    console.log('[Migration 098] Rollback: Removed Hilton Oil Co.');
  }
};
