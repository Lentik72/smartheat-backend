/**
 * Migration 090: Add/backfill Luzerne/Carbon/Schuylkill County PA suppliers
 *
 * Coverage gap fix: ZIP 18249 (Sugarloaf, Luzerne County PA) had ZERO suppliers.
 *
 * New suppliers added:
 *   - Button Energy (Mountain Top, PA) — Luzerne/Carbon/Schuylkill + more. COD/will-call. No prices.
 *   - Tirpak Energy (Lehighton, PA) — Carbon/Schuylkill/Luzerne + more. COD/will-call. No prices.
 *   - Hollenbach Home Comfort (Tamaqua, PA) — Schuylkill/Carbon/Lehigh. Will-call. Prices scrapable.
 *
 * Existing suppliers backfilled:
 *   - R.F. Ohl (Lehighton, PA) — Carbon/Schuylkill/Lehigh/Monroe/Northampton. COD. Already in config (disabled).
 *   - Quality Discount Fuels (Port Carbon, PA) — Schuylkill County. COD. Already enabled/scraping.
 *
 * Sources: Company websites, HeatFleet, FuelWonk.
 */

const { upsertSupplier } = require('./lib/upsert-supplier');

module.exports = {
  name: '090-add-luzerne-carbon-schuylkill-suppliers',

  async up(sequelize) {
    const suppliers = [
      // === NEW SUPPLIERS ===
      {
        name: 'Button Energy',
        slug: 'button-energy',
        phone: '(570) 474-6635',
        email: null,
        website: 'https://buttonoil.com',
        addressLine1: '116 S Main Rd',
        city: 'Mountain Top',
        state: 'PA',
        // postalCodesServed managed by scrape-config.json (219 ZIPs, 13 counties)
        serviceCities: JSON.stringify([
          'Mountain Top', 'Wilkes-Barre', 'White Haven', 'Plymouth', 'Bear Creek',
          'Nanticoke', 'Kingston', 'Luzerne', 'Glen Lyon', 'Shavertown', 'Wapwallopen',
          'Drums', 'Drifton', 'Wyoming', 'Lattimer Mines', 'Pittston', 'Milnesville',
          'Freeland', 'Harleigh', 'Hunlock Creek', 'Hazleton', 'Conyngham', 'Sybertsville',
          'Beaver Meadows', 'Lake Harmony', 'Duryea', 'Beach Haven', 'Weatherly',
          'Scranton', 'Carbondale', 'Sunbury', 'Bloomsburg', 'Stroudsburg',
          'Jim Thorpe', 'McAdoo', 'Nesquehoning', 'Lansford', 'Summit Hill',
          'Coaldale', 'Danville', 'Shamokin', 'Pottsville', 'Shenandoah',
        ]),
        serviceCounties: JSON.stringify([
          'Carbon', 'Columbia', 'Dauphin', 'Lackawanna', 'Luzerne', 'Lycoming',
          'Monroe', 'Montour', 'Northumberland', 'Schuylkill', 'Snyder', 'Union', 'Wyoming'
        ]),
        serviceAreaRadius: 35,
        lat: 41.1369,
        lng: -75.8997,
        hoursWeekday: '8:00 AM - 4:00 PM',
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: true,
        weekendDelivery: false,
        paymentMethods: JSON.stringify(['cash', 'credit_card']),
        fuelTypes: JSON.stringify(['heating_oil', 'propane']),
        minimumGallons: null,
        seniorDiscount: false,
        allowPriceDisplay: false,
        notes: null,
        active: true,
      },
      {
        name: 'Tirpak Energy',
        slug: 'tirpak-energy',
        phone: '(484) 866-1260',
        email: 'tirpakenergy@yahoo.com',
        website: 'https://tirpakenergy.com',
        addressLine1: '115 Honeysuckle Lane',
        city: 'Lehighton',
        state: 'PA',
        postalCodesServed: JSON.stringify([
          // Carbon County (core)
          '18012', // Aquashicola
          '18030', // Bowmanstown
          '18071', // Palmerton
          '18210', // Albrightsville
          '18216', // Beaver Meadows
          '18229', // Jim Thorpe
          '18230', // Junedale
          '18232', // Lansford
          '18235', // Weissport/Lehighton (HQ)
          '18240', // Nesquehoning
          '18244', // Parryville
          '18250', // Summit Hill
          '18254', // Tresckow
          '18255', // Weatherly
          // Schuylkill County
          '18211', // Andreas
          '18214', // Barnesville
          '18218', // Coaldale
          '18220', // Delano
          '18231', // Kelayres
          '18237', // McAdoo
          '18245', // Quakake
          '18248', // Sheppton
          '18252', // Tamaqua
          '17976', // Shenandoah
          '17948', // Mahanoy City
          '17931', // Frackville
          // Luzerne County (southern)
          '18201', // West Hazleton
          '18219', // Conyngham
          '18221', // Drifton
          '18222', // Drums
          '18224', // Freeland
          '18225', // Harleigh
          '18234', // Lattimer Mines
          '18239', // Milnesville
          '18246', // Rock Glen
          '18247', // Saint Johns
          '18249', // Sugarloaf
          '18251', // Sybertsville
          '18256', // Weston
          // Lehigh County (partial)
          '18080', // Slatington
          '18079', // Slatedale
          '18066', // New Tripoli
          '18053', // Germansville
          '18051', // Fogelsville
        ]),
        serviceCities: JSON.stringify([
          'Lehighton', 'Lansford', 'Coaldale', 'Summit Hill', 'Nesquehoning', 'Quakake',
          'Tamaqua', 'Andreas', 'Junedale', 'Tresckow', 'McAdoo', 'Weatherly',
          'Kelayres', 'Beaver Meadows', 'Jim Thorpe', 'Palmerton',
          'Hazleton', 'Freeland', 'Conyngham', 'Sugarloaf', 'Drums', 'Barnesville',
          'Slatington', 'New Tripoli',
        ]),
        serviceCounties: JSON.stringify(['Carbon', 'Schuylkill', 'Luzerne', 'Lehigh']),
        serviceAreaRadius: 30,
        lat: 40.8334,
        lng: -75.7138,
        hoursWeekday: '8:00 AM - 4:30 PM',
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
        name: 'Hollenbach Home Comfort Services',
        slug: 'hollenbach-home-comfort',
        phone: '(570) 900-1053',
        email: null,
        website: 'https://hollenbachoil.com',
        addressLine1: '310 Pine Street',
        city: 'Tamaqua',
        state: 'PA',
        postalCodesServed: JSON.stringify([
          // Schuylkill County
          '17901', // Pottsville
          '17921', // Ashland
          '17925', // Brockton
          '17929', // Cressona
          '17930', // Cumbola
          '17931', // Frackville
          '17934', // Gilberton
          '17935', // Girardville
          '17944', // Llewellyn
          '17946', // Lost Creek
          '17948', // Mahanoy City
          '17949', // Mahanoy Plane
          '17951', // Mar Lin
          '17952', // Mary D
          '17953', // Middleport
          '17954', // Minersville
          '17960', // New Ringgold
          '17961', // Orwigsburg
          '17965', // Port Carbon
          '17967', // Ringtown
          '17970', // Saint Clair
          '17972', // Schuylkill Haven
          '17974', // Seltzer
          '17976', // Shenandoah
          '17982', // Tuscarora
          '18211', // Andreas
          '18214', // Barnesville
          '18218', // Coaldale
          '18220', // Delano
          '18231', // Kelayres
          '18237', // McAdoo
          '18241', // Fern Glen
          '18242', // Oneida
          '18245', // Quakake
          '18248', // Sheppton
          '18252', // Tamaqua (HQ)
          // Carbon County
          '18012', // Aquashicola
          '18030', // Bowmanstown
          '18071', // Palmerton
          '18216', // Beaver Meadows
          '18229', // Jim Thorpe
          '18230', // Junedale
          '18232', // Lansford
          '18235', // Weissport/Lehighton
          '18240', // Nesquehoning
          '18244', // Parryville
          '18250', // Summit Hill
          '18254', // Tresckow
          '18255', // Weatherly
          // Luzerne County (southern — Hazleton area)
          '18201', // West Hazleton
          '18219', // Conyngham
          '18221', // Drifton
          '18222', // Drums
          '18224', // Freeland
          '18225', // Harleigh
          '18234', // Lattimer Mines
          '18239', // Milnesville
          '18246', // Rock Glen
          '18247', // Saint Johns
          '18249', // Sugarloaf
          '18251', // Sybertsville
          // Lehigh County (partial — western)
          '18080', // Slatington
          '18079', // Slatedale
          '18088', // Walnutport
          '18066', // New Tripoli
          '18053', // Germansville
          '18051', // Fogelsville
          '18058', // Kunkletown
        ]),
        serviceCities: JSON.stringify([
          'Tamaqua', 'Pottsville', 'Hazleton', 'Jim Thorpe', 'Lehighton', 'Palmerton',
          'Shenandoah', 'Frackville', 'Mahanoy City', 'Coaldale', 'Lansford',
          'Summit Hill', 'Nesquehoning', 'McAdoo', 'Minersville', 'Schuylkill Haven',
          'Orwigsburg', 'Girardville', 'Ashland', 'Weatherly', 'Beaver Meadows',
          'Andreas', 'Barnesville', 'Kelayres', 'Freeland', 'Conyngham', 'Sugarloaf',
          'Drums', 'Drifton', 'Slatington', 'Walnutport',
        ]),
        serviceCounties: JSON.stringify(['Schuylkill', 'Carbon', 'Luzerne', 'Lehigh']),
        serviceAreaRadius: 30,
        lat: 40.7974,
        lng: -75.9696,
        hoursWeekday: '8:00 AM - 4:30 PM',
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: true,
        weekendDelivery: false,
        paymentMethods: JSON.stringify(['cash', 'credit_card', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'diesel']),
        minimumGallons: 50,
        seniorDiscount: false,
        allowPriceDisplay: true,
        notes: null,
        active: true,
      },
      // === EXISTING SUPPLIERS — postalCodesServed backfill ===
      {
        name: 'R.F. Ohl',
        slug: 'rf-ohl',
        phone: '(610) 377-1098',
        email: 'info@rfohl.com',
        website: 'https://www.rfohl.com',
        addressLine1: '160 S 2nd Street',
        city: 'Lehighton',
        state: 'PA',
        postalCodesServed: JSON.stringify([
          // Carbon County (core)
          '18012', // Aquashicola
          '18030', // Bowmanstown
          '18071', // Palmerton
          '18229', // Jim Thorpe
          '18232', // Lansford
          '18235', // Weissport/Lehighton (HQ)
          '18240', // Nesquehoning
          '18244', // Parryville
          '18250', // Summit Hill
          // Schuylkill County (partial)
          '18211', // Andreas
          '18214', // Barnesville
          '18218', // Coaldale
          '18237', // McAdoo
          '18248', // Sheppton
          '18252', // Tamaqua
          '17960', // New Ringgold
          // Lehigh County (partial)
          '18080', // Slatington
          '18079', // Slatedale
          '18088', // Walnutport
          '18059', // Laurys Station
          '18037', // Coplay
          '18032', // Catasauqua
          '18052', // Whitehall
          '18049', // Emmaus
          '18062', // Macungie
          '18101', // Allentown
          '18102', // Allentown
          '18103', // Allentown
          '18104', // Allentown
          // Monroe County (partial — western)
          '18330', // Effort
          '18333', // Kresgeville
          '18058', // Kunkletown
          // Northampton County (partial)
          '18013', // Bangor
          '18014', // Bath
          '18015', // Bethlehem
          '18017', // Bethlehem
          '18018', // Bethlehem
          '18020', // Bethlehem
          '18040', // Easton
          '18042', // Easton
          '18064', // Nazareth
          '18067', // Northampton
          '18072', // Pen Argyl
          '18091', // Wind Gap
        ]),
        serviceCities: JSON.stringify([
          'Lehighton', 'Jim Thorpe', 'Lansford', 'Palmerton', 'Nesquehoning',
          'Summit Hill', 'Tamaqua', 'Andreas', 'Coaldale',
          'Slatington', 'Walnutport', 'Allentown', 'Bethlehem', 'Emmaus', 'Macungie',
          'Effort', 'Kresgeville',
          'Bangor', 'Bath', 'Easton', 'Nazareth', 'Wind Gap',
        ]),
        serviceCounties: JSON.stringify(['Carbon', 'Schuylkill', 'Lehigh', 'Monroe', 'Northampton']),
        serviceAreaRadius: 35,
        lat: 40.8325,
        lng: -75.7146,
        hoursWeekday: '8:00 AM - 4:30 PM',
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: false,
        weekendDelivery: false,
        paymentMethods: JSON.stringify(['cash', 'credit_card']),
        fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'diesel']),
        minimumGallons: 100,
        seniorDiscount: false,
        allowPriceDisplay: false,
        notes: null,
        active: true,
      },
      {
        name: 'Quality Discount Fuels',
        slug: 'quality-discount-fuels',
        phone: '(570) 622-4198',
        email: 'info@qdfuels.com',
        website: 'https://www.qualitydiscountfuels.com',
        addressLine1: '1 2nd Street',
        city: 'Port Carbon',
        state: 'PA',
        postalCodesServed: JSON.stringify([
          // Schuylkill County (central — core area)
          '17901', // Pottsville
          '17921', // Ashland
          '17922', // Auburn
          '17925', // Brockton
          '17929', // Cressona
          '17930', // Cumbola
          '17931', // Frackville
          '17933', // Friedensburg
          '17934', // Gilberton
          '17935', // Girardville
          '17936', // Gordon
          '17943', // Lavelle
          '17944', // Llewellyn
          '17946', // Lost Creek
          '17948', // Mahanoy City
          '17949', // Mahanoy Plane
          '17951', // Mar Lin
          '17952', // Mary D
          '17953', // Middleport
          '17954', // Minersville
          '17957', // Muir
          '17960', // New Ringgold
          '17961', // Orwigsburg
          '17963', // Pine Grove
          '17964', // Pitman
          '17965', // Port Carbon (HQ)
          '17967', // Ringtown
          '17968', // Sacramento
          '17970', // Saint Clair
          '17972', // Schuylkill Haven
          '17974', // Seltzer
          '17976', // Shenandoah
          '17979', // Summit Station
          '17982', // Tuscarora
          '17985', // Zion Grove
          '18211', // Andreas
          '18214', // Barnesville
          '18218', // Coaldale
          '18220', // Delano
          '18231', // Kelayres
          '18237', // McAdoo
          '18241', // Fern Glen
          '18242', // Oneida
          '18245', // Quakake
          '18248', // Sheppton
          '18252', // Tamaqua
        ]),
        serviceCities: JSON.stringify([
          'Port Carbon', 'Pottsville', 'Minersville', 'Schuylkill Haven', 'Orwigsburg',
          'Saint Clair', 'Frackville', 'Shenandoah', 'Mahanoy City', 'Tamaqua',
          'Ashland', 'Girardville', 'Coaldale', 'McAdoo', 'Pine Grove',
          'New Ringgold', 'Cressona', 'Auburn', 'Ringtown',
        ]),
        serviceCounties: JSON.stringify(['Schuylkill']),
        serviceAreaRadius: 25,
        lat: 40.6965,
        lng: -76.1699,
        hoursWeekday: '8:00 AM - 4:30 PM',
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: false,
        weekendDelivery: false,
        paymentMethods: JSON.stringify(['cash', 'credit_card', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'propane']),
        minimumGallons: null,
        seniorDiscount: false,
        allowPriceDisplay: true,
        notes: null,
        active: true,
      },
    ];

    for (const supplier of suppliers) {
      await upsertSupplier(sequelize, supplier);
      console.log(`[Migration 090] ${supplier.name} (${supplier.city}, ${supplier.state}) — upserted`);
    }
  },

  async down(sequelize) {
    // Remove new suppliers
    await sequelize.query(`
      DELETE FROM suppliers WHERE slug IN ('button-energy', 'tirpak-energy', 'hollenbach-home-comfort')
    `);
    // Clear coverage for existing suppliers
    await sequelize.query(`
      UPDATE suppliers SET
        postal_codes_served = NULL,
        service_cities = NULL,
        service_counties = NULL,
        updated_at = NOW()
      WHERE LOWER(REPLACE(REPLACE(website, 'https://', ''), 'http://', '')) LIKE '%rfohl.com%'
         OR LOWER(REPLACE(REPLACE(website, 'https://', ''), 'http://', '')) LIKE '%qualitydiscountfuels.com%'
    `);
    console.log('[Migration 090] Rolled back');
  }
};
