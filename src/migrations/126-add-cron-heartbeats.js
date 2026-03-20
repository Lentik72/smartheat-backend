/**
 * Migration 126: Cron Heartbeat & Error Log Tables
 *
 * Phase 2 automation: persistent tracking for cron job execution.
 * - cron_heartbeats: one row per cron execution (success/fail/timeout)
 * - cron_error_log: persistent error storage (replaces ephemeral Railway logs)
 *
 * Used by CronMonitor service + 6 AM daily email.
 */

module.exports = {
  name: '126-add-cron-heartbeats',

  async up(sequelize) {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS cron_heartbeats (
        id SERIAL PRIMARY KEY,
        job_name VARCHAR(100) NOT NULL,
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ,
        status VARCHAR(20) NOT NULL DEFAULT 'running',
        duration_ms INT,
        details JSONB DEFAULT '{}',
        error_message TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_cron_heartbeats_job_started
        ON cron_heartbeats(job_name, started_at DESC);

      CREATE INDEX IF NOT EXISTS idx_cron_heartbeats_status
        ON cron_heartbeats(status) WHERE status != 'success';
    `);

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS cron_error_log (
        id SERIAL PRIMARY KEY,
        service VARCHAR(100) NOT NULL,
        message TEXT NOT NULL,
        stack_trace TEXT,
        context JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_cron_error_log_created
        ON cron_error_log(created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_cron_error_log_service
        ON cron_error_log(service, created_at DESC);
    `);

    console.log('[Migration 126] Created cron_heartbeats and cron_error_log tables');
  }
};
