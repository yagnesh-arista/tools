Check whether the local topoassist files match what is deployed to the GAS script (script ID in .clasp.json).

Run this shell command and report the results:

```bash
set -e
TOPODIR=~/claude/projects/topoassist
TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

# Pull remote into temp dir using the project's .clasp.json
cp "$TOPODIR/.clasp.json" "$TMPDIR/.clasp.json"
cd "$TMPDIR" && clasp pull --rootDir "$TMPDIR" 2>/dev/null

echo "=== Sync check: local vs GAS remote ==="
any_diff=false

for remote_file in "$TMPDIR"/*.gs "$TMPDIR"/*.html "$TMPDIR"/*.json; do
  [ -f "$remote_file" ] || continue
  fname=$(basename "$remote_file")
  # clasp pulls .gs files as .js — map back
  local_fname="${fname%.js}.gs"
  [ -f "$TOPODIR/$local_fname" ] || local_fname="$fname"
  local_file="$TOPODIR/$local_fname"

  if [ ! -f "$local_file" ]; then
    echo "REMOTE ONLY (not in local): $fname"
    any_diff=true
  elif ! diff -q "$local_file" "$remote_file" > /dev/null 2>&1; then
    echo "DIFFERS: $local_fname"
    diff --unified=3 "$remote_file" "$local_file" | head -40
    any_diff=true
  else
    echo "OK: $local_fname"
  fi
done

# Check for local GAS files not on remote
for local_file in "$TOPODIR"/*.gs "$TOPODIR"/*.html; do
  [ -f "$local_file" ] || continue
  fname=$(basename "$local_file")
  [ "$fname" = "appsscript.json" ] && continue
  # remote uses same name for .html; .gs stays .gs
  if [ ! -f "$TMPDIR/$fname" ]; then
    echo "LOCAL ONLY (not on remote): $fname"
    any_diff=true
  fi
done

if [ "$any_diff" = "false" ]; then
  echo "All files in sync."
fi
```

Summarize: list files that are OK, files that differ (show the diff), and files only on one side. If all match, confirm in sync.
