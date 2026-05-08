#!/usr/bin/env bash
# Tests for run-affected-tests.sh.
# Verifies path-mapping logic and pass/fail JSON output.
#
# Run: bash scripts/run-affected-tests.test.sh
# Exits 0 on success, 1 on any failure.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
HOOK="$SCRIPT_DIR/run-affected-tests.sh"

passed=0
failed=0

pass() { passed=$((passed + 1)); echo "  ✓ $1"; }
fail() { failed=$((failed + 1)); echo "  ✗ $1 — $2"; }

assert_contains() {
  local label=$1; local actual=$2; local expected=$3
  if [[ "$actual" == *"$expected"* ]]; then
    pass "$label"
  else
    fail "$label" "expected to contain '$expected', got: $actual"
  fi
}

assert_not_contains() {
  local label=$1; local actual=$2; local unexpected=$3
  if [[ "$actual" != *"$unexpected"* ]]; then
    pass "$label"
  else
    fail "$label" "expected NOT to contain '$unexpected'"
  fi
}

run_with_path() {
  bash "$HOOK" "$1"
}

echo "=== run-affected-tests.sh ==="

# ── Test 1: no argument → suppress (don't wedge the hook chain) ──
{
  out=$(bash "$HOOK")
  assert_contains "no argument → suppressOutput" "$out" '"suppressOutput":true'
}

# ── Test 2: file outside backend dir → suppress ──
{
  out=$(run_with_path "/etc/hosts")
  assert_contains "outside-backend file → suppressOutput" "$out" '"suppressOutput":true'
}

# ── Test 3: backend file with no mapping → suppress ──
{
  out=$(run_with_path "$BACKEND_DIR/README.md")
  assert_contains "unmapped backend file → suppressOutput" "$out" '"suppressOutput":true'
}

# ── Test 4: edit a passing test file → re-runs it, suppresses ──
# fuel-config.test.js is known to pass on current main.
{
  out=$(run_with_path "$BACKEND_DIR/src/data/fuel-config.test.js")
  assert_contains "passing *.test.js edit → suppressOutput" "$out" '"suppressOutput":true'
}

# ── Test 5: source file mapped to passing test → suppresses ──
{
  out=$(run_with_path "$BACKEND_DIR/src/services/healthCheck.js")
  assert_contains "healthCheck.js → healthCheck.test.js (passes) → suppress" "$out" '"suppressOutput":true'
}

# ── Test 6: server.js → mapped to healthCheck.test.js ──
{
  out=$(run_with_path "$BACKEND_DIR/server.js")
  assert_contains "server.js → healthCheck.test.js (passes) → suppress" "$out" '"suppressOutput":true'
}

# ── Test 7: migration file → mapped to migrations-list.test.js ──
{
  # Pick any existing migration; 156 is the most recent.
  mig=$(ls "$BACKEND_DIR/src/migrations/156-"*.js 2>/dev/null | head -1)
  if [ -n "$mig" ]; then
    out=$(run_with_path "$mig")
    assert_contains "migration file → migrations-list.test.js (passes) → suppress" "$out" '"suppressOutput":true'
  else
    fail "migration test setup" "no migration 156 file found"
  fi
}

# ── Test 8: scrape-config.json edit → mapped to scrape-config-sync.test.js ──
{
  out=$(run_with_path "$BACKEND_DIR/src/data/scrape-config.json")
  assert_contains "scrape-config.json → scrape-config-sync.test.js (passes) → suppress" "$out" '"suppressOutput":true'
}

# ── Test 9: ScrapeConfigSync.js edit → mapped to scrape-config-sync.test.js ──
{
  out=$(run_with_path "$BACKEND_DIR/src/services/ScrapeConfigSync.js")
  assert_contains "ScrapeConfigSync.js → scrape-config-sync.test.js (passes) → suppress" "$out" '"suppressOutput":true'
}

# ── Test 10: deliberately broken test → warning JSON with output ──
# Inject a synthetic test file that fails, run, expect failure JSON, clean up.
{
  TMP_TEST="$BACKEND_DIR/src/utils/__failing.test.js"
  cat > "$TMP_TEST" <<'EOF'
console.log('synthetic failing test');
console.error('expected: 1, got: 2 — something diverged');
process.exit(1);
EOF
  out=$(run_with_path "$TMP_TEST")
  rm -f "$TMP_TEST"

  assert_contains "broken test → AFFECTED TEST FAILED warning" "$out" "AFFECTED TEST FAILED"
  assert_contains "broken test → warning JSON includes hookSpecificOutput" "$out" '"hookSpecificOutput"'
  assert_contains "broken test → warning JSON includes additionalContext" "$out" '"additionalContext"'
  assert_contains "broken test → output text is captured in warning" "$out" "synthetic failing test"
  assert_not_contains "broken test → does NOT emit suppressOutput" "$out" '"suppressOutput":true'
}

# ── Test 11: missing test file (mapped but doesn't exist) → suppress ──
# Simulate by mapping a source that resolves to a nonexistent test path.
# (Edge case; should never happen in practice but we shouldn't crash.)
# Fast path: edit a non-mapped file already exercises this (Test 3).
# Synthetic check: an edit to a removed test file maps to itself.
{
  out=$(run_with_path "$BACKEND_DIR/src/utils/__nonexistent.test.js")
  assert_contains "nonexistent test file → suppressOutput" "$out" '"suppressOutput":true'
}

# ── Test 12: emitted JSON parses cleanly ──
{
  TMP_TEST="$BACKEND_DIR/src/utils/__failing.test.js"
  cat > "$TMP_TEST" <<'EOF'
console.log('quotes: "hello" and newlines\nshould escape safely');
process.exit(1);
EOF
  out=$(run_with_path "$TMP_TEST")
  rm -f "$TMP_TEST"

  if echo "$out" | jq . > /dev/null 2>&1; then
    pass "warning JSON is valid (handles quotes/newlines via jq escaping)"
  else
    fail "warning JSON is valid" "got: $out"
  fi
}

echo ""
echo "$passed passed, $failed failed"
[ "$failed" -eq 0 ]
