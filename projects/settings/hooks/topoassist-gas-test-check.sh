#!/bin/bash
# settings v260506.11 | 2026-05-06 12:16:53
# topoassist-gas-test-check.sh
# Fires on every Code.gs edit:
#   1. Detects new/changed functions in the diff
#   2. Checks which ones have no test cases in Test-gs.gs — lists specifically
#   3. Reminds to run runAllTests() manually in Apps Script editor

input=$(cat)
f=$(echo "$input" | jq -r '.tool_input.file_path // ""')
echo "$f" | grep -q '/topoassist/Code\.gs' || exit 0

TOPODIR="$HOME/claude/projects/topoassist"
TESTS_FILE="$TOPODIR/Test-gs.gs"

# ── 1. Detect new/changed public functions in diff ────────────────────────────
NEW_FNS=$(git -C "$HOME/claude" diff HEAD -- projects/topoassist/Code.gs 2>/dev/null \
  | grep '^+' | grep -E '^\+function [a-zA-Z]' \
  | sed 's/^+function \([a-zA-Z_][a-zA-Z0-9_]*\).*/\1/' \
  | grep -v -E '^(onOpen|onEdit|doGet|include)$' \
  | sort -u)

# ── 2. Check which new functions have no test coverage in Test-gs.gs ─────────────
UNTESTED=""
COVERED=""
if [ -n "$NEW_FNS" ] && [ -f "$TESTS_FILE" ]; then
  while IFS= read -r fn; do
    [ -z "$fn" ] && continue
    if ! grep -q "$fn" "$TESTS_FILE" 2>/dev/null; then
      UNTESTED="${UNTESTED}${fn} "
    else
      COVERED="${COVERED}${fn} "
    fi
  done <<< "$NEW_FNS"
fi

# ── 3. Build output — silent when no new functions detected ───────────────────
[ -z "$UNTESTED" ] && [ -z "$COVERED" ] && exit 0

if [ -n "$UNTESTED" ]; then
  MSG="[TESTS] ⚠ NEW FUNCTIONS WITHOUT GAS TESTS: ${UNTESTED}— add cases to Test-gs.gs, then run runAllTests() in Apps Script editor"
else
  MSG="[TESTS] ✓ new functions already covered in Test-gs.gs: ${COVERED}— run runAllTests() to verify"
fi

jq -n --arg ctx "$MSG" '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":$ctx}}'
