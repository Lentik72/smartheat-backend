/**
 * Migration 036: Add SMS price update support
 * - Adds 'supplier_sms' and 'supplier_direct' to source_type enum
 * - Creates sms_price_updates table for tracking all SMS activity
 * - Adds SMS-related columns to suppliers table (phone_last10, sms_confirmed, etc.)
 */

module.exports = {
  name: '036-add-sms-price-support',

  async up(sequelize) {
    // Add 'supplier_sms' to source_type enum
    await sequelize.query(`
      ALTER TYPE enum_supplier_prices_source_type ADD VALUE IF NOT EXISTS 'supplier_sms';
    `).catch(err => {
      if (!err.message.includes('already exists')) throw err;
    });

    // Add 'supplier_direct' (used by magic link route but never formally migrated)
    await sequelize.query(`
      ALTER TYPE enum_supplier_prices_source_type ADD VALUE IF NOT EXISTS 'supplier_direct';
    `).catch(err => {
      if (!err.message.includes('already exists')) throw err;
    });

    // Create sms_price_updates table for tracking ALL SMS activity
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS sms_price_updates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        supplier_id UUID REFERENCES suppliers(id),
        from_phone VARCHAR(20) NOT NULL,
        message_body TEXT,
        parsed_price DECIMAL(5,3),
        type VARCHAR(20) NOT NULL,
        status VARCHAR(20) NOT NULL,
        error_message TEXT,
        twilio_message_sid VARCHAR(50),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_sms_price_updates_supplier ON sms_price_updates(supplier_id);
    `);

    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_sms_price_updates_phone ON sms_price_updates(from_phone);
    `);

    // Idempotency: prevent duplicate inserts from Twilio webhook retries
    await sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_sms_updates_sid
      ON sms_price_updates(twilio_message_sid)
      WHERE twilio_message_sid IS NOT NULL;
    `);

    // Add SMS-related columns to suppliers table
    await sequelize.query(`
      ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS phone_last10 VARCHAR(10);
    `);

    await sequelize.query(`
      ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS sms_confirmed BOOLEAN DEFAULT false;
    `);

    await sequelize.query(`
      ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS sms_confirmed_at TIMESTAMP WITH TIME ZONE;
    `);

    await sequelize.query(`
      ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS sms_opted_out BOOLEAN DEFAULT false;
    `);

    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_suppliers_phone_last10 ON suppliers(phone_last10);
    `);

    console.log('[Migration 036] SMS price support tables and columns created');
  }
};
