#!/usr/bin/env bash
# Audit doc frontmatter constants against source code
# Usage: npm run audit-docs
#
# Checks only constants that historically drift:
# price ranges, expiry times, cooldown thresholds
# macOS-compatible (no grep -P)

set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$BACKEND_DIR/src"
MISMATCHES=0

echo "=== Doc Constants Audit ==="
echo ""

# Extract a numeric value after "=" from a line matching a pattern
extract() {
  local file="$1" pattern="$2"
  local line
  line=$(grep -E "$pattern" "$file" 2>/dev/null | head -1) || true
  if [ -z "$line" ]; then
    echo "?"
    return
  fi
  echo "$line" | sed -E 's/.*=[[:space:]]*([0-9]+\.?[0-9]*).*/\1/'
}

# --- price-pipeline.md ---
echo "price-pipeline.md"

SMS_MIN=$(extract "$SRC/services/sms-price-service.js" 'PRICE_MIN\s*=')
SMS_MAX=$(extract "$SRC/services/sms-price-service.js" 'PRICE_MAX\s*=')
echo "  SMS price range: $SMS_MIN – $SMS_MAX (doc: 1.50 – 8.00)"
[ "$SMS_MIN" != "1.50" ] || [ "$SMS_MAX" != "8.00" ] && [ "$SMS_MIN" != "?" ] && MISMATCHES=$((MISMATCHES + 1)) && echo "    ^ MISMATCH" || true

COOLDOWN=$(extract "$SRC/services/scrapeBackoff.js" 'COOLDOWN_DAYS\s*=')
echo "  Backoff cooldown: ${COOLDOWN} days (doc: 7)"
[ "$COOLDOWN" != "7" ] && [ "$COOLDOWN" != "?" ] && MISMATCHES=$((MISMATCHES + 1)) && echo "    ^ MISMATCH" || true

MAX_CONSEC=$(extract "$SRC/services/scrapeBackoff.js" 'MAX_CONSECUTIVE_FAILURES\s*=')
echo "  Max consecutive failures: ${MAX_CONSEC} (doc: 2)"
[ "$MAX_CONSEC" != "2" ] && [ "$MAX_CONSEC" != "?" ] && MISMATCHES=$((MISMATCHES + 1)) && echo "    ^ MISMATCH" || true

MAX_30D=$(extract "$SRC/services/scrapeBackoff.js" 'MAX_FAILURES_IN_30')
echo "  Max failures in 30 days: ${MAX_30D} (doc: 3)"
[ "$MAX_30D" != "3" ] && [ "$MAX_30D" != "?" ] && MISMATCHES=$((MISMATCHES + 1)) && echo "    ^ MISMATCH" || true

DROP=$(extract "$BACKEND_DIR/scripts/scrape-prices.js" 'MAX_PRICE_DROP')
echo "  Max price drop: ${DROP} (doc: 0.25)"
[ "$DROP" != "0.25" ] && [ "$DROP" != "?" ] && MISMATCHES=$((MISMATCHES + 1)) && echo "    ^ MISMATCH" || true

echo ""

# --- supplier-lifecycle.md ---
echo "supplier-lifecycle.md"

LINK_DAYS=$(extract "$SRC/routes/admin-supplier-claims.js" 'MAGIC_LINK_EXPIRY_DAYS[[:space:]]*=')
echo "  Magic link expiry: ${LINK_DAYS} days (doc: 30)"
[ "$LINK_DAYS" != "30" ] && [ "$LINK_DAYS" != "?" ] && MISMATCHES=$((MISMATCHES + 1)) && echo "    ^ MISMATCH" || true

CLAIMS_EMAIL=$(extract "$SRC/routes/supplier-claim.js" 'MAX_CLAIMS_PER_EMAIL')
echo "  Claims per email/day: ${CLAIMS_EMAIL} (doc: 3)"
[ "$CLAIMS_EMAIL" != "3" ] && [ "$CLAIMS_EMAIL" != "?" ] && MISMATCHES=$((MISMATCHES + 1)) && echo "    ^ MISMATCH" || true

CLAIMS_IP=$(extract "$SRC/routes/supplier-claim.js" 'MAX_CLAIMS_PER_IP')
echo "  Claims per IP/day: ${CLAIMS_IP} (doc: 10)"
[ "$CLAIMS_IP" != "10" ] && [ "$CLAIMS_IP" != "?" ] && MISMATCHES=$((MISMATCHES + 1)) && echo "    ^ MISMATCH" || true

echo ""

# --- website-generation.md ---
echo "website-generation.md"

MIN_SUP=$(extract "$BACKEND_DIR/scripts/generate-seo-pages.js" 'MIN_SUPPLIERS_FOR_PAGE\s*=')
echo "  Min suppliers for page: ${MIN_SUP} (doc: 3)"
[ "$MIN_SUP" != "3" ] && [ "$MIN_SUP" != "?" ] && MISMATCHES=$((MISMATCHES + 1)) && echo "    ^ MISMATCH" || true

ZIP_QUAL=$(extract "$BACKEND_DIR/scripts/generate-zip-elite-pages.js" 'MIN_QUALITY_SCORE\s*=')
echo "  ZIP quality threshold: ${ZIP_QUAL} (doc: 0.3)"
[ "$ZIP_QUAL" != "0.3" ] && [ "$ZIP_QUAL" != "?" ] && MISMATCHES=$((MISMATCHES + 1)) && echo "    ^ MISMATCH" || true

COUNTY_QUAL=$(extract "$BACKEND_DIR/scripts/generate-county-elite-pages.js" 'MIN_QUALITY_SCORE\s*=')
echo "  County quality threshold: ${COUNTY_QUAL} (doc: 0.45)"
[ "$COUNTY_QUAL" != "0.45" ] && [ "$COUNTY_QUAL" != "?" ] && MISMATCHES=$((MISMATCHES + 1)) && echo "    ^ MISMATCH" || true

echo ""

# --- deployment.md ---
echo "deployment.md"

# Rate limit line is: max: process.env.NODE_ENV === 'production' ? 100 : 1000
RATE_MAX=$(grep -E "max:.*production.*\?[[:space:]]*[0-9]+" "$BACKEND_DIR/server.js" 2>/dev/null | head -1 | sed -E "s/.*\?[[:space:]]*([0-9]+).*/\1/" || echo "?")
echo "  Rate limit max (prod): ${RATE_MAX} (doc: 100)"
[ "$RATE_MAX" != "100" ] && [ "$RATE_MAX" != "?" ] && MISMATCHES=$((MISMATCHES + 1)) && echo "    ^ MISMATCH" || true

echo ""
echo "=== Audit Complete ==="
if [ "$MISMATCHES" -gt 0 ]; then
  echo "Found $MISMATCHES constant(s) drifted from docs. Update docs or source."
  exit 1
else
  echo "All checked constants match docs."
  exit 0
fi
