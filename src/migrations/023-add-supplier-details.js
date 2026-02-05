/**
 * Migration: Add supplier detail fields
 *
 * Adds fields for:
 * - minimum_gallons: Minimum delivery amount
 * - payment_methods: Accepted payment types (JSONB array)
 * - fuel_types: Types of fuel offered (JSONB array)
 * - senior_discount: Whether senior discounts are offered
 *
 * These fields are stored for all suppliers but only displayed
 * in the UI when supplier has claimed their listing (claimed_at IS NOT NULL)
 */

async function up(queryInterface, Sequelize) {
  const transaction = await queryInterface.sequelize.transaction();

  try {
    // Check which columns already exist
    const [columns] = await queryInterface.sequelize.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'suppliers'
    `, { transaction });

    const existingColumns = columns.map(c => c.column_name);

    // Add minimum_gallons
    if (!existingColumns.includes('minimum_gallons')) {
      await queryInterface.addColumn('suppliers', 'minimum_gallons', {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Minimum delivery amount in gallons (e.g., 100, 150)'
      }, { transaction });
      console.log('  Added minimum_gallons column');
    }

    // Add payment_methods (JSONB array)
    if (!existingColumns.includes('payment_methods')) {
      await queryInterface.addColumn('suppliers', 'payment_methods', {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: 'Accepted payment types: cash, check, credit_card, debit_card'
      }, { transaction });
      console.log('  Added payment_methods column');
    }

    // Add fuel_types (JSONB array)
    if (!existingColumns.includes('fuel_types')) {
      await queryInterface.addColumn('suppliers', 'fuel_types', {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: ['oil'],
        comment: 'Fuel types offered: oil, kerosene, diesel, propane'
      }, { transaction });
      console.log('  Added fuel_types column');
    }

    // Add senior_discount
    if (!existingColumns.includes('senior_discount')) {
      await queryInterface.addColumn('suppliers', 'senior_discount', {
        type: Sequelize.STRING(10),
        allowNull: true,
        defaultValue: 'unknown',
        comment: 'Senior discount available: yes, no, unknown'
      }, { transaction });
      console.log('  Added senior_discount column');
    }

    await transaction.commit();
    console.log('✅ Migration 023 complete: supplier detail fields added');

  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function down(queryInterface, Sequelize) {
  const transaction = await queryInterface.sequelize.transaction();

  try {
    await queryInterface.removeColumn('suppliers', 'minimum_gallons', { transaction });
    await queryInterface.removeColumn('suppliers', 'payment_methods', { transaction });
    await queryInterface.removeColumn('suppliers', 'fuel_types', { transaction });
    await queryInterface.removeColumn('suppliers', 'senior_discount', { transaction });

    await transaction.commit();
    console.log('✅ Migration 023 rolled back');

  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

module.exports = { up, down };
