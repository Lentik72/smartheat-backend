---
system: deployment
tags: [railway, middleware, cron, health, server]
constants:
  rate_limit_window: "15 minutes"
  rate_limit_max_prod: "100 requests/IP"
  html_cache: "1 hour"
  db_pool_max: "25"
  db_statement_timeout_ms: "60000"
  db_idle_tx_timeout_ms: "60000"
  db_connect_timeout_ms: "15000"
  db_health_race_ms: "2000"
  healthcheck_timeout: "120 seconds"
  generator_timeout: "90 seconds"
---

# Deployment

## Overview

Railway deploys from `Lentik72/smartheat-backend` main branch. Build takes ~25s. Healthcheck has a 120s retry window at `/health`. Failed deploys keep the last healthy version active. Generated pages (supplier profiles, SEO city/county/state pages, ZIP/county elite, heating-cost estimates, average-bill pages, price trends, sitemap.xml) are gitignored — they're regenerated on every startup from the database. A pre-commit hook at `.git/hooks/pre-commit` blocks accidental re-tracking. The hook is local to the clone; see `docs/website-generation.md` for the list of blocked paths if you need to reinstall on a new machine.

## Middleware Order

Order matters — changing it can break the app. Listed by registration order in server.js:

1. **Redirect** (non-www → www, Railway → production) — **MUST skip `/health`** or deploys fail
2. **Helmet** (security headers, CSP)
3. **CORS** (production + dev origins, credentials enabled)
4. **Rate limiting** (100 req/IP/15min in prod, 1000 in dev) — **skips `/api/webhook/` paths**
5. **Compression** (gzip) + **Body parsing** (JSON + URL-encoded, 10MB limit)
6. **Clean URL redirect** (`.html` → clean URLs, 301) — exceptions: `/api/*`, `update-price.html`, `price-review.html`, `/admin`
7. **Clean URL resolution** (serve `.html` for extensionless requests)
8. **Static file serving** (`website/` directory — HTML: 1h cache, CSS/JS: 1h, images: 24h)
9. **Request logging** (express-winston)
10. **Activity analytics** (captures API requests, skips `/health`)
11. **Health endpoint** — returns JSON with service status + system metrics
12. **API route mounting** (see below)
13. **Public assets** (`public/` directory)
14. **Error handler** (500 with dev message)
15. **404 handler** — serves `website/404.html` for non-API requests (branded page, absolute asset paths), JSON for `/api/*` requests
16. **Old state name redirects** — `/prices/connecticut` → `/prices/ct` etc. (301, 13 states in `OLD_STATE_NAMES` map)

## Health Endpoint

GET `/health` returns **503 `{ "status": "initializing", ... }` during startup** and flips to **200 `{ "status": "healthy", ... }` once all 5 models (`Supplier`, `CommunityDelivery`, `CommunityDeliveryRaw`, `SupplierPrice`, `UserLocation`) finish init via `markReady()`. A hard-timeout escape hatch (`STARTUP_HARD_TIMEOUT_MS`, 60s) forces 200 even if a model is still initializing — prevents a permanent 503 deploy-loop on a buggy migration. Page generation runs in the background and does NOT gate health.

```json
{
  "status": "healthy",          // "initializing" while HTTP is 503
  "services": {
    "database": true,           // boolean — true only when DB auth succeeds
    "databaseState": "up",      // tri-state: "up" | "timeout" | "down"
    "weather": true, ...
  },
  "startup": {
    "initialStartupComplete": true,
    "modelsReady": ["Supplier", "CommunityDelivery", ...],
    "modelsPending": [],
    "retryDisabled": false
  },
  "system": { "uptime": 1234, "memory": { "used": "128MB" }, "cache": { "hitRate": 0.85 } }
}
```

Railway's healthcheck has a 120s retry window, which covers the 60s startup-hard-timeout with margin. UptimeRobot only sees post-startup state, so it never observes the 503.

The DB check runs `sequelize.authenticate()` against a `Promise.race` with `DB_HEALTH_RACE_MS` (default 2s). If it loses the race, `databaseState: "timeout"` is reported and a warn is logged — but the HTTP status is still governed by `initialStartupComplete` (200 post-startup, 503 during). This prevents UptimeRobot from false-alerting on transient Postgres blips while still surfacing the signal via logs and the tri-state field. An actual `authenticate()` rejection (not timeout) reports `databaseState: "down"`.

Railway's internal healthcheck uses `*.railway.app` URL. The redirect middleware at step 1 MUST `return next()` for `/health` — otherwise it redirects to `www.gethomeheat.com` and the healthcheck fails.

## Cron Schedule

| Time (EST) | Job | Timezone setting |
|---|---|---|
| 4:00 PM | Afternoon price scrape + ZIP/county stats | UTC (`0 21 * * *`) |
| 11:00 PM | SEO + supplier + ZIP/county elite page generation | America/New_York |
| 11:31 PM | IndexNow submission to Bing (after 11:30 sitemap regen) | America/New_York |
| 2:15 AM | Platform metrics computation | America/New_York |
| 3:30 AM (18th of month) | EIA energy rates refresh (electricity + gas) | America/New_York |
| 6:00 AM (1st of month) | Monthly phone_only supplier reset | UTC (`0 11 1 * *`) |
| 6:00 AM daily | Coverage analysis + daily report + staleness check | setTimeout-based |
| 8:00 AM Monday | Weekly summary email | setTimeout-based |

### IndexNow (Bing crawl submission)

A nightly `cron.schedule('31 23 …')` step (after the 11:30 PM sitemap regen) reads `website/sitemap.xml` and submits only **new/changed** indexable URLs to IndexNow (shares to Bing), via `runIndexNowSubmission` in `src/services/IndexNowService.js`. Change detection = a content hash per URL (date + relative-freshness tokens normalized out) compared against the `indexnow_page_hashes` table (migration 176). **Removed** URLs are pruned from the table but never submitted (a drop is ambiguous: deleted vs newly `noindex`). The first run bootstraps (empty table → submits the whole sitemap once). Gated by `INDEXNOW_KEY` (presence) + `INDEXNOW_DRY_RUN`. Each batch POST retries **transient** failures — 403 (key-validation lag: IndexNow 403s a brand-new key until it has fetched `keyLocation`; observed on the first nightly run 2026-06-12), 429, 5xx, network/timeout — up to 3 attempts with backoff (15s, then 60s); **permanent** errors (400/422 = bad format / URLs not on host) fail fast without retry. A batch still failing after the cap (or a missing sitemap) is NOT swallowed — it throws so `cronMonitor` marks the `indexnow` job failed and it appears in the 6 AM ops email's Recent Errors. Nothing is persisted for a failed batch, so it re-submits next run. A `/<INDEXNOW_KEY>.txt` route serves the verification key from env. Known tech debt: change detection hashes rendered HTML + regex-strips volatile tokens (fragile if a generator adds a new relative-time token); the logged `new/changed %` ratio is the drift signal.

## Startup Sequence

1. Server starts listening. `/health` returns **503 `"initializing"`** until all 5 models are ready (or 60s hard timeout), then flips to 200 `"healthy"`. Page generation does NOT gate health.
2. In parallel with the server accepting traffic, all 4 page generators run (SEO, supplier, ZIP Elite, County Elite) with 90s per-generator timeout.
3. Each generator uses generate-then-swap: if one fails for a state, the previous generated pages on disk survive.
4. Distributed scheduler begins (scrapes spread across 8AM–6PM EST).

Generated pages (`website/prices/`, `website/supplier/`, `website/heating-cost/`, `website/average-heating-bill/`, `website/price-trend/`, `website/sitemap.xml`) are gitignored. Each deploy starts with no pages — generation typically takes 40–80s via `Promise.allSettled` across 7 pre-health-gate generators (plus 6 kero/propane + sitemap post-gate), each wrapped in `cronMonitor.run` for failure alerting.

**Environment variable changes** (via Railway dashboard) trigger an automatic container restart (~45s) — not a redeploy, but not zero-downtime either. Timeout env vars (`DB_STATEMENT_TIMEOUT_MS` et al.) are hot-swappable within that restart window.

## Route Mounting Order

`/api/weather`, `/api/market`, `/api/community`, `/api/analytics`, `/api/auth`, `/api/admin` (+ `/coverage`, `/activity`), `/api/v1/suppliers`, `/api/v1/market`, `/api/waitlist`, `/api/price-review`, `/claim`, `/api/supplier-claim`, `/api/admin/supplier-claims`, `/api/supplier-update`, `/api` (tracking), `/api/dashboard`, `/api/zip`, `/api/webhook/twilio`

## Environment Variables

**Required**: `DATABASE_URL` (or `DATABASE_PUBLIC_URL`), `JWT_SECRET`, `OPENWEATHER_API_KEY`
**Optional**: `RESEND_API_KEY`, `TWILIO_ACCOUNT_SID`/`AUTH_TOKEN`/`PHONE_NUMBER`, `FRED_API_KEY`, `EIA_API_KEY`
**Runtime**: `NODE_ENV`, `PORT` (default 8080), `LOG_LEVEL` (default "info"), `BACKEND_URL`

Missing required vars → server runs in "degraded mode" (starts but logs warnings).

## Deploy Verification

After pushing, run `npm run verify-deploy` (waits 75s, checks health + spot-checks pages). The 75s wait covers the 60s startup-hard-timeout, so `/health` should be 200 by the time verification runs. Page generation takes 40–80s in the background — spot-checks of generated pages may 404 during that window.

## Key Rules

- Database pool: max 25, min 2, acquire timeout 30s, idle timeout 10s, SSL required
- Database timeouts (env-tunable, hot-swappable in Railway dashboard):
  - `DB_STATEMENT_TIMEOUT_MS` (default 60000) — Postgres `statement_timeout`, kills any single query exceeding budget
  - `DB_IDLE_TX_TIMEOUT_MS` (default 60000) — Postgres `idle_in_transaction_session_timeout`
  - `DB_CONNECT_TIMEOUT_MS` (default 15000) — pg client `connectionTimeoutMillis`
  - `DB_HEALTH_RACE_MS` (default 2000) — `/health` `authenticate()` race budget
- SIGTERM/SIGINT handlers close Sequelize connection before exit
- `npm run build` minifies CSS/JS but does NOT touch server.js
- Start command: `node server.js`

Last audited: 2026-04-26

## Model Init Retry Kill Switch

If the auto-retry model init (added 2026-04-22, bead `heatingoil-36uz`) misbehaves in production — e.g., retry hammering the DB, `/health` stuck at 503, or unexpected container behavior — set `DISABLE_MODEL_RETRY=true` in the Railway service variables (Railway → smartheat-backend → Variables). Backend auto-restarts (~45s). This falls back to the pre-36uz single-shot init behavior: fire-and-forget with `try/catch` logging, no retries. No code deploy required. To restore: delete the variable and restart the service. The `/health` endpoint exposes current state at `startup.retryDisabled`.
