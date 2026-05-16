/**
 * Migration 168: PA + MD supplier batch — 2 new suppliers
 *
 * Triggered by Wellersburg PA 15564 coverage-gap research (Somerset County, southern
 * tip of PA at the MD border). Research surfaced one local will-call candidate
 * (Shaffer Oil) plus three regional COD suppliers in the broader mid-Atlantic.
 * Two of those (Best Price Oil, Tevis Energy) turned out to already be in
 * production (migrations 031 and 016), so this batch only adds the two missing:
 * Shaffer Oil and S.J. Johnson.
 *
 * Companion changes in this commit:
 * - scrape-config.json: 2 new entries (shafferoil.com disabled "pattern: none",
 *   sjjohnson.com enabled "direct" with anchored price regex)
 * - zip-database.json: 8 new ZIPs (3 PA Wellersburg-area + 5 MD SJ Johnson hamlets)
 *
 * Existing-supplier coverage notes (not changed in this commit, documented for follow-up):
 * - Best Price Oil (bestpriceoilco.com, migration 031): currently 44 ZIPs. Their
 *   stated footprint per their service-area page is Cumberland/Dauphin/Perry/
 *   Northern York counties + Palmyra (17078) + Elizabethtown (17022). Full county
 *   expansion would be ~69 ZIPs (+25). scrape-config priceRegex is also currently
 *   the loose form `\\$([0-9]+\\.[0-9]{2,3})`; the anchored form
 *   `Today's Price[^$]*?\\$([0-9]+\\.[0-9]{2,3})` resolves cleanly to $4.799 on
 *   their homepage.
 * - Tevis Energy (tevisenergy.com, migrations 016 + 089 backfill): currently
 *   123 ZIPs including Baltimore City (which our proposed full-footprint list
 *   omits). Per Carroll County Chamber + their own /heating-oil/will-call-oil-delivery/
 *   page, full footprint is Adams/Franklin/Fulton/York PA + Baltimore/Carroll/
 *   Harford/Howard MD (~179 ZIPs without Frederick, which they only partially
 *   cover). Existing coverage is reasonable; expanding to full footprint is a
 *   sibling task left for a separate batch.
 *
 * 1. Shaffer Oil Co. (shafferoil.com, Windber & Somerset PA)
 *    HQ: 659 Berlin Plank Rd, Somerset PA 15501 + Windber PA 15963 / (814) 443-2615
 *    Service: Cambria + Somerset counties PA (full county footprint stated)
 *    COD qualification: heating-oil page states "When you need automatic delivery
 *    or will-call delivery, choose Shaffer Oil" — explicit will-call language.
 *    No public pricing — allowPriceDisplay=false, scrape-config disabled
 *    (pattern: none). 4th-generation family-owned, since 1934.
 *    Fuels: heating oil, kerosene, diesel, gasoline.
 *    ZIP 15564 (Wellersburg) is at the southern tip of their Somerset County
 *    footprint — ~25mi from the Somerset office. Stated county-level coverage
 *    is the source.
 *
 * 2. S.J. Johnson Inc. (sjjohnson.com, Huntingtown MD)
 *    HQ: 4900 Hunting Creek Rd, Huntingtown MD 20639 / (410) 257-2515
 *    Service: Calvert, Charles, St. Mary's counties MD (40 explicit ZIPs from
 *    their southern-md-fuel-oil-delivery-areas page). Also lists Anne Arundel
 *    and Prince George's "and more throughout Maryland" but those counties have
 *    no explicit ZIP list, so omitted per Section 5C.
 *    COD qualification: explicit "NO CONTRACT REQUIRED to buy fuel from us!"
 *    + "Will call : Call us as you need it" + "Cash on Delivery (COD) accounts
 *    available or welcomed!" — gold-standard first-party language.
 *    Public price scrapable: $4.699 visible in static HTML at /fuel-oil.
 *    Fuels: heating oil + propane + non-ethanol/regular gas + on/off-road diesel.
 *    allowPriceDisplay=true, scrape-config enabled "direct" pattern.
 *    Note: 5 of the 40 stated ZIPs were missing from zip-database.json prior to
 *    this commit (20610 Barstow, 20627 Compton, 20635 Helen, 20643 Ironsides,
 *    20661 Mount Victoria) and were added in the same commit.
 *
 * Rejected candidates from same research (documented for future re-evaluation):
 * - Luther P. Miller (Somerset PA) — automatic/budget program language only;
 *   order form accepts cash but no explicit COD/will-call. → escalate / future.
 * - Willison Oil (Cumberland MD) — third-party COD claim only (HeatFleet); own
 *   site has "Get a Quote / Competitive pricing" only. → escalate.
 * - Davidsville Fuel — domain parked, no first-party web presence. → reject
 *   (no-web-presence, would need phone confirmation).
 * - Cumberland Petroleum — cumberlandpetroleum.com DNS unresolvable across
 *   multiple retries. → reject (no-web-presence per Section 7A).
 * - Bedford Valley Petroleum — "Automatic Fuel Delivery / Budget Fuel Plan /
 *   GET A QUOTE", no COD evidence. New ownership noted on site; revisit Q4 2026.
 *   → _future_contract_oil (handled in scrape-config, not migration).
 */

const { upsertSupplier } = require('./lib/upsert-supplier');

module.exports = {
  name: '168-add-pa-md-suppliers-batch',

  async up(sequelize) {
    await upsertSupplier(sequelize, {
      name: 'Shaffer Oil Co.',
      slug: 'shaffer-oil',
      phone: '(814) 443-2615',
      email: null,
      website: 'https://shafferoil.com',
      addressLine1: '659 Berlin Plank Road',
      city: 'Somerset',
      state: 'PA',
      serviceCities: JSON.stringify([
        'Somerset', 'Windber', 'Johnstown', 'Davidsville', 'Boswell',
        'Berlin', 'Meyersdale', 'Salisbury', 'Rockwood', 'Friedens',
        'Stoystown', 'Hooversville', 'Central City', 'Cairnbrook',
        'Jennerstown', 'Jerome', 'Hollsopple', 'Sipesville',
      ]),
      serviceCounties: JSON.stringify(['Somerset', 'Cambria']),
      serviceAreaRadius: 35,
      lat: 40.0098,
      lng: -79.0780,
      hoursWeekday: '8:00 AM - 4:30 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: false,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
      fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'diesel', 'gasoline']),
      minimumGallons: 100,
      seniorDiscount: true,
      allowPriceDisplay: false,
      notes: null,
      active: true,
    });

    console.log('[Migration 168] ✅ Added Shaffer Oil Co. (Somerset/Windber PA — will-call, no scrape)');

    await upsertSupplier(sequelize, {
      name: 'S.J. Johnson Inc.',
      slug: 'sj-johnson',
      phone: '(410) 257-2515',
      email: null,
      website: 'https://www.sjjohnson.com',
      addressLine1: '4900 Hunting Creek Road',
      city: 'Huntingtown',
      state: 'MD',
      serviceCities: JSON.stringify([
        'Huntingtown', 'Prince Frederick', 'Solomons', 'Lusby', 'Saint Leonard',
        'Chesapeake Beach', 'North Beach', 'Owings', 'Dunkirk', 'Port Republic',
        'La Plata', 'Indian Head', 'Hughesville', 'Bryans Road', 'Bel Alton',
        'Leonardtown', 'Mechanicsville', 'California', 'Great Mills', 'Charlotte Hall',
      ]),
      serviceCounties: JSON.stringify(['Calvert', 'Charles', 'St. Marys']),
      serviceAreaRadius: 50,
      lat: 38.5194,
      lng: -76.6043,
      hoursWeekday: '8:00 AM - 5:00 PM',
      hoursSaturday: null,
      hoursSunday: null,
      emergencyDelivery: true,
      weekendDelivery: false,
      paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
      fuelTypes: JSON.stringify(['heating_oil', 'propane', 'diesel', 'gasoline']),
      minimumGallons: 100,
      seniorDiscount: false,
      allowPriceDisplay: true,
      notes: null,
      active: true,
    });

    console.log('[Migration 168] ✅ Added S.J. Johnson (Huntingtown MD — COD/will-call, scrapable $4.699)');
  },

  async down(sequelize) {
    await sequelize.query(`
      DELETE FROM suppliers WHERE slug IN ('shaffer-oil', 'sj-johnson')
    `);
    console.log('[Migration 168] Rolled back PA + MD supplier batch');
  },
};
