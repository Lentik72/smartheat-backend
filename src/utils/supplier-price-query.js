// src/utils/supplier-price-query.js
//
// Centralized where-clause builder for SupplierPrice reads.
//
// fuelType is REQUIRED. SupplierPrice.fuelType is an enum that mixes
// heating_oil, kerosene (and propane once heatingoil-lpc7 lands). Reading
// without the filter returns rows of every fuel for the matched suppliers,
// which is exactly the bug heatingoil-ryp3 fixes.
//
// Used by src/routes/intelligence.js. Future readers (AppPriceAlertService,
// supplier-facing dashboards) should reuse this so the filter stays
// consistent.

const { Op } = require('sequelize');

function buildScrapedPriceWhere({ supplierIds, fuelType, since }) {
  if (!fuelType) {
    throw new Error('buildScrapedPriceWhere: fuelType is required (no silent default)');
  }
  return {
    supplierId: { [Op.in]: supplierIds },
    fuelType,
    isValid: true,
    sourceType: { [Op.ne]: 'aggregator_signal' },
    scrapedAt: { [Op.gte]: since }
  };
}

module.exports = { buildScrapedPriceWhere };
