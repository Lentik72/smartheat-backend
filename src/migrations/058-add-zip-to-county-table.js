/**
 * Migration 058: Add ZIP to County Reference Table
 *
 * Creates the geographic backbone for county-level price aggregation.
 * This is reference data - imported once from Census/HUD sources.
 *
 * Architecture:
 * - zip_to_county: Maps 5-digit ZIP codes to counties
 * - Used for county-level price aggregation (not supplier metadata)
 * - Covers all US ZIP codes, not just service area
 */

module.exports = {
  name: '058-add-zip-to-county-table',

  async up(sequelize) {
    // Check if table already exists
    const [results] = await sequelize.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = 'zip_to_county'
    `);

    if (results && results.length > 0) {
      console.log('[Migration 058] zip_to_county table already exists, skipping creation');
      return;
    }

    // Create the reference table
    await sequelize.query(`
      CREATE TABLE zip_to_county (
        zip_code VARCHAR(5) PRIMARY KEY,
        county_name VARCHAR(100) NOT NULL,
        state_code VARCHAR(2) NOT NULL,
        city VARCHAR(100),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Create indexes for efficient lookups
    await sequelize.query(`
      CREATE INDEX idx_zip_to_county_state ON zip_to_county(state_code)
    `);

    await sequelize.query(`
      CREATE INDEX idx_zip_to_county_county ON zip_to_county(county_name, state_code)
    `);

    console.log('[Migration 058] Created zip_to_county table');
    console.log('[Migration 058] Run "node scripts/seed-zip-to-county.js" to populate data');
  },

  async down(sequelize) {
    await sequelize.query('DROP TABLE IF EXISTS zip_to_county CASCADE');
    console.log('[Migration 058] Dropped zip_to_county table');
  }
};
