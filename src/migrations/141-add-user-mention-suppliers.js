/**
 * Migration 141: Add 5 suppliers surfaced by the "Missing Suppliers" dashboard.
 *
 * All 5 verified COD/will-call with explicit proof on their own websites.
 * Coverage managed by scrape-config.json (postalCodesServed NOT written here).
 *
 *  1. Castle Fuel (Ossining NY) — "will-call delivery", posts $X.XX/gal on homepage. Scrapable.
 *  2. Costello Fuel (Levittown PA) — "Customer 'will call' to place order". Tiered table on homepage. Scrapable (150-gal row).
 *  3. F.C. Haab (Bala Cynwyd PA) — page title "Automatic & Will-Call Heating Oil". No public pricing.
 *  4. Victory Fuel (Lehighton PA) — "COD- Cash/Check" on order form + 4-tier pricing on homepage. Scrapable.
 *  5. Fortified Fuels (Westport CT) — Droplet POST widget on /get-price/, returns tier pricing per ZIP. Scrapable.
 *
 * Also seeds supplier_aliases for L & Son Heat/AC Tech (Yonkers NY) so
 * user-entered "L and Sons" / "L And Sons" dedup against the existing record.
 */

const { v4: uuidv4 } = require('uuid');

const SUPPLIERS = [
  {
    name: 'Castle Fuel',
    slug: 'castle-fuel-ny',
    phone: '(914) 531-7100',
    email: 'Castlefuel1@gmail.com',
    website: 'https://castlefuel.com',
    addressLine1: '81 Charter Circle',
    city: 'Ossining',
    state: 'NY',
    serviceCities: [
      'Ossining', 'Briarcliff Manor', 'Croton-on-Hudson', 'Peekskill',
      'Yorktown Heights', 'Cortlandt Manor', 'Mohegan Lake', 'Buchanan',
      'Montrose', 'Verplanck', 'Mount Kisco', 'Chappaqua', 'Pleasantville',
      'Millwood', 'Somers', 'Katonah', 'Bedford', 'Mahopac', 'Carmel',
      'Brewster', 'Putnam Valley', 'Cold Spring', 'Garrison'
    ],
    serviceCounties: ['Westchester', 'Putnam'],
    serviceAreaRadius: 20,
    lat: 41.1669,
    lng: -73.8487,
    hoursWeekday: '8:00 AM - 4:30 PM',
    hoursSaturday: '8:00 AM - 12:00 PM',
    hoursSunday: null,
    emergencyDelivery: true,
    weekendDelivery: false,
    paymentMethods: ['cash', 'credit_card', 'check'],
    fuelTypes: ['heating_oil', 'diesel'],
    minimumGallons: 150,
    seniorDiscount: false,
    allowPriceDisplay: true,
  },
  {
    name: 'Costello Fuel',
    slug: 'costello-fuel-pa',
    phone: '(215) 946-1900',
    email: null,
    website: 'https://costellofuel.com',
    addressLine1: '8739 New Falls Road',
    city: 'Levittown',
    state: 'PA',
    serviceCities: [
      'Levittown', 'Bristol', 'Edgely', 'Croydon', 'Yardley', 'Morrisville',
      'Oakford', 'Trevose', 'Feasterville', 'Holland', 'Richboro', 'Newtown',
      'Washington Crossing', 'Penndel', 'Hulmeville', 'Langhorne',
      'Newportville', 'Bensalem'
    ],
    serviceCounties: ['Bucks'],
    serviceAreaRadius: 15,
    lat: 40.1490,
    lng: -74.8418,
    hoursWeekday: '8:00 AM - 5:00 PM',
    hoursSaturday: '8:30 AM - 3:30 PM',
    hoursSunday: '8:30 AM - 3:30 PM',
    emergencyDelivery: false,
    weekendDelivery: true,
    paymentMethods: ['cash', 'credit_card', 'check'],
    fuelTypes: ['heating_oil', 'diesel'],
    minimumGallons: 25,
    seniorDiscount: false,
    allowPriceDisplay: true,
  },
  {
    name: 'F.C. Haab',
    slug: 'fc-haab',
    phone: '(215) 563-0800',
    email: 'fchaabco@fchaab.com',
    website: 'https://www.fchaab.com',
    addressLine1: '225 City Ave, Suite 105',
    city: 'Bala Cynwyd',
    state: 'PA',
    serviceCities: [
      'Philadelphia', 'Bala Cynwyd', 'Upper Darby', 'Malvern', 'Twin Oaks',
      'Drexel Hill', 'Havertown', 'Media', 'Broomall', 'Springfield',
      'Ardmore', 'Wynnewood', 'Narberth'
    ],
    serviceCounties: ['Philadelphia', 'Delaware', 'Montgomery', 'Chester'],
    serviceAreaRadius: 25,
    lat: 40.0000,
    lng: -75.2303,
    hoursWeekday: '7:00 AM - 4:00 PM',
    hoursSaturday: '7:00 AM - 3:00 PM',
    hoursSunday: null,
    emergencyDelivery: true,
    weekendDelivery: true,
    paymentMethods: ['cash', 'credit_card', 'debit_card', 'check'],
    fuelTypes: ['heating_oil'],
    minimumGallons: 100,
    seniorDiscount: false,
    allowPriceDisplay: false,
  },
  {
    name: 'Victory Fuel Company',
    slug: 'victory-fuel-pa',
    phone: '(570) 258-8008',
    email: 'info@myvictoryfuel.com',
    website: 'https://www.myvictoryfuel.com',
    addressLine1: 'P.O. Box 13',
    city: 'Lehighton',
    state: 'PA',
    serviceCities: [
      'Lehighton', 'Allentown', 'Birdsboro', 'Bowmanstown', 'Brockton',
      'Catasauqua', 'Coaldale', 'Conyngham', 'Coplay', 'Cumbola',
      'Douglassville', 'Drums', 'Emmaus', 'Freeland', 'Hamburg', 'Hazleton',
      'Hometown', 'Jim Thorpe', 'Kunkletown', 'Lansford', 'Mary D', 'McAdoo',
      'Mohnton', 'Nesquehoning', 'New Ringgold', 'Northampton', 'Palmerton',
      'Pottsville', 'Quakake', 'Reading', 'Sugarloaf', 'Summit Hill',
      'Tamaqua', 'Tresckow', 'Tuscarora', 'Weissport', 'West Hazleton',
      'Andreas', 'Barnesville', 'Beaver Meadows', 'Fullerton', 'Leesport',
      'Macungie', 'Middleport', 'New Philadelphia', 'Parryville'
    ],
    serviceCounties: ['Carbon', 'Schuylkill', 'Lehigh', 'Berks', 'Luzerne', 'Northampton'],
    serviceAreaRadius: 35,
    lat: 40.8345,
    lng: -75.7124,
    hoursWeekday: '8:00 AM - 5:00 PM',
    hoursSaturday: '6:00 AM - 5:00 PM',
    hoursSunday: null,
    emergencyDelivery: true,
    weekendDelivery: true,
    paymentMethods: ['cash', 'credit_card', 'debit_card', 'check'],
    fuelTypes: ['heating_oil', 'diesel'],
    minimumGallons: 50,
    seniorDiscount: false,
    allowPriceDisplay: true,
  },
  {
    name: 'Fortified Fuels',
    slug: 'fortified-fuels',
    phone: '(203) 200-0082',
    email: 'info@fortifiedmechanical.com',
    website: 'https://fortifiedfuels.com',
    addressLine1: '55 Post Rd W, 2nd Floor',
    city: 'Westport',
    state: 'CT',
    serviceCities: [
      'Ansonia', 'Beacon Falls', 'Bethany', 'Bethel', 'Branford', 'Bridgeport',
      'Brookfield', 'Cheshire', 'Danbury', 'Darien', 'Derby', 'East Haven',
      'Easton', 'Fairfield', 'Greenwich', 'Guilford', 'Hamden', 'Madison',
      'Meriden', 'Middlebury', 'Milford', 'Monroe', 'Naugatuck',
      'New Fairfield', 'New Haven', 'Newtown', 'North Haven', 'Norwalk',
      'Orange', 'Oxford', 'Prospect', 'Redding', 'Ridgefield', 'Seymour',
      'Shelton', 'Sherman', 'Southbury', 'Stamford', 'Trumbull', 'Wallingford',
      'Waterbury', 'West Haven', 'Weston', 'Westport', 'Wilton', 'Woodbridge'
    ],
    serviceCounties: ['New Haven', 'Fairfield'],
    serviceAreaRadius: 30,
    lat: 41.1414,
    lng: -73.3578,
    hoursWeekday: null,
    hoursSaturday: null,
    hoursSunday: null,
    emergencyDelivery: false,
    weekendDelivery: false,
    paymentMethods: ['credit_card'],
    fuelTypes: ['heating_oil', 'propane'],
    minimumGallons: 100,
    seniorDiscount: false,
    allowPriceDisplay: true,
  },
];

// Dedup aliases — surface when users type these variants of existing DB suppliers.
const ALIASES = [
  { slug: 'l-and-son-heat-ac-tech', aliasName: 'L and Sons', scopeState: 'NY', scopeZipPrefix: null },
  { slug: 'l-and-son-heat-ac-tech', aliasName: 'L And Sons', scopeState: 'NY', scopeZipPrefix: null },
];

module.exports = {
  name: '141-add-user-mention-suppliers',

  async up(sequelize) {
    for (const s of SUPPLIERS) {
      const supplier = {
        id: uuidv4(),
        name: s.name,
        slug: s.slug,
        phone: s.phone,
        email: s.email,
        website: s.website,
        addressLine1: s.addressLine1,
        city: s.city,
        state: s.state,
        postalCodesServed: JSON.stringify([]),
        serviceCities: JSON.stringify(s.serviceCities),
        serviceCounties: JSON.stringify(s.serviceCounties),
        serviceAreaRadius: s.serviceAreaRadius,
        lat: s.lat,
        lng: s.lng,
        hoursWeekday: s.hoursWeekday,
        hoursSaturday: s.hoursSaturday,
        hoursSunday: s.hoursSunday,
        emergencyDelivery: s.emergencyDelivery === true,
        weekendDelivery: s.weekendDelivery === true,
        paymentMethods: JSON.stringify(s.paymentMethods),
        fuelTypes: JSON.stringify(s.fuelTypes),
        minimumGallons: s.minimumGallons || null,
        seniorDiscount: s.seniorDiscount === true,
        allowPriceDisplay: s.allowPriceDisplay === true,
        notes: null,
        active: true,
      };

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
      `, { replacements: supplier });

      console.log(`[Migration 141] ✅ Added ${s.name} (${s.city}, ${s.state})`);
    }

    // Seed aliases (skip gracefully if supplier_aliases table doesn't exist yet).
    try {
      for (const a of ALIASES) {
        await sequelize.query(`
          INSERT INTO supplier_aliases (supplier_id, alias_name, scope_state, scope_zip_prefix)
          SELECT id, :aliasName, :scopeState, :scopeZipPrefix
          FROM suppliers WHERE slug = :slug
          ON CONFLICT DO NOTHING
        `, { replacements: a });
      }
      console.log(`[Migration 141] ✅ Seeded ${ALIASES.length} L & Son aliases`);
    } catch (err) {
      console.warn('[Migration 141] Skipped aliases (table may not exist):', err.message);
    }
  },

  async down(sequelize) {
    const slugs = SUPPLIERS.map(s => `'${s.slug}'`).join(', ');
    await sequelize.query(`DELETE FROM suppliers WHERE slug IN (${slugs})`);
    console.log('[Migration 141] Rolled back 5 user-mention suppliers');
  }
};
