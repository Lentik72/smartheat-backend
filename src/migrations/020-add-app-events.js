/**
 * Migration 020: Add app_events table for comprehensive anonymous tracking
 *
 * Tracks all app events WITHOUT requiring user consent.
 * Uses device_id_hash for session/retention tracking (not user-identifiable).
 *
 * Key metrics enabled:
 * - Retention (DAU, WAU, MAU, cohorts)
 * - Feature adoption
 * - Conversion funnel
 * - Propane demand
 * - Coverage gaps
 */

const { Sequelize } = require('sequelize');

async function up(sequelize) {
  console.log('[Migration 020] Creating app_events table...');

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS app_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

      -- Event identification
      event_name VARCHAR(100) NOT NULL,
      event_data JSONB DEFAULT '{}',

      -- Anonymous device tracking (hashed, not identifiable)
      device_id_hash VARCHAR(64),

      -- Context
      zip_prefix VARCHAR(3),
      fuel_type VARCHAR(20),
      app_version VARCHAR(20),
      device_type VARCHAR(20),
      os_version VARCHAR(20),

      -- Timestamp
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- Indexes for common queries
    CREATE INDEX IF NOT EXISTS idx_app_events_name ON app_events(event_name);
    CREATE INDEX IF NOT EXISTS idx_app_events_created ON app_events(created_at);
    CREATE INDEX IF NOT EXISTS idx_app_events_device ON app_events(device_id_hash);
    CREATE INDEX IF NOT EXISTS idx_app_events_name_created ON app_events(event_name, created_at);
    CREATE INDEX IF NOT EXISTS idx_app_events_fuel ON app_events(fuel_type) WHERE fuel_type IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_app_events_zip ON app_events(zip_prefix) WHERE zip_prefix IS NOT NULL;
  `);

  console.log('[Migration 020] ✅ app_events table created');
}

async function down(sequelize) {
  console.log('[Migration 020] Rolling back...');
  await sequelize.query('DROP TABLE IF EXISTS app_events;');
  console.log('[Migration 020] ✅ Rollback complete');
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
