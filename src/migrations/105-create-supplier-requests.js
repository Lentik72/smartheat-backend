/**
 * Migration 105: Ensure supplier_requests table has web self-service columns
 *
 * The table may exist from Sequelize sync (database.js) with different columns,
 * or from this migration's schema. This migration adds any missing columns.
 */
module.exports = {
  name: '105-create-supplier-requests',
  async up(sequelize) {
    // Ensure table exists with minimum required columns
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS supplier_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        business_name VARCHAR(200),
        city VARCHAR(100),
        state VARCHAR(2),
        phone VARCHAR(20),
        email VARCHAR(255),
        website VARCHAR(255),
        areas_served TEXT,
        delivery_model VARCHAR(20) DEFAULT 'cod',
        source VARCHAR(20) DEFAULT 'app',
        status VARCHAR(20) DEFAULT 'pending',
        admin_notes TEXT,
        matched_supplier_id UUID,
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Add columns that might be missing (idempotent)
    const addCol = async (col, def) => {
      try {
        await sequelize.query(`ALTER TABLE supplier_requests ADD COLUMN IF NOT EXISTS ${col} ${def}`);
      } catch (e) {
        // Column might already exist
      }
    };

    await addCol('source', "VARCHAR(20) DEFAULT 'app'");
    await addCol('areas_served', 'TEXT');
    await addCol('delivery_model', "VARCHAR(20) DEFAULT 'cod'");
    await addCol('matched_supplier_id', 'UUID');
    await addCol('ip_address', 'VARCHAR(45)');
    await addCol('user_agent', 'TEXT');
    await addCol('business_name', 'VARCHAR(200)');
    await addCol('phone', 'VARCHAR(20)');

    await sequelize.query('CREATE INDEX IF NOT EXISTS idx_supplier_requests_status ON supplier_requests (status)');
    await sequelize.query('CREATE INDEX IF NOT EXISTS idx_supplier_requests_email ON supplier_requests (email)');

    console.log('[Migration 105] supplier_requests table ready for web self-service');
  },

  async down(sequelize) {
    // Only drop columns we added, not the whole table
    await sequelize.query(`
      ALTER TABLE supplier_requests
      DROP COLUMN IF EXISTS source,
      DROP COLUMN IF EXISTS areas_served,
      DROP COLUMN IF EXISTS delivery_model,
      DROP COLUMN IF EXISTS matched_supplier_id
    `);
  }
};
