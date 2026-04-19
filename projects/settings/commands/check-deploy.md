Run a three-way sync check across git → local → GAS remote, then summarize deploy status.

Execute this shell script and report the results in a clean table:

```bash
TOPODIR=~/claude/projects/topoassist
REPO=~/claude
PULL_DIR=$(mktemp -d)
trap "rm -rf $PULL_DIR" EXIT

GAS_FILES=(Code.gs Sidebar.html Sidebar-js.html Sidebar-css.html SheetAssistPanel.html UserGuide.html Tests.gs appsscript.json)

echo "Pulling GAS remote..."
cp "$TOPODIR/.clasp.json" "$PULL_DIR/.clasp.json"
(cd "$PULL_DIR" && clasp pull 2>/dev/null)

echo ""
echo "=== TopoAssist Sync Status ==="
echo ""
printf "%-28s %-12s %-14s\n" "File" "Git" "GAS Remote"
printf "%-28s %-12s %-14s\n" "----------------------------" "------------" "--------------"

any_issue=false

for fname in "${GAS_FILES[@]}"; do
  local_file="$TOPODIR/$fname"
  [ -f "$local_file" ] || continue

  # Git status vs HEAD
  git_status=$(git -C "$REPO" diff --name-only HEAD -- "projects/topoassist/$fname" 2>/dev/null)
  if [ -n "$git_status" ]; then
    git_label="DIRTY"
    any_issue=true
  else
    git_label="clean"
  fi

  # GAS remote — clasp pulls .gs as .js
  remote_file="$PULL_DIR/$fname"
  [ -f "$remote_file" ] || remote_file="$PULL_DIR/${fname%.gs}.js"
  if [ ! -f "$remote_file" ]; then
    gas_label="not on remote"
    any_issue=true
  elif diff -q "$local_file" "$remote_file" > /dev/null 2>&1; then
    gas_label="in sync"
  else
    gas_label="DIFFERS"
    any_issue=true
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
  echo "VERSION: MISMATCH — device_bridge.py=$db_ver_num  template=$tmpl_ver ✗"
  any_issue=true
fi
echo "Mac:     scp bus-home:$TOPODIR/device_bridge.py ~/device_bridge.py"

echo ""
if [ "$any_issue" = "false" ]; then
  echo "Status: ALL IN SYNC — git clean, GAS remote matches local."
else
  echo "Status: ISSUES FOUND — review items marked DIRTY / DIFFERS above."
fi
```

After running, show the table output, highlight any DIRTY or DIFFERS rows, and state what action is needed (git commit, clasp push, or VERSION bump).
