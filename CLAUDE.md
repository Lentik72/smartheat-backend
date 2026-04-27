# HomeHeat Backend — Claude Instructions

Before modifying files in `src/` or `scripts/`, check the lookup table and read the relevant doc.

Docs are the source of behavioral truth for non-obvious logic. When code and doc disagree, the doc defines intended behavior. When you change logic in a documented system, update the doc in the same commit.

Docs capture non-obvious behavioral rules and drift-prone constants — not full architecture explanations.

After changing key constants, run `npm run audit-docs`.

## Doc Lookup Table

| Working on... | Read first |
|---|---|
| priceScraper, scrapeBackoff, ScrapeConfigSync, sms-price-service, SupplierPrice, DistributedScheduler, scrape-prices, scrape-config.json | `docs/price-pipeline.md` |
| Supplier model, upsert-supplier, migrations adding suppliers, supplier-claim, supplier-update, claim-page, admin-supplier-claims | `docs/supplier-lifecycle.md` |
| generate-seo-pages, generate-supplier-pages, generate-zip-elite-pages, generate-county-elite-pages, build.js, style.css, any HTML template | `docs/website-generation.md` |
| Redesigning a generated page (state landing, supplier, ZIP, fuel-hub, county v3, dashboard layout) — parallel-URL rollout, tokens-r2, renderer modules, tiebreak, sticky bar, honesty rules | `docs/page-redesign-patterns.md` |
| server.js middleware, cron jobs, health endpoint, Railway deploy, env vars, package.json scripts | `docs/deployment.md` |

## Architecture

- Two git repos: outer monorepo (`HeatingOil/`) and nested backend (`SmartHeatIOS/backend/`)
- Railway deploys from `Lentik72/smartheat-backend` repo's `main` branch
- Website served by Express static from `website/` directory
- Frontend JS uses **relative URLs** for API calls (same-origin), never the Railway URL
- Build script (`scripts/build.js`) minifies CSS/JS but does NOT touch server.js

## Deploy & Rollback

- **Deploy**: `npm run build && git push` (Railway auto-deploys from main). Verify with `npm run verify-deploy` (75s wait) or `npm run verify-deploy -- --skip-wait`. Use `--full` for API shape checks + sitemap + 404 handling.
- **Rollback**: If a deploy breaks prod, revert the commit and push: `git revert HEAD && git push`. Railway will deploy the reverted state. Alternatively, use the Railway dashboard → Deployments → click the previous successful deploy → "Rollback". Failed deploys don't take the site down — Railway keeps the last healthy version active until a new healthy deploy succeeds.

## Coding Standards

- No shortcuts, no patches, no hacks. Implement the proper solution on the first attempt.
- Research official documentation before implementing. Don't guess at APIs or library behavior.
- When something breaks, find the root cause — don't layer workarounds.
- **Patch test — ask BEFORE writing any fix:**
  1. Does this discard data or signal? (If yes → keep it, classify it instead)
  2. Does this hide a problem from the operator? (If yes → surface it, don't suppress it)
  3. Does this only work because of today's assumptions? (If yes → design for the general case)
  4. Would I need a second fix if the assumption changes? (If yes → it's a patch)
- MANDATORY: Local preview before every push. Never debug CSS/UI in production.
  1. Edit style.css → inspect in local sandbox → iterate with DevTools
  2. Verify in local Express server with real data (`node server.js` at localhost:3000)
  3. Only then: build, commit, push — ONE clean deploy

## CSS Danger Zone

Supplier cards and state page tables share class names: `supplier-price`, `supplier-phone`, `supplier-website`. **Any style on these classes MUST be scoped** to parent context (`.supplier-card .supplier-phone` or `.supplier-table .supplier-phone`). Supplier profile pages use the `sp-` prefix convention to isolate styles.

CSS version bumping is handled automatically by `build.js` (content-hash based). Do not manually set `?v=N` values.

## Supplier Data Rules

- COD/will-call only — no contract-only dealers
- Proof from company's own website required
- Emails stored but NEVER displayed in API
- Notes field is internal-only, never displayed
- Use `allowPriceDisplay === true` (NOT `!== false`)
- New suppliers from ScrapeConfigSync default to `active=false`

## Coverage Authority (postal_codes_served)

- `postal_codes_served` is managed exclusively by `scrape-config.json` via ScrapeConfigSync
- `postal_codes_served` MUST NEVER be written by migrations after migration 100
- Coverage changes must be done in `scrape-config.json` `postalCodesServed` field
- To shrink coverage (remove ZIPs): add `"postalCodesOverride": true` to the config entry
- Default mode is union merge: config adds ZIPs, never removes
- Emergency kill switch: set `SCRAPECONFIG_SKIP_COVERAGE=true` env var
- SMS-sourced suppliers also need a scrape-config entry for their coverage
