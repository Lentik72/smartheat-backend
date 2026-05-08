#!/usr/bin/env bash
# run-affected-tests.sh — PostToolUse hook
#
# Maps an edited backend file to its associated test file (per
# heatingoil-wwp7) and runs that test. Designed to fire on every
# Edit/Write to a backend src/ file via the PostToolUse hook in
# .claude/settings.json.
#
# Output (stdout, single JSON object):
#   - {"suppressOutput": true}                          when no mapping or test passes
#   - {"hookSpecificOutput": {...additionalContext...}} when test fails
#
# The additionalContext warning includes the test name and truncated
# output so the assistant gets the failure details in-line.
#
# Why one test per edit instead of `npm test`: per the bead, the full
# suite runs in verify-deploy and CI; per-edit feedback should be fast
# and tied to the specific surface that changed. As the suite grows,
# we don't want every edit to trigger N tests.
#
# Mapping table is hardcoded (kept in sync with bbb5/wwp7 bead spec).
# Adding a new test means: write the test file, add a mapping line.
#
# Usage:
#   bash scripts/run-affected-tests.sh <absolute-path-to-edited-file>

set -uo pipefail

FILE="${1:-}"

# Diagnostic log: appends one line per invocation to /tmp so we can verify
# the hook is being invoked by the harness, even when output is suppressed.
# Remove this block once integration is confirmed (heatingoil-wwp7 close note).
echo "[$(date '+%Y-%m-%d %H:%M:%S')] run-affected-tests INVOKED with FILE=${FILE} CWD=$(pwd) PROJECT=${CLAUDE_PROJECT_DIR:-unset}" >> /tmp/affected-tests-hook.log 2>/dev/null || true

if [ -z "$FILE" ]; then
  echo '{"suppressOutput":true}'
  exit 0
fi

BACKEND_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Resolve to backend-relative path. If outside backend, suppress.
case "$FILE" in
  "$BACKEND_DIR"/*) REL="${FILE#$BACKEND_DIR/}" ;;
  *) echo '{"suppressOutput":true}'; exit 0 ;;
esac

# Map source file → test file. Keep in sync with the bead spec.
# *.test.js paths re-run themselves.
TEST=""
case "$REL" in
  *.test.js)                                     TEST="$REL" ;;
  src/services/healthCheck.js)                   TEST="src/services/healthCheck.test.js" ;;
  server.js)                                     TEST="src/services/healthCheck.test.js" ;;
  src/migrations-list.js)                        TEST="src/migrations-list.test.js" ;;
  src/migrations/*.js)                           TEST="src/migrations-list.test.js" ;;
  src/services/ScrapeConfigSync.js)              TEST="src/services/scrape-config-sync.test.js" ;;
  src/data/scrape-config.json)                   TEST="src/services/scrape-config-sync.test.js" ;;
  src/services/multi-branch-config.js)           TEST="src/services/multi-branch-config.test.js" ;;
  src/services/priceScraper.js)                  TEST="src/services/multi-branch-config.test.js" ;;
  src/data/fuel-config.json)                     TEST="src/data/fuel-config.test.js" ;;
  src/utils/supplier-price-query.js)             TEST="src/utils/supplier-price-query.test.js" ;;
  *)                                             echo '{"suppressOutput":true}'; exit 0 ;;
esac

TEST_FILE="$BACKEND_DIR/$TEST"
if [ ! -f "$TEST_FILE" ]; then
  echo '{"suppressOutput":true}'
  exit 0
fi

# Run the affected test. Capture both stdout and stderr.
OUTPUT=$(node "$TEST_FILE" 2>&1)
RC=$?

if [ "$RC" -eq 0 ]; then
  echo '{"suppressOutput":true}'
  exit 0
fi

# Test failed. Emit warning with last 30 lines of output (more than enough
# to see the failing assertion). Use jq for safe JSON escaping.
TAIL=$(echo "$OUTPUT" | tail -n 30)
jq -nc \
  --arg test "$TEST" \
  --arg out "$TAIL" \
  '{hookSpecificOutput:{hookEventName:"PostToolUse",additionalContext:("AFFECTED TEST FAILED (" + $test + "):\n" + $out + "\n\nFix the regression before continuing.")}}'
