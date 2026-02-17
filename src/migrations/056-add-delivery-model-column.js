/**
 * Migration 056: Add delivery_model column to suppliers
 *
 * Future-proofs the database for contract/full-service companies.
 * All existing suppliers default to 'cod' (current business model).
 *
 * Values:
 * - 'cod': Cash on delivery / will-call (current)
 * - 'contract': Full-service / automatic delivery (future)
 */

module.exports = {
  name: '056-add-delivery-model-column',

  async up(sequelize) {
    // Check if column already exists
    const [columns] = await sequelize.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'suppliers' AND column_name = 'delivery_model'
    `);

    if (columns.length > 0) {
      console.log('[Migration 056] delivery_model column already exists, skipping');
      return;
    }

    // Create enum type if it doesn't exist
    await sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE delivery_model_enum AS ENUM ('cod', 'contract');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Add column with default 'cod'
    await sequelize.query(`
      ALTER TABLE suppliers
      ADD COLUMN delivery_model delivery_model_enum NOT NULL DEFAULT 'cod'
    `);

    // Add index for filtering by delivery model
    await sequelize.query(`
      CREATE INDEX idx_suppliers_delivery_model ON suppliers(delivery_model)
    `);

    console.log('[Migration 056] Added delivery_model column to suppliers (default: cod)');
  },

  async down(sequelize) {
    await sequelize.query(`
      DROP INDEX IF EXISTS idx_suppliers_delivery_model
    `);

    await sequelize.query(`
      ALTER TABLE suppliers DROP COLUMN IF EXISTS delivery_model
    `);

    await sequelize.query(`
      DROP TYPE IF EXISTS delivery_model_enum
    `);

    console.log('[Migration 056] Removed delivery_model column');
  }
};
