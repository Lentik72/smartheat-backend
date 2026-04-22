/**
 * Retry a model initialization with exponential backoff until it succeeds.
 *
 * Fire-and-forget: returns immediately. Failures are logged (always) and
 * persisted to cron_error_log (1st + every 10th retry per model, to avoid
 * flooding the 6AM email during a long outage).
 *
 * Backoff sequence: 1s, 2s, 4s, 8s, 16s, 32s, 64s, 128s, 256s, then 300s cap.
 * Attempt 6 fires at t=31s — fits under Railway's 120s healthcheck window.
 *
 * Per-attempt timeout (default 15s) via Promise.race prevents a wedged
 * Sequelize pool (default acquire=60s) from eating the entire backoff.
 *
 * Kill switch: DISABLE_MODEL_RETRY=true falls back to a single-shot init
 * matching today's (pre-36uz) behavior.
 *
 * Timers use .unref() so pending retries don't block SIGTERM cleanup.
 *
 * @param {Object} opts
 * @param {string} opts.name - Display name, e.g., 'Supplier'
 * @param {Function} opts.initFn - () => Model|null (null forces retry)
 * @param {Function} opts.syncFn - async (model) => void (e.g., m.sync({alter:false}))
 * @param {Object} opts.cronMonitor - CronMonitor instance for error persistence
 * @param {Object} opts.logger - logger with .info and .error
 * @param {Function} [opts.onReady] - (model) => void, called once on first success
 * @param {number} [opts.initTimeoutMs=15000] - per-attempt timeout
 */
const BACKOFF_SEQUENCE_MS = [1000, 2000, 4000, 8000, 16000, 32000, 64000, 128000, 256000];
const BACKOFF_CAP_MS = 300000;
const DEFAULT_INIT_TIMEOUT_MS = 15000;

function getDelay(attempt) {
  return attempt < BACKOFF_SEQUENCE_MS.length
    ? BACKOFF_SEQUENCE_MS[attempt]
    : BACKOFF_CAP_MS;
}

function withTimeout(fn, ms, name) {
  return Promise.race([
    Promise.resolve().then(fn),
    new Promise((_, rej) => setTimeout(() => rej(new Error(`${name} timeout after ${ms}ms`)), ms)),
  ]);
}

function retryModelInit({
  name,
  initFn,
  syncFn,
  cronMonitor,
  logger,
  onReady,
  initTimeoutMs = DEFAULT_INIT_TIMEOUT_MS,
}) {
  // Kill switch: single-shot fallback to today's behavior
  if (process.env.DISABLE_MODEL_RETRY === 'true') {
    Promise.resolve().then(async () => {
      try {
        const model = await withTimeout(() => initFn(), initTimeoutMs, `${name}.initFn`);
        if (!model) {
          logger.error(`❌ ${name} model failed to initialize`);
          return;
        }
        if (syncFn) await withTimeout(() => syncFn(model), initTimeoutMs, `${name}.syncFn`);
        logger.info(`✅ ${name} model synced`);
        if (onReady) onReady(model);
      } catch (err) {
        logger.error(`❌ ${name} model sync failed:`, err.message || err);
      }
    }).catch((err) => {
      logger.error(`[retryModelInit] unexpected ${name} error: ${err.message}`);
    });
    return;
  }

  let attempt = 0;
  let done = false;

  const tryOnce = async () => {
    if (done) return;
    try {
      const model = await withTimeout(() => initFn(), initTimeoutMs, `${name}.initFn`);
      if (!model) throw new Error(`${name} initFn returned null`);
      if (syncFn) await withTimeout(() => syncFn(model), initTimeoutMs, `${name}.syncFn`);
      done = true;
      if (attempt > 0) {
        logger.info(`✅ ${name} model synced after ${attempt + 1} attempts`);
      } else {
        logger.info(`✅ ${name} model synced`);
      }
      if (onReady) onReady(model);
    } catch (err) {
      // Dedupe: persist on 1st failure + every 10th retry
      if (attempt === 0 || attempt % 10 === 0) {
        cronMonitor.logError(`model-init-${name.toLowerCase()}`, err)
          .catch((logErr) => logger.error(`[retryModelInit] logError failed: ${logErr.message}`));
      }
      logger.error(`❌ ${name} model sync failed (attempt ${attempt + 1}):`, err.message || err);
      const delay = getDelay(attempt);
      attempt += 1;
      const timer = setTimeout(tryOnce, delay);
      if (timer.unref) timer.unref(); // don't block SIGTERM
    }
  };

  // Fire-and-forget — never reject
  Promise.resolve().then(tryOnce).catch((err) => {
    logger.error(`[retryModelInit] unexpected ${name} error: ${err.message}`);
  });
}

module.exports = { retryModelInit };
