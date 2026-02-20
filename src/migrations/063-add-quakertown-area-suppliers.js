/**
 * Migration 063: Add Quakertown PA Area Suppliers
 *
 * Adds 2 verified COD/will-call suppliers serving Quakertown, PA (18951)
 * and the surrounding Bucks/Montgomery/Lehigh county area:
 *
 * 1. Indian Valley Energy (Sellersville, PA) - "Strictly C.O.D.", "NO CONTRACTS"
 * 2. Apgar Oil (Allentown, PA) - Will-call delivery option
 */

const { v4: uuidv4 } = require('uuid');

module.exports = {
  name: '063-add-quakertown-area-suppliers',

  async up(sequelize) {
    const suppliers = [
      // ============================================
      // 1. INDIAN VALLEY ENERGY - Sellersville, PA (Bucks County)
      // "NO GAMES, NO GIMMICKS, NO CONTRACTS!!", "Strictly C.O.D."
      // ============================================
      {
        id: uuidv4(),
        name: 'Indian Valley Energy',
        slug: 'indian-valley-energy',
        phone: '(610) 392-9590',
        email: 'sales@indianvalleyenergy.com',
        website: 'https://www.indianvalleyenergy.com',
        addressLine1: '1605 Bethlehem Pike',
        city: 'Sellersville',
        state: 'PA',
        postalCodesServed: JSON.stringify([
          // Bucks County
          '18960', // Sellersville
          '18951', // Quakertown
          '18944', // Perkasie
          '18917', // Dublin
          '18914', // Chalfont
          '18932', // Line Lexington
          '18969', // Telford (Bucks side)
          '18972', // Upper Black Eddy
          '18916', // Danboro
          '18925', // Furlong
          '18929', // Ivyland
          '18938', // Mechanicsville
          '18940', // Newtown
          '18942', // Ottsville
          '18947', // Pipersville
          '18954', // Richboro
          '18955', // Richlandtown
          '18962', // Silverdale
          '18963', // Solebury
          '18966', // Southampton
          '18974', // Warminster
          '18976', // Warrington
          '18977', // Washington Crossing
          '19047', // Langhorne
          '19053', // Feasterville
          '18912', // Buckingham
          '18901', // Doylestown
          '18902', // Doylestown
          // Montgomery County
          '19422', // Blue Bell
          '19454', // North Wales
          '19446', // Lansdale
          '19440', // Hatfield
          '19438', // Harleysville
          '18964', // Souderton
          '19473', // Schwenksville
          '19426', // Collegeville
          '19435', // Frederick
          '19525', // Gilbertsville
          '19403', // Norristown
          '19401', // Norristown
          '19462', // Plymouth Meeting
          '19002', // Ambler
          '19436', // Gwynedd
          '19437', // Gwynedd Valley
          '19444', // Lafayette Hill
          // Lehigh County
          '18031', // Breinigsville
          '18036', // Coopersburg
          '18049', // Emmaus
          '18052', // Macungie
          '18062', // Macungie
          '18078', // Schnecksville
          '18104', // Allentown (west)
          '18106', // Allentown (south)
          // Berks County
          '19512', // Boyertown
          '19518', // Douglassville
        ]),
        serviceCities: JSON.stringify([
          'Sellersville', 'Quakertown', 'Perkasie', 'Dublin', 'Chalfont',
          'Telford', 'Doylestown', 'Lansdale', 'North Wales', 'Hatfield',
          'Harleysville', 'Souderton', 'Blue Bell', 'Collegeville', 'Schwenksville',
          'Norristown', 'Ambler', 'Warminster', 'Warrington', 'Southampton',
          'Richboro', 'Newtown', 'Langhorne', 'Coopersburg', 'Emmaus',
          'Macungie', 'Allentown', 'Boyertown', 'Gilbertsville', 'Frederick',
          'Upper Black Eddy', 'Ottsville', 'Pipersville', 'Richlandtown',
          'Silverdale', 'Buckingham', 'Furlong', 'Ivyland', 'Feasterville',
          'Breinigsville', 'Schnecksville', 'Plymouth Meeting', 'Lafayette Hill'
        ]),
        serviceCounties: JSON.stringify(['Bucks', 'Montgomery', 'Lehigh', 'Berks']),
        serviceAreaRadius: 25,
        lat: 40.3869,
        lng: -75.3220,
        hoursWeekday: '8:00 AM - 5:00 PM',
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: false,
        weekendDelivery: false,
        paymentMethods: JSON.stringify(['cash', 'check', 'credit_card', 'debit_card']),
        fuelTypes: JSON.stringify(['heating_oil', 'diesel']),
        minimumGallons: 50,
        seniorDiscount: false,
        allowPriceDisplay: false,
        notes: null,
        active: true,
      },

      // ============================================
      // 2. APGAR OIL - Allentown, PA (Lehigh County)
      // "Will-Call is an optional heating oil delivery method"
      // ============================================
      {
        id: uuidv4(),
        name: 'Apgar Oil',
        slug: 'apgar-oil',
        phone: '(610) 434-5195',
        email: 'apgaroilservice@aol.com',
        website: 'https://www.apgaroil.com',
        addressLine1: '639 E. Congress St',
        city: 'Allentown',
        state: 'PA',
        postalCodesServed: JSON.stringify([
          // Lehigh County
          '18101', // Allentown (downtown)
          '18102', // Allentown
          '18103', // Allentown (south)
          '18104', // Allentown (west)
          '18106', // Allentown (south)
          '18109', // Allentown (east)
          '18031', // Breinigsville
          '18036', // Coopersburg
          '18037', // Coplay
          '18049', // Emmaus
          '18052', // Macungie
          '18062', // Macungie (Lower)
          '18078', // Schnecksville
          '18080', // Slatington
          '18032', // Catasauqua
          '18034', // Center Valley
          '18035', // Cherryville
          '18051', // Fogelsville
          '18069', // Orefield
          // Northampton County
          '18015', // Bethlehem
          '18017', // Bethlehem (north)
          '18018', // Bethlehem (west)
          '18020', // Bethlehem (east)
          '18040', // Easton
          '18042', // Easton
          '18045', // Easton (Palmer/Forks)
          '18064', // Nazareth
          '18067', // Northampton
          '18055', // Hellertown
          '18083', // Stockertown
          '18085', // Tatamy
          '18014', // Bath
          '18072', // Pen Argyl
          '18071', // Palmerton
          '18091', // Wind Gap
          '18013', // Bangor
          // Bucks County
          '18951', // Quakertown
          '18944', // Perkasie
          '18960', // Sellersville
          '18972', // Upper Black Eddy
          // Berks County
          '19512', // Boyertown
          '19530', // Kutztown
          '19539', // Mertztown
          '19529', // Kempton
          // Montgomery County
          '19525', // Gilbertsville
          '18964', // Souderton
          '19438', // Harleysville
          // Carbon County
          '18235', // Lehighton
          '18229', // Jim Thorpe
        ]),
        serviceCities: JSON.stringify([
          'Allentown', 'Bethlehem', 'Easton', 'Nazareth', 'Northampton',
          'Emmaus', 'Macungie', 'Coopersburg', 'Catasauqua', 'Coplay',
          'Slatington', 'Schnecksville', 'Breinigsville', 'Center Valley',
          'Fogelsville', 'Orefield', 'Hellertown', 'Quakertown', 'Perkasie',
          'Sellersville', 'Bath', 'Pen Argyl', 'Wind Gap', 'Bangor',
          'Palmerton', 'Stockertown', 'Tatamy', 'Boyertown', 'Kutztown',
          'Gilbertsville', 'Souderton', 'Harleysville', 'Lehighton',
          'Jim Thorpe', 'Upper Black Eddy', 'Cherryville', 'Mertztown'
        ]),
        serviceCounties: JSON.stringify(['Lehigh', 'Northampton', 'Bucks', 'Berks', 'Montgomery', 'Carbon']),
        serviceAreaRadius: 30,
        lat: 40.6268,
        lng: -75.4494,
        hoursWeekday: '8:00 AM - 4:30 PM',
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: true,
        weekendDelivery: false,
        paymentMethods: JSON.stringify(['cash', 'check', 'credit_card']),
        fuelTypes: JSON.stringify(['heating_oil']),
        minimumGallons: null,
        seniorDiscount: false,
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

    console.log('[Migration 063] Added 2 Quakertown PA area suppliers');
    console.log('[Migration 063] ✅ Quakertown area supplier expansion complete');
  },

  async down(sequelize) {
    await sequelize.query(`
      DELETE FROM suppliers
      WHERE slug IN (
        'indian-valley-energy', 'apgar-oil'
      )
    `);
    console.log('[Migration 063] Rolled back Quakertown area suppliers');
  }
};
