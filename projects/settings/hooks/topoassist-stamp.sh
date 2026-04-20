#!/bin/bash
# settings v260420.27 | 2026-04-20 10:53:00
# topoassist-stamp.sh
# On every Edit/Write of a TopoAssist GAS file:
#   1. Auto-calculates date-based version: YYMMDD.N
#      - YYMMDD = today's date
#      - N      = committed topoassist changes today + 1 (current in-progress)
#   2. Updates APP_VERSION in Code.gs + Sidebar-js.html if it changed
#   3. Stamps line 1 of the edited file (and any files whose APP_VERSION was updated)
#
# Result: version name encodes the date + how many changes shipped that day.

input=$(cat)
f=$(echo "$input" | jq -r '.tool_input.file_path // ""')

# Only process the 7 GAS deployment files
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

TOPODIR="$HOME/claude/projects/topoassist"

# ── Calculate version: YYMMDD.N ─────────────────────────────────────────────
YYMMDD=$(date "+%y%m%d")
COUNT=$(git -C "$HOME/claude" log --since=midnight --oneline -- projects/topoassist/ 2>/dev/null | wc -l | tr -d ' ')
N=$((COUNT + 1))
VERSION="${YYMMDD}.${N}"

DATETIME=$(date "+%Y-%m-%d %H:%M:%S")

# ── Update APP_VERSION in Code.gs + Sidebar-js.html if it changed ───────────
CURRENT_VER=$(grep 'const APP_VERSION' "$TOPODIR/Code.gs" 2>/dev/null \
  | sed "s/.*APP_VERSION = \"//;s/\".*//" | head -1)

UPDATED_FILES=""
if [ "$CURRENT_VER" != "$VERSION" ]; then
  python3 - "$TOPODIR" "$VERSION" <<'PYEOF'
import sys, re
topodir, ver = sys.argv[1], sys.argv[2]
for fname in ['Code.gs', 'Sidebar-js.html']:
    path = f'{topodir}/{fname}'
    try:
        with open(path) as fh: content = fh.read()
        new = re.sub(r'const APP_VERSION = "[^"]*"', f'const APP_VERSION = "{ver}"', content)
        if new != content:
            with open(path, 'w') as fh: fh.write(new)
            print(fname)
    except: pass
PYEOF
  UPDATED_FILES="Code.gs Sidebar-js.html"
fi

# ── Build stamp line ─────────────────────────────────────────────────────────
make_stamp() {
  local path="$1"
  if [[ "$path" == *.gs ]]; then
    echo "// TopoAssist v${VERSION} | ${DATETIME}"
  else
    echo "<!-- TopoAssist v${VERSION} | ${DATETIME} -->"
  fi
}

stamp_file() {
  local path="$1"
  local new_line
  new_line=$(make_stamp "$path")
  local first
  first=$(head -1 "$path")
  if [[ "$first" == "// TopoAssist"* ]] || [[ "$first" == "<!-- TopoAssist"* ]]; then
    python3 - "$path" "$new_line" <<'PYEOF'
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
}

# Stamp the edited file
stamp_file "$f"

# When version changes, stamp ALL GAS files and auto-stage them so every file
# stays in sync — not just Code.gs + Sidebar-js.html.
if [ "$CURRENT_VER" != "$VERSION" ]; then
  for gas in Code.gs Tests.gs Sidebar.html Sidebar-js.html Sidebar-css.html SheetAssistPanel.html UserGuide.html; do
    gas_path="$TOPODIR/$gas"
    if [ "$gas_path" != "$f" ] && [ -f "$gas_path" ]; then
      stamp_file "$gas_path"
      git -C "$HOME/claude" add "$gas_path" &>/dev/null
    fi
  done
fi
