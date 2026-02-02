/**
 * Migration 019: Add fuel_type to onboarding_steps table
 *
 * Captures fuel type selection (heating_oil/propane) without requiring consent.
 * Enables visibility into propane user base.
 */

const { Sequelize } = require('sequelize');

async function up(sequelize) {
  console.log('[Migration 019] Adding fuel_type column to onboarding_steps...');

  await sequelize.query(`
    ALTER TABLE onboarding_steps
    ADD COLUMN IF NOT EXISTS fuel_type VARCHAR(20);
  `);

  // Create index for fuel type queries
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_onboarding_steps_fuel_type
    ON onboarding_steps(fuel_type);
  `);

  console.log('[Migration 019] ✅ fuel_type column added');
}

async function down(sequelize) {
  console.log('[Migration 019] Rolling back...');
  await sequelize.query('ALTER TABLE onboarding_steps DROP COLUMN IF EXISTS fuel_type;');
  await sequelize.query('DROP INDEX IF EXISTS idx_onboarding_steps_fuel_type;');
  console.log('[Migration 019] ✅ Rollback complete');
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
