/**
 * Migration 014: Add PWA Events Table
 *
 * Tracks PWA install prompts, installations, and standalone launches
 * for Android (and iOS) users.
 */

const { Sequelize } = require('sequelize');

async function up(sequelize) {
  console.log('[Migration 014] Creating pwa_events table...');

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS pwa_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_type VARCHAR(30) NOT NULL,
      platform VARCHAR(20),
      user_agent TEXT,
      ip_address VARCHAR(45),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_pwa_events_type ON pwa_events(event_type);
    CREATE INDEX IF NOT EXISTS idx_pwa_events_created ON pwa_events(created_at);
    CREATE INDEX IF NOT EXISTS idx_pwa_events_platform ON pwa_events(platform);
  `);

  console.log('[Migration 014] ✅ PWA events table created');
}

async function down(sequelize) {
  console.log('[Migration 014] Rolling back...');
  await sequelize.query('DROP TABLE IF EXISTS pwa_events;');
  console.log('[Migration 014] ✅ Rollback complete');
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
