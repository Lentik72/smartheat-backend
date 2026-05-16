/**
 * Migration 169: fix mig 168 serviceCities under-coverage
 *
 * Migration 168 added Shaffer Oil and S.J. Johnson but their serviceCities
 * arrays were under-populated relative to their stated coverage:
 *   - Shaffer Oil: shipped with 18 cities, true county-level expansion is 65
 *     (missing Wellersburg, West Salisbury — the actual research-target town —
 *     plus 45 other Somerset/Cambria County towns)
 *   - S.J. Johnson: shipped with 20 cities, true coverage is 43 (40 explicit
 *     ZIP-tied towns + 3 supplier-published names that map to alternate zip-db
 *     names: Indian Head/Marbury/Chaptico vs zip-db Pisgah/Rison/Maddox)
 *
 * serviceCities is not cosmetic. It drives:
 *   - supplierMatcher.js Priority-2 city match (80 points). A Wellersburg user
 *     whose location resolves by city name (not ZIP) would miss the city match
 *     for Shaffer and degrade to lower-tier match.
 *   - generate-supplier-pages.js — towns listed on the public profile page.
 *   - generate-bundled-suppliers.js — bundled iOS app supplier directory.
 *
 * Re-upserts both suppliers with full serviceCities lists. All other fields
 * identical to mig 168 — upsert-supplier matches by website domain so this
 * updates the existing rows in place. ScrapeConfigSync continues to manage
 * postal_codes_served (unchanged).
 *
 * Sibling-audit note: similar drift may exist in other migrations
 *  (suppliers added with a short representative cities list vs. full footprint).
 *  Not in scope here — separate audit bead to file after this lands.
 */

const { upsertSupplier } = require('./lib/upsert-supplier');

module.exports = {
  name: '169-fix-mig168-service-cities',

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
        'Acosta', 'Addison', 'Ashville', 'Barnesboro', 'Berlin', 'Blandburg',
        'Boswell', 'Boynton', 'Cairnbrook', 'Carrolltown', 'Cassandra',
        'Central City', 'Chest Springs', 'Colver', 'Cresson', 'Davidsville',
        'Dunlo', 'Dysart', 'Ebensburg', 'Elton', 'Fallentimber', 'Flinton',
        'Fort Hill', 'Friedens', 'Gallitzin', 'Garrett', 'Glencoe', 'Gray',
        'Hastings', 'Hollsopple', 'Hooversville', 'Jenners', 'Jennerstown',
        'Jerome', 'Johnstown', 'Lilly', 'Listonburg', 'Loretto', 'Markleton',
        'Marsteller', 'Meyersdale', 'Mineral Point', 'Nanty Glo',
        'New Baltimore', 'Nicktown', 'Patton', 'Puritan', 'Revloc', 'Rockwood',
        'Saint Benedict', 'Salisbury', 'Salix', 'Shanksville', 'Sidman',
        'Sipesville', 'Somerset', 'South Fork', 'Spangler', 'Springs',
        'Stoystown', 'Summerhill', 'Ursina', 'Wellersburg', 'West Salisbury',
        'Windber',
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

    console.log('[Migration 169] ✅ Backfilled Shaffer Oil serviceCities (18 → 65)');

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
        'Abell', 'Avenue', 'Barstow', 'Bel Alton', 'Benedict', 'Broomes Island',
        'Bryans Road', 'Bryantown', 'Bushwood', 'California', 'Callaway',
        'Chaptico', 'Charlotte Hall', 'Chesapeake Beach', 'Clements',
        'Cobb Island', 'Coltons Point', 'Compton', 'Dameron', 'Dowell',
        'Drayden', 'Dunkirk', 'Faulkner', 'Great Mills', 'Helen', 'Hughesville',
        'Huntingtown', 'Indian Head', 'Ironsides', 'Issue', 'La Plata', 'Lusby',
        'Maddox', 'Marbury', 'Mount Victoria', 'North Beach', 'Owings',
        'Pisgah', 'Port Republic', 'Prince Frederick', 'Rison', 'Saint Leonard',
        'Solomons',
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

    console.log('[Migration 169] ✅ Backfilled S.J. Johnson serviceCities (20 → 43)');
  },

  async down(sequelize) {
    // No-op: serviceCities backfill is non-destructive — leave the longer
    // lists in place even on rollback (mig 168 itself stays).
    console.log('[Migration 169] No rollback (additive serviceCities backfill)');
  },
};
