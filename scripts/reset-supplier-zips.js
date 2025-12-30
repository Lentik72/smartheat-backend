#!/usr/bin/env node
/**
 * Reset suppliers to their original postalCodesServed values
 * (Reverts the aggressive county-wide expansion)
 */

const { Sequelize } = require('sequelize');

const ORIGINAL_ZIPS = {
  "On Site Oil Corp": ["10520", "10566", "10547", "10548", "10567", "10509", "10562", "10549", "10511"],
  "Barrco Fuel": ["10536", "10549", "10562", "10507", "10509", "10512", "10541"],
  "JFJ Fuel Oil": ["10701", "10702", "10703", "10704", "10705", "10706", "10707", "10708", "10709", "10710"],
  "Town & Country Oil": ["10566", "10567", "10520", "10547", "10548", "10509", "10562"],
  "Putnam Oil": ["10512", "10541", "10509", "10516", "10524", "10579", "10537"],
  "Hunter's Heating Oil": ["10601", "10602", "10603", "10604", "10605", "10606", "10607", "10570", "10514", "10591", "10583"],
  "Yorktown Fuel": ["10588", "10598", "10547", "10567", "10535"],
  "Emergency Services Fuel Corp": [],
  "Economy Fuel (Peekskill)": ["10566", "10567", "10520", "10547", "10548"],
  "Palisades Fuel": ["10960", "10913", "10954", "10952", "10956", "10964", "10965", "10901", "10962"],
  "Economy Fuel NY": ["10956", "10954", "10952", "10901", "10960", "10913", "10964", "10965", "10962"],
  "Surner Heating": ["01301", "01302", "01340", "01344", "01346", "01360", "01367", "01370", "01373", "01376", "01002", "01003", "01007", "01035"],
  "Preite Oil Company": ["01247", "01220", "01226", "01237", "01240", "01252", "01254", "01256", "01257", "01259", "01262", "01263", "01264", "01266", "01267", "01270", "01340"],
  "County Energy Products": ["01824", "01826", "01850", "01851", "01852", "01876", "01821"],
  "AJ's Fuel": ["07828", "07834", "07836", "07840", "07850", "07852", "07857", "07869", "07876", "07878"],
  "Reis Fuel": [],
  "Princeton Fuel Online": ["08540", "08542", "08544", "08550", "08534", "08536", "08628", "08638", "08648"],
  "Force Ten Heating": ["08691", "08610", "08618", "08619", "08620", "08629", "08638", "08540", "08525", "08530"]
};

async function main() {
  const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }
  });

  console.log('Resetting suppliers to original ZIP coverage...\n');

  for (const [name, zips] of Object.entries(ORIGINAL_ZIPS)) {
    await sequelize.query(
      `UPDATE suppliers SET postal_codes_served = :zips::jsonb WHERE name = :name`,
      { replacements: { name, zips: JSON.stringify(zips) } }
    );
    console.log(`  ${name}: ${zips.length} ZIPs`);
  }

  console.log('\nDone!');
  await sequelize.close();
}

main().catch(e => console.error(e));
