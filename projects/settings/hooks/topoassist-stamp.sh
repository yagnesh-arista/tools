#!/bin/bash
# topoassist-stamp.sh
# On every Edit/Write of a TopoAssist GAS file, updates line 1 with:
#   version | datetime (with seconds) | git HEAD short hash
# Reads APP_VERSION dynamically from Code.gs so version-bump propagates automatically.

input=$(cat)
f=$(echo "$input" | jq -r '.tool_input.file_path // ""')

# Only stamp the 7 GAS deployment files
case "$f" in
  */topoassist/Code.gs|\
  */topoassist/Tests.gs|\
  */topoassist/Sidebar.html|\
  */topoassist/Sidebar-js.html|\
  */topoassist/Sidebar-css.html|\
  */topoassist/SheetAssistPanel.html|\
  */topoassist/UserGuide.html) ;;
  *) exit 0 ;;
esac

[ -f "$f" ] || exit 0

# Read APP_VERSION from Code.gs (source of truth)
VERSION=$(grep 'const APP_VERSION' ~/claude/projects/topoassist/Code.gs 2>/dev/null \
  | sed "s/.*APP_VERSION = \"//;s/\".*//" | head -1)
[ -z "$VERSION" ] && VERSION="?"

DATETIME=$(date "+%Y-%m-%d %H:%M:%S")
COMMIT=$(git -C ~/claude rev-parse --short HEAD 2>/dev/null || echo "no-git")

# Build stamp line
if [[ "$f" == *.gs ]]; then
  NEW_LINE="// TopoAssist v${VERSION} | ${DATETIME} | git commit: ${COMMIT}"
else
  NEW_LINE="<!-- TopoAssist v${VERSION} | ${DATETIME} | git commit: ${COMMIT} -->"
fi

# Only replace if line 1 already has the marker (guards against stampng wrong files)
FIRST=$(head -1 "$f")
if [[ "$FIRST" == "// TopoAssist"* ]] || [[ "$FIRST" == "<!-- TopoAssist"* ]]; then
  python3 - "$f" "$NEW_LINE" <<'PYEOF'
import sys
path, new_line = sys.argv[1], sys.argv[2]
with open(path, 'r') as fh:
    lines = fh.readlines()
if lines:
    lines[0] = new_line + '\n'
    with open(path, 'w') as fh:
        fh.writelines(lines)
PYEOF
fi
