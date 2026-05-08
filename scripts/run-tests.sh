#!/usr/bin/env bash
# Run every src/**/*.test.js sequentially. Exit non-zero if any fail.
# Convention: each test file uses the plain-Node assertion style (see
# multi-branch-config.test.js for the template) and exits 0 on success,
# 1 on any failure.
#
# Usage: npm test
#        bash scripts/run-tests.sh

set -uo pipefail

cd "$(dirname "$0")/.."

# bash 3.2 (macOS default) lacks mapfile, so build the file list with a
# while-read loop. Each test file runs as its own node process so a
# crash in one doesn't blow up the rest of the suite.
test_files=()
while IFS= read -r f; do
  test_files+=("$f")
done < <(find src -type f -name "*.test.js" | sort)

count=${#test_files[@]}
if [ "$count" -eq 0 ]; then
  echo "No test files found under src/."
  exit 0
fi

echo "=== Running $count test file(s) ==="

failed=0
for f in "${test_files[@]}"; do
  echo ""
  echo "── $f ──"
  if ! node "$f"; then
    failed=$((failed + 1))
  fi
done

echo ""
if [ "$failed" -eq 0 ]; then
  echo "✅ All $count test file(s) passed."
  exit 0
else
  echo "❌ $failed of $count test file(s) failed."
  exit 1
fi
