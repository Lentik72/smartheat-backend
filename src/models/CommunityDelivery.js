// Community Delivery Model
// V18.0: Community Benchmarking - Anonymous delivery price sharing
// V18.6: Added fullZipCode for distance-based community grouping
// V20.1: Added fuelType for propane/oil isolation
// V2.2.0: Added supplier tracking fields
const { DataTypes } = require('sequelize');

// V20.1: Valid fuel types
const FUEL_TYPES = ['heating_oil', 'propane'];
const DEFAULT_FUEL_TYPE = 'heating_oil';

let CommunityDelivery;

const initCommunityDeliveryModel = (sequelize) => {
  if (!sequelize) {
    console.log('⚠️  No database connection - CommunityDelivery model not initialized');
    return null;
  }

  try {
    CommunityDelivery = sequelize.define('CommunityDelivery', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      // Privacy: Only first 3 digits of ZIP (kept for backwards compatibility)
      zipPrefix: {
        type: DataTypes.STRING(3),
        allowNull: false,
        validate: {
          is: /^\d{3}$/
        }
      },
      // V18.6: Full 5-digit ZIP for distance-based queries
      // Used only for distance calculation, never exposed in responses
      fullZipCode: {
        type: DataTypes.STRING(5),
        allowNull: true, // Nullable for backwards compatibility with existing data
        validate: {
          is: /^\d{5}$/
        }
      },
      // V20.1: Fuel type for propane/oil isolation
      // Required for new submissions, defaults to heating_oil for existing data
      fuelType: {
        type: DataTypes.ENUM('heating_oil', 'propane'),
        allowNull: false,
        defaultValue: 'heating_oil'
      },
      // Rounded to nearest $0.05 for anonymization
      pricePerGallon: {
        type: DataTypes.DECIMAL(4, 2),
        allowNull: false,
        validate: {
          min: 1.00,
          max: 8.00
        }
      },
      // Month only (YYYY-MM format)
      deliveryMonth: {
        type: DataTypes.STRING(7),
        allowNull: false,
        validate: {
          is: /^\d{4}-\d{2}$/
        }
      },
      // Bucket: small (<100), medium (100-200), large (200-350), xlarge (350-500), bulk (>500)
      gallonsBucket: {
        type: DataTypes.ENUM('small', 'medium', 'large', 'xlarge', 'bulk'),
        allowNull: false
      },
      // Market price at time of submission (for validation)
      marketPriceAtTime: {
        type: DataTypes.DECIMAL(4, 2),
        allowNull: true
      },
      // Validation status
      validationStatus: {
        type: DataTypes.ENUM('valid', 'soft_excluded', 'rejected'),
        defaultValue: 'valid',
        allowNull: false
      },
      // Why rejected/excluded (if applicable)
      rejectionReason: {
        type: DataTypes.STRING(50),
        allowNull: true
      },
      // SHA256(deviceId + salt) - prevents flooding, can't identify user
      contributorHash: {
        type: DataTypes.STRING(64),
        allowNull: false
      },
      // 0.0-1.0, capped per contributor/month to prevent skewing
      contributionWeight: {
        type: DataTypes.DECIMAL(3, 2),
        defaultValue: 1.00,
        allowNull: false
      },
      // V2.2.0: Supplier tracking - which supplier user ordered from
      supplierName: {
        type: DataTypes.STRING(255),
        allowNull: true
      },
      // V2.2.0: UUID of supplier if from directory
      supplierId: {
        type: DataTypes.UUID,
        allowNull: true
      },
      // V2.2.0: Whether supplier was from our directory vs user-added
      isDirectorySupplier: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: true
      }
    }, {
      tableName: 'community_deliveries',
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ['zip_prefix'] },
        { fields: ['delivery_month'] },
        { fields: ['validation_status'] },
        { fields: ['gallons_bucket'] },
        { fields: ['contributor_hash'] },
        // V18.6: Index for full ZIP queries
        { fields: ['full_zip_code'] },
        // V20.1: Index for fuel type filtering
        { fields: ['fuel_type'] },
        // Composite index for common queries
        {
          name: 'community_deliveries_benchmark_idx',
          fields: ['zip_prefix', 'delivery_month', 'validation_status']
        },
        // V18.6: Composite index for distance-based queries
        {
          name: 'community_deliveries_distance_idx',
          fields: ['full_zip_code', 'delivery_month', 'validation_status']
        },
        // V20.1: Composite index for fuel-filtered queries
        {
          name: 'community_deliveries_fuel_benchmark_idx',
          fields: ['zip_prefix', 'fuel_type', 'delivery_month', 'validation_status']
        },
        // V2.2.0: Supplier tracking indexes
        { fields: ['supplier_name'] },
        { fields: ['is_directory_supplier'] }
      ]
    });

    console.log('✅ CommunityDelivery model initialized');
    return CommunityDelivery;
  } catch (error) {
    console.error('❌ Failed to initialize CommunityDelivery model:', error.message);
    return null;
  }
};

const getCommunityDeliveryModel = () => CommunityDelivery;

// Helper: Determine gallons bucket from exact gallons
const getGallonsBucket = (gallons) => {
  if (gallons < 100) return 'small';
  if (gallons < 200) return 'medium';
  if (gallons < 350) return 'large';
  if (gallons < 500) return 'xlarge';
  return 'bulk';
};

// Helper: Round price to nearest $0.05
const roundPrice = (price) => {
  return Math.round(price * 20) / 20;
};

// Helper: Get current month in YYYY-MM format
const getCurrentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

// Helper: Get previous month in YYYY-MM format
const getPreviousMonth = () => {
  const now = new Date();
  now.setMonth(now.getMonth() - 1);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

// Validation thresholds by bucket
const VALIDATION_THRESHOLDS = {
  small: { softExclude: 0.45, hardReject: 0.65 },
  medium: { softExclude: 0.40, hardReject: 0.60 },
  large: { softExclude: 0.40, hardReject: 0.60 },
  xlarge: { softExclude: 0.35, hardReject: 0.55 },
  bulk: { softExclude: 0.35, hardReject: 0.55 }
};

module.exports = {
  initCommunityDeliveryModel,
  getCommunityDeliveryModel,
  getGallonsBucket,
  roundPrice,
  getCurrentMonth,
  getPreviousMonth,
  VALIDATION_THRESHOLDS,
  // V20.1: Fuel type exports
  FUEL_TYPES,
  DEFAULT_FUEL_TYPE
};
