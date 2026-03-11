---
system: supplier-lifecycle
tags: [suppliers, claims, magic-links, migrations, upsert]
constants:
  magic_link_expiry: "365 days"
  claim_confirm_window: "24 hours"
  supplier_direct_price_range: "$1.50–$6.00"
  sweep_threshold: "50 slugs in 10 minutes"
---

# Supplier Lifecycle

## Overview

Suppliers progress through: research → migration → config sync → activation → claiming → dashboard. Only COD/will-call dealers are listed. Emails are stored but never displayed in API responses. Notes are internal-only.

## Lifecycle Stages

```
Research (verify COD, website proof)
  → Migration (NNN-add-[region]-suppliers.js, uses upsertSupplier)
  → ScrapeConfigSync (auto-creates DB record if config has postalCodesServed)
  → Activation (set active=true via migration — sync defaults to active=false)
  → Claiming (supplier submits claim form → admin verifies → magic link issued)
  → Dashboard (update prices via magic link, view engagement metrics)
```

## Coverage Authority

`scrape-config.json` is the single source of truth for `postal_codes_served`. The DB column is a cached projection of config coverage, synced by ScrapeConfigSync on each deploy.

```
scrape-config.json → ScrapeConfigSync → DB suppliers.postal_codes_served → supplierMatcher / API
migrations → supplier identity only (no coverage after migration 100)
```

- **Default mode**: union merge — config adds ZIPs, never removes from DB
- **Override mode**: set `"postalCodesOverride": true` in config entry to fully replace (can remove ZIPs)
- **Kill switch**: `SCRAPECONFIG_SKIP_COVERAGE=true` env var skips all coverage writes
- **Drift logging**: ScrapeConfigSync logs `DRIFT` when DB and config disagree — update config to eliminate
- **SMS suppliers**: Need a scrape-config entry (can be `"pattern": "none"`) for their coverage

## ScrapeConfigSync Behavior

- Matches existing suppliers by normalized domain (strip protocol, www, trailing slash, lowercase)
- New suppliers created with `active=false` — prevents unvetted listings appearing
- Re-enable logic: if config has `enabled=true` but DB has `allow_price_display=false`, resets scrape status and clears all failure counters
- Only processes config entries with `postalCodesServed` array (ignores `_`-prefixed metadata sections)
- Coverage sync: normalizes ZIPs to 5 digits, deduplicates, sorts deterministically, skips update if no change (idempotent)
- Warns on large shrink (>30% or >20 ZIPs removed via override) and massive expansion (>3x)

## Claim Verification Flow

1. Supplier submits claim at `/api/supplier-claim` with name, email, phone, role
2. **Bot detection**: server-side timing validation (reject if <3s or >30min), honeypot field
3. **Rate limits**: 3 claims/email/day, 10 claims/IP/day
4. **Unique constraint**: partial unique index on `(supplier_id) WHERE status IN ('pending', 'verified')` — prevents simultaneous claims, but rejected claims allow retry
5. Admin notified via email → verifies via phone call
6. Admin hits `/api/admin/supplier-claims/:id/verify` → sets `verified=true`, `claimed_at=NOW()`
7. All existing magic links revoked → new 64-char hex token generated (365-day expiry)
8. Magic link emailed to claimant

## Magic Link Token System

- Token: `crypto.randomBytes(32).toString('hex')` — 64 hex chars, 256 bits entropy
- Purpose types: `price_review`, `supplier_price_update`
- Tracks: `first_used_at`, `last_used_at`, `use_count`, IP, user agent
- Validation: not revoked, not expired, purpose matches
- One valid link per supplier (old ones revoked on regeneration)

## Price Update via Dashboard

- GET `/api/supplier-update?token=xxx` — returns current price + 5-entry history + engagement metrics
- POST `/api/supplier-update/price` — validates price ($1.50–$6.00), stores as `source_type='supplier_direct'` with 7-day expiry
- Min gallons validation: 50–500 (default: 100)

## Slug Sweep Detection

Claim page tracks distinct slugs per IP in 10-minute windows. If >50 slugs accessed, applies progressive 800ms delay per request. Stale entries cleaned every 5 minutes.

## Key Rules

- `allowPriceDisplay === true` is the correct check (not `!== false`)
- Upsert uses `ON CONFLICT (slug) DO UPDATE` for migration idempotency
- Slug generation: name → lowercase + hyphens, collision detection with numbered suffix (-2, -3)
- Claimed suppliers show extended details (hours, payment methods, fuel types, senior discount)
- Unclaimed suppliers show basic info only (name, phone, website, location)
- Field display: email and notes NEVER in API responses (removed in V2.13.0 and V2.0.2)

Last audited: 2026-03-02
