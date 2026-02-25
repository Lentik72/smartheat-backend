/**
 * Migration 076: Add Full Data for ME/CT Suppliers with Auto-Created Records
 *
 * 1. Brunelli Energy — Bozrah, CT (New London/Windham County COD dealer)
 * 2. Ace Oil Maine — Saco, ME (Southern Maine will-call dealer)
 * 3. Desrochers Oil — Biddeford, ME (York County will-call dealer, est. 1960)
 *
 * All three exist in scrape-config.json and have prices being scraped,
 * but lack proper database records with ZIP coverage, contact info, etc.
 * ScrapeConfigSync may have auto-created minimal records, or migration 071
 * tried to UPDATE them (which has no effect if the record doesn't exist).
 *
 * Research verified:
 * - Brunelli: HeatFleet lists "On Demand" + cash; Wix site unreadable but
 *   aggregator evidence is strong. COD/will-call borderline — listed anyway
 *   since they are already enabled in scrape-config.
 * - Ace Oil Maine: Will-call confirmed from own website contact form.
 *   Displays cash prices on homepage. (207) 283-0576.
 * - Desrochers Oil: Will-call confirmed from own /heating-oil-delivery/ page.
 *   Displays cash prices on homepage. Est. 1960, 3rd generation. (207) 282-6789.
 */

const { v4: uuidv4 } = require('uuid');
const { upsertSupplier } = require('./lib/upsert-supplier');

module.exports = {
  name: '076-add-me-ct-incomplete-suppliers',

  async up(sequelize) {
    // ============================================
    // 1. BRUNELLI ENERGY — Bozrah, CT
    // New London/Windham County. HeatFleet: "On Demand" + cash.
    // Wix site — not scrapable but scrape-config has a regex that works
    // on Wix SSR. Already enabled in scrape-config, allowPriceDisplay=true.
    // ============================================
    const brunelliData = {
      id: uuidv4(),
      name: 'Brunelli Energy',
      slug: 'brunelli-energy',
      phone: '(860) 889-4442',
      email: 'info@brunellienergy.com',
      website: 'https://brunellienergy.com',
      addressLine1: '2 Rachel Drive',
      city: 'Bozrah',
      state: 'CT',
      postalCodesServed: JSON.stringify([
        '06226', '06231', '06232', '06235', '06237', '06247', '06248',
        '06249', '06250', '06254', '06256', '06259', '06264', '06266',
        '06268', '06320', '06330', '06331', '06332', '06333', '06334',
        '06335', '06336', '06338', '06339', '06340', '06350', '06351',
        '06354', '06355', '06359', '06360', '06365', '06370', '06372',
        '06374', '06375', '06378', '06382', '06383', '06384', '06385',
        '06389', '06415', '06420', '06423', '06469'
      ]),
      serviceCities: JSON.stringify([
        'Bozrah', 'Norwich', 'New London', 'Groton', 'Mystic', 'Ledyard',
        'Montville', 'Waterford', 'East Lyme', 'Colchester', 'Salem',
        'Lebanon', 'Willimantic', 'Windham', 'Columbia', 'Hebron',
        'Andover', 'Chaplin', 'Hampton', 'Scotland', 'Canterbury',
        'Plainfield', 'Jewett City', 'Preston', 'Stonington',
        'North Stonington', 'Voluntown', 'Baltic', 'Gales Ferry',
        'Uncasville', 'Storrs', 'Mansfield Center', 'East Haddam', 'Moodus'
      ]),
      serviceCounties: JSON.stringify(['New London', 'Windham', 'Tolland', 'Middlesex']),
      serviceAreaRadius: 30,
      lat: 41.5432,
      lng: -72.1715,
      hoursWeekday: '8:00 AM - 4:00 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil']),
      minimumGallons: 125,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    };

    await upsertSupplier(sequelize, brunelliData);
    console.log('[Migration 076] Upserted Brunelli Energy (Bozrah, CT)');

    // ============================================
    // 2. ACE OIL MAINE — Saco, ME
    // Will-call confirmed from own site contact form.
    // Displays "TODAY'S CASH PRICES" on homepage. Scraper enabled.
    // Note: This is "Ace Oil and Burner Services LLC" (Saco),
    // NOT "Ace Oil Corp" (Scarborough) — different entities.
    // ============================================
    const aceData = {
      id: uuidv4(),
      name: 'Ace Oil Maine',
      slug: 'ace-oil-maine',
      phone: '(207) 283-0576',
      email: 'aceoilburnerservice@yahoo.com',
      website: 'https://aceoilmaine.com',
      addressLine1: '11 Fenderson Road',
      city: 'Saco',
      state: 'ME',
      postalCodesServed: JSON.stringify([
        '04002', '04005', '04009', '04011', '04014', '04021', '04030',
        '04032', '04038', '04039', '04042', '04043', '04046', '04048',
        '04049', '04054', '04055', '04061', '04062', '04064', '04069',
        '04071', '04072', '04073', '04074', '04076', '04078', '04079',
        '04083', '04084', '04085', '04087', '04088', '04090', '04092',
        '04093', '04095', '04096', '04097', '04101', '04102', '04103',
        '04105', '04106', '04107', '04110', '04260'
      ]),
      serviceCities: JSON.stringify([
        'Saco', 'Biddeford', 'Old Orchard Beach', 'Scarborough',
        'South Portland', 'Portland', 'Westbrook', 'Gorham',
        'Cumberland', 'Yarmouth', 'North Yarmouth', 'Cape Elizabeth',
        'Falmouth', 'Freeport', 'Standish', 'Buxton', 'Sanford',
        'Windham', 'Gray', 'New Gloucester', 'Waterboro',
        'Kennebunk', 'Kennebunkport', 'Wells', 'Alfred',
        'Hollis Center', 'Limerick', 'Limington', 'Raymond',
        'Casco', 'Naples', 'Shapleigh', 'Pownal'
      ]),
      serviceCounties: JSON.stringify(['York', 'Cumberland']),
      serviceAreaRadius: 35,
      lat: 43.5009,
      lng: -70.4428,
      hoursWeekday: null,
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['cash', 'check', 'credit_card']),
      fuelTypes: JSON.stringify(['heating_oil', 'kerosene']),
      minimumGallons: 150,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    };

    await upsertSupplier(sequelize, aceData);
    console.log('[Migration 076] Upserted Ace Oil Maine (Saco, ME)');

    // ============================================
    // 3. DESROCHERS OIL — Biddeford, ME
    // Will-call confirmed from own /heating-oil-delivery/ page.
    // Est. 1960, 3rd generation (Shawn Desrochers). Displays cash prices.
    // Online ordering accepts credit cards. LIHEAP accepted.
    // ============================================
    const desrochersData = {
      id: uuidv4(),
      name: 'Desrochers Oil',
      slug: 'desrochers-oil',
      phone: '(207) 282-6789',
      email: 'desrochersoil@outlook.com',
      website: 'https://desrochersoil.com',
      addressLine1: '18 Barra Road',
      city: 'Biddeford',
      state: 'ME',
      postalCodesServed: JSON.stringify([
        '04002', '04005', '04011', '04014', '04030', '04038', '04042',
        '04043', '04046', '04054', '04062', '04064', '04072', '04073',
        '04074', '04078', '04088', '04090', '04092', '04093', '04095',
        '04101', '04102', '04103', '04106'
      ]),
      serviceCities: JSON.stringify([
        'Biddeford', 'Saco', 'Old Orchard Beach', 'Scarborough',
        'South Portland', 'Portland', 'Westbrook', 'Gorham',
        'Cape Elizabeth', 'Kennebunk', 'Kennebunkport', 'Wells',
        'Arundel', 'Dayton', 'Hollis Center', 'Buxton', 'Lyman',
        'Alfred', 'Waterboro', 'Sanford', 'West Kennebunk', 'Moody'
      ]),
      serviceCounties: JSON.stringify(['York', 'Cumberland']),
      serviceAreaRadius: 25,
      lat: 43.4926,
      lng: -70.4531,
      hoursWeekday: '9:00 AM - 4:30 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['credit_card', 'check']),
      fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'diesel']),
      minimumGallons: 100,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    };

    await upsertSupplier(sequelize, desrochersData);
    console.log('[Migration 076] Upserted Desrochers Oil (Biddeford, ME)');

    console.log('[Migration 076] ✅ ME/CT incomplete supplier records updated');
  },

  async down(sequelize) {
    // Deactivate the three suppliers (don't delete — preserve audit trail)
    const domains = ['brunellienergy.com', 'aceoilmaine.com', 'desrochersoil.com'];
    for (const domain of domains) {
      await sequelize.query(`
        UPDATE suppliers SET active = false, updated_at = NOW()
        WHERE LOWER(REPLACE(REPLACE(website, 'https://', ''), 'http://', '')) LIKE $1
      `, { bind: [`%${domain}%`] });
    }
    console.log('[Migration 076] Rollback: Deactivated Brunelli, Ace Oil Maine, Desrochers Oil');
  }
};
