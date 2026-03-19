/**
 * Migration 121: Add 2 Nashua NH Area Suppliers
 *
 * Coverage gap fix for ZIP 03064 (Nashua, NH) — only 2 suppliers prior.
 * Also adds Manchester NH coverage via Absco.
 *
 * SCRAPABLE (2):
 *  1. Shattuck Oil Co — Pepperell, MA → NH
 *     COD confirmed: "Today's cash price" on homepage. Since 1927.
 *     Cross-border MA/NH delivery (18 NH towns + 27 MA towns).
 *     Price in static HTML: $4.799 in <b> tag.
 *  2. Absco Heating & Home Service — Manchester, NH
 *     COD confirmed: "All deliveries are COD (Cash on Delivery) or prepay."
 *     Price on /oil-delivery page: $5.299 "Today's Cash Oil Price".
 *     Since 1969, family-owned. Day-specific delivery routes.
 *
 * NOTE: Coverage (postal_codes_served) managed by scrape-config.json,
 * NOT by this migration (per migration 100 authority rule).
 */

const { v4: uuidv4 } = require('uuid');
const { upsertSupplier } = require('./lib/upsert-supplier');

module.exports = {
  name: '121-add-nashua-nh-suppliers',

  async up(sequelize) {
    // ============================================
    // 1. SHATTUCK OIL CO — Pepperell, MA → NH
    // COD confirmed: "Today's cash price" on homepage. Since 1927.
    // 5th generation family business. 603 area code NH phone line.
    // Price in <b>$4.799</b> on homepage.
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Shattuck Oil Co',
      slug: 'shattuck-oil-co',
      phone: '(978) 433-6701',
      email: null,
      website: 'https://shattuckoil.com',
      addressLine1: '16 Groton Street',
      city: 'Pepperell',
      state: 'MA',
      serviceCities: JSON.stringify([
        // NH
        'Amherst', 'Bedford', 'Brookline', 'Derry', 'Greenville',
        'Hollis', 'Hudson', 'Litchfield', 'Londonderry', 'Lyndeborough',
        'Merrimack', 'Milford', 'Mont Vernon', 'Nashua',
        'New Ipswich', 'Pelham', 'Wilton', 'Windham',
        // MA
        'Ashby', 'Ayer', 'Billerica', 'Carlisle', 'Chelmsford',
        'Concord', 'Dracut', 'Dunstable', 'Fitchburg', 'Groton',
        'Harvard', 'Lancaster', 'Leominster', 'Littleton', 'Lowell',
        'Lunenburg', 'Maynard', 'Pepperell', 'Shirley', 'Stow',
        'Sudbury', 'Tewksbury', 'Townsend', 'Tyngsborough', 'Westford',
        'Westminster'
      ]),
      serviceCounties: JSON.stringify([
        'Hillsborough', 'Middlesex', 'Worcester'
      ]),
      serviceAreaRadius: 30,
      lat: 42.6633,
      lng: -71.5886,
      hoursWeekday: '8:00 AM - 5:00 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'check', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil', 'diesel']),
      minimumGallons: 150,
      seniorDiscount: true,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });
    console.log('[Migration 121] Upserted Shattuck Oil Co (Pepperell, MA → NH)');

    // ============================================
    // 2. ABSCO HEATING & HOME SERVICE — Manchester, NH
    // COD confirmed: "All deliveries are COD (Cash on Delivery) or prepay."
    // Since 1969, family-owned. Day-specific delivery routes (Mon-Fri by town).
    // Price on /oil-delivery page: "Today's Cash Oil Price" $5.299
    // 100 gal min Manchester, 150 gal surrounding towns.
    // ============================================
    await upsertSupplier(sequelize, {
      id: uuidv4(),
      name: 'Absco Heating & Home Service',
      slug: 'absco-heating-home-service',
      phone: '(603) 669-4827',
      email: 'info@abscoheating.com',
      website: 'https://www.abscoheating.com',
      addressLine1: '421 Harvard St',
      city: 'Manchester',
      state: 'NH',
      serviceCities: JSON.stringify([
        // COD delivery towns
        'Manchester', 'Bedford', 'Merrimack', 'Litchfield',
        'Londonderry', 'Derry', 'Chester', 'Auburn', 'Candia',
        'Hooksett', 'Goffstown',
        // Automatic delivery only towns
        'Amherst', 'Raymond', 'Deerfield', 'Allenstown',
        'Pembroke', 'New Boston', 'Weare'
      ]),
      serviceCounties: JSON.stringify([
        'Hillsborough', 'Rockingham', 'Merrimack'
      ]),
      serviceAreaRadius: 20,
      lat: 42.9937,
      lng: -71.4483,
      hoursWeekday: '8:00 AM - 5:00 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'credit_card', 'debit_card', 'check']),
      fuelTypes: JSON.stringify(['heating_oil']),
      minimumGallons: 100,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });
    console.log('[Migration 121] Upserted Absco Heating & Home Service (Manchester, NH)');

    console.log('[Migration 121] ✅ Nashua NH area suppliers complete (2 scrapable)');
  },

  async down(sequelize) {
    const domains = [
      'shattuckoil.com',
      'abscoheating.com',
    ];
    for (const domain of domains) {
      await sequelize.query(`
        UPDATE suppliers SET active = false, updated_at = NOW()
        WHERE LOWER(REPLACE(REPLACE(website, 'https://', ''), 'http://', '')) LIKE $1
      `, { bind: [`%${domain}%`] });
    }
    console.log('[Migration 121] Rollback: Deactivated Nashua NH area suppliers');
  }
};
