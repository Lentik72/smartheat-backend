---
system: price-pipeline
tags: [scraping, prices, sms, backoff, validation]
constants:
  scraper_price_range: "$2.00–$5.00"
  sms_price_range: "$1.50–$8.00"
  scraped_price_expiry: "48 hours"
  sms_price_expiry: "7 days"
  max_price_drop: "25%"
---

# Price Pipeline

## Overview

Prices enter via two channels (scraping and SMS), pass through validation, and are stored in `supplier_prices`. The scraper runs on a distributed schedule (8AM–6PM EST) with per-supplier timing. Aggregator signals are stored but never displayed.

## Data Flow

```
scrape-config.json → DistributedScheduler (hash-based time per supplier)
                   → priceScraper.js (fetch + extract)
                   → validate ($2.00–$5.00) + 25% drop protection
                   → supplier_prices (source_type='scraped', expires 48h)

SMS inbound → sms-price-service.js (parse + match by phone_last10)
           → two-step confirm (first time) or direct (returning)
           → supplier_prices (source_type='supplier_sms', expires 7 days)
```

## Leaderboard Verification Scrape

The `/api/market/leaderboard` endpoint shows Top 5 cheapest suppliers. On cache miss (every 30 min), any top-5 supplier whose price is >4 hours stale is re-scraped inline before caching. This ensures the most visible prices are fresh. Re-scraped prices are stored with `notes='leaderboard-verify'`. Max latency: ~15s (5 suppliers × ~3s each, worst case).

Constant: `LEADERBOARD_STALE_THRESHOLD_MS = 4 hours` (in `src/routes/market.js`)

## Scraper Extraction Patterns

Four pattern types in scrape-config.json:
- **direct**: First regex match on page
- **table**: Tiered pricing — sorts ascending, takes lowest (highest-volume tier). `targetTier` overrides selection
- **split**: Price split across HTML elements (e.g., "$3" + "199" = $3.199)
- **json_api**: Fetch JSON endpoint, extract via dot-notation `pricePath`

### lookupUrl (V2.14.0)

Overrides the fetch URL entirely. Used when the real price lives on a third-party checkout portal (e.g., fuelcheckout.com) rather than the supplier's own site. Config fields: `lookupUrl` (URL template with `{zip}` placeholder), `lookupZip` (hardcoded ZIP in the supplier's core delivery area). Pattern/regex extraction works the same as any other scrape.

On HTTP 403, auto-retries with `got-scraping` (browser TLS fingerprint). Only Cloudflare WAF remains truly blocked.

## Backoff State Machine

```
active → (2 consecutive fails) → cooldown (7 days)
active → (3 fails in 30-day window) → phone_only
cooldown → (expiry) → active
phone_only → (1st of month reset) → active (all counters AND failure dates cleared)
any state → (successful scrape) → active (all counters reset)
```

Phone_only takes precedence over cooldown when both conditions are met.
Monthly reset clears `scrape_failure_dates` — without this, old dates in the 30-day window cause immediate re-blocking on the first new failure.

## SMS Two-Step Confirmation

1. **First-time supplier** texts a price (e.g., "3.49") → parsed, stored as `pending_confirm`, reply asks for "YES"
2. Supplier replies "YES" within 24 hours → price published, `sms_confirmed=true`, `allow_price_display=true`
3. **Returning suppliers** (already confirmed) → price goes directly to `supplier_prices`

Phone matching: extracts last 10 digits, looks up `phone_last10`. Multiple matches → disambiguation error (manual resolution needed).

## Aggregator Signals

Config entries with `displayable: false` are scraped as `source_type='aggregator_signal'`. These are **explicitly excluded** from all user-facing price queries (`sourceType != 'aggregator_signal'`). Used only for market intelligence.

## Supplier Diagnostics (V2.13.0)

`SupplierDiagnosticsService` classifies scrape failures into actionable categories for the 6 AM daily email. Replaces raw error dumps with grouped diagnostics.

### Error Classification

| Category | Matches | Priority |
|---|---|---|
| dns_dead | ENOTFOUND, getaddrinfo | 1 (critical) |
| blocked | HTTP 403, ECONNRESET | 1 |
| ssl_error | SSL/TLS/cert errors | 2 |
| page_moved | HTTP 404, 301, 302 | 2 |
| html_changed | "Price not found in HTML" | 2 |
| api_changed | "API price invalid" | 2 |
| connection_refused | ECONNREFUSED | 3 |
| price_range | "outside valid range" | 3 |
| timeout | AbortError, ETIMEDOUT | 3 |
| server_error | HTTP 5xx | 3 |
| config_error | "Not configured" | 4 |

### Website Probes

For stale suppliers (>48h) not in recent scrape_runs failures and not in cooldown/phone_only, the service runs a lightweight HTTP HEAD probe (5s timeout, max 20 suppliers) to diagnose whether the site is up (→ html_changed), blocked (403), moved (404/3xx), DNS dead, or SSL broken.

### Data Sources

- `scrape_runs.failures` JSONB: last 24h of scrape run errors (keyed by supplierName, enriched with supplierId and website since V2.13.0)
- `suppliers` table: scrape_status, consecutive_scrape_failures for backoff breakdown
- `supplier_prices`: latest scraped_at for staleness detection

### Email Integration

The diagnostics replace three legacy sections (Scrape Health stats, Yesterday's Scrape Run raw errors, Supplier Health one-liner) with a unified "Supplier Health Report" showing backoff stats + categorized issue table with action suggestions. Falls back to legacy sections if diagnostics generation fails.

## Key Rules

- Scraper sets expiry to 48h (model default comment says 24h — scraper is authoritative)
- 25% drop protection: if new price drops >25% from previous, it's rejected entirely (not saved)
- Auto-heal: if no valid prices but recently-scraped ones exist (within 7 days), extends their expiry by 48h
- Distributed scheduler: SHA256(supplier_id) mod 600 minutes → stable daily time + ±15min jitter
- Failure rate alert fires when >20% of scrapes fail in a run
- Inter-request delay: 2 seconds between suppliers
- Default `min_gallons`: 150 for both channels
- SSL bypass (`ignoreSSL`) temporarily disables cert verification for self-signed sites

Last audited: 2026-03-13
