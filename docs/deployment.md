---
system: deployment
tags: [railway, middleware, cron, health, server]
constants:
  rate_limit_window: "15 minutes"
  rate_limit_max_prod: "100 requests/IP"
  html_cache: "1 hour"
  db_pool_max: "10"
  healthcheck_timeout: "120 seconds"
  generator_timeout: "90 seconds"
---

# Deployment

## Overview

Railway deploys from `Lentik72/smartheat-backend` main branch. Build takes ~25s. Healthcheck has a 120s retry window at `/health`. Failed deploys keep the last healthy version active. Generated pages (supplier profiles, SEO city/county/state pages, ZIP/county elite) are gitignored — they're regenerated on every startup from the database.

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
15. **404 handler**

## Health Endpoint

GET `/health` returns 503 `{ "status": "starting" }` while pages are generating, then 200 once ready:
```json
{
  "status": "healthy",
  "services": { "database": true, "weather": true, ... },
  "system": { "uptime": 1234, "memory": { "used": "128MB" }, "cache": { "hitRate": 0.85 } }
}
```

Health is gated on page generation: all 4 generators (SEO, supplier, ZIP elite, county elite) must complete successfully before `/health` returns 200. Each generator has a 90s timeout. If any fails, health stays 503 and Railway keeps the old deploy.

Railway's internal healthcheck uses `*.railway.app` URL. The redirect middleware at step 1 MUST `return next()` for `/health` — otherwise it redirects to `www.gethomeheat.com` and the healthcheck fails.

## Cron Schedule

| Time (EST) | Job | Timezone setting |
|---|---|---|
| 4:00 PM | Afternoon price scrape + ZIP/county stats | UTC (`0 21 * * *`) |
| 11:00 PM | SEO + supplier + ZIP/county elite page generation | America/New_York |
| 2:15 AM | Platform metrics computation | America/New_York |
| 6:00 AM (1st of month) | Monthly phone_only supplier reset | UTC (`0 11 1 * *`) |
| 6:00 AM daily | Coverage analysis + daily report + staleness check | setTimeout-based |
| 8:00 AM Monday | Weekly summary email | setTimeout-based |

## Startup Sequence

1. Server starts listening, health returns 503 ("starting")
2. All 4 page generators run in parallel (SEO, supplier, ZIP Elite, County Elite) with 90s per-generator timeout
3. When all generators succeed, `pagesReady = true` → health returns 200 → Railway routes traffic
4. Distributed scheduler begins (scrapes spread across 8AM–6PM EST)

Generated pages (`website/prices/`, `website/supplier/`, `website/sitemap.xml`) are gitignored. Each deploy starts with no pages — generation typically takes 40–80s.

## Route Mounting Order

`/api/weather`, `/api/market`, `/api/community`, `/api/analytics`, `/api/auth`, `/api/admin` (+ `/coverage`, `/activity`), `/api/v1/suppliers`, `/api/v1/market`, `/api/waitlist`, `/api/price-review`, `/claim`, `/api/supplier-claim`, `/api/admin/supplier-claims`, `/api/supplier-update`, `/api` (tracking), `/api/dashboard`, `/api/zip`, `/api/webhook/twilio`

## Environment Variables

**Required**: `DATABASE_URL` (or `DATABASE_PUBLIC_URL`), `JWT_SECRET`, `OPENWEATHER_API_KEY`
**Optional**: `RESEND_API_KEY`, `TWILIO_ACCOUNT_SID`/`AUTH_TOKEN`/`PHONE_NUMBER`, `FRED_API_KEY`, `EIA_API_KEY`
**Runtime**: `NODE_ENV`, `PORT` (default 8080), `LOG_LEVEL` (default "info"), `BACKEND_URL`

Missing required vars → server runs in "degraded mode" (starts but logs warnings).

## Deploy Verification

After pushing, run `npm run verify-deploy` (waits 75s, checks health + spot-checks pages). Page generation adds ~60s to startup, so the first healthcheck may take up to 90s.

## Key Rules

- Database pool: max 10, acquire timeout 30s, idle timeout 10s, SSL required
- SIGTERM/SIGINT handlers close Sequelize connection before exit
- `npm run build` minifies CSS/JS but does NOT touch server.js
- Start command: `node server.js`

Last audited: 2026-03-02
