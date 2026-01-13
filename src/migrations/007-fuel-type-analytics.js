/**
 * Migration 007: Add fuel_type to Activity Analytics
 *
 * Adds fuel type tracking to separate oil vs propane metrics:
 * - api_activity: Add fuel_type column
 * - daily_active_users: Add users_by_fuel JSONB column
 */

const { Sequelize } = require('sequelize');

async function up(sequelize) {
  console.log('[Migration 007] Adding fuel_type to activity analytics...');

  // 1. Add fuel_type column to api_activity
  await sequelize.query(`
    ALTER TABLE api_activity
    ADD COLUMN IF NOT EXISTS fuel_type VARCHAR(20);

    CREATE INDEX IF NOT EXISTS idx_api_activity_fuel_type ON api_activity(fuel_type);
  `);
  console.log('  ✓ api_activity.fuel_type column added');

  // 2. Add users_by_fuel JSONB column to daily_active_users
  await sequelize.query(`
    ALTER TABLE daily_active_users
    ADD COLUMN IF NOT EXISTS users_by_fuel JSONB DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS requests_by_fuel JSONB DEFAULT '{}';
  `);
  console.log('  ✓ daily_active_users fuel breakdown columns added');

  // 3. Add fuel_type to supplier_engagements
  await sequelize.query(`
    ALTER TABLE supplier_engagements
    ADD COLUMN IF NOT EXISTS fuel_type VARCHAR(20);

    CREATE INDEX IF NOT EXISTS idx_supplier_engagements_fuel_type ON supplier_engagements(fuel_type);
  `);
  console.log('  ✓ supplier_engagements.fuel_type column added');

  console.log('[Migration 007] ✅ Fuel type analytics columns added');
}

async function down(sequelize) {
  console.log('[Migration 007] Rolling back...');

  await sequelize.query(`
    ALTER TABLE api_activity DROP COLUMN IF EXISTS fuel_type;
    ALTER TABLE daily_active_users DROP COLUMN IF EXISTS users_by_fuel;
    ALTER TABLE daily_active_users DROP COLUMN IF EXISTS requests_by_fuel;
    ALTER TABLE supplier_engagements DROP COLUMN IF EXISTS fuel_type;
  `);

  console.log('[Migration 007] ✅ Rollback complete');
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
