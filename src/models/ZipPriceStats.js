/**
 * ZipPriceStats Model
 *
 * Weekly historical price aggregates per ZIP prefix and fuel type.
 * Append-only table for trend analysis and historical charts.
 */

const { DataTypes } = require('sequelize');

let ZipPriceStats;

const initZipPriceStatsModel = (sequelize) => {
  if (!sequelize) {
    console.log('⚠️  No database connection - ZipPriceStats model not initialized');
    return null;
  }

  try {
    ZipPriceStats = sequelize.define('ZipPriceStats', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      zipPrefix: {
        type: DataTypes.STRING(3),
        allowNull: false,
        field: 'zip_prefix'
      },
      fuelType: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'heating_oil',
        field: 'fuel_type'
      },
      weekStart: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        field: 'week_start'
      },
      medianPrice: {
        type: DataTypes.DECIMAL(5, 3),
        field: 'median_price'
      },
      minPrice: {
        type: DataTypes.DECIMAL(5, 3),
        field: 'min_price'
      },
      maxPrice: {
        type: DataTypes.DECIMAL(5, 3),
        field: 'max_price'
      },
      supplierCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        field: 'supplier_count'
      },
      dataPoints: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        field: 'data_points'
      },
      computedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        field: 'computed_at'
      }
    }, {
      tableName: 'zip_price_stats',
      timestamps: false,
      indexes: [
        {
          unique: true,
          fields: ['zip_prefix', 'week_start', 'fuel_type']
        }
      ]
    });

    console.log('✅ ZipPriceStats model initialized');
    return ZipPriceStats;
  } catch (error) {
    console.error('❌ Failed to initialize ZipPriceStats model:', error.message);
    return null;
  }
};

const getZipPriceStatsModel = () => ZipPriceStats;

module.exports = { initZipPriceStatsModel, getZipPriceStatsModel };
