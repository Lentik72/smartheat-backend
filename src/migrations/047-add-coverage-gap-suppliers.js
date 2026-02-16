/**
 * Migration 047: Add Coverage Gap Suppliers
 * Fills coverage gaps for:
 * - Quakertown, PA 18951 (Bucks County) - was showing 0 suppliers
 * - Cromwell, CT 06416 (Middlesex County) - limited coverage
 * - Honesdale, PA 18431 (Wayne County) - limited coverage
 *
 * All suppliers verified COD/will-call from their OWN websites:
 * - Ranson Fuel: "C.O.D. home heating fuel"
 * - Reo and Sons Fuel: "All deliveries are C.O.D., cash or check"
 * - Central Bucks Oil: "Will Call oil delivery"
 * - Brazos Oil LLC: "Easy C.O.D. Order and Payment!"
 * - River Valley Oil Service: "Current C.O.D. Oil Price"
 * - Highhouse Energy: "will-call" options
 * - Santarelli & Sons Oil: "phone COD" + "will call delivery"
 * - Firmstone Lakewood Fuels: "Will Call" pay at delivery
 */

const { v4: uuidv4 } = require('uuid');

module.exports = {
  name: '047-add-coverage-gap-suppliers',

  async up(sequelize) {
    const suppliers = [
      // ============================================
      // QUAKERTOWN, PA AREA (Bucks/Lehigh/Montgomery)
      // ============================================

      // RANSON FUEL - Richlandtown/Quakertown, PA
      {
        id: uuidv4(),
        name: 'Ranson Fuel',
        slug: 'ranson-fuel',
        phone: '(215) 529-4727',
        email: null,
        website: 'https://ransonfuel.com',
        addressLine1: 'P.O. Box 847',
        city: 'Richlandtown',
        state: 'PA',
        postalCodesServed: JSON.stringify([
          // Bucks County
          '18951', // Quakertown
          '18955', // Richlandtown
          '18073', // Pennsburg
          '18041', // East Greenville
          '18054', // Green Lane
          '18070', // Palm
          '18076', // Red Hill
          '18964', // Souderton
          '18969', // Telford
          '18944', // Perkasie
          '18960', // Sellersville
          '18972', // Trumbauersville
          '18930', // Bedminster
          '18932', // Dublin
          '18917', // Buckingham
          // Lehigh County
          '18036', // Coopersburg
          '18031', // Breinigsville
          '18051', // Fogelsville
          '18052', // Whitehall
          '18104', // Allentown
          '18106', // Allentown
          // Montgomery County
          '18964', // Souderton
          '19440', // Hatfield
          '19446', // Lansdale
          '18074', // Perkiomenville
        ]),
        serviceCities: JSON.stringify([
          'Quakertown', 'Richlandtown', 'Pennsburg', 'East Greenville', 'Green Lane',
          'Palm', 'Red Hill', 'Souderton', 'Telford', 'Perkasie', 'Sellersville',
          'Trumbauersville', 'Bedminster', 'Dublin', 'Coopersburg', 'Allentown',
          'Whitehall', 'Hatfield', 'Lansdale'
        ]),
        serviceCounties: JSON.stringify(['Bucks', 'Lehigh', 'Montgomery']),
        serviceAreaRadius: 25,
        lat: 40.4701,
        lng: -75.3096,
        paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'diesel']),
        minimumGallons: 100,
        hoursWeekday: null,
        hoursSaturday: null,
        hoursSunday: null,
        weekendDelivery: true,
        emergencyDelivery: true,
        emergencyPhone: null,
        seniorDiscount: false,
        active: true,
        verified: false,
        allowPriceDisplay: true, // Prices displayed on website
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date()
      },

      // REO AND SONS FUEL - Quakertown, PA
      {
        id: uuidv4(),
        name: 'Reo and Sons Fuel',
        slug: 'reo-and-sons-fuel',
        phone: '(267) 374-6400',
        email: null,
        website: 'https://www.reoandsonsfuel.com',
        addressLine1: '690 Mine Road',
        city: 'Quakertown',
        state: 'PA',
        postalCodesServed: JSON.stringify([
          // Bucks County
          '18951', // Quakertown
          '18955', // Richlandtown
          '18944', // Perkasie
          '18960', // Sellersville
          '18972', // Trumbauersville
          '18930', // Bedminster
          '18932', // Dublin
          '18917', // Buckingham
          '18938', // New Hope
          '18940', // Newtown
          '18966', // Southampton
          '18974', // Warminster
          '18976', // Warrington
          // Lehigh County
          '18036', // Coopersburg
          '18015', // Bethlehem
          '18017', // Bethlehem
          '18018', // Bethlehem
          '18052', // Whitehall
          '18104', // Allentown
          // Montgomery County
          '18964', // Souderton
          '19440', // Hatfield
          '19446', // Lansdale
          '19454', // North Wales
          // Northampton County
          '18042', // Easton
          '18045', // Easton
          '18064', // Nazareth
          // Berks County
          '19512', // Boyertown
          // Hunterdon County NJ
          '08801', // Annandale
          '08867', // Pittstown
          // Warren County NJ
          '07823', // Belvidere
          '07882', // Washington
          // Chester County
          '19320', // Coatesville
          // Carbon County
          '18229', // Jim Thorpe
          // Monroe County
          '18301', // East Stroudsburg
          // Schuylkill County
          '17901', // Pottsville
          // Philadelphia
          '19102', // Philadelphia
        ]),
        serviceCities: JSON.stringify([
          'Quakertown', 'Richlandtown', 'Perkasie', 'Sellersville', 'Trumbauersville',
          'Bedminster', 'Dublin', 'Buckingham', 'New Hope', 'Newtown', 'Southampton',
          'Warminster', 'Warrington', 'Coopersburg', 'Bethlehem', 'Whitehall',
          'Allentown', 'Souderton', 'Hatfield', 'Lansdale', 'North Wales', 'Easton',
          'Nazareth', 'Boyertown', 'Philadelphia'
        ]),
        serviceCounties: JSON.stringify([
          'Bucks', 'Lehigh', 'Montgomery', 'Northampton', 'Berks',
          'Hunterdon', 'Warren', 'Chester', 'Carbon', 'Monroe', 'Schuylkill', 'Philadelphia'
        ]),
        serviceAreaRadius: 50,
        lat: 40.4418,
        lng: -75.3418,
        paymentMethods: JSON.stringify(['cash', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'diesel']),
        minimumGallons: null, // No minimum, $20 fee under 100 gal
        hoursWeekday: null,
        hoursSaturday: null,
        hoursSunday: null,
        weekendDelivery: false,
        emergencyDelivery: true,
        emergencyPhone: null,
        seniorDiscount: false,
        active: true,
        verified: false,
        allowPriceDisplay: false,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date()
      },

      // CENTRAL BUCKS OIL - Quakertown area
      {
        id: uuidv4(),
        name: 'Central Bucks Oil',
        slug: 'central-bucks-oil',
        phone: '(610) 847-1012',
        email: null,
        website: 'https://www.centralbucksoil.com',
        addressLine1: null,
        city: 'Quakertown',
        state: 'PA',
        postalCodesServed: JSON.stringify([
          // Bucks County
          '18951', // Quakertown
          '18955', // Richlandtown
          '18944', // Perkasie
          '18960', // Sellersville
          '18972', // Trumbauersville
          '18930', // Bedminster
          '18932', // Dublin
          '18914', // Chalfont
          '18901', // Doylestown
          '18902', // Doylestown
          '18917', // Buckingham
          '18929', // Jamison
          '18938', // New Hope
          '18940', // Newtown
          '18954', // Richboro
          '18963', // Silverdale
          '18964', // Souderton
          '18966', // Southampton
          '18974', // Warminster
          '18976', // Warrington
          '18977', // Washington Crossing
          '18980', // Wrightstown
          '18942', // Ottsville
          '18920', // Erwinna
          '18923', // Fountainville
          '18925', // Furlong
          '18928', // Hilltown
          '18933', // Kintnersville
          '18936', // Mechanicsville
          '18950', // Pipersville
          '18947', // Milford Square
          '18970', // Riegelsville
          '18962', // Spinnerstown
          '18081', // Springtown
          '18972', // Upper Black Eddy
          // Montgomery County
          '19440', // Hatfield
          '19446', // Lansdale
          // Lehigh County
          '18036', // Coopersburg
        ]),
        serviceCities: JSON.stringify([
          'Quakertown', 'Richlandtown', 'Perkasie', 'Sellersville', 'Trumbauersville',
          'Bedminster', 'Dublin', 'Chalfont', 'Doylestown', 'Buckingham', 'Jamison',
          'New Hope', 'Newtown', 'Richboro', 'Silverdale', 'Souderton', 'Southampton',
          'Warminster', 'Warrington', 'Washington Crossing', 'Wrightstown', 'Ottsville',
          'Erwinna', 'Fountainville', 'Furlong', 'Hilltown', 'Kintnersville',
          'Mechanicsville', 'Pipersville', 'Milford Square', 'Riegelsville',
          'Spinnerstown', 'Springtown', 'Upper Black Eddy', 'Hatfield', 'Lansdale',
          'Coopersburg', 'Blooming Glen', 'Plumsteadville'
        ]),
        serviceCounties: JSON.stringify(['Bucks', 'Montgomery', 'Lehigh']),
        serviceAreaRadius: 30,
        lat: 40.4418,
        lng: -75.3418,
        paymentMethods: JSON.stringify(['credit_card', 'debit', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'diesel']),
        minimumGallons: 150,
        hoursWeekday: null,
        hoursSaturday: null,
        hoursSunday: null,
        weekendDelivery: false,
        emergencyDelivery: true,
        emergencyPhone: '(610) 847-1012',
        seniorDiscount: false,
        active: true,
        verified: false,
        allowPriceDisplay: true, // Prices displayed on website
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date()
      },

      // ============================================
      // CROMWELL, CT AREA (Middlesex/Hartford)
      // ============================================

      // BRAZOS OIL LLC - Portland, CT
      {
        id: uuidv4(),
        name: 'Brazos Oil LLC',
        slug: 'brazos-oil-llc',
        phone: '(860) 342-1136',
        email: null,
        website: 'https://www.brazosoilct.com',
        addressLine1: null,
        city: 'Portland',
        state: 'CT',
        postalCodesServed: JSON.stringify([
          // Middlesex County
          '06416', // Cromwell
          '06457', // Middletown
          '06480', // Portland
          '06422', // Durham
          '06423', // East Haddam
          '06424', // East Hampton
          '06426', // Essex
          '06438', // Haddam
          '06441', // Higganum
          '06442', // Ivoryton
          '06419', // Killingworth
          '06475', // Old Saybrook
          '06498', // Westbrook
          '06409', // Centerbrook
          '06412', // Chester
          '06413', // Clinton
          '06417', // Deep River
          '06455', // Middlefield
          '06469', // Moodus
          '06481', // Rockfall
          // Hartford County
          '06023', // East Berlin
          '06037', // Berlin
          '06033', // Glastonbury
          '06073', // South Glastonbury
          '06040', // Manchester
          '06051', // New Britain
          '06067', // Rocky Hill
          '06106', // Hartford
          '06107', // West Hartford
          '06108', // East Hartford
          '06109', // Wethersfield
          '06111', // Newington
          '06447', // Marlborough
          '06489', // Southington
        ]),
        serviceCities: JSON.stringify([
          'Cromwell', 'Middletown', 'Portland', 'Durham', 'East Haddam', 'East Hampton',
          'Essex', 'Haddam', 'Higganum', 'Ivoryton', 'Killingworth', 'Old Saybrook',
          'Westbrook', 'Centerbrook', 'Chester', 'Clinton', 'Deep River', 'Middlefield',
          'Moodus', 'Rockfall', 'East Berlin', 'Berlin', 'Glastonbury', 'South Glastonbury',
          'Manchester', 'New Britain', 'Rocky Hill', 'Hartford', 'West Hartford',
          'East Hartford', 'Wethersfield', 'Newington', 'Marlborough', 'Southington',
          'Amston', 'Cobalt', 'Colchester', 'Madison', 'Niantic', 'Old Lyme'
        ]),
        serviceCounties: JSON.stringify(['Middlesex', 'Hartford', 'New Haven']),
        serviceAreaRadius: 30,
        lat: 41.5726,
        lng: -72.6409,
        paymentMethods: JSON.stringify(['credit_card']),
        fuelTypes: JSON.stringify(['heating_oil']),
        minimumGallons: 100,
        hoursWeekday: null,
        hoursSaturday: null,
        hoursSunday: null,
        weekendDelivery: false,
        emergencyDelivery: false,
        emergencyPhone: null,
        seniorDiscount: false,
        active: true,
        verified: false,
        allowPriceDisplay: true, // Prices displayed on website
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date()
      },

      // RIVER VALLEY OIL SERVICE - Middletown, CT
      {
        id: uuidv4(),
        name: 'River Valley Oil Service',
        slug: 'river-valley-oil-service',
        phone: '(860) 342-5670',
        email: null,
        website: 'https://rivervalleyos.com',
        addressLine1: '310 South Main Street',
        city: 'Middletown',
        state: 'CT',
        postalCodesServed: JSON.stringify([
          // Middlesex County
          '06416', // Cromwell
          '06457', // Middletown
          '06480', // Portland
          '06422', // Durham
          '06423', // East Haddam
          '06424', // East Hampton
          '06426', // Essex
          '06438', // Haddam
          '06441', // Higganum
          '06442', // Ivoryton
          '06419', // Killingworth
          '06475', // Old Saybrook
          '06498', // Westbrook
          '06409', // Centerbrook
          '06412', // Chester
          '06413', // Clinton
          '06417', // Deep River
          '06455', // Middlefield
          '06469', // Moodus
          '06371', // Old Lyme
          '06333', // East Lyme
          '06439', // Hadlyme
        ]),
        serviceCities: JSON.stringify([
          'Cromwell', 'Middletown', 'Portland', 'Durham', 'East Haddam', 'East Hampton',
          'Essex', 'Haddam', 'Higganum', 'Ivoryton', 'Killingworth', 'Old Saybrook',
          'Westbrook', 'Centerbrook', 'Chester', 'Clinton', 'Deep River', 'Middlefield',
          'Moodus', 'Old Lyme', 'East Lyme', 'Hadlyme'
        ]),
        serviceCounties: JSON.stringify(['Middlesex', 'New London']),
        serviceAreaRadius: 25,
        lat: 41.5565,
        lng: -72.6507,
        paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'propane']),
        minimumGallons: null,
        hoursWeekday: null,
        hoursSaturday: null,
        hoursSunday: null,
        weekendDelivery: false,
        emergencyDelivery: false,
        emergencyPhone: null,
        seniorDiscount: false,
        active: true,
        verified: false,
        allowPriceDisplay: false, // "Call for price"
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date()
      },

      // ============================================
      // HONESDALE, PA AREA (Wayne County / Poconos)
      // ============================================

      // HIGHHOUSE ENERGY - Honesdale, PA
      {
        id: uuidv4(),
        name: 'Highhouse Energy',
        slug: 'highhouse-energy',
        phone: '(570) 253-3520',
        email: null,
        website: 'https://highhouseenergy.com',
        addressLine1: '333 Erie Street',
        city: 'Honesdale',
        state: 'PA',
        postalCodesServed: JSON.stringify([
          // Wayne County
          '18431', // Honesdale
          '18473', // White Mills
          '18456', // Prompton
          '18472', // Waymart
          '18438', // Lakeville
          '18436', // Lake Ariel
          '18444', // Moscow (partial)
          '18428', // Hawley
          '18451', // Paupack
          '18464', // Tafton
          '18435', // Lakewood
          '18461', // Sterling
          '18466', // Tobyhanna (partial)
          '18470', // Union Dale
          '18403', // Archbald (partial)
          // Pike County
          '18324', // Bushkill
          '18327', // Delaware Water Gap
          '18328', // Dingmans Ferry
          '18336', // Matamoras
          '18337', // Milford
          '18340', // Millrift
          '18371', // Shohola
          '18372', // Tamiment
          // Susquehanna County
          '18407', // Carbondale (partial)
          '18421', // Forest City (partial)
          // Lackawanna County
          '18411', // Clarks Summit (partial)
          '18508', // Scranton (partial)
          // Delaware County NY
          '13755', // Hancock (partial)
          // Sullivan County NY
          '12779', // Narrowsburg (partial)
          // Orange County NY
          '12729', // Cuddebackville (partial)
        ]),
        serviceCities: JSON.stringify([
          'Honesdale', 'White Mills', 'Prompton', 'Waymart', 'Lakeville', 'Lake Ariel',
          'Moscow', 'Hawley', 'Paupack', 'Tafton', 'Lakewood', 'Sterling', 'Tobyhanna',
          'Union Dale', 'Bushkill', 'Delaware Water Gap', 'Dingmans Ferry', 'Matamoras',
          'Milford', 'Shohola', 'Narrowsburg', 'Hancock'
        ]),
        serviceCounties: JSON.stringify([
          'Wayne', 'Pike', 'Susquehanna', 'Sullivan', 'Lackawanna',
          'Delaware', 'Monroe', 'Wyoming', 'Orange'
        ]),
        serviceAreaRadius: 40,
        lat: 41.5767,
        lng: -75.2585,
        paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'propane', 'kerosene', 'diesel']),
        minimumGallons: null,
        hoursWeekday: '7:30 AM - 4:00 PM',
        hoursSaturday: null,
        hoursSunday: null,
        weekendDelivery: false,
        emergencyDelivery: true,
        emergencyPhone: '(570) 253-3520',
        seniorDiscount: false,
        active: true,
        verified: false,
        allowPriceDisplay: true, // Prices displayed on website
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date()
      },

      // SANTARELLI & SONS OIL - Peckville, PA (serves Honesdale)
      {
        id: uuidv4(),
        name: 'Santarelli & Sons Oil',
        slug: 'santarelli-sons-oil',
        phone: '(570) 489-7690',
        email: null,
        website: 'https://santarelliandsonsoil.com',
        addressLine1: '443 Main Street',
        city: 'Peckville',
        state: 'PA',
        postalCodesServed: JSON.stringify([
          // Wayne County
          '18431', // Honesdale
          '18405', // Beach Lake
          '18428', // Hawley
          '18436', // Lake Ariel
          '18435', // Lakewood
          '18472', // Waymart
          '18473', // White Mills
          // Lackawanna County
          '18452', // Peckville
          '18403', // Archbald
          '18407', // Carbondale
          '18411', // Clarks Summit
          '18414', // Dalton
          '18419', // Factoryville
          '18433', // Jermyn
          '18434', // Jessup
          '18444', // Moscow
          '18447', // Olyphant
          '18504', // Scranton
          '18505', // Scranton
          '18508', // Scranton
          '18509', // Scranton
          '18510', // Scranton
          '18512', // Scranton
          '18519', // Scranton
          '18507', // Taylor
          '18518', // Old Forge
          '18471', // Waverly
          // Monroe County
          '18301', // East Stroudsburg
          '18302', // East Stroudsburg
          '18360', // Stroudsburg
          '18344', // Mount Pocono
          '18466', // Tobyhanna
          '18346', // Pocono Summit
          '18347', // Pocono Lake
          '18326', // Canadensis
          '18330', // Cresco
          '18370', // Swiftwater
          '18372', // Tannersville
          // Pike County
          '18324', // Bushkill
          '18327', // Delaware Water Gap
          '18328', // Dingmans Ferry
          '18336', // Matamoras
          '18337', // Milford
          '18371', // Shohola
          '18464', // Tafton
          '18451', // Paupack
          // Susquehanna County
          '18421', // Forest City
          '18425', // Hallstead
          '18461', // Sterling
          // Wyoming County
          '18657', // Tunkhannock
          '18437', // Lake Winola
          '18441', // Nicholson
          // Carbon County
          '18229', // Jim Thorpe
        ]),
        serviceCities: JSON.stringify([
          'Honesdale', 'Beach Lake', 'Hawley', 'Lake Ariel', 'Lakewood', 'Waymart',
          'White Mills', 'Peckville', 'Archbald', 'Carbondale', 'Clarks Summit',
          'Dalton', 'Factoryville', 'Jermyn', 'Jessup', 'Moscow', 'Olyphant',
          'Scranton', 'Taylor', 'Old Forge', 'Waverly', 'East Stroudsburg',
          'Stroudsburg', 'Mount Pocono', 'Tobyhanna', 'Pocono Summit', 'Pocono Lake',
          'Canadensis', 'Cresco', 'Swiftwater', 'Tannersville', 'Bushkill',
          'Delaware Water Gap', 'Dingmans Ferry', 'Matamoras', 'Milford', 'Shohola',
          'Tafton', 'Paupack', 'Forest City', 'Hallstead', 'Tunkhannock',
          'Lake Winola', 'Nicholson', 'Jim Thorpe', 'Bethany', 'Milanville',
          'Newfoundland', 'Hamlin', 'Prompton', 'South Canaan', 'The Hideout'
        ]),
        serviceCounties: JSON.stringify([
          'Wayne', 'Lackawanna', 'Monroe', 'Pike', 'Susquehanna', 'Wyoming', 'Carbon'
        ]),
        serviceAreaRadius: 50,
        lat: 41.4695,
        lng: -75.5882,
        paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'diesel']),
        minimumGallons: null,
        hoursWeekday: '8:00 AM - 4:30 PM',
        hoursSaturday: null,
        hoursSunday: null,
        weekendDelivery: false,
        emergencyDelivery: false,
        emergencyPhone: null,
        seniorDiscount: false,
        active: true,
        verified: false,
        allowPriceDisplay: true, // Online ordering available
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date()
      },

      // FIRMSTONE LAKEWOOD FUELS - Honesdale, PA
      {
        id: uuidv4(),
        name: 'Firmstone Lakewood Fuels',
        slug: 'firmstone-lakewood-fuels',
        phone: '(570) 253-1200',
        email: null,
        website: 'https://www.flfuels.com',
        addressLine1: '47 Brown Street',
        city: 'Honesdale',
        state: 'PA',
        postalCodesServed: JSON.stringify([
          // Wayne County
          '18431', // Honesdale
          '18473', // White Mills
          '18456', // Prompton
          '18472', // Waymart
          '18438', // Lakeville
          '18436', // Lake Ariel
          '18428', // Hawley
          '18451', // Paupack
          '18464', // Tafton
          '18435', // Lakewood
          '18405', // Beach Lake
          '18415', // Damascus
          '18443', // Milanville
          '18457', // Rowland
          '18469', // Tyler Hill
          '18453', // Pleasant Mount
          // Pike County
          '18324', // Bushkill
          '18328', // Dingmans Ferry
          '18337', // Milford
          '18340', // Millrift
          '18371', // Shohola
          // Susquehanna County
          '18407', // Carbondale (partial)
        ]),
        serviceCities: JSON.stringify([
          'Honesdale', 'White Mills', 'Prompton', 'Waymart', 'Lakeville', 'Lake Ariel',
          'Hawley', 'Paupack', 'Tafton', 'Lakewood', 'Beach Lake', 'Damascus',
          'Milanville', 'Rowland', 'Tyler Hill', 'Pleasant Mount', 'Bushkill',
          'Dingmans Ferry', 'Milford', 'Millrift', 'Shohola'
        ]),
        serviceCounties: JSON.stringify(['Wayne', 'Pike', 'Susquehanna']),
        serviceAreaRadius: 30,
        lat: 41.5767,
        lng: -75.2585,
        paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'diesel']),
        minimumGallons: 150,
        hoursWeekday: '7:00 AM - 3:30 PM',
        hoursSaturday: null,
        hoursSunday: null,
        weekendDelivery: false,
        emergencyDelivery: false,
        emergencyPhone: null,
        seniorDiscount: false,
        active: true,
        verified: false,
        allowPriceDisplay: false, // Wix site, prices not easily scrapable
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    // Insert suppliers
    for (const supplier of suppliers) {
      try {
        await sequelize.query(`
          INSERT INTO suppliers (
            id, name, slug, phone, email, website,
            address_line1, city, state,
            postal_codes_served, service_cities, service_counties, service_area_radius,
            lat, lng,
            payment_methods, fuel_types, minimum_gallons,
            hours_weekday, hours_saturday, hours_sunday,
            weekend_delivery, emergency_delivery, emergency_phone,
            senior_discount, active, verified, allow_price_display, notes,
            created_at, updated_at
          ) VALUES (
            :id, :name, :slug, :phone, :email, :website,
            :addressLine1, :city, :state,
            :postalCodesServed, :serviceCities, :serviceCounties, :serviceAreaRadius,
            :lat, :lng,
            :paymentMethods, :fuelTypes, :minimumGallons,
            :hoursWeekday, :hoursSaturday, :hoursSunday,
            :weekendDelivery, :emergencyDelivery, :emergencyPhone,
            :seniorDiscount, :active, :verified, :allowPriceDisplay, :notes,
            :createdAt, :updatedAt
          )
          ON CONFLICT (slug) DO NOTHING
        `, {
          replacements: {
            ...supplier,
            addressLine1: supplier.addressLine1 || null,
            email: supplier.email || null,
            minimumGallons: supplier.minimumGallons || null,
            hoursWeekday: supplier.hoursWeekday || null,
            hoursSaturday: supplier.hoursSaturday || null,
            hoursSunday: supplier.hoursSunday || null,
            emergencyPhone: supplier.emergencyPhone || null,
            notes: supplier.notes || null,
            allowPriceDisplay: supplier.allowPriceDisplay === true
          }
        });
        console.log(`Added supplier: ${supplier.name}`);
      } catch (error) {
        console.warn(`Failed to add ${supplier.name}:`, error.message);
      }
    }

    // Safety: ensure allowPriceDisplay is correctly set
    const slugsToDisablePrice = [
      'reo-and-sons-fuel',
      'river-valley-oil-service',
      'firmstone-lakewood-fuels'
    ];

    await sequelize.query(`
      UPDATE suppliers SET allow_price_display = false
      WHERE slug IN (:slugs) AND allow_price_display = true
    `, {
      replacements: { slugs: slugsToDisablePrice }
    });

    console.log('Migration 047 complete: Added 8 coverage gap suppliers');
  },

  async down(sequelize) {
    const slugs = [
      'ranson-fuel',
      'reo-and-sons-fuel',
      'central-bucks-oil',
      'brazos-oil-llc',
      'river-valley-oil-service',
      'highhouse-energy',
      'santarelli-sons-oil',
      'firmstone-lakewood-fuels'
    ];

    await sequelize.query(`
      DELETE FROM suppliers WHERE slug IN (:slugs)
    `, {
      replacements: { slugs }
    });

    console.log('Migration 047 rolled back');
  }
};
