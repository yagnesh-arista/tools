#!/usr/bin/env bash
# Fires after editing Sidebar.html or Code.gs — reminds to update Section 26 UI Inventory
input=$(cat)
f=$(echo "$input" | jq -r '.tool_input.file_path // ""')

case "$f" in
  */topoassist/Sidebar.html|\
  */topoassist/Code.gs)
    echo '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"[UI-INVENTORY] If you added/removed/renamed a modal, panel, ui.prompt, or ui.alert — update Section 26 (UI Element Inventory) in INSTRUCTIONS_topoassist.txt."}}'
    ;;
esac
