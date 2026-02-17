# Supplier Research Mode

You are now in **supplier research mode**. Follow these rules strictly for ALL supplier research and additions.

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
Search scrape-config.json and supplier pages for the supplier name.

### Step 2: Visit Company Website
- Look for COD/will-call language (see above)
- Check for public prices on homepage, /pricing, /prices
- Find: address, phone, hours, service area, payment methods

### Step 3: Collect Required Data
| Field | Source |
|-------|--------|
| name, phone, address | Company website |
| hours | Company website > Yelp/Google |
| emergencyDelivery | Look for "24/7", "emergency service" |
| paymentMethods | credit_card, cash, check, etc. |
| minimumGallons | Often 100 or 125 |
| seniorDiscount | true if mentioned |
| postalCodesServed | Company site > HeatFleet > FuelWonk |
| serviceCities | List of towns |
| serviceCounties | List of counties |

### Step 4: Price Scraping Decision
If prices are publicly displayed as static HTML:
- Set `allowPriceDisplay: true`
- Add to `scrape-config.json`

If prices are behind forms, JS, or "call for quote":
- Set `allowPriceDisplay: false`
- Do NOT add to scrape-config

### Step 5: Create Migration
File: `src/migrations/0XX-add-[region]-suppliers.js`
Use existing migrations (049, 050) as templates.
**CRITICAL**: Use `=== true` not `!== false` for boolean fields.

### Step 6: Register & Deploy
1. Add to `server.js` migration block
2. Add to `scrape-config.json` if scrapable
3. Commit and push

## DO NOT ADD If:
- No explicit COD/will-call language on their site
- HVAC-only company (no fuel delivery)
- Aggregator/broker/reseller
- Acquired, closed, or merged
- Uses Droplet/third-party ordering with no public prices
- "Call for pricing" model with no displayed prices

## Research Target: $ARGUMENTS

Now research the supplier(s) specified, following these rules strictly.
