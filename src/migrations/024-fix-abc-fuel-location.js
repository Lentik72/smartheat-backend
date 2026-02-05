/**
 * Migration 024: Fix ABC Fuel Oil location data
 * Updates missing city/state for ABC Fuel Oil (Brookfield, CT)
 */

module.exports = {
  name: '024-fix-abc-fuel-location',

  async up(sequelize) {
    await sequelize.query(`
      UPDATE suppliers
      SET city = 'Brookfield',
          state = 'CT',
          updated_at = NOW()
      WHERE id = '3d17b906-9f1a-414f-93a5-e4070eac0dd3'
        AND (city IS NULL OR state IS NULL)
    `);

    console.log('[Migration 024] Updated ABC Fuel Oil: city=Brookfield, state=CT');
  },

  async down(sequelize) {
    // Revert to NULL (original state)
    await sequelize.query(`
      UPDATE suppliers
      SET city = NULL,
          state = NULL,
          updated_at = NOW()
      WHERE id = '3d17b906-9f1a-414f-93a5-e4070eac0dd3'
    `);
  }
};
