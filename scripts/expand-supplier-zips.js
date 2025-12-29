#!/usr/bin/env node
/**
 * expand-supplier-zips.js
 *
 * Expands suppliers' postalCodesServed to include ALL ZIPs from their serviceCounties.
 * This ensures the bundled fallback works for any ZIP in supported counties.
 */

const { Sequelize } = require('sequelize');
const fs = require('fs');
const path = require('path');

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('ERROR: DATABASE_URL not set');
    process.exit(1);
  }

  const sequelize = new Sequelize(databaseUrl, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: {
      ssl: { require: true, rejectUnauthorized: false }
    }
  });

  try {
    await sequelize.authenticate();
    console.log('Connected to database\n');

    // Read the zip-to-county mapping
    const mappingPath = path.join(__dirname, '../src/data/zip-to-county.js');
    const mappingFile = fs.readFileSync(mappingPath, 'utf8');

    // Parse ZIPs by county
    const countyZips = {};
    const regex = /"(\d{5})":\s*"(\w+)"/g;
    let match;
    while ((match = regex.exec(mappingFile)) !== null) {
      const [, zip, county] = match;
      if (!countyZips[county]) countyZips[county] = [];
      countyZips[county].push(zip);
    }

    console.log('=== ZIPs by County ===');
    Object.entries(countyZips).forEach(([county, zips]) => {
      console.log(`  ${county}: ${zips.length} ZIPs`);
    });

    // Get all active suppliers
    const [suppliers] = await sequelize.query(`
      SELECT id, name, postal_codes_served, service_counties
      FROM suppliers WHERE active = true;
    `);

    console.log(`\n=== Expanding ${suppliers.length} suppliers ===`);

    for (const s of suppliers) {
      const counties = s.service_counties || [];
      if (counties.length === 0) {
        console.log(`  ${s.name}: No counties defined, skipping`);
        continue;
      }

      // Collect all ZIPs for this supplier's counties
      let allZips = [...(s.postal_codes_served || [])];
      for (const county of counties) {
        if (countyZips[county]) {
          allZips = [...allZips, ...countyZips[county]];
        }
      }

      // Dedupe and sort
      const newZips = [...new Set(allZips)].sort();
      const oldCount = (s.postal_codes_served || []).length;

      if (newZips.length > oldCount) {
        await sequelize.query(
          `UPDATE suppliers SET postal_codes_served = :zips::jsonb WHERE id = :id`,
          { replacements: { id: s.id, zips: JSON.stringify(newZips) } }
        );
        console.log(`  ${s.name}: ${oldCount} -> ${newZips.length} ZIPs (${counties.join(', ')})`);
      } else {
        console.log(`  ${s.name}: Already complete (${oldCount} ZIPs)`);
      }
    }

    console.log('\nDone!');

  } catch (error) {
    console.error('ERROR:', error.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

main();
