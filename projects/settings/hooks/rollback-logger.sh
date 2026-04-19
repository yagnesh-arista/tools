#!/usr/bin/env bash
# settings v260420.21 | 2026-04-20 03:34:18 | git commit: 62af944
# Fires after any Bash command that reverts/rolls back code.
# Appends an entry to ~/claude/ROLLBACKS.md for future reference.
#
# Triggers on:
#   - git revert <hash> [--no-commit or direct] — logs from the reverted commits
#   - git commit whose message STARTS with Revert/Rollback — logs from new commit

input=$(cat)
cmd=$(echo "$input" | jq -r '.tool_input.command // ""')

is_revert_cmd=0
is_revert_commit=0

# Any git revert (with or without --no-commit)
echo "$cmd" | grep -qiE 'git\s+revert\s' && is_revert_cmd=1

# git commit where message STARTS with Revert/Rollback
# (extract between -m "..." to avoid matching filenames like rollback-logger.sh)
if echo "$cmd" | grep -qiE 'git\s+commit'; then
  commit_msg=$(echo "$cmd" | grep -oP "(?<=-m \")[^\"]+(?=\")" | head -1)
  echo "$commit_msg" | grep -qiE '^(Revert|Rollback|Rolled back)\b' && is_revert_commit=1
fi

[ "$is_revert_cmd" -eq 0 ] && [ "$is_revert_commit" -eq 0 ] && exit 0

REPO=/home/yagnesh/claude
cd "$REPO" 2>/dev/null || exit 0
date_str=$(date "+%Y-%m-%d")

if [ "$is_revert_commit" -eq 1 ]; then
  # Commit already made — get info from git log
  hash=$(git log -1 --format="%h" 2>/dev/null)
  msg=$(git log -1 --format="%s" 2>/dev/null)
  project=$(git diff HEAD~1..HEAD --name-only 2>/dev/null \
    | grep -oP 'projects/[^/]+' | sort -u | head -1 | sed 's|projects/||')
  files=$(git diff HEAD~1..HEAD --name-only 2>/dev/null \
    | grep -v 'INSTRUCTIONS_' | tr '\n' ', ' | sed 's/,$//')
  label="$hash"
else
  # git revert (--no-commit or direct): get info from reverted commits
  hashes=$(echo "$cmd" | grep -oE '\b[0-9a-f]{7,40}\b' | tr '\n' ' ')
  msg="Revert: $(for h in $hashes; do git log -1 --format="%s" "$h" 2>/dev/null; done | tr '\n' '; ')"
  project=$(for h in $hashes; do
    git show --name-only --format="" "$h" 2>/dev/null
  done | grep -oP 'projects/[^/]+' | sort -u | head -1 | sed 's|projects/||')
  files=$(for h in $hashes; do git show --name-only --format="" "$h" 2>/dev/null; done \
    | grep -v 'INSTRUCTIONS_' | sort -u | tr '\n' ', ' | sed 's/,$//')
  label="${hashes%% *}…"
fi

[ -z "$project" ] && project="global"

ROLLBACK_FILE="$REPO/ROLLBACKS.md"
[ ! -f "$ROLLBACK_FILE" ] && \
  printf "# Rollback Log\n\nReverts and rollbacks across all projects, with reasons.\n\n---\n\n" \
    > "$ROLLBACK_FILE"

{
  printf "## %s | %s | %s\n" "$date_str" "$project" "$label"
  printf "**%s**  \n" "$msg"
  [ -n "$files" ] && printf "Files: %s\n" "$files"
  printf "\n"
} >> "$ROLLBACK_FILE"

jq -n --arg ctx "[ROLLBACK LOG] Entry added → ~/claude/ROLLBACKS.md ($project | $label)" \
  '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":$ctx}}'
