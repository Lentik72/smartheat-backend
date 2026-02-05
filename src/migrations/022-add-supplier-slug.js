'use strict';

/**
 * Migration: Add slug column to suppliers table
 * For SEO-friendly supplier profile pages at /supplier/{slug}
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add slug column
    await queryInterface.addColumn('suppliers', 'slug', {
      type: Sequelize.STRING(150),
      allowNull: true,
      unique: true
    });

    // Add claimed_at column to track when supplier claimed their listing
    await queryInterface.addColumn('suppliers', 'claimed_at', {
      type: Sequelize.DATE,
      allowNull: true
    });

    // Generate slugs for existing suppliers
    const [suppliers] = await queryInterface.sequelize.query(
      `SELECT id, name FROM suppliers WHERE slug IS NULL`
    );

    for (const supplier of suppliers) {
      // Generate slug from name
      let slug = supplier.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

      // Handle duplicates by appending number
      let finalSlug = slug;
      let counter = 1;

      while (true) {
        const [existing] = await queryInterface.sequelize.query(
          `SELECT id FROM suppliers WHERE slug = '${finalSlug}' AND id != '${supplier.id}'`
        );
        if (existing.length === 0) break;
        finalSlug = `${slug}-${counter}`;
        counter++;
      }

      await queryInterface.sequelize.query(
        `UPDATE suppliers SET slug = '${finalSlug}' WHERE id = '${supplier.id}'`
      );
    }

    // Create index for faster lookups
    await queryInterface.addIndex('suppliers', ['slug'], {
      name: 'idx_suppliers_slug',
      unique: true
    });

    console.log('✅ Added slug column and generated slugs for all suppliers');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex('suppliers', 'idx_suppliers_slug');
    await queryInterface.removeColumn('suppliers', 'claimed_at');
    await queryInterface.removeColumn('suppliers', 'slug');
  }
};
