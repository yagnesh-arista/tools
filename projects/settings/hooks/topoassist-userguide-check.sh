#!/usr/bin/env bash
# settings v260420.21 | 2026-04-20 03:34:18 | git commit: 62af944
# Fires after editing any TopoAssist source file — reminds to check UserGuide.html
input=$(cat)
f=$(echo "$input" | jq -r '.tool_input.file_path // ""')

case "$f" in
  */topoassist/Code.gs|\
  */topoassist/Sidebar.html|\
  */topoassist/Sidebar-js.html|\
  */topoassist/SheetAssistPanel.html|\
  */topoassist/device_bridge.py)
    echo '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"[USERGUIDE] Check if UserGuide.html needs updating for this change."}}'
    ;;
esac
