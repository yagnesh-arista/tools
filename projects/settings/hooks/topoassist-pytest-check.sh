#!/bin/bash
# settings v260421.1 | 2026-04-21
# topoassist-pytest-check.sh
# Fires on device_bridge.py OR tests/test_device_bridge.py edits:
#   1. Runs pytest and reports pass/fail count
#   2. Auto-updates expected count in both test command docs if count changed
#   3. (device_bridge.py only) Detects new/changed functions + warns if untested

input=$(cat)
f=$(echo "$input" | jq -r '.tool_input.file_path // ""')

IS_SRC=false
IS_TEST=false
case "$f" in
  */topoassist/device_bridge.py) IS_SRC=true ;;
  */topoassist/tests/test_device_bridge.py) IS_TEST=true ;;
  *) exit 0 ;;
esac

TOPODIR="$HOME/claude/projects/topoassist"
CMD_LOCAL="$TOPODIR/.claude/commands/test-device_bridge.md"
CMD_GLOBAL="$HOME/.claude/commands/topoassist-test-device_bridge.md"

# ── 1. Run pytest ─────────────────────────────────────────────────────────────
PYTEST_OUT=$(cd "$TOPODIR" && python3 -m pytest tests/ -q 2>&1 | tail -2)
PYTEST_SUMMARY=$(echo "$PYTEST_OUT" | grep -E "passed|failed|error" | head -1)

# ── 2. Auto-update expected count in command docs ─────────────────────────────
ACTUAL_COUNT=$(echo "$PYTEST_SUMMARY" | grep -oE '^[0-9]+')
COUNT_UPDATED=""
if [ -n "$ACTUAL_COUNT" ] && echo "$PYTEST_SUMMARY" | grep -q " passed"; then
  for cmd_file in "$CMD_LOCAL" "$CMD_GLOBAL"; do
    [ -f "$cmd_file" ] || continue
    OLD_COUNT=$(grep -oE 'Expected: [0-9]+' "$cmd_file" | grep -oE '[0-9]+' | head -1)
    if [ -n "$OLD_COUNT" ] && [ "$OLD_COUNT" != "$ACTUAL_COUNT" ]; then
      sed -i "s/Expected: ${OLD_COUNT} passed/Expected: ${ACTUAL_COUNT} passed/" "$cmd_file"
      COUNT_UPDATED="auto-updated expected count ${OLD_COUNT}→${ACTUAL_COUNT} in test command docs"
    fi
  done
fi

# ── 3. Detect new/changed functions (device_bridge.py only) ──────────────────
NEW_FNS=""
UNTESTED=""
if [ "$IS_SRC" = "true" ]; then
  NEW_FNS=$(git -C "$HOME/claude" diff HEAD -- projects/topoassist/device_bridge.py 2>/dev/null \
    | grep '^+' | grep -E '^(\+def |\+    def )' \
    | sed 's/^+[[:space:]]*//' | sed 's/def \([a-zA-Z_][a-zA-Z0-9_]*\).*/\1/' \
    | grep -v '^_' | sort -u)

  TEST_FILE="$TOPODIR/tests/test_device_bridge.py"
  if [ -n "$NEW_FNS" ] && [ -f "$TEST_FILE" ]; then
    while IFS= read -r fn; do
      [ -z "$fn" ] && continue
      if ! grep -q "$fn" "$TEST_FILE" 2>/dev/null; then
        UNTESTED="${UNTESTED}${fn} "
      fi
    done <<< "$NEW_FNS"
  fi
fi

# ── 4. Build output ───────────────────────────────────────────────────────────
MSG="[PYTEST] ${PYTEST_SUMMARY}"
[ -n "$COUNT_UPDATED" ] && MSG="${MSG} | ✓ ${COUNT_UPDATED}"
if [ -n "$UNTESTED" ]; then
  MSG="${MSG} | ⚠ NEW FUNCTIONS WITHOUT TESTS: ${UNTESTED}— add pytest cases"
elif [ -n "$NEW_FNS" ]; then
  MSG="${MSG} | ✓ new functions covered: ${NEW_FNS}"
fi
[ "$IS_SRC" = "true" ] && MSG="${MSG} | [SYNC] Update embedded template in downloadBridgeScript() in Sidebar-js.html — VERSION must match"

jq -n --arg ctx "$MSG" '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":$ctx}}'
