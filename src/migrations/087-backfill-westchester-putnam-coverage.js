/**
 * Migration 087: Backfill postalCodesServed for 10 existing Hudson Valley suppliers
 *
 * Coverage gap fix: ZIP 10568 (Peekskill) and surrounding area showed NO coverage
 * despite these suppliers being enabled for price scraping. Root cause: no
 * postalCodesServed arrays configured, so ZIP-based search returned zero results.
 *
 * Suppliers updated (all COD/On Demand confirmed via HeatFleet/FuelWonk/company website):
 *   - Action Fuel Oil (Mahopac, NY) — Upper Westchester/Putnam/Dutchess/Orange/Rockland
 *   - Chrysalis Fuel Inc (Cold Spring, NY) — Same corridor + Ulster
 *   - Buy Rite Fuel (Peekskill, NY) — Same corridor
 *   - ACS Oil Service (Bronx, NY) — Bronx/Lower Westchester/NYC
 *   - Superior Fuel Oil (Peekskill/Mohegan Lake, NY) — Upper Westchester/Putnam/Rockland/Orange/Dutchess
 *   - Stormville Oil (Stormville, NY) — Dutchess/Putnam/Upper Westchester/Orange
 *   - Hunter's Oil (Wappingers Falls, NY) — Dutchess/Putnam/Northern Westchester
 *   - Jurassic Fuels (Poughkeepsie, NY) — Dutchess/Putnam/Ulster/Orange + parts of Westchester
 *   - Economy Oil (Fishkill, NY) — Dutchess/Putnam/Orange/Ulster/Sullivan/Columbia/Greene/Delaware
 *   - Supreme Oil (White Plains, NY) — Mid/Lower Westchester/Rockland/Bronx
 *
 * Also extends Euro Fuel Co's coverage to include 10566/10567/10568.
 *
 * Sources: Company websites, HeatFleet, FuelWonk. All confirmed COD/On Demand.
 */

const { v4: uuidv4 } = require('uuid');

module.exports = {
  name: '087-backfill-westchester-putnam-coverage',

  async up(sequelize) {
    const suppliers = [
      {
        id: uuidv4(),
        name: 'Action Fuel Oil',
        slug: 'action-fuel-oil',
        phone: '(845) 621-5100',
        email: null,
        website: 'https://www.actionfueloil.net',
        addressLine1: '39 Secor Rd',
        city: 'Mahopac',
        state: 'NY',
        postalCodesServed: JSON.stringify([
          // Putnam County
          '10509', // Brewster
          '10512', // Carmel
          '10516', // Cold Spring
          '10524', // Garrison
          '10537', // Lake Peekskill
          '10541', // Mahopac (HQ)
          '10542', // Mahopac Falls
          '10579', // Putnam Valley
          '12563', // Patterson
          // Westchester County (upper)
          '10501', // Amawalk
          '10505', // Baldwin Place
          '10506', // Bedford
          '10507', // Bedford Hills
          '10510', // Briarcliff Manor
          '10511', // Buchanan
          '10514', // Chappaqua
          '10517', // Crompond
          '10518', // Cross River
          '10519', // Croton Falls
          '10520', // Croton-on-Hudson
          '10526', // Goldens Bridge
          '10527', // Granite Springs
          '10535', // Jefferson Valley
          '10536', // Katonah
          '10545', // Maryknoll
          '10546', // Millwood
          '10547', // Mohegan Lake
          '10548', // Montrose
          '10549', // Mount Kisco
          '10560', // North Salem
          '10562', // Ossining
          '10566', // Peekskill
          '10567', // Cortlandt Manor
          '10568', // Peekskill (alternate)
          '10570', // Pleasantville
          '10576', // Pound Ridge
          '10578', // Purdys
          '10587', // Shenorock
          '10588', // Shrub Oak
          '10589', // Somers
          '10590', // South Salem
          '10597', // Waccabuc
          '10598', // Yorktown Heights
          // Rockland County
          '10911', // Bear Mountain
          '10920', // Congers
          '10923', // Garnerville
          '10927', // Haverstraw
          '10980', // Stony Point
          '10984', // Thiells
          '10986', // Tomkins Cove
          '10993', // West Haverstraw
          // Orange County
          '10917', // Central Valley
          '10922', // Fort Montgomery
          '10928', // Highland Falls
          '10930', // Highland Mills
          '10975', // Southfields
          '10996', // West Point
          '12518', // Cornwall
          '12520', // Cornwall on Hudson
          '12550', // Newburgh
          '12553', // New Windsor
          // Dutchess County
          '12508', // Beacon
          '12524', // Fishkill
          '12531', // Holmes
          '12533', // Hopewell Junction
          '12537', // Hughsonville
          '12582', // Stormville
          '12590', // Wappingers Falls
        ]),
        serviceCities: JSON.stringify([
          'Mahopac', 'Mahopac Falls', 'Carmel', 'Brewster', 'Cold Spring', 'Garrison',
          'Lake Peekskill', 'Putnam Valley', 'Patterson',
          'Amawalk', 'Baldwin Place', 'Bedford', 'Bedford Hills', 'Briarcliff Manor',
          'Buchanan', 'Chappaqua', 'Crompond', 'Cross River', 'Croton Falls',
          'Croton-on-Hudson', 'Goldens Bridge', 'Granite Springs', 'Jefferson Valley',
          'Katonah', 'Maryknoll', 'Millwood', 'Mohegan Lake', 'Montrose', 'Mount Kisco',
          'North Salem', 'Ossining', 'Peekskill', 'Cortlandt Manor', 'Pleasantville',
          'Pound Ridge', 'Purdys', 'Shenorock', 'Shrub Oak', 'Somers', 'South Salem',
          'Waccabuc', 'Yorktown Heights',
          'Bear Mountain', 'Congers', 'Garnerville', 'Haverstraw', 'Stony Point',
          'Thiells', 'Tomkins Cove', 'West Haverstraw',
          'Central Valley', 'Fort Montgomery', 'Highland Falls', 'Highland Mills',
          'West Point', 'Cornwall', 'Cornwall on Hudson', 'Newburgh', 'New Windsor',
          'Beacon', 'Fishkill', 'Holmes', 'Hopewell Junction', 'Hughsonville',
          'Stormville', 'Wappingers Falls',
        ]),
        serviceCounties: JSON.stringify(['Putnam', 'Westchester', 'Rockland', 'Orange', 'Dutchess']),
        serviceAreaRadius: 30,
        lat: 41.3706,
        lng: -73.7351,
        hoursWeekday: '8:00 AM - 4:30 PM',
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: false,
        weekendDelivery: false,
        paymentMethods: JSON.stringify(['cash', 'credit_card']),
        fuelTypes: JSON.stringify(['heating_oil', 'propane']),
        minimumGallons: null,
        seniorDiscount: false,
        allowPriceDisplay: true,
        notes: null,
        active: true,
      },
      {
        id: uuidv4(),
        name: 'Chrysalis Fuel Inc',
        slug: 'chrysalis-fuel-inc',
        phone: '(845) 265-2002',
        email: 'chrysalisfuel@gmail.com',
        website: 'https://www.chrysalisfuelinc.com',
        addressLine1: '23 Gate House Rd',
        city: 'Cold Spring',
        state: 'NY',
        postalCodesServed: JSON.stringify([
          // Putnam County
          '10509', // Brewster
          '10512', // Carmel
          '10516', // Cold Spring (HQ)
          '10524', // Garrison
          '10537', // Lake Peekskill
          '10541', // Mahopac
          '10542', // Mahopac Falls
          '10579', // Putnam Valley
          '12563', // Patterson
          // Westchester County (upper)
          '10501', // Amawalk
          '10505', // Baldwin Place
          '10511', // Buchanan
          '10517', // Crompond
          '10519', // Croton Falls
          '10520', // Croton-on-Hudson
          '10526', // Goldens Bridge
          '10527', // Granite Springs
          '10535', // Jefferson Valley
          '10536', // Katonah
          '10547', // Mohegan Lake
          '10548', // Montrose
          '10566', // Peekskill
          '10567', // Cortlandt Manor
          '10568', // Peekskill (alternate)
          '10578', // Purdys
          '10587', // Shenorock
          '10588', // Shrub Oak
          '10589', // Somers
          '10598', // Yorktown Heights
          // Orange County
          '10910', // Arden
          '10914', // Blooming Grove
          '10916', // Campbell Hall
          '10917', // Central Valley
          '10922', // Fort Montgomery
          '10926', // Harriman
          '10928', // Highland Falls
          '10930', // Highland Mills
          '10950', // Monroe
          '10975', // Southfields
          '10992', // Washingtonville
          '10996', // West Point
          '12518', // Cornwall
          '12520', // Cornwall on Hudson
          '12543', // Maybrook
          '12550', // Newburgh
          '12553', // New Windsor
          '12575', // Rock Tavern
          '12577', // Salisbury Mills
          '12586', // Walden
          // Rockland County
          '10911', // Bear Mountain
          '10923', // Garnerville
          '10927', // Haverstraw
          '10980', // Stony Point
          '10984', // Thiells
          '10986', // Tomkins Cove
          '10993', // West Haverstraw
          // Dutchess County
          '12508', // Beacon
          '12524', // Fishkill
          '12531', // Holmes
          '12533', // Hopewell Junction
          '12537', // Hughsonville
          '12540', // Lagrangeville
          '12569', // Pleasant Valley
          '12570', // Poughquag
          '12582', // Stormville
          '12590', // Wappingers Falls
          '12601', // Poughkeepsie
        ]),
        serviceCities: JSON.stringify([
          'Cold Spring', 'Garrison', 'Carmel', 'Mahopac', 'Mahopac Falls', 'Brewster',
          'Lake Peekskill', 'Putnam Valley', 'Patterson',
          'Amawalk', 'Baldwin Place', 'Buchanan', 'Crompond', 'Croton Falls',
          'Croton-on-Hudson', 'Goldens Bridge', 'Granite Springs', 'Jefferson Valley',
          'Katonah', 'Mohegan Lake', 'Montrose', 'Peekskill', 'Cortlandt Manor',
          'Purdys', 'Shenorock', 'Shrub Oak', 'Somers', 'Yorktown Heights',
          'Arden', 'Blooming Grove', 'Campbell Hall', 'Central Valley',
          'Fort Montgomery', 'Harriman', 'Highland Falls', 'Highland Mills', 'Monroe',
          'Washingtonville', 'West Point', 'Cornwall', 'Cornwall on Hudson',
          'Maybrook', 'Newburgh', 'New Windsor', 'Rock Tavern', 'Salisbury Mills', 'Walden',
          'Bear Mountain', 'Garnerville', 'Haverstraw', 'Stony Point', 'Thiells',
          'Tomkins Cove', 'West Haverstraw',
          'Beacon', 'Fishkill', 'Holmes', 'Hopewell Junction', 'Hughsonville',
          'Lagrangeville', 'Pleasant Valley', 'Poughquag', 'Stormville',
          'Wappingers Falls', 'Poughkeepsie',
        ]),
        serviceCounties: JSON.stringify(['Putnam', 'Westchester', 'Orange', 'Rockland', 'Dutchess', 'Ulster']),
        serviceAreaRadius: 35,
        lat: 41.4201,
        lng: -73.9549,
        hoursWeekday: '8:00 AM - 4:30 PM',
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: false,
        weekendDelivery: false,
        paymentMethods: JSON.stringify(['cash', 'credit_card']),
        fuelTypes: JSON.stringify(['heating_oil']),
        minimumGallons: null,
        seniorDiscount: false,
        allowPriceDisplay: true,
        notes: null,
        active: true,
      },
      {
        id: uuidv4(),
        name: 'Buy Rite Fuel',
        slug: 'buy-rite-fuel',
        phone: '(914) 737-2200',
        email: 'buyritefuel@gmail.com',
        website: 'https://www.buyritefuel.net',
        addressLine1: '1223 Lincoln Terrace',
        city: 'Peekskill',
        state: 'NY',
        postalCodesServed: JSON.stringify([
          // Putnam County
          '10509', // Brewster
          '10512', // Carmel
          '10516', // Cold Spring
          '10524', // Garrison
          '10537', // Lake Peekskill
          '10541', // Mahopac
          '10542', // Mahopac Falls
          '10579', // Putnam Valley
          // Westchester County
          '10501', // Amawalk
          '10504', // Armonk
          '10505', // Baldwin Place
          '10506', // Bedford
          '10507', // Bedford Hills
          '10510', // Briarcliff Manor
          '10511', // Buchanan
          '10514', // Chappaqua
          '10517', // Crompond
          '10518', // Cross River
          '10519', // Croton Falls
          '10520', // Croton-on-Hudson
          '10526', // Goldens Bridge
          '10527', // Granite Springs
          '10532', // Hawthorne
          '10535', // Jefferson Valley
          '10536', // Katonah
          '10545', // Maryknoll
          '10546', // Millwood
          '10547', // Mohegan Lake
          '10548', // Montrose
          '10549', // Mount Kisco
          '10560', // North Salem
          '10562', // Ossining
          '10566', // Peekskill (HQ)
          '10567', // Cortlandt Manor
          '10568', // Peekskill (alternate)
          '10570', // Pleasantville
          '10576', // Pound Ridge
          '10578', // Purdys
          '10587', // Shenorock
          '10588', // Shrub Oak
          '10589', // Somers
          '10591', // Tarrytown
          '10594', // Thornwood
          '10595', // Valhalla
          '10597', // Waccabuc
          '10598', // Yorktown Heights
          // Rockland County
          '10901', // Suffern
          '10911', // Bear Mountain
          '10913', // Blauvelt
          '10920', // Congers
          '10923', // Garnerville
          '10927', // Haverstraw
          '10952', // Monsey
          '10954', // Nanuet
          '10956', // New City
          '10960', // Nyack
          '10962', // Orangeburg
          '10965', // Pearl River
          '10970', // Pomona
          '10977', // Spring Valley
          '10980', // Stony Point
          '10982', // Tallman
          '10984', // Thiells
          '10986', // Tomkins Cove
          '10989', // Valley Cottage
          '10993', // West Haverstraw
          '10994', // West Nyack
          // Orange County
          '10910', // Arden
          '10917', // Central Valley
          '10922', // Fort Montgomery
          '10926', // Harriman
          '10928', // Highland Falls
          '10930', // Highland Mills
          '10950', // Monroe
          '10975', // Southfields
          '10992', // Washingtonville
          '10996', // West Point
          '12518', // Cornwall
          '12520', // Cornwall on Hudson
          '12550', // Newburgh
          '12553', // New Windsor
          '12577', // Salisbury Mills
          // Dutchess County
          '12508', // Beacon
          '12524', // Fishkill
        ]),
        serviceCities: JSON.stringify([
          'Peekskill', 'Cortlandt Manor', 'Buchanan', 'Crompond', 'Lake Peekskill',
          'Mohegan Lake', 'Montrose', 'Croton-on-Hudson',
          'Amawalk', 'Armonk', 'Baldwin Place', 'Bedford', 'Bedford Hills',
          'Briarcliff Manor', 'Chappaqua', 'Cross River', 'Croton Falls',
          'Goldens Bridge', 'Granite Springs', 'Hawthorne', 'Jefferson Valley',
          'Katonah', 'Maryknoll', 'Millwood', 'Mount Kisco', 'North Salem',
          'Ossining', 'Pleasantville', 'Pound Ridge', 'Purdys', 'Shenorock',
          'Shrub Oak', 'Somers', 'Tarrytown', 'Thornwood', 'Valhalla',
          'Waccabuc', 'Yorktown Heights',
          'Suffern', 'Bear Mountain', 'Blauvelt', 'Congers', 'Garnerville',
          'Haverstraw', 'Monsey', 'Nanuet', 'New City', 'Nyack', 'Orangeburg',
          'Pearl River', 'Pomona', 'Spring Valley', 'Stony Point', 'Tallman',
          'Thiells', 'Tomkins Cove', 'Valley Cottage', 'West Haverstraw', 'West Nyack',
          'Central Valley', 'Fort Montgomery', 'Harriman', 'Highland Falls',
          'Highland Mills', 'Monroe', 'Washingtonville', 'West Point',
          'Cornwall', 'Cornwall on Hudson', 'Newburgh', 'New Windsor',
          'Beacon', 'Fishkill',
        ]),
        serviceCounties: JSON.stringify(['Westchester', 'Putnam', 'Rockland', 'Orange', 'Dutchess']),
        serviceAreaRadius: 30,
        lat: 41.2850,
        lng: -73.9143,
        hoursWeekday: '8:00 AM - 4:30 PM',
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: true,
        weekendDelivery: false,
        paymentMethods: JSON.stringify(['cash', 'credit_card']),
        fuelTypes: JSON.stringify(['heating_oil']),
        minimumGallons: 150,
        seniorDiscount: false,
        allowPriceDisplay: true,
        notes: null,
        active: true,
      },
      {
        id: uuidv4(),
        name: 'ACS Oil Service',
        slug: 'acs-oil-service',
        phone: '(718) 484-9594',
        email: 'info@acsoilservice.com',
        website: 'https://www.acsoilservice.com',
        addressLine1: '1103 E Gun Hill Rd',
        city: 'Bronx',
        state: 'NY',
        postalCodesServed: JSON.stringify([
          // Bronx County
          '10451', '10452', '10453', '10454', '10455', '10456', '10457', '10458',
          '10459', '10460', '10461', '10462', '10463', '10464', '10465', '10466',
          '10467', '10468', '10469', '10470', '10471', '10472', '10473', '10474', '10475',
          // Westchester County (lower/mid)
          '10502', // Ardsley
          '10503', // Ardsley-on-Hudson
          '10522', // Dobbs Ferry
          '10523', // Elmsford
          '10528', // Harrison
          '10530', // Hartsdale
          '10532', // Hawthorne
          '10533', // Irvington
          '10538', // Larchmont
          '10543', // Mamaroneck
          '10550', // Mount Vernon
          '10551', // Mount Vernon
          '10552', // Mount Vernon
          '10553', // Mount Vernon
          '10573', // Port Chester
          '10577', // Purchase
          '10580', // Rye
          '10583', // Scarsdale
          '10591', // Tarrytown
          '10594', // Thornwood
          '10595', // Valhalla
          '10601', // White Plains
          '10603', // White Plains
          '10604', // West Harrison
          '10605', // White Plains
          '10606', // White Plains
          '10607', // White Plains
          '10701', // Yonkers
          '10702', // Yonkers
          '10703', // Yonkers
          '10704', // Yonkers
          '10705', // Yonkers
          '10706', // Hastings-on-Hudson
          '10707', // Tuckahoe
          '10708', // Bronxville
          '10709', // Eastchester
          '10710', // Yonkers
          '10801', // New Rochelle
          '10802', // New Rochelle
          '10803', // Pelham
          '10804', // New Rochelle
          '10805', // New Rochelle
          // Rockland County (partial per HeatFleet)
          '10960', // Nyack
          '10965', // Pearl River
          '10983', // Tappan
        ]),
        serviceCities: JSON.stringify([
          'Bronx', 'Mount Vernon', 'White Plains', 'Yonkers',
          'Ardsley', 'Ardsley-on-Hudson', 'Dobbs Ferry', 'Elmsford', 'Harrison',
          'Hartsdale', 'Hawthorne', 'Irvington', 'Larchmont', 'Mamaroneck',
          'Port Chester', 'Purchase', 'Rye', 'Scarsdale', 'Tarrytown',
          'Thornwood', 'Valhalla', 'West Harrison',
          'Hastings-on-Hudson', 'Tuckahoe', 'Bronxville', 'Eastchester',
          'New Rochelle', 'Pelham',
          'Nyack', 'Pearl River', 'Tappan',
        ]),
        serviceCounties: JSON.stringify(['Bronx', 'Westchester', 'Rockland']),
        serviceAreaRadius: 25,
        lat: 40.8768,
        lng: -73.8632,
        hoursWeekday: '8:00 AM - 4:30 PM',
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: false,
        weekendDelivery: false,
        paymentMethods: JSON.stringify(['cash', 'credit_card']),
        fuelTypes: JSON.stringify(['heating_oil']),
        minimumGallons: null,
        seniorDiscount: false,
        allowPriceDisplay: true,
        notes: null,
        active: true,
      },
      {
        id: uuidv4(),
        name: 'Superior Fuel Oil',
        slug: 'superior-fuel-oil',
        phone: '(914) 930-8655',
        email: null,
        website: 'https://www.superiorfueloilinc.com',
        addressLine1: 'Highland Ave',
        city: 'Peekskill',
        state: 'NY',
        postalCodesServed: JSON.stringify([
          // Westchester County (upper/mid)
          '10501', // Amawalk
          '10505', // Baldwin Place
          '10506', // Bedford
          '10507', // Bedford Hills
          '10510', // Briarcliff Manor
          '10511', // Buchanan
          '10514', // Chappaqua
          '10517', // Crompond
          '10518', // Cross River
          '10519', // Croton Falls
          '10520', // Croton-on-Hudson
          '10526', // Goldens Bridge
          '10527', // Granite Springs
          '10535', // Jefferson Valley
          '10536', // Katonah
          '10545', // Maryknoll
          '10546', // Millwood
          '10547', // Mohegan Lake (HQ area)
          '10548', // Montrose
          '10549', // Mount Kisco
          '10560', // North Salem
          '10562', // Ossining
          '10566', // Peekskill
          '10567', // Cortlandt Manor
          '10568', // Peekskill (alternate)
          '10570', // Pleasantville
          '10578', // Purdys
          '10587', // Shenorock
          '10588', // Shrub Oak
          '10589', // Somers
          '10591', // Tarrytown
          '10594', // Thornwood
          '10598', // Yorktown Heights
          // Putnam County
          '10509', // Brewster
          '10512', // Carmel
          '10516', // Cold Spring
          '10524', // Garrison
          '10537', // Lake Peekskill
          '10541', // Mahopac
          '10542', // Mahopac Falls
          '10579', // Putnam Valley
          // Rockland County
          '10901', // Suffern
          '10911', // Bear Mountain
          '10913', // Blauvelt
          '10920', // Congers
          '10923', // Garnerville
          '10927', // Haverstraw
          '10952', // Monsey
          '10954', // Nanuet
          '10956', // New City
          '10960', // Nyack
          '10970', // Pomona
          '10977', // Spring Valley
          '10980', // Stony Point
          '10982', // Tallman
          '10984', // Thiells
          '10986', // Tomkins Cove
          '10989', // Valley Cottage
          '10993', // West Haverstraw
          '10994', // West Nyack
          // Orange County
          '10910', // Arden
          '10917', // Central Valley
          '10922', // Fort Montgomery
          '10926', // Harriman
          '10928', // Highland Falls
          '10930', // Highland Mills
          '10950', // Monroe
          '10975', // Southfields
          '10992', // Washingtonville
          '10996', // West Point
          '12518', // Cornwall
          '12520', // Cornwall on Hudson
          '12550', // Newburgh
          '12553', // New Windsor
          '12577', // Salisbury Mills
          // Dutchess County
          '12508', // Beacon
          '12524', // Fishkill
        ]),
        serviceCities: JSON.stringify([
          'Peekskill', 'Buchanan', 'Cortlandt Manor', 'Montrose', 'Lake Peekskill',
          'Crompond', 'Croton-on-Hudson', 'Mohegan Lake', 'Shrub Oak', 'Yorktown Heights',
          'Jefferson Valley', 'Amawalk', 'Granite Springs', 'Shenorock', 'Somers',
          'Baldwin Place', 'Maryknoll', 'Millwood', 'Ossining', 'Briarcliff Manor',
          'Chappaqua', 'Mount Kisco', 'Katonah', 'Bedford Hills', 'Pleasantville',
          'Thornwood', 'Tarrytown', 'Goldens Bridge', 'Cross River', 'Croton Falls',
          'North Salem', 'Purdys',
          'Mahopac', 'Mahopac Falls', 'Carmel', 'Cold Spring', 'Garrison',
          'Brewster', 'Putnam Valley',
          'Bear Mountain', 'Tomkins Cove', 'Haverstraw', 'West Haverstraw', 'Stony Point',
          'Garnerville', 'Thiells', 'Congers', 'New City', 'Pomona', 'Nyack',
          'Nanuet', 'Spring Valley', 'Suffern', 'Monsey', 'Tallman', 'Blauvelt',
          'Valley Cottage', 'West Nyack',
          'Fort Montgomery', 'Highland Falls', 'Highland Mills', 'Central Valley',
          'Cornwall', 'Cornwall on Hudson', 'Monroe', 'Harriman', 'Arden', 'Southfields',
          'Washingtonville', 'West Point', 'New Windsor', 'Newburgh', 'Salisbury Mills',
          'Beacon', 'Fishkill',
        ]),
        serviceCounties: JSON.stringify(['Westchester', 'Putnam', 'Rockland', 'Orange', 'Dutchess']),
        serviceAreaRadius: 30,
        lat: 41.2850,
        lng: -73.9200,
        hoursWeekday: '8:00 AM - 4:30 PM',
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: true,
        weekendDelivery: false,
        paymentMethods: JSON.stringify(['cash', 'credit_card']),
        fuelTypes: JSON.stringify(['heating_oil']),
        minimumGallons: 150,
        seniorDiscount: false,
        allowPriceDisplay: true,
        notes: null,
        active: true,
      },
      {
        id: uuidv4(),
        name: 'Stormville Oil',
        slug: 'stormville-oil',
        phone: '(845) 226-3100',
        email: null,
        website: 'https://www.stormvilleoil.com',
        addressLine1: '675 Leetown Rd',
        city: 'Stormville',
        state: 'NY',
        postalCodesServed: JSON.stringify([
          // Dutchess County
          '12508', // Beacon
          '12522', // Dover Plains
          '12524', // Fishkill
          '12531', // Holmes
          '12533', // Hopewell Junction
          '12537', // Hughsonville
          '12540', // Lagrangeville
          '12545', // Millbrook
          '12564', // Pawling
          '12569', // Pleasant Valley
          '12570', // Poughquag
          '12578', // Salt Point
          '12580', // Staatsburg
          '12582', // Stormville (HQ)
          '12585', // Verbank
          '12590', // Wappingers Falls
          '12594', // Wingdale
          '12601', // Poughkeepsie
          // Putnam County
          '10509', // Brewster
          '10512', // Carmel
          '10516', // Cold Spring
          '10524', // Garrison
          '10537', // Lake Peekskill
          '10541', // Mahopac
          '10542', // Mahopac Falls
          '10579', // Putnam Valley
          '12563', // Patterson
          // Westchester County (upper)
          '10501', // Amawalk
          '10505', // Baldwin Place
          '10517', // Crompond
          '10518', // Cross River
          '10519', // Croton Falls
          '10520', // Croton-on-Hudson
          '10526', // Goldens Bridge
          '10527', // Granite Springs
          '10535', // Jefferson Valley
          '10536', // Katonah
          '10547', // Mohegan Lake
          '10560', // North Salem
          '10566', // Peekskill
          '10567', // Cortlandt Manor
          '10568', // Peekskill (alternate)
          '10578', // Purdys
          '10587', // Shenorock
          '10588', // Shrub Oak
          '10589', // Somers
          '10597', // Waccabuc
          '10598', // Yorktown Heights
          // Orange County
          '10922', // Fort Montgomery
          '10928', // Highland Falls
          '10996', // West Point
          '12518', // Cornwall
          '12520', // Cornwall on Hudson
          '12550', // Newburgh
          '12553', // New Windsor
          // Rockland County
          '10911', // Bear Mountain
        ]),
        serviceCities: JSON.stringify([
          'Stormville', 'Carmel', 'Holmes', 'Hopewell Junction', 'Poughquag',
          'Cold Spring', 'Pawling', 'Fishkill', 'Patterson', 'Lagrangeville',
          'Mahopac', 'Wappingers Falls', 'Hughsonville', 'Brewster', 'Putnam Valley',
          'Mahopac Falls', 'Beacon', 'Poughkeepsie', 'Pleasant Valley',
          'Baldwin Place', 'Croton Falls', 'Shenorock', 'Wingdale', 'Jefferson Valley',
          'Somers', 'Shrub Oak', 'Granite Springs', 'Dover Plains', 'Garrison',
          'Purdys', 'North Salem', 'Lake Peekskill', 'Katonah', 'Mohegan Lake',
          'Amawalk', 'Goldens Bridge', 'Yorktown Heights', 'Crompond', 'Waccabuc',
          'Cortlandt Manor', 'Peekskill', 'Cross River',
          'Highland Falls', 'Bear Mountain', 'Fort Montgomery', 'West Point',
          'Cornwall', 'Cornwall on Hudson', 'New Windsor', 'Newburgh',
          'Millbrook', 'Salt Point', 'Verbank',
        ]),
        serviceCounties: JSON.stringify(['Dutchess', 'Putnam', 'Westchester', 'Orange', 'Rockland']),
        serviceAreaRadius: 35,
        lat: 41.5370,
        lng: -73.7294,
        hoursWeekday: '7:00 AM - 4:30 PM',
        hoursSaturday: '7:00 AM - 4:30 PM',
        hoursSunday: '7:00 AM - 4:30 PM',
        emergencyDelivery: false,
        weekendDelivery: true,
        paymentMethods: JSON.stringify(['cash', 'credit_card']),
        fuelTypes: JSON.stringify(['heating_oil']),
        minimumGallons: 150,
        seniorDiscount: false,
        allowPriceDisplay: true,
        notes: null,
        active: true,
      },
      {
        id: uuidv4(),
        name: "Hunter's Oil",
        slug: 'hunters-oil',
        phone: '(845) 227-0554',
        email: null,
        website: 'https://www.huntersoil.com',
        addressLine1: null,
        city: 'Wappingers Falls',
        state: 'NY',
        postalCodesServed: JSON.stringify([
          // Dutchess County
          '12508', // Beacon
          '12514', // Clinton Corners
          '12522', // Dover Plains
          '12524', // Fishkill
          '12531', // Holmes
          '12533', // Hopewell Junction
          '12537', // Hughsonville
          '12538', // Hyde Park
          '12540', // Lagrangeville
          '12545', // Millbrook
          '12564', // Pawling
          '12569', // Pleasant Valley
          '12570', // Poughquag
          '12578', // Salt Point
          '12580', // Staatsburg
          '12582', // Stormville
          '12585', // Verbank
          '12590', // Wappingers Falls (HQ)
          '12594', // Wingdale
          '12601', // Poughkeepsie
          // Putnam County
          '10512', // Carmel
          '10516', // Cold Spring
          '10524', // Garrison
          '10537', // Lake Peekskill
          '10541', // Mahopac
          '10542', // Mahopac Falls
          '10579', // Putnam Valley
          '12563', // Patterson
          // Westchester County (northern edge)
          '10505', // Baldwin Place
          '10535', // Jefferson Valley
          '10547', // Mohegan Lake
          '10588', // Shrub Oak
          // Orange County
          '10914', // Blooming Grove
          '10916', // Campbell Hall
          '10922', // Fort Montgomery
          '10928', // Highland Falls
          '10930', // Highland Mills
          '10992', // Washingtonville
          '10996', // West Point
          '12518', // Cornwall
          '12520', // Cornwall on Hudson
          '12543', // Maybrook
          '12549', // Montgomery
          '12550', // Newburgh
          '12553', // New Windsor
          '12566', // Pine Bush
          '12575', // Rock Tavern
          '12577', // Salisbury Mills
          '12586', // Walden
          '12589', // Wallkill
          // Ulster County
          '12401', // Kingston
          '12404', // Accord
          '12429', // Cottekill
          '12440', // High Falls
          '12443', // Hurley
          '12466', // Port Ewen
          '12477', // Rifton
          '12484', // Rosendale
          '12487', // Tillson
          '12489', // Ulster Park
          '12515', // Clintondale
          '12528', // Highland
          '12547', // Milton
          '12561', // New Paltz
          '12568', // Plattekill
        ]),
        serviceCities: JSON.stringify([
          'Wappingers Falls', 'Hughsonville', 'Fishkill', 'Beacon', 'Hopewell Junction',
          'Poughkeepsie', 'Hyde Park', 'Pleasant Valley', 'Lagrangeville', 'Stormville',
          'Poughquag', 'Holmes', 'Pawling', 'Dover Plains', 'Wingdale', 'Millbrook',
          'Salt Point', 'Verbank', 'Clinton Corners', 'Staatsburg',
          'Carmel', 'Cold Spring', 'Garrison', 'Mahopac', 'Mahopac Falls',
          'Lake Peekskill', 'Putnam Valley', 'Patterson',
          'Baldwin Place', 'Jefferson Valley', 'Mohegan Lake', 'Shrub Oak',
          'Newburgh', 'New Windsor', 'Cornwall', 'Cornwall on Hudson', 'West Point',
          'Fort Montgomery', 'Highland Falls', 'Highland Mills', 'Blooming Grove',
          'Campbell Hall', 'Washingtonville', 'Maybrook', 'Montgomery', 'Walden',
          'Wallkill', 'Pine Bush', 'Rock Tavern', 'Salisbury Mills',
          'Kingston', 'Highland', 'Milton', 'Clintondale', 'New Paltz', 'Plattekill',
          'Marlboro', 'Modena', 'Gardiner', 'Tillson', 'Rosendale', 'High Falls',
          'Port Ewen', 'Rifton', 'Ulster Park', 'Accord', 'Cottekill', 'Hurley',
        ]),
        serviceCounties: JSON.stringify(['Dutchess', 'Putnam', 'Westchester', 'Orange', 'Ulster']),
        serviceAreaRadius: 35,
        lat: 41.5959,
        lng: -73.9118,
        hoursWeekday: '8:00 AM - 4:30 PM',
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: false,
        weekendDelivery: false,
        paymentMethods: JSON.stringify(['cash', 'credit_card']),
        fuelTypes: JSON.stringify(['heating_oil']),
        minimumGallons: null,
        seniorDiscount: false,
        allowPriceDisplay: true,
        notes: null,
        active: true,
      },
      {
        id: uuidv4(),
        name: 'Jurassic Fuels',
        slug: 'jurassic-fuels',
        phone: '(845) 444-9044',
        email: null,
        website: 'https://www.jurassicfuelsinc.com',
        addressLine1: null,
        city: 'Poughkeepsie',
        state: 'NY',
        postalCodesServed: JSON.stringify([
          // Dutchess County
          '12501', // Amenia
          '12507', // Bangall
          '12508', // Beacon
          '12514', // Clinton Corners
          '12522', // Dover Plains
          '12524', // Fishkill
          '12531', // Holmes
          '12533', // Hopewell Junction
          '12537', // Hughsonville
          '12538', // Hyde Park
          '12540', // Lagrangeville
          '12545', // Millbrook
          '12564', // Pawling
          '12569', // Pleasant Valley
          '12570', // Poughquag
          '12571', // Red Hook
          '12572', // Rhinebeck
          '12574', // Rhinecliff
          '12578', // Salt Point
          '12580', // Staatsburg
          '12581', // Stanfordville
          '12582', // Stormville
          '12585', // Verbank
          '12590', // Wappingers Falls
          '12592', // Wassaic
          '12594', // Wingdale
          '12601', // Poughkeepsie
          // Putnam County
          '10512', // Carmel
          '10516', // Cold Spring
          '10541', // Mahopac
          '10579', // Putnam Valley
          // Orange County
          '10996', // West Point
          '12518', // Cornwall
          '12520', // Cornwall on Hudson
          '12543', // Maybrook
          '12549', // Montgomery
          '12550', // Newburgh
          '12553', // New Windsor
          '12566', // Pine Bush
          '12575', // Rock Tavern
          '12577', // Salisbury Mills
          '12586', // Walden
          '12589', // Wallkill
          // Ulster County
          '12401', // Kingston
          '12404', // Accord
          '12429', // Cottekill
          '12440', // High Falls
          '12443', // Hurley
          '12458', // Olivebridge
          '12461', // West Hurley (mapped to general area)
          '12466', // Port Ewen
          '12477', // Rifton
          '12484', // Rosendale
          '12487', // Tillson
          '12489', // Ulster Park
          '12515', // Clintondale
          '12528', // Highland
          '12547', // Milton
          '12561', // New Paltz
          '12568', // Plattekill
        ]),
        serviceCities: JSON.stringify([
          'Poughkeepsie', 'Milton', 'Highland', 'Clintondale', 'Marlboro',
          'Hyde Park', 'Wappingers Falls', 'Pleasant Valley', 'Hughsonville',
          'New Paltz', 'Lagrangeville', 'Plattekill', 'Fishkill', 'Beacon',
          'Stormville', 'Rhinebeck', 'Rhinecliff', 'Kingston', 'Cold Spring',
          'Walden', 'Dover Plains', 'Holmes', 'Carmel', 'Stanfordville',
          'Cornwall on Hudson', 'Wingdale', 'Pawling', 'New Windsor',
          'Rock Tavern', 'Maybrook', 'Montgomery', 'Pine Bush', 'West Point',
          'Wassaic', 'Red Hook', 'Cornwall', 'Salisbury Mills', 'Putnam Valley',
          'Amenia', 'Mahopac',
          'Esopus', 'Rosendale', 'Hurley', 'Accord', 'Olivebridge',
          'Port Ewen', 'Rifton', 'Tillson', 'Ulster Park', 'High Falls',
          'Cottekill', 'Gardiner', 'Wallkill', 'Millbrook', 'Salt Point',
          'Verbank', 'Bangall', 'Clinton Corners', 'Staatsburg',
          'Modena', 'Hopewell Junction',
        ]),
        serviceCounties: JSON.stringify(['Dutchess', 'Putnam', 'Orange', 'Ulster', 'Westchester']),
        serviceAreaRadius: 40,
        lat: 41.7004,
        lng: -73.9210,
        hoursWeekday: '8:00 AM - 4:30 PM',
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: false,
        weekendDelivery: false,
        paymentMethods: JSON.stringify(['cash', 'credit_card']),
        fuelTypes: JSON.stringify(['heating_oil']),
        minimumGallons: 100,
        seniorDiscount: false,
        allowPriceDisplay: true,
        notes: null,
        active: true,
      },
      {
        id: uuidv4(),
        name: 'Economy Oil',
        slug: 'economy-oil',
        phone: '(845) 206-4322',
        email: null,
        website: 'https://www.economy-oil.com',
        addressLine1: '300 Westage Business Center Dr #100',
        city: 'Fishkill',
        state: 'NY',
        postalCodesServed: JSON.stringify([
          // Dutchess County
          '12508', // Beacon
          '12514', // Clinton Corners
          '12522', // Dover Plains
          '12524', // Fishkill (HQ)
          '12531', // Holmes
          '12533', // Hopewell Junction
          '12537', // Hughsonville
          '12538', // Hyde Park
          '12540', // Lagrangeville
          '12545', // Millbrook
          '12564', // Pawling
          '12569', // Pleasant Valley
          '12570', // Poughquag
          '12578', // Salt Point
          '12580', // Staatsburg
          '12582', // Stormville
          '12585', // Verbank
          '12590', // Wappingers Falls
          '12594', // Wingdale
          '12601', // Poughkeepsie
          // Putnam County (per FuelWonk)
          '10512', // Carmel
          '10516', // Cold Spring
          '10524', // Garrison
          '10537', // Lake Peekskill
          '10541', // Mahopac
          '10542', // Mahopac Falls
          '10579', // Putnam Valley
          '12563', // Patterson
          // Westchester County (partial, per FuelWonk)
          '10505', // Baldwin Place
          '10535', // Jefferson Valley
          '10547', // Mohegan Lake
          '10588', // Shrub Oak
          // Orange County
          '10911', // Bear Mountain
          '10914', // Blooming Grove
          '10916', // Campbell Hall
          '10922', // Fort Montgomery
          '10928', // Highland Falls
          '10930', // Highland Mills
          '10940', // Middletown
          '10950', // Monroe
          '10990', // Warwick
          '10992', // Washingtonville
          '10996', // West Point
          '12518', // Cornwall
          '12520', // Cornwall on Hudson
          '12543', // Maybrook
          '12549', // Montgomery
          '12550', // Newburgh
          '12553', // New Windsor
          '12566', // Pine Bush
          '12575', // Rock Tavern
          '12577', // Salisbury Mills
          '12586', // Walden
          '12589', // Wallkill
          '12771', // Port Jervis
          // Ulster County
          '12401', // Kingston
          '12404', // Accord
          '12411', // Bloomington
          '12417', // Connelly
          '12419', // Cottekill
          '12429', // Esopus
          '12440', // High Falls
          '12443', // Hurley
          '12449', // Lake Katrine
          '12461', // New Paltz
          '12466', // Port Ewen
          '12471', // Rifton
          '12472', // Rosendale
          '12477', // Saugerties
          '12484', // Stone Ridge
          '12486', // Tillson
          '12487', // Ulster Park
          '12491', // West Hurley
          '12493', // West Park
          '12515', // Clintondale
          '12525', // Gardiner
          '12528', // Highland
          '12542', // Marlboro
          '12547', // Milton
          '12548', // Modena
          '12561', // New Paltz
          '12568', // Plattekill
          // Sullivan County (partial — major towns)
          '12701', // Monticello
          '12754', // Liberty
          '12758', // Livingston Manor
          '12775', // Rock Hill
          '12790', // Wurtsboro
          // Columbia County (partial)
          '12534', // Hudson
          '12184', // Valatie
          '12037', // Chatham
          // Greene County (partial)
          '12414', // Catskill
          '12051', // Coxsackie
          '12015', // Athens
        ]),
        serviceCities: JSON.stringify([
          'Fishkill', 'Wappingers Falls', 'Hughsonville', 'Beacon', 'Poughkeepsie',
          'Hopewell Junction', 'Hyde Park', 'Pleasant Valley', 'Lagrangeville',
          'Stormville', 'Poughquag', 'Holmes', 'Pawling', 'Dover Plains', 'Wingdale',
          'Millbrook', 'Salt Point', 'Verbank', 'Clinton Corners', 'Staatsburg',
          'Carmel', 'Cold Spring', 'Garrison', 'Mahopac', 'Mahopac Falls',
          'Lake Peekskill', 'Putnam Valley', 'Patterson',
          'Baldwin Place', 'Jefferson Valley', 'Mohegan Lake', 'Shrub Oak',
          'Newburgh', 'New Windsor', 'Cornwall', 'Cornwall on Hudson', 'West Point',
          'Fort Montgomery', 'Highland Falls', 'Highland Mills', 'Middletown',
          'Montgomery', 'Warwick', 'Washingtonville', 'Maybrook', 'Walden',
          'Wallkill', 'Pine Bush', 'Rock Tavern', 'Salisbury Mills', 'Port Jervis',
          'Kingston', 'Highland', 'Milton', 'Clintondale', 'New Paltz', 'Plattekill',
          'Marlboro', 'Modena', 'Saugerties', 'Gardiner', 'Rosendale', 'High Falls',
          'Port Ewen', 'Rifton', 'Tillson', 'Ulster Park', 'Accord', 'Cottekill',
          'Hurley', 'Esopus', 'Lake Katrine', 'Bloomington', 'West Park', 'Stone Ridge',
          'Hudson', 'Catskill', 'Monticello',
        ]),
        serviceCounties: JSON.stringify(['Dutchess', 'Putnam', 'Orange', 'Ulster', 'Sullivan', 'Columbia', 'Greene', 'Delaware', 'Westchester']),
        serviceAreaRadius: 50,
        lat: 41.5234,
        lng: -73.8990,
        hoursWeekday: '8:00 AM - 5:00 PM',
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: false,
        weekendDelivery: false,
        paymentMethods: JSON.stringify(['cash', 'credit_card']),
        fuelTypes: JSON.stringify(['heating_oil']),
        minimumGallons: null,
        seniorDiscount: false,
        allowPriceDisplay: true,
        notes: null,
        active: true,
      },
      {
        id: uuidv4(),
        name: 'Supreme Oil',
        slug: 'supreme-oil',
        phone: '(914) 750-9498',
        email: null,
        website: 'https://supremeoil.us',
        addressLine1: null,
        city: 'White Plains',
        state: 'NY',
        postalCodesServed: JSON.stringify([
          // Westchester County (mid/lower)
          '10502', // Ardsley
          '10503', // Ardsley-on-Hudson
          '10504', // Armonk
          '10506', // Bedford
          '10507', // Bedford Hills
          '10510', // Briarcliff Manor
          '10514', // Chappaqua
          '10520', // Croton-on-Hudson
          '10522', // Dobbs Ferry
          '10523', // Elmsford
          '10528', // Harrison
          '10530', // Hartsdale
          '10532', // Hawthorne
          '10533', // Irvington
          '10538', // Larchmont
          '10543', // Mamaroneck
          '10545', // Maryknoll
          '10546', // Millwood
          '10549', // Mount Kisco
          '10550', // Mount Vernon
          '10551', // Mount Vernon
          '10552', // Mount Vernon
          '10553', // Mount Vernon
          '10562', // Ossining
          '10570', // Pleasantville
          '10573', // Port Chester
          '10576', // Pound Ridge
          '10577', // Purchase
          '10580', // Rye
          '10583', // Scarsdale
          '10591', // Tarrytown
          '10594', // Thornwood
          '10595', // Valhalla
          '10601', // White Plains
          '10603', // White Plains
          '10604', // West Harrison
          '10605', // White Plains
          '10606', // White Plains
          '10607', // White Plains
          '10701', // Yonkers
          '10702', // Yonkers
          '10703', // Yonkers
          '10704', // Yonkers
          '10705', // Yonkers
          '10706', // Hastings-on-Hudson
          '10707', // Tuckahoe
          '10708', // Bronxville
          '10709', // Eastchester
          '10710', // Yonkers
          '10801', // New Rochelle
          '10802', // New Rochelle
          '10803', // Pelham
          '10804', // New Rochelle
          '10805', // New Rochelle
          // Rockland County
          '10913', // Blauvelt
          '10920', // Congers
          '10927', // Haverstraw
          '10954', // Nanuet
          '10956', // New City
          '10960', // Nyack
          '10962', // Orangeburg
          '10964', // Palisades
          '10965', // Pearl River
          '10968', // Piermont
          '10976', // Sparkill
          '10977', // Spring Valley
          '10983', // Tappan
          '10989', // Valley Cottage
          '10993', // West Haverstraw
          '10994', // West Nyack
          // Bronx County
          '10451', '10452', '10453', '10454', '10455', '10456', '10457', '10458',
          '10459', '10460', '10461', '10462', '10463', '10464', '10465', '10466',
          '10467', '10468', '10469', '10470', '10471', '10472', '10473', '10474', '10475',
        ]),
        serviceCities: JSON.stringify([
          'White Plains', 'Yonkers', 'Mount Vernon', 'New Rochelle', 'Scarsdale',
          'Ardsley', 'Ardsley-on-Hudson', 'Armonk', 'Bedford', 'Bedford Hills',
          'Briarcliff Manor', 'Chappaqua', 'Croton-on-Hudson', 'Dobbs Ferry',
          'Elmsford', 'Harrison', 'Hartsdale', 'Hawthorne', 'Irvington',
          'Larchmont', 'Mamaroneck', 'Maryknoll', 'Millwood', 'Mount Kisco',
          'Ossining', 'Pleasantville', 'Port Chester', 'Pound Ridge', 'Purchase',
          'Rye', 'Tarrytown', 'Thornwood', 'Valhalla', 'West Harrison',
          'Hastings-on-Hudson', 'Tuckahoe', 'Bronxville', 'Eastchester', 'Pelham',
          'Blauvelt', 'Congers', 'Haverstraw', 'Nanuet', 'New City', 'Nyack',
          'Orangeburg', 'Palisades', 'Pearl River', 'Piermont', 'Sparkill',
          'Spring Valley', 'Tappan', 'Valley Cottage', 'West Haverstraw', 'West Nyack',
          'Bronx',
        ]),
        serviceCounties: JSON.stringify(['Westchester', 'Rockland', 'Bronx']),
        serviceAreaRadius: 25,
        lat: 41.0340,
        lng: -73.7629,
        hoursWeekday: '8:00 AM - 5:00 PM',
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: false,
        weekendDelivery: false,
        paymentMethods: JSON.stringify(['cash', 'credit_card']),
        fuelTypes: JSON.stringify(['heating_oil', 'diesel']),
        minimumGallons: null,
        seniorDiscount: false,
        allowPriceDisplay: true,
        notes: null,
        active: true,
      },
    ];

    for (const supplier of suppliers) {
      await sequelize.query(`
        INSERT INTO suppliers (
          id, name, slug, phone, email, website, address_line1, city, state,
          postal_codes_served, service_cities, service_counties, service_area_radius,
          lat, lng, hours_weekday, hours_saturday, hours_sunday,
          emergency_delivery, weekend_delivery, payment_methods, fuel_types,
          minimum_gallons, senior_discount, allow_price_display, notes, active,
          created_at, updated_at
        ) VALUES (
          :id, :name, :slug, :phone, :email, :website, :addressLine1, :city, :state,
          :postalCodesServed, :serviceCities, :serviceCounties, :serviceAreaRadius,
          :lat, :lng, :hoursWeekday, :hoursSaturday, :hoursSunday,
          :emergencyDelivery, :weekendDelivery, :paymentMethods, :fuelTypes,
          :minimumGallons, :seniorDiscount, :allowPriceDisplay, :notes, :active,
          NOW(), NOW()
        )
        ON CONFLICT (slug) DO UPDATE SET
          phone = EXCLUDED.phone,
          email = EXCLUDED.email,
          website = EXCLUDED.website,
          address_line1 = EXCLUDED.address_line1,
          city = EXCLUDED.city,
          state = EXCLUDED.state,
          postal_codes_served = EXCLUDED.postal_codes_served,
          service_cities = EXCLUDED.service_cities,
          service_counties = EXCLUDED.service_counties,
          service_area_radius = EXCLUDED.service_area_radius,
          lat = EXCLUDED.lat,
          lng = EXCLUDED.lng,
          hours_weekday = EXCLUDED.hours_weekday,
          hours_saturday = EXCLUDED.hours_saturday,
          emergency_delivery = EXCLUDED.emergency_delivery,
          weekend_delivery = EXCLUDED.weekend_delivery,
          payment_methods = EXCLUDED.payment_methods,
          fuel_types = EXCLUDED.fuel_types,
          minimum_gallons = EXCLUDED.minimum_gallons,
          allow_price_display = EXCLUDED.allow_price_display,
          active = EXCLUDED.active,
          scrape_status = 'active',
          consecutive_scrape_failures = 0,
          last_scrape_failure_at = NULL,
          scrape_failure_dates = NULL,
          updated_at = NOW()
      `, {
        replacements: supplier,
        type: sequelize.QueryTypes.INSERT
      });

      console.log(`[Migration 087] ${supplier.name} (${supplier.city}, ${supplier.state}) — coverage backfilled`);
    }

    // Also extend Euro Fuel Co coverage to include Peekskill area ZIPs
    await sequelize.query(`
      UPDATE suppliers SET
        postal_codes_served = :postalCodesServed,
        service_cities = :serviceCities,
        updated_at = NOW()
      WHERE slug = 'euro-fuel-co'
    `, {
      replacements: {
        postalCodesServed: JSON.stringify([
          '10509', '10512', '10516', '10519', '10526', '10537', '10541', '10547',
          '10549', '10560', '10566', '10567', '10568', '10579', '10598',
          '12531', '12533', '12563', '12564', '12570', '12582', '12594'
        ]),
        serviceCities: JSON.stringify([
          'Brewster', 'Carmel', 'Cold Spring', 'Croton Falls', 'Goldens Bridge',
          'Holmes', 'Hopewell Junction', 'Lake Peekskill', 'Mahopac', 'Mohegan Lake',
          'Mount Kisco', 'North Salem', 'Patterson', 'Pawling', 'Peekskill',
          'Cortlandt Manor', 'Poughquag', 'Putnam Valley', 'Stormville', 'Wingdale',
          'Yorktown Heights'
        ]),
      }
    });
    console.log('[Migration 087] Euro Fuel Co — added Peekskill area ZIPs (10566/10567/10568)');
  },

  async down(sequelize) {
    // Clear coverage data (suppliers remain, just lose ZIP coverage)
    await sequelize.query(`
      UPDATE suppliers SET
        postal_codes_served = NULL,
        service_cities = NULL,
        service_counties = NULL,
        updated_at = NOW()
      WHERE slug IN ('action-fuel-oil', 'chrysalis-fuel-inc', 'buy-rite-fuel', 'acs-oil-service',
        'superior-fuel-oil', 'stormville-oil', 'hunters-oil', 'jurassic-fuels',
        'economy-oil', 'supreme-oil')
    `);
    // Revert Euro Fuel Co to original ZIPs from migration 068
    await sequelize.query(`
      UPDATE suppliers SET
        postal_codes_served = :postalCodesServed,
        service_cities = :serviceCities,
        updated_at = NOW()
      WHERE slug = 'euro-fuel-co'
    `, {
      replacements: {
        postalCodesServed: JSON.stringify([
          '10509', '10512', '10516', '10519', '10526', '10537', '10541', '10547',
          '10549', '10560', '10579', '10598', '12531', '12533', '12563', '12564',
          '12570', '12582', '12594'
        ]),
        serviceCities: JSON.stringify([
          'Brewster', 'Carmel', 'Cold Spring', 'Croton Falls', 'Goldens Bridge',
          'Holmes', 'Hopewell Junction', 'Lake Peekskill', 'Mahopac', 'Mohegan Lake',
          'Mount Kisco', 'North Salem', 'Patterson', 'Pawling', 'Poughquag',
          'Putnam Valley', 'Stormville', 'Wingdale', 'Yorktown Heights'
        ]),
      }
    });
    console.log('[Migration 087] Coverage data cleared');
  }
};
