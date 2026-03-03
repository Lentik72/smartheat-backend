#!/usr/bin/env bash
# Verify Railway deployment health
# Usage: npm run verify-deploy
#        npm run verify-deploy -- --skip-wait

set -euo pipefail

BASE_URL="https://www.gethomeheat.com"
WAIT_SECONDS=75
TIMEOUT=5

# Parse args
for arg in "$@"; do
  case $arg in
    --skip-wait) WAIT_SECONDS=0 ;;
  esac
done

echo "=== Deploy Verification ==="

# Wait for deploy to propagate
if [ "$WAIT_SECONDS" -gt 0 ]; then
  echo "Waiting ${WAIT_SECONDS}s for deploy to propagate..."
  sleep "$WAIT_SECONDS"
fi

# 1. Health check — fail fast on non-200 or slow response
echo ""
echo "Checking /health..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" "${BASE_URL}/health" 2>/dev/null || echo "000")

if [ "$HTTP_CODE" != "200" ]; then
  echo "FAIL: /health returned HTTP $HTTP_CODE (expected 200)"
  exit 1
fi

# Check response time
RESPONSE_TIME=$(curl -s -o /dev/null -w "%{time_total}" --max-time "$TIMEOUT" "${BASE_URL}/health" 2>/dev/null || echo "99")
SLOW=$(echo "$RESPONSE_TIME > 5.0" | bc -l 2>/dev/null || echo "0")
if [ "$SLOW" = "1" ]; then
  echo "FAIL: /health took ${RESPONSE_TIME}s (threshold: 5s)"
  exit 1
fi

# Parse health response
HEALTH_BODY=$(curl -s --max-time "$TIMEOUT" "${BASE_URL}/health" 2>/dev/null)

# Check for JSON (Railway can return HTML error pages)
if ! echo "$HEALTH_BODY" | grep -q '"status"'; then
  echo "FAIL: /health returned non-JSON response"
  echo "$HEALTH_BODY" | head -3
  exit 1
fi

# Check healthy status
if ! echo "$HEALTH_BODY" | grep -q '"healthy"'; then
  echo "FAIL: /health status is not 'healthy'"
  echo "$HEALTH_BODY"
  exit 1
fi

# Check database
if ! echo "$HEALTH_BODY" | grep -q '"database":true'; then
  echo "FAIL: database is not connected"
  echo "$HEALTH_BODY"
  exit 1
fi

echo "  /health: OK (${RESPONSE_TIME}s)"

# 2. Spot-check pages
echo ""
echo "Spot-checking pages..."
PAGES=("/" "/prices" "/for-suppliers")
FAILED=0

for PAGE in "${PAGES[@]}"; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" "${BASE_URL}${PAGE}" 2>/dev/null || echo "000")
  if [ "$CODE" = "200" ]; then
    echo "  ${PAGE}: OK"
  else
    echo "  ${PAGE}: FAIL (HTTP $CODE)"
    FAILED=1
  fi
done

echo ""
if [ "$FAILED" = "1" ]; then
  echo "FAIL: Some pages did not return 200"
  exit 1
fi

echo "PASS: All checks passed"
exit 0
