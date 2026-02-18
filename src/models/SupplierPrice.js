// Supplier Price Model
// V1.5.0: Stores scraped and manually-added prices for suppliers
const { DataTypes } = require('sequelize');

let SupplierPrice;

const initSupplierPriceModel = (sequelize) => {
  console.log('[SupplierPrice] initSupplierPriceModel called, sequelize:', !!sequelize);
  if (!sequelize) {
    console.log('⚠️  No database connection - SupplierPrice model not initialized');
    return null;
  }

  try {
    console.log('[SupplierPrice] Defining model...');
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
          min: 1.50,
          max: 8.00
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
        type: DataTypes.ENUM('scraped', 'manual', 'user_reported', 'aggregator_signal', 'supplier_sms', 'supplier_direct'),
        defaultValue: 'scraped',
        allowNull: false,
        comment: 'aggregator_signal prices are for market signals only, never displayed'
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
          if (priceVal < 1.50 || priceVal > 8.00) {
            throw new Error(`Price $${priceVal} outside valid range ($1.50-$8.00)`);
          }
        }
      }
    });

    console.log('✅ SupplierPrice model initialized, SupplierPrice:', !!SupplierPrice);
    return SupplierPrice;
  } catch (error) {
    console.error('❌ Failed to initialize SupplierPrice model:', error.message);
    return null;
  }
};

const getSupplierPriceModel = () => SupplierPrice;

// Helper function to get latest valid price for a supplier
// V2.1.0: Excludes aggregator_signal prices (those are for market intelligence only)
const getLatestPrice = async (supplierId) => {
  if (!SupplierPrice) return null;

  const { Op } = require('sequelize');

  try {
    const price = await SupplierPrice.findOne({
      where: {
        supplierId,
        isValid: true,
        expiresAt: { [Op.gt]: new Date() },
        // V2.1.0: Never show aggregator prices to users
        sourceType: { [Op.ne]: 'aggregator_signal' }
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
// V2.1.0: Excludes aggregator_signal prices (those are for market intelligence only)
// V2.35.15: Auto-heal expired prices if recent scrapes exist
const getLatestPrices = async (supplierIds) => {
  console.log('[getLatestPrices] SupplierPrice defined:', !!SupplierPrice);
  console.log('[getLatestPrices] supplierIds:', supplierIds?.length);
  if (!SupplierPrice || !supplierIds || supplierIds.length === 0) return {};

  const { Op } = require('sequelize');

  try {
    // Get all valid, non-expired prices (excluding aggregator signals)
    let prices = await SupplierPrice.findAll({
      where: {
        supplierId: { [Op.in]: supplierIds },
        isValid: true,
        expiresAt: { [Op.gt]: new Date() },
        // V2.1.0: Never show aggregator prices to users
        sourceType: { [Op.ne]: 'aggregator_signal' }
      },
      order: [['scrapedAt', 'DESC']]
    });

    // V2.35.15: Auto-heal if no valid prices but recent scrapes exist
    if (prices.length === 0) {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      // Check if there are expired but recently scraped prices
      const expiredPrices = await SupplierPrice.findAll({
        where: {
          supplierId: { [Op.in]: supplierIds },
          isValid: true,
          scrapedAt: { [Op.gte]: sevenDaysAgo },
          expiresAt: { [Op.lte]: new Date() },
          sourceType: { [Op.ne]: 'aggregator_signal' }
        },
        order: [['scrapedAt', 'DESC']]
      });

      if (expiredPrices.length > 0) {
        console.log(`[SupplierPrice] Auto-healing ${expiredPrices.length} expired prices`);

        // Extend expiration for these prices
        const expiredIds = expiredPrices.map(p => p.id);
        await SupplierPrice.update(
          { expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000) },
          { where: { id: { [Op.in]: expiredIds } } }
        );

        // Re-fetch the now-valid prices
        prices = await SupplierPrice.findAll({
          where: {
            supplierId: { [Op.in]: supplierIds },
            isValid: true,
            expiresAt: { [Op.gt]: new Date() },
            sourceType: { [Op.ne]: 'aggregator_signal' }
          },
          order: [['scrapedAt', 'DESC']]
        });
      }
    }

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

// V2.1.0: Get ALL prices including aggregator signals (for market intelligence only)
// This function should NEVER be used for user-facing endpoints
const getAllPricesForSignals = async (options = {}) => {
  if (!SupplierPrice) return [];

  const { Op } = require('sequelize');
  const {
    sourceTypes = ['scraped', 'aggregator_signal'],
    lookbackHours = 168 // 7 days default
  } = options;

  try {
    const cutoffDate = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);

    const prices = await SupplierPrice.findAll({
      where: {
        isValid: true,
        scrapedAt: { [Op.gte]: cutoffDate },
        sourceType: { [Op.in]: sourceTypes }
      },
      order: [['scrapedAt', 'DESC']]
    });

    return prices.map(p => p.toJSON());
  } catch (error) {
    console.error('Error getting prices for signals:', error.message);
    return [];
  }
};

module.exports = {
  initSupplierPriceModel,
  getSupplierPriceModel,
  getLatestPrice,
  getLatestPrices,
  getAllPricesForSignals // V2.1.0: For market intelligence service only
};
