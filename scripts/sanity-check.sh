#!/bin/bash
#
# sanity-check.sh — Automated code quality checks for HomeHeat backend
#
# Catches known footguns before they ship:
#   - Bare CSS class names that leak between cards and tables
#   - Hardcoded Railway URLs in frontend code
#   - Duplicate migration numbers (new ones only)
#   - console.log left in production code
#   - allowPriceDisplay !== false (should be === true)
#   - postal_codes_served written in migrations after 100
#   - Common secret patterns
#   - /health handler making unbounded DB calls (heatingoil-jsxj class)
#   - og:image references using WebP (social crawler compat)
#   - scrapeBackoff monthlyReset missing scrape_failure_dates clear
#     (project_jsonld_scraper_breakage class)
#
# Usage:
#   bash scripts/sanity-check.sh          # check all
#   bash scripts/sanity-check.sh [file]   # check specific file
#
# Exit codes: 0 = clean, 1 = errors found, 2 = warnings only

BACKEND_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ERRORS=0
WARNINGS=0

RED='\033[0;31m'
YELLOW='\033[0;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No color

error() {
  echo -e "${RED}ERROR:${NC} $1"
  ERRORS=$((ERRORS + 1))
}

warn() {
  echo -e "${YELLOW}WARN:${NC} $1"
  WARNINGS=$((WARNINGS + 1))
}

ok() {
  echo -e "${GREEN}OK:${NC} $1"
}

# If a specific file is passed, only check relevant rules for that file
TARGET_FILE="${1:-}"

echo "=== HomeHeat Sanity Check ==="
echo ""

# ─────────────────────────────────────────────
# 1. CSS bare class name check (DANGER ZONE)
#    .supplier-phone, .supplier-price, .supplier-website
#    must always be scoped to a parent selector
# ─────────────────────────────────────────────
check_css() {
  local css_files
  if [ -n "$TARGET_FILE" ]; then
    case "$TARGET_FILE" in
      *.css) css_files="$TARGET_FILE" ;;
      *) return ;;
    esac
  else
    css_files=$(find "$BACKEND_DIR/website" -name "*.css" ! -name "*.min.css" 2>/dev/null)
  fi

  local found=0
  local dangerous_classes="supplier-phone|supplier-price|supplier-website"

  for file in $css_files; do
    # Match lines starting with .supplier-phone (bare, no parent scope)
    # Exclude lines that have a parent scope (contain a space before the class)
    while IFS= read -r line; do
      lineno=$(echo "$line" | cut -d: -f1)
      content=$(echo "$line" | cut -d: -f2-)
      # Check if the selector starts with the bare class (no parent)
      if echo "$content" | grep -qE '^\s*\.(supplier-phone|supplier-price|supplier-website)\s*[{,]'; then
        error "$file:$lineno — Bare CSS class without parent scope: $(echo "$content" | xargs)"
        found=1
      fi
    done < <(grep -nE "\.(${dangerous_classes})" "$file" 2>/dev/null)
  done

  if [ "$found" -eq 0 ]; then
    ok "CSS class scoping — no bare supplier-phone/price/website selectors"
  fi
}

# ─────────────────────────────────────────────
# 2. Hardcoded Railway URLs in frontend code
# ─────────────────────────────────────────────
check_railway_urls() {
  local search_dirs
  if [ -n "$TARGET_FILE" ]; then
    case "$TARGET_FILE" in
      */website/*|*/public/*) search_dirs="$TARGET_FILE" ;;
      *) return ;;
    esac
  else
    search_dirs="$BACKEND_DIR/website $BACKEND_DIR/public"
  fi

  local found
  found=$(grep -rl "\.railway\.app" $search_dirs 2>/dev/null | grep -E '\.(html|js|css)$' || true)

  if [ -n "$found" ]; then
    for file in $found; do
      error "$file — Contains hardcoded Railway URL (use relative URLs for same-origin)"
    done
  else
    ok "No hardcoded Railway URLs in frontend code"
  fi
}

# ─────────────────────────────────────────────
# 3. Duplicate migration numbers (NEW only)
#    Known historical duplicates: 004, 005, 006, 010, 012, 059
# ─────────────────────────────────────────────
check_migration_duplicates() {
  if [ -n "$TARGET_FILE" ]; then
    case "$TARGET_FILE" in
      */migrations/*) ;; # continue
      *) return ;;
    esac
  fi

  local known_dupes="004 005 006 010 012 059"
  local new_dupes=""

  while IFS= read -r num; do
    if ! echo "$known_dupes" | grep -qw "$num"; then
      new_dupes="$new_dupes $num"
    fi
  done < <(ls "$BACKEND_DIR/src/migrations/"*.js 2>/dev/null | sed 's/.*\///' | grep -oE '^[0-9]+' | sort | uniq -d)

  if [ -n "$new_dupes" ]; then
    for num in $new_dupes; do
      error "Migration number $num is duplicated:"
      ls "$BACKEND_DIR/src/migrations/${num}-"*.js 2>/dev/null | sed 's/^/  /'
    done
  else
    ok "No new duplicate migration numbers"
  fi
}

# ─────────────────────────────────────────────
# 4. console.log in production code
#    Allowed in: scripts/, tests, node_modules
# ─────────────────────────────────────────────
check_console_log() {
  local search_path
  if [ -n "$TARGET_FILE" ]; then
    case "$TARGET_FILE" in
      */src/*) search_path="$TARGET_FILE" ;;
      *) return ;;
    esac
  else
    search_path="$BACKEND_DIR/src"
  fi

  # Exclude migrations (run once, logging is fine) and node_modules
  local found
  found=$(grep -rn "console\.log(" "$search_path" \
    --include="*.js" \
    --exclude-dir=node_modules \
    --exclude-dir=__tests__ \
    --exclude-dir=migrations \
    2>/dev/null | grep -v "// sanity-ok" || true)

  if [ -n "$found" ]; then
    local count
    count=$(echo "$found" | wc -l | xargs)
    warn "$count console.log() calls in src/ (use logger instead, or add '// sanity-ok' to suppress)"
    echo "$found" | head -5 | while IFS= read -r line; do
      echo "  $line"
    done
    if [ "$count" -gt 5 ]; then
      echo "  ... and $((count - 5)) more"
    fi
  else
    ok "No console.log in src/"
  fi
}

# ─────────────────────────────────────────────
# 5. allowPriceDisplay !== false (should be === true)
# ─────────────────────────────────────────────
check_price_display_pattern() {
  local search_path
  if [ -n "$TARGET_FILE" ]; then
    search_path="$TARGET_FILE"
  else
    search_path="$BACKEND_DIR/src $BACKEND_DIR/scripts"
  fi

  # Exclude historical migrations (027-034 already ran, can't change)
  local found
  found=$(grep -rn "allowPriceDisplay\s*!==\s*false" $search_path \
    --include="*.js" \
    --exclude-dir=migrations \
    2>/dev/null || true)

  if [ -n "$found" ]; then
    while IFS= read -r line; do
      error "$line — Use 'allowPriceDisplay === true' not '!== false'"
    done <<< "$found"
  else
    ok "allowPriceDisplay pattern correct (=== true, not !== false)"
  fi
}

# ─────────────────────────────────────────────
# 6. postal_codes_served in migrations > 100
#    Since migration 100, coverage is managed by scrape-config.json
# ─────────────────────────────────────────────
check_coverage_in_migrations() {
  if [ -n "$TARGET_FILE" ]; then
    case "$TARGET_FILE" in
      */migrations/*) ;; # continue
      *) return ;;
    esac
  fi

  local found=0
  for file in "$BACKEND_DIR/src/migrations/"*.js; do
    local num
    num=$(basename "$file" | grep -oE '^[0-9]+')
    if [ -n "$num" ] && [ "$num" -gt 100 ] 2>/dev/null; then
      # Only flag actual writes (SET, INSERT values, JSON assignment), not comments or query references
      if grep -v '^\s*//' "$file" | grep -v '^\s*\*' | grep -qE "postal_codes_served\s*[=:]|SET\s+postal_codes_served|'postal_codes_served'" 2>/dev/null; then
        error "$file — Writes postal_codes_served (must use scrape-config.json after migration 100)"
        found=1
      fi
    fi
  done

  if [ "$found" -eq 0 ]; then
    ok "No postal_codes_served writes in migrations >100"
  fi
}

# ─────────────────────────────────────────────
# 7. Secret patterns in code
# ─────────────────────────────────────────────
check_secrets() {
  local search_path
  if [ -n "$TARGET_FILE" ]; then
    search_path="$TARGET_FILE"
  else
    search_path="$BACKEND_DIR/src $BACKEND_DIR/scripts $BACKEND_DIR/website"
  fi

  local patterns=(
    'AKIA[0-9A-Z]{16}'                    # AWS access key
    'ghp_[a-zA-Z0-9]{36}'                 # GitHub PAT
    'sk-[a-zA-Z0-9]{32,}'                 # OpenAI/Stripe secret key
    'SG\.[a-zA-Z0-9_-]{22}\.'            # SendGrid API key
    'xox[bpoas]-[a-zA-Z0-9-]+'           # Slack token
  )

  local found=0
  for pattern in "${patterns[@]}"; do
    local matches
    matches=$(grep -rn "$pattern" $search_path \
      --include="*.js" --include="*.html" --include="*.json" \
      --exclude-dir=node_modules \
      --exclude="package-lock.json" \
      2>/dev/null || true)
    if [ -n "$matches" ]; then
      error "Possible secret found matching pattern $pattern:"
      echo "$matches" | head -3 | while IFS= read -r line; do
        echo "  $line"
      done
      found=1
    fi
  done

  if [ "$found" -eq 0 ]; then
    ok "No secret patterns detected"
  fi
}

# ─────────────────────────────────────────────
# 9. /health handler must not introduce unbounded DB calls
#    Past incident: heatingoil-jsxj — server.js /health route did
#    sequelize.authenticate() without a race timeout; a Postgres blip
#    hung /health past Railway's healthcheck deadline → rollback.
#    Fix lives in raceDbAuthenticate (src/services/healthCheck.js).
#    Anything else inside the /health handler that hits the DB needs
#    a similar timeout wrapper.
# ─────────────────────────────────────────────
check_health_db_race() {
  if [ -n "$TARGET_FILE" ]; then
    case "$TARGET_FILE" in
      */server.js) ;; # continue
      *) return ;;
    esac
  fi

  local server_file="$BACKEND_DIR/server.js"
  [ -f "$server_file" ] || return

  # Extract the /health handler body. Heuristic: from the line containing
  # `app.get('/health'` to the first `});` after it. awk is more reliable
  # than multi-line bash regex.
  local health_body
  health_body=$(awk "
    /app\.get\(['\"]\/health['\"]/ { in_handler = 1 }
    in_handler { print }
    in_handler && /^\}\);/ { exit }
  " "$server_file" 2>/dev/null)

  if [ -z "$health_body" ]; then
    return
  fi

  # Forbidden patterns — direct DB calls without a known race wrapper.
  # raceDbAuthenticate is the sanctioned helper. Anything else inside this
  # handler that touches sequelize / pool / db.* needs a Promise.race.
  local forbidden_patterns='sequelize\.(query|authenticate)|sequelize\.transaction|pool\.(query|connect)|db\.(query|raw)'
  local matches
  matches=$(echo "$health_body" | grep -nE "$forbidden_patterns" || true)

  if [ -n "$matches" ]; then
    # Only flag matches NOT on a line that also calls raceDbAuthenticate.
    local violations
    violations=$(echo "$matches" | grep -v 'raceDbAuthenticate' || true)
    if [ -n "$violations" ]; then
      while IFS= read -r line; do
        error "server.js /health handler — possible unbounded DB call: $line (heatingoil-jsxj class — wrap with raceDbAuthenticate or Promise.race)"
      done <<< "$violations"
      return
    fi
  fi

  ok "/health handler has no unbounded DB calls"
}

# ─────────────────────────────────────────────
# 10. og:image must be PNG (not WebP)
#     Memory: og:image_format — Facebook/LinkedIn/Twitter crawlers do
#     not reliably parse WebP. PNG-only for social-share compat.
# ─────────────────────────────────────────────
check_og_image_format() {
  local search_path
  if [ -n "$TARGET_FILE" ]; then
    case "$TARGET_FILE" in
      *.html|*.js) search_path="$TARGET_FILE" ;;
      *) return ;;
    esac
  else
    search_path="$BACKEND_DIR/website $BACKEND_DIR/scripts $BACKEND_DIR/src"
  fi

  # Match: og:image meta tag content with .webp anywhere on the line.
  # Catches both literal HTML and JS string literals composing og:image.
  local found
  found=$(grep -rnE "og:image[^>]*\.webp|og_image[^=]*=.*\.webp|ogImage[^=]*=.*\.webp" $search_path \
    --include="*.html" --include="*.js" \
    --exclude-dir=node_modules \
    2>/dev/null || true)

  if [ -n "$found" ]; then
    while IFS= read -r line; do
      error "$line — og:image must be PNG, not WebP (social crawler compat)"
    done <<< "$found"
  else
    ok "og:image references are not WebP"
  fi
}

# ─────────────────────────────────────────────
# 11. monthlyReset must clear scrape_failure_dates
#     Past incident: project_jsonld_scraper_breakage (Mar 2026, fixed
#     via migration 113 + scrapeBackoff.js update). The monthlyReset
#     function MUST clear scrape_failure_dates to '[]'::jsonb in
#     addition to counters; otherwise old dates inside the 30-day
#     window cause immediate re-blocking on the first new failure.
# ─────────────────────────────────────────────
check_monthly_reset() {
  local backoff_file="$BACKEND_DIR/src/services/scrapeBackoff.js"
  if [ -n "$TARGET_FILE" ]; then
    case "$TARGET_FILE" in
      */scrapeBackoff.js) ;; # continue
      *) return ;;
    esac
  fi
  [ -f "$backoff_file" ] || return

  # Extract the monthlyReset function body (from `function monthlyReset` or
  # `async function monthlyReset` through the first standalone `}` at column 0).
  local fn_body
  fn_body=$(awk '
    /^async function monthlyReset|^function monthlyReset/ { in_fn = 1 }
    in_fn { print }
    in_fn && /^\}/ && !/^\}\)/ { exit }
  ' "$backoff_file" 2>/dev/null)

  if [ -z "$fn_body" ]; then
    # Function not found — file may have been refactored; skip rather than false-fire.
    return
  fi

  # Required: the function body MUST contain an assignment of
  # scrape_failure_dates to an empty value (typically '[]'::jsonb in SQL,
  # or [] in JS). Both forms are acceptable.
  if ! echo "$fn_body" | grep -qE "scrape_failure_dates\s*=\s*('\[\]'::jsonb|\[\])"; then
    error "scrapeBackoff.js monthlyReset — missing 'scrape_failure_dates = []::jsonb' clear (project_jsonld_scraper_breakage class — old failure dates re-block suppliers immediately after reset)"
    return
  fi

  ok "scrapeBackoff.js monthlyReset clears scrape_failure_dates"
}
# ─────────────────────────────────────────────
# 8. Required page elements in generated HTML
#    Spot-check: nav.js, analytics, Smart App Banner
# ─────────────────────────────────────────────
check_page_elements() {
  if [ -n "$TARGET_FILE" ]; then
    case "$TARGET_FILE" in
      */website/*.html) ;; # continue
      *) return ;;
    esac
  fi

  local sample_pages=(
    "$BACKEND_DIR/website/index.html"
    "$BACKEND_DIR/website/prices/index.html"
    "$BACKEND_DIR/website/for-suppliers/index.html"
  )

  local required_elements=(
    "nav.js"
    "apple-itunes-app"
    "widgets.js"
  )

  for page in "${sample_pages[@]}"; do
    if [ ! -f "$page" ]; then
      continue
    fi
    for element in "${required_elements[@]}"; do
      if ! grep -q "$element" "$page" 2>/dev/null; then
        error "$(basename "$page") missing required element: $element"
      fi
    done
  done

  ok "Sample pages checked for required elements"
}

# ─────────────────────────────────────────────
# Run all checks
# ─────────────────────────────────────────────
check_css
check_railway_urls
check_migration_duplicates
check_console_log
check_price_display_pattern
check_coverage_in_migrations
check_secrets
check_page_elements
check_health_db_race
check_og_image_format
check_monthly_reset

# ─────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────
echo ""
echo "=== Summary ==="
if [ "$ERRORS" -gt 0 ]; then
  echo -e "${RED}$ERRORS error(s)${NC}, ${YELLOW}$WARNINGS warning(s)${NC}"
  exit 1
elif [ "$WARNINGS" -gt 0 ]; then
  echo -e "${GREEN}0 errors${NC}, ${YELLOW}$WARNINGS warning(s)${NC}"
  exit 2
else
  echo -e "${GREEN}All checks passed${NC}"
  exit 0
fi
