#!/usr/bin/env bash
# topoassist v260421.158 | 2026-04-21 18:11:40
# TopoAssist three-way sync check: git → local → GAS remote + commit history.
# Called by /check-deploy command.

TOPODIR=~/claude/projects/topoassist
REPO=~/claude
PULL_DIR=$(mktemp -d)
trap "rm -rf $PULL_DIR" EXIT

GAS_FILES=(Code.gs Sidebar.html Sidebar-js.html Sidebar-css.html SheetAssistPanel.html UserGuide.html Tests.gs appsscript.json)
GAS_SET=" ${GAS_FILES[*]} "

# ── SECTION 1: THREE-WAY SYNC ──────────────────────────────────────────────
cp "$TOPODIR/.clasp.json" "$PULL_DIR/.clasp.json"
(cd "$PULL_DIR" && clasp pull 2>/dev/null)

echo "=== Sync Status: git → local → GAS remote ==="
printf "%-28s %-12s %-14s\n" "File" "Git" "GAS Remote"
printf "%-28s %-12s %-14s\n" "----------------------------" "------------" "--------------"

any_issue=false
for fname in "${GAS_FILES[@]}"; do
  local_file="$TOPODIR/$fname"
  [ -f "$local_file" ] || continue

  git_status=$(git -C "$REPO" diff --name-only HEAD -- "projects/topoassist/$fname" 2>/dev/null)
  if [ -n "$git_status" ]; then git_label="DIRTY"; any_issue=true; else git_label="clean"; fi

  remote_file="$PULL_DIR/$fname"
  [ -f "$remote_file" ] || remote_file="$PULL_DIR/${fname%.gs}.js"
  if [ ! -f "$remote_file" ]; then
    gas_label="not on remote"; any_issue=true
  elif diff -q "$local_file" "$remote_file" > /dev/null 2>&1; then
    gas_label="in sync"
  else
    gas_label="DIFFERS"; any_issue=true
  fi
  printf "%-28s %-12s %-14s\n" "$fname" "$git_label" "$gas_label"
done

echo ""
echo "── device_bridge.py ──────────────────────────────"
db_git=$(git -C "$REPO" diff --name-only HEAD -- projects/topoassist/device_bridge.py 2>/dev/null)
[ -n "$db_git" ] && echo "Git:     DIRTY (uncommitted changes)" && any_issue=true || echo "Git:     clean"
db_ver_num=$(grep "^VERSION" "$TOPODIR/device_bridge.py" | head -1 | sed "s/VERSION[[:space:]]*=[[:space:]]*['\"]//;s/['\"].*//")
tmpl_ver=$(grep -m1 '^VERSION' "$TOPODIR/Sidebar-js.html" | sed "s/VERSION[[:space:]]*=[[:space:]]*['\"]//;s/['\"].*//")
if [ "$db_ver_num" = "$tmpl_ver" ]; then
  echo "VERSION: $db_ver_num ✓"
else
  echo "VERSION: MISMATCH — device_bridge.py=$db_ver_num  template=$tmpl_ver ✗"; any_issue=true
fi

echo ""
[ "$any_issue" = "false" ] && echo "Overall: ALL IN SYNC — git clean, GAS remote matches local." || echo "Overall: ISSUES FOUND — see DIRTY / DIFFERS rows above."

# ── SECTION 2: COMMIT HISTORY ──────────────────────────────────────────────
echo ""
echo "=== Commit History ==="

_classify() {
  local fname
  fname=$(basename "$1")
  [[ "$GAS_SET" == *" $fname "* ]] && echo "GAS" && return
  [[ "$fname" == "device_bridge.py" ]] && echo "LOCAL" && return
  echo "other"
}

_print_window() {
  local label="$1"
  local since="$2"
  local until_arg="$3"
  local files
  if [ -n "$until_arg" ]; then
    files=$(git -C "$REPO" log --since="$since" --until="$until_arg" --name-only --pretty=format: -- projects/topoassist/ 2>/dev/null | sort -u | grep -v '^$')
  else
    files=$(git -C "$REPO" log --since="$since" --name-only --pretty=format: -- projects/topoassist/ 2>/dev/null | sort -u | grep -v '^$')
  fi
  [ -z "$files" ] && return
  echo "── $label ──"
  while IFS= read -r f; do
    printf "  %-40s [%s]\n" "$(basename "$f")" "$(_classify "$f")"
  done <<< "$files"
  echo ""
}

uncommitted=$(git -C "$REPO" status --short -- projects/topoassist/ 2>/dev/null | awk '{print $2}' | xargs -I{} basename {})
if [ -n "$uncommitted" ]; then
  echo "── Uncommitted (NOT in git, NOT deployed) ⚠ ──"
  while IFS= read -r f; do
    printf "  %-40s [%s]\n" "$f" "$(_classify "$f")"
  done <<< "$uncommitted"
  echo ""
fi

_print_window "Today" "midnight" ""
_print_window "Last Week (1–7 days ago)" "7 days ago" "midnight"
_print_window "Last Month (8–30 days ago)" "30 days ago" "7 days ago"
