// scripts/import-emails.js
// Import reviewed emails from CSV into database

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { Sequelize } = require('sequelize');

const IN_FILE = path.join(__dirname, 'found_emails_clean.csv');

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  logging: false,
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }
});

async function importEmails() {
  console.log('💾 Email Importer');
  console.log('==================\n');

  if (!fs.existsSync(IN_FILE)) {
    console.error(`❌ File not found: ${IN_FILE}`);
    console.log('Run harvest-emails.js first.');
    process.exit(1);
  }

  const fileStream = fs.createReadStream(IN_FILE);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const updates = [];
  let isHeader = true;

  for await (const line of rl) {
    if (isHeader) {
      isHeader = false;
      continue;
    }

    // Simple CSV parse (handles our escaped format)
    const match = line.match(/"([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)"/);
    if (match) {
      updates.push({
        id: match[1],
        name: match[2],
        email: match[6]
      });
    }
  }

  console.log(`Found ${updates.length} emails to import.\n`);

  if (updates.length === 0) {
    console.log('Nothing to import.');
    process.exit(0);
  }

  let success = 0;
  let failed = 0;

  for (const row of updates) {
    try {
      await sequelize.query(
        `UPDATE suppliers SET email = :email, updated_at = NOW() WHERE id = :id AND (email IS NULL OR email = '')`,
        { replacements: { email: row.email, id: row.id } }
      );
      console.log(`✅ ${row.name}: ${row.email}`);
      success++;
    } catch (err) {
      console.log(`❌ ${row.name}: ${err.message}`);
      failed++;
    }
  }

  console.log('\n==================');
  console.log(`✅ Updated: ${success}`);
  console.log(`❌ Failed: ${failed}`);

  await sequelize.close();
  process.exit(0);
}

importEmails().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
