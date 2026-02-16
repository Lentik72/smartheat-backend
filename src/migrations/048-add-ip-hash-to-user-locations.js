/**
 * Migration 048: Add ip_hash column to user_locations table
 *
 * The user_locations table tracks ZIP codes searched on the website.
 * Adding ip_hash allows proper unique user counting instead of just unique ZIP codes.
 */

async function up(sequelize) {
  console.log('[Migration 048] Adding ip_hash column to user_locations...');

  // Add ip_hash column
  await sequelize.query(`
    ALTER TABLE user_locations
    ADD COLUMN IF NOT EXISTS ip_hash VARCHAR(64);
  `);

  // Add index for performance
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_user_locations_ip_hash
    ON user_locations(ip_hash);
  `);

  console.log('[Migration 048] ip_hash column added to user_locations');
}

async function down(sequelize) {
  await sequelize.query('DROP INDEX IF EXISTS idx_user_locations_ip_hash;');
  await sequelize.query('ALTER TABLE user_locations DROP COLUMN IF EXISTS ip_hash;');
  console.log('[Migration 048] Removed ip_hash column from user_locations');
}

module.exports = { up, down };
