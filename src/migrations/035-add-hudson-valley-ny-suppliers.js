/**
 * Migration 035: Add Hudson Valley NY suppliers (Orange/Sullivan/Ulster County area)
 * Big O Fuels, Upstate Energy, Blanket Oil (Mirabito), Combined Energy Services, County Petroleum
 * All verified COD/will-call suppliers via web research
 */

const { v4: uuidv4 } = require('uuid');

module.exports = {
  name: '035-add-hudson-valley-ny-suppliers',

  async up(sequelize) {
    const suppliers = [
      {
        id: uuidv4(),
        name: 'Big O Fuels',
        slug: 'big-o-fuels',
        phone: '(845) 733-1930',
        email: 'info.bigofuels@gmail.com',
        website: 'https://www.bigofuels.com',
        addressLine1: '105 Gillen Rd',
        city: 'Middletown',
        state: 'NY',
        postalCodesServed: JSON.stringify([
          // Orange County
          '10914', // Blooming Grove
          '10915', // Bullville
          '10916', // Campbell Hall
          '10917', // Central Valley
          '10918', // Chester
          '10919', // Circleville
          '10921', // Florida
          '10924', // Goshen
          '10926', // Harriman
          '10930', // Highland Mills
          '10932', // Howells
          '10940', '10941', // Middletown
          '10950', // Monroe
          '10953', // Mountainville
          '10958', // New Hampton
          '10963', // Otisville
          '10969', // Pine Island
          '10973', // Slate Hill
          '10981', // Sugar Loaf
          '10985', // Thompson Ridge
          '10990', // Warwick
          '10992', // Washingtonville
          '10998', // Westtown
          '12518', // Cornwall
          '12520', // Cornwall-on-Hudson
          '12543', // Maybrook
          '12549', // Montgomery
          '12550', // Newburgh
          '12553', // New Windsor
          '12566', // Pine Bush
          '12575', // Rock Tavern
          '12577', // Salisbury Mills
          '12586', // Walden
          '12589', // Wallkill
          '12729', // Cuddebackville
          '12746', // Huguenot
          '12771', // Port Jervis
          // Sullivan County
          '12701', // Monticello
          '12721', // Bloomingburg
          '12722', // Burlingham
          '12738', // Glen Wild
          '12751', // Kiamesha Lake
          '12763', // Mountain Dale
          '12775', // Rock Hill
          '12779', // South Fallsburg
          '12785', // Westbrookville
          '12789', // Woodridge
          '12790', // Wurtsboro
          // Ulster County
          '12420', // Cragsmoor
          '12428', // Ellenville
          '12435', // Greenfield Park
          '12489', // Wawarsing
          '12525', // Gardiner
          '12588'  // Walker Valley
        ]),
        serviceCities: JSON.stringify([
          'Middletown', 'Blooming Grove', 'Bullville', 'Campbell Hall', 'Central Valley',
          'Chester', 'Circleville', 'Cornwall', 'Cornwall-on-Hudson', 'Cuddebackville',
          'Florida', 'Goshen', 'Harriman', 'Highland Mills', 'Howells', 'Huguenot',
          'Maybrook', 'Monroe', 'Montgomery', 'Mountainville', 'New Hampton',
          'New Windsor', 'Newburgh', 'Otisville', 'Pine Bush', 'Pine Island',
          'Port Jervis', 'Rock Tavern', 'Salisbury Mills', 'Slate Hill', 'Sugar Loaf',
          'Thompson Ridge', 'Walden', 'Wallkill', 'Warwick', 'Washingtonville', 'Westtown',
          'Bloomingburg', 'Burlingham', 'Glen Wild', 'Kiamesha Lake', 'Monticello',
          'Mountain Dale', 'Rock Hill', 'South Fallsburg', 'Westbrookville', 'Woodridge', 'Wurtsboro',
          'Cragsmoor', 'Ellenville', 'Gardiner', 'Greenfield Park', 'Walker Valley', 'Wawarsing'
        ]),
        serviceCounties: JSON.stringify(['Orange', 'Sullivan', 'Ulster']),
        serviceAreaRadius: 35,
        paymentMethods: JSON.stringify(['credit_card', 'debit', 'cash', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'propane', 'diesel', 'kerosene']),
        minimumGallons: 100,
        hoursWeekday: '8:00 AM - 4:00 PM',
        hoursSaturday: null,
        hoursSunday: null,
        weekendDelivery: false,
        emergencyDelivery: true,
        seniorDiscount: false,
        notes: null,
        active: true,
        verified: false,
        allowPriceDisplay: false,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: uuidv4(),
        name: 'Upstate Energy',
        slug: 'upstate-energy',
        phone: '(845) 255-5747',
        email: 'info@upstate-energy.com',
        website: 'https://www.upstate-energy.com',
        addressLine1: '1950 Route 32',
        city: 'Modena',
        state: 'NY',
        postalCodesServed: JSON.stringify([
          // Orange County
          '10916', // Campbell Hall
          '10918', // Chester
          '10924', // Goshen
          '10926', // Harriman
          '10930', // Highland Mills
          '10940', '10941', // Middletown
          '10950', // Monroe
          '10953', // Mountainville
          '10958', // New Hampton
          '10985', // Thompson Ridge
          '10992', // Washingtonville
          '12518', // Cornwall
          '12520', // Cornwall-on-Hudson
          '12543', // Maybrook
          '12549', // Montgomery
          '12550', // Newburgh
          '12553', // New Windsor
          '12575', // Rock Tavern
          '12577', // Salisbury Mills
          '12584', // Vails Gate
          '12586', // Walden
          '12589', // Wallkill
          // Ulster County
          '12401', // Kingston
          '12404', // Accord
          '12411', // Bloomington
          '12417', // Connelly
          '12419', // Cottekill
          '12420', // Cragsmoor
          '12428', // Ellenville
          '12429', // Esopus
          '12440', // High Falls
          '12443', // Hurley
          '12446', // Kerhonkson
          '12449', // Lake Katrine
          '12458', // Napanoch
          '12461', // Olivebridge
          '12466', // Port Ewen
          '12471', // Rifton
          '12472', // Rosendale
          '12475', // Ruby
          '12484', // Stone Ridge
          '12486', // Tillson
          '12487', // Ulster Park
          '12493', // West Park
          '12515', // Clintondale
          '12525', // Gardiner
          '12528', // Highland
          '12542', // Marlboro
          '12547', // Milton
          '12548', // Modena
          '12561', // New Paltz
          '12566', // Pine Bush
          '12568', // Plattekill
          '12588', // Walker Valley
          // Sullivan County
          '12721', // Bloomingburg
          '12722', // Burlingham
          '12775', // Rock Hill
          '12790', // Wurtsboro
          // Dutchess County
          '12508', // Beacon
          '12524', // Fishkill
          '12537', // Hughsonville
          '12538', // Hyde Park
          '12569', // Pleasant Valley
          '12574', // Rhinecliff
          '12580', // Staatsburg
          '12590'  // Wappingers Falls
        ]),
        serviceCities: JSON.stringify([
          'Modena', 'Campbell Hall', 'Chester', 'Cornwall', 'Cornwall on Hudson',
          'Goshen', 'Harriman', 'Highland Mills', 'Maybrook', 'Middletown', 'Monroe',
          'Montgomery', 'Mountainville', 'New Hampton', 'New Windsor', 'Newburgh',
          'Rock Tavern', 'Salisbury Mills', 'Thompson Ridge', 'Vails Gate', 'Walden',
          'Wallkill', 'Washingtonville',
          'Accord', 'Bloomington', 'Clintondale', 'Connelly', 'Cottekill', 'Cragsmoor',
          'Ellenville', 'Esopus', 'Gardiner', 'High Falls', 'Highland', 'Hurley',
          'Kerhonkson', 'Kingston', 'Lake Katrine', 'Marlboro', 'Milton', 'Napanoch',
          'New Paltz', 'Olivebridge', 'Pine Bush', 'Plattekill', 'Port Ewen', 'Rifton',
          'Rosendale', 'Ruby', 'Stone Ridge', 'Tillson', 'Ulster Park', 'Walker Valley', 'West Park',
          'Bloomingburg', 'Burlingham', 'Rock Hill', 'Wurtsboro',
          'Beacon', 'Fishkill', 'Hughsonville', 'Hyde Park', 'Pleasant Valley',
          'Rhinecliff', 'Staatsburg', 'Wappingers Falls'
        ]),
        serviceCounties: JSON.stringify(['Orange', 'Ulster', 'Sullivan', 'Dutchess']),
        serviceAreaRadius: 35,
        paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'propane', 'diesel', 'kerosene']),
        minimumGallons: 100,
        hoursWeekday: '8:00 AM - 4:30 PM',
        hoursSaturday: null,
        hoursSunday: null,
        weekendDelivery: false,
        emergencyDelivery: true,
        seniorDiscount: false,
        notes: null,
        active: true,
        verified: false,
        allowPriceDisplay: false,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: uuidv4(),
        name: 'Blanket Oil',
        slug: 'blanket-oil',
        phone: '(845) 744-8770',
        email: 'BlanketOil@frontiernet.net',
        website: 'https://www.mirabito.com/blanketoil/',
        addressLine1: '12 New St',
        city: 'Pine Bush',
        state: 'NY',
        postalCodesServed: JSON.stringify([
          // Orange County
          '10914', // Blooming Grove
          '10915', // Bullville
          '10916', // Campbell Hall
          '10918', // Chester
          '10919', // Circleville
          '10921', // Florida
          '10924', // Goshen
          '10932', // Howells
          '10933', // Johnson
          '10940', '10941', // Middletown
          '10949', '10950', // Monroe
          '10953', // Mountainville
          '10958', // New Hampton
          '10963', // Otisville
          '10973', // Slate Hill
          '10981', // Sugar Loaf
          '10985', // Thompson Ridge
          '10992', // Washingtonville
          '12518', // Cornwall
          '12520', // Cornwall-on-Hudson
          '12543', // Maybrook
          '12549', // Montgomery
          '12550', // Newburgh
          '12553', // New Windsor
          '12566', // Pine Bush
          '12575', // Rock Tavern
          '12577', // Salisbury Mills
          '12584', // Vails Gate
          '12586', // Walden
          '12589', // Wallkill
          // Ulster County
          '12404', // Accord
          '12419', // Cottekill
          '12420', // Cragsmoor
          '12428', // Ellenville
          '12435', // Greenfield Park
          '12440', // High Falls
          '12446', // Kerhonkson
          '12458', // Napanoch
          '12461', // Olivebridge
          '12472', // Rosendale
          '12483', // Spring Glen
          '12484', // Stone Ridge
          '12486', // Tillson
          '12489', // Wawarsing
          '12515', // Clintondale
          '12525', // Gardiner
          '12528', // Highland
          '12542', // Marlboro
          '12547', // Milton
          '12548', // Modena
          '12561', // New Paltz
          '12568', // Plattekill
          '12588', // Walker Valley
          // Sullivan County
          '12721', // Bloomingburg
          '12722', // Burlingham
          '12729', // Cuddebackville
          '12733', // Fallsburg
          '12738', // Glen Wild
          '12751', // Kiamesha Lake
          '12763', // Mountain Dale
          '12769', // Phillipsport
          '12775', // Rock Hill
          '12779', // South Fallsburg
          '12781', // Summitville
          '12784', // Thompsonville
          '12785', // Westbrookville
          '12788', // Woodbourne
          '12789', // Woodridge
          '12790', // Wurtsboro
          // Dutchess County
          '12508', // Beacon
          '12527', // Glenham
          '12537', // Hughsonville
          '12590'  // Wappingers Falls
        ]),
        serviceCities: JSON.stringify([
          'Pine Bush', 'Blooming Grove', 'Bullville', 'Campbell Hall', 'Chester',
          'Circleville', 'Cornwall', 'Cornwall on Hudson', 'Florida', 'Goshen',
          'Howells', 'Johnson', 'Maybrook', 'Middletown', 'Monroe', 'Montgomery',
          'Mountainville', 'New Hampton', 'New Windsor', 'Newburgh', 'Otisville',
          'Rock Tavern', 'Salisbury Mills', 'Slate Hill', 'Sugar Loaf', 'Thompson Ridge',
          'Vails Gate', 'Walden', 'Washingtonville',
          'Accord', 'Clintondale', 'Cottekill', 'Cragsmoor', 'Ellenville', 'Gardiner',
          'Greenfield Park', 'High Falls', 'Highland', 'Kerhonkson', 'Marlboro', 'Milton',
          'Modena', 'Napanoch', 'New Paltz', 'Olivebridge', 'Plattekill', 'Rosendale',
          'Spring Glen', 'Stone Ridge', 'Tillson', 'Walker Valley', 'Wallkill', 'Wawarsing',
          'Bloomingburg', 'Burlingham', 'Cuddebackville', 'Fallsburg', 'Glen Wild',
          'Kiamesha Lake', 'Mountain Dale', 'Phillipsport', 'Rock Hill', 'South Fallsburg',
          'Summitville', 'Thompsonville', 'Westbrookville', 'Woodbourne', 'Woodridge', 'Wurtsboro',
          'Beacon', 'Glenham', 'Hughsonville', 'Wappingers Falls'
        ]),
        serviceCounties: JSON.stringify(['Orange', 'Ulster', 'Sullivan', 'Dutchess']),
        serviceAreaRadius: 35,
        paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'propane', 'diesel', 'kerosene']),
        minimumGallons: null,
        hoursWeekday: '8:00 AM - 4:30 PM',
        hoursSaturday: null,
        hoursSunday: null,
        weekendDelivery: false,
        emergencyDelivery: true,
        seniorDiscount: false,
        notes: null,
        active: true,
        verified: false,
        allowPriceDisplay: false,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: uuidv4(),
        name: 'Combined Energy Services',
        slug: 'combined-energy-services',
        phone: '(845) 794-1210',
        email: 'info@combinedenergyservices.com',
        website: 'https://www.combinedenergyservices.com',
        addressLine1: '216 E Broadway',
        city: 'Monticello',
        state: 'NY',
        postalCodesServed: JSON.stringify([
          // Sullivan County
          '12701', // Monticello
          '12719', // Barryville
          '12720', // Bethel
          '12721', // Bloomingburg
          '12722', // Burlingham
          '12723', // Callicoon
          '12725', // Claryville
          '12726', // Cochecton
          '12732', // Eldred
          '12733', // Fallsburg
          '12734', // Ferndale
          '12737', // Glen Spey
          '12738', // Glen Wild
          '12740', // Grahamsville
          '12742', // Harris
          '12743', // Highland Lake
          '12747', // Hurleyville
          '12748', // Jeffersonville
          '12749', // Kauneonga Lake
          '12750', // Kenoza Lake
          '12751', // Kiamesha Lake
          '12752', // Lake Huntington
          '12754', // Liberty
          '12758', // Livingston Manor
          '12759', // Loch Sheldrake
          '12762', // Mongaup Valley
          '12763', // Mountain Dale
          '12764', // Narrowsburg
          '12765', // Neversink
          '12768', // Parksville
          '12770', // Pond Eddy
          '12775', // Rock Hill
          '12776', // Roscoe
          '12777', // Forestburgh
          '12778', // Smallwood
          '12779', // South Fallsburg
          '12781', // Summitville
          '12783', // Swan Lake
          '12784', // Thompsonville
          '12785', // Westbrookville
          '12786', // White Lake
          '12787', // White Sulphur Springs
          '12788', // Woodbourne
          '12789', // Woodridge
          '12790', // Wurtsboro
          '12791', // Youngsville
          // Orange County
          '10940', // Middletown
          '10958', // New Hampton
          '10963', // Otisville
          '10969', // Pine Island
          '10990', // Warwick
          '12566', // Pine Bush
          '12729', // Cuddebackville
          '12771', // Port Jervis
          '12780', // Sparrow Bush
          // Ulster County
          '12404', // Accord
          '12420', // Cragsmoor
          '12428', // Ellenville
          '12435', // Greenfield Park
          '12446', // Kerhonkson
          '12458', // Napanoch
          '12461', // Olivebridge
          '12484', // Stone Ridge
          '12525'  // Gardiner
        ]),
        serviceCities: JSON.stringify([
          'Monticello', 'Barryville', 'Bethel', 'Bloomingburg', 'Burlingham', 'Callicoon',
          'Claryville', 'Cochecton', 'Eldred', 'Fallsburg', 'Ferndale', 'Forestburgh',
          'Glen Spey', 'Glen Wild', 'Grahamsville', 'Harris', 'Highland Lake', 'Hurleyville',
          'Jeffersonville', 'Kauneonga Lake', 'Kenoza Lake', 'Kiamesha Lake', 'Lake Huntington',
          'Liberty', 'Livingston Manor', 'Loch Sheldrake', 'Mongaup Valley', 'Mountain Dale',
          'Narrowsburg', 'Neversink', 'Parksville', 'Pond Eddy', 'Rock Hill', 'Roscoe',
          'Smallwood', 'South Fallsburg', 'Summitville', 'Swan Lake', 'Thompsonville',
          'Westbrookville', 'White Lake', 'White Sulphur Springs', 'Woodbourne', 'Woodridge',
          'Wurtsboro', 'Youngsville',
          'Middletown', 'New Hampton', 'Otisville', 'Pine Island', 'Warwick',
          'Pine Bush', 'Cuddebackville', 'Port Jervis', 'Sparrow Bush',
          'Accord', 'Cragsmoor', 'Ellenville', 'Greenfield Park', 'Kerhonkson',
          'Napanoch', 'Olivebridge', 'Stone Ridge', 'Gardiner'
        ]),
        serviceCounties: JSON.stringify(['Sullivan', 'Orange', 'Ulster']),
        serviceAreaRadius: 40,
        paymentMethods: JSON.stringify(['credit_card', 'debit', 'cash', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'propane', 'kerosene', 'diesel']),
        minimumGallons: 150,
        hoursWeekday: '7:00 AM - 5:00 PM',
        hoursSaturday: '8:00 AM - 4:00 PM',
        hoursSunday: null,
        weekendDelivery: true,
        emergencyDelivery: true,
        seniorDiscount: false,
        notes: null,
        active: true,
        verified: false,
        allowPriceDisplay: false,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: uuidv4(),
        name: 'County Petroleum',
        slug: 'county-petroleum',
        phone: '(845) 292-4550',
        email: 'customerservice@countypetroleum.com',
        website: 'https://countypetroleum.com',
        addressLine1: '36 Station Hill Rd',
        city: 'Ferndale',
        state: 'NY',
        postalCodesServed: JSON.stringify([
          // Sullivan County
          '12701', // Monticello
          '12719', // Barryville
          '12720', // Bethel
          '12721', // Bloomingburg
          '12722', // Burlingham
          '12723', // Callicoon
          '12725', // Claryville
          '12726', // Cochecton
          '12732', // Eldred
          '12733', // Fallsburg
          '12734', // Ferndale
          '12737', // Glen Spey
          '12738', // Glen Wild
          '12740', // Grahamsville
          '12741', // Hankins
          '12742', // Harris
          '12743', // Highland Lake
          '12747', // Hurleyville
          '12748', // Jeffersonville
          '12749', // Kauneonga Lake
          '12750', // Kenoza Lake
          '12751', // Kiamesha Lake
          '12752', // Lake Huntington
          '12754', // Liberty
          '12758', // Livingston Manor
          '12759', // Loch Sheldrake
          '12760', // Long Eddy
          '12762', // Mongaup Valley
          '12763', // Mountain Dale
          '12764', // Narrowsburg
          '12765', // Neversink
          '12768', // Parksville
          '12769', // Phillipsport
          '12770', // Pond Eddy
          '12775', // Rock Hill
          '12776', // Roscoe
          '12777', // Forestburgh
          '12778', // Smallwood
          '12779', // South Fallsburg
          '12781', // Summitville
          '12783', // Swan Lake
          '12784', // Thompsonville
          '12785', // Westbrookville
          '12786', // White Lake
          '12787', // White Sulphur Springs
          '12788', // Woodbourne
          '12789', // Woodridge
          '12790', // Wurtsboro
          '12791', // Youngsville
          '12792', // Yulan
          // Ulster County
          '12404', // Accord
          '12420', // Cragsmoor
          '12428', // Ellenville
          '12435', // Greenfield Park
          '12446', // Kerhonkson
          '12458', // Napanoch
          '12483', // Spring Glen
          '12489', // Wawarsing
          '12588', // Walker Valley
          // Orange County
          '10963', // Otisville
          '12566', // Pine Bush
          '12729', // Cuddebackville
          '12746', // Huguenot
          '12780'  // Sparrow Bush
        ]),
        serviceCities: JSON.stringify([
          'Ferndale', 'Monticello', 'Barryville', 'Bethel', 'Bloomingburg', 'Burlingham',
          'Callicoon', 'Claryville', 'Cochecton', 'Eldred', 'Fallsburg', 'Forestburgh',
          'Glen Spey', 'Glen Wild', 'Grahamsville', 'Hankins', 'Harris', 'Highland Lake',
          'Hurleyville', 'Jeffersonville', 'Kauneonga Lake', 'Kenoza Lake', 'Kiamesha Lake',
          'Lake Huntington', 'Liberty', 'Livingston Manor', 'Loch Sheldrake', 'Long Eddy',
          'Mongaup Valley', 'Mountain Dale', 'Narrowsburg', 'Neversink', 'Parksville',
          'Phillipsport', 'Pond Eddy', 'Rock Hill', 'Roscoe', 'Smallwood', 'South Fallsburg',
          'Summitville', 'Swan Lake', 'Thompsonville', 'Westbrookville', 'White Lake',
          'White Sulphur Springs', 'Woodbourne', 'Woodridge', 'Wurtsboro', 'Youngsville', 'Yulan',
          'Accord', 'Cragsmoor', 'Ellenville', 'Greenfield Park', 'Kerhonkson',
          'Napanoch', 'Spring Glen', 'Walker Valley', 'Wawarsing',
          'Cuddebackville', 'Huguenot', 'Otisville', 'Pine Bush', 'Sparrow Bush'
        ]),
        serviceCounties: JSON.stringify(['Sullivan', 'Ulster', 'Orange', 'Delaware']),
        serviceAreaRadius: 35,
        paymentMethods: JSON.stringify(['credit_card', 'debit', 'cash', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'diesel']),
        minimumGallons: 150,
        hoursWeekday: '7:30 AM - 5:30 PM',
        hoursSaturday: null,
        hoursSunday: null,
        weekendDelivery: true,
        emergencyDelivery: true,
        seniorDiscount: true,
        notes: null,
        active: true,
        verified: false,
        allowPriceDisplay: false,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    for (const supplier of suppliers) {
      await sequelize.query(`
        INSERT INTO suppliers (
          id, name, slug, phone, email, website, address_line1, city, state,
          postal_codes_served, service_cities, service_counties, service_area_radius,
          payment_methods, fuel_types, minimum_gallons,
          hours_weekday, hours_saturday, hours_sunday,
          weekend_delivery, emergency_delivery, senior_discount, notes,
          active, verified, allow_price_display, created_at, updated_at
        ) VALUES (
          :id, :name, :slug, :phone, :email, :website, :addressLine1, :city, :state,
          :postalCodesServed, :serviceCities, :serviceCounties, :serviceAreaRadius,
          :paymentMethods, :fuelTypes, :minimumGallons,
          :hoursWeekday, :hoursSaturday, :hoursSunday,
          :weekendDelivery, :emergencyDelivery, :seniorDiscount, :notes,
          :active, :verified, :allowPriceDisplay, :createdAt, :updatedAt
        )
        ON CONFLICT (slug) DO NOTHING
      `, {
        replacements: {
          ...supplier,
          addressLine1: supplier.addressLine1 || null,
          website: supplier.website || null,
          email: supplier.email || null,
          hoursWeekday: supplier.hoursWeekday || null,
          hoursSaturday: supplier.hoursSaturday || null,
          hoursSunday: supplier.hoursSunday || null,
          weekendDelivery: supplier.weekendDelivery || false,
          emergencyDelivery: supplier.emergencyDelivery || false,
          seniorDiscount: supplier.seniorDiscount || false,
          allowPriceDisplay: supplier.allowPriceDisplay === true,
          minimumGallons: supplier.minimumGallons || null,
          notes: supplier.notes || null
        }
      });

      console.log(`[Migration 035] Added ${supplier.name} (${supplier.city}, ${supplier.state})`);
    }

    // Ensure no price display/scraping for these directory-only suppliers
    await sequelize.query(`
      UPDATE suppliers
      SET allow_price_display = false
      WHERE slug IN ('big-o-fuels', 'upstate-energy', 'blanket-oil', 'combined-energy-services', 'county-petroleum')
    `);
  },

  async down(sequelize) {
    await sequelize.query(`
      DELETE FROM suppliers
      WHERE slug IN (
        'big-o-fuels',
        'upstate-energy',
        'blanket-oil',
        'combined-energy-services',
        'county-petroleum'
      )
    `);
  }
};
