/**
 * Migration 074: Daily Platform Metrics Snapshot Table
 *
 * Pre-computed daily metrics for the Command Center liquidity dashboard.
 * Populated nightly by PlatformMetricsService cron (2:15 AM ET).
 * One row per day — idempotent upsert via PRIMARY KEY on day.
 */

module.exports = {
  name: '074-add-daily-platform-metrics',

  async up(sequelize) {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS daily_platform_metrics (
        day DATE PRIMARY KEY,
        computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        -- Search denominators (7d windows)
        search_zip_days INT NOT NULL DEFAULT 0,
        search_zips INT NOT NULL DEFAULT 0,

        -- Supply
        pipeline_suppliers INT NOT NULL DEFAULT 0,

        -- Utilization (soft=click, hard=call)
        suppliers_clicked_7d INT NOT NULL DEFAULT 0,
        suppliers_clicked_30d INT NOT NULL DEFAULT 0,
        suppliers_called_7d INT NOT NULL DEFAULT 0,
        suppliers_called_30d INT NOT NULL DEFAULT 0,

        -- Match rate
        zip_days_with_click_7d INT NOT NULL DEFAULT 0,
        zip_days_with_call_7d INT NOT NULL DEFAULT 0,
        zips_with_call_7d INT NOT NULL DEFAULT 0,

        -- Engagement totals
        calls_7d INT NOT NULL DEFAULT 0,
        website_clicks_7d INT NOT NULL DEFAULT 0,

        -- Deliveries
        deliveries_7d INT NOT NULL DEFAULT 0,
        deliveries_30d INT NOT NULL DEFAULT 0,
        deliveries_oil_30d INT NOT NULL DEFAULT 0,
        deliveries_propane_30d INT NOT NULL DEFAULT 0,
        deliveries_propane_prev30d INT NOT NULL DEFAULT 0,

        -- Complex data
        demand_density_top25 JSONB NOT NULL DEFAULT '[]'::jsonb,
        community_top_zips_30d JSONB NOT NULL DEFAULT '[]'::jsonb,
        extended JSONB DEFAULT '{}'::jsonb
      );
    `);
  }
};
