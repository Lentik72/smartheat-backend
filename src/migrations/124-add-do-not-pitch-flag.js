/**
 * Migration 124: Add do_not_pitch flag to suppliers table
 *
 * Suppliers managed by third-party platforms (e.g., Droplet Fuel) will never
 * claim listings — they already have ordering infrastructure. Mark them so
 * outreach scripts (claim-targets.js) automatically exclude them.
 */

module.exports = {
  name: '124-add-do-not-pitch-flag',

  async up(sequelize) {
    // Check if column already exists (idempotent)
    const [cols] = await sequelize.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'suppliers' AND column_name = 'do_not_pitch'
    `);

    if (cols.length === 0) {
      await sequelize.query(`
        ALTER TABLE suppliers ADD COLUMN do_not_pitch BOOLEAN DEFAULT false
      `);
      console.log('[Migration 124] Added do_not_pitch column to suppliers');
    } else {
      console.log('[Migration 124] do_not_pitch column already exists — skipping');
    }
  },

  async down(sequelize) {
    await sequelize.query(`ALTER TABLE suppliers DROP COLUMN IF EXISTS do_not_pitch`);
    console.log('[Migration 124] Dropped do_not_pitch column');
  }
};
