// Supplier Price Model
// V1.5.0: Stores scraped and manually-added prices for suppliers
const { DataTypes } = require('sequelize');

let SupplierPrice;

const initSupplierPriceModel = (sequelize) => {
  if (!sequelize) {
    console.log('⚠️  No database connection - SupplierPrice model not initialized');
    return null;
  }

  try {
    SupplierPrice = sequelize.define('SupplierPrice', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      supplierId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'suppliers',
          key: 'id'
        }
      },
      pricePerGallon: {
        type: DataTypes.DECIMAL(5, 3),
        allowNull: false,
        validate: {
          min: 2.00,
          max: 5.00
        }
      },
      minGallons: {
        type: DataTypes.INTEGER,
        defaultValue: 150,
        comment: 'Minimum order gallons for this price tier'
      },
      fuelType: {
        type: DataTypes.ENUM('heating_oil'),
        defaultValue: 'heating_oil',
        comment: 'Only heating oil supported initially'
      },
      sourceType: {
        type: DataTypes.ENUM('scraped', 'manual', 'user_reported'),
        defaultValue: 'scraped',
        allowNull: false
      },
      sourceUrl: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: 'Website URL or source like "fuelsnap", "facebook"'
      },
      scrapedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: 'Price expires 24 hours after scraping'
      },
      isValid: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
      },
      notes: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: 'Admin notes or scrape error details'
      }
    }, {
      tableName: 'supplier_prices',
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ['supplier_id'] },
        { fields: ['scraped_at'] },
        { fields: ['expires_at'] },
        { fields: ['is_valid'] },
        { fields: ['source_type'] }
      ],
      hooks: {
        beforeValidate: (price) => {
          // Set expiresAt to 24 hours after scrapedAt if not set
          if (!price.expiresAt && price.scrapedAt) {
            price.expiresAt = new Date(new Date(price.scrapedAt).getTime() + 24 * 60 * 60 * 1000);
          }
        },
        beforeSave: (price) => {
          // Validate price range
          const priceVal = parseFloat(price.pricePerGallon);
          if (priceVal < 2.00 || priceVal > 5.00) {
            throw new Error(`Price $${priceVal} outside valid range ($2.00-$5.00)`);
          }
        }
      }
    });

    console.log('✅ SupplierPrice model initialized');
    return SupplierPrice;
  } catch (error) {
    console.error('❌ Failed to initialize SupplierPrice model:', error.message);
    return null;
  }
};

const getSupplierPriceModel = () => SupplierPrice;

// Helper function to get latest valid price for a supplier
const getLatestPrice = async (supplierId) => {
  if (!SupplierPrice) return null;

  try {
    const price = await SupplierPrice.findOne({
      where: {
        supplierId,
        isValid: true,
        expiresAt: { [require('sequelize').Op.gt]: new Date() }
      },
      order: [['scrapedAt', 'DESC']]
    });
    return price ? price.toJSON() : null;
  } catch (error) {
    console.error('Error getting latest price:', error.message);
    return null;
  }
};

// Helper function to get latest prices for multiple suppliers
const getLatestPrices = async (supplierIds) => {
  if (!SupplierPrice || !supplierIds || supplierIds.length === 0) return {};

  const { Op, fn, col } = require('sequelize');

  try {
    // Get all valid, non-expired prices
    const prices = await SupplierPrice.findAll({
      where: {
        supplierId: { [Op.in]: supplierIds },
        isValid: true,
        expiresAt: { [Op.gt]: new Date() }
      },
      order: [['scrapedAt', 'DESC']]
    });

    // Group by supplier, keep only the latest for each
    const priceMap = {};
    for (const price of prices) {
      const sid = price.supplierId;
      if (!priceMap[sid]) {
        priceMap[sid] = price.toJSON();
      }
    }

    return priceMap;
  } catch (error) {
    console.error('Error getting latest prices:', error.message);
    return {};
  }
};

module.exports = {
  initSupplierPriceModel,
  getSupplierPriceModel,
  getLatestPrice,
  getLatestPrices
};
