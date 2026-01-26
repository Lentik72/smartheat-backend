/**
 * Migration 012: Add stale reminder tracking for claimed suppliers
 * V1.0.0: Track when we last sent a "your price is stale" reminder
 */

const { Sequelize } = require('sequelize');

async function up(sequelize) {
  console.log('[Migration 012] Adding last_stale_reminder_at to suppliers...');

  try {
    // Check if column already exists
    const [columns] = await sequelize.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'suppliers'
      AND column_name = 'last_stale_reminder_at'
    `);

    if (columns.length === 0) {
      await sequelize.query(`
        ALTER TABLE suppliers
        ADD COLUMN last_stale_reminder_at TIMESTAMP
      `);
      console.log('[Migration 012] Added last_stale_reminder_at column');
    } else {
      console.log('[Migration 012] last_stale_reminder_at column already exists');
    }

    console.log('[Migration 012] Complete');
  } catch (error) {
    console.error('[Migration 012] Error:', error.message);
    throw error;
  }
}

async function down(sequelize) {
  await sequelize.query(`
    ALTER TABLE suppliers
    DROP COLUMN IF EXISTS last_stale_reminder_at
  `);
}

module.exports = { up, down };
