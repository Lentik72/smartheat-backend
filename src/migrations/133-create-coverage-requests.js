/**
 * Migration 133: Create coverage_requests table
 *
 * Stores email-based coverage request subscriptions. When users search a ZIP
 * with no suppliers, they can request notification when coverage appears.
 * Captures fuel type preferences (heating oil / kerosene / propane) as demand signal.
 */

async function up(sequelize) {
  const [existing] = await sequelize.query(`
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'coverage_requests'
  `);

  if (existing.length > 0) return;

  await sequelize.query(`
    CREATE TABLE coverage_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) NOT NULL,
      zip_code VARCHAR(10) NOT NULL,
      fuel_types TEXT[] NOT NULL DEFAULT '{heating_oil}',
      source_page TEXT,
      state VARCHAR(2),
      county VARCHAR(100),
      city VARCHAR(100),
      unsubscribe_token VARCHAR(64) UNIQUE NOT NULL,
      notified_at TIMESTAMPTZ,
      notified_fuel_type VARCHAR(20),
      active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(email, zip_code)
    )
  `);

  await sequelize.query(`
    CREATE INDEX idx_cr_active_zip ON coverage_requests(zip_code) WHERE active = true
  `);

  await sequelize.query(`
    CREATE INDEX idx_cr_unnotified ON coverage_requests(zip_code) WHERE active = true AND notified_at IS NULL
  `);

  await sequelize.query(`
    CREATE INDEX idx_cr_token ON coverage_requests(unsubscribe_token)
  `);
}

module.exports = { up };
