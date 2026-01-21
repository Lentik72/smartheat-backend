/**
 * Migration 008: Add Device ID Tracking
 *
 * Adds device_id column to api_activity for more accurate unique user tracking.
 * Device ID (from iOS identifierForVendor) provides better user identification
 * than IP hash alone, especially for users on multiple networks.
 *
 * Hybrid approach: Use device_id when available, fall back to ip_hash.
 */

const { Sequelize } = require('sequelize');

async function up(sequelize) {
  console.log('[Migration 008] Adding device ID tracking...');

  // 1. Add device_id column to api_activity
  await sequelize.query(`
    ALTER TABLE api_activity
    ADD COLUMN IF NOT EXISTS device_id VARCHAR(64);

    CREATE INDEX IF NOT EXISTS idx_api_activity_device_id ON api_activity(device_id);
  `);
  console.log('  ✓ device_id column added to api_activity');

  // 2. Add device_id breakdown to daily_active_users
  await sequelize.query(`
    ALTER TABLE daily_active_users
    ADD COLUMN IF NOT EXISTS unique_devices INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS users_by_device JSONB DEFAULT '{}';
  `);
  console.log('  ✓ device tracking columns added to daily_active_users');

  console.log('[Migration 008] ✅ Device ID tracking enabled');
}

async function down(sequelize) {
  console.log('[Migration 008] Rolling back...');

  await sequelize.query(`
    ALTER TABLE api_activity DROP COLUMN IF EXISTS device_id;
    ALTER TABLE daily_active_users DROP COLUMN IF EXISTS unique_devices;
    ALTER TABLE daily_active_users DROP COLUMN IF EXISTS users_by_device;
  `);

  console.log('[Migration 008] ✅ Rollback complete');
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
      sequelize.close();
      process.exit(0);
    })
    .catch(err => {
      console.error('Migration failed:', err);
      sequelize.close();
      process.exit(1);
    });
}

module.exports = { up, down };
