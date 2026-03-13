---
system: website-generation
tags: [generators, seo, build, css, static-pages]
constants:
  min_suppliers_for_page: "3"
  seo_price_range: "$2.00–$6.00"
  zip_quality_threshold: "0.3"
  county_quality_threshold: "0.45"
---

# Website Generation

## Overview

Four generators produce static HTML served by Express. Pages regenerate daily at 11PM EST and on every deploy (Railway containers start fresh). The build pipeline minifies CSS/JS with esbuild and auto-versions CSS via content hash.

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
| SEO pages | 3 suppliers | State, region, county, city |
| ZIP Elite | quality score ≥ 0.3 | Based on supplier count + data depth |
| County Elite | quality score ≥ 0.45 | Tier 1+2 counties only |
| Supplier profiles | All active suppliers | No threshold — one page per supplier |

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

## Key Rules

- Startup page generation delayed 10s (lets healthcheck pass first)
- Asset paths use relative URLs (`../../`, `../../../`) based on directory depth
- All generated pages include: analytics, nav.js, widgets.js, pwa.js, Smart App Banner meta tag
- Schema.org structured data: BreadcrumbList, FAQPage, LocalBusiness on all SEO pages
- Trending thresholds: <2% stable, 2–5% slight, 5–15% moved, ≥15% sharp
- Chart.js: 12-week history for ZIP, 6-week display for county (`.slice(-6)`)

Last audited: 2026-03-13
