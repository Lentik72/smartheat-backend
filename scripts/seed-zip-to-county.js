#!/usr/bin/env node
/**
 * Seed ZIP to County Reference Data
 *
 * Populates zip_to_county table from Census/HUD data.
 * Data source: seanpianka/Zipcodes (updated Feb 2025)
 *
 * Usage:
 *   DATABASE_URL="..." node scripts/seed-zip-to-county.js
 *   DATABASE_URL="..." node scripts/seed-zip-to-county.js --full  # All US ZIPs
 */

const { Sequelize } = require('sequelize');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const args = process.argv.slice(2);
const useFullUS = args.includes('--full');

async function seedZipToCounty() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  ZIP to County Seed Script');
  console.log('  ' + new Date().toLocaleString());
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  // Determine which data file to use
  const dataFile = useFullUS
    ? path.join(__dirname, '../data/zip_to_county_full_us.json')
    : path.join(__dirname, '../data/zip_to_county.json');

  console.log(`📂 Using data file: ${path.basename(dataFile)}`);
  console.log(`   Mode: ${useFullUS ? 'Full US (41K+ ZIPs)' : 'Northeast only (9K+ ZIPs)'}`);
  console.log('');

  // Load data
  if (!fs.existsSync(dataFile)) {
    console.error(`❌ Data file not found: ${dataFile}`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
  console.log(`📊 Loaded ${data.length} ZIP codes`);

  // Connect to database
  const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: {
      ssl: process.env.DATABASE_URL?.includes('railway') ? {
        require: true,
        rejectUnauthorized: false
      } : false
    }
  });

  try {
    await sequelize.authenticate();
    console.log('✅ Database connected');

    // Check if table exists
    const [tableCheck] = await sequelize.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'zip_to_county'
    `);

    if (!tableCheck || tableCheck.length === 0) {
      console.error('❌ zip_to_county table does not exist. Run migration 058 first.');
      await sequelize.close();
      process.exit(1);
    }

    // Check current count
    const [countResult] = await sequelize.query('SELECT COUNT(*) as count FROM zip_to_county');
    const currentCount = parseInt(countResult[0].count);
    console.log(`📊 Current records in table: ${currentCount}`);

    if (currentCount > 0) {
      console.log('⚠️  Table already has data. Upserting (this may take a moment)...');
    }

    // Insert in batches of 500
    const BATCH_SIZE = 500;
    let inserted = 0;
    let updated = 0;

    for (let i = 0; i < data.length; i += BATCH_SIZE) {
      const batch = data.slice(i, i + BATCH_SIZE);

      // Build VALUES clause
      const values = batch.map(d => {
        const county = d.county_name.replace(/'/g, "''");
        const city = (d.city || '').replace(/'/g, "''");
        return `('${d.zip_code}', '${county}', '${d.state_code}', '${city}')`;
      }).join(',\n');

      // Upsert with ON CONFLICT
      const result = await sequelize.query(`
        INSERT INTO zip_to_county (zip_code, county_name, state_code, city)
        VALUES ${values}
        ON CONFLICT (zip_code) DO UPDATE SET
          county_name = EXCLUDED.county_name,
          state_code = EXCLUDED.state_code,
          city = EXCLUDED.city
      `);

      inserted += batch.length;

      // Progress update
      if (inserted % 2000 === 0 || inserted === data.length) {
        console.log(`  [${inserted}/${data.length}] Processed...`);
      }
    }

    // Final count
    const [finalCount] = await sequelize.query('SELECT COUNT(*) as count FROM zip_to_county');
    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`  ✅ Complete: ${finalCount[0].count} ZIP codes in table`);
    console.log('═══════════════════════════════════════════════════════════');

    // Show sample data
    const [sample] = await sequelize.query(`
      SELECT zip_code, county_name, state_code, city
      FROM zip_to_county
      WHERE state_code = 'NY' AND county_name = 'Westchester'
      ORDER BY zip_code
      LIMIT 5
    `);

    if (sample.length > 0) {
      console.log('\nSample Westchester ZIPs:');
      sample.forEach(s => {
        console.log(`  ${s.zip_code} → ${s.city}, ${s.county_name} County, ${s.state_code}`);
      });
    }

    await sequelize.close();
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    await sequelize.close();
    process.exit(1);
  }
}

seedZipToCounty();
