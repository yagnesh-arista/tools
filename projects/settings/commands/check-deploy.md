Run a three-way sync check across git → local → GAS remote, then show commit history by time window.

Execute this shell script and report the results:

```bash
TOPODIR=~/claude/projects/topoassist
REPO=~/claude
PULL_DIR=$(mktemp -d)
trap "rm -rf $PULL_DIR" EXIT

GAS_FILES=(Code.gs Sidebar.html Sidebar-js.html Sidebar-css.html SheetAssistPanel.html UserGuide.html Tests.gs appsscript.json)
GAS_SET=" ${GAS_FILES[*]} "
LOCAL_FILES=(device_bridge.py)

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
db_ver_num=$(grep "^VERSION" "$TOPODIR/device_bridge.py" | head -1 | sed "s/VERSION = '//;s/'.*//")
tmpl_ver=$(grep 'VERSION = ' "$TOPODIR/Sidebar-js.html" | head -1 | sed "s/.*VERSION = '//;s/'.*//")
if [ "$db_ver_num" = "$tmpl_ver" ]; then
  echo "VERSION: $db_ver_num (device_bridge.py = Sidebar-js.html template) ✓"
else
  echo "VERSION: MISMATCH — device_bridge.py=$db_ver_num  template=$tmpl_ver ✗"; any_issue=true
fi

echo ""
if [ "$any_issue" = "false" ]; then
  echo "Overall: ALL IN SYNC — git clean, GAS remote matches local."
else
  echo "Overall: ISSUES FOUND — see DIRTY / DIFFERS rows above."
fi

# ── SECTION 2: COMMIT HISTORY ──────────────────────────────────────────────
echo ""
echo "=== Commit History ==="

classify() {
  local f=$(basename "$1")
  [[ "$GAS_SET" == *" $f "* ]] && echo "GAS" && return
  [[ "$f" == "device_bridge.py" ]] && echo "LOCAL" && return
  echo "other"
}

print_window() {
  local label="$1"; local since="$2"; local until="$3"
  local files
  if [ -n "$until" ]; then
    files=$(git -C "$REPO" log --since="$since" --until="$until" --name-only --pretty=format: -- projects/topoassist/ 2>/dev/null | sort -u | grep -v '^$')
  else
    files=$(git -C "$REPO" log --since="$since" --name-only --pretty=format: -- projects/topoassist/ 2>/dev/null | sort -u | grep -v '^$')
  fi
  [ -z "$files" ] && return
  echo ""
  echo "── $label ──"
  while IFS= read -r f; do
    target=$(classify "$f")
    printf "  %-40s [%s]\n" "$(basename $f)" "$target"
  done <<< "$files"
}

print_window "Uncommitted (working tree)" "" ""
# For uncommitted use git status instead
uncommitted=$(git -C "$REPO" status --short -- projects/topoassist/ 2>/dev/null | awk '{print $2}' | xargs -I{} basename {})
if [ -n "$uncommitted" ]; then
  echo ""
  echo "── Uncommitted (local only — NOT in git, NOT deployed) ──"
  while IFS= read -r f; do
    target=$(classify "$f")
    printf "  %-40s [%s] ⚠ needs commit\n" "$f" "$target"
  done <<< "$uncommitted"
fi

print_window "Today" "midnight" ""
print_window "Last Week (1–7 days ago)" "7 days ago" "midnight"
print_window "Last Month (8–30 days ago)" "30 days ago" "7 days ago"
```

After running:
1. Show the sync table (Section 1) — highlight any DIRTY or DIFFERS rows and state the action needed (git commit, clasp push, VERSION bump).
2. Show the commit history (Section 2) — group files by [GAS] or [LOCAL] target. Flag any [LOCAL] changes as needing Mac scp deploy. Flag any uncommitted files with a warning.
