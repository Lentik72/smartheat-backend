#!/usr/bin/env node
/**
 * Seed Suppliers Database
 * V1.4.0: Populates the suppliers table with initial data
 *         Updated: County-based matching, removed aggregators/co-ops
 *
 * Usage:
 *   node scripts/seed-suppliers.js
 *
 * Requires DATABASE_URL environment variable
 */

const { Sequelize } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// Supplier data to seed
// Format matches iOS DirectorySupplier model
const SUPPLIERS = [
  // ============================================
  // WESTCHESTER COUNTY, NY (existing coverage)
  // ============================================
  {
    name: "On Site Oil Corp",
    phone: "(914) 739-4200",
    email: "onsiteoil@gmail.com",
    website: "https://onsiteoil.org",
    addressLine1: "2064 Albany Post Road",
    city: "Montrose",
    state: "NY",
    postalCodesServed: ["10520", "10566", "10547", "10548", "10567", "10509", "10562", "10549", "10511"],
    serviceCounties: ["Westchester"],
    serviceAreaRadius: 20,
    notes: "Family owned since 1978",
    verified: true,
    source: "manual"
  },
  {
    name: "Barrco Fuel",
    phone: "(914) 232-5500",
    email: null,
    website: null,
    addressLine1: null,
    city: "Katonah",
    state: "NY",
    postalCodesServed: ["10536", "10549", "10562", "10507", "10509", "10512", "10541"],
    serviceCounties: ["Westchester"],
    serviceAreaRadius: 15,
    notes: null,
    verified: true,
    source: "manual"
  },
  {
    name: "Palisades Fuel",
    phone: "(845) 359-1700",
    email: null,
    website: "https://palisadesfuel.com",
    addressLine1: "97 Route 303",
    city: "Tappan",
    state: "NY",
    postalCodesServed: ["10960", "10913", "10954", "10952", "10956", "10964", "10965", "10901", "10962"],
    serviceCounties: ["Rockland"],
    serviceAreaRadius: 20,
    notes: null,
    verified: true,
    source: "manual"
  },
  {
    name: "Economy Fuel NY",
    phone: "(845) 634-3456",
    email: null,
    website: "https://www.economyfuelny.com",
    addressLine1: null,
    city: "New City",
    state: "NY",
    postalCodesServed: ["10956", "10954", "10952", "10901", "10960", "10913", "10964", "10965", "10962"],
    serviceCounties: ["Rockland"],
    serviceAreaRadius: 20,
    notes: null,
    verified: true,
    source: "manual"
  },
  {
    name: "JFJ Fuel Oil",
    phone: "(914) 636-3002",
    email: "service@jfjfuel.com",
    website: "https://www.jfjfuel.com",
    addressLine1: "62 Elm Street",
    city: "Yonkers",
    state: "NY",
    postalCodesServed: ["10701", "10702", "10703", "10704", "10705", "10706", "10707", "10708", "10709", "10710"],
    serviceCounties: ["Westchester"],
    serviceAreaRadius: 15,
    notes: null,
    verified: true,
    source: "manual"
  },
  {
    name: "Town & Country Oil",
    phone: "(914) 962-0700",
    email: "info@townandcountryoil.com",
    website: "https://townandcountryoil.com",
    addressLine1: "915 South Street",
    city: "Peekskill",
    state: "NY",
    postalCodesServed: ["10566", "10567", "10520", "10547", "10548", "10509", "10562"],
    serviceCounties: ["Westchester"],
    serviceAreaRadius: 15,
    notes: null,
    verified: true,
    source: "manual"
  },
  {
    name: "Putnam Oil",
    phone: "(845) 225-3900",
    email: null,
    website: "https://putnamoil.com",
    addressLine1: null,
    city: "Carmel",
    state: "NY",
    postalCodesServed: ["10512", "10541", "10509", "10516", "10524", "10579", "10537"],
    serviceCounties: ["Putnam", "Dutchess", "Westchester"],  // Updated: serves lower Dutchess & upper Westchester
    serviceAreaRadius: 20,
    notes: "Serves Putnam, lower Dutchess, and upper Westchester counties",
    verified: true,
    source: "manual"
  },
  {
    name: "Hunter's Heating Oil",
    phone: "(914) 949-2645",
    email: null,
    website: "https://www.huntersoil.com",
    addressLine1: null,
    city: "White Plains",
    state: "NY",
    postalCodesServed: ["10601", "10602", "10603", "10604", "10605", "10606", "10607", "10570", "10514", "10591", "10583"],
    serviceCounties: ["Westchester"],
    serviceAreaRadius: 15,
    notes: null,
    verified: true,
    source: "manual"
  },

  // ============================================
  // FRANKLIN COUNTY, MA (new coverage for Colrain user)
  // ============================================
  {
    name: "Sandri Energy",
    phone: "(413) 772-2121",
    email: null,
    website: "https://sandri.com",
    addressLine1: "400 Chapman Street",
    city: "Greenfield",
    state: "MA",
    postalCodesServed: [
      "01301", "01340", "01344", "01346", "01360", "01367", "01370",
      "01373", "01376", "01378", "01379", "01337", "01339", "01341",
      "01342", "01343", "01347", "01349", "01351", "01354", "01355",
      "01364", "01366", "01368", "01375", "01380"
    ],
    serviceCounties: ["Franklin", "Hampshire"],
    serviceAreaRadius: 30,
    notes: "Oil, propane, and kerosene delivery",
    verified: true,
    source: "manual"
  },
  {
    name: "Surner Heating",
    phone: "(413) 773-5999",
    email: null,
    website: "https://surnerheat.com",
    addressLine1: "34 Montague City Road",
    city: "Greenfield",
    state: "MA",
    postalCodesServed: [
      "01301", "01302", "01340", "01344", "01346", "01360", "01367",
      "01370", "01373", "01376", "01002", "01003", "01007", "01035"
    ],
    serviceCounties: ["Franklin", "Hampshire"],
    serviceAreaRadius: 25,
    notes: "Also has discount oil branch",
    verified: true,
    source: "manual"
  },
  {
    name: "Preite Oil Company",
    phone: "(413) 664-6906",
    email: null,
    website: "https://www.preiteoil.com",
    addressLine1: "758 State Road",
    city: "North Adams",
    state: "MA",
    postalCodesServed: [
      "01247", "01220", "01226", "01237", "01240", "01252", "01254",
      "01256", "01257", "01259", "01262", "01263", "01264", "01266",
      "01267", "01270", "01340"
    ],
    serviceCounties: ["Berkshire", "Franklin"],
    serviceAreaRadius: 35,
    notes: "Family-owned for 35+ years",
    verified: true,
    source: "manual"
  },

  // ============================================
  // NEW COD SUPPLIERS (V1.4.0)
  // ============================================
  {
    name: "Yorktown Fuel",
    phone: "(914) 962-0005",
    email: "office@yorktownfuel.com",
    website: "https://www.yorktownfuel.com",
    addressLine1: "1137 E Main St, Suite F",
    city: "Shrub Oak",
    state: "NY",
    postalCodesServed: ["10588", "10598", "10547", "10567", "10535"],
    serviceCounties: ["Westchester", "Putnam"],
    serviceAreaRadius: 20,
    notes: "Family owned, 24/7 service, COD",
    verified: true,
    source: "manual"
  },
  {
    name: "County Energy Products",
    phone: "(978) 256-5011",
    email: null,
    website: "https://countyenergyproducts.com",
    addressLine1: null,
    city: "Chelmsford",
    state: "MA",
    postalCodesServed: ["01824", "01826", "01850", "01851", "01852", "01876", "01821"],
    serviceCounties: ["Middlesex"],
    serviceAreaRadius: 25,
    notes: "Serves Chelmsford and surrounding areas",
    verified: true,
    source: "manual"
  },
  {
    name: "Emergency Services Fuel Corp",
    phone: "(914) 762-5208",
    email: "emergencyfuel@optonline.net",
    website: null,
    addressLine1: "380 Scarborough Rd",
    city: "Briarcliff Manor",
    state: "NY",
    postalCodesServed: [],  // Uses county-based matching
    serviceCounties: ["Westchester", "Putnam", "Rockland", "Orange"],
    serviceAreaRadius: 30,
    notes: "COD delivery, A+ BBB rating, serves 60+ towns",
    verified: true,
    source: "manual"
  },
  {
    name: "Economy Fuel (Peekskill)",
    phone: "(914) 739-5590",
    email: null,
    website: "https://www.economyfuelny.com",
    addressLine1: "500 Highland Ave",
    city: "Peekskill",
    state: "NY",
    postalCodesServed: ["10566", "10567", "10520", "10547", "10548"],
    serviceCounties: ["Westchester", "Putnam", "Dutchess"],
    serviceAreaRadius: 30,
    notes: "All deliveries C.O.D., family owned, serves northern Westchester and Dutchess",
    verified: true,
    source: "manual"
  },

  // ============================================
  // NEW JERSEY - MORRIS COUNTY (Mount Olive area)
  // ============================================
  {
    name: "AJ's Fuel",
    phone: "(862) 803-9300",
    email: "ajsfuel@yahoo.com",
    website: "https://www.ajsfuelinc.com",
    addressLine1: null,
    city: "Budd Lake",
    state: "NJ",
    postalCodesServed: ["07828", "07834", "07836", "07840", "07850", "07852", "07857", "07869", "07876", "07878"],
    serviceCounties: ["Morris", "Sussex"],
    serviceAreaRadius: 25,
    notes: "Family owned 50+ years, COD delivery, 24/7 live support",
    verified: true,
    source: "manual"
  },
  {
    name: "Reis Fuel",
    phone: "(973) 209-2667",
    email: null,
    website: "https://reisfuel.com",
    addressLine1: null,
    city: "Northern NJ",
    state: "NJ",
    postalCodesServed: [],
    serviceCounties: ["Morris", "Sussex", "Passaic", "Bergen"],
    serviceAreaRadius: 30,
    notes: "No contracts, COD, 20+ years experience, 4500+ customers",
    verified: true,
    source: "manual"
  },

  // ============================================
  // NEW JERSEY - MERCER COUNTY (Princeton area)
  // ============================================
  {
    name: "Princeton Fuel Online",
    phone: "(800) 253-9001",
    email: "info@princetonfuel.com",
    website: "https://www.princetonfuelonline.com",
    addressLine1: null,
    city: "Princeton",
    state: "NJ",
    postalCodesServed: ["08540", "08542", "08544", "08550", "08534", "08536", "08628", "08638", "08648"],
    serviceCounties: ["Mercer"],
    serviceAreaRadius: 25,
    notes: "Since 1942, COD online ordering, 24hr emergency delivery",
    verified: true,
    source: "manual"
  },
  {
    name: "Force Ten Heating",
    phone: "(609) 426-4700",
    email: "forceten@gmail.com",
    website: "http://forceten.org",
    addressLine1: null,
    city: "Robbinsville",
    state: "NJ",
    postalCodesServed: ["08691", "08610", "08618", "08619", "08620", "08629", "08638", "08540", "08525", "08530"],
    serviceCounties: ["Mercer"],
    serviceAreaRadius: 20,
    notes: "Since 1994, COD cash pricing, 6-day delivery all year",
    verified: true,
    source: "manual"
  }
];

async function seedSuppliers() {
  console.log('🌱 Starting supplier seed...\n');

  const databaseUrl = process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL;

  if (!databaseUrl) {
    console.error('❌ DATABASE_URL environment variable not set');
    console.log('Set it in .env file or export it:');
    console.log('  export DATABASE_URL="postgresql://..."');
    process.exit(1);
  }

  const sequelize = new Sequelize(databaseUrl, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    }
  });

  try {
    await sequelize.authenticate();
    console.log('✅ Connected to database\n');

    // Create suppliers table if it doesn't exist
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL,
        phone VARCHAR(20),
        email VARCHAR(255),
        website VARCHAR(255),
        address_line1 VARCHAR(255),
        city VARCHAR(100),
        state VARCHAR(2),
        postal_codes_served JSONB DEFAULT '[]'::jsonb NOT NULL,
        service_counties JSONB DEFAULT '[]'::jsonb,
        service_area_radius INTEGER,
        notes TEXT,
        active BOOLEAN DEFAULT true,
        verified BOOLEAN DEFAULT false,
        source VARCHAR(50),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS suppliers_active_idx ON suppliers(active);
      CREATE INDEX IF NOT EXISTS suppliers_state_idx ON suppliers(state);
      CREATE INDEX IF NOT EXISTS suppliers_verified_idx ON suppliers(verified);
      CREATE INDEX IF NOT EXISTS suppliers_postal_codes_gin ON suppliers USING GIN(postal_codes_served);
    `);
    console.log('✅ Suppliers table ready\n');

    // Check existing count
    const [countResult] = await sequelize.query('SELECT COUNT(*) as count FROM suppliers');
    const existingCount = parseInt(countResult[0].count);

    if (existingCount > 0) {
      console.log(`⚠️  Table already has ${existingCount} suppliers`);
      console.log('   To re-seed, first run: DELETE FROM suppliers;');
      console.log('   Or set FORCE_SEED=true to clear and re-seed\n');

      if (process.env.FORCE_SEED !== 'true') {
        await sequelize.close();
        return;
      }

      console.log('🗑️  FORCE_SEED=true - clearing existing data...');
      await sequelize.query('DELETE FROM suppliers');
    }

    // Insert suppliers
    console.log(`📝 Inserting ${SUPPLIERS.length} suppliers...\n`);

    for (const supplier of SUPPLIERS) {
      const id = uuidv4();
      await sequelize.query(`
        INSERT INTO suppliers (
          id, name, phone, email, website, address_line1, city, state,
          postal_codes_served, service_counties, service_area_radius,
          notes, active, verified, source, created_at, updated_at
        ) VALUES (
          :id, :name, :phone, :email, :website, :addressLine1, :city, :state,
          :postalCodesServed::jsonb, :serviceCounties::jsonb, :serviceAreaRadius,
          :notes, :active, :verified, :source, NOW(), NOW()
        )
      `, {
        replacements: {
          id,
          name: supplier.name,
          phone: supplier.phone,
          email: supplier.email,
          website: supplier.website,
          addressLine1: supplier.addressLine1,
          city: supplier.city,
          state: supplier.state,
          postalCodesServed: JSON.stringify(supplier.postalCodesServed),
          serviceCounties: JSON.stringify(supplier.serviceCounties || []),
          serviceAreaRadius: supplier.serviceAreaRadius,
          notes: supplier.notes,
          active: true,
          verified: supplier.verified || false,
          source: supplier.source || 'manual'
        }
      });
      console.log(`   ✓ ${supplier.name} (${supplier.city}, ${supplier.state})`);
    }

    // Verify
    const [finalCount] = await sequelize.query('SELECT COUNT(*) as count FROM suppliers');
    console.log(`\n✅ Seed complete! ${finalCount[0].count} suppliers in database`);

    // Show coverage
    const [coverage] = await sequelize.query(`
      SELECT state, COUNT(*) as count
      FROM suppliers
      WHERE active = true
      GROUP BY state
      ORDER BY count DESC
    `);
    console.log('\n📊 Coverage by state:');
    coverage.forEach(row => {
      console.log(`   ${row.state}: ${row.count} suppliers`);
    });

    await sequelize.close();

  } catch (error) {
    console.error('❌ Seed failed:', error.message);
    await sequelize.close();
    process.exit(1);
  }
}

seedSuppliers();
