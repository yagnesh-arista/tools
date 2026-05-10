#!/usr/bin/env bash
# Autonomous bug fix loop — runs pytest, feeds failures to claude -p, repeats.
# Stops when tests pass or max iterations reached.
#
# Usage:
#   ~/.claude/scripts/topoassist-bugfix-loop.sh                 # all tests
#   ~/.claude/scripts/topoassist-bugfix-loop.sh tests/test_X.py # specific file
#   ~/.claude/scripts/topoassist-bugfix-loop.sh --max 5         # up to 5 iterations
#
# Output: ~/.claude/scripts/review-logs/bugfix-YYYYMMDD-HHMM.md

set -e

TA="$HOME/claude/projects/topoassist"
LOGDIR="$HOME/.claude/scripts/review-logs"
mkdir -p "$LOGDIR"
LOGFILE="$LOGDIR/bugfix-$(date +%Y%m%d-%H%M).md"

MAX_ITERS=3
TEST_TARGET="tests/"

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --max) MAX_ITERS="$2"; shift 2 ;;
    *)     TEST_TARGET="$1"; shift ;;
  esac
done

echo "# TopoAssist Bug Fix Loop — $(date)" > "$LOGFILE"
echo "# Target: $TEST_TARGET  |  Max iterations: $MAX_ITERS" >> "$LOGFILE"
echo "" >> "$LOGFILE"

echo "Starting bug fix loop (max $MAX_ITERS iterations) for: $TEST_TARGET"
echo ""

iter=0
while [ "$iter" -lt "$MAX_ITERS" ]; do
  iter=$((iter + 1))
  echo "── Iteration $iter / $MAX_ITERS ──────────────────────────────"
  echo "" >> "$LOGFILE"
  echo "## Iteration $iter" >> "$LOGFILE"

  # Run tests and capture output
  TEST_OUT=$(cd "$TA" && python -m pytest "$TEST_TARGET" -v --tb=short 2>&1 || true)
  echo "$TEST_OUT" >> "$LOGFILE"

  # Check for failures
  if echo "$TEST_OUT" | grep -qE '(FAILED|ERROR)'; then
    FAIL_COUNT=$(echo "$TEST_OUT" | grep -cE '^FAILED' || echo 0)
    echo "  $FAIL_COUNT test failure(s) — invoking claude to fix..."
    echo "" >> "$LOGFILE"
    echo "### Claude Fix Attempt" >> "$LOGFILE"

    FAIL_SUMMARY=$(echo "$TEST_OUT" | grep -E 'FAILED|ERRORS|AssertionError|Error:' | head -20)

    PROMPT="You are running an automated test-fix loop for TopoAssist (non-interactive).
The following pytest failures were detected in $TEST_TARGET:

$FAIL_SUMMARY

Full test output:
$TEST_OUT

Read the relevant source files, identify the root cause of each failure, and fix them.
Apply minimal targeted fixes — do not refactor or add features.
Output: one-line summary of each fix applied (file:line — what changed)."

    claude -p "$PROMPT" \
      --allowedTools "Bash,Read,Edit,Glob,Grep" \
      --cwd "$TA" \
      >> "$LOGFILE" 2>&1

    echo ""
    echo "  Fix applied. Re-running tests..."
  else
    echo "  All tests pass."
    echo "" >> "$LOGFILE"
    echo "### Result: PASS" >> "$LOGFILE"
    break
  fi
done

echo ""
echo "────────────────────────────────────────────"

# Final test run for summary
FINAL_OUT=$(cd "$TA" && python -m pytest "$TEST_TARGET" -v --tb=short 2>&1 || true)
if echo "$FINAL_OUT" | grep -qE '(FAILED|ERROR)'; then
  FINAL_FAILS=$(echo "$FINAL_OUT" | grep -cE '^FAILED' || echo 0)
  echo "Result: $FINAL_FAILS failure(s) remain after $iter iteration(s)."
  echo "" >> "$LOGFILE"
  echo "## Final Result: $FINAL_FAILS failure(s) remain" >> "$LOGFILE"
else
  echo "Result: All tests pass after $iter iteration(s)."
  echo "" >> "$LOGFILE"
  echo "## Final Result: PASS" >> "$LOGFILE"
fi

echo ""
echo "Full log: cat '$LOGFILE'"
