/**
 * One-time phone normalization script
 * Reads all suppliers, extracts last 10 digits from phone field,
 * writes to phone_last10 column. Run once after migration 036.
 *
 * Usage: node scripts/normalize-phones.js
 */

const { Sequelize } = require('sequelize');
require('dotenv').config();

function extractLast10(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

async function main() {
  const dbUrl = process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const sequelize = new Sequelize(dbUrl, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }
  });

  await sequelize.authenticate();
  console.log('Connected to database');

  const [suppliers] = await sequelize.query(`
    SELECT id, name, phone, phone_last10
    FROM suppliers
    WHERE active = true
    ORDER BY name
  `);

  let normalized = 0;
  let skipped = 0;
  let alreadySet = 0;
  const duplicates = new Map(); // last10 -> [supplier names]

  for (const s of suppliers) {
    if (s.phone_last10) {
      alreadySet++;
      // Still track for duplicate detection
      const existing = duplicates.get(s.phone_last10) || [];
      existing.push(s.name);
      duplicates.set(s.phone_last10, existing);
      continue;
    }

    const last10 = extractLast10(s.phone);
    if (!last10) {
      skipped++;
      continue;
    }

    // Track duplicates
    const existing = duplicates.get(last10) || [];
    existing.push(s.name);
    duplicates.set(last10, existing);

    await sequelize.query(`
      UPDATE suppliers SET phone_last10 = :last10 WHERE id = :id
    `, { replacements: { last10, id: s.id } });

    normalized++;
  }

  console.log(`\nResults:`);
  console.log(`  Total suppliers: ${suppliers.length}`);
  console.log(`  Normalized: ${normalized}`);
  console.log(`  Already set: ${alreadySet}`);
  console.log(`  Skipped (no phone): ${skipped}`);

  // Report duplicates
  const dupes = [...duplicates.entries()].filter(([, names]) => names.length > 1);
  if (dupes.length > 0) {
    console.log(`\n  Duplicate phone_last10 values (${dupes.length}):`);
    for (const [phone, names] of dupes) {
      console.log(`    ${phone}: ${names.join(', ')}`);
    }
  } else {
    console.log(`  No duplicate phone numbers found`);
  }

  await sequelize.close();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
