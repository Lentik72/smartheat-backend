/**
 * Migration 059: Add County Price Stats Tables
 *
 * Creates county-level aggregation layer for price intelligence.
 * Aggregates from raw supplier_prices via zip_to_county mapping.
 *
 * Architecture:
 * - county_price_stats: Weekly historical aggregates by county
 * - county_current_stats: Latest snapshot per county (read-optimized)
 *
 * Key difference from ZIP stats:
 * - Aggregates across multiple ZIP prefixes
 * - Uses zip_to_county for geographic accuracy
 * - Higher supplier counts = higher confidence
 */

module.exports = {
  name: '059-add-county-price-stats-tables',

  async up(sequelize) {
    // Check if tables already exist
    const [results] = await sequelize.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('county_price_stats', 'county_current_stats')
    `);
    const existingTables = results || [];

    if (existingTables.length > 0) {
      console.log('[Migration 059] County stats tables already exist, skipping creation');
      return;
    }

    // ============================================
    // Table 1: county_price_stats (Weekly Historical)
    // ============================================
    await sequelize.query(`
      CREATE TABLE county_price_stats (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

        -- Composite key fields
        county_name VARCHAR(100) NOT NULL,
        state_code VARCHAR(2) NOT NULL,
        fuel_type VARCHAR(20) NOT NULL DEFAULT 'heating_oil',
        week_start DATE NOT NULL,

        -- Price metrics (computed from raw supplier_prices)
        median_price DECIMAL(5,3),
        min_price DECIMAL(5,3),
        max_price DECIMAL(5,3),
        avg_price DECIMAL(5,3),

        -- Volume metrics
        supplier_count INTEGER NOT NULL DEFAULT 0,
        data_points INTEGER NOT NULL DEFAULT 0,
        zip_count INTEGER NOT NULL DEFAULT 0,

        -- Metadata
        computed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

        -- Composite uniqueness
        UNIQUE(county_name, state_code, week_start, fuel_type)
      )
    `);

    // Indexes for county_price_stats
    await sequelize.query(`
      CREATE INDEX idx_county_price_stats_county_state_week
      ON county_price_stats(county_name, state_code, fuel_type, week_start DESC)
    `);

    await sequelize.query(`
      CREATE INDEX idx_county_price_stats_week
      ON county_price_stats(week_start DESC)
    `);

    console.log('[Migration 059] Created county_price_stats table');

    // ============================================
    // Table 2: county_current_stats (Latest Snapshot)
    // ============================================
    await sequelize.query(`
      CREATE TABLE county_current_stats (
        -- Composite primary key
        county_name VARCHAR(100) NOT NULL,
        state_code VARCHAR(2) NOT NULL,
        fuel_type VARCHAR(20) NOT NULL DEFAULT 'heating_oil',

        -- Current price metrics
        median_price DECIMAL(5,3),
        min_price DECIMAL(5,3),
        max_price DECIMAL(5,3),
        avg_price DECIMAL(5,3),
        supplier_count INTEGER NOT NULL DEFAULT 0,
        zip_count INTEGER NOT NULL DEFAULT 0,

        -- Trend metrics (pre-computed)
        weeks_available INTEGER NOT NULL DEFAULT 0,
        percent_change_6w DECIMAL(5,2),
        first_week_price DECIMAL(5,3),
        latest_week_price DECIMAL(5,3),

        -- ZIP prefixes in this county (for linking)
        zip_prefixes JSONB DEFAULT '[]'::jsonb,

        -- Community metrics (aggregated from ZIP stats)
        user_count INTEGER DEFAULT 0,
        delivery_count INTEGER DEFAULT 0,
        show_user_count BOOLEAN DEFAULT false,
        show_delivery_count BOOLEAN DEFAULT false,

        -- Data quality (recomputed at county level)
        data_quality_score DECIMAL(3,2) DEFAULT 0.00,

        -- Freshness tracking
        last_scrape_at TIMESTAMP WITH TIME ZONE,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

        -- Composite primary key
        PRIMARY KEY (county_name, state_code, fuel_type)
      )
    `);

    // Indexes for county_current_stats
    await sequelize.query(`
      CREATE INDEX idx_county_current_stats_state
      ON county_current_stats(state_code, fuel_type)
    `);

    await sequelize.query(`
      CREATE INDEX idx_county_current_stats_quality
      ON county_current_stats(data_quality_score DESC)
    `);

    console.log('[Migration 059] Created county_current_stats table');
    console.log('[Migration 059] ✅ County price stats infrastructure complete');
  },

  async down(sequelize) {
    await sequelize.query('DROP TABLE IF EXISTS county_current_stats CASCADE');
    await sequelize.query('DROP TABLE IF EXISTS county_price_stats CASCADE');
    console.log('[Migration 059] Dropped county price stats tables');
  }
};
