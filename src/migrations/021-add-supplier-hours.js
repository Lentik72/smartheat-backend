/**
 * Migration 021: Add supplier hours and emergency delivery fields
 *
 * Adds operating hours and emergency/weekend delivery info to suppliers.
 * Badges only display when hours_verified_at is set (not NULL).
 *
 * Fields:
 * - hours_weekday/saturday/sunday: Operating hours text
 * - weekend_delivery/emergency_delivery: 'yes', 'no', 'unknown'
 * - emergency_phone: Separate emergency contact number
 * - hours_source: 'manual', 'public', 'self_reported'
 * - hours_verified_at: Timestamp gates public display
 * - hours_notes: Internal notes
 */

const { Sequelize } = require('sequelize');

async function up(sequelize) {
  console.log('[Migration 021] Adding supplier hours fields...');

  await sequelize.query(`
    ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS hours_weekday VARCHAR(50);
    ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS hours_saturday VARCHAR(50);
    ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS hours_sunday VARCHAR(50);
    ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS weekend_delivery VARCHAR(10) DEFAULT 'unknown';
    ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS emergency_delivery VARCHAR(10) DEFAULT 'unknown';
    ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS emergency_phone VARCHAR(20);
    ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS hours_source VARCHAR(20);
    ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS hours_verified_at TIMESTAMP WITH TIME ZONE;
    ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS hours_notes TEXT;
  `);

  console.log('[Migration 021] ✅ Supplier hours fields added');
}

async function down(sequelize) {
  console.log('[Migration 021] Rolling back supplier hours fields...');

  await sequelize.query(`
    ALTER TABLE suppliers DROP COLUMN IF EXISTS hours_weekday;
    ALTER TABLE suppliers DROP COLUMN IF EXISTS hours_saturday;
    ALTER TABLE suppliers DROP COLUMN IF EXISTS hours_sunday;
    ALTER TABLE suppliers DROP COLUMN IF EXISTS weekend_delivery;
    ALTER TABLE suppliers DROP COLUMN IF EXISTS emergency_delivery;
    ALTER TABLE suppliers DROP COLUMN IF EXISTS emergency_phone;
    ALTER TABLE suppliers DROP COLUMN IF EXISTS hours_source;
    ALTER TABLE suppliers DROP COLUMN IF EXISTS hours_verified_at;
    ALTER TABLE suppliers DROP COLUMN IF EXISTS hours_notes;
  `);

  console.log('[Migration 021] ✅ Rollback complete');
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
