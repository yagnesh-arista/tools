#!/bin/bash
# topoassist-client-test-check.sh
# Fires on every Sidebar-js.html edit:
#   1. Detects new/changed functions in the diff
#   2. Checks which ones have no coverage in test-js.js
#   3. Reminds to run: node test-js.js

input=$(cat)
f=$(echo "$input" | jq -r '.tool_input.file_path // ""')
echo "$f" | grep -q '/topoassist/Sidebar-js\.html' || exit 0

TOPODIR="$HOME/claude/projects/topoassist"
TESTS_FILE="$TOPODIR/test-js.js"

# ── 1. Detect new/changed functions in diff ───────────────────────────────────
NEW_FNS=$(git -C "$HOME/claude" diff HEAD -- projects/topoassist/Sidebar-js.html 2>/dev/null \
  | grep '^+' | grep -E '^\+function [a-zA-Z]' \
  | sed 's/^+function \([a-zA-Z_][a-zA-Z0-9_]*\).*/\1/' \
  | sort -u)

# ── 2. Check which have no coverage in test-js.js ─────────────────────────────
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

[ -z "$UNTESTED" ] && [ -z "$COVERED" ] && exit 0

if [ -n "$UNTESTED" ]; then
  MSG="[CLIENT TESTS] ⚠ NEW FUNCTIONS WITHOUT JS TESTS: ${UNTESTED}— add cases to test-js.js, then: node test-js.js"
else
  MSG="[CLIENT TESTS] ✓ new functions covered in test-js.js: ${COVERED}— run: node test-js.js"
fi

jq -n --arg ctx "$MSG" '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":$ctx}}'
