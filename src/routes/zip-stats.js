/**
 * ZIP Stats API Routes
 * V2.32.0: Pre-computed ZIP-level price intelligence
 *
 * Endpoints:
 * - GET /api/zip/:prefix/stats - Get current stats and history for a ZIP prefix
 */

const express = require('express');
const router = express.Router();

/**
 * GET /api/zip/:prefix/stats
 *
 * Returns pre-computed price statistics for a 3-digit ZIP prefix.
 * Data is updated nightly after price scraping completes.
 *
 * Response:
 * {
 *   zip_prefix: "105",
 *   region_name: "Westchester County, NY",
 *   current: { median_price, min_price, max_price, supplier_count, updated_at },
 *   trend: { weeks_available, percent_change_6w, first_week_price, latest_week_price },
 *   history: [{ week, median, suppliers }, ...],
 *   market: { users, deliveries, show_user_count, show_delivery_count },
 *   data_quality_score: 0.85
 * }
 */
router.get('/:prefix/stats', async (req, res) => {
  const sequelize = req.app.locals.sequelize;
  const logger = req.app.locals.logger || console;

  const { prefix } = req.params;
  const fuelType = req.query.fuel_type || 'heating_oil';

  // Validate prefix
  if (!prefix || !/^\d{3}$/.test(prefix)) {
    return res.status(400).json({
      error: 'Invalid ZIP prefix',
      hint: 'ZIP prefix must be exactly 3 digits (e.g., 105)'
    });
  }

  try {
    // Get current stats
    const [currentStats] = await sequelize.query(`
      SELECT *
      FROM zip_current_stats
      WHERE zip_prefix = :prefix AND fuel_type = :fuelType
    `, {
      replacements: { prefix, fuelType },
      type: sequelize.QueryTypes.SELECT
    });

    if (!currentStats) {
      return res.status(404).json({
        error: 'No data available',
        zip_prefix: prefix,
        fuel_type: fuelType,
        hint: 'This ZIP prefix may not have enough supplier coverage yet'
      });
    }

    // Get historical data
    const history = await sequelize.query(`
      SELECT
        week_start as week,
        median_price as median,
        min_price,
        max_price,
        supplier_count as suppliers,
        data_points
      FROM zip_price_stats
      WHERE zip_prefix = :prefix AND fuel_type = :fuelType
      ORDER BY week_start DESC
      LIMIT 12
    `, {
      replacements: { prefix, fuelType },
      type: sequelize.QueryTypes.SELECT
    });

    // Format response
    const response = {
      zip_prefix: currentStats.zip_prefix,
      fuel_type: currentStats.fuel_type,
      region_name: currentStats.region_name,
      cities: currentStats.cities || [],

      current: {
        median_price: parseFloat(currentStats.median_price) || null,
        min_price: parseFloat(currentStats.min_price) || null,
        max_price: parseFloat(currentStats.max_price) || null,
        supplier_count: currentStats.supplier_count || 0,
        updated_at: currentStats.last_scrape_at || currentStats.updated_at
      },

      trend: {
        weeks_available: currentStats.weeks_available || 0,
        percent_change_6w: currentStats.percent_change_6w
          ? parseFloat(currentStats.percent_change_6w)
          : null,
        first_week_price: parseFloat(currentStats.first_week_price) || null,
        latest_week_price: parseFloat(currentStats.latest_week_price) || null
      },

      history: history.map(h => ({
        week: h.week,
        median: parseFloat(h.median) || null,
        min: parseFloat(h.min_price) || null,
        max: parseFloat(h.max_price) || null,
        suppliers: h.suppliers || 0,
        data_points: h.data_points || 0
      })),

      market: {
        user_count: currentStats.show_user_count ? currentStats.user_count : null,
        delivery_count: currentStats.show_delivery_count ? currentStats.delivery_count : null,
        show_user_count: currentStats.show_user_count,
        show_delivery_count: currentStats.show_delivery_count
      },

      data_quality_score: parseFloat(currentStats.data_quality_score) || 0
    };

    // Cache for 1 hour (data only changes daily)
    res.set('Cache-Control', 'public, max-age=3600');
    res.json(response);

  } catch (error) {
    logger.error('[ZipStats] Error fetching stats:', error.message);
    res.status(500).json({
      error: 'Failed to fetch ZIP statistics',
      message: error.message
    });
  }
});

/**
 * GET /api/zip/available
 *
 * Returns list of ZIP prefixes with available data.
 * Useful for generating sitemap or directory pages.
 */
router.get('/available', async (req, res) => {
  const sequelize = req.app.locals.sequelize;
  const fuelType = req.query.fuel_type || 'heating_oil';
  const minQuality = parseFloat(req.query.min_quality) || 0;

  try {
    const prefixes = await sequelize.query(`
      SELECT
        zip_prefix,
        fuel_type,
        region_name,
        supplier_count,
        data_quality_score
      FROM zip_current_stats
      WHERE fuel_type = :fuelType
        AND data_quality_score >= :minQuality
      ORDER BY data_quality_score DESC, supplier_count DESC
    `, {
      replacements: { fuelType, minQuality },
      type: sequelize.QueryTypes.SELECT
    });

    res.set('Cache-Control', 'public, max-age=3600');
    res.json({
      count: prefixes.length,
      fuel_type: fuelType,
      prefixes
    });

  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch available prefixes' });
  }
});

module.exports = router;
