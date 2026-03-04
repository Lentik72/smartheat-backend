/**
 * Migration 092: Add Northern Virginia suppliers for Loudoun/Fairfax coverage gap
 *
 * Coverage gap fix: ZIPs 20147 (Ashburn) and 22182 (Vienna) had ZERO suppliers.
 *
 * New suppliers added:
 *   - Valley Energy (Purcellville, VA) — Loudoun/Clarke/Warren/Fairfax/Fauquier/Frederick/Prince William.
 *     Will-call confirmed. No scrapable prices.
 *   - Holtzman Oil (Leesburg, VA) — Loudoun/Fairfax (NoVA location only).
 *     Will-call confirmed (150 gal min). No scrapable prices.
 *   - Capitol Discount Fuel (Fairfax, VA) — 16-county DC metro area.
 *     Will-call confirmed via FuelWonk. No scrapable prices.
 *   - Moore Fuel (Warrenton, VA) — Fauquier/Prince William/Culpeper only.
 *     Explicit COD on website. No scrapable prices.
 *   - Griffith Energy Services (Fairfax, VA) — NoVA + Shenandoah Valley, 14 locations.
 *     COD page confirmed. No scrapable prices.
 *
 * Sources: valleyenergy.org, holtzmanoil.com, capitoldiscountfuel.com, moorefuel.com, griffithenergy.com
 */

const { upsertSupplier } = require('./lib/upsert-supplier');

module.exports = {
  name: '092-add-northern-virginia-suppliers',

  async up(sequelize) {
    const suppliers = [
      {
        name: 'Valley Energy',
        slug: 'valley-energy',
        phone: '(540) 338-6457',
        email: null,
        website: 'https://valleyenergy.org',
        addressLine1: '117 N Bailey Ln',
        city: 'Purcellville',
        state: 'VA',
        postalCodesServed: JSON.stringify([
          // Loudoun County (core — HQ here)
          '20105', // Aldie
          '20117', // Middleburg
          '20118', // Middleburg
          '20129', // Paeonian Springs
          '20132', // Purcellville (HQ)
          '20134', // Bluemont
          '20135', // Bluemont
          '20141', // Round Hill
          '20147', // Ashburn
          '20148', // Ashburn
          '20152', // Chantilly
          '20158', // Hamilton
          '20164', // Sterling
          '20165', // Sterling
          '20166', // Sterling
          '20175', // Leesburg
          '20176', // Leesburg
          '20101', // Dulles
          '20102', // Dulles
          '20103', // Dulles
          '20104', // Dulles
          // Fairfax County (partial — satellite facility)
          '22066', // Great Falls
          '22101', // McLean
          '22102', // McLean
          '22124', // Oakton
          '22180', // Vienna
          '22181', // Vienna
          '22182', // Vienna
          // Clarke County
          '22611', // Berryville
          '22620', // Boyce
          '22663', // White Post
          // Warren County
          '22610', // Bentonville
          '22630', // Front Royal
          '22642', // Linden
          // Fauquier County
          '20106', // Amissville
          '20115', // Marshall
          '20116', // Marshall
          '20140', // Rectortown
          '20144', // Delaplane
          '20184', // Upperville
          '20185', // Upperville
          '20186', // Warrenton
          '20187', // Warrenton
          '20188', // Warrenton
          // Frederick County
          '22601', // Winchester
          '22602', // Winchester
          '22603', // Winchester
          '22624', // Clear Brook
          '22625', // Cross Junction
          '22637', // Gore
          '22645', // Middletown
          '22654', // Star Tannery
          '22655', // Stephens City
          '22656', // Stephenson
          // Prince William County (northern portion)
          '20136', // Bristow
          '20137', // Broad Run
          '20143', // Catharpin
          '20155', // Gainesville
          '20156', // Gainesville
          '20169', // Haymarket
        ]),
        serviceCities: JSON.stringify([
          'Purcellville', 'Leesburg', 'Ashburn', 'Sterling', 'Hamilton', 'Round Hill',
          'Bluemont', 'Middleburg', 'Aldie', 'Great Falls', 'McLean', 'Vienna', 'Oakton',
          'Berryville', 'Boyce', 'Front Royal', 'Winchester', 'Stephens City',
          'Marshall', 'Warrenton', 'Upperville', 'Delaplane',
          'Gainesville', 'Haymarket', 'Bristow',
        ]),
        serviceCounties: JSON.stringify([
          'Loudoun', 'Fairfax', 'Clarke', 'Warren', 'Fauquier', 'Frederick', 'Prince William',
        ]),
        serviceAreaRadius: 45,
        lat: 39.1368,
        lng: -77.7147,
        hoursWeekday: '8:00 AM - 5:00 PM',
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: false,
        weekendDelivery: false,
        paymentMethods: JSON.stringify(['cash', 'credit_card', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'propane']),
        minimumGallons: null,
        seniorDiscount: false,
        allowPriceDisplay: false,
        notes: null,
        active: true,
      },
      {
        name: 'Holtzman Oil',
        slug: 'holtzman-oil',
        phone: '(540) 477-3131',
        email: null,
        website: 'https://holtzmanoil.com',
        addressLine1: '148 Catoctin Cir SE Ste A',
        city: 'Leesburg',
        state: 'VA',
        postalCodesServed: JSON.stringify([
          // Loudoun County (core — Leesburg location)
          '20105', // Aldie
          '20117', // Middleburg
          '20118', // Middleburg
          '20129', // Paeonian Springs
          '20132', // Purcellville
          '20134', // Bluemont
          '20135', // Bluemont
          '20141', // Round Hill
          '20147', // Ashburn
          '20148', // Ashburn
          '20152', // Chantilly
          '20158', // Hamilton
          '20164', // Sterling
          '20165', // Sterling
          '20166', // Sterling
          '20175', // Leesburg (HQ)
          '20176', // Leesburg
          '20101', // Dulles
          '20102', // Dulles
          '20103', // Dulles
          '20104', // Dulles
          // Fairfax County (western portion reachable from Leesburg)
          '22066', // Great Falls
          '22101', // McLean
          '22102', // McLean
          '20120', // Centreville
          '20121', // Centreville
          '22124', // Oakton
          '22180', // Vienna
          '22181', // Vienna
          '22182', // Vienna
        ]),
        serviceCities: JSON.stringify([
          'Leesburg', 'Ashburn', 'Sterling', 'Purcellville', 'Hamilton', 'Round Hill',
          'Middleburg', 'Aldie', 'Great Falls', 'McLean', 'Centreville', 'Vienna', 'Oakton',
        ]),
        serviceCounties: JSON.stringify(['Loudoun', 'Fairfax']),
        serviceAreaRadius: 30,
        lat: 39.1079,
        lng: -77.5636,
        hoursWeekday: '8:00 AM - 5:00 PM',
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: false,
        weekendDelivery: false,
        paymentMethods: JSON.stringify(['cash', 'credit_card', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'diesel']),
        minimumGallons: 150,
        seniorDiscount: false,
        allowPriceDisplay: false,
        notes: null,
        active: true,
      },
      {
        name: 'Capitol Discount Fuel',
        slug: 'capitol-discount-fuel',
        phone: '(703) 978-6400',
        email: null,
        website: 'https://capitoldiscountfuel.com',
        addressLine1: '9600 Colonial Ave',
        city: 'Fairfax',
        state: 'VA',
        postalCodesServed: JSON.stringify([
          // Fairfax County (core — HQ here)
          '22003', // Annandale
          '22015', // Burke
          '20120', // Centreville
          '20121', // Centreville
          '20124', // Clifton
          '22030', // Fairfax (HQ)
          '22031', // Fairfax
          '22032', // Fairfax
          '22033', // Fairfax
          '22034', // Fairfax
          '22035', // Fairfax
          '22039', // Fairfax Station
          '22041', // Falls Church
          '22042', // Falls Church
          '22043', // Falls Church
          '22044', // Falls Church
          '22060', // Fort Belvoir
          '22066', // Great Falls
          '22079', // Lorton
          '22101', // McLean
          '22102', // McLean
          '22124', // Oakton
          '22150', // Springfield
          '22151', // Springfield
          '22152', // Springfield
          '22153', // Springfield
          '22180', // Vienna
          '22181', // Vienna
          '22182', // Vienna
          '22303', // Alexandria (Fairfax Co)
          '22306', // Alexandria (Fairfax Co)
          '22307', // Alexandria (Fairfax Co)
          '22308', // Alexandria (Fairfax Co)
          '22309', // Alexandria (Fairfax Co)
          '22310', // Alexandria (Fairfax Co)
          '22312', // Alexandria (Fairfax Co)
          '22315', // Alexandria (Fairfax Co)
          // Loudoun County
          '20105', // Aldie
          '20147', // Ashburn
          '20148', // Ashburn
          '20152', // Chantilly
          '20164', // Sterling
          '20165', // Sterling
          '20166', // Sterling
          '20175', // Leesburg
          '20176', // Leesburg
          // Prince William County
          '20136', // Bristow
          '20137', // Broad Run
          '20143', // Catharpin
          '20155', // Gainesville
          '20156', // Gainesville
          '20169', // Haymarket
          '20181', // Nokesville
          '22025', // Dumfries
          '22026', // Dumfries
          '20108', // Manassas
          '20109', // Manassas
          '20110', // Manassas
          '20111', // Manassas
          '20112', // Manassas
          '22191', // Woodbridge
          '22192', // Woodbridge
          '22193', // Woodbridge
          '22194', // Woodbridge
          '22195', // Woodbridge
          // Fauquier County
          '20186', // Warrenton
          '20187', // Warrenton
          '20188', // Warrenton
          '22712', // Bealeton
          '20119', // Catlett
          '20138', // Calverton
          // Arlington County
          '22201', // Arlington
          '22202', // Arlington
          '22203', // Arlington
          '22204', // Arlington
          '22205', // Arlington
          '22206', // Arlington
          '22207', // Arlington
          '22209', // Arlington
          '22211', // Fort Myer
          // Alexandria (independent city)
          '22301', // Alexandria
          '22302', // Alexandria
          '22304', // Alexandria
          '22305', // Alexandria
          '22311', // Alexandria
          '22314', // Alexandria
          // Falls Church (independent city)
          '22046', // Falls Church
          // Stafford County
          '22554', // Stafford
          '22555', // Stafford
          '22556', // Stafford
        ]),
        serviceCities: JSON.stringify([
          'Fairfax', 'Vienna', 'McLean', 'Great Falls', 'Oakton', 'Burke', 'Springfield',
          'Annandale', 'Falls Church', 'Centreville', 'Clifton', 'Lorton', 'Fort Belvoir',
          'Arlington', 'Alexandria', 'Ashburn', 'Sterling', 'Leesburg', 'Chantilly',
          'Manassas', 'Woodbridge', 'Dumfries', 'Gainesville', 'Haymarket', 'Bristow',
          'Warrenton', 'Bealeton', 'Stafford',
        ]),
        serviceCounties: JSON.stringify([
          'Fairfax', 'Loudoun', 'Prince William', 'Fauquier',
          'Arlington', 'Stafford',
        ]),
        serviceAreaRadius: 40,
        lat: 38.8530,
        lng: -77.2972,
        hoursWeekday: '8:00 AM - 5:00 PM',
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: false,
        weekendDelivery: false,
        paymentMethods: JSON.stringify(['cash', 'credit_card', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'diesel']),
        minimumGallons: null,
        seniorDiscount: false,
        allowPriceDisplay: false,
        notes: null,
        active: true,
      },
      {
        name: 'Moore Fuel',
        slug: 'moore-fuel',
        phone: '(703) 754-0560',
        email: null,
        website: 'https://moorefuel.com',
        addressLine1: null,
        city: 'Warrenton',
        state: 'VA',
        postalCodesServed: JSON.stringify([
          // Fauquier County (core — HQ here)
          '20106', // Amissville
          '20115', // Marshall
          '20116', // Marshall
          '20119', // Catlett
          '20138', // Calverton
          '20139', // Casanova
          '20140', // Rectortown
          '20144', // Delaplane
          '20184', // Upperville
          '20185', // Upperville
          '20186', // Warrenton (HQ)
          '20187', // Warrenton
          '20188', // Warrenton
          '22712', // Bealeton
          '22720', // Goldvein
          '22728', // Midland
          '22734', // Remington
          '22742', // Sumerduck
          '22639', // Hume
          '22643', // Markham
          // Prince William County (western portion)
          '20136', // Bristow
          '20137', // Broad Run
          '20143', // Catharpin
          '20155', // Gainesville
          '20156', // Gainesville
          '20169', // Haymarket
          '20181', // Nokesville
        ]),
        serviceCities: JSON.stringify([
          'Warrenton', 'Marshall', 'Bealeton', 'Remington', 'Catlett', 'Midland',
          'Delaplane', 'Upperville', 'Amissville', 'Gainesville', 'Haymarket',
          'Bristow', 'Nokesville',
        ]),
        serviceCounties: JSON.stringify(['Fauquier', 'Prince William']),
        serviceAreaRadius: 25,
        lat: 38.7134,
        lng: -77.7953,
        hoursWeekday: '8:00 AM - 5:00 PM',
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: false,
        weekendDelivery: false,
        paymentMethods: JSON.stringify(['cash', 'credit_card', 'check']),
        fuelTypes: JSON.stringify(['heating_oil']),
        minimumGallons: null,
        seniorDiscount: false,
        allowPriceDisplay: false,
        notes: null,
        active: true,
      },
      {
        name: 'Griffith Energy Services',
        slug: 'griffith-energy-services',
        phone: '(888) 474-3391',
        email: null,
        website: 'https://griffithenergy.com',
        addressLine1: '9685 Main St',
        city: 'Fairfax',
        state: 'VA',
        postalCodesServed: JSON.stringify([
          // Fairfax County
          '22003', // Annandale
          '22015', // Burke
          '20120', // Centreville
          '20121', // Centreville
          '20124', // Clifton
          '22030', // Fairfax (location)
          '22031', // Fairfax
          '22032', // Fairfax
          '22033', // Fairfax
          '22034', // Fairfax
          '22035', // Fairfax
          '22039', // Fairfax Station
          '22041', // Falls Church
          '22042', // Falls Church
          '22043', // Falls Church
          '22044', // Falls Church
          '22060', // Fort Belvoir
          '22066', // Great Falls
          '22079', // Lorton
          '22101', // McLean
          '22102', // McLean
          '22124', // Oakton
          '22150', // Springfield
          '22151', // Springfield
          '22152', // Springfield
          '22153', // Springfield
          '22180', // Vienna
          '22181', // Vienna
          '22182', // Vienna
          '22303', // Alexandria (Fairfax Co)
          '22306', // Alexandria (Fairfax Co)
          '22307', // Alexandria (Fairfax Co)
          '22308', // Alexandria (Fairfax Co)
          '22309', // Alexandria (Fairfax Co)
          '22310', // Alexandria (Fairfax Co)
          '22312', // Alexandria (Fairfax Co)
          '22315', // Alexandria (Fairfax Co)
          // Loudoun County
          '20105', // Aldie
          '20147', // Ashburn
          '20148', // Ashburn
          '20152', // Chantilly
          '20164', // Sterling
          '20165', // Sterling
          '20166', // Sterling
          '20175', // Leesburg
          '20176', // Leesburg
          // Prince William County
          '20136', // Bristow
          '20137', // Broad Run
          '20143', // Catharpin
          '20155', // Gainesville
          '20156', // Gainesville
          '20169', // Haymarket
          '20181', // Nokesville
          '20108', // Manassas
          '20109', // Manassas
          '20110', // Manassas
          '20111', // Manassas
          '20112', // Manassas
          '22191', // Woodbridge
          '22192', // Woodbridge
          '22193', // Woodbridge
          // Fauquier County
          '20186', // Warrenton
          '20187', // Warrenton
          '20188', // Warrenton
          '22712', // Bealeton
          // Clarke County (Berryville location)
          '22611', // Berryville
          '22620', // Boyce
          '22663', // White Post
          // Arlington County
          '22201', // Arlington
          '22202', // Arlington
          '22203', // Arlington
          '22204', // Arlington
          '22205', // Arlington
          '22206', // Arlington
          '22207', // Arlington
          '22209', // Arlington
          '22211', // Fort Myer
          // Alexandria (independent city)
          '22301', // Alexandria
          '22302', // Alexandria
          '22304', // Alexandria
          '22305', // Alexandria
          '22311', // Alexandria
          '22314', // Alexandria
          // Falls Church (independent city)
          '22046', // Falls Church
        ]),
        serviceCities: JSON.stringify([
          'Fairfax', 'Vienna', 'McLean', 'Great Falls', 'Oakton', 'Burke', 'Springfield',
          'Annandale', 'Falls Church', 'Centreville', 'Clifton', 'Lorton',
          'Arlington', 'Alexandria', 'Ashburn', 'Sterling', 'Leesburg', 'Chantilly',
          'Manassas', 'Woodbridge', 'Gainesville', 'Haymarket', 'Bristow',
          'Warrenton', 'Bealeton', 'Berryville', 'Boyce',
        ]),
        serviceCounties: JSON.stringify([
          'Fairfax', 'Loudoun', 'Prince William', 'Fauquier',
          'Clarke', 'Arlington',
        ]),
        serviceAreaRadius: 50,
        lat: 38.8462,
        lng: -77.3064,
        hoursWeekday: '8:00 AM - 5:00 PM',
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: true,
        weekendDelivery: false,
        paymentMethods: JSON.stringify(['cash', 'credit_card', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'propane', 'diesel']),
        minimumGallons: null,
        seniorDiscount: false,
        allowPriceDisplay: false,
        notes: null,
        active: true,
      },
    ];

    for (const supplier of suppliers) {
      await upsertSupplier(sequelize, supplier);
      console.log(`[Migration 092] ${supplier.name} (${supplier.city}, ${supplier.state}) — upserted`);
    }
  },

  async down(sequelize) {
    await sequelize.query(`
      DELETE FROM suppliers WHERE slug IN (
        'valley-energy', 'holtzman-oil', 'capitol-discount-fuel',
        'moore-fuel', 'griffith-energy-services'
      )
    `);
    console.log('[Migration 092] Rolled back');
  }
};
