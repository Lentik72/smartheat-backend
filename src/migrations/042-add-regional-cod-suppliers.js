/**
 * Migration 042: Add Regional COD Suppliers
 * - Optimum Fuel Services (Hampton, VA) - NEW STATE
 * - State Fuel Company (Rochester, NY) - Western NY expansion
 * - Fox Fuel (Pittsford, VT) - Rutland County, scrapable pricing
 * - Daigle Oil Company (Fort Kent, ME) - Northern Maine, 5 locations
 */

const { v4: uuidv4 } = require('uuid');

module.exports = {
  name: '042-add-regional-cod-suppliers',

  async up(sequelize) {
    const suppliers = [
      // ============================================
      // OPTIMUM FUEL SERVICES - Hampton, VA (NEW STATE)
      // ============================================
      {
        id: uuidv4(),
        name: 'Optimum Fuel Services',
        slug: 'optimum-fuel-services',
        phone: '(757) 325-2373',
        email: null,
        website: 'https://www.optimumfuelservices.com',
        addressLine1: '1908 Kensington Dr',
        city: 'Hampton',
        state: 'VA',
        postalCodesServed: JSON.stringify([
          // Hampton
          '23661', '23663', '23664', '23665', '23666', '23667', '23668', '23669', '23681',
          // Newport News
          '23601', '23602', '23603', '23604', '23605', '23606', '23607', '23608',
          // Yorktown
          '23690', '23691', '23692', '23693',
          // Poquoson
          '23662',
          // Williamsburg
          '23185', '23187', '23188',
          // Other
          '23696', // Seaford
          '23168', // Toano
          '23127'  // Norge
        ]),
        serviceCities: JSON.stringify([
          'Hampton', 'Newport News', 'Yorktown', 'Poquoson', 'Williamsburg',
          'Seaford', 'Croaker', 'Norge', 'Toano'
        ]),
        serviceCounties: JSON.stringify(['Hampton City', 'Newport News City', 'York', 'Poquoson City', 'James City', 'Williamsburg City']),
        serviceAreaRadius: 25,
        lat: 37.0515,
        lng: -76.3350,
        paymentMethods: JSON.stringify(['credit_card', 'cash', 'debit']),
        fuelTypes: JSON.stringify(['heating_oil', 'diesel']),
        minimumGallons: 25,
        hoursWeekday: '8:00 AM - 5:00 PM',
        hoursSaturday: null,
        hoursSunday: null,
        weekendDelivery: false,
        emergencyDelivery: false,
        emergencyPhone: null,
        seniorDiscount: 'yes',
        active: true,
        verified: false,
        allowPriceDisplay: false,
        createdAt: new Date(),
        updatedAt: new Date()
      },

      // ============================================
      // STATE FUEL COMPANY - Rochester, NY (Western NY)
      // ============================================
      {
        id: uuidv4(),
        name: 'State Fuel Company',
        slug: 'state-fuel-company',
        phone: '(585) 247-2380',
        email: 'statefuel@wny.twcbc.com',
        website: 'https://www.statefuelinc.com',
        addressLine1: '1100 Long Pond Road, Suite 220',
        city: 'Rochester',
        state: 'NY',
        postalCodesServed: JSON.stringify([
          // Monroe County
          '14602', '14603', '14604', '14605', '14606', '14607', '14608', '14609', '14610',
          '14611', '14612', '14613', '14614', '14615', '14616', '14617', '14618', '14619',
          '14620', '14621', '14622', '14623', '14624', '14625', '14626', '14627',
          '14445', // East Rochester
          '14450', // Fairport
          '14464', // Hamlin
          '14468', // Hilton
          '14502', // Macedon
          '14506', // Mendon
          '14514', // North Chili
          '14519', // Ontario
          '14526', // Penfield
          '14534', // Pittsford
          '14543', // Rush
          '14546', // Scottsville
          '14559', // Spencerport
          '14580', // Webster
          '14428', // Churchville
          // Orleans County
          '14411', // Albion
          '14470', // Holley
          '14479', // Kent
          '14103', // Medina
          '14571', // Waterport
          // Genesee County
          '14020', // Batavia
          '14482', // Le Roy
          '14036', // Corfu
          '14525', // Pavilion
          '14416', // Bergen
          // Livingston County
          '14454', // Geneseo
          '14487', // Livonia
          '14414', // Avon
          '14510', // Mount Morris
          '14846', // Nunda
          // Ontario County
          '14564', // Victor
          '14424', // Canandaigua
          '14456', // Geneva
          '14425', // Farmington
          // Wayne County
          '14502', // Macedon
          '14513', // Newark
          '14519', // Ontario
          '14589', // Williamson
          '14522', // Palmyra
          '14551'  // Red Creek
        ]),
        serviceCities: JSON.stringify([
          'Rochester', 'Irondequoit', 'Brighton', 'Henrietta', 'Penfield', 'Pittsford',
          'Gates', 'Greece', 'Webster', 'Fairport', 'East Rochester', 'Spencerport',
          'Hilton', 'Hamlin', 'Churchville', 'Scottsville', 'Rush', 'Mendon',
          'Batavia', 'Le Roy', 'Corfu', 'Bergen', 'Pavilion',
          'Albion', 'Medina', 'Holley', 'Waterport',
          'Geneseo', 'Livonia', 'Avon', 'Mount Morris', 'Nunda',
          'Victor', 'Canandaigua', 'Geneva', 'Farmington',
          'Macedon', 'Newark', 'Ontario', 'Williamson', 'Palmyra'
        ]),
        serviceCounties: JSON.stringify(['Monroe', 'Orleans', 'Genesee', 'Livingston', 'Ontario', 'Wayne']),
        serviceAreaRadius: 40,
        lat: 43.2227,
        lng: -77.6968,
        paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'diesel']),
        minimumGallons: null,
        hoursWeekday: '8:00 AM - 5:00 PM',
        hoursSaturday: '8:00 AM - 2:00 PM',
        hoursSunday: null,
        weekendDelivery: true,
        emergencyDelivery: true,
        emergencyPhone: '(585) 247-2380',
        seniorDiscount: 'unknown',
        active: true,
        verified: false,
        allowPriceDisplay: false,
        createdAt: new Date(),
        updatedAt: new Date()
      },

      // ============================================
      // FOX FUEL - Pittsford, VT (Rutland County)
      // ============================================
      {
        id: uuidv4(),
        name: 'Fox Fuel',
        slug: 'fox-fuel',
        phone: '(802) 345-9605',
        email: 'chad@foxfuelvt.com',
        website: 'https://www.foxfuelvt.com',
        addressLine1: '1304 Corn Hill Rd',
        city: 'Pittsford',
        state: 'VT',
        postalCodesServed: JSON.stringify([
          // Rutland County - all ZIP codes
          '05701', '05702', // Rutland
          '05730', // Belmont
          '05731', // Benson
          '05732', // Bomoseen
          '05733', // Brandon
          '05735', // Castleton
          '05736', // Center Rutland
          '05737', // Chittenden
          '05738', // Cuttingsville
          '05739', // Danby
          '05741', // East Poultney
          '05742', // East Wallingford
          '05743', // Fair Haven
          '05744', // Florence
          '05745', // Forest Dale
          '05750', // Hydeville
          '05751', // Killington
          '05757', // Middletown Springs
          '05758', // Mount Holly
          '05759', // North Clarendon
          '05761', // Pawlet
          '05762', // Pittsfield
          '05763', // Pittsford
          '05764', // Poultney
          '05765', // Proctor
          '05773', // Wallingford
          '05774', // Wells
          '05775', // West Pawlet
          '05777'  // West Rutland
        ]),
        serviceCities: JSON.stringify([
          'Rutland', 'Belmont', 'Benson', 'Bomoseen', 'Brandon', 'Castleton',
          'Center Rutland', 'Chittenden', 'Cuttingsville', 'Danby', 'East Poultney',
          'East Wallingford', 'Fair Haven', 'Florence', 'Forest Dale', 'Hydeville',
          'Killington', 'Middletown Springs', 'Mount Holly', 'North Clarendon',
          'Pawlet', 'Pittsfield', 'Pittsford', 'Poultney', 'Proctor',
          'Wallingford', 'Wells', 'West Pawlet', 'West Rutland'
        ]),
        serviceCounties: JSON.stringify(['Rutland']),
        serviceAreaRadius: 30,
        lat: 43.7064,
        lng: -73.0278,
        paymentMethods: JSON.stringify(['credit_card', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'diesel', 'kerosene']),
        minimumGallons: 100,
        hoursWeekday: 'Mon-Fri Delivery',
        hoursSaturday: null,
        hoursSunday: null,
        weekendDelivery: false,
        emergencyDelivery: true,
        emergencyPhone: '(802) 345-9605',
        seniorDiscount: 'unknown',
        active: true,
        verified: false,
        allowPriceDisplay: false,
        createdAt: new Date(),
        updatedAt: new Date()
      },

      // ============================================
      // DAIGLE OIL COMPANY - Fort Kent, ME (Northern Maine)
      // ============================================
      {
        id: uuidv4(),
        name: 'Daigle Oil Company',
        slug: 'daigle-oil-company',
        phone: '1-800-654-1869',
        email: '[email protected]',
        website: 'https://www.daigleoil.com',
        addressLine1: '155 West Main Street',
        city: 'Fort Kent',
        state: 'ME',
        postalCodesServed: JSON.stringify([
          // Aroostook County
          '04730', // Houlton
          '04732', // Ashland
          '04733', // Benedicta
          '04734', // Blaine
          '04735', // Bridgewater
          '04736', // Caribou
          '04737', // Clayton Lake
          '04738', // Crouseville
          '04739', // Eagle Lake
          '04740', // Easton
          '04741', // Estcourt Station
          '04742', // Fort Fairfield
          '04743', // Fort Kent
          '04744', // Fort Kent Mills
          '04745', // Frenchville
          '04746', // Grand Isle
          '04747', // Island Falls
          '04750', // Limestone
          '04751', // Limestone
          '04756', // Madawaska
          '04757', // Mapleton
          '04758', // Mars Hill
          '04760', // Monticello
          '04761', // New Limerick
          '04762', // New Sweden
          '04763', // Oakfield
          '04764', // Oxbow
          '04766', // Perham
          '04768', // Portage
          '04769', // Presque Isle
          '04772', // Saint Agatha
          '04773', // Saint David
          '04774', // Saint Francis
          '04775', // Sheridan
          '04776', // Sherman
          '04779', // Sinclair
          '04780', // Smyrna Mills
          '04781', // Wallagrass
          '04783', // Stockholm
          '04785', // Van Buren
          '04786', // Washburn
          '04787', // Westfield
          '04471', // Orient
          '04497', // Wytopitlock
          // Northern Penobscot County
          '04457', // Lincoln
          '04462', // Millinocket
          '04430', // East Millinocket
          '04765', // Patten
          '04777', // Stacyville
          '04460', // Medway
          '04495', // Winn
          '04459', // Mattawamkeag
          '04455', // Lee
          '04487'  // Springfield
        ]),
        serviceCities: JSON.stringify([
          'Fort Kent', 'Madawaska', 'Ashland', 'Presque Isle', 'Houlton',
          'Caribou', 'Van Buren', 'Fort Fairfield', 'Limestone', 'Mars Hill',
          'Eagle Lake', 'Frenchville', 'Grand Isle', 'Saint Agatha', 'Stockholm',
          'Washburn', 'Mapleton', 'Easton', 'Blaine', 'Bridgewater',
          'Monticello', 'Island Falls', 'Sherman', 'Patten', 'Oakfield',
          'Smyrna Mills', 'New Limerick', 'Orient', 'Wytopitlock',
          'Lincoln', 'Millinocket', 'East Millinocket', 'Medway', 'Stacyville',
          'Lee', 'Springfield', 'Mattawamkeag', 'Winn'
        ]),
        serviceCounties: JSON.stringify(['Aroostook', 'Penobscot']),
        serviceAreaRadius: 100,
        lat: 47.2575,
        lng: -68.5895,
        paymentMethods: JSON.stringify(['credit_card', 'cash', 'check']),
        fuelTypes: JSON.stringify(['heating_oil', 'kerosene', 'propane', 'diesel']),
        minimumGallons: 100,
        hoursWeekday: '7:00 AM - 5:00 PM',
        hoursSaturday: '7:00 AM - 11:00 AM',
        hoursSunday: null,
        weekendDelivery: true,
        emergencyDelivery: true,
        emergencyPhone: '1-800-794-4362',
        seniorDiscount: 'yes',
        active: true,
        verified: false,
        allowPriceDisplay: false,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    // Insert all suppliers
    for (const supplier of suppliers) {
      await sequelize.query(`
        INSERT INTO suppliers (
          id, name, slug, phone, email, website, address_line1, city, state,
          postal_codes_served, service_cities, service_counties, service_area_radius,
          lat, lng, payment_methods, fuel_types, minimum_gallons,
          hours_weekday, hours_saturday, hours_sunday, weekend_delivery, emergency_delivery,
          emergency_phone, senior_discount, notes, active, verified, allow_price_display,
          created_at, updated_at
        ) VALUES (
          :id, :name, :slug, :phone, :email, :website, :addressLine1, :city, :state,
          :postalCodesServed, :serviceCities, :serviceCounties, :serviceAreaRadius,
          :lat, :lng, :paymentMethods, :fuelTypes, :minimumGallons,
          :hoursWeekday, :hoursSaturday, :hoursSunday, :weekendDelivery, :emergencyDelivery,
          :emergencyPhone, :seniorDiscount, :notes, :active, :verified, :allowPriceDisplay,
          :createdAt, :updatedAt
        )
        ON CONFLICT (slug) DO NOTHING
      `, {
        replacements: {
          ...supplier,
          notes: null,
          weekendDelivery: supplier.weekendDelivery === true ? 'yes' : 'no',
          emergencyDelivery: supplier.emergencyDelivery === true ? 'yes' : 'no',
          allowPriceDisplay: supplier.allowPriceDisplay === true
        }
      });
    }

    console.log('✅ Migration 042: Added 4 regional COD suppliers (VA, NY, VT, ME)');
  },

  async down(sequelize) {
    await sequelize.query(`
      DELETE FROM suppliers WHERE slug IN (
        'optimum-fuel-services',
        'state-fuel-company',
        'fox-fuel',
        'daigle-oil-company'
      )
    `);
    console.log('✅ Migration 042 rolled back');
  }
};
