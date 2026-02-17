/**
 * ZipCurrentStats Model
 *
 * Latest snapshot of price intelligence per ZIP prefix and fuel type.
 * Denormalized for read performance - updated by nightly compute job.
 */

const { DataTypes } = require('sequelize');

let ZipCurrentStats;

const initZipCurrentStatsModel = (sequelize) => {
  if (!sequelize) {
    console.log('⚠️  No database connection - ZipCurrentStats model not initialized');
    return null;
  }

  try {
    ZipCurrentStats = sequelize.define('ZipCurrentStats', {
      // Composite primary key fields
      zipPrefix: {
        type: DataTypes.STRING(3),
        primaryKey: true,
        field: 'zip_prefix'
      },
      fuelType: {
        type: DataTypes.STRING(20),
        primaryKey: true,
        defaultValue: 'heating_oil',
        field: 'fuel_type'
      },

      // Region metadata (denormalized)
      regionName: {
        type: DataTypes.STRING(100),
        field: 'region_name'
      },
      cities: {
        type: DataTypes.JSONB,
        defaultValue: []
      },

      // Current price metrics
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

      // Trend metrics
      weeksAvailable: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        field: 'weeks_available'
      },
      percentChange6w: {
        type: DataTypes.DECIMAL(5, 2),
        field: 'percent_change_6w'
      },
      firstWeekPrice: {
        type: DataTypes.DECIMAL(5, 3),
        field: 'first_week_price'
      },
      latestWeekPrice: {
        type: DataTypes.DECIMAL(5, 3),
        field: 'latest_week_price'
      },

      // Community metrics
      userCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        field: 'user_count'
      },
      deliveryCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        field: 'delivery_count'
      },
      showUserCount: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'show_user_count'
      },
      showDeliveryCount: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'show_delivery_count'
      },

      // Data quality
      dataQualityScore: {
        type: DataTypes.DECIMAL(3, 2),
        defaultValue: 0.00,
        field: 'data_quality_score'
      },

      // Freshness tracking
      lastScrapeAt: {
        type: DataTypes.DATE,
        field: 'last_scrape_at'
      },
      updatedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        field: 'updated_at'
      }
    }, {
      tableName: 'zip_current_stats',
      timestamps: false,
      indexes: [
        { fields: ['zip_prefix', 'fuel_type'] },
        { fields: ['data_quality_score'] },
        { fields: ['region_name'] }
      ]
    });

    console.log('✅ ZipCurrentStats model initialized');
    return ZipCurrentStats;
  } catch (error) {
    console.error('❌ Failed to initialize ZipCurrentStats model:', error.message);
    return null;
  }
};

const getZipCurrentStatsModel = () => ZipCurrentStats;

module.exports = { initZipCurrentStatsModel, getZipCurrentStatsModel };
