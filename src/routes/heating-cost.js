/**
 * Heating Cost API
 * V1.0.0: Multi-fuel cost comparison endpoint
 *
 * GET /api/v1/heating-cost?zip=10549
 *
 * Returns all fuel costs for a ZIP code: median oil price (from scraped data),
 * state electricity/gas rates (from EIA), county HDD (from NOAA),
 * and estimated annual/monthly costs per fuel type.
 *
 * Powers: calculator page, comparison articles, iOS app, generated pages.
 */

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');

const { FUELS, costPerMMBTU, annualHeatingCost, monthlyHeatingCost, paybackYears, fuelKeys } = require('../data/fuel-config');
const { getElectricRate, getGasRate, getHDD } = require('../data/energy-rates');
const { getZipInfo } = require('../services/supplierMatcher');

const heatingCostLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 120,
  message: { error: 'Too many requests', retryAfter: '1 hour' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(heatingCostLimit);

/**
 * GET /api/v1/heating-cost?zip=10549
 *
 * Response:
 * {
 *   zip, county, state, hdd,
 *   fuels: { 'heating-oil': { price, annualCost, monthlyCost, costPerMMBTU }, ... },
 *   cheapest, payback: { from, to, years }
 * }
 */
router.get('/', async (req, res) => {
  const { zip } = req.query;
  const sequelize = req.app.locals.sequelize;
  const logger = req.app.locals.logger || console;

  if (!zip || !/^\d{5}$/.test(zip)) {
    return res.status(400).json({ error: 'Valid 5-digit ZIP code required', param: 'zip' });
  }

  const zipInfo = getZipInfo(zip);
  if (!zipInfo) {
    return res.status(404).json({ error: 'ZIP code not found', zip });
  }

  const { county, state } = zipInfo;
  const prefix = zip.substring(0, 3);

  try {
    // Get local oil median from pre-computed stats
    let oilPrice = null;
    if (sequelize) {
      const [stats] = await sequelize.query(`
        SELECT median_price
        FROM zip_current_stats
        WHERE zip_prefix = :prefix AND fuel_type = 'heating_oil'
      `, {
        replacements: { prefix },
        type: sequelize.QueryTypes.SELECT,
      });
      if (stats && stats.median_price) {
        oilPrice = parseFloat(stats.median_price);
      }
    }

    // Energy rates + HDD
    const electric = getElectricRate({ zip, state });
    const gas = getGasRate({ zip, state });
    const hddResult = getHDD({ state, county });
    const hdd = hddResult.hdd;

    // Build price map for all fuels we have data for
    const prices = {};
    if (oilPrice) prices['heating-oil'] = oilPrice;
    prices['propane'] = null; // Future: from scraped data
    prices['heat-pump'] = electric.rate;
    prices['natural-gas'] = gas.rate;
    prices['electric-baseboard'] = electric.rate;

    // Compute costs for each fuel
    const fuels = {};
    for (const key of fuelKeys()) {
      const price = prices[key];
      if (price === null || price === undefined) continue;

      try {
        const perMMBTU = costPerMMBTU(key, price);
        const annual = annualHeatingCost(key, price, hdd);
        const monthly = monthlyHeatingCost(key, price, hdd);

        fuels[key] = {
          label: FUELS[key].label,
          price: round2(price),
          unit: FUELS[key].unit,
          annualCost: Math.round(annual),
          monthlyCost: Math.round(monthly),
          costPerMMBTU: round2(perMMBTU),
        };
      } catch (e) {
        logger.warn(`[heating-cost] Skipping ${key}: ${e.message}`);
      }
    }

    // Find cheapest fuel
    const ranked = Object.entries(fuels).sort((a, b) => a[1].annualCost - b[1].annualCost);
    const cheapest = ranked.length > 0 ? ranked[0][0] : null;

    // Payback: oil → heat pump (most common comparison)
    let payback = null;
    if (fuels['heating-oil'] && fuels['heat-pump']) {
      const years = paybackYears('heating-oil', 'heat-pump', {
        'heating-oil': prices['heating-oil'],
        'heat-pump': prices['heat-pump'],
      }, hdd);
      if (years !== null) {
        payback = {
          from: 'heating-oil',
          to: 'heat-pump',
          years: round1(years),
        };
      }
    }

    res.json({
      zip,
      county,
      state,
      hdd,
      hddSource: hddResult.source,
      fuels,
      cheapest,
      payback,
    });
  } catch (error) {
    logger.error(`[heating-cost] Error for ZIP ${zip}:`, error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function round2(n) { return Math.round(n * 100) / 100; }
function round1(n) { return Math.round(n * 10) / 10; }

module.exports = router;
