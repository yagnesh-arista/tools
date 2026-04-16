#!/usr/bin/env bash
# Fires after any Bash command that reverts/rolls back code.
# Appends an entry to ~/claude/ROLLBACKS.md for future reference.
#
# Triggers on:
#   - git revert <hash> (direct revert, creates its own commit)
#   - git commit with "revert" or "rollback" in the message

input=$(cat)
cmd=$(echo "$input" | jq -r '.tool_input.command // ""')

# Detect direct git revert (not --no-commit, which has no commit yet)
is_revert_cmd=0
echo "$cmd" | grep -qiE 'git\s+revert\s' && ! echo "$cmd" | grep -q '\-\-no-commit' && is_revert_cmd=1

# Detect git commit with revert/rollback in the message
is_revert_commit=0
if echo "$cmd" | grep -qiE 'git\s+commit'; then
  echo "$cmd" | grep -qiE '"[Rr]evert|[Rr]ollback|[Rr]olled.back' && is_revert_commit=1
fi

[ "$is_revert_cmd" -eq 0 ] && [ "$is_revert_commit" -eq 0 ] && exit 0

REPO=/home/yagnesh/claude
cd "$REPO" 2>/dev/null || exit 0

hash=$(git log -1 --format="%h" 2>/dev/null)
msg=$(git log -1 --format="%s" 2>/dev/null)
date_str=$(date "+%Y-%m-%d")

# Determine project from changed files
project=$(git diff HEAD~1..HEAD --name-only 2>/dev/null \
  | grep -oP 'projects/[^/]+' | sort -u | head -1 | sed 's|projects/||')
[ -z "$project" ] && project="global"

# Files changed (exclude INSTRUCTIONS churn)
files=$(git diff HEAD~1..HEAD --name-only 2>/dev/null \
  | grep -v 'INSTRUCTIONS_' | tr '\n' ', ' | sed 's/,$//')

ROLLBACK_FILE="$REPO/ROLLBACKS.md"
if [ ! -f "$ROLLBACK_FILE" ]; then
  printf "# Rollback Log\n\nReverts and rollbacks across all projects, with reasons.\n\n---\n\n" \
    > "$ROLLBACK_FILE"
fi

{
  printf "## %s | %s | %s\n" "$date_str" "$project" "$hash"
  printf "**%s**  \n" "$msg"
  [ -n "$files" ] && printf "Files: %s\n" "$files"
  printf "\n"
} >> "$ROLLBACK_FILE"

echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PostToolUse\",\"additionalContext\":\"[ROLLBACK LOG] Entry added → ~/claude/ROLLBACKS.md ($project | $hash)\"}}"
