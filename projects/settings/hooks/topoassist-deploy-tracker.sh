#!/usr/bin/env bash
# Fires after any TopoAssist file edit.
# Shows which GAS and local files have been modified (need deploying).

input=$(cat)
f=$(echo "$input" | jq -r '.tool_input.file_path // ""')

# Only fire for topoassist files
echo "$f" | grep -q '/projects/topoassist/' || exit 0

REPO=/home/yagnesh/claude
GAS_FILES=(Code.gs Sidebar.html Sidebar-js.html Sidebar-css.html SheetAssistPanel.html UserGuide.html)
LOCAL_FILES=(device_bridge.py)

# Get all uncommitted changes under topoassist/
changed=$(git -C "$REPO" diff --name-only HEAD -- projects/topoassist/ 2>/dev/null)
# Also include staged changes
changed_staged=$(git -C "$REPO" diff --name-only --cached -- projects/topoassist/ 2>/dev/null)
all_changed=$(printf '%s\n%s\n' "$changed" "$changed_staged" | sort -u | grep -v '^$')

gas_list=""
local_list=""

for name in "${GAS_FILES[@]}"; do
  if echo "$all_changed" | grep -q "/$name$\|^projects/topoassist/$name$"; then
    gas_list="$gas_list $name"
  fi
done

for name in "${LOCAL_FILES[@]}"; do
  if echo "$all_changed" | grep -q "/$name$\|^projects/topoassist/$name$"; then
    local_list="$local_list $name"
  fi
done

# Build output message
msg=""
if [ -n "$gas_list" ]; then
  msg="${msg}[DEPLOY] GAS upload needed:$(echo $gas_list | tr ' ' ',') "
fi
if [ -n "$local_list" ]; then
  msg="${msg}[DEPLOY] Mac re-deploy needed:$(echo $local_list | tr ' ' ',')"
fi

if [ -n "$msg" ]; then
  echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PostToolUse\",\"additionalContext\":\"$msg\"}}"
fi
