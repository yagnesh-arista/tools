#!/usr/bin/env bash
# settings v260510.45 | 2026-05-10 15:41:37
# Fires after editing any TopoAssist .gs or .html source file — reminds to run constraint checks
input=$(cat)
f=$(echo "$input" | jq -r '.tool_input.file_path // ""')

case "$f" in
  */topoassist/Code.gs|\
  */topoassist/Sidebar-js.html|\
  */topoassist/Sidebar.html|\
  */topoassist/Test-gs.gs|\
  */topoassist/test-js.js)
    echo '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"[CONSTRAINTS] Run /topoassist-review-code-design if logic, function signatures, or column names changed."}}'
    ;;
esac
