/**
 * Migration 177: Add 11 COD/will-call suppliers (1 scrapable + 10 will-call listings)
 *
 * From the 2026-06-12 coverage-gap research batch. Identity only (post-100 rule;
 * coverage lives in scrape-config.json postalCodesServed, written by ScrapeConfigSync).
 *
 *   shaw-propane   (Fort Edward NY) - COD, scrapable oil $4.79; fills Adirondack gap.
 *   10 will-call listings (allow_price_display=false) - real COD/will-call dealers,
 *   no scrapable price, added for directory coverage in gap areas.
 */
const { v4: uuidv4 } = require('uuid');

const suppliers = [
  {
    "name": "Shaw Propane",
    "slug": "shaw-propane",
    "phone": "(518) 793-7755",
    "website": "https://shawpropane.com",
    "addressLine1": "1470 Route 9",
    "city": "Fort Edward",
    "state": "NY",
    "fuelTypes": [
      "heating_oil",
      "kerosene"
    ],
    "allowPriceDisplay": true
  },
  {
    "name": "Trono Fuels",
    "slug": "trono-fuels",
    "phone": "(802) 864-7828",
    "website": "https://www.tronofuels.com",
    "addressLine1": "10 Lime Rock Road",
    "city": "South Burlington",
    "state": "VT",
    "fuelTypes": [
      "heating_oil",
      "kerosene",
      "diesel"
    ],
    "allowPriceDisplay": false
  },
  {
    "name": "GF Heating Oil & Propane",
    "slug": "gf-heating-oil",
    "phone": "(518) 792-2220",
    "website": "https://gfheatingoil.com",
    "addressLine1": "475 Corinth Road",
    "city": "Queensbury",
    "state": "NY",
    "fuelTypes": [
      "heating_oil",
      "propane"
    ],
    "allowPriceDisplay": false
  },
  {
    "name": "Family Danz Fuel Services",
    "slug": "family-danz",
    "phone": "(518) 427-8685",
    "website": "https://familydanz.com",
    "addressLine1": "404 N. Pearl St",
    "city": "Albany",
    "state": "NY",
    "fuelTypes": [
      "heating_oil",
      "kerosene",
      "diesel"
    ],
    "allowPriceDisplay": false
  },
  {
    "name": "Fred F. Collis & Sons",
    "slug": "collis-sons",
    "phone": "(315) 768-2323",
    "website": "https://fredfcollis.com",
    "addressLine1": "5092 Commercial Dr",
    "city": "Yorkville",
    "state": "NY",
    "fuelTypes": [
      "heating_oil"
    ],
    "allowPriceDisplay": false
  },
  {
    "name": "Broedel Fuel Group",
    "slug": "broedel-fuel",
    "phone": "(315) 691-2323",
    "website": "https://broedelfuelgroup.com",
    "addressLine1": "2305 State Rte 12",
    "city": "Hubbardsville",
    "state": "NY",
    "fuelTypes": [
      "heating_oil",
      "kerosene",
      "propane"
    ],
    "allowPriceDisplay": false
  },
  {
    "name": "Boyer Oil Service",
    "slug": "boyer-oil",
    "phone": "(570) 784-1672",
    "website": "https://www.boyeroilservice.com",
    "addressLine1": null,
    "city": "Bloomsburg",
    "state": "PA",
    "fuelTypes": [
      "heating_oil",
      "kerosene"
    ],
    "allowPriceDisplay": false
  },
  {
    "name": "Falcon Oil Co Inc",
    "slug": "falcon-oil-pa",
    "phone": "(570) 203-2704",
    "website": "https://www.falconoilpa.com",
    "addressLine1": "1630 Main St",
    "city": "Blakely",
    "state": "PA",
    "fuelTypes": [
      "heating_oil",
      "diesel"
    ],
    "allowPriceDisplay": false
  },
  {
    "name": "C.R. Augenstein Inc.",
    "slug": "cr-augenstein",
    "phone": "(724) 206-0679",
    "website": "https://craugenstein.com",
    "addressLine1": "2344 Route 136",
    "city": "Eighty Four",
    "state": "PA",
    "fuelTypes": [
      "heating_oil",
      "propane"
    ],
    "allowPriceDisplay": false
  },
  {
    "name": "Smith Propane & Oil",
    "slug": "smith-propane-oil",
    "phone": "(800) 814-2822",
    "website": "https://smithpropaneandoil.com",
    "addressLine1": null,
    "city": "Greensburg",
    "state": "PA",
    "fuelTypes": [
      "heating_oil",
      "propane"
    ],
    "allowPriceDisplay": false
  },
  {
    "name": "Glassmere Fuel Service",
    "slug": "glassmere-fuel",
    "phone": "(800) 235-9054",
    "website": "https://glassmerefuel.com",
    "addressLine1": null,
    "city": "Creighton",
    "state": "PA",
    "fuelTypes": [
      "heating_oil",
      "propane"
    ],
    "allowPriceDisplay": false
  }
];

module.exports = {
  name: '177-add-cod-suppliers-batch-2026-06',

  async up(sequelize) {
    for (const s of suppliers) {
      await sequelize.query(`
        INSERT INTO suppliers (
          id, name, slug, phone, website, address_line1, city, state,
          fuel_types, delivery_model, allow_price_display, active, source,
          created_at, updated_at
        ) VALUES (
          :id, :name, :slug, :phone, :website, :addressLine1, :city, :state,
          :fuelTypes, 'cod', :allowPriceDisplay, true, 'web_research',
          NOW(), NOW()
        )
        ON CONFLICT (slug) DO UPDATE SET
          name = EXCLUDED.name,
          phone = EXCLUDED.phone,
          website = EXCLUDED.website,
          address_line1 = EXCLUDED.address_line1,
          city = EXCLUDED.city,
          state = EXCLUDED.state,
          fuel_types = EXCLUDED.fuel_types,
          delivery_model = EXCLUDED.delivery_model,
          allow_price_display = EXCLUDED.allow_price_display,
          active = true,
          updated_at = NOW()
      `, {
        replacements: { ...s, id: uuidv4(), fuelTypes: JSON.stringify(s.fuelTypes) },
        type: sequelize.QueryTypes.INSERT
      });
      console.log(`[Migration 177] ${s.name} (${s.city}, ${s.state}) ${s.allowPriceDisplay ? 'PRICED' : 'listing'}`);
    }
  },

  async down(sequelize) {
    await sequelize.query(`
      UPDATE suppliers SET active = false, allow_price_display = false, updated_at = NOW()
      WHERE slug IN ('shaw-propane', 'trono-fuels', 'gf-heating-oil', 'family-danz', 'collis-sons', 'broedel-fuel', 'boyer-oil', 'falcon-oil-pa', 'cr-augenstein', 'smith-propane-oil', 'glassmere-fuel')
    `);
  }
};
