#!/bin/bash
# git-uncommitted-check.sh
# Stop hook: after each Claude turn, check all project repos for uncommitted changes.
# Only outputs when there are actual modifications — stays silent otherwise.

PROJECTS_DIR="/home/yagnesh/claude/projects"
CLAUDE_ROOT="/home/yagnesh/claude"

summary=""

# Check each project sub-repo
for repo in "$PROJECTS_DIR"/*/; do
    [ -d "$repo" ] || continue
    git -C "$repo" rev-parse --git-dir > /dev/null 2>&1 || continue
    status=$(git -C "$repo" status --porcelain 2>/dev/null)
    [ -z "$status" ] && continue
    proj=$(basename "$repo")
    count=$(echo "$status" | grep -c .)
    summary="$summary $proj(${count})"
done

# Check the root ~/claude repo itself
status=$(git -C "$CLAUDE_ROOT" status --porcelain 2>/dev/null)
if [ -n "$status" ]; then
    count=$(echo "$status" | grep -c .)
    summary="$summary claude-root(${count})"
fi

if [ -n "$summary" ]; then
    msg="[GIT] Uncommitted changes detected in:$summary. "
    msg+="Remind the user to commit and push before ending the session to avoid losing work."
    printf '{"hookSpecificOutput":{"hookEventName":"Stop","additionalContext":"%s"}}' \
        "$(echo "$msg" | sed 's/"/\\"/g')"
fi
