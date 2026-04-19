#!/bin/bash
# settings v260420.21 | 2026-04-20 03:34:18 | git commit: 62af944
# post-change-summary.sh
# PostToolUse hook on Bash — fires when command includes git commit, git push, or clasp push.
# Reports:
#   - Files changed in last commit with their version stamps
#   - Git push status (pushed / ahead / not attempted)
#   - Clasp push status (done / needed / not applicable)

input=$(cat)
cmd=$(echo "$input" | jq -r '.tool_input.command // ""')

# Only fire on relevant commands — strip quoted strings first so that
# echo "git commit ..." or grep patterns don't cause false positives.
cmd_unquoted=$(echo "$cmd" | sed 's/"[^"]*"//g; s/'"'"'[^'"'"']*'"'"'//g')
echo "$cmd_unquoted" | grep -qE 'git\s+(commit|push)|clasp\s+push' || exit 0

REPO="$HOME/claude"

# ── Last commit details ───────────────────────────────────────────────────────
COMMIT_HASH=$(git -C "$REPO" log -1 --format="%h" 2>/dev/null)
COMMIT_MSG=$(git -C "$REPO" log -1 --format="%s" 2>/dev/null | cut -c1-60)
CHANGED_FILES=$(git -C "$REPO" diff HEAD~1 HEAD --name-only 2>/dev/null | grep -v 'INSTRUCTIONS_\|CLAUDE\.md\|MEMORY\.md\|ROLLBACKS\.md\|\.template$')

# ── Extract version stamp from line 1 of each changed file ───────────────────
GAS_NAMES="Code.gs Sidebar.html Sidebar-js.html Sidebar-css.html SheetAssistPanel.html UserGuide.html Tests.gs"
file_lines=""
gas_changed=0

while IFS= read -r rel; do
  [ -z "$rel" ] && continue
  full="$REPO/$rel"
  fname=$(basename "$rel")
  [ -f "$full" ] || continue

  # Extract version token — shebang files stamp on line 2
  line1=$(head -1 "$full" 2>/dev/null)
  if echo "$line1" | grep -q '^#!'; then
    stamp_line=$(sed -n '2p' "$full" 2>/dev/null)
  else
    stamp_line="$line1"
  fi
  ver=$(echo "$stamp_line" | grep -oE 'v[0-9]+\.[0-9]+' | head -1)
  [ -z "$ver" ] && ver="(no stamp)"

  file_lines="${file_lines}"$'\n'"  ${fname}  ${ver}"

  # Track GAS files for clasp check
  if echo "$rel" | grep -q 'topoassist/' && echo "$GAS_NAMES" | grep -qw "$fname"; then
    gas_changed=1
  fi
done <<< "$CHANGED_FILES"

[ -z "$file_lines" ] && exit 0   # nothing meaningful changed

# ── Git push status ───────────────────────────────────────────────────────────
unpushed=$(git -C "$REPO" log --oneline origin/main..HEAD 2>/dev/null | wc -l | tr -d ' ')
if echo "$cmd" | grep -qE 'git\s+push'; then
  if [ "$unpushed" -eq 0 ]; then
    git_status="pushed to origin/main ✓"
  else
    git_status="push FAILED or still ${unpushed} commit(s) ahead ✗"
  fi
else
  if [ "$unpushed" -gt 0 ]; then
    git_status="committed (not pushed — ${unpushed} ahead of origin/main)"
  else
    git_status="already in sync with origin/main"
  fi
fi

# ── Clasp push status ─────────────────────────────────────────────────────────
CLASP_MARKER=/tmp/topoassist_clasp_last_push
if echo "$cmd" | grep -qE 'clasp\s+push'; then
  clasp_status="clasp push ran ✓"
elif [ "$gas_changed" -eq 1 ]; then
  # Check if the edit-time hook already pushed recently (within 30 min)
  if [ -f "$CLASP_MARKER" ]; then
    last_push=$(cat "$CLASP_MARKER" 2>/dev/null)
    now=$(date +%s)
    age=$(( now - ${last_push:-0} ))
    if [ "$age" -lt 1800 ]; then
      pushed_at=$(date -d "@${last_push}" '+%H:%M:%S' 2>/dev/null || date -r "${last_push}" '+%H:%M:%S' 2>/dev/null)
      clasp_status="already pushed by edit hook at ${pushed_at} ✓"
    else
      clasp_status="GAS files changed — clasp push needed ⚠ (last push was ${age}s ago)"
    fi
  else
    clasp_status="GAS files changed — clasp push needed ⚠"
  fi
else
  clasp_status="N/A (no GAS files changed)"
fi

# ── Patch GAS stamp lines with correct commit hash ────────────────────────────
# The stamp hook fires at edit time (before git commit exists), so line 1
# always shows the previous commit hash. Fix it here with a tiny fixup commit.
# Guard: skip if this IS a stamp commit (prevents infinite loop).
if ! echo "$COMMIT_MSG" | grep -qE '^stamp:'; then
  PATCHED_FILES=""
  while IFS= read -r rel; do
    [ -z "$rel" ] && continue
    full="$REPO/$rel"
    fname=$(basename "$rel")
    [ -f "$full" ] || continue
    if echo "$rel" | grep -q 'topoassist/' && echo "$GAS_NAMES" | grep -qw "$fname"; then
      line1=$(head -1 "$full" 2>/dev/null)
      if echo "$line1" | grep -qE 'TopoAssist.*git commit:'; then
        patched=$(python3 - "$full" "$COMMIT_HASH" <<'PYEOF'
import sys, re
path, h = sys.argv[1], sys.argv[2]
with open(path) as fh: lines = fh.readlines()
if lines:
    new = re.sub(r'git commit: [0-9a-f]+', f'git commit: {h}', lines[0])
    if new != lines[0]:
        lines[0] = new
        with open(path, 'w') as fh: fh.writelines(lines)
        print('patched')
PYEOF
)
        [ "$patched" = "patched" ] && PATCHED_FILES="$PATCHED_FILES $full"
      fi
    fi
  done <<< "$CHANGED_FILES"

  if [ -n "$PATCHED_FILES" ]; then
    git -C "$REPO" add $PATCHED_FILES 2>/dev/null
    git -C "$REPO" commit -m "stamp: fix line-1 commit hash → ${COMMIT_HASH}" 2>/dev/null
    if echo "$cmd_unquoted" | grep -qE 'git\s+push'; then
      git -C "$REPO" push 2>/dev/null
    fi
  fi
fi

# ── Build summary ─────────────────────────────────────────────────────────────
SUMMARY="[CHANGE SUMMARY] commit hash: ${COMMIT_HASH} — ${COMMIT_MSG}
Files:${file_lines}
Git:   ${git_status}
Clasp: ${clasp_status}"

jq -n --arg ctx "$SUMMARY" '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":$ctx}}'
