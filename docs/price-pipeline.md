---
system: price-pipeline
tags: [scraping, prices, sms, backoff, validation]
constants:
  scraper_price_range: "$2.00–$5.00"
  sms_price_range: "$1.50–$8.00"
  scraped_price_expiry: "48 hours"
  sms_price_expiry: "7 days"
  max_price_drop: "25%"
  max_below_median: "25% (state-level)"
  min_suppliers_for_median: 5
---

# Price Pipeline

## Overview

Prices enter via two channels (scraping and SMS), pass through validation, and are stored in `supplier_prices`. The scraper runs on a distributed schedule (8AM–6PM EST) with per-supplier timing. Aggregator signals are stored but never displayed.

## Data Flow

```
scrape-config.json → DistributedScheduler (hash-based time per supplier)
                   → priceScraper.js (fetch + extract — primary + fuels.* secondaries)
                   → validate ($2.00–$5.00) + 25% drop protection + 20% outlier detection
                   → supplier_prices (source_type='scraped', expires 48h)
                     [V3.x.0: DistributedScheduler now stores secondary fuels too;
                      previously only the 4PM `runScraper` cron stored them.]

SMS inbound → sms-price-service.js (parse + match by phone_last10)
           → two-step confirm (first time) or direct (returning)
           → supplier_prices (source_type='supplier_sms', expires 7 days)
```

## Leaderboard Verification Scrape

The `/api/market/leaderboard` endpoint shows Top 5 cheapest suppliers. On cache miss (every 30 min), any top-5 supplier whose price is >4 hours stale is re-scraped inline before caching. This ensures the most visible prices are fresh. Re-scraped prices are stored with `notes='leaderboard-verify'`. Max latency: ~15s (5 suppliers × ~3s each, worst case).

Constant: `LEADERBOARD_STALE_THRESHOLD_MS = 4 hours` (in `src/routes/market.js`)

## Scraper Extraction Patterns

Five pattern types in scrape-config.json:
- **direct**: First regex match on page
- **table**: Tiered pricing — sorts ascending, takes lowest (highest-volume tier). `targetTier` overrides selection
- **split**: Price split across HTML elements (e.g., "$3" + "199" = $3.199)
- **json_api**: Fetch JSON endpoint, extract via dot-notation `jsonPath`. **V2.15.0** — secondary fuels (e.g. kerosene) can define their own `fuels.<fuel>.apiUrl` + `jsonPath` for a separate call; the regex-based `fuels.<fuel>.priceRegex` path still applies when the primary value is a text blob. Per-fuel failures log to console and are omitted from `fuelPrices` but do not fail the primary scrape. Note: `SupplierPrice.fuelType` is an ENUM of `('heating_oil', 'kerosene')` — adding a fuel beyond this list requires coordinated ENUM + FUEL_PRICE_RANGES + model change.
- **post_form** (V3.0.0): POST form-encoded body (e.g. `wcp_id=2&zip_code=06712`) to a price endpoint, then extract from the returned HTML using the same tier-sort logic as `table`. Used for Droplet-hosted suppliers (`hostGroup: "droplet"`). Browser-class User-Agent + supplier-homepage Referer required — bot UAs are rejected. Kill switch: `SCRAPE_SKIP_DROPLET=true`. **Multi-fuel (heatingoil-qt3c)**: Droplet returns identical HTML structure for every product, so secondary fuels need a per-fuel `formBody` override (e.g. `fuels.propane.formBody.wcp_id="1"`). The scraper does a separate POST per fuel, throttled 1500ms apart, after the primary POST succeeds. Secondary failures log with `[multi-fuel-post]` prefix and never affect primary success or the Droplet circuit breaker. `extractFuelPrices()` skips any fuel that declares `formBody` to prevent same-HTML-bleed (running propane regex against oil HTML would match because the markup is identical).

### `primaryFuelOptional` (V3.x.0)

Per-entry config flag. When `true`, primary heating-oil regex no-match does NOT increment failure counters as long as at least one `fuels.*` secondary regex succeeded — the failure path calls `recordSuccess` instead of `recordFailure`, and any captured secondary fuel prices are stored as usual. Used for suppliers who deliver heating oil but currently publish only secondary-fuel prices (e.g., propane), so we can capture what they DO publish without cycling through cooldown. When the primary fuel republishes, the strict regex matches and the ordinary success path runs — flag becomes a no-op. Default undefined preserves existing behavior for all other suppliers. Logged at `warn` level when active so silent primary-skips remain visible to operators. Gate logic lives in `shouldSkipFailureCounter(config, result)` in `src/services/scrapeBackoff.js` and is called from both production scrape paths (`scripts/scrape-prices.js` failure branch and `src/services/DistributedScheduler.js` failure branch). First user: `buxtonoil.com`.

**DB side (kjnt, migration 171).** ScrapeConfigSync mirrors the JSON flag onto `suppliers.primary_fuel_optional` (BOOLEAN NOT NULL DEFAULT false) so HEALTH-bucket SQL queries can join against it without re-loading the config. The flag is the authoritative answer to *"when this supplier appears in a query, may a non-oil row count for any-fuel-fresh purposes?"*. State-transition logic in `ScrapeConfigSync._syncSupplier` updates the column on flips and logs a warning so silent re-flagging is visible. The multi-branch path intentionally does NOT propagate the flag (per the `_syncSupplierCoverage` per-branch-migrations contract — branches use their own migrations for supplier-row attributes).

### Fuel-aware HEALTH queries

Operator-facing dashboards (Command Center, daily health email, price-review stale list, supplier-lifecycle classification) used to filter `fuel_type = 'heating_oil'` directly, which false-flagged `primaryFuelOptional` suppliers as stale/broken whenever their oil was intentionally dark. The canonical fix lives in `src/utils/supplier-health-price-query.js` (kjnt). Three exports:

- `healthFuelPredicate({ pricesAlias, suppliersAlias })` — drop-in SQL fragment `(sp.fuel_type = 'heating_oil' OR s.primary_fuel_optional = true)` for inline JOIN/WHERE use. Aliases configurable so the same fragment works in LATERAL subqueries, correlated subqueries, and outer queries.
- `healthTieBreak({ pricesAlias })` — companion fragment for DISTINCT ON / ORDER BY tiebreaks. Prefers heating_oil rows when present (so non-PFO suppliers behave exactly as before), falls back to the freshest non-oil row otherwise.
- `buildLatestHealthPriceCTE({ cteName, pricesAlias, suppliersAlias, includePrice, extraWhere })` — emits a `WITH ${cteName} AS (...)` CTE for the standard "latest health price per supplier" pattern. Always includes `fuel_type AS health_fuel_type` in the SELECT list. `includePrice: true` adds `price_per_gallon`. `extraWhere` is pass-through only — the helper deliberately does NOT bake `source_type` policy (some HEALTH sites count aggregator_signal rows, others don't; the call site decides).

**Visible-price sites must carry `health_fuel_type`.** Any HEALTH query whose output includes a `price_per_gallon` column must also surface `health_fuel_type` to the consumer, so non-oil prices for PFO suppliers can be labeled (otherwise the operator sees Buxton's propane price under an "oil" header). Eight such sites enumerated in bead `heatingoil-kjnt`. When adding a visible-price column to a SQL result, also add the column to the route's response mapping — Sequelize doesn't auto-extend enumerated mappings, and the new column will silently drop from the JSON payload otherwise (caught in Phase 3b as a fix-forward).

**HEALTH vs FEATURE bucket.** Not every `fuel_type = 'heating_oil'` filter is a HEALTH bug. The classification axis is: *"when this query hits a PFO supplier, should it use their freshest non-oil row?"* — HEALTH = yes (am-I-alive answer), FEATURE = no (oil-labeled UI, fuel-specific bands, per-fuel breakdown columns). Per-fuel awareness for FEATURE-bucket sites is deferred until propane-primary / kerosene-primary listings exist; the 15 enumerated FEATURE sites are tracked in a follow-up bead.

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
- 25% outlier detection: if new price is >25% below the **state** median (needs ≥5 suppliers in that state), it's rejected — catches scraping artifacts like card prices or wrong page sections
- Auto-heal: if no valid prices but recently-scraped ones exist (within 7 days), extends their expiry by 48h
- Distributed scheduler: SHA256(supplier_id) mod 600 minutes → stable daily time + ±15min jitter
- Failure rate alert fires when >20% of scrapes fail in a run
- Inter-request delay: 2 seconds between suppliers
- Default `min_gallons`: 150 for both channels
- SSL bypass (`ignoreSSL`) temporarily disables cert verification for self-signed sites

Last audited: 2026-03-13
