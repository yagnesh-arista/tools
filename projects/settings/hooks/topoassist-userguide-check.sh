#!/usr/bin/env bash
# settings v260424.5 | 2026-04-24 12:30:50
# Fires after editing any TopoAssist source file — reminds to check UserGuide.html
input=$(cat)
f=$(echo "$input" | jq -r '.tool_input.file_path // ""')

case "$f" in
  */topoassist/Code.gs|\
  */topoassist/device_bridge.py)
    echo '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"[USERGUIDE] Check if UserGuide.html needs updating for this change."}}'
    ;;
esac
