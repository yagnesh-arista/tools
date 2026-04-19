#!/usr/bin/env bash
# settings v260420.21 | 2026-04-20 03:34:18 | git commit: 62af944
# Fires after any TopoAssist file edit.
# Auto-runs clasp push for GAS files; reminds for device_bridge.py.

input=$(cat)
f=$(echo "$input" | jq -r '.tool_input.file_path // ""')

# Only fire for topoassist files
echo "$f" | grep -q '/projects/topoassist/' || exit 0

TOPODIR=/home/yagnesh/claude/projects/topoassist
GAS_FILES=(Code.gs Sidebar.html Sidebar-js.html Sidebar-css.html SheetAssistPanel.html UserGuide.html Tests.gs)
LOCAL_FILES=(device_bridge.py)

# Determine which files changed (working tree vs HEAD)
REPO=/home/yagnesh/claude
changed=$(git -C "$REPO" diff --name-only HEAD -- projects/topoassist/ 2>/dev/null)
changed_staged=$(git -C "$REPO" diff --name-only --cached -- projects/topoassist/ 2>/dev/null)
all_changed=$(printf '%s\n%s\n' "$changed" "$changed_staged" | sort -u | grep -v '^$')

gas_changed=false
local_list=""

for name in "${GAS_FILES[@]}"; do
  if echo "$all_changed" | grep -q "/$name$\|^projects/topoassist/$name$"; then
    gas_changed=true
  fi
done

for name in "${LOCAL_FILES[@]}"; do
  if echo "$all_changed" | grep -q "/$name$\|^projects/topoassist/$name$"; then
    local_list="$local_list $name"
  fi
done

msg=""

# Auto-push GAS files via clasp
if [ "$gas_changed" = "true" ]; then
  if [ ! -f "$TOPODIR/.clasp.json" ]; then
    msg="[DEPLOY] .clasp.json missing — run: cd $TOPODIR && clasp login --no-localhost, then create .clasp.json"
  else
    push_out=$(cd "$TOPODIR" && clasp push 2>&1)
    push_exit=$?
    if [ $push_exit -eq 0 ]; then
      pushed=$(echo "$push_out" | grep "Pushed" | head -1)
      msg="[DEPLOY] clasp push OK — ${pushed:-GAS files pushed}"
      # Marker read by post-change-summary.sh to avoid false "clasp push needed" warnings
      date +%s > /tmp/topoassist_clasp_last_push
    else
      err=$(echo "$push_out" | tail -2 | tr '\n' ' ')
      msg="[DEPLOY] clasp push FAILED: $err — re-auth: cd $TOPODIR && clasp login --no-localhost"
    fi
  fi
fi

# Remind for local device_bridge.py
if [ -n "$local_list" ]; then
  mac_msg="[DEPLOY] Mac re-deploy needed:$(echo $local_list | tr ' ' ',') — scp bus-home:$TOPODIR/device_bridge.py ~/device_bridge.py"
  msg="$msg $mac_msg"
fi

if [ -n "$msg" ]; then
  jq -n --arg ctx "$msg" \
    '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":$ctx}}'
fi
