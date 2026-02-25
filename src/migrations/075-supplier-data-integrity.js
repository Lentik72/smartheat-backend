/**
 * Migration 075: Supplier Data Integrity Cleanup
 *
 * 1. Deactivate GetCodOil (broker, not a direct dealer)
 * 2. Merge SS Fuel / S&S Fuel duplicates (same company, Oakdale NY)
 * 3. Update Belica Fuel with full vetted data (ScrapeConfigSync auto-created)
 * 4. Update Fiorilla Heating Oil with full vetted data (ScrapeConfigSync auto-created)
 * 5. Update Oil Guy LLC with full vetted data (ScrapeConfigSync auto-created)
 * 6. Update Omni Energy with full vetted data (ScrapeConfigSync auto-created)
 *
 * Research verified: All 4 CT suppliers are legitimate dealers with own fleets,
 * HOD licenses, and USDOT registrations. GetCodOil is a confirmed broker
 * (P.O. Box, no fleet, "we only work with local providers").
 */

const { v4: uuidv4 } = require('uuid');
const { upsertSupplier } = require('./lib/upsert-supplier');

module.exports = {
  name: '075-supplier-data-integrity',

  async up(sequelize) {
    // ============================================
    // 1. DEACTIVATE GETCODOIL (BROKER)
    // Confirmed: P.O. Box 770464 Woodside NY, no USDOT, no fleet,
    // "We only work with local, licensed and insured energy providers"
    // ============================================
    const [getCodOil] = await sequelize.query(`
      UPDATE suppliers
      SET active = false,
          notes = 'BROKER — deactivated. No fleet, P.O. Box only, routes orders to local dealers.',
          updated_at = NOW()
      WHERE LOWER(REPLACE(REPLACE(website, 'https://', ''), 'http://', '')) LIKE '%getcodoil.com%'
        AND active = true
      RETURNING id, name
    `);
    if (getCodOil.length > 0) {
      console.log(`[Migration 075] Deactivated broker: ${getCodOil[0].name} (${getCodOil[0].id})`);
    } else {
      console.log('[Migration 075] GetCodOil not found or already inactive');
    }

    // ============================================
    // 2. MERGE SS FUEL / S&S FUEL DUPLICATES
    // Same company in Oakdale, NY — two records appearing on ~180 price pages
    // Keep the older record, deactivate the newer one
    // ============================================
    const [ssFuelRecords] = await sequelize.query(`
      SELECT id, name, slug, created_at
      FROM suppliers
      WHERE (LOWER(name) LIKE '%ss fuel%' OR LOWER(name) LIKE '%s&s fuel%' OR LOWER(name) LIKE '%s & s fuel%')
        AND active = true
      ORDER BY created_at ASC
    `);

    if (ssFuelRecords.length >= 2) {
      const keepId = ssFuelRecords[0].id;
      const keepName = ssFuelRecords[0].name;

      for (let i = 1; i < ssFuelRecords.length; i++) {
        const dupeId = ssFuelRecords[i].id;
        const dupeName = ssFuelRecords[i].name;

        // Move any prices from duplicate to canonical record
        await sequelize.query(
          `UPDATE supplier_prices SET supplier_id = $1 WHERE supplier_id = $2`,
          { bind: [keepId, dupeId] }
        );

        // Deactivate the duplicate (don't delete — preserve audit trail)
        await sequelize.query(
          `UPDATE suppliers SET active = false, notes = 'Duplicate of ' || $2 || '. Prices merged.', updated_at = NOW() WHERE id = $1`,
          { bind: [dupeId, keepName] }
        );

        console.log(`[Migration 075] Merged duplicate "${dupeName}" → keeping "${keepName}"`);
      }
    } else if (ssFuelRecords.length === 1) {
      console.log(`[Migration 075] Only one SS Fuel record found (${ssFuelRecords[0].name}) — no merge needed`);
    } else {
      console.log('[Migration 075] No SS Fuel records found');
    }

    // ============================================
    // 3. UPDATE BELICA FUEL — Southbury, CT
    // HOD #1282, USDOT #3716904, 2 trucks, 2 CDL drivers
    // Family-owned COD dealer. Cash $3.77, Credit $3.87 (at time of vetting)
    // ScrapeConfigSync auto-created a minimal record — this adds full data
    // ============================================
    const belicaData = {
      id: uuidv4(),
      name: 'Belica Fuel',
      slug: 'belica-fuel',
      phone: '(203) 560-9085',
      email: 'belicafuel@gmail.com',
      website: 'https://belicafuel.com',
      addressLine1: '264 Woodland Hills Rd',
      city: 'Southbury',
      state: 'CT',
      postalCodesServed: JSON.stringify([
        '06401', '06403', '06410', '06418', '06468', '06470', '06478',
        '06482', '06483', '06484', '06488', '06504', '06510', '06511',
        '06513', '06514', '06515', '06517', '06518', '06519', '06524',
        '06525', '06702', '06704', '06705', '06706', '06708', '06710',
        '06712', '06716', '06750', '06751', '06752', '06762', '06763',
        '06770', '06776', '06779', '06782', '06783', '06786', '06787',
        '06795', '06798', '06801', '06804', '06805', '06810', '06811',
        '06812', '06813', '06814', '06816', '06817', '06896', '06993'
      ]),
      serviceCities: JSON.stringify([
        'Southbury', 'Middlebury', 'Woodbury', 'Naugatuck', 'Watertown',
        'Oakville', 'Prospect', 'Seymour', 'Oxford', 'Ansonia',
        'Newtown', 'Sandy Hook', 'Danbury', 'New Fairfield', 'Ridgefield',
        'Brookfield', 'Bethel', 'Monroe', 'Shelton'
      ]),
      serviceCounties: JSON.stringify(['New Haven', 'Fairfield', 'Litchfield']),
      serviceAreaRadius: 25,
      lat: 41.4810,
      lng: -73.2285,
      hoursWeekday: null,
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'check', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil']),
      minimumGallons: 100,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    };

    await upsertSupplier(sequelize, belicaData);
    console.log('[Migration 075] Upserted Belica Fuel (Southbury, CT)');

    // ============================================
    // 4. UPDATE FIORILLA HEATING OIL — Bethel, CT
    // HOD #531, USDOT #639951, 4 trucks, 4 drivers
    // Since 1987, A+ BBB. WooCommerce prepay will-call model.
    // ============================================
    const fiorillaData = {
      id: uuidv4(),
      name: 'Fiorilla Heating Oil',
      slug: 'fiorilla-heating-oil',
      phone: '(203) 744-5352',
      email: null,
      website: 'https://fiorillaheatingoil.com',
      addressLine1: '155 Grassy Plain St',
      city: 'Bethel',
      state: 'CT',
      postalCodesServed: JSON.stringify([
        '06468', '06470', '06482', '06612', '06752', '06776', '06784',
        '06801', '06804', '06805', '06810', '06811', '06812', '06813',
        '06814', '06816', '06817', '06877', '06879', '06883', '06896',
        '06897', '06993'
      ]),
      serviceCities: JSON.stringify([
        'Bethel', 'Bridgewater', 'Brookfield', 'Danbury', 'Easton',
        'Monroe', 'New Fairfield', 'New Milford', 'Newtown', 'Redding',
        'Ridgefield', 'Sandy Hook', 'Sherman', 'Weston', 'Wilton'
      ]),
      serviceCounties: JSON.stringify(['Fairfield', 'Litchfield']),
      serviceAreaRadius: 25,
      lat: 41.3711,
      lng: -73.4129,
      hoursWeekday: null,
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['credit_card']),
      fuelTypes: JSON.stringify(['heating_oil']),
      minimumGallons: 50,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    };

    await upsertSupplier(sequelize, fiorillaData);
    console.log('[Migration 075] Upserted Fiorilla Heating Oil (Bethel, CT)');

    // ============================================
    // 5. UPDATE OIL GUY LLC — Watertown, CT
    // HOD #1286, USDOT #2927364, 2 trucks
    // Since 2016. Listed on HeatFleet (COD platform).
    // Scraper disabled (no prices on site) — allowPriceDisplay=false
    // ============================================
    const oilGuyData = {
      id: uuidv4(),
      name: 'Oil Guy LLC',
      slug: 'oil-guy-llc',
      phone: '(203) 910-2752',
      email: null,
      website: 'https://oilguyllc.com',
      addressLine1: '70 Farmdale Rd',
      city: 'Watertown',
      state: 'CT',
      postalCodesServed: JSON.stringify([
        '06010', '06013', '06032', '06062', '06401', '06403', '06410',
        '06450', '06451', '06470', '06478', '06482', '06483', '06488',
        '06489', '06504', '06510', '06511', '06513', '06514', '06515',
        '06517', '06518', '06519', '06524', '06702', '06704', '06705',
        '06706', '06708', '06710', '06712', '06716', '06750', '06751',
        '06752', '06759', '06762', '06763', '06770', '06776', '06779',
        '06782', '06783', '06786', '06787', '06790', '06791', '06795',
        '06798', '06804'
      ]),
      serviceCities: JSON.stringify([
        'Watertown', 'Oakville', 'Woodbury', 'Litchfield', 'Morris',
        'New Milford', 'Thomaston', 'Harwinton', 'Torrington', 'Plymouth',
        'Terryville', 'Waterbury', 'Naugatuck', 'Middlebury', 'Prospect',
        'Wolcott', 'Cheshire', 'Meriden', 'Oxford', 'Seymour', 'Southbury',
        'Beacon Falls', 'Ansonia', 'Bristol', 'Burlington', 'Southington',
        'Farmington', 'Plainville', 'Brookfield', 'Newtown', 'Sandy Hook'
      ]),
      serviceCounties: JSON.stringify(['Litchfield', 'New Haven', 'Hartford', 'Fairfield']),
      serviceAreaRadius: 30,
      lat: 41.6059,
      lng: -73.1187,
      hoursWeekday: null,
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'check', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil']),
      minimumGallons: null,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    };

    await upsertSupplier(sequelize, oilGuyData);
    console.log('[Migration 075] Upserted Oil Guy LLC (Watertown, CT)');

    // ============================================
    // 6. UPDATE OMNI ENERGY — Watertown, CT
    // HOD #1098, USDOT #2558419, 1 truck, 3 drivers
    // Since 2014, second-generation. Credit card prepay model.
    // Borderline reliability but legitimate dealer with own fleet.
    // ============================================
    const omniData = {
      id: uuidv4(),
      name: 'Omni Energy',
      slug: 'omni-energy',
      phone: '(203) 850-7200',
      email: null,
      website: 'https://myomnienergy.com',
      addressLine1: '67 Carmel Hill Rd',
      city: 'Watertown',
      state: 'CT',
      postalCodesServed: JSON.stringify([
        '06001', '06010', '06013', '06022', '06032', '06037', '06051',
        '06052', '06053', '06057', '06062', '06085', '06401', '06403',
        '06410', '06450', '06451', '06470', '06473', '06478', '06479',
        '06482', '06483', '06488', '06489', '06492', '06514', '06517',
        '06518', '06524', '06525', '06702', '06704', '06705', '06706',
        '06708', '06710', '06712', '06716', '06750', '06751', '06752',
        '06759', '06762', '06763', '06770', '06776', '06778', '06779',
        '06782', '06783', '06786', '06787', '06790', '06791', '06793',
        '06794', '06795', '06798'
      ]),
      serviceCities: JSON.stringify([
        'Watertown', 'Waterbury', 'Naugatuck', 'Middlebury', 'Prospect',
        'Wolcott', 'Cheshire', 'Southbury', 'Woodbury', 'Bethlehem',
        'Thomaston', 'Plymouth', 'Harwinton', 'Torrington', 'Litchfield',
        'Morris', 'Bristol', 'Burlington', 'Farmington', 'Southington',
        'New Britain', 'Newington', 'Avon', 'Simsbury', 'Goshen',
        'New Hartford', 'Danbury', 'New Fairfield', 'New Milford',
        'Brookfield', 'Newtown', 'Oxford', 'Seymour', 'Beacon Falls',
        'Ansonia', 'Meriden', 'Wallingford', 'Ridgefield', 'Sherman'
      ]),
      serviceCounties: JSON.stringify(['Litchfield', 'New Haven', 'Hartford', 'Fairfield']),
      serviceAreaRadius: 35,
      lat: 41.6059,
      lng: -73.1187,
      hoursWeekday: null,
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['credit_card']),
      fuelTypes: JSON.stringify(['heating_oil']),
      minimumGallons: null,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    };

    await upsertSupplier(sequelize, omniData);
    console.log('[Migration 075] Upserted Omni Energy (Watertown, CT)');

    console.log('[Migration 075] ✅ Supplier data integrity cleanup complete');
  },

  async down(sequelize) {
    // Re-activate GetCodOil
    await sequelize.query(`
      UPDATE suppliers SET active = true, notes = null, updated_at = NOW()
      WHERE LOWER(REPLACE(REPLACE(website, 'https://', ''), 'http://', '')) LIKE '%getcodoil.com%'
    `);
    console.log('[Migration 075] Rollback: Re-activated GetCodOil');
  }
};
