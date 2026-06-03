---
system: website-generation
tags: [generators, seo, build, css, static-pages]
constants:
  min_suppliers_to_generate: "3"
  min_priced_to_index: "2"
  index_price_window_days: "14"
  seo_price_range: "$2.00–$6.00"
  zip_quality_threshold: "0.3"
  county_quality_threshold: "0.45"
---

# Website Generation

## Overview

Seven generators produce static HTML served by Express, orchestrated from server.js. Pages regenerate daily at 11:00-11:35 PM EST (staggered cron) and on every deploy (Railway containers start fresh; startup regen IIFE at server.js startup). All output folders are gitignored — the DB is the source of truth. All 14 startup regen call sites are wrapped in `cronMonitor.run`; failures show up in the 6AM daily email via `getDailyHealth()`.

Local dev: run `npm run regen` (requires `DATABASE_URL`; `ALLOW_PROD=1` for Railway URL) to populate `website/prices/`, `website/supplier/`, `website/heating-cost/`, `website/average-heating-bill/`, `website/price-trend/`, and `website/sitemap.xml` from the DB. Run once after a fresh clone before `node server.js` for local preview. The build pipeline minifies CSS/JS with esbuild and auto-versions CSS via content hash.

## Hub & Spoke Architecture

```
State Hub (/prices/{state}/index.html)
  → Regional Pages (/prices/{state}/{region-slug}.html)  [NY, CT only]
  → County Pages (/prices/{state}/{county}-county.html)
  → City Pages (/prices/{state}/{city}.html)

ZIP Elite (/prices/zip/{3-digit-prefix}.html)
County Elite (/prices/county/{state}/{slug}.html)
Supplier Profiles (/supplier/{slug}.html)
```

All pages require minimum 3 suppliers after price validation ($2.00–$6.00). Below threshold → page deleted and not regenerated.

## Generator Thresholds

| Generator | Threshold | Notes |
|---|---|---|
| SEO pages (generate) | 3 suppliers serving | State, region, county, city. `MIN_SUPPLIERS_TO_GENERATE` |
| SEO pages (index) | ≥2 priced suppliers in last 14d | Pages below threshold are still generated but emit `<meta robots noindex,follow>`. `MIN_PRICED_TO_INDEX` × `INDEX_PRICE_WINDOW_DAYS` |
| ZIP Elite | quality score ≥ 0.3 | Based on supplier count + data depth |
| County Elite | quality score ≥ 0.45 | Tier 1+2 counties only |
| Supplier profiles | All active suppliers | No threshold — one page per supplier |

## Index gating (two-threshold model)

The SEO generator (`scripts/generate-seo-pages.js`) uses two separate thresholds:

| Constant | Counts | Decides |
|---|---|---|
| `MIN_SUPPLIERS_TO_GENERATE = 3` | Suppliers serving the location's ZIPs (current state) | Whether the HTML file exists at all |
| `MIN_PRICED_TO_INDEX = 2` over `INDEX_PRICE_WINDOW_DAYS = 14` | Distinct suppliers with a fresh price in the window, restricted to displayable suppliers and the valid price range, excluding `source_type = 'aggregator_signal'` | Whether the page is indexable (`<meta robots>` + sitemap) |

Pages that pass the first gate but fail the second are still written to disk (so direct visitors, claim-funnel traffic, and iOS app deep links work) but emit `<meta name="robots" content="noindex, follow">` in their head. `generate-sitemap.js` reads each generated file's head and excludes any that declare noindex.

Why two thresholds: serving-supplier count is *durable* (changes when dealers go bankrupt, claim listings, or expand coverage), while priced-supplier count is *volatile* (changes daily with scraper success/failure). The 14-day window absorbs single-day or multi-day scraper outages so noindex doesn't flap.

**Failure handling:** the `getRecentPricedSupplierIds` helper is **not** wrapped in try/catch. If it throws, the throw bubbles up to `cronMonitor.run`, which retries (heating_oil only — `seo-pages` uses `retry: true`; kerosene/propane wrappers use `retry: false`) and logs to `cron_error_log` so the failure surfaces in the 6 AM email via `getDailyHealth()`. The throw happens before the per-state cleanup-and-swap, so existing pages on disk stay served.

**Visibility:** each fuel run logs a summary line like `✅ heating_oil: generated 1503 pages, 156 noindexed (10.4%)` to Railway stdout. The same count is threaded into `cron_heartbeats.details` for ad-hoc DB queries; surfacing in the daily email body is a follow-up edit to `CoverageReportMailer.js` (not in v1 scope).

**Kill switch:** set `DISABLE_NOINDEX_THIN_PAGES=true` on Railway to force every page indexable. Railway restarts the service automatically on env-var change; the next nightly regen drops the meta tags. Use only if Google starts depublishing strong pages or some other regression appears.

**Cloudflare cache caveat:** the CF "Cache HTML pages" rule on `/prices/*` paths has a ~4h Edge TTL and ignores origin Cache-Control. After the first nightly regen ships new noindex tags, CF may serve old cached pages for up to 4h. Practical timing: 11 PM regen → CF revalidation up to 4h → Googlebot recrawl → GSC reclassification. First-deploy reclassification may take 48-72h.

See `docs/superpowers/specs/2026-05-01-thin-town-page-noindex-design.md` (in the meta repo) for the full design rationale.

## Stale Page Cleanup

SEO generator deletes ALL `.html` files in each state directory before regenerating. If a county drops below 3 suppliers, its old page is removed — not left stale.

## Confidence Bands (Never Numeric)

| Score | County label | ZIP label | Color |
|---|---|---|---|
| ≥ 0.80 | High | High | Green |
| ≥ 0.60 | Good | Moderate | Blue/Yellow |
| ≥ 0.40 | Moderate | — | Yellow |
| < 0.40 | Limited | Limited Data | Red |

## CSS Class Scoping Rules

Cards and tables share class names (`supplier-price`, `supplier-phone`, `supplier-website`). Always scope to parent:
- `.supplier-card .supplier-phone { ... }` — card context
- `.supplier-table .supplier-phone { ... }` — table context

Supplier profile pages use the `sp-` prefix convention: `.sp-supplier-name`, `.sp-price-display`, `.sp-freshness-badge`. Profile CSS must never use bare `.supplier-*` classes.

## Build Pipeline

1. Minify `website/style.css` → `website/style.min.css` (esbuild, `loader: 'css'`)
2. Compute content hash of `style.min.css` → replace `?v=N` with `?v={hash}` in all generated HTML
3. Minify JS in `website/js/` → `.min.js` (esbuild, target `es2018`, skip existing `.min.js`)
4. Report size reduction summary

## Regional Configuration

Only NY and CT have multi-county regions:
- **Long Island**: Nassau, Suffolk
- **Hudson Valley**: Dutchess, Orange, Putnam, Ulster, Rockland
- **Capital Region**: Albany, Rensselaer, Saratoga, Schenectady
- **CT Shoreline**: (single region)

All other states: state → county → city (no regional rollup).

## Profile Page Price Display

The supplier's *own* price card on `/supplier/<slug>` filters
`supplier_prices` by `is_valid = true AND scraped_at > NOW() - INTERVAL '14
days'` (V3.x.0). Without that window, leftover rows from disabled-but-not-
cleaned-up suppliers (site-redesign cases like Buxton, Red Door Oil, Williams
Fuel Oil) would render as `$X.XX · stale · MMM D`. 14 days matches
`INDEX_PRICE_WINDOW_DAYS` and the nearby-suppliers filter (below). When a
supplier resumes scraping, the new price flows through normally on the next
nightly regen.

## Nearby Suppliers (Profile Pages)

- Scored by: `(countyOverlap × 10) + zipOverlap`
- Tier 1 (strong overlap): sorted by score DESC, price ASC
- Tier 2 (same state only): sorted by price ASC
- Returns up to 5 if ≥3 strong results, otherwise caps at 3
- Excludes suppliers with no price update >14 days

## County Elite Page Structure (Action-First Layout)

County elite pages use an action-first layout (since 2026-03-13) that puts suppliers above the fold:

1. **Header**: H1 + compact price headline (median, supplier count, lowest price, savings vs median)
2. **Call prompt**: "Call the lowest-price supplier now to order delivery →" links to #suppliers
3. **ZIP filter**: Client-side filtering via `county-zip-filter.js`. ZIP coverage stored as JSON map in `<script>window.__supplierZips = {...}</script>`. Each `<tr>` has `data-supplier-id` for JS lookup. Zero-match fallback shows all rows with message.
4. **Supplier table**: Enhanced with delivery cost (`price × minGallons`), freshness dots (`computeFreshness()`), best-price badge + row highlight, price delta vs lowest ("≈$38 more per delivery"), "Call to Order" header
5. **Below table**: Trust line, "How to order" details, claim link, nearby counties with median prices
6. **App CTA**: Positioned after supplier table (natural trigger point)
7. **Remaining sections**: Price trend alert, chart, heating cost insights, market snapshot, ZIP breakdown, email alerts, SEO text, FAQ

Legacy layout available via `--legacy-layout` CLI flag.

### CSS Scoping

All county elite CSS is in `generateCountyEliteCSS()` within the generator, scoped under `.county-elite-page`. Table sub-line classes (`.price-amount`, `.price-delivery`, `.price-delta`) MUST stay scoped — never added to base `style.css`.

### Nearby Counties

Auto-generated from counties sharing the same state, plus hardcoded cross-border adjacency (e.g., Westchester↔Fairfield). Includes median price in link text. Limited to 5 neighbors.

## Page Metadata (Title + Description)

State, county, and city `<title>` and `<meta description>` are generated by `scripts/lib/seo-meta.js` (CTR-optimized, length-guarded via `fitTitle`/`clampDesc`). The shared `<title>` and `og:title` in `generatePageHTML` no longer embed the build date (de-staled as of heatingoil-qbd0.2); the visible "Updated {date}" header in the page body remains unchanged.

## Key Rules

- Startup page generation delayed 10s (lets healthcheck pass first)
- Asset paths use relative URLs (`../../`, `../../../`) based on directory depth
- All generated pages include: analytics, nav.js, widgets.js, pwa.js, Smart App Banner meta tag
- Schema.org structured data: BreadcrumbList, FAQPage, LocalBusiness on all SEO pages
- Trending thresholds: <2% stable, 2–5% slight, 5–15% moved, ≥15% sharp
- Chart.js: 12-week history for ZIP, 6-week display for county (`.slice(-6)`)

Last audited: 2026-03-13
