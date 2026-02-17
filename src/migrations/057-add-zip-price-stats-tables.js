/**
 * Migration 057: Add ZIP Price Stats Tables
 *
 * Creates pre-computed aggregation layer for scalable ZIP-level price intelligence.
 *
 * Architecture:
 * - zip_price_stats: Weekly historical aggregates (append-only)
 * - zip_current_stats: Latest snapshot per ZIP/fuel (read-optimized)
 *
 * This enables:
 * - Sub-20ms API responses at any scale
 * - Historical price trend charts
 * - Data quality scoring
 * - Multi-fuel support (oil, propane)
 * - B2B intelligence layer
 */

module.exports = {
  name: '057-add-zip-price-stats-tables',

  async up(sequelize) {
    // Check if tables already exist
    const [results] = await sequelize.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('zip_price_stats', 'zip_current_stats')
    `);
    const existingTables = results || [];

    if (existingTables.length > 0) {
      console.log('[Migration 057] Tables already exist, skipping creation');
      return;
    }

    // ============================================
    // Table 1: zip_price_stats (Weekly Historical)
    // ============================================
    await sequelize.query(`
      CREATE TABLE zip_price_stats (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

        -- Composite key fields
        zip_prefix VARCHAR(3) NOT NULL,
        fuel_type VARCHAR(20) NOT NULL DEFAULT 'heating_oil',
        week_start DATE NOT NULL,

        -- Price metrics
        median_price DECIMAL(5,3),
        min_price DECIMAL(5,3),
        max_price DECIMAL(5,3),

        -- Volume metrics
        supplier_count INTEGER NOT NULL DEFAULT 0,
        data_points INTEGER NOT NULL DEFAULT 0,

        -- Metadata
        computed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

        -- Composite uniqueness
        UNIQUE(zip_prefix, week_start, fuel_type)
      )
    `);

    // Indexes for zip_price_stats
    await sequelize.query(`
      CREATE INDEX idx_zip_price_stats_prefix_fuel_week
      ON zip_price_stats(zip_prefix, fuel_type, week_start DESC)
    `);

    await sequelize.query(`
      CREATE INDEX idx_zip_price_stats_week
      ON zip_price_stats(week_start DESC)
    `);

    console.log('[Migration 057] Created zip_price_stats table');

    // ============================================
    // Table 2: zip_current_stats (Latest Snapshot)
    // ============================================
    await sequelize.query(`
      CREATE TABLE zip_current_stats (
        -- Composite primary key
        zip_prefix VARCHAR(3) NOT NULL,
        fuel_type VARCHAR(20) NOT NULL DEFAULT 'heating_oil',

        -- Region metadata (denormalized for read performance)
        region_name VARCHAR(100),
        cities JSONB DEFAULT '[]'::jsonb,

        -- Current price metrics
        median_price DECIMAL(5,3),
        min_price DECIMAL(5,3),
        max_price DECIMAL(5,3),
        supplier_count INTEGER NOT NULL DEFAULT 0,

        -- Trend metrics (pre-computed)
        weeks_available INTEGER NOT NULL DEFAULT 0,
        percent_change_6w DECIMAL(5,2),
        first_week_price DECIMAL(5,3),
        latest_week_price DECIMAL(5,3),

        -- Community metrics (with threshold flags)
        user_count INTEGER DEFAULT 0,
        delivery_count INTEGER DEFAULT 0,
        show_user_count BOOLEAN DEFAULT false,
        show_delivery_count BOOLEAN DEFAULT false,

        -- Data quality
        data_quality_score DECIMAL(3,2) DEFAULT 0.00,

        -- Freshness tracking
        last_scrape_at TIMESTAMP WITH TIME ZONE,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

        -- Composite primary key
        PRIMARY KEY (zip_prefix, fuel_type)
      )
    `);

    // Indexes for zip_current_stats
    await sequelize.query(`
      CREATE INDEX idx_zip_current_stats_prefix_fuel
      ON zip_current_stats(zip_prefix, fuel_type)
    `);

    await sequelize.query(`
      CREATE INDEX idx_zip_current_stats_quality
      ON zip_current_stats(data_quality_score DESC)
    `);

    await sequelize.query(`
      CREATE INDEX idx_zip_current_stats_region
      ON zip_current_stats(region_name)
    `);

    console.log('[Migration 057] Created zip_current_stats table');
    console.log('[Migration 057] ✅ ZIP price stats infrastructure complete');
  },

  async down(sequelize) {
    await sequelize.query('DROP TABLE IF EXISTS zip_current_stats CASCADE');
    await sequelize.query('DROP TABLE IF EXISTS zip_price_stats CASCADE');
    console.log('[Migration 057] Dropped ZIP price stats tables');
  }
};
