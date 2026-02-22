/**
 * Migration 068: Enable 7 previously-disabled suppliers for price scraping
 *
 * Verified 2026-02-22: All now have scrapable static prices.
 *
 * New DB records (5):
 *   - John's Oil Service (Lynn, MA) — was "JS-loaded", now static $3.79/gal
 *   - Residential Fuel Systems (Stratford, CT) — was "JS-loaded", now static $3.43/gal
 *   - Nashua Fuel (Nashua, NH) — was "Droplet widget", now in WordPress pricing table $3.399
 *   - Southern New Hampshire Energy (Londonderry, NH) — was 403, now accessible $3.43
 *   - Euro Fuel Co (Hopewell Junction, NY) — was "no prices", now shows $4.00
 *
 * Existing DB records updated (2):
 *   - Town & Country Fuel (Levittown, PA) — migration 015, adding slug + coverage columns
 *   - Freedom Fuel (Raynham, MA) — migration 032, already has full record (no changes needed)
 */

const { v4: uuidv4 } = require('uuid');

module.exports = {
  name: '068-enable-seven-suppliers',

  async up(sequelize) {
    // --- 1. Update Town & Country Fuel (existing record from migration 015) ---
    // Add slug and coverage columns that the old migration didn't set
    await sequelize.query(`
      UPDATE suppliers SET
        slug = 'town-and-country-fuel-pa',
        postal_codes_served = :postalCodesServed,
        service_cities = :serviceCities,
        service_counties = :serviceCounties,
        service_area_radius = 15,
        payment_methods = :paymentMethods,
        fuel_types = :fuelTypes,
        minimum_gallons = 100,
        allow_price_display = true,
        scrape_status = 'active',
        consecutive_scrape_failures = 0,
        last_scrape_failure_at = NULL,
        scrape_failure_dates = NULL,
        updated_at = NOW()
      WHERE website LIKE '%tcfueloil.com%'
    `, {
      replacements: {
        postalCodesServed: JSON.stringify([
          '18940', '18966', '19007', '19020', '19021', '19030',
          '19040', '19047', '19053', '19054', '19055', '19056', '19057', '19067'
        ]),
        serviceCities: JSON.stringify([
          'Levittown', 'Bensalem', 'Bristol', 'Newtown', 'Fairless Hills',
          'Langhorne', 'Feasterville', 'Croydon', 'Yardley', 'Southampton', 'Hatboro'
        ]),
        serviceCounties: JSON.stringify(['Bucks']),
        paymentMethods: JSON.stringify(['cash', 'check', 'credit_card']),
        fuelTypes: JSON.stringify(['heating_oil'])
      }
    });
    console.log('[Migration 068] Updated Town & Country Fuel (Levittown, PA) with coverage data');

    // --- 2-6. Insert 5 new suppliers ---
    const suppliers = [
      {
        id: uuidv4(),
        name: "John's Oil Service",
        slug: 'johns-oil-service',
        phone: '(781) 592-9505',
        email: 'info@johnsoil.com',
        website: 'https://www.johnsoil.com',
        addressLine1: '15 Avon Street',
        city: 'Lynn',
        state: 'MA',
        postalCodesServed: JSON.stringify([
          '01864', '01867', '01880', '01901', '01902', '01903', '01904', '01905',
          '01906', '01907', '01908', '01915', '01921', '01923', '01936', '01938',
          '01940', '01945', '01949', '01960', '01969', '01970', '01983', '01984',
          '02128', '02148', '02151', '02152', '02176', '02180'
        ]),
        serviceCities: JSON.stringify([
          'Beverly', 'Boxford', 'Danvers', 'East Boston', 'Hamilton', 'Ipswich',
          'Lynn', 'Lynnfield', 'Malden', 'Marblehead', 'Melrose', 'Middleton',
          'Nahant', 'North Reading', 'Peabody', 'Reading', 'Revere', 'Rowley',
          'Salem', 'Saugus', 'Stoneham', 'Swampscott', 'Topsfield', 'Wakefield',
          'Wenham', 'Winthrop'
        ]),
        serviceCounties: JSON.stringify(['Essex', 'Suffolk', 'Middlesex']),
        serviceAreaRadius: 20,
        lat: 42.4668,
        lng: -70.9495,
        hoursWeekday: '7:30am-5:00pm',
        hoursSaturday: '8:00am-12:00pm',
        hoursSunday: null,
        emergencyDelivery: false,
        weekendDelivery: true,
        paymentMethods: JSON.stringify(['cash', 'credit_card', 'debit_card']),
        fuelTypes: JSON.stringify(['heating_oil', 'diesel']),
        minimumGallons: 100,
        seniorDiscount: false,
        allowPriceDisplay: true,
        notes: null,
        active: true,
      },
      {
        id: uuidv4(),
        name: 'Residential Fuel Systems',
        slug: 'residential-fuel-systems',
        phone: '(203) 331-0173',
        email: 'info@residentialfuelsystems.com',
        website: 'https://www.residentialfuelsystems.com',
        addressLine1: '770 Woodend Road',
        city: 'Stratford',
        state: 'CT',
        postalCodesServed: JSON.stringify([
          '06401', '06418', '06460', '06477', '06484', '06516',
          '06604', '06605', '06606', '06607', '06608', '06610',
          '06611', '06612', '06614', '06615', '06820', '06824', '06825',
          '06850', '06851', '06853', '06854', '06855', '06880',
          '06901', '06902', '06905', '06906', '06907'
        ]),
        serviceCities: JSON.stringify([
          'Ansonia', 'Bridgeport', 'Darien', 'Derby', 'Easton', 'Fairfield',
          'Milford', 'Monroe', 'Norwalk', 'Orange', 'Shelton', 'Stamford',
          'Stratford', 'Trumbull', 'West Haven', 'Westport'
        ]),
        serviceCounties: JSON.stringify(['Fairfield', 'New Haven']),
        serviceAreaRadius: 25,
        lat: 41.1884,
        lng: -73.1332,
        hoursWeekday: '8:00am-5:00pm',
        hoursSaturday: '8:00am-2:00pm',
        hoursSunday: null,
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
        name: 'Nashua Fuel',
        slug: 'nashua-fuel',
        phone: '(603) 888-5070',
        email: null,
        website: 'https://www.nashuafuel.com',
        addressLine1: null,
        city: 'Nashua',
        state: 'NH',
        postalCodesServed: JSON.stringify([
          '01463', '01826', '01827', '01879',
          '03031', '03032', '03033', '03034', '03036', '03038', '03045', '03049',
          '03051', '03052', '03053', '03054', '03055', '03060', '03062', '03063',
          '03070', '03076', '03077', '03079', '03087',
          '03101', '03102', '03103', '03104', '03106', '03281',
          '03811', '03841', '03873'
        ]),
        serviceCities: JSON.stringify([
          'Amherst', 'Atkinson', 'Auburn', 'Bedford', 'Brookline', 'Candia',
          'Chester', 'Derry', 'Dracut', 'Dunstable', 'Goffstown', 'Hampstead',
          'Hollis', 'Hooksett', 'Hudson', 'Litchfield', 'Londonderry', 'Manchester',
          'Merrimack', 'Milford', 'Nashua', 'New Boston', 'Pelham', 'Pepperell',
          'Raymond', 'Salem', 'Sandown', 'Tyngsboro', 'Weare', 'Windham'
        ]),
        serviceCounties: JSON.stringify(['Hillsborough', 'Rockingham', 'Merrimack', 'Middlesex', 'Essex']),
        serviceAreaRadius: 30,
        lat: 42.7654,
        lng: -71.4676,
        hoursWeekday: '8:00am-5:00pm',
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: false,
        weekendDelivery: false,
        paymentMethods: JSON.stringify(['cash', 'credit_card']),
        fuelTypes: JSON.stringify(['heating_oil', 'diesel']),
        minimumGallons: 150,
        seniorDiscount: false,
        allowPriceDisplay: true,
        notes: null,
        active: true,
      },
      {
        id: uuidv4(),
        name: 'Southern New Hampshire Energy',
        slug: 'southern-new-hampshire-energy',
        phone: '(603) 479-9282',
        email: 'info@snhenergy.com',
        website: 'https://www.snhenergy.com',
        addressLine1: '39 Rockingham Road',
        city: 'Londonderry',
        state: 'NH',
        postalCodesServed: JSON.stringify([
          '03032', '03036', '03038', '03044', '03051', '03052', '03053', '03054',
          '03076', '03079', '03087', '03101', '03102', '03103', '03104', '03110',
          '03811', '03819', '03841', '03848', '03873'
        ]),
        serviceCities: JSON.stringify([
          'Atkinson', 'Auburn', 'Bedford', 'Chester', 'Danville', 'Derry',
          'Fremont', 'Hampstead', 'Hudson', 'Kingston', 'Litchfield', 'Londonderry',
          'Manchester', 'Merrimack', 'Pelham', 'Salem', 'Sandown', 'Windham'
        ]),
        serviceCounties: JSON.stringify(['Rockingham', 'Hillsborough']),
        serviceAreaRadius: 20,
        lat: 42.8651,
        lng: -71.3739,
        hoursWeekday: '9:00am-4:30pm',
        hoursSaturday: null,
        hoursSunday: null,
        emergencyDelivery: true,
        weekendDelivery: false,
        paymentMethods: JSON.stringify(['cash', 'credit_card']),
        fuelTypes: JSON.stringify(['heating_oil', 'diesel']),
        minimumGallons: 150,
        seniorDiscount: false,
        allowPriceDisplay: true,
        notes: null,
        active: true,
      },
      {
        id: uuidv4(),
        name: 'Euro Fuel Co',
        slug: 'euro-fuel-co',
        phone: '(845) 363-1007',
        email: 'eurofuel@live.com',
        website: 'https://www.eurofuelco.com',
        addressLine1: '9 Ryan Drive',
        city: 'Hopewell Junction',
        state: 'NY',
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
        serviceCounties: JSON.stringify(['Putnam', 'Dutchess', 'Westchester']),
        serviceAreaRadius: 25,
        lat: 41.5784,
        lng: -73.8265,
        hoursWeekday: '8:00am-4:30pm',
        hoursSaturday: '8:00am-2:00pm',
        hoursSunday: null,
        emergencyDelivery: true,
        weekendDelivery: true,
        paymentMethods: JSON.stringify(['cash', 'check', 'credit_card']),
        fuelTypes: JSON.stringify(['heating_oil']),
        minimumGallons: 150,
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
          website = EXCLUDED.website,
          address_line1 = EXCLUDED.address_line1,
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

      console.log(`[Migration 068] ${supplier.name} (${supplier.city}, ${supplier.state}) enabled`);
    }
  },

  async down(sequelize) {
    // Disable price display for all 7 suppliers
    await sequelize.query(`
      UPDATE suppliers SET allow_price_display = false, updated_at = NOW()
      WHERE slug IN (
        'town-and-country-fuel-pa',
        'johns-oil-service',
        'residential-fuel-systems',
        'nashua-fuel',
        'southern-new-hampshire-energy',
        'euro-fuel-co'
      ) OR website LIKE '%tcfueloil.com%'
    `);
    console.log('[Migration 068] All 7 suppliers price display disabled');
  }
};
