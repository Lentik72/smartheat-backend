/**
 * Migration 099: Fix Overwritten Coverage Data
 *
 * Bug: Migrations 096/097/098 used JSON.parse() on JSONB columns, which silently
 * failed (JSONB returns JS arrays, not strings). The catch block reset ZIPs to [],
 * then only the appended ZIPs were written back — overwriting all existing coverage.
 *
 * Affected suppliers and root cause:
 *   - Valley Oil: 096 overwrote → only had ['12588']
 *   - Bee's Fuel Oil: 096 overwrote → only had ['12588'] (but 077 migration re-upserts with full data)
 *   - Roberts Discount Fuel: 097 overwrote → only had ['06077']
 *   - Trinks Brothers: 097 overwrote → only had ['06077']
 *   - E-Z Oil: 097 overwrote → only had ['06077']
 *   - Buhrmaster: 098 overwrote → only had ['12185']
 *   - County Energy Products: 098 overwrote → only had ['01879']
 *   - Morse Fuels: 098 overwrote → lost VT ZIPs (084 sets VT, 098 overwrote with NY only)
 *   - Glider Oil: 098 would have overwritten but 091 re-upserts with full data after
 *
 * Fix: Use native JSONB concatenation (||) to SET complete ZIP arrays.
 * This migration is idempotent — it sets the full correct array each time.
 *
 * Also fixes appendCoverage in 096/097/098 by replacing JSON.parse with
 * direct array handling.
 */

module.exports = {
  name: '099-fix-overwritten-coverage',

  async up(sequelize) {
    // Helper: set complete postalCodesServed and serviceCities for a supplier by slug
    async function setCoverage(sequelize, slug, zips, cities, counties) {
      const updates = [`postal_codes_served = $1::jsonb`, `service_cities = $2::jsonb`, `updated_at = NOW()`];
      const binds = [JSON.stringify(zips), JSON.stringify(cities)];
      if (counties) {
        updates.push(`service_counties = $${binds.length + 1}::jsonb`);
        binds.push(JSON.stringify(counties));
      }
      binds.push(slug);
      await sequelize.query(`
        UPDATE suppliers SET ${updates.join(', ')} WHERE slug = $${binds.length}
      `, { bind: binds });
      console.log(`[Migration 099] Restored ${slug} — ${zips.length} ZIPs`);
    }

    // ============================================
    // 1. VALLEY OIL — Dutchess + Ulster County, NY + 12588 (Walker Valley)
    // Source: valleyoilpok.com — "Dutchess and Ulster counties"
    // ============================================
    await setCoverage(sequelize, 'valley-oil',
      [
        // Dutchess County
        '12501','12504','12507','12508','12514','12522','12524','12531',
        '12533','12537','12538','12540','12545','12546','12564','12567',
        '12569','12570','12571','12572','12574','12578','12580','12581',
        '12582','12583','12585','12590','12592','12594','12601','12602',
        '12603','12604',
        // Ulster County
        '12401','12402','12404','12405','12409','12410','12411','12412',
        '12416','12417','12419','12420','12428','12429','12433','12435',
        '12440','12443','12446','12448','12449','12456','12457','12458',
        '12461','12464','12466','12471','12472','12477','12480','12481',
        '12484','12486','12487','12489','12491','12493','12494','12495',
        '12498','12515','12525','12528','12542','12547','12548','12561',
        '12568','12588','12725',
      ],
      [
        'Poughkeepsie','Wappingers Falls','Hyde Park','Beacon','Rhinebeck',
        'Red Hook','Millbrook','Pine Plains','Amenia','Dover Plains',
        'Pawling','Hopewell Junction','Fishkill','Lagrangeville',
        'Pleasant Valley','Stanfordville','Millerton','Tivoli',
        'Kingston','New Paltz','Saugerties','Woodstock','Rosendale',
        'Stone Ridge','Marlboro','Highland','Ellenville','Walker Valley',
      ],
      ['Dutchess','Ulster']
    );

    // ============================================
    // 2. BUHRMASTER — 7 counties in Capital Region + 12185
    // Source: buhrmaster.com — Albany, Fulton, Montgomery,
    //   Rensselaer, Saratoga, Schenectady, Schoharie
    // ============================================
    await setCoverage(sequelize, 'buhrmaster-energy-group',
      [
        // Albany County
        '12009','12041','12045','12046','12047','12054','12059','12067',
        '12077','12084','12110','12120','12143','12147','12158','12159',
        '12186','12189','12193','12202','12203','12204','12205','12206',
        '12207','12208','12209','12210','12211','12212','12469',
        // Fulton County
        '12025','12032','12078','12095','12117','12134','13470',
        // Montgomery County
        '12010','12068','12070','12072','12086','12166','13317','13339',
        '13428','13452',
        // Rensselaer County
        '12017','12018','12022','12023','12028','12029','12040','12052',
        '12057','12061','12062','12063','12083','12090','12092','12094',
        '12121','12123','12128','12138','12140','12144','12153','12154',
        '12156','12168','12169','12180','12181','12182','12183','12185',
        '12196','12198',
        // Saratoga County
        '12019','12020','12027','12065','12074','12118','12148','12151',
        '12170','12188','12803','12822','12831','12833','12835','12850',
        '12859','12863','12866','12871','12884',
        // Schenectady County
        '12008','12033','12053','12056','12137','12150','12301','12302',
        '12303','12304','12305','12306','12307','12308','12309','12345',
        // Schoharie County
        '12031','12035','12036','12043','12066','12071','12076','12093',
        '12122','12131','12149','12157','12160','12175','12187','12194',
        '13459',
      ],
      [
        'Scotia','Amsterdam','Albany','Troy','Saratoga Springs',
        'Schenectady','Clifton Park','Cohoes','Waterford','Mechanicville',
        'Rensselaer','East Greenbush','Valley Falls','Schaghticoke',
        'Hoosick Falls','Gloversville','Johnstown',
      ],
      ['Albany','Fulton','Montgomery','Rensselaer','Saratoga','Schenectady','Schoharie']
    );

    // ============================================
    // 3. ROBERTS DISCOUNT FUEL — Hartford + Tolland County, CT + 06066 + 06077
    // Source: robertsdiscountfuel.com/delivery — 50 towns listed
    // ============================================
    await setCoverage(sequelize, 'roberts-discount-fuel',
      [
        // Hartford County
        '06001','06002','06010','06013','06016','06019','06020','06022',
        '06023','06026','06027','06032','06033','06035','06037','06040',
        '06043','06051','06052','06053','06060','06062','06067','06070',
        '06073','06074','06078','06081','06082','06085','06088','06089',
        '06090','06091','06092','06093','06095','06096',
        '06103','06105','06106','06107','06108','06109','06110','06111',
        '06112','06114','06117','06118','06119','06120',
        // Tolland County
        '06029','06066','06071','06076','06077','06084',
        '06231','06232','06237','06238','06248','06250','06268','06269',
        '06279','06447','06479','06489',
      ],
      [
        'Avon','Bloomfield','Broad Brook','Canton','East Granby','East Hartford',
        'East Windsor','Ellington','Enfield','Farmington','Glastonbury','Granby',
        'Hartford','Manchester','Newington','Rocky Hill','Simsbury','Somers',
        'South Windsor','Stafford','Stafford Springs','Staffordville','Suffield',
        'Tolland','Vernon','Vernon Rockville','Wethersfield','Windsor',
        'Windsor Locks','West Hartford','West Simsbury','West Suffield',
      ],
      ['Hartford','Tolland']
    );

    // ============================================
    // 4. TRINKS BROTHERS — Hartford + Tolland + edges, CT + 06077
    // Source: trinksbrothers.com/areas-we-service — 34 towns
    // ============================================
    await setCoverage(sequelize, 'trinks-brothers-oil-llc',
      [
        // Hartford County
        '06001','06002','06010','06013','06016','06019','06020','06022',
        '06023','06026','06027','06032','06033','06035','06037','06040',
        '06043','06051','06052','06053','06060','06062','06067','06070',
        '06073','06074','06078','06081','06082','06085','06088','06089',
        '06090','06091','06092','06093','06095','06096',
        '06103','06105','06106','06107','06108','06109','06110','06111',
        '06112','06114','06117','06118','06119','06120',
        // Tolland County
        '06029','06066','06071','06076','06077','06084',
        '06231','06232','06237','06238','06248','06250','06268','06269',
        '06279','06447','06479','06489',
        // Edge towns from their explicit list
        '06415', // Colchester (New London County)
        '06249', // Lebanon (New London County)
      ],
      [
        'Andover','Ashford','Bloomfield','Bolton','Colchester','Columbia',
        'Coventry','East Granby','East Hampton','East Hartford','East Windsor',
        'Ellington','Enfield','Farmington','Glastonbury','Granby','Hartford',
        'Hebron','Lebanon','Manchester','Mansfield','Marlborough','Newington',
        'Rocky Hill','Somers','South Windsor','Stafford','Stafford Springs',
        'Staffordville','Suffield','Tolland','Vernon','West Hartford',
        'Wethersfield','Willington','Windsor','Windsor Locks',
      ],
      ['Hartford','Tolland']
    );

    // ============================================
    // 5. E-Z OIL COMPANY — CT Hartford/Tolland area + 06066 + 06077
    // Source: e-zoil.net/get-price — explicit ZIP list per town
    // ============================================
    await setCoverage(sequelize, 'e-z-oil-company',
      [
        '06002', // Bloomfield
        '06016', // Broad Brook
        '06029', // Ellington
        '06033', // Glastonbury
        '06040','06043', // Manchester/Bolton
        '06066', // Vernon
        '06067', // Rocky Hill
        '06071', // Somers
        '06073', // South Glastonbury
        '06074', // South Windsor
        '06075', // Stafford
        '06076', // Stafford Springs
        '06077', // Staffordville
        '06082', // Enfield
        '06084', // Tolland
        '06088', // East Windsor
        '06096', // Windsor Locks
        '06107','06108','06109','06110','06111', // West Hartford/East Hartford/Wethersfield/Newington
        '06117','06118','06119', // West Hartford/East Hartford
        '06226', // Willimantic
        '06231', // Amston
        '06232', // Andover
        '06237', // Columbia
        '06238', // Coventry
        '06248', // Hebron
        '06249', // Lebanon
        '06269', // Mansfield
        '06279', // Willington
        '06447', // Marlborough
        '06480', // Portland
      ],
      [
        'Amston','Andover','Bloomfield','Bolton','Broad Brook','Columbia',
        'Coventry','East Hartford','East Windsor','Ellington','Enfield',
        'Glastonbury','Hebron','Lebanon','Manchester','Mansfield',
        'Marlborough','Newington','Portland','Rocky Hill','Somers',
        'South Windsor','Stafford','Stafford Springs','Staffordville',
        'Tolland','Vernon','West Hartford','Wethersfield','Willimantic',
        'Willington','Windsor Locks',
      ],
      ['Hartford','Tolland','Middlesex','Windham']
    );

    // ============================================
    // 6. COUNTY ENERGY PRODUCTS — restore full coverage from migration 081
    // Was overwritten to just ['01879'] by migration 098
    // ============================================
    await setCoverage(sequelize, 'county-energy-products',
      [
        // NH — Hillsborough County
        '03031','03051','03052','03053','03054',
        '03060','03062','03063','03110',
        // NH — Rockingham County
        '03038','03076','03079','03086','03841',
        // MA — Middlesex County
        '01432','01450','01451','01460','01463',
        '01718','01720','01741','01742','01803',
        '01821','01824','01826','01827','01850',
        '01851','01852','01854','01862','01863',
        '01876','01879','01886','01887',
        // MA — Essex County
        '01810','01844',
      ],
      [
        'Bedford','Derry','Hollis','Hudson','Litchfield',
        'Londonderry','Merrimack','Nashua','Pelham','Salem','Windham',
        'Acton','Andover','Ayer','Bedford','Billerica','Burlington',
        'Carlisle','Chelmsford','Concord','Dracut','Dunstable',
        'Groton','Harvard','Littleton','Lowell','Methuen',
        'Pepperell','Tewksbury','Tyngsboro','Westford','Wilmington',
      ],
      ['Hillsborough','Rockingham','Middlesex','Essex']
    );

    // ============================================
    // 7. MORSE FUELS — merge VT (084) + NY (098) ZIPs
    // 084 set VT ZIPs, 098 overwrote with NY only
    // ============================================
    await setCoverage(sequelize, 'morse-fuels',
      [
        // VT — from migration 084 (Southern Bennington County)
        '05201','05254','05255','05257','05260','05261','05262',
        // NY — from migration 098 (website service area)
        '12185','12154','12118','12092','12090','12180','12047',
        '12188','12170','12168','12022','12153','12083','12065',
        '12866','12144','12061','12033','12037','12534','12106',
        '12816',
      ],
      [
        // VT
        'Bennington','Manchester','Manchester Center','North Bennington',
        'North Pownal','Pownal','Shaftsbury',
        // NY
        'Valley Falls','Schaghticoke','Mechanicville','Hoosick Falls',
        'Hoosick','Troy','Cohoes','Waterford','Stillwater',
        'Stephentown','Berlin','Sand Lake','Grafton','Clifton Park',
        'Saratoga Springs','Rensselaer','East Greenbush',
        'Castleton On Hudson','Chatham','Hudson','Kinderhook','Cambridge',
      ],
      ['Bennington','Rensselaer','Albany','Saratoga','Columbia','Washington']
    );

    console.log('[Migration 099] ✅ All overwritten coverage data restored');
  },

  async down(sequelize) {
    // No rollback — this restores correct data
    console.log('[Migration 099] No rollback needed (data restoration)');
  }
};
