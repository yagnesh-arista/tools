#!/bin/bash
# settings v260420.30 | 2026-04-20 11:54:15
# post-change-summary.sh
# PostToolUse hook on Bash — fires when command includes git commit, git push, or clasp push.
# Reports:
#   - All affected files + current version stamp
#   - Git push: success/failure with repo name (github.com/user/repo)
#   - Clasp push: success/failure with GAS project name + short scriptId

input=$(cat)
cmd=$(echo "$input" | jq -r '.tool_input.command // ""')

# Only fire on relevant commands — strip quoted strings first to avoid false
# positives from commit messages containing "git push" etc.
cmd_unquoted=$(echo "$cmd" | sed 's/"[^"]*"//g; s/'"'"'[^'"'"']*'"'"'//g')
echo "$cmd_unquoted" | grep -qE 'git\s+(commit|push)|clasp\s+push' || exit 0

REPO="$HOME/claude"

# ── Repo name from remote URL (e.g. github.com/yagnesh-arista/claude) ─────────
REMOTE_URL=$(git -C "$REPO" remote get-url origin 2>/dev/null)
REPO_NAME=$(echo "$REMOTE_URL" \
  | sed 's|https://github\.com/||;s|git@github\.com:||;s|\.git$||')
[ -z "$REPO_NAME" ] && REPO_NAME="origin/main"

# ── Last commit details ───────────────────────────────────────────────────────
COMMIT_HASH=$(git -C "$REPO" log -1 --format="%h" 2>/dev/null)
COMMIT_MSG=$(git -C "$REPO" log -1 --format="%s" 2>/dev/null | cut -c1-60)

# ── Determine which files to show ────────────────────────────────────────────
# git push → all files across every pushed commit via reflog (prev origin/main..HEAD)
# git commit only, or clasp push → last commit only (HEAD~1..HEAD)
FILE_FILTER='CLAUDE\.md\|MEMORY\.md\|ROLLBACKS\.md\|\.template$'

if echo "$cmd_unquoted" | grep -qE 'git\s+push'; then
  prev_remote=$(git -C "$REPO" reflog show --format='%H' origin/main 2>/dev/null \
    | sed -n '2p')
  if [ -n "$prev_remote" ]; then
    CHANGED_FILES=$(git -C "$REPO" diff "$prev_remote"..HEAD --name-only 2>/dev/null \
      | grep -v "$FILE_FILTER")
  else
    CHANGED_FILES=$(git -C "$REPO" diff HEAD~1 HEAD --name-only 2>/dev/null \
      | grep -v "$FILE_FILTER")
  fi
else
  CHANGED_FILES=$(git -C "$REPO" diff HEAD~1 HEAD --name-only 2>/dev/null \
    | grep -v "$FILE_FILTER")
fi

# ── Extract version stamp from each changed file ──────────────────────────────
GAS_NAMES="Code.gs Sidebar.html Sidebar-js.html Sidebar-css.html SheetAssistPanel.html UserGuide.html Tests.gs"
file_lines=""
gas_changed=0
gas_project_dir=""

while IFS= read -r rel; do
  [ -z "$rel" ] && continue
  full="$REPO/$rel"
  fname=$(basename "$rel")
  [ -f "$full" ] || continue

  # Version stamp: line 2 for shebang files, line 1 otherwise
  line1=$(head -1 "$full" 2>/dev/null)
  if echo "$line1" | grep -q '^#!'; then
    stamp_line=$(sed -n '2p' "$full" 2>/dev/null)
  else
    stamp_line="$line1"
  fi
  ver=$(echo "$stamp_line" | grep -oE 'v[0-9]+\.[0-9]+' | head -1)
  [ -z "$ver" ] && ver="(no stamp)"

  file_lines="${file_lines}"$'\n'"  ${fname}  ${ver}"

  # Track GAS files and which project dir they're in
  if echo "$rel" | grep -q 'topoassist/' && echo "$GAS_NAMES" | grep -qw "$fname"; then
    gas_changed=1
    gas_project_dir=$(dirname "$full")
  fi
done <<< "$CHANGED_FILES"

[ -z "$file_lines" ] && exit 0   # nothing meaningful changed

# ── Git push status ───────────────────────────────────────────────────────────
unpushed=$(git -C "$REPO" log --oneline origin/main..HEAD 2>/dev/null | wc -l | tr -d ' ')
if echo "$cmd_unquoted" | grep -qE 'git\s+push'; then
  if [ "$unpushed" -eq 0 ]; then
    git_status="pushed to github.com/${REPO_NAME} ✓"
  else
    git_status="push to github.com/${REPO_NAME} FAILED — still ${unpushed} commit(s) ahead ✗"
  fi
else
  if [ "$unpushed" -gt 0 ]; then
    git_status="committed (not pushed — ${unpushed} ahead of github.com/${REPO_NAME})"
  else
    git_status="committed — already in sync with github.com/${REPO_NAME}"
  fi
fi

# ── Clasp script info from .clasp.json ───────────────────────────────────────
clasp_label="GAS project"
if [ -n "$gas_project_dir" ] && [ -f "$gas_project_dir/.clasp.json" ]; then
  script_id=$(jq -r '.scriptId // ""' "$gas_project_dir/.clasp.json" 2>/dev/null)
  script_name=$(basename "$gas_project_dir")   # e.g. "topoassist"
  short_id=$(echo "$script_id" | cut -c1-12)   # first 12 chars of scriptId
  clasp_label="${script_name} [${short_id}...]"
fi

# ── Clasp push status ─────────────────────────────────────────────────────────
CLASP_MARKER=/tmp/topoassist_clasp_last_push
if echo "$cmd_unquoted" | grep -qE 'clasp\s+push'; then
  clasp_status="${clasp_label} push ran ✓"
elif [ "$gas_changed" -eq 1 ]; then
  if [ -f "$CLASP_MARKER" ]; then
    last_push=$(cat "$CLASP_MARKER" 2>/dev/null)
    now=$(date +%s)
    age=$(( now - ${last_push:-0} ))
    if [ "$age" -lt 1800 ]; then
      pushed_at=$(date -d "@${last_push}" '+%H:%M:%S' 2>/dev/null \
        || date -r "${last_push}" '+%H:%M:%S' 2>/dev/null)
      clasp_status="${clasp_label} pushed by edit hook at ${pushed_at} ✓"
    else
      clasp_status="${clasp_label} push needed ⚠ (last push was ${age}s ago)"
    fi
  else
    clasp_status="${clasp_label} push needed ⚠"
  fi
else
  clasp_status="N/A (no GAS files changed)"
fi

# ── Build summary ─────────────────────────────────────────────────────────────
SUMMARY="[CHANGE SUMMARY] commit hash: ${COMMIT_HASH} — ${COMMIT_MSG}
Files:${file_lines}
Git:   ${git_status}
Clasp: ${clasp_status}"

jq -n --arg ctx "$SUMMARY" '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":$ctx}}'
