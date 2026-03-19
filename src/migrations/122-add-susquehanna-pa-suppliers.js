/**
 * Migration 122: Add 2 Susquehanna County PA / Southern Tier NY Suppliers
 *
 * Coverage gap fix for ZIP 18826 (Kingsley, PA) — only 1 enabled supplier prior.
 *
 * DIRECTORY-ONLY (2):
 *  1. Windswept Heating Oil — Friendsville, PA
 *     Small local operation (1 truck, est. 2019). Northern Susquehanna County PA
 *     + Greater Binghamton NY. Phone ordering 24/7. No published prices.
 *  2. Economy Heating (Rapp Petroleum Corp) — Port Crane, NY + New Milford, PA
 *     COD confirmed: "All customers are payment on delivery" — default payment.
 *     PA office operates as "Lindsey Oil" at 309 Main St, New Milford.
 *     Multi-county coverage: Broome/Tioga/Chemung/Chenango/Cortland/Delaware NY
 *     + Susquehanna/Bradford/Wayne PA.
 *
 * NOTE: Coverage (postal_codes_served) managed by scrape-config.json,
 * NOT by this migration (per migration 100 authority rule).
 */

const { v4: uuidv4 } = require('uuid');
const { upsertSupplier } = require('./lib/upsert-supplier');

module.exports = {
  name: '122-add-susquehanna-pa-suppliers',

  async up(sequelize) {
    // ============================================
    // 1. WINDSWEPT HEATING OIL — Friendsville, PA
    // Small local owner-operator (Mike Munda), est. 2019.
    // Northern Susquehanna County PA + Greater Binghamton NY.
    // Phone ordering 24/7, emergency delivery at no extra charge.
    // Prices NOT scrapable (call for quote).
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Windswept Heating Oil',
      slug: 'windswept-heating-oil',
      phone: '(607) 500-9276',
      email: 'mike@windswepthome.energy',
      website: 'https://www.windsweptheatingoil.com',
      addressLine1: '537 Ryan Road',
      city: 'Friendsville',
      state: 'PA',
      serviceCities: JSON.stringify([
        // PA — Northern Susquehanna County
        'Friendsville', 'Great Bend', 'Hallstead', 'Lanesboro',
        'Susquehanna', 'New Milford', 'Little Meadows', 'Gibson',
        'South Gibson', 'Montrose', 'South Montrose', 'Harford',
        'Jackson', 'Kingsley',
        // NY — Greater Binghamton
        'Binghamton', 'Vestal', 'Endicott', 'Johnson City',
        'Apalachin', 'Conklin', 'Kirkwood', 'Windsor',
        'Port Crane', 'Castle Creek', 'Chenango Bridge',
        'Chenango Forks', 'Corbettsville'
      ]),
      serviceCounties: JSON.stringify([
        'Susquehanna', 'Broome'
      ]),
      serviceAreaRadius: 25,
      lat: 41.9245,
      lng: -76.1680,
      hoursWeekday: null,
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'check', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil']),
      minimumGallons: null,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    });
    console.log('[Migration 122] Upserted Windswept Heating Oil (Friendsville, PA)');

    // ============================================
    // 2. ECONOMY HEATING (RAPP PETROLEUM CORP) — Port Crane, NY + New Milford, PA
    // COD confirmed: "All customers are payment on delivery unless they have
    // an approved credit application on file."
    // PA office at 309 Main St, New Milford (operates as "Lindsey Oil").
    // Multi-county: Broome/Tioga/Chemung/Chenango/Cortland/Delaware NY
    //   + Susquehanna/Bradford/Wayne PA.
    // 24/7 emergency service. Sat hours at NY office.
    // Prices NOT scrapable (not on site).
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Economy Heating',
      slug: 'economy-heating',
      phone: '(607) 648-6030',
      email: null,
      website: 'https://www.economyheatingny.com',
      addressLine1: '112 RT 369',
      city: 'Port Crane',
      state: 'NY',
      serviceCities: JSON.stringify([
        // NY — Broome County
        'Binghamton', 'Vestal', 'Endicott', 'Johnson City',
        'Conklin', 'Kirkwood', 'Windsor', 'Port Crane',
        'Harpursville', 'Deposit', 'Whitney Point', 'Lisle',
        'Maine', 'Castle Creek', 'Chenango Bridge', 'Chenango Forks',
        'Apalachin', 'Glen Aubrey', 'Nineveh',
        // NY — Tioga County
        'Owego', 'Newark Valley', 'Nichols', 'Candor',
        'Spencer', 'Waverly', 'Richford',
        // NY — Other
        'Afton', 'Bainbridge', 'Oxford', 'Greene',
        'Marathon', 'Hancock', 'Sidney',
        // PA — Susquehanna County
        'Montrose', 'New Milford', 'Hallstead', 'Great Bend',
        'Susquehanna', 'Hop Bottom', 'Kingsley', 'Nicholson',
        'Clifford', 'Friendsville', 'Gibson', 'Harford',
        'Springville', 'Lanesboro', 'Little Meadows',
        // PA — Bradford/Wayne edge
        'Le Raysville', 'Rome', 'Pleasant Mount'
      ]),
      serviceCounties: JSON.stringify([
        'Broome', 'Tioga', 'Chemung', 'Chenango', 'Cortland',
        'Delaware', 'Susquehanna', 'Bradford', 'Wayne'
      ]),
      serviceAreaRadius: 50,
      lat: 42.1792,
      lng: -75.8128,
      hoursWeekday: '7:30 AM - 5:00 PM',
      hoursSaturday: '8:00 AM - 5:00 PM',
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: true,
      paymentMethods: JSON.stringify(['cash', 'check', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil', 'propane', 'kerosene', 'diesel']),
      minimumGallons: null,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    });
    console.log('[Migration 122] Upserted Economy Heating (Port Crane, NY + New Milford, PA)');

    console.log('[Migration 122] ✅ Susquehanna PA area suppliers complete (2 directory-only)');
  },

  async down(sequelize) {
    const domains = [
      'windsweptheatingoil.com',
      'economyheatingny.com',
    ];
    for (const domain of domains) {
      await sequelize.query(`
        UPDATE suppliers SET active = false, updated_at = NOW()
        WHERE LOWER(REPLACE(REPLACE(website, 'https://', ''), 'http://', '')) LIKE $1
      `, { bind: [`%${domain}%`] });
    }
    console.log('[Migration 122] Rollback: Deactivated Susquehanna PA area suppliers');
  }
};
