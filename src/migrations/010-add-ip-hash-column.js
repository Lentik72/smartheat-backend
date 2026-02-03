/**
 * Migration 010: Add ip_hash column to supplier_engagements
 *
 * The table was created before ip_hash was added to the schema.
 * This migration adds the missing column for user tracking.
 */

const { Sequelize } = require('sequelize');

async function up(sequelize) {
  console.log('[Migration 010] Adding ip_hash column to supplier_engagements...');

  // Add ip_hash column if it doesn't exist
  await sequelize.query(`
    ALTER TABLE supplier_engagements
    ADD COLUMN IF NOT EXISTS ip_hash VARCHAR(64);
  `);

  // Add index for the new column
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_supplier_engagements_ip_hash
    ON supplier_engagements(ip_hash);
  `);

  console.log('[Migration 010] ✅ ip_hash column added successfully');
}

async function down(sequelize) {
  console.log('[Migration 010] Rolling back...');

  await sequelize.query(`
    DROP INDEX IF EXISTS idx_supplier_engagements_ip_hash;
  `);

  await sequelize.query(`
    ALTER TABLE supplier_engagements
    DROP COLUMN IF EXISTS ip_hash;
  `);

  console.log('[Migration 010] ✅ Rollback complete');
}

// Run migration if called directly
if (require.main === module) {
  require('dotenv').config();

  const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: {
      ssl: { require: true, rejectUnauthorized: false }
    }
  });

  up(sequelize)
    .then(() => {
      console.log('Migration complete');
      process.exit(0);
    })
    .catch(err => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}

module.exports = { up, down };
