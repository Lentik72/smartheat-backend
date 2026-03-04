/**
 * Migration 089: Backfill postalCodesServed for Baltimore-area suppliers
 *
 * Coverage gap fix: ZIP 21201 (Baltimore) showed 0 suppliers.
 * Root cause: 2 existing suppliers had no postalCodesServed configured.
 *
 * Suppliers updated:
 *   - Direct Fuel LLC (Middle River, MD) — Baltimore County, Baltimore City,
 *     Anne Arundel, parts of Harford. COD confirmed. Prices scrapable.
 *   - Tevis Energy (Westminster, MD) — Carroll, Baltimore, Baltimore City,
 *     Frederick, Howard, Harford counties MD + Adams, York PA.
 *     COD/will-call confirmed. Phone-only pricing (directory-only listing).
 *
 * Sources: directfuelmd.com, tevisenergy.com, HeatFleet, FuelWonk.
 */

const { upsertSupplier } = require('./lib/upsert-supplier');

module.exports = {
  name: '089-backfill-baltimore-coverage',

  async up(sequelize) {
    const suppliers = [
      {
        name: 'Direct Fuel LLC',
        slug: 'direct-fuel-llc',
        phone: '(410) 682-2500',
        email: 'dwyerfamilyfuel@gmail.com',
        website: 'https://www.directfuelmd.com',
        addressLine1: '2003B Old Orems Road',
        city: 'Middle River',
        state: 'MD',
        postalCodesServed: JSON.stringify([
          // Baltimore City
          '21201', // Baltimore (the gap ZIP)
          '21202', // Baltimore
          '21205', // Baltimore
          '21206', // Baltimore
          '21209', // Baltimore
          '21210', // Baltimore
          '21211', // Baltimore
          '21212', // Baltimore
          '21213', // Baltimore
          '21214', // Baltimore
          '21215', // Baltimore
          '21216', // Baltimore
          '21217', // Baltimore
          '21218', // Baltimore
          '21223', // Baltimore
          '21224', // Baltimore
          '21229', // Baltimore
          '21230', // Baltimore
          '21231', // Baltimore
          '21239', // Baltimore
          // Baltimore County
          '21013', // Baldwin
          '21030', // Cockeysville
          '21031', // Hunt Valley
          '21051', // Fork
          '21052', // Fort Howard
          '21057', // Glen Arm
          '21082', // Hydes
          '21087', // Kingsville
          '21093', // Lutherville Timonium
          '21111', // Monkton
          '21117', // Owings Mills
          '21128', // Perry Hall
          '21131', // Phoenix
          '21133', // Randallstown
          '21136', // Reisterstown
          '21152', // Sparks Glencoe
          '21153', // Stevenson
          '21156', // Upper Falls
          '21162', // White Marsh
          '21204', // Towson
          '21207', // Gwynn Oak
          '21208', // Pikesville
          '21219', // Sparrows Point
          '21220', // Middle River (HQ)
          '21221', // Essex
          '21222', // Dundalk
          '21227', // Halethorpe
          '21228', // Catonsville
          '21234', // Parkville
          '21236', // Nottingham
          '21237', // Rosedale
          '21244', // Windsor Mill
          '21286', // Towson
          // Anne Arundel County (partial — Glen Burnie, Pasadena, Linthicum, Brooklyn)
          '21060', // Glen Burnie
          '21061', // Glen Burnie
          '21090', // Linthicum Heights
          '21122', // Pasadena
          '21225', // Brooklyn
          '21226', // Curtis Bay
          '21401', // Annapolis
          // Harford County (partial — southern)
          '21001', // Aberdeen
          '21009', // Abingdon
          '21010', // Gunpowder
          '21014', // Bel Air
          '21015', // Bel Air
          '21040', // Edgewood
          '21047', // Fallston
          '21085', // Joppa
        ]),
        serviceCities: JSON.stringify([
          'Baltimore', 'Towson', 'Catonsville', 'Dundalk', 'Essex', 'Parkville',
          'Rosedale', 'Pikesville', 'Cockeysville', 'Hunt Valley', 'Perry Hall',
          'White Marsh', 'Middle River', 'Owings Mills', 'Randallstown', 'Woodlawn',
          'Lutherville Timonium', 'Sparrows Point', 'Curtis Bay', 'Halethorpe',
          'Nottingham', 'Glen Arm', 'Kingsville', 'Phoenix', 'Monkton', 'Fork',
          'Fort Howard', 'Hydes', 'Stevenson', 'Upper Falls', 'Reisterstown',
          'Gwynn Oak', 'Baldwin', 'Sparks Glencoe', 'Windsor Mill',
          'Glen Burnie', 'Pasadena', 'Linthicum Heights', 'Brooklyn', 'Annapolis',
          'Bel Air', 'Abingdon', 'Edgewood', 'Joppa', 'Fallston', 'Aberdeen', 'Gunpowder',
        ]),
        serviceCounties: JSON.stringify(['Baltimore', 'Baltimore City', 'Anne Arundel', 'Harford']),
        serviceAreaRadius: 30,
        lat: 39.3441,
        lng: -76.5051,
        hoursWeekday: '8:00 AM - 4:00 PM',
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
      {
        name: 'Tevis Energy',
        slug: 'tevis-energy',
        phone: '(410) 876-6800',
        email: null,
        website: 'https://www.tevisenergy.com',
        addressLine1: '82 John Street',
        city: 'Westminster',
        state: 'MD',
        postalCodesServed: JSON.stringify([
          // Carroll County MD
          '21048', // Finksburg
          '21074', // Hampstead
          '21102', // Manchester
          '21157', // Westminster (HQ)
          '21158', // Westminster
          '21776', // New Windsor
          '21784', // Sykesville
          '21787', // Taneytown
          '21757', // Keymar
          // Baltimore County MD
          '21013', // Baldwin
          '21023', // Butler
          '21030', // Cockeysville
          '21031', // Hunt Valley
          '21053', // Freeland
          '21057', // Glen Arm
          '21071', // Glyndon
          '21082', // Hydes
          '21087', // Kingsville
          '21093', // Lutherville Timonium
          '21105', // Maryland Line
          '21111', // Monkton
          '21117', // Owings Mills
          '21120', // Parkton
          '21128', // Perry Hall
          '21131', // Phoenix
          '21133', // Randallstown
          '21136', // Reisterstown
          '21152', // Sparks Glencoe
          '21153', // Stevenson
          '21155', // Upperco
          '21156', // Upper Falls
          '21161', // White Hall
          '21162', // White Marsh
          '21163', // Woodstock
          '21204', // Towson
          '21207', // Gwynn Oak
          '21208', // Pikesville
          '21220', // Middle River
          '21221', // Essex
          '21222', // Dundalk
          '21228', // Catonsville
          '21234', // Parkville
          '21236', // Nottingham
          '21237', // Rosedale
          '21244', // Windsor Mill
          // Baltimore City
          '21201', // Baltimore
          '21202', // Baltimore
          '21205', // Baltimore
          '21206', // Baltimore
          '21209', // Baltimore
          '21210', // Baltimore
          '21211', // Baltimore
          '21212', // Baltimore
          '21213', // Baltimore
          '21214', // Baltimore
          '21215', // Baltimore
          '21216', // Baltimore
          '21217', // Baltimore
          '21218', // Baltimore
          '21223', // Baltimore
          '21224', // Baltimore
          '21229', // Baltimore
          '21230', // Baltimore
          '21231', // Baltimore
          '21239', // Baltimore
          // Frederick County MD
          '21701', // Frederick
          '21702', // Frederick
          '21703', // Frederick
          '21704', // Frederick
          '21727', // Emmitsburg
          '21754', // Ijamsville
          '21762', // Libertytown
          '21770', // Monrovia
          '21771', // Mount Airy
          '21774', // New Market
          '21778', // Rocky Ridge
          '21788', // Thurmont
          '21791', // Union Bridge
          '21793', // Walkersville
          '21798', // Woodsboro
          // Howard County MD
          '21029', // Clarksville
          '21036', // Dayton
          '21042', // Ellicott City
          '21043', // Ellicott City
          '21044', // Columbia
          '21045', // Columbia
          '21046', // Columbia
          '21075', // Elkridge
          '21104', // Marriottsville
          '21723', // Cooksville
          '21737', // Glenelg
          '21738', // Glenwood
          '21794', // West Friendship
          '21797', // Woodbine
          // Harford County MD
          '21001', // Aberdeen
          '21009', // Abingdon
          '21014', // Bel Air
          '21015', // Bel Air
          '21040', // Edgewood
          '21047', // Fallston
          '21050', // Forest Hill
          '21084', // Jarrettsville
          '21085', // Joppa
          '21132', // Pylesville
          '21154', // Street
          '21160', // Whiteford
          '21161', // White Hall
          // Adams County PA
          '17307', // Biglerville
          '17320', // Fairfield
          '17325', // Gettysburg
          '17340', // Hanover
          '17350', // Littlestown
          '17352', // McSherrystown
          '17353', // New Oxford
          // York County PA
          '17302', // Airville
          '17314', // Delta
          '17321', // Fawn Grove
          '17327', // Glen Rock
          '17339', // Hanover
          '17356', // New Freedom
          '17361', // Railroad
          '17362', // Seven Valleys
          '17368', // Shrewsbury
          '17370', // Spring Grove
        ]),
        serviceCities: JSON.stringify([
          'Westminster', 'New Windsor', 'Finksburg', 'Hampstead', 'Upperco', 'Manchester',
          'Reisterstown', 'Glyndon', 'Taneytown', 'Sykesville', 'Keymar', 'Union Bridge',
          'Butler', 'Libertytown', 'Owings Mills', 'Mount Airy',
          'Cockeysville', 'Freeland', 'Sparks Glencoe', 'Randallstown',
          'Parkton', 'Monkton', 'Stevenson', 'Maryland Line', 'White Hall',
          'Lutherville Timonium', 'Baltimore', 'Windsor Mill', 'Pikesville', 'Towson',
          'Gwynn Oak', 'Woodstock',
          'Frederick', 'Emmitsburg', 'Walkersville', 'New Market', 'Rocky Ridge',
          'Thurmont', 'Woodsboro', 'Monrovia',
          'Ellicott City', 'Columbia', 'Elkridge', 'Marriottsville', 'Cooksville',
          'Glenelg', 'Glenwood', 'West Friendship', 'Woodbine', 'Dayton', 'Clarksville',
          'Bel Air', 'Abingdon', 'Edgewood', 'Joppa', 'Fallston', 'Aberdeen',
          'Forest Hill', 'Jarrettsville', 'Street', 'Pylesville', 'Whiteford',
          'Gettysburg', 'Littlestown', 'McSherrystown', 'New Oxford', 'Biglerville', 'Fairfield',
          'Airville', 'Glen Rock', 'Hanover', 'New Freedom', 'Railroad',
          'Seven Valleys', 'Shrewsbury', 'Spring Grove', 'Delta', 'Fawn Grove',
        ]),
        serviceCounties: JSON.stringify([
          'Carroll', 'Baltimore', 'Baltimore City', 'Frederick', 'Howard', 'Harford',
          'Adams', 'York',
        ]),
        serviceAreaRadius: 45,
        lat: 39.5642,
        lng: -76.9807,
        hoursWeekday: '7:00 AM - 4:00 PM',
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
      console.log(`[Migration 089] ${supplier.name} (${supplier.city}, ${supplier.state}) — coverage backfilled`);
    }
  },

  async down(sequelize) {
    await sequelize.query(`
      UPDATE suppliers SET
        postal_codes_served = NULL,
        service_cities = NULL,
        service_counties = NULL,
        updated_at = NOW()
      WHERE LOWER(REPLACE(REPLACE(website, 'https://', ''), 'http://', '')) LIKE '%directfuelmd.com%'
         OR LOWER(REPLACE(REPLACE(website, 'https://', ''), 'http://', '')) LIKE '%tevisenergy.com%'
    `);
    console.log('[Migration 089] Coverage data cleared');
  }
};
