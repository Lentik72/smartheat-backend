/**
 * Migration 018: Add Onboarding Steps Table
 *
 * Tracks anonymous onboarding funnel data WITHOUT requiring user consent.
 * Used to measure onboarding completion rates and identify drop-off points.
 *
 * Privacy: Only stores ZIP prefix (3 digits), IP hash, and app version.
 * No user-identifiable data.
 */

const { Sequelize } = require('sequelize');

async function up(sequelize) {
  console.log('[Migration 018] Creating onboarding_steps table...');

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS onboarding_steps (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      step_name VARCHAR(100) NOT NULL,
      action VARCHAR(50) NOT NULL,
      zip_prefix VARCHAR(3),
      ip_hash VARCHAR(64),
      app_version VARCHAR(20),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_onboarding_steps_step ON onboarding_steps(step_name);
    CREATE INDEX IF NOT EXISTS idx_onboarding_steps_action ON onboarding_steps(action);
    CREATE INDEX IF NOT EXISTS idx_onboarding_steps_created ON onboarding_steps(created_at);
    CREATE INDEX IF NOT EXISTS idx_onboarding_steps_step_action ON onboarding_steps(step_name, action);
  `);

  console.log('[Migration 018] ✅ Onboarding steps table created');
}

async function down(sequelize) {
  console.log('[Migration 018] Rolling back...');
  await sequelize.query('DROP TABLE IF EXISTS onboarding_steps;');
  console.log('[Migration 018] ✅ Rollback complete');
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
