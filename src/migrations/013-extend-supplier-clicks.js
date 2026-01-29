/**
 * Migration 013: Extend supplier_clicks table for enhanced tracking
 * Adds supplier_name, page_source, device_type, platform columns
 */

const { Sequelize } = require('sequelize');

async function up(sequelize) {
  // Add supplier_name column (for reporting without joins)
  await sequelize.query(`
    ALTER TABLE supplier_clicks
    ADD COLUMN IF NOT EXISTS supplier_name VARCHAR(255);
  `);

  // Add page_source column (enum: prices, state, county, city)
  await sequelize.query(`
    ALTER TABLE supplier_clicks
    ADD COLUMN IF NOT EXISTS page_source VARCHAR(20);
  `);

  // Add device_type column (mobile or desktop)
  await sequelize.query(`
    ALTER TABLE supplier_clicks
    ADD COLUMN IF NOT EXISTS device_type VARCHAR(10);
  `);

  // Add platform column (ios, android, web)
  await sequelize.query(`
    ALTER TABLE supplier_clicks
    ADD COLUMN IF NOT EXISTS platform VARCHAR(10);
  `);

  // Create index for page_source queries
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_supplier_clicks_page_source
    ON supplier_clicks(page_source);
  `);

  // Create index for device/platform analytics
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_supplier_clicks_device
    ON supplier_clicks(device_type, platform);
  `);

  console.log('[Migration 013] Extended supplier_clicks table with new columns');
}

async function down(sequelize) {
  await sequelize.query('ALTER TABLE supplier_clicks DROP COLUMN IF EXISTS supplier_name;');
  await sequelize.query('ALTER TABLE supplier_clicks DROP COLUMN IF EXISTS page_source;');
  await sequelize.query('ALTER TABLE supplier_clicks DROP COLUMN IF EXISTS device_type;');
  await sequelize.query('ALTER TABLE supplier_clicks DROP COLUMN IF EXISTS platform;');
  await sequelize.query('DROP INDEX IF EXISTS idx_supplier_clicks_page_source;');
  await sequelize.query('DROP INDEX IF EXISTS idx_supplier_clicks_device;');
  console.log('[Migration 013] Removed extended columns from supplier_clicks');
}

// Auto-run when called directly
if (require.main === module) {
  const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: {
      ssl: { require: true, rejectUnauthorized: false }
    }
  });

  up(sequelize)
    .then(() => {
      console.log('[Migration 013] Complete');
      process.exit(0);
    })
    .catch(err => {
      console.error('[Migration 013] Failed:', err);
      process.exit(1);
    });
}

module.exports = { up, down };
