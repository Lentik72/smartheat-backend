// Supplier Directory Model
// V1.4.0: Added serviceCities, lat, lng for unified matching
// V1.5.0: Added allowPriceDisplay for price scraping opt-out
const { DataTypes } = require('sequelize');

let Supplier;

const initSupplierModel = (sequelize) => {
  if (!sequelize) {
    console.log('⚠️  No database connection - Supplier model not initialized');
    return null;
  }

  try {
    Supplier = sequelize.define('Supplier', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      name: {
        type: DataTypes.STRING(100),
        allowNull: false
      },
      phone: {
        type: DataTypes.STRING(20),
        allowNull: true
      },
      email: {
        type: DataTypes.STRING(255),
        allowNull: true
      },
      website: {
        type: DataTypes.STRING(255),
        allowNull: true
      },
      addressLine1: {
        type: DataTypes.STRING(255),
        allowNull: true
      },
      city: {
        type: DataTypes.STRING(100),
        allowNull: true
      },
      state: {
        type: DataTypes.STRING(2),
        allowNull: true
      },
      // Array of ZIP codes this supplier serves
      postalCodesServed: {
        type: DataTypes.JSONB,
        defaultValue: [],
        allowNull: false
      },
      // Array of counties this supplier serves (for broader matching)
      serviceCounties: {
        type: DataTypes.JSONB,
        defaultValue: [],
        allowNull: true
      },
      // Array of cities this supplier serves (for city matching)
      serviceCities: {
        type: DataTypes.JSONB,
        defaultValue: [],
        allowNull: true
      },
      serviceAreaRadius: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      // Coordinates for radius matching (backend only)
      lat: {
        type: DataTypes.DECIMAL(10, 7),
        allowNull: true
      },
      lng: {
        type: DataTypes.DECIMAL(10, 7),
        allowNull: true
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      // Admin fields
      active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
      },
      verified: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      },
      // Tracking
      source: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: 'Where this supplier data came from (manual, user_submitted, web_scrape)'
      },
      // V1.5.0: Price display opt-out
      allowPriceDisplay: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: 'If false, supplier has opted out of price display'
      }
    }, {
      tableName: 'suppliers',
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ['active'] },
        { fields: ['state'] },
        { fields: ['city'] },
        { fields: ['verified'] },
        {
          name: 'suppliers_postal_codes_gin',
          fields: ['postal_codes_served'],  // Use snake_case (underscored: true)
          using: 'GIN'
        },
        {
          name: 'suppliers_service_counties_gin',
          fields: ['service_counties'],  // Use snake_case (underscored: true)
          using: 'GIN'
        },
        {
          name: 'suppliers_service_cities_gin',
          fields: ['service_cities'],  // Use snake_case (underscored: true)
          using: 'GIN'
        }
      ]
    });

    console.log('✅ Supplier model initialized');
    return Supplier;
  } catch (error) {
    console.error('❌ Failed to initialize Supplier model:', error.message);
    return null;
  }
};

const getSupplierModel = () => Supplier;

module.exports = { initSupplierModel, getSupplierModel };
