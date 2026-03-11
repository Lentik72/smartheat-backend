# Supplier Research Mode

You are now in **supplier research mode**. Follow these rules strictly for ALL supplier research and additions.

Full ruleset is in memory at `supplier-research-rules.md`. This is the quick-reference version.

## CRITICAL: Verification Standard

**Being listed on HeatFleet, FuelWonk, or any COD directory is NOT enough proof.**

You MUST find evidence on the **company's OWN website** with explicit language:
- "COD" or "Cash on Delivery"
- "Will call" or "Will-call"
- "Pay at delivery"
- "No contract required"
- "On demand"
- "Order when you need"
- "10 day cash prices" (implies COD)

If you cannot find this language on their own site, the supplier **DOES NOT QUALIFY**.

## Research Workflow

### Step 1: Check if Already Exists
Search scrape-config.json, _ignore_list, _future_contract_oil, and supplier pages for the supplier name, phone, and address.

### Step 2: Visit Company Website
- Look for COD/will-call language (see above)
- Check for public prices on homepage, /pricing, /prices
- Find: address, phone, hours, service area, payment methods

### Step 3: Collect Required Data
| Field | Where it goes |
|-------|---------------|
| name, phone, address, hours | Migration |
| emergencyDelivery, weekendDelivery | Migration |
| paymentMethods, fuelTypes | Migration |
| minimumGallons, seniorDiscount | Migration |
| serviceCities, serviceCounties | Migration |
| **postalCodesServed** | **scrape-config.json** (NOT migration) |
| allowPriceDisplay | Migration |

### Step 4: Price Scraping Decision
If prices are publicly displayed as static HTML or via got-scraping:
- Set `allowPriceDisplay: true` in migration
- Add to `scrape-config.json` with `"enabled": true`

If prices are behind forms, JS, Cloudflare, or "call for quote":
- Set `allowPriceDisplay: false` in migration
- **Still add to scrape-config.json** with `"enabled": false, "pattern": "none"`

**Every supplier gets a scrape-config.json entry** — this is where coverage lives.

### Step 5: Create Migration (identity only — no coverage)
File: `src/migrations/NNN-add-[region]-suppliers.js`
Use `upsertSupplier` from `./lib/upsert-supplier.js`.
**Do NOT include `postalCodesServed`** — coverage is managed by scrape-config.json.
**CRITICAL**: Use `=== true` not `!== false` for boolean fields.

### Step 6: Add scrape-config.json Entry
Every supplier needs an entry with `postalCodesServed`:
```json
"example-domain.com": {
  "enabled": true,
  "pattern": "direct",
  "notes": "NY Kingston/Ulster County - COD price shown",
  "priceRegex": "\\$([0-9]+\\.[0-9]{2,3})",
  "postalCodesServed": ["12401", "12402", "12404"]
}
```

For non-scrapable suppliers:
```json
"example-domain.com": {
  "enabled": false,
  "pattern": "none",
  "notes": "DISABLED: NY Kingston - call for pricing",
  "postalCodesServed": ["12401", "12402", "12404"]
}
```

### Step 7: Register & Deploy
1. Add migration to `server.js` migration block
2. Commit and push
3. Wait ~90s, verify supplier pages return 200

## DO NOT ADD to Production If:
- No explicit COD/will-call language on their site
- HVAC-only company (no fuel delivery)
- Aggregator/broker/reseller
- Acquired, closed, or merged
- Contract-only company (automatic delivery, budget plans required)

## Contract Companies: Stage for Future

If you find a quality supplier that is **contract-only** (no COD option):
1. Do NOT add to database migration
2. Add to `scrape-config.json` under `_future_contract_oil` section
3. Include: name, website, notes on why they're contract-only

## Fuel Type Handling

- Oil suppliers → `fuel_types: ['heating_oil']`
- Propane suppliers → `fuel_types: ['propane']`
- Dual-fuel suppliers → `fuel_types: ['heating_oil', 'propane']`

App has separate oil and propane directories. Database is unified, UI is filtered.

## Research Target: $ARGUMENTS

Now research the supplier(s) specified, following these rules strictly.
