/**
 * Migration 009: Add Waitlist Table
 *
 * Captures users from unsupported regions (e.g., Canada) who want
 * to be notified when we launch in their area.
 *
 * Strategy: Option C
 * - Immediate email notification for early signups
 * - Include in daily analytics report for ongoing tracking
 */

const { Sequelize } = require('sequelize');

async function up(sequelize) {
  console.log('[Migration 009] Creating waitlist table...');

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS waitlist (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) NOT NULL,
      postal_code VARCHAR(10) NOT NULL,
      city VARCHAR(100),
      province VARCHAR(50),
      country VARCHAR(2) DEFAULT 'CA',
      source VARCHAR(50) DEFAULT 'app_onboarding',
      notified BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

      -- Prevent duplicate signups from same email
      UNIQUE(email, country)
    );

    CREATE INDEX IF NOT EXISTS idx_waitlist_country ON waitlist(country);
    CREATE INDEX IF NOT EXISTS idx_waitlist_created_at ON waitlist(created_at);
  `);

  console.log('[Migration 009] ✅ Waitlist table created');
}

async function down(sequelize) {
  console.log('[Migration 009] Rolling back...');
  await sequelize.query('DROP TABLE IF EXISTS waitlist;');
  console.log('[Migration 009] ✅ Rollback complete');
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
