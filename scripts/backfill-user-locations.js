#!/usr/bin/env node
/**
 * One-time script: Backfill null city/state in user_locations.
 *
 * Usage: DATABASE_URL=... node scripts/backfill-user-locations.js [--dry-run]
 *
 * What it does:
 * 1. Loads full US ZIP lookup (41K entries)
 * 2. For rows with null state: fills city/county/state from lookup
 * 3. For rows whose ZIP isn't in the lookup: marks coverage_quality as 'unverified'
 *    (keeps the data — someone searched for it, that's signal)
 */

const { Sequelize } = require('sequelize');
const usZipLookup = require('../src/data/us-zip-lookup.json');

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL required');
    process.exit(1);
  }

  const sequelize = new Sequelize(dbUrl, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: dbUrl.includes('railway') ? { ssl: { rejectUnauthorized: false } } : {}
  });

  await sequelize.authenticate();
  console.log('Connected to database');

  // Get all user_locations
  const [rows] = await sequelize.query('SELECT id, zip_code, city, state, county, coverage_quality FROM user_locations');
  console.log(`Found ${rows.length} user_locations`);

  let backfilled = 0;
  let markedUnverified = 0;
  const unverifiedZips = [];

  for (const row of rows) {
    const zipInfo = usZipLookup[row.zip_code];

    if (!zipInfo) {
      // Not a known US ZIP — mark as unverified, keep the row
      unverifiedZips.push(row.zip_code);
      if (!dryRun && row.coverage_quality !== 'unverified') {
        await sequelize.query(
          'UPDATE user_locations SET coverage_quality = :quality WHERE id = :id',
          { replacements: { quality: 'unverified', id: row.id } }
        );
      }
      markedUnverified++;
      continue;
    }

    // Backfill null fields from lookup
    const updates = {};
    if (!row.city && zipInfo.city) updates.city = zipInfo.city;
    if (!row.county && zipInfo.county) updates.county = zipInfo.county;
    if (!row.state && zipInfo.state) updates.state = zipInfo.state;

    if (Object.keys(updates).length > 0) {
      if (!dryRun) {
        const setClauses = Object.keys(updates).map(k => `${k} = :${k}`).join(', ');
        await sequelize.query(`UPDATE user_locations SET ${setClauses} WHERE id = :id`, {
          replacements: { ...updates, id: row.id }
        });
      }
      backfilled++;
      console.log(`  Backfill ${row.zip_code}: ${JSON.stringify(updates)}`);
    }
  }

  console.log(`\n${dryRun ? '[DRY RUN] ' : ''}Results:`);
  console.log(`  Backfilled: ${backfilled} rows`);
  console.log(`  Marked unverified: ${markedUnverified} ZIPs: ${unverifiedZips.join(', ')}`);

  await sequelize.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
