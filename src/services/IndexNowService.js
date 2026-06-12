// src/services/IndexNowService.js
// Nightly IndexNow submission. After the sitemap regenerates (server.js
// 23:30), detect which indexable pages actually changed (content hash with
// date/volatile tokens normalized out) and submit ONLY new/changed URLs to
// IndexNow (shares to Bing). See docs/deployment.md "IndexNow".
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
const HOST = 'www.gethomeheat.com';
const BASE_URL = `https://${HOST}`;
const MAX_BATCH = 10000; // IndexNow hard cap per POST

// Strip date AND relative-freshness tokens so a page only "changes" when real
// content (prices, suppliers, copy) changes. Stripping a date/freshness word
// can never hide a price change (a price is not a date or the word "today"),
// so the only possible error is harmless over-submission.
// FRESHNESS VOCABULARY is exhaustive against the three renderers as of
// 2026-06-10 — keep in sync if a generator adds a new relative-time string:
//   scripts/lib/supplier-data.js:115-119      → 'just now', 'Nh ago', 'today', 'Nd ago'
//   scripts/generate-supplier-pages.js:111-117 → 'Updated now', 'Nh ago', 'Yesterday', 'Nd ago'
//   scripts/generate-seo-pages.js:1011-1013    → 'Now', 'Nh ago', 'Nd ago'
function normalizePageContent(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')                 // all HTML comments (incl. "Auto-generated <ts>")
    .replace(/\?v=[A-Za-z0-9]+/g, '?v=')             // asset cache-bust hashes
    .replace(/\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?/g, '')  // ISO dates/datetimes (dateModified, priceValidUntil)
    .replace(/\b\d+\s*[hd] ago\b/gi, '')             // relative freshness "5h ago" / "3d ago" (drifts nightly!)
    .replace(/\b(?:just now|updated now|yesterday|today|now)\b/gi, '') // word-form freshness incl. bare "Now"
    .replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(,\s*\d{4})?\b/g, ''); // "Jun 10, 2026"
}

function hashContent(normalized) {
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

// Parse <loc> entries out of sitemap.xml; return URL paths (BASE_URL stripped).
function parseSitemapUrls(xml) {
  const urls = [];
  const re = /<loc>([^<]+)<\/loc>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    let u = m[1].trim();
    if (u.startsWith(BASE_URL)) u = u.slice(BASE_URL.length);
    if (!u) u = '/';
    urls.push(u);
  }
  return urls;
}

// Reverse of generate-sitemap.js fileToUrl(): URL path -> absolute file path.
function urlPathToFilePath(urlPath, websiteDir) {
  if (urlPath === '/') return path.join(websiteDir, 'index.html');
  let rel = urlPath.replace(/^\//, '');
  rel = rel.endsWith('/') ? rel + 'index.html' : rel + '.html';
  return path.join(websiteDir, rel);
}

// Compute current normalized hash per URL by reading each page file.
// `readFileSync` is injectable for tests; defaults to fs.readFileSync.
function hashSitemapPages(urls, websiteDir, readFileSync) {
  const _read = readFileSync || fs.readFileSync;
  const current = new Map();
  const missing = [];
  for (const u of urls) {
    const fp = urlPathToFilePath(u, websiteDir);
    try {
      const html = _read(fp, 'utf-8');
      current.set(u, hashContent(normalizePageContent(html)));
    } catch (e) {
      missing.push(u);
    }
  }
  return { current, missing };
}

// toSubmit = URLs new-or-changed vs stored (still in sitemap => indexable).
// toPrune  = URLs gone from the sitemap (deleted OR newly noindex — ambiguous,
//            so pruned from the table but NOT submitted to IndexNow).
function diffPages(current, stored) {
  const toSubmit = [];
  for (const [url, hash] of current) {
    if (stored.get(url) !== hash) toSubmit.push(url);
  }
  const toPrune = [];
  for (const url of stored.keys()) {
    if (!current.has(url)) toPrune.push(url);
  }
  return { toSubmit, toPrune };
}

async function loadStoredHashes(sequelize) {
  const [rows] = await sequelize.query('SELECT url, content_hash FROM indexnow_page_hashes');
  const m = new Map();
  for (const r of rows) m.set(r.url, r.content_hash);
  return m;
}

// Upsert only the URLs we pass (caller passes the new/changed subset, so we
// never rewrite ~1500 unchanged rows nightly). Chunked to bound param count.
async function saveHashes(sequelize, entriesMap) {
  const entries = [...entriesMap.entries()];
  const CHUNK = 500;
  for (let i = 0; i < entries.length; i += CHUNK) {
    const slice = entries.slice(i, i + CHUNK);
    const values = slice.map((_, j) => `($${j * 2 + 1}, $${j * 2 + 2}, NOW())`).join(', ');
    const bind = slice.flatMap(([url, hash]) => [url, hash]);
    await sequelize.query(
      `INSERT INTO indexnow_page_hashes (url, content_hash, updated_at) VALUES ${values} ` +
      `ON CONFLICT (url) DO UPDATE SET content_hash = EXCLUDED.content_hash, updated_at = NOW()`,
      { bind }
    );
  }
}

async function pruneHashes(sequelize, urls) {
  if (!urls.length) return;
  // Explicit ::text[] cast matches the codebase's universal ANY($n::type[])
  // convention (e.g. ScrapeConfigSync.js:442) — there are zero bare ANY($n).
  await sequelize.query('DELETE FROM indexnow_page_hashes WHERE url = ANY($1::text[])', { bind: [urls] });
}

// Per-batch retry. The cases this RELIABLY rescues are short transients — 429,
// 5xx, or a dropped connection — seconds-scale, so the 15s/60s backoff absorbs
// them and one blip doesn't fail the whole run + false-alarm the 6 AM ops email.
// A first-run 403 is different: IndexNow 403s a brand-new key until Bing has
// ASYNC-fetched keyLocation (one-time per key; observed 2026-06-12 — the first
// nightly run 403'd, then the identical payload returned 200 hours later). That
// verification can outlast the ~75s retry window; if it does, the run throws and
// the next night's re-bootstrap submits everything again (also fine) — so the
// retry gives the 403 a chance, not a guaranteed rescue. 400/422 (bad format /
// URLs not on host) are permanent — retrying can't help, so fail fast. Bounded
// (3 attempts): a genuinely bad key still surfaces after the cap, matching
// IndexNow's "3 consecutive 403 = real problem" guidance.
const SUBMIT_RETRY_DELAYS_MS = [15000, 60000]; // waited before attempts 2 and 3
const SUBMIT_MAX_ATTEMPTS = SUBMIT_RETRY_DELAYS_MS.length + 1;

function isRetriableStatus(status) {
  return status === 403 || status === 429 || status >= 500;
}

const _defaultSleep = (ms) => new Promise((resolve) => {
  const t = setTimeout(resolve, ms);
  if (t && typeof t.unref === 'function') t.unref(); // don't block SIGTERM
});

// Submit absolute URLs to IndexNow in <=MAX_BATCH chunks. fetchImpl/sleep are
// injectable for tests; default to global fetch (Node 18+) and a real timer.
// Returns the URLs that were ACTUALLY accepted (submittedUrls) so the caller
// persists only those — a failed batch stays unpersisted and is retried next run.
async function submitToIndexNow(urls, { key, fetchImpl, logger, sleep, attempts } = {}) {
  const _fetch = fetchImpl || fetch;
  const _log = logger || console;
  const _sleep = sleep || _defaultSleep;
  const _warn = (msg) => {
    if (typeof _log.warn === 'function') _log.warn(msg);
    else if (typeof _log.error === 'function') _log.error(msg);
  };
  const maxAttempts = attempts || SUBMIT_MAX_ATTEMPTS;
  const keyLocation = `${BASE_URL}/${key}.txt`;
  const submittedUrls = [];
  let failed = 0;
  for (let i = 0; i < urls.length; i += MAX_BATCH) {
    const batch = urls.slice(i, i + MAX_BATCH);
    const body = JSON.stringify({
      host: HOST,
      key,
      keyLocation,
      urlList: batch.map(u => `${BASE_URL}${u}`),
    });
    let ok = false;
    let reason = '';
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let retriable;
      try {
        const res = await _fetch(INDEXNOW_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body,
          signal: AbortSignal.timeout(10000),
        });
        if (res.ok) { ok = true; break; }
        reason = `HTTP ${res.status}`;
        retriable = isRetriableStatus(res.status);
      } catch (e) {
        reason = e.message;
        retriable = true; // timeout/network blip — worth a retry
      }
      if (!retriable || attempt === maxAttempts) break;
      const idx = Math.min(attempt - 1, SUBMIT_RETRY_DELAYS_MS.length - 1);
      const delay = SUBMIT_RETRY_DELAYS_MS[idx];
      _warn(`[IndexNow] batch attempt ${attempt}/${maxAttempts} failed (${reason}); retrying in ${Math.round(delay / 1000)}s`);
      await _sleep(delay);
    }
    if (ok) submittedUrls.push(...batch);
    else { failed += batch.length; _log.error(`[IndexNow] submission failed after ${maxAttempts} attempt(s): ${reason}`); }
  }
  return { submitted: submittedUrls.length, submittedUrls, failed };
}

// Orchestrator — called by the 23:31 cron. Gated by INDEXNOW_KEY (presence)
// and INDEXNOW_DRY_RUN. Reads the freshly-written sitemap.xml, hashes each
// page, diffs vs the stored hashes, submits new/changed, reconciles the table.
async function runIndexNowSubmission({ sequelize, logger, websiteDir, fetchImpl, sleep } = {}) {
  const _log = logger || console;
  const key = process.env.INDEXNOW_KEY;
  const dryRun = process.env.INDEXNOW_DRY_RUN === 'true';

  if (!key) {
    _log.info('[IndexNow] INDEXNOW_KEY not set — skipping submission');
    return { success: true, skipped: true, reason: 'no-key' };
  }

  const sitemapPath = path.join(websiteDir, 'sitemap.xml');
  let xml;
  try {
    xml = fs.readFileSync(sitemapPath, 'utf-8');
  } catch (e) {
    // THROW (not return {success:false}) — CronMonitor.run records 'success' for
    // ANY resolved return (CronMonitor.js:57→61) and only marks 'failed' on a
    // thrown error. A missing sitemap when IndexNow is enabled is abnormal (the
    // 23:30 sitemap job should have just written it), so it must surface in the
    // 6 AM ops email, not get a green heartbeat — same silent-degradation class
    // as a failed submission. (This is before the dry-run early-return, so a
    // dry-run also throws on a missing sitemap — intended; it's abnormal in any mode.)
    throw new Error(`[IndexNow] cannot read sitemap.xml at ${sitemapPath}: ${e.message}`);
  }

  const urls = parseSitemapUrls(xml);
  const { current, missing } = hashSitemapPages(urls, websiteDir);
  if (missing.length) _log.info(`[IndexNow] ${missing.length} sitemap URLs had no file on disk (skipped)`);

  const stored = await loadStoredHashes(sequelize);
  const { toSubmit, toPrune } = diffPages(current, stored);

  // Drift-visibility (manual diagnostic, also stored in the heartbeat details):
  // on a quiet no-deploy night this ratio should be modest. A high ratio with no
  // deploy may mean a new volatile token escaped normalization — investigate.
  // (A template-touching deploy legitimately spikes it too, which is why this is
  // a log/heartbeat signal to correlate by hand, not an auto-alarm.)
  const ratio = current.size ? Math.round((toSubmit.length / current.size) * 100) : 0;
  _log.info(`[IndexNow] ${current.size} indexable, ${toSubmit.length} new/changed (${ratio}%), ${toPrune.length} pruned` +
            (stored.size === 0 ? ' (bootstrap: first run submits all)' : ''));

  if (dryRun) {
    _log.info(`[IndexNow] DRY RUN — would submit ${toSubmit.length} URLs`);
    return { success: true, indexable: current.size, submitted: 0, pruned: 0, dryRun: true };
  }

  let submittedUrls = [];
  let failed = 0;
  if (toSubmit.length) {
    const res = await submitToIndexNow(toSubmit, { key, fetchImpl, logger: _log, sleep });
    submittedUrls = res.submittedUrls;
    failed = res.failed;
    _log.info(`[IndexNow] submitted ${res.submitted}/${toSubmit.length} URLs` + (failed ? `, ${failed} FAILED` : ''));
  }

  // Persist ONLY the URLs actually accepted, so a failed batch stays unpersisted
  // and is retried next run. Always prune URLs gone from the sitemap (independent
  // of submission outcome).
  await saveHashes(sequelize, new Map(submittedUrls.map(u => [u, current.get(u)])));
  await pruneHashes(sequelize, toPrune);

  // Surface a TOTAL submission failure (e.g. 403 bad key, outage) so cronMonitor
  // marks the job failed and it appears in the 6 AM ops email's Recent Errors —
  // never swallowed (the documented silent-degradation bug class). retry:false
  // means no storm. We throw only when NOTHING got through: a partial multi-batch
  // failure is already logged (the "Z FAILED" line above) and left unpersisted so
  // it retries next run — one transient batch shouldn't nuke the whole job's
  // signal. At current scale (one batch, ~3,255 < 10k) total == any failure.
  if (toSubmit.length > 0 && submittedUrls.length === 0) {
    throw new Error(`IndexNow: all ${toSubmit.length} submissions failed (see prior log line)`);
  }

  return { success: true, indexable: current.size, submitted: submittedUrls.length, pruned: toPrune.length, dryRun: false };
}

module.exports = {
  normalizePageContent, hashContent, parseSitemapUrls, urlPathToFilePath,
  hashSitemapPages, diffPages, loadStoredHashes, saveHashes, pruneHashes,
  submitToIndexNow, runIndexNowSubmission,
  INDEXNOW_ENDPOINT, HOST, BASE_URL, MAX_BATCH,
};
