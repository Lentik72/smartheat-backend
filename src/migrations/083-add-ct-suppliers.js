/**
 * Migration 083: Add 3 Connecticut Suppliers
 *
 * CT cross-reference — filling gaps in existing CT coverage.
 * All suppliers verified COD/will-call from their own websites.
 *
 * SCRAPABLE (2):
 *  1. Cashway Oil — Enfield, CT (CT arm of Vickers Oil, will-call explicit, tiered pricing)
 *     Prices on homepage + /order/ page. 150-299 gal tier = $3.74.
 *  2. Easy Oil LLC — Cheshire, CT (Wix SSR, Today's Price visible in static HTML)
 *     Family-owned, Central CT, 100 gal minimum.
 *
 * DIRECTORY-ONLY (1):
 *  3. Heating Oil Delivery LLC — Orange, CT (GoDaddy site, no price on site)
 *     Fairfield/New Haven County, "will match local competitors price".
 */

const { upsertSupplier } = require('./lib/upsert-supplier');

module.exports = {
  async up(sequelize) {
    // 1. CASHWAY OIL — Enfield, CT
    // COD confirmed: "if you prefer you may call us as you need us with our will call delivery"
    // CT arm of Vickers Oil (West Springfield MA). Separate brand, CT address, CT phone.
    // Delivers: #2 Heating Oil, Kerosene, Diesel & Off Road Diesel
    // 24-hour emergency service, same-day delivery available.
    await upsertSupplier(sequelize, {
      name: 'Cashway Oil',
      slug: 'cashway-oil',
      phone: '(860) 745-0133',
      email: null,
      website: 'https://cashwayoilct.com',
      addressLine1: '30 Grove Rd',
      city: 'Enfield',
      state: 'CT',
      postalCodesServed: JSON.stringify([
        '06002','06016','06026','06029','06033','06035',
        '06040','06042','06066','06067','06070','06071',
        '06073','06074','06076','06078','06082','06088',
        '06089','06093','06095','06096',
        '06105','06106','06107','06108','06109','06110',
        '06112','06114','06117','06118','06119'
      ]),
      serviceCities: JSON.stringify([
        'East Granby','East Windsor','Ellington','Enfield','Granby',
        'Somers','South Windsor','Stafford','Suffield','Windsor',
        'Windsor Locks','Simsbury','Bloomfield','Vernon','West Hartford',
        'Hartford','East Hartford','Manchester','Wethersfield',
        'Rocky Hill','Glastonbury','Rockville','Broadbrook'
      ]),
      serviceCounties: JSON.stringify(['Hartford','Tolland']),
      serviceAreaRadius: 30,
      lat: 41.987,
      lng: -72.592,
      hoursWeekday: '8:00 AM - 5:00 PM',
      hoursSaturday: '8:00 AM - 2:00 PM',
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: true,
      paymentMethods: JSON.stringify(['credit_card','cash','check']),
      fuelTypes: JSON.stringify(['heating_oil','kerosene','diesel']),
      minimumGallons: 100,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true
    });
    console.log('[Migration 083] Upserted Cashway Oil (Enfield, CT)');

    // 2. EASY OIL LLC — Cheshire, CT
    // COD confirmed: entire business model is order-when-you-need delivery.
    // About page: "call us" → "we deliver" process. No contracts mentioned.
    // Wix SSR site — price visible in static HTML: "Today's Price $3.59"
    // HOD: 1263, USDOT: 490325
    // 100 gallon minimum per services page.
    // Winter: 7 days/week delivery. Spring/Summer/Fall: Mon-Fri.
    await upsertSupplier(sequelize, {
      name: 'Easy Oil LLC',
      slug: 'easy-oil-llc',
      phone: '(203) 272-7878',
      email: 'info@easyoilct.com',
      website: 'https://www.easyoilct.com',
      addressLine1: '1328 Peck Lane',
      city: 'Cheshire',
      state: 'CT',
      postalCodesServed: JSON.stringify([
        '06410','06422','06450','06451','06455','06457',
        '06471','06473','06489','06492',
        '06514','06517','06518','06524','06712'
      ]),
      serviceCities: JSON.stringify([
        'Bethany','Cheshire','Durham','Meriden','Middlefield',
        'Middletown','Hamden','North Haven','North Branford',
        'Prospect','Southington','Wallingford'
      ]),
      serviceCounties: JSON.stringify(['New Haven','Middlesex']),
      serviceAreaRadius: 20,
      lat: 41.498,
      lng: -72.903,
      hoursWeekday: '7:00 AM - 7:00 PM',
      hoursSaturday: '7:00 AM - 7:00 PM',
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: true,
      paymentMethods: JSON.stringify(['credit_card','cash','check']),
      fuelTypes: JSON.stringify(['heating_oil']),
      minimumGallons: 100,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true
    });
    console.log('[Migration 083] Upserted Easy Oil LLC (Cheshire, CT)');

    // 3. HEATING OIL DELIVERY LLC — Orange, CT
    // Directory-only: no price on their own site.
    // "Will match local competitors price" — suggests COD/competitive market.
    // Serves Fairfield + southern New Haven County coastal towns.
    await upsertSupplier(sequelize, {
      name: 'Heating Oil Delivery LLC',
      slug: 'heating-oil-delivery-llc',
      phone: '(203) 772-9649',
      email: null,
      website: 'https://ctheatingoild.com',
      addressLine1: '332 West River Rd',
      city: 'Orange',
      state: 'CT',
      postalCodesServed: JSON.stringify([
        '06401','06418','06460','06461','06477','06484','06525',
        '06604','06605','06606','06607','06608','06610',
        '06611','06614','06615','06824','06825','06880'
      ]),
      serviceCities: JSON.stringify([
        'Ansonia','Derby','Milford','Orange','Woodbridge',
        'Bridgeport','Trumbull','Stratford','Fairfield','Shelton','Westport'
      ]),
      serviceCounties: JSON.stringify(['Fairfield','New Haven']),
      serviceAreaRadius: 20,
      lat: 41.278,
      lng: -73.026,
      hoursWeekday: '8:00 AM - 5:00 PM',
      hoursSaturday: '8:00 AM - 5:00 PM',
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: true,
      paymentMethods: JSON.stringify(['credit_card','cash','check']),
      fuelTypes: JSON.stringify(['heating_oil']),
      minimumGallons: null,
      seniorDiscount: false,
      allowPriceDisplay: false,
      notes: null,
      active: true
    });
    console.log('[Migration 083] Upserted Heating Oil Delivery LLC (Orange, CT)');

    console.log('[Migration 083] CT suppliers migration complete — 2 scrapable + 1 directory');
  },

  async down(sequelize) {
    const slugs = ['cashway-oil', 'easy-oil-llc', 'heating-oil-delivery-llc'];
    for (const slug of slugs) {
      await sequelize.query('DELETE FROM suppliers WHERE slug = $1', { bind: [slug] });
    }
    console.log('[Migration 083] Rolled back CT suppliers');
  }
};
