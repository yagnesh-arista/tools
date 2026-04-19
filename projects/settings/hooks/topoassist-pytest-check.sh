#!/bin/bash
# topoassist-pytest-check.sh
# Fires on every device_bridge.py edit:
#   1. Runs pytest and reports pass/fail count
#   2. Detects new/changed functions in the diff
#   3. Checks which ones have no test cases — warns specifically

input=$(cat)
f=$(echo "$input" | jq -r '.tool_input.file_path // ""')
[ "$f" = "/home/yagnesh/claude/projects/topoassist/device_bridge.py" ] || exit 0

TOPODIR="$HOME/claude/projects/topoassist"

# ── 1. Run pytest ─────────────────────────────────────────────────────────────
PYTEST_OUT=$(cd "$TOPODIR" && python3 -m pytest tests/ -q 2>&1 | tail -2)
PYTEST_SUMMARY=$(echo "$PYTEST_OUT" | grep -E "passed|failed|error" | head -1)

# ── 2. Detect new/changed functions in diff ───────────────────────────────────
NEW_FNS=$(git -C "$HOME/claude" diff HEAD -- projects/topoassist/device_bridge.py 2>/dev/null \
  | grep '^+' | grep -E '^(\+def |\+    def )' \
  | sed 's/^+[[:space:]]*//' | sed 's/def \([a-zA-Z_][a-zA-Z0-9_]*\).*/\1/' \
  | grep -v '^_' | sort -u)  # skip private/internal functions

# ── 3. Check which new functions have no test coverage ────────────────────────
UNTESTED=""
TEST_FILE="$TOPODIR/tests/test_device_bridge.py"
if [ -n "$NEW_FNS" ] && [ -f "$TEST_FILE" ]; then
  while IFS= read -r fn; do
    [ -z "$fn" ] && continue
    if ! grep -q "$fn" "$TEST_FILE" 2>/dev/null; then
      UNTESTED="${UNTESTED}${fn} "
    fi
  done <<< "$NEW_FNS"
fi

# ── 4. Build output ───────────────────────────────────────────────────────────
MSG="[PYTEST] ${PYTEST_SUMMARY}"
if [ -n "$UNTESTED" ]; then
  MSG="${MSG} | ⚠ NEW FUNCTIONS WITHOUT TESTS: ${UNTESTED}— add pytest cases"
elif [ -n "$NEW_FNS" ]; then
  MSG="${MSG} | ✓ new functions covered: ${NEW_FNS}"
fi

echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PostToolUse\",\"additionalContext\":\"${MSG}\"}}"
