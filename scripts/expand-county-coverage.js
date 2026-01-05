#!/usr/bin/env node
/**
 * expand-county-coverage.js
 * Expands supplier ZIP lists to cover all ZIPs in their claimed service counties
 */

const { Sequelize } = require('sequelize');
const zipDatabase = require('../src/data/zip-database.json');

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  logging: false,
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }
});

// Build county -> ZIPs mapping
function buildCountyZipMap() {
  const map = {};
  Object.entries(zipDatabase).forEach(([zip, info]) => {
    const key = `${info.county}, ${info.state}`;
    if (!map[key]) map[key] = [];
    map[key].push(zip);
  });
  return map;
}

async function expandCoverage() {
  console.log('=== Expand County Coverage ===\n');

  const countyZips = buildCountyZipMap();
  console.log('County ZIP counts:');
  Object.entries(countyZips)
    .filter(([k]) => k.includes('NY') || k.includes('NJ') || k.includes('MA'))
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 15)
    .forEach(([county, zips]) => console.log(`  ${county}: ${zips.length} ZIPs`));

  // Get all active suppliers with their service counties
  const [suppliers] = await sequelize.query(`
    SELECT id, name, city, state,
           postal_codes_served as zips,
           service_counties as counties,
           service_area_radius as radius
    FROM suppliers
    WHERE active = true
    ORDER BY name;
  `);

  console.log(`\nFound ${suppliers.length} active suppliers\n`);

  let totalUpdated = 0;

  for (const supplier of suppliers) {
    const currentZips = supplier.zips || [];
    const counties = supplier.counties || [];
    let newZips = [...currentZips];

    // If supplier has service counties, add all ZIPs from those counties
    if (counties.length > 0) {
      for (const county of counties) {
        // Try exact match first, then with state
        let countyKey = Object.keys(countyZips).find(k =>
          k.toLowerCase().startsWith(county.toLowerCase())
        );

        if (countyKey && countyZips[countyKey]) {
          const countyZipList = countyZips[countyKey];
          newZips = [...new Set([...newZips, ...countyZipList])];
        }
      }
    }

    // Also add ZIPs based on supplier's home county (if in Westchester area)
    const homeState = supplier.state;
    if (homeState === 'NY') {
      // Find home county from ZIP database based on supplier city
      const homeEntry = Object.entries(zipDatabase).find(([z, info]) =>
        info.city.toLowerCase() === supplier.city?.toLowerCase() && info.state === 'NY'
      );

      if (homeEntry) {
        const homeCounty = homeEntry[1].county;
        const homeCountyKey = `${homeCounty}, NY`;
        if (countyZips[homeCountyKey]) {
          newZips = [...new Set([...newZips, ...countyZips[homeCountyKey]])];
        }
      }
    }

    // Sort and check if changed
    newZips = [...new Set(newZips)].sort();
    const added = newZips.filter(z => !currentZips.includes(z));

    if (added.length > 0) {
      await sequelize.query(
        `UPDATE suppliers SET postal_codes_served = $1::jsonb, updated_at = NOW() WHERE id = $2`,
        { bind: [JSON.stringify(newZips), supplier.id] }
      );

      console.log(`${supplier.name}:`);
      console.log(`  Counties: ${counties.join(', ') || 'none'}`);
      console.log(`  Before: ${currentZips.length} ZIPs → After: ${newZips.length} ZIPs (+${added.length})`);
      totalUpdated++;
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Updated ${totalUpdated} suppliers`);

  await sequelize.close();
}

expandCoverage().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
