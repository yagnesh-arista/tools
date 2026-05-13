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

# Sync full content of device_bridge.py into downloadBridgeScript() in Sidebar-js.html
# This replaces the embedded template literal (const src = `...`;) with the updated file.
python3 - "$DB" "$SB" <<'PYEOF'
import sys, re

db_path, sb_path = sys.argv[1], sys.argv[2]

with open(db_path) as fh:
    py_content = fh.read()

# Escape for JS template literal: backslashes first, then backticks, then ${
escaped = py_content.replace('\\', '\\\\').replace('`', '\\`').replace('${', '\\${')

with open(sb_path) as fh:
    sb_content = fh.read()

# Find the template literal: from "const src = `" through "`;" (non-greedy)
m = re.search(r'const src = `([\s\S]*?)`;', sb_content)
if not m:
    print('[BRIDGE SYNC] ERROR: could not find template literal in Sidebar-js.html', file=sys.stderr)
    sys.exit(1)

new_sb = sb_content[:m.start(1)] + escaped + sb_content[m.end(1):]
if new_sb != sb_content:
    with open(sb_path, 'w') as fh:
        fh.write(new_sb)
    print(f'[BRIDGE SYNC] Embedded template synced from device_bridge.py ({len(py_content)} bytes)')
else:
    print('[BRIDGE SYNC] No content change')
PYEOF
