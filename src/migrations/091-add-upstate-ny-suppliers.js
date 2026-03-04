/**
 * Migration 091: Add upstate NY suppliers for Oneida/Herkimer/Madison coverage gap
 *
 * Coverage gap fix: ZIP 13364 (Leonardsville, Madison County NY) had ZERO suppliers
 * (13364 was missing from zip-database — fixed separately).
 * Jennison Fuels (migration 040) already covers 13364 but was the only supplier.
 *
 * New suppliers added:
 *   - Glider Oil (Pulaski, NY) — 11 counties, COD/will-call confirmed. No scrapable prices.
 *     Already in scrape-config (enabled) but had no DB record.
 *   - Nassimos Fuels (Madison, NY) — Madison/Oneida/Herkimer counties. COD confirmed.
 *     No scrapable prices.
 *
 * Sources: glideroil.com, nassimosfuels.com, HeatFleet, FuelWonk.
 */

const { upsertSupplier } = require('./lib/upsert-supplier');

module.exports = {
  name: '091-add-upstate-ny-suppliers',

  async up(sequelize) {
    const suppliers = [
      {
        name: 'Glider Oil',
        slug: 'glider-oil',
        phone: '(800) 724-3835',
        email: null,
        website: 'https://glideroil.com',
        addressLine1: '5276 U.S. Route 11',
        city: 'Pulaski',
        state: 'NY',
        postalCodesServed: JSON.stringify([
          // Oswego County (core — HQ here)
          '13028', // Bernhards Bay
          '13036', // Central Square
          '13044', // Constantia
          '13069', // Fulton
          '13074', // Hannibal
          '13076', // Hastings
          '13083', // Lacona
          '13114', // Mexico
          '13126', // Oswego
          '13131', // Parish
          '13132', // Pennellville
          '13135', // Phoenix
          '13142', // Pulaski (HQ)
          '13144', // Richland
          '13145', // Sandy Creek
          '13167', // West Monroe
          '13302', // Altmar
          '13437', // Redfield
          '13493', // Williamstown
          // Jefferson County
          '13601', // Watertown
          '13605', // Smithville
          '13606', // Adams Center
          '13608', // Antwerp
          '13615', // Brownville
          '13619', // Carthage
          '13634', // Dexter
          '13637', // Evans Mills
          '13650', // Henderson
          '13659', // Lorraine
          '13661', // Mannsville
          '13673', // Philadelphia
          '13682', // Rodman
          '13685', // Sackets Harbor
          '13693', // Three Mile Bay
          // Onondaga County
          '13027', // Baldwinsville
          '13029', // Brewerton
          '13030', // Bridgeport
          '13031', // Camillus
          '13039', // Cicero
          '13041', // Clay
          '13057', // East Syracuse
          '13060', // Elbridge
          '13066', // Fayetteville
          '13080', // Jordan
          '13088', // Liverpool
          '13090', // Bayberry
          '13104', // Manlius
          '13112', // Memphis
          '13116', // Minoa
          '13164', // Warners
          '13202', // Syracuse
          '13203', // Syracuse
          '13204', // Syracuse
          '13205', // Syracuse
          '13206', // Syracuse
          '13207', // Syracuse
          '13208', // Syracuse
          '13209', // Solvay
          '13210', // Syracuse
          '13211', // Mattydale
          '13212', // North Syracuse
          '13214', // DeWitt
          '13219', // Syracuse
          // Lewis County
          '13312', // Glenfield
          '13325', // Constableville
          '13327', // Croghan
          '13368', // Lyons Falls
          '13433', // Port Leyden
          '13473', // Turin
          '13489', // West Leyden
          '13620', // Castorland
          '13626', // Copenhagen
          // Oneida County
          '13042', // Cleveland
          '13054', // Durhamville
          '13308', // Blossvale
          '13316', // Camden
          '13323', // Clinton
          '13354', // Holland Patent
          '13403', // Marcy
          '13413', // New Hartford
          '13424', // Oriskany
          '13440', // Rome
          '13461', // Sherrill
          '13471', // Taberg
          '13476', // Vernon
          '13478', // Verona
          '13483', // Westdale
          '13490', // Westmoreland
          '13492', // Whitesboro
          '13501', // Utica
          '13502', // Utica
          // Madison County
          '13032', // Canastota
          '13037', // Chittenango
          '13082', // Kirkville
          '13310', // Bouckville
          '13346', // Hamilton
          '13402', // Madison
          '13408', // Morrisville
          '13421', // Oneida
          // Herkimer County
          '13340', // Frankfort
          '13350', // Herkimer
          '13357', // Ilion
          '13365', // Little Falls
          '13407', // Mohawk
          '13416', // Newport
          // Cayuga County
          '13021', // Auburn
          '13033', // Cato
          '13034', // Cayuga
          '13111', // Martville
          '13140', // Port Byron
          '13147', // Venice Center
          '13156', // Sterling
          '13166', // Weedsport
          // Cortland County
          '13045', // Cortland
          '13077', // Homer
          '13101', // McGraw
          // Tompkins County
          '13053', // Dryden
          '13073', // Groton
          '14850', // Ithaca
        ]),
        serviceCities: JSON.stringify([
          'Pulaski', 'Oswego', 'Fulton', 'Mexico', 'Sandy Creek', 'Parish', 'Central Square',
          'Watertown', 'Carthage', 'Adams Center', 'Sackets Harbor',
          'Syracuse', 'Baldwinsville', 'Liverpool', 'Cicero', 'Clay', 'Fayetteville',
          'Camden', 'Rome', 'Utica', 'New Hartford', 'Clinton', 'Whitesboro',
          'Canastota', 'Oneida', 'Hamilton', 'Chittenango', 'Morrisville',
          'Herkimer', 'Ilion', 'Little Falls', 'Mohawk', 'Frankfort',
          'Auburn', 'Weedsport', 'Port Byron',
          'Cortland', 'Homer',
          'Ithaca', 'Dryden', 'Groton',
          'Copenhagen', 'Constableville', 'Lowville',
        ]),
        serviceCounties: JSON.stringify([
          'Oswego', 'Jefferson', 'Onondaga', 'Lewis', 'Oneida', 'Madison',
          'Herkimer', 'Cayuga', 'Cortland', 'Tompkins',
        ]),
        serviceAreaRadius: 75,
        lat: 43.3890,
        lng: -76.1271,
        hoursWeekday: '8:00 AM - 5:00 PM',
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: false,
        weekendDelivery: false,
        paymentMethods: JSON.stringify(['cash', 'credit_card', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'propane', 'diesel']),
        minimumGallons: null,
        seniorDiscount: false,
        allowPriceDisplay: false,
        notes: null,
        active: true,
      },
      {
        name: 'Nassimos Fuels',
        slug: 'nassimos-fuels',
        phone: '(315) 821-6400',
        email: 'l.nassimos@nassimosfuels.com',
        website: 'https://nassimosfuels.com',
        addressLine1: '7470 Brookside Rd',
        city: 'Madison',
        state: 'NY',
        postalCodesServed: JSON.stringify([
          // Madison County (core)
          '13032', // Canastota
          '13035', // Cazenovia
          '13037', // Chittenango
          '13052', // DeRuyter
          '13061', // Erieville
          '13072', // Georgetown
          '13122', // New Woodstock
          '13310', // Bouckville
          '13314', // Brookfield
          '13332', // Earlville
          '13334', // Eaton
          '13346', // Hamilton
          '13355', // Hubbardsville
          '13364', // Leonardsville
          '13402', // Madison (HQ)
          '13408', // Morrisville
          '13409', // Munnsville
          '13418', // North Brookfield
          '13421', // Oneida
          '13425', // Oriskany Falls
          '13485', // West Edmeston
          // Oneida County (partial)
          '13313', // Bridgewater
          '13318', // Cassville
          '13322', // Clayville
          '13323', // Clinton
          '13328', // Deansboro
          '13413', // New Hartford
          '13456', // Sauquoit
          '13480', // Waterville
          '13501', // Utica
          '13502', // Utica
          // Herkimer County (partial)
          '13350', // Herkimer
          '13357', // Ilion
          '13361', // Jordanville
          '13406', // Middleville
          '13491', // West Winfield
        ]),
        serviceCities: JSON.stringify([
          'Madison', 'Hamilton', 'Morrisville', 'Cazenovia', 'Earlville',
          'Oneida', 'Canastota', 'Chittenango', 'Munnsville', 'Brookfield',
          'Leonardsville', 'West Edmeston', 'Bouckville', 'Hubbardsville',
          'Utica', 'New Hartford', 'Clinton', 'Waterville', 'Bridgewater',
          'Herkimer', 'Ilion', 'West Winfield', 'Oriskany Falls',
        ]),
        serviceCounties: JSON.stringify(['Madison', 'Oneida', 'Herkimer']),
        serviceAreaRadius: 30,
        lat: 42.8995,
        lng: -75.5113,
        hoursWeekday: '8:00 AM - 5:00 PM',
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: false,
        weekendDelivery: false,
        paymentMethods: JSON.stringify(['cash', 'credit_card', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'kerosene']),
        minimumGallons: null,
        seniorDiscount: false,
        allowPriceDisplay: false,
        notes: null,
        active: true,
      },
    ];

    for (const supplier of suppliers) {
      await upsertSupplier(sequelize, supplier);
      console.log(`[Migration 091] ${supplier.name} (${supplier.city}, ${supplier.state}) — upserted`);
    }
  },

  async down(sequelize) {
    await sequelize.query(`
      DELETE FROM suppliers WHERE slug IN ('glider-oil', 'nassimos-fuels')
    `);
    console.log('[Migration 091] Rolled back');
  }
};
