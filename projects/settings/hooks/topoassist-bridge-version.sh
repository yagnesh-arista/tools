#!/bin/bash
# settings v260509.2 | 2026-05-09 12:06:25
# topoassist-bridge-version.sh
# Fires after device_bridge.py is edited.
# Auto-bumps VERSION = "YYMMDD.N" in device_bridge.py AND the embedded
# template in Sidebar-js.html so /health always reflects the current edit.

input=$(cat)
f=$(echo "$input" | jq -r '.tool_input.file_path // ""')

DB="$HOME/claude/projects/topoassist/device_bridge.py"
SB="$HOME/claude/projects/topoassist/Sidebar-js.html"

[ "$f" = "$DB" ] || exit 0

TODAY=$(date +%y%m%d)
CURRENT=$(sed -n 's/^VERSION[[:space:]]*=[[:space:]]*"\([^"]*\)".*/\1/p' "$DB" | head -1)

if [[ "$CURRENT" == ${TODAY}.* ]]; then
    N=$(echo "$CURRENT" | cut -d. -f2)
    NEW="${TODAY}.$((N + 1))"
else
    NEW="${TODAY}.1"
fi

# Update device_bridge.py
sed -i "s/^VERSION\(\s*\)= \"[^\"]*\"/VERSION\1= \"$NEW\"/" "$DB"

# Update embedded template in Sidebar-js.html
sed -i "s/^VERSION\(\s*\)= \"[^\"]*\"/VERSION\1= \"$NEW\"/" "$SB"

echo "[BRIDGE VERSION] $CURRENT → $NEW (device_bridge.py + embedded template)"
