/**
 * Migration 062: Add Port Jervis Area Suppliers
 *
 * Adds 8 verified COD/will-call suppliers serving Port Jervis, NY (12771)
 * and the surrounding tri-state area (Orange County NY, Sussex County NJ, Pike County PA):
 *
 * 1. Eco-Fuel Oil (Netcong, NJ) - COD, scrapable
 * 2. Northeast Oil (Riverdale, NJ) - COD only
 * 3. Wilson Fuel Co. (Montague, NJ) - COD, scrapable
 * 4. Fredericks Fuel (Oak Ridge, NJ) - Will-call
 * 5. Advantage Oil (Mountain Lakes, NJ) - COD, scrapable
 * 6. Bee's Fuel Oil (Walden, NY) - COD
 * 7. Quinn Oil (Goshen, NY) - Will-call/On Demand
 * 8. Miller Energy (Chester, NY) - Will-call
 */

const { v4: uuidv4 } = require('uuid');

module.exports = {
  name: '062-add-port-jervis-area-suppliers',

  async up(sequelize) {
    const suppliers = [
      // ============================================
      // 1. ECO-FUEL OIL - Netcong, NJ (Morris County)
      // "Today's C.O.D. Oil Price" on eco-fuel.com
      // ============================================
      {
        id: uuidv4(),
        name: 'Eco-Fuel Oil',
        slug: 'eco-fuel-oil',
        phone: '(862) 209-4600',
        email: 'info@eco-fuel.com',
        website: 'https://eco-fuel.com',
        addressLine1: '145 Route 46 West',
        city: 'Netcong',
        state: 'NJ',
        postalCodesServed: JSON.stringify([
          // Sussex County (southern)
          '07871', // Sparta
          '07860', // Newton
          '07461', // Sussex/Wantage
          '07462', // Vernon
          '07419', // Hamburg
          '07416', // Franklin
          '07418', // Glenwood
          '07439', // Ogdensburg
          '07848', // Lafayette
          '07826', // Branchville
          '07822', // Frankford
          '07421', // Hewitt
          // Morris County
          '07857', // Netcong
          '07840', // Hackettstown
          '07843', // Hopatcong
          '07849', // Lake Hopatcong
          '07834', // Denville
          '07438', // Oak Ridge
          '07866', // Rockaway
          '07435', // Newfoundland
          '07836', // Flanders
          '07876', // Succasunna
          '07850', // Landing
          '07852', // Ledgewood
          '07874', // Stanhope
          '07869', // Randolph
          '07405', // Butler
          '07801', // Dover
          '07885', // Wharton
          '07847', // Kenvil
          '07856', // Mine Hill
          '07046', // Mountain Lakes
          // Warren County (eastern)
          '07821', // Andover
          '07823', // Belvidere
          '07825', // Blairstown
          '07831', // Changewater
          '07838', // Great Meadows
          '07844', // Hope
          '07863', // Oxford
          '07882', // Washington
        ]),
        serviceCities: JSON.stringify([
          'Netcong', 'Sparta', 'Newton', 'Sussex', 'Vernon', 'Hamburg',
          'Franklin', 'Ogdensburg', 'Lafayette', 'Branchville', 'Hackettstown',
          'Hopatcong', 'Denville', 'Oak Ridge', 'Rockaway', 'Flanders',
          'Succasunna', 'Landing', 'Stanhope', 'Randolph', 'Butler', 'Dover',
          'Mountain Lakes', 'Andover', 'Blairstown', 'Great Meadows', 'Oxford'
        ]),
        serviceCounties: JSON.stringify(['Sussex', 'Morris', 'Warren']),
        serviceAreaRadius: 25,
        lat: 40.8952,
        lng: -74.7115,
        hoursWeekday: '7:00 AM - 5:00 PM',
        hoursSaturday: '8:00 AM - 2:00 PM',
        hoursSunday: null,
        emergencyDelivery: true,
        weekendDelivery: null,
        paymentMethods: JSON.stringify(['cash', 'check', 'credit_card', 'debit_card']),
        fuelTypes: JSON.stringify(['heating_oil', 'propane', 'diesel']),
        minimumGallons: null,
        seniorDiscount: true,
        allowPriceDisplay: true,
        notes: null,
        active: true,
      },

      // ============================================
      // 2. NORTHEAST OIL - Riverdale, NJ (Morris County)
      // "COD Delivery ONLY" on northeastoilcompany.com
      // ============================================
      {
        id: uuidv4(),
        name: 'Northeast Oil',
        slug: 'northeast-oil',
        phone: '(973) 827-1110',
        email: null,
        website: 'https://www.northeastoilcompany.com',
        addressLine1: '4 Post Ln',
        city: 'Riverdale',
        state: 'NJ',
        postalCodesServed: JSON.stringify([
          // Sussex County
          '07871', // Sparta
          '07860', // Newton
          '07461', // Sussex/Wantage
          '07462', // Vernon
          '07419', // Hamburg/Hardyston
          '07416', // Franklin
          '07418', // Glenwood
          '07439', // Ogdensburg
          '07848', // Lafayette
          '07826', // Branchville
          '07822', // Frankford
          '07460', // Stockholm
          '07421', // Hewitt
          '07422', // Highland Lakes
          // Morris County
          '07457', // Riverdale
          '07834', // Denville
          '07843', // Hopatcong
          '07849', // Jefferson/Lake Hopatcong
          '07857', // Netcong
          '07435', // Newfoundland/Greenpond
          '07438', // Oak Ridge
          '07866', // Rockaway
          // Passaic County
          '07480', // West Milford
        ]),
        serviceCities: JSON.stringify([
          'Andover', 'Barry Lakes', 'Branchville', 'Denville', 'Frankford',
          'Franklin', 'Fredon', 'Glenwood', 'Greenpond', 'Hamburg', 'Hardyston',
          'Hewitt', 'Highland Lakes', 'Hopatcong', 'Jefferson', 'Lafayette',
          'Netcong', 'Newfoundland', 'Newton', 'Oak Ridge', 'Ogdensburg',
          'Riverdale', 'Rockaway', 'Sparta', 'Stockholm', 'Sussex', 'Vernon',
          'Wantage', 'West Milford'
        ]),
        serviceCounties: JSON.stringify(['Sussex', 'Morris', 'Passaic']),
        serviceAreaRadius: 25,
        lat: 40.9983,
        lng: -74.2987,
        hoursWeekday: '8:00 AM - 5:00 PM',
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: true,
        weekendDelivery: true,
        paymentMethods: JSON.stringify(['credit_card', 'cash']),
        fuelTypes: JSON.stringify(['heating_oil']),
        minimumGallons: 150,
        seniorDiscount: null,
        allowPriceDisplay: false,
        notes: null,
        active: true,
      },

      // ============================================
      // 3. WILSON FUEL CO. - Montague, NJ (Sussex County)
      // "Automatic oil delivery with C.O.D. pricing" on wilson-fuel.com
      // ============================================
      {
        id: uuidv4(),
        name: 'Wilson Fuel Co.',
        slug: 'wilson-fuel-co',
        phone: '(973) 293-3807',
        email: 'terrij@nrgheat.com',
        website: 'https://www.wilson-fuel.com',
        addressLine1: '410 US Highway 206',
        city: 'Montague',
        state: 'NJ',
        postalCodesServed: JSON.stringify([
          // Sussex County, NJ
          '07827', // Montague
          '07461', // Sussex/Wantage
          '07871', // Sparta
          '07860', // Newton
          '07416', // Franklin
          '07419', // Hamburg
          '07418', // Glenwood
          '07462', // Vernon
          '07439', // Ogdensburg
          '07848', // Lafayette
          '07826', // Branchville
          '07822', // Frankford
          '07460', // Stockholm
          '07422', // Highland Lakes
          // Warren County, NJ
          '07825', // Blairstown
          '07844', // Hope
          '07846', // Johnsonburg
          '07875', // Stillwater
          '07880', // Swartswood
          // Morris County, NJ
          '07438', // Oak Ridge
          '07843', // Hopatcong
          // Orange County, NY
          '12771', // Port Jervis
          '12780', // Sparrow Bush
          '10988', // Unionville
          '10973', // Slate Hill
          '10963', // Otisville
          '10998', // Westtown
          '10958', // New Hampton
          '10940', // Middletown
          '10990', // Warwick
          '10921', // Florida
          '10969', // Pine Island
          // Sullivan County, NY
          '12729', // Cuddebackville
          '12733', // Forestburgh
          '12738', // Glen Spey
          '12764', // Narrowsburg
          '12719', // Barryville
          '12786', // Yulan
          '12734', // Eldred
          '12747', // Highland Lake
          // Pike County, PA
          '18337', // Milford
          '18336', // Matamoras
          '18348', // Millrift
          '18356', // Shohola
          '18328', // Dingmans Ferry
          '18371', // Tamiment
          '18344', // Pond Eddy
          '18324', // Bushkill
          '18326', // Canadensis
          '18351', // Lackawaxen
          '18346', // Rowland
          '18370', // Greeley
        ]),
        serviceCities: JSON.stringify([
          'Montague', 'Port Jervis', 'Sparrow Bush', 'Milford', 'Matamoras',
          'Warwick', 'Middletown', 'Unionville', 'Slate Hill', 'Otisville',
          'Westtown', 'New Hampton', 'Florida', 'Pine Island', 'Cuddebackville',
          'Glen Spey', 'Barryville', 'Dingmans Ferry', 'Shohola', 'Bushkill',
          'Sparta', 'Newton', 'Sussex', 'Franklin', 'Hamburg', 'Vernon',
          'Blairstown', 'Stillwater', 'Branchville', 'Glenwood'
        ]),
        serviceCounties: JSON.stringify(['Sussex', 'Warren', 'Morris', 'Orange', 'Sullivan', 'Pike']),
        serviceAreaRadius: 30,
        lat: 41.2796,
        lng: -74.7970,
        hoursWeekday: '8:00 AM - 4:00 PM',
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: true,
        weekendDelivery: null,
        paymentMethods: JSON.stringify(['cash', 'check', 'credit_card']),
        fuelTypes: JSON.stringify(['heating_oil', 'diesel', 'kerosene']),
        minimumGallons: 150,
        seniorDiscount: true,
        allowPriceDisplay: true,
        notes: null,
        active: true,
      },

      // ============================================
      // 4. FREDERICKS FUEL - Oak Ridge, NJ (Passaic County)
      // "Will-call delivery means that you call us when you need a fuel delivery"
      // ============================================
      {
        id: uuidv4(),
        name: 'Fredericks Fuel',
        slug: 'fredericks-fuel',
        phone: '(973) 841-6191',
        email: null,
        website: 'https://www.fredericksfuel.com',
        addressLine1: '225 Oak Ridge Rd',
        city: 'Oak Ridge',
        state: 'NJ',
        postalCodesServed: JSON.stringify([
          // Passaic County, NJ
          '07438', // Oak Ridge / West Milford
          '07480', // West Milford
          '07435', // Newfoundland
          '07421', // Hewitt
          '07403', // Bloomingdale
          '07465', // Wanaque
          '07420', // Haskell
          '07456', // Ringwood
          // Sussex County, NJ
          '07871', // Sparta
          '07461', // Sussex/Wantage
          '07860', // Newton
          '07462', // Vernon
          '07419', // Hamburg
          '07416', // Franklin
          '07418', // Glenwood
          '07439', // Ogdensburg
          '07848', // Lafayette
          '07826', // Branchville
          '07822', // Frankford
          '07460', // Stockholm
          '07422', // Highland Lakes
          '07827', // Montague
          '07875', // Stillwater
          '07821', // Andover
          // Morris County, NJ
          '07457', // Riverdale
          '07405', // Butler
          '07866', // Rockaway
          '07834', // Denville
          '07843', // Hopatcong
          '07849', // Jefferson
          '07857', // Netcong
          '07801', // Dover
          '07082', // Towaco
          '07035', // Lincoln Park
          '07442', // Pompton Lakes
          '07444', // Pompton Plains
          '07045', // Montville
          '07046', // Mountain Lakes
          '07850', // Landing
          // Orange County, NY
          '12771', // Port Jervis
          '10990', // Warwick
          '10940', // Middletown
          '10924', // Goshen
          '10921', // Florida
          '10969', // Pine Island
          '10973', // Slate Hill
          '10998', // Westtown
          '10958', // New Hampton
          '12780', // Sparrow Bush
          '10988', // Unionville
          // Pike County, PA
          '18337', // Milford
          '18336', // Matamoras
          '18371', // Tamiment
          '18324', // Bushkill
          '18356', // Shohola
        ]),
        serviceCities: JSON.stringify([
          'Oak Ridge', 'West Milford', 'Sparta', 'Sussex', 'Wantage', 'Vernon',
          'Riverdale', 'Newfoundland', 'Stockholm', 'Butler', 'Hopatcong',
          'Ogdensburg', 'Franklin', 'Hamburg', 'Bloomingdale', 'Dover',
          'Rockaway', 'Denville', 'Hewitt', 'Highland Lakes', 'Wanaque',
          'Haskell', 'Ringwood', 'Towaco', 'Pompton Lakes', 'Montville',
          'Mountain Lakes', 'Newton', 'Lafayette', 'Branchville', 'Montague',
          'Port Jervis', 'Warwick', 'Middletown', 'Goshen', 'Florida',
          'Milford', 'Matamoras'
        ]),
        serviceCounties: JSON.stringify([
          'Passaic', 'Sussex', 'Morris', 'Orange', 'Pike'
        ]),
        serviceAreaRadius: 35,
        lat: 41.0513,
        lng: -74.4767,
        hoursWeekday: '9:00 AM - 5:00 PM',
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: true,
        weekendDelivery: null,
        paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'diesel']),
        minimumGallons: null,
        seniorDiscount: null,
        allowPriceDisplay: false,
        notes: null,
        active: true,
      },

      // ============================================
      // 5. ADVANTAGE OIL - Mountain Lakes, NJ (Morris County)
      // "The COD company that delivers more" on advantage-oil.com
      // ============================================
      {
        id: uuidv4(),
        name: 'Advantage Oil',
        slug: 'advantage-oil',
        phone: '(800) 582-1580',
        email: 'info@advantage-oil.com',
        website: 'https://advantage-oil.com',
        addressLine1: '100 Pocono Road',
        city: 'Mountain Lakes',
        state: 'NJ',
        postalCodesServed: JSON.stringify([
          // Morris County
          '07046', // Mountain Lakes
          '07005', // Boonton
          '07834', // Denville
          '07801', // Dover
          '07836', // Flanders
          '07932', // Florham Park
          '07869', // Randolph
          '07866', // Rockaway
          '07876', // Succasunna
          '07960', // Morristown
          '07950', // Morris Plains
          '07054', // Parsippany
          '07058', // Pine Brook
          '07035', // Lincoln Park
          '07457', // Riverdale
          '07082', // Towaco
          '07981', // Whippany
          '07045', // Montville
          '07440', // Pequannock
          '07444', // Pompton Plains
          '07438', // Oak Ridge
          '07857', // Netcong
          '07843', // Hopatcong
          '07850', // Landing
          '07852', // Ledgewood
          '07847', // Kenvil
          '07856', // Mine Hill
          '07885', // Wharton
          '07849', // Mount Arlington
          '07405', // Butler
          '07928', // Chatham
          '07930', // Chester
          '07927', // Cedar Knolls
          '07940', // Madison
          '07945', // Mendham
          // Essex County
          '07039', // Livingston
          '07068', // Roseland
          '07052', // West Orange
          '07042', // Montclair
          '07009', // Cedar Grove
          '07006', // Caldwell
          '07004', // Fairfield
          '07021', // Essex Fells
          '07028', // Glen Ridge
          '07044', // Verona
          '07110', // Nutley
          '07003', // Bloomfield
          '07078', // Short Hills
          '07041', // Millburn
          '07040', // Maplewood
          // Sussex County
          '07821', // Andover
          '07843', // Hopatcong
          '07871', // Sparta
          '07874', // Stanhope
          '07439', // Ogdensburg
          // Passaic County
          '07403', // Bloomingdale
          '07442', // Pompton Lakes
          '07470', // Wayne
          '07424', // Little Falls
          '07435', // Newfoundland
          '07480', // West Milford
          '07420', // Haskell
          '07465', // Wanaque
          // Bergen County
          '07417', // Franklin Lakes
          '07436', // Oakland
          '07481', // Wyckoff
          // Union County
          '07901', // Summit
          '07081', // Springfield
          '07092', // Mountainside
          '07090', // Westfield
          // Somerset County
          '07920', // Basking Ridge
          '07924', // Bernardsville
          '07931', // Far Hills
          '07934', // Gladstone
          '07977', // Peapack
        ]),
        serviceCities: JSON.stringify([
          'Mountain Lakes', 'Boonton', 'Denville', 'Dover', 'Morristown',
          'Morris Plains', 'Parsippany', 'Rockaway', 'Randolph', 'Succasunna',
          'Montville', 'Lincoln Park', 'Riverdale', 'Whippany', 'Pequannock',
          'Pompton Plains', 'Butler', 'Chatham', 'Chester', 'Madison', 'Mendham',
          'Livingston', 'Roseland', 'West Orange', 'Montclair', 'Cedar Grove',
          'Caldwell', 'Fairfield', 'Verona', 'Nutley', 'Bloomfield',
          'Short Hills', 'Millburn', 'Sparta', 'Stanhope', 'Ogdensburg',
          'Bloomingdale', 'Pompton Lakes', 'Wayne', 'West Milford',
          'Franklin Lakes', 'Oakland', 'Wyckoff',
          'Summit', 'Springfield', 'Westfield',
          'Basking Ridge', 'Bernardsville', 'Gladstone', 'Peapack'
        ]),
        serviceCounties: JSON.stringify(['Morris', 'Essex', 'Sussex', 'Passaic', 'Bergen', 'Union', 'Somerset']),
        serviceAreaRadius: 30,
        lat: 40.8799,
        lng: -74.4488,
        hoursWeekday: '8:00 AM - 4:30 PM',
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: true,
        weekendDelivery: null,
        paymentMethods: JSON.stringify(['cash', 'check', 'credit_card']),
        fuelTypes: JSON.stringify(['heating_oil', 'propane', 'diesel', 'kerosene']),
        minimumGallons: 100,
        seniorDiscount: null,
        allowPriceDisplay: true,
        notes: null,
        active: true,
      },

      // ============================================
      // 6. BEE'S FUEL OIL - Walden, NY (Orange County)
      // "Cash/Check on delivery (preferred)" on beesfueloil.com
      // ============================================
      {
        id: uuidv4(),
        name: "Bee's Fuel Oil",
        slug: 'bees-fuel-oil',
        phone: '(845) 778-2337',
        email: null,
        website: 'https://beesfueloil.com',
        addressLine1: '38 Orange Avenue',
        city: 'Walden',
        state: 'NY',
        postalCodesServed: JSON.stringify([
          // Orange County (eastern)
          '12586', // Walden
          '10916', // Campbell Hall
          '12518', // Cornwall
          '12520', // Cornwall on Hudson
          '12543', // Maybrook
          '10940', // Middletown
          '12549', // Montgomery
          '10953', // Mountainville
          '12550', // Newburgh
          '12553', // New Windsor
          '12566', // Pine Bush
          '12575', // Rock Tavern
          '12577', // Salisbury Mills
          '10992', // Washingtonville
          '12584', // Vails Gate
          // Ulster County (lower)
          '12525', // Gardiner
          '12542', // Marlboro
          '12548', // Modena
          '12561', // New Paltz
          '12588', // Walker Valley
          '12589', // Wallkill
        ]),
        serviceCities: JSON.stringify([
          'Walden', 'Campbell Hall', 'Cornwall', 'Cornwall on Hudson', 'Gardiner',
          'Marlboro', 'Maybrook', 'Middletown', 'Modena', 'Montgomery',
          'Mountainville', 'Newburgh', 'New Paltz', 'New Windsor', 'Pine Bush',
          'Rock Tavern', 'Salisbury Mills', 'Walker Valley', 'Wallkill',
          'Washingtonville'
        ]),
        serviceCounties: JSON.stringify(['Orange', 'Ulster']),
        serviceAreaRadius: 20,
        lat: 41.5589,
        lng: -74.1866,
        hoursWeekday: '9:00 AM - 6:00 PM',
        hoursSaturday: '9:00 AM - 12:00 PM',
        hoursSunday: null,
        emergencyDelivery: null,
        weekendDelivery: null,
        paymentMethods: JSON.stringify(['cash', 'check', 'credit_card']),
        fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'diesel']),
        minimumGallons: null,
        seniorDiscount: null,
        allowPriceDisplay: false,
        notes: null,
        active: true,
      },

      // ============================================
      // 7. QUINN OIL - Goshen, NY (Orange County)
      // "On Demand (Will Call)" per HeatFleet listing
      // ============================================
      {
        id: uuidv4(),
        name: 'Quinn Oil',
        slug: 'quinn-oil',
        phone: '(845) 291-1961',
        email: null,
        website: 'https://quinnoilinc.com',
        addressLine1: '6 Andrea Ct',
        city: 'Goshen',
        state: 'NY',
        postalCodesServed: JSON.stringify([
          // Orange County
          '10924', // Goshen
          '10910', // Arden
          '10912', // Bellvale
          '10914', // Blooming Grove
          '10915', // Bullville
          '10916', // Campbell Hall
          '10917', // Central Valley
          '10918', // Chester
          '10919', // Circleville
          '12518', // Cornwall
          '12520', // Cornwall on Hudson
          '12729', // Cuddebackville
          '10921', // Florida
          '10925', // Greenwood Lake
          '10926', // Harriman
          '10930', // Highland Mills
          '10932', // Howells
          '10933', // Johnson
          '12543', // Maybrook
          '10940', // Middletown
          '10949', // Monroe
          '10950', // Monroe
          '12549', // Montgomery
          '10953', // Mountainville
          '10958', // New Hampton
          '12553', // New Windsor
          '12550', // Newburgh
          '10963', // Otisville
          '10969', // Pine Island
          '12771', // Port Jervis
          '12575', // Rock Tavern
          '12577', // Salisbury Mills
          '10973', // Slate Hill
          '10975', // Southfields
          '10981', // Sugar Loaf
          '10985', // Thompson Ridge
          '10988', // Unionville
          '12584', // Vails Gate
          '12586', // Walden
          '10990', // Warwick
          '10992', // Washingtonville
          '10996', // West Point
          '10998', // Westtown
          // Ulster County
          '12420', // Cragsmoor
          '12566', // Pine Bush
          '12588', // Walker Valley
          '12589', // Wallkill
          // Sullivan County
          '12721', // Bloomingburg
          '12722', // Burlingham
          '12769', // Phillipsport
          '12483', // Spring Glen
          '12781', // Summitville
          '12785', // Westbrookville
          '12790', // Wurtsboro
        ]),
        serviceCities: JSON.stringify([
          'Goshen', 'Arden', 'Bellvale', 'Blooming Grove', 'Bullville',
          'Campbell Hall', 'Central Valley', 'Chester', 'Circleville',
          'Cornwall', 'Cornwall on Hudson', 'Cuddebackville', 'Florida',
          'Greenwood Lake', 'Harriman', 'Highland Mills', 'Howells', 'Johnson',
          'Maybrook', 'Middletown', 'Monroe', 'Montgomery', 'Mountainville',
          'New Hampton', 'New Windsor', 'Newburgh', 'Otisville', 'Pine Island',
          'Port Jervis', 'Rock Tavern', 'Salisbury Mills', 'Slate Hill',
          'Southfields', 'Sugar Loaf', 'Thompson Ridge', 'Unionville',
          'Vails Gate', 'Walden', 'Warwick', 'Washingtonville', 'West Point',
          'Westtown', 'Bloomingburg', 'Wurtsboro'
        ]),
        serviceCounties: JSON.stringify(['Orange', 'Ulster', 'Sullivan']),
        serviceAreaRadius: 30,
        lat: 41.4434,
        lng: -74.3164,
        hoursWeekday: '8:00 AM - 4:30 PM',
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: true,
        weekendDelivery: null,
        paymentMethods: JSON.stringify(['credit_card', 'cash']),
        fuelTypes: JSON.stringify(['heating_oil']),
        minimumGallons: null,
        seniorDiscount: null,
        allowPriceDisplay: false,
        notes: null,
        active: true,
      },

      // ============================================
      // 8. MILLER ENERGY - Chester, NY (Orange County)
      // "Will Call: You keep an eye on your heating oil level..."
      // ============================================
      {
        id: uuidv4(),
        name: 'Miller Energy',
        slug: 'miller-energy',
        phone: '(845) 341-3108',
        email: 'Millerenergy@icloud.com',
        website: 'https://millerenergyco.com',
        addressLine1: '3504 Route 94',
        city: 'Chester',
        state: 'NY',
        postalCodesServed: JSON.stringify([
          // Orange County
          '10918', // Chester
          '10914', // Blooming Grove
          '10915', // Bullville
          '10916', // Campbell Hall
          '10917', // Central Valley
          '10919', // Circleville
          '12518', // Cornwall
          '10921', // Florida
          '10924', // Goshen
          '10926', // Harriman
          '10930', // Highland Mills
          '10932', // Howells
          '10933', // Johnson
          '12543', // Maybrook
          '10940', // Middletown
          '10949', // Monroe
          '10950', // Monroe
          '12549', // Montgomery
          '10953', // Mountainville
          '10958', // New Hampton
          '12553', // New Windsor
          '12550', // Newburgh
          '10963', // Otisville
          '12566', // Pine Bush
          '10969', // Pine Island
          '12575', // Rock Tavern
          '12577', // Salisbury Mills
          '10973', // Slate Hill
          '12586', // Walden
          '10990', // Warwick
          '10992', // Washingtonville
          '10998', // Westtown
        ]),
        serviceCities: JSON.stringify([
          'Chester', 'Blooming Grove', 'Bullville', 'Campbell Hall',
          'Central Valley', 'Circleville', 'Cornwall', 'Florida', 'Goshen',
          'Greenville', 'Hamptonburgh', 'Harriman', 'Highland Mills', 'Howells',
          'Johnson', 'Maybrook', 'Middletown', 'Monroe', 'Montgomery',
          'Mountainville', 'New Hampton', 'New Windsor', 'Newburgh', 'Otisville',
          'Pine Bush', 'Pine Island', 'Rock Tavern', 'Salisbury Mills',
          'Slate Hill', 'Walden', 'Warwick', 'Washingtonville', 'Westtown'
        ]),
        serviceCounties: JSON.stringify(['Orange']),
        serviceAreaRadius: 20,
        lat: 41.3750,
        lng: -74.2569,
        hoursWeekday: null,
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: null,
        weekendDelivery: null,
        paymentMethods: JSON.stringify(['cash', 'check', 'credit_card', 'debit_card']),
        fuelTypes: JSON.stringify(['heating_oil']),
        minimumGallons: null,
        seniorDiscount: null,
        allowPriceDisplay: false,
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
          postal_codes_served = EXCLUDED.postal_codes_served,
          service_cities = EXCLUDED.service_cities,
          service_counties = EXCLUDED.service_counties,
          service_area_radius = EXCLUDED.service_area_radius,
          hours_weekday = EXCLUDED.hours_weekday,
          hours_saturday = EXCLUDED.hours_saturday,
          hours_sunday = EXCLUDED.hours_sunday,
          emergency_delivery = EXCLUDED.emergency_delivery,
          weekend_delivery = EXCLUDED.weekend_delivery,
          payment_methods = EXCLUDED.payment_methods,
          minimum_gallons = EXCLUDED.minimum_gallons,
          senior_discount = EXCLUDED.senior_discount,
          allow_price_display = EXCLUDED.allow_price_display,
          updated_at = NOW()
      `, {
        replacements: {
          ...supplier,
          emergencyDelivery: supplier.emergencyDelivery === true,
          weekendDelivery: supplier.weekendDelivery === true,
          seniorDiscount: supplier.seniorDiscount === true,
          allowPriceDisplay: supplier.allowPriceDisplay === true,
          minimumGallons: supplier.minimumGallons || null,
          notes: supplier.notes || null,
          email: supplier.email || null,
        }
      });
    }

    console.log('[Migration 062] Added 8 Port Jervis area suppliers');
    console.log('[Migration 062] ✅ Port Jervis area supplier expansion complete');
  },

  async down(sequelize) {
    await sequelize.query(`
      DELETE FROM suppliers
      WHERE slug IN (
        'eco-fuel-oil', 'northeast-oil', 'wilson-fuel-co', 'fredericks-fuel',
        'advantage-oil', 'bees-fuel-oil', 'quinn-oil', 'miller-energy'
      )
    `);
    console.log('[Migration 062] Rolled back Port Jervis area suppliers');
  }
};
