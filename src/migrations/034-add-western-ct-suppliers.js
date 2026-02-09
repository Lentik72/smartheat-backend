/**
 * Migration 034: Add Western CT suppliers (Danbury/Brookfield/Oakville/Bridgeport area)
 * Leahy's Fuels, Mitchell Oil, Baribault Oil, Santa Energy
 * All verified COD/will-call suppliers via Nextdoor + web research
 */

const { v4: uuidv4 } = require('uuid');

module.exports = {
  name: '034-add-western-ct-suppliers',

  async up(sequelize) {
    const suppliers = [
      {
        id: uuidv4(),
        name: "Leahy's Fuels",
        slug: 'leahys-fuels',
        phone: '(203) 748-3535',
        email: 'info@leahys.com',
        website: 'https://www.leahys.com',
        addressLine1: '130 White St',
        city: 'Danbury',
        state: 'CT',
        postalCodesServed: JSON.stringify([
          // Fairfield County
          '06810', '06811', '06813', '06814', // Danbury
          '06801', // Bethel
          '06804', // Brookfield
          '06812', // New Fairfield
          '06877', // Ridgefield
          '06896', // Redding / Georgetown
          '06883', // Weston
          '06897', // Wilton
          '06840', // New Canaan
          '06612', // Easton
          '06468', // Monroe
          '06611', // Trumbull
          '06470', // Newtown
          '06482', // Sandy Hook
          '06784', // Sherman
          // Litchfield County
          '06776', // New Milford
          '06752', // Bridgewater
          '06783', // Roxbury
          '06798', // Woodbury
          '06488', // Southbury
          '06478', // Oxford
          // Putnam County NY
          '10509', // Brewster
          '10512', // Carmel
          '10541', // Mahopac
          '10579', // Putnam Valley
          // Westchester County NY
          '10560', // North Salem
          '10590', // South Salem
          '10576', // Pound Ridge
          '10549', // Mount Kisco
          '10507', // Bedford Hills
          '10506', // Bedford
          '10536', // Katonah
          // Dutchess County NY
          '12594'  // Wingdale
        ]),
        serviceCities: JSON.stringify([
          'Danbury', 'Bethel', 'Brookfield', 'New Fairfield', 'Ridgefield',
          'Redding', 'Georgetown', 'Weston', 'Wilton', 'New Canaan',
          'Easton', 'Monroe', 'Trumbull', 'Newtown', 'Sandy Hook', 'Sherman',
          'New Milford', 'Bridgewater', 'Roxbury', 'Woodbury', 'Southbury', 'Oxford',
          'Brewster', 'Carmel', 'Mahopac', 'Putnam Valley',
          'North Salem', 'South Salem', 'Pound Ridge', 'Mount Kisco',
          'Bedford Hills', 'Bedford', 'Katonah'
        ]),
        serviceCounties: JSON.stringify(['Fairfield', 'Litchfield', 'New Haven', 'Putnam', 'Westchester', 'Dutchess']),
        serviceAreaRadius: 30,
        paymentMethods: JSON.stringify(['credit_card', 'debit', 'cash', 'check', 'paypal']),
        fuelTypes: JSON.stringify(['heating_oil', 'propane', 'kerosene', 'diesel']),
        minimumGallons: 150,
        hoursWeekday: '8:00 AM - 5:00 PM',
        hoursSaturday: null,
        hoursSunday: null,
        weekendDelivery: false,
        emergencyDelivery: true,
        seniorDiscount: false,
        notes: null,
        active: true,
        verified: false,
        allowPriceDisplay: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: uuidv4(),
        name: 'Mitchell',
        slug: 'mitchell-oil',
        phone: '(203) 297-9988',
        email: 'webinfo@nemitchell.com',
        website: 'https://www.nemitchell.com',
        addressLine1: '7 Federal Rd',
        city: 'Danbury',
        state: 'CT',
        postalCodesServed: JSON.stringify([
          // Fairfield County
          '06810', '06811', '06813', '06814', // Danbury
          '06801', // Bethel
          '06804', // Brookfield
          '06812', // New Fairfield
          '06877', // Ridgefield
          '06896', // Redding / Georgetown
          '06883', // Weston
          '06897', // Wilton
          '06840', // New Canaan
          '06880', // Westport
          '06612', // Easton
          '06468', // Monroe
          '06611', // Trumbull
          '06470', // Newtown
          '06482', // Sandy Hook
          '06784', // Sherman
          '06484', // Shelton
          // Litchfield County
          '06776', // New Milford
          '06752', // Bridgewater
          '06783', // Roxbury
          '06798', // Woodbury
          '06488', // Southbury
          '06756', // Goshen
          '06757', // Kent
          '06759', // Litchfield
          '06763', // Morris
          '06786', // Bethlehem
          '06793', // Washington
          '06753', // Cornwall
          '06750', // Bantam
          '06777', // New Preston
          // New Haven County
          '06762', // Middlebury
          '06478', // Oxford
          '06483', // Seymour
          // Westchester County NY
          '10507', // Bedford Hills
          '10506', // Bedford
          '10514', // Chappaqua
          '10549', // Mount Kisco
          '10560', // North Salem
          '10590', // South Salem
          '10576', // Pound Ridge
          '10536', // Katonah
          // Putnam County NY
          '10509', // Brewster
          '10512', // Carmel
          '10541'  // Mahopac
        ]),
        serviceCities: JSON.stringify([
          'Danbury', 'Bethel', 'Brookfield', 'New Fairfield', 'Ridgefield',
          'Redding', 'Georgetown', 'Weston', 'Wilton', 'New Canaan', 'Westport',
          'Easton', 'Monroe', 'Trumbull', 'Newtown', 'Sandy Hook', 'Sherman', 'Shelton',
          'New Milford', 'Bridgewater', 'Roxbury', 'Woodbury', 'Southbury',
          'Goshen', 'Kent', 'Litchfield', 'Morris', 'Bethlehem',
          'Washington', 'Cornwall', 'Bantam', 'New Preston',
          'Middlebury', 'Oxford', 'Seymour',
          'Bedford Hills', 'Bedford', 'Chappaqua', 'Mount Kisco',
          'North Salem', 'South Salem', 'Pound Ridge', 'Katonah',
          'Brewster', 'Carmel', 'Mahopac'
        ]),
        serviceCounties: JSON.stringify(['Fairfield', 'Litchfield', 'New Haven', 'Hartford', 'Westchester', 'Putnam', 'Dutchess']),
        serviceAreaRadius: 35,
        paymentMethods: JSON.stringify(['credit_card', 'debit', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'propane', 'diesel', 'kerosene']),
        minimumGallons: 150,
        hoursWeekday: '7:30 AM - 4:00 PM',
        hoursSaturday: '8:00 AM - 12:00 PM',
        hoursSunday: null,
        weekendDelivery: false,
        emergencyDelivery: true,
        seniorDiscount: false,
        notes: null,
        active: true,
        verified: false,
        allowPriceDisplay: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: uuidv4(),
        name: 'Baribault Fuel',
        slug: 'baribault-fuel',
        phone: '(860) 274-3284',
        email: 'info@baribaultfuel.com',
        website: 'https://baribaultfuel.com',
        addressLine1: '600 Main St',
        city: 'Oakville',
        state: 'CT',
        postalCodesServed: JSON.stringify([
          // Litchfield County
          '06779', // Oakville
          '06795', // Watertown
          '06787', // Thomaston
          '06786', // Bethlehem
          '06759', // Litchfield
          '06763', // Morris
          '06782', // Plymouth
          '06750', // Bantam
          // New Haven County
          '06708', '06710', '06702', '06704', '06705', '06706', // Waterbury
          '06770', // Naugatuck
          '06762', // Middlebury
          '06712', // Prospect
          '06716', // Wolcott
          '06410', // Cheshire
          '06403', // Beacon Falls
          '06478', // Oxford
          '06483', // Seymour
          '06488', // Southbury
          // Hartford County
          '06010', // Bristol
          '06013', // Burlington
          '06032', // Farmington
          '06037', // Berlin
          '06051', '06052', '06053', // New Britain
          '06062', // Plainville
          '06085', // Unionville
          '06107', // West Hartford
          '06489'  // Southington
        ]),
        serviceCities: JSON.stringify([
          'Oakville', 'Watertown', 'Thomaston', 'Bethlehem', 'Litchfield',
          'Morris', 'Plymouth', 'Bantam',
          'Waterbury', 'Naugatuck', 'Middlebury', 'Prospect', 'Wolcott',
          'Cheshire', 'Beacon Falls', 'Oxford', 'Seymour', 'Southbury',
          'Bristol', 'Burlington', 'Farmington', 'Berlin', 'New Britain',
          'Plainville', 'Unionville', 'West Hartford', 'Southington'
        ]),
        serviceCounties: JSON.stringify(['Litchfield', 'New Haven', 'Hartford', 'Fairfield']),
        serviceAreaRadius: 25,
        paymentMethods: JSON.stringify(['credit_card', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'propane', 'diesel']),
        minimumGallons: null,
        hoursWeekday: '8:00 AM - 5:00 PM',
        hoursSaturday: null,
        hoursSunday: null,
        weekendDelivery: false,
        emergencyDelivery: true,
        seniorDiscount: false,
        notes: null,
        active: true,
        verified: false,
        allowPriceDisplay: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: uuidv4(),
        name: 'Santa Energy',
        slug: 'santa-energy',
        phone: '(800) 937-2682',
        email: 'info@santaenergy.com',
        website: 'https://www.santaenergy.com',
        addressLine1: '154 Admiral St',
        city: 'Bridgeport',
        state: 'CT',
        postalCodesServed: JSON.stringify([
          // Fairfield County
          '06601', '06604', '06605', '06606', '06607', '06608', '06610', // Bridgeport
          '06824', '06825', // Fairfield
          '06890', // Southport
          '06880', // Westport
          '06883', // Weston
          '06897', // Wilton
          '06840', // New Canaan
          '06820', // Darien
          '06830', '06831', // Greenwich
          '06850', '06851', '06853', '06854', '06855', // Norwalk
          '06468', // Monroe
          '06611', // Trumbull
          '06612', // Easton
          '06470', // Newtown
          '06482', // Sandy Hook
          '06810', '06811', // Danbury
          '06804', // Brookfield
          '06877', // Ridgefield
          '06801', // Bethel
          '06812', // New Fairfield
          '06614', '06615', // Stratford
          '06484', // Shelton
          '06478', // Oxford
          '06901', '06902', '06905', '06906', '06907', // Stamford
          // New Haven County
          '06401', // Ansonia
          '06403', // Beacon Falls
          '06460', // Milford
          '06477', // Orange
          '06770', // Naugatuck
          '06516', // West Haven
          '06525', // Woodbridge
          '06483', // Seymour
          '06418', // Derby
          '06488', // Southbury
          '06762', // Middlebury
          '06410'  // Cheshire
        ]),
        serviceCities: JSON.stringify([
          'Bridgeport', 'Fairfield', 'Southport', 'Westport', 'Weston',
          'Wilton', 'New Canaan', 'Darien', 'Greenwich', 'Norwalk',
          'Monroe', 'Trumbull', 'Easton', 'Newtown', 'Sandy Hook',
          'Danbury', 'Brookfield', 'Ridgefield', 'Bethel', 'New Fairfield',
          'Stratford', 'Shelton', 'Oxford', 'Stamford',
          'Ansonia', 'Beacon Falls', 'Milford', 'Orange', 'Naugatuck',
          'West Haven', 'Woodbridge', 'Seymour', 'Derby', 'Southbury',
          'Middlebury', 'Cheshire'
        ]),
        serviceCounties: JSON.stringify(['Fairfield', 'New Haven']),
        serviceAreaRadius: 30,
        paymentMethods: JSON.stringify(['credit_card', 'debit', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'propane', 'kerosene', 'diesel']),
        minimumGallons: null,
        hoursWeekday: '8:00 AM - 5:00 PM',
        hoursSaturday: null,
        hoursSunday: null,
        weekendDelivery: false,
        emergencyDelivery: true,
        seniorDiscount: false,
        notes: null,
        active: true,
        verified: false,
        allowPriceDisplay: true,
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
          allowPriceDisplay: supplier.allowPriceDisplay !== false,
          minimumGallons: supplier.minimumGallons || null,
          notes: supplier.notes || null
        }
      });

      console.log(`[Migration 034] Added ${supplier.name} (${supplier.city}, ${supplier.state})`);
    }
  },

  async down(sequelize) {
    await sequelize.query(`
      DELETE FROM suppliers
      WHERE slug IN (
        'leahys-fuels',
        'mitchell-oil',
        'baribault-fuel',
        'santa-energy'
      )
    `);
  }
};
