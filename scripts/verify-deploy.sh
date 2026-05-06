#!/usr/bin/env bash
# Verify Railway deployment health
# Usage: npm run verify-deploy
#        npm run verify-deploy -- --skip-wait
#        npm run verify-deploy -- --full       (includes API shape checks)

set -euo pipefail

BASE_URL="https://www.gethomeheat.com"
WAIT_SECONDS=75
TIMEOUT=5
FULL_CHECK=0

# Parse args
for arg in "$@"; do
  case $arg in
    --skip-wait) WAIT_SECONDS=0 ;;
    --full) FULL_CHECK=1 ;;
  esac
done

echo "=== Deploy Verification ==="

# Wait for deploy to propagate
if [ "$WAIT_SECONDS" -gt 0 ]; then
  echo "Waiting ${WAIT_SECONDS}s for deploy to propagate..."
  sleep "$WAIT_SECONDS"
fi

FAILED=0

# ─────────────────────────────────────────────
# 1. Health check — fail fast on non-200 or slow response
# ─────────────────────────────────────────────
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

# Check migrations succeeded (added 2026-05-02 — silent migration failures
# previously left perf indexes uncreated; surfaced in /health.startup.migrations).
# Uses node JSON parser instead of grep chain — chained grep silently truncates
# if any failed[].error message contains a '}', falsely reporting success.
MIG_ERRORS=$(node -e '
  let body = "";
  process.stdin.on("data", c => body += c);
  process.stdin.on("end", () => {
    try {
      const r = JSON.parse(body);
      console.log(r.startup?.migrations?.errors ?? "0");
    } catch { console.log("0"); }
  });
' <<< "$HEALTH_BODY")
if [ "$MIG_ERRORS" != "0" ]; then
  echo "FAIL: $MIG_ERRORS migration(s) failed — check /health for details"
  node -e '
    let body = "";
    process.stdin.on("data", c => body += c);
    process.stdin.on("end", () => {
      try { console.log(JSON.stringify(JSON.parse(body).startup?.migrations ?? {}, null, 2)); }
      catch {}
    });
  ' <<< "$HEALTH_BODY"
  exit 1
fi

echo "  /health: OK (${RESPONSE_TIME}s)"

# ─────────────────────────────────────────────
# 2. Spot-check pages — core pages return 200
# ─────────────────────────────────────────────
echo ""
echo "Spot-checking pages..."
PAGES=("/" "/prices" "/for-suppliers" "/prices/ny" "/how-prices-work")

for PAGE in "${PAGES[@]}"; do
  CODE=$(curl -sL -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" "${BASE_URL}${PAGE}" 2>/dev/null || echo "000")
  if [ "$CODE" = "200" ]; then
    echo "  ${PAGE}: OK"
  else
    echo "  ${PAGE}: FAIL (HTTP $CODE)"
    FAILED=1
  fi
done

# ─────────────────────────────────────────────
# 3. API endpoint shape checks
# ─────────────────────────────────────────────
echo ""
echo "Checking API endpoints..."

# Helper: check endpoint returns 200 + JSON with expected field
check_api() {
  local path="$1"
  local expect_field="$2"
  local label="${3:-$path}"

  local BODY
  BODY=$(curl -sL --max-time "$TIMEOUT" "${BASE_URL}${path}" 2>/dev/null || echo "")

  if [ -z "$BODY" ]; then
    echo "  ${label}: FAIL (no response)"
    FAILED=1
    return
  fi

  # Check it's JSON
  if ! echo "$BODY" | grep -q '{'; then
    echo "  ${label}: FAIL (not JSON)"
    FAILED=1
    return
  fi

  # Check expected field exists
  if [ -n "$expect_field" ] && ! echo "$BODY" | grep -q "\"${expect_field}\""; then
    echo "  ${label}: FAIL (missing field: ${expect_field})"
    FAILED=1
    return
  fi

  echo "  ${label}: OK"
}

# Core public APIs
check_api "/api/v1/suppliers?zip=10001" "data" "Suppliers API (10001)"
check_api "/api/v1/heating-cost?zip=10001" "zip" "Heating cost API"

# ─────────────────────────────────────────────
# 4. Full check: additional API + page checks
# ─────────────────────────────────────────────
if [ "$FULL_CHECK" = "1" ]; then
  echo ""
  echo "Running full checks..."

  # Auth-protected endpoints — just verify they respond (200 or 401/403 = server is routing)
  for AUTH_EP in "/api/v1/intelligence/health" "/api/dashboard/cron-health"; do
    AUTH_CODE=$(curl -sL -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" "${BASE_URL}${AUTH_EP}" 2>/dev/null || echo "000")
    if [ "$AUTH_CODE" = "000" ]; then
      echo "  ${AUTH_EP}: FAIL (no response)"
      FAILED=1
    else
      echo "  ${AUTH_EP}: OK (HTTP ${AUTH_CODE})"
    fi
  done

  # Check sitemap
  SITEMAP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" "${BASE_URL}/sitemap.xml" 2>/dev/null || echo "000")
  if [ "$SITEMAP_CODE" = "200" ]; then
    SITEMAP_URLS=$(curl -s --max-time "$TIMEOUT" "${BASE_URL}/sitemap.xml" 2>/dev/null | grep -c '<loc>' || echo "0")
    echo "  /sitemap.xml: OK (${SITEMAP_URLS} URLs)"
  else
    echo "  /sitemap.xml: FAIL (HTTP $SITEMAP_CODE)"
    FAILED=1
  fi

  # Check 404 handling
  CODE_404=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" "${BASE_URL}/this-page-does-not-exist-abc123" 2>/dev/null || echo "000")
  if [ "$CODE_404" = "404" ]; then
    echo "  404 handling: OK"
  else
    echo "  404 handling: WARN (returned HTTP $CODE_404 instead of 404)"
  fi

  # (cron-health checked in auth-protected section above)
fi

# ─────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────
echo ""
if [ "$FAILED" = "1" ]; then
  echo "FAIL: Some checks did not pass"
  exit 1
fi

echo "PASS: All checks passed"
exit 0
