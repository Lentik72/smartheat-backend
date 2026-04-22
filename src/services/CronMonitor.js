/**
 * CronMonitor — Phase 2 automation
 *
 * Wraps cron job execution with:
 * 1. Heartbeat tracking (start/complete/fail to DB)
 * 2. Auto-retry on failure (once, after configurable delay)
 * 3. Overlap protection via in-memory locks
 * 4. Persistent error logging (survives Railway's 7-day log TTL)
 * 5. Scraper drift + anomaly detection
 * 6. Query interface for 6 AM daily email
 *
 * Usage in server.js:
 *   const monitor = new CronMonitor(sequelize, logger);
 *   cron.schedule('0 21 * * *', () => monitor.run('afternoon-scrape', scrapeFn));
 */

const RETRY_DELAY_MS = 2 * 60 * 1000; // 2 minutes
const ERROR_LOG_TTL_DAYS = 30;
const HEARTBEAT_TTL_DAYS = 90;

class CronMonitor {
  constructor(sequelize, logger) {
    this.sequelize = sequelize;
    this.logger = logger;
    this.locks = new Map(); // job_name -> boolean (in-memory overlap lock)
  }

  /**
   * Run a cron job with heartbeat tracking, retry, and error logging.
   *
   * @param {string} jobName - Unique identifier for the cron job
   * @param {Function} fn - Async function to execute. Should return a result object.
   * @param {Object} [options]
   * @param {boolean} [options.retry=true] - Auto-retry once on failure
   * @param {number} [options.retryDelayMs] - Delay before retry (default: 2 min)
   * @param {boolean} [options.lock=true] - Prevent overlapping runs
   * @returns {Object} { success, result, retried, error }
   */
  async run(jobName, fn, options = {}) {
    const { retry = true, retryDelayMs = RETRY_DELAY_MS, lock = true } = options;

    // Overlap protection
    if (lock && this.locks.get(jobName)) {
      this.logger.warn(`[CronMonitor] ${jobName} — skipped (previous run still active)`);
      return { success: false, skipped: true, reason: 'overlap' };
    }

    if (lock) this.locks.set(jobName, true);

    let heartbeatId;
    try {
      // Record start
      heartbeatId = await this._recordStart(jobName);

      // Execute
      const startTime = Date.now();
      const result = await fn();
      const durationMs = Date.now() - startTime;

      // Record success
      await this._recordComplete(heartbeatId, 'success', durationMs, result);
      this.logger.info(`[CronMonitor] ${jobName} — success (${durationMs}ms)`);

      return { success: true, result, retried: false };
    } catch (error) {
      const durationMs = heartbeatId ? Date.now() - Date.now() : 0;

      // Log error persistently
      await this._logError(jobName, error);
      await this._recordComplete(heartbeatId, 'failed', null, null, error.message);

      this.logger.error(`[CronMonitor] ${jobName} — FAILED: ${error.message}`);

      // Auto-retry once
      if (retry) {
        this.logger.info(`[CronMonitor] ${jobName} — retrying in ${retryDelayMs / 1000}s...`);
        await this._sleep(retryDelayMs);

        let retryHeartbeatId;
        try {
          retryHeartbeatId = await this._recordStart(`${jobName}:retry`);
          const retryStart = Date.now();
          const retryResult = await fn();
          const retryDuration = Date.now() - retryStart;

          await this._recordComplete(retryHeartbeatId, 'success', retryDuration, retryResult);
          this.logger.info(`[CronMonitor] ${jobName}:retry — success (${retryDuration}ms)`);

          return { success: true, result: retryResult, retried: true };
        } catch (retryError) {
          await this._logError(`${jobName}:retry`, retryError);
          await this._recordComplete(retryHeartbeatId, 'failed', null, null, retryError.message);
          this.logger.error(`[CronMonitor] ${jobName}:retry — FAILED: ${retryError.message}`);

          return { success: false, retried: true, error: retryError.message };
        }
      }

      return { success: false, retried: false, error: error.message };
    } finally {
      if (lock) this.locks.delete(jobName);
    }
  }

  /**
   * Check scraper results for drift (>20% failure) and anomaly spikes (>10% rejection).
   * Returns alerts array for inclusion in 6 AM email.
   */
  checkScraperHealth(scrapeResult) {
    const alerts = [];
    const total = (scrapeResult.success || 0) + (scrapeResult.failed || 0);

    if (total === 0) {
      alerts.push({ level: 'critical', message: 'Scraper returned 0 results — possible code or connection failure' });
      return alerts;
    }

    // Drift detection: >20% failures
    const failRate = scrapeResult.failed / total;
    if (failRate > 0.20) {
      alerts.push({
        level: 'warning',
        message: `Scraper drift: ${scrapeResult.failed}/${total} failed (${(failRate * 100).toFixed(0)}%) — possible site-wide blocking or code regression`
      });
    }

    // Anomaly spike: >10% rejections (price drop protection triggered too often)
    const rejected = scrapeResult.rejected || 0;
    if (rejected > 0 && total > 0) {
      const rejectRate = rejected / total;
      if (rejectRate > 0.10) {
        alerts.push({
          level: 'warning',
          message: `Price anomaly spike: ${rejected}/${total} prices rejected (${(rejectRate * 100).toFixed(0)}%) — possible scraper regex issue`
        });
      }
    }

    return alerts;
  }

  /**
   * Get cron health summary for the daily email.
   * Checks which expected crons ran in the last 24h and reports status.
   */
  async getDailyHealth() {
    try {
      // Expected cron jobs and their schedule. `windowHours` is how stale a
      // heartbeat can be before we flag 'missing'. Monthly jobs add
      // `dayOfMonth` so we don't false-flag them on days they aren't due.
      const expectedJobs = [
        { name: 'afternoon-scrape', label: 'Price Scrape (4 PM)', schedule: 'daily', windowHours: 26 },
        { name: 'seo-pages', label: 'SEO Pages (11 PM)', schedule: 'daily', windowHours: 26 },
        { name: 'supplier-pages', label: 'Supplier Pages (11 PM)', schedule: 'daily', windowHours: 26 },
        { name: 'heating-cost-pages', label: 'Heating Cost Pages (11:15 PM)', schedule: 'daily', windowHours: 26 },
        { name: 'avg-bill-pages', label: 'Avg Bill Pages (11:20 PM)', schedule: 'daily', windowHours: 26 },
        { name: 'price-trend-pages', label: 'Price Trend Pages (11:25 PM)', schedule: 'daily', windowHours: 26 },
        { name: 'sitemap', label: 'Sitemap (11:30 PM)', schedule: 'daily', windowHours: 26 },
        { name: 'platform-metrics', label: 'Platform Metrics (2:15 AM)', schedule: 'daily', windowHours: 26 },
        { name: 'eia-energy-rates', label: 'EIA Energy Rates (3:30 AM, 18th of month)',
          schedule: 'monthly', dayOfMonth: 18, windowHours: 24 * 32 },
        // price-alerts (8 AM) intentionally excluded — runs after the 6 AM email
      ];

      // Get latest heartbeat per job regardless of age; per-job window check
      // happens below. This makes monthly jobs visible even 3+ weeks out.
      const [heartbeats] = await this.sequelize.query(`
        SELECT DISTINCT ON (job_name)
          job_name, status, started_at, completed_at, duration_ms, error_message,
          details
        FROM cron_heartbeats
        WHERE job_name NOT LIKE '%:retry'
        ORDER BY job_name, started_at DESC
      `);

      const heartbeatMap = new Map();
      heartbeats.forEach(h => heartbeatMap.set(h.job_name, h));

      const now = new Date();
      const todayDayOfMonth = now.getDate();

      const jobStatuses = expectedJobs.map(job => {
        const hb = heartbeatMap.get(job.name);

        // Monthly jobs: suppress 'missing' when today hasn't reached the scheduled day.
        // Show last-known status from prior months instead.
        if (job.schedule === 'monthly' && todayDayOfMonth < job.dayOfMonth) {
          if (hb && hb.status === 'success') {
            const daysAgo = Math.floor((now - new Date(hb.started_at)) / (1000 * 60 * 60 * 24));
            return {
              ...job, status: 'scheduled',
              message: `Last run ${daysAgo}d ago; next run day ${job.dayOfMonth}`,
              durationMs: hb.duration_ms
            };
          }
          return { ...job, status: 'scheduled', message: `Next run day ${job.dayOfMonth}` };
        }

        if (!hb) {
          return { ...job, status: 'missing', message: 'Did not run' };
        }

        // Stale heartbeat (outside job's window) — treat as missing
        const ageHours = (now - new Date(hb.started_at)) / (1000 * 60 * 60);
        if (ageHours > job.windowHours) {
          return {
            ...job, status: 'missing',
            message: `Last run ${Math.round(ageHours)}h ago (expected within ${job.windowHours}h)`
          };
        }

        if (hb.status === 'success') {
          return { ...job, status: 'success', durationMs: hb.duration_ms, details: hb.details };
        }
        // Check if retry succeeded
        const retryHb = heartbeatMap.get(`${job.name}:retry`);
        if (retryHb && retryHb.status === 'success') {
          return { ...job, status: 'retried', message: `Failed then retried OK`, durationMs: retryHb.duration_ms };
        }
        return { ...job, status: 'failed', message: hb.error_message };
      });

      // Get recent errors (last 24h)
      const [errors] = await this.sequelize.query(`
        SELECT service, message, created_at
        FROM cron_error_log
        WHERE created_at > NOW() - INTERVAL '24 hours'
        ORDER BY created_at DESC
        LIMIT 10
      `);

      // Get scraper alerts from most recent scrape run
      const [latestScrape] = await this.sequelize.query(`
        SELECT success_count, failed_count, skipped_count, duration_ms, failures
        FROM scrape_runs
        ORDER BY run_at DESC
        LIMIT 1
      `);

      let scraperAlerts = [];
      if (latestScrape.length > 0) {
        scraperAlerts = this.checkScraperHealth({
          success: parseInt(latestScrape[0].success_count),
          failed: parseInt(latestScrape[0].failed_count),
          rejected: 0 // rejections stored separately, not in scrape_runs
        });
      }

      return {
        jobs: jobStatuses,
        errors,
        scraperAlerts,
        allHealthy: jobStatuses.every(j => j.status === 'success' || j.status === 'retried' || j.status === 'scheduled') && scraperAlerts.length === 0
      };
    } catch (error) {
      this.logger.error(`[CronMonitor] getDailyHealth failed: ${error.message}`);
      return { jobs: [], errors: [], scraperAlerts: [], allHealthy: false, queryError: error.message };
    }
  }

  /**
   * Cleanup old heartbeats and error logs.
   * Call periodically (e.g., monthly or at startup).
   */
  async cleanup() {
    try {
      await this.sequelize.query(`
        DELETE FROM cron_heartbeats WHERE created_at < NOW() - INTERVAL '${HEARTBEAT_TTL_DAYS} days'
      `);
      await this.sequelize.query(`
        DELETE FROM cron_error_log WHERE created_at < NOW() - INTERVAL '${ERROR_LOG_TTL_DAYS} days'
      `);
      this.logger.info('[CronMonitor] Cleaned up old heartbeats and error logs');
    } catch (error) {
      // Table may not exist yet (first deploy before migration runs) — skip silently
      if (error.message && error.message.includes('does not exist')) return;
      this.logger.error(`[CronMonitor] Cleanup failed: ${error.message}`);
    }
  }

  /**
   * Public: persist an error to cron_error_log for surfacing in 6AM email.
   * Safe to call during DB outage — _logError has internal try/catch
   * (see CronMonitor.js:325-341).
   */
  async logError(service, error) {
    return this._logError(service, error);
  }

  // ── Internal methods ──────────────────────────────────

  async _recordStart(jobName) {
    try {
      const [[row]] = await this.sequelize.query(`
        INSERT INTO cron_heartbeats (job_name, started_at, status)
        VALUES (:jobName, NOW(), 'running')
        RETURNING id
      `, { replacements: { jobName } });
      return row.id;
    } catch (error) {
      // Table may not exist on first deploy before migration — don't block the cron job
      if (!error.message?.includes('does not exist')) {
        this.logger.error(`[CronMonitor] Failed to record start for ${jobName}: ${error.message}`);
      }
      return null;
    }
  }

  async _recordComplete(heartbeatId, status, durationMs, details, errorMessage) {
    if (!heartbeatId) return;
    try {
      await this.sequelize.query(`
        UPDATE cron_heartbeats
        SET completed_at = NOW(),
            status = :status,
            duration_ms = :durationMs,
            details = :details,
            error_message = :errorMessage
        WHERE id = :heartbeatId
      `, {
        replacements: {
          heartbeatId,
          status,
          durationMs: durationMs || null,
          details: details ? JSON.stringify(details) : '{}',
          errorMessage: errorMessage || null
        }
      });
    } catch (error) {
      this.logger.error(`[CronMonitor] Failed to record completion for heartbeat ${heartbeatId}: ${error.message}`);
    }
  }

  async _logError(service, error) {
    try {
      await this.sequelize.query(`
        INSERT INTO cron_error_log (service, message, stack_trace, context)
        VALUES (:service, :message, :stack, '{}')
      `, {
        replacements: {
          service,
          message: error.message || String(error),
          stack: error.stack || null
        }
      });
    } catch (dbError) {
      // If DB logging fails, at least console log it
      this.logger.error(`[CronMonitor] Failed to persist error for ${service}: ${dbError.message}`);
    }
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = CronMonitor;
