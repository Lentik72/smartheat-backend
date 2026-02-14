// CommunityDeliveryRaw Model
// V2.3.1: Telemetry Hard Wall - Exact data storage for internal analytics
// This table stores exact delivery data (price, gallons, timestamp, full ZIP)
// while community_deliveries stores only anonymized data for public display.
//
// HARD WALL ENFORCEMENT:
// - No FK to users table (identity zone)
// - Links only to community_deliveries via delivery_id
// - NEVER exposed via public API endpoints
// - Admin endpoints return aggregates only, never raw records
const { DataTypes } = require('sequelize');

let CommunityDeliveryRaw;

const initCommunityDeliveryRawModel = (sequelize, CommunityDelivery) => {
  if (!sequelize) {
    console.log('  No database connection - CommunityDeliveryRaw model not initialized');
    return null;
  }

  try {
    CommunityDeliveryRaw = sequelize.define('CommunityDeliveryRaw', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      // FK to community_deliveries - CASCADE delete ensures no orphans
      deliveryId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'community_deliveries',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      // Exact price (not rounded) - for price elasticity analysis
      exactPrice: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        validate: {
          min: 1.00,
          max: 8.00
        }
      },
      // Exact gallons (not bucketed) - for tank capacity inference
      exactGallons: {
        type: DataTypes.DECIMAL(6, 1),
        allowNull: false,
        validate: {
          min: 1
        }
      },
      // Exact timestamp - for delivery interval modeling
      exactTimestamp: {
        type: DataTypes.DATE,
        allowNull: false
      },
      // Full 5-digit ZIP - for regional price analysis
      // This is the ONLY place full ZIP is stored for v2.3.1+ submissions
      fullZipCode: {
        type: DataTypes.STRING(5),
        allowNull: false,
        validate: {
          is: /^\d{5}$/
        }
      }
    }, {
      tableName: 'community_deliveries_raw',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: false,  // No updates - immutable telemetry
      underscored: true,
      indexes: [
        // FK lookup for joins
        {
          name: 'idx_raw_delivery_id',
          fields: ['delivery_id']
        },
        // ZIP-based regional analysis
        {
          name: 'idx_raw_zip',
          fields: ['full_zip_code']
        },
        // Time-series queries
        {
          name: 'idx_raw_timestamp',
          fields: ['exact_timestamp']
        },
        // Composite for ZIP + time analysis (future scaling)
        {
          name: 'idx_raw_zip_timestamp',
          fields: ['full_zip_code', 'exact_timestamp']
        }
      ]
    });

    // Define association with CommunityDelivery
    if (CommunityDelivery) {
      CommunityDeliveryRaw.belongsTo(CommunityDelivery, {
        foreignKey: 'deliveryId',
        as: 'delivery'
      });
      CommunityDelivery.hasOne(CommunityDeliveryRaw, {
        foreignKey: 'deliveryId',
        as: 'rawData'
      });
    }

    console.log('  CommunityDeliveryRaw model initialized');
    return CommunityDeliveryRaw;
  } catch (error) {
    console.error('  Failed to initialize CommunityDeliveryRaw model:', error.message);
    return null;
  }
};

const getCommunityDeliveryRawModel = () => CommunityDeliveryRaw;

module.exports = {
  initCommunityDeliveryRawModel,
  getCommunityDeliveryRawModel
};
