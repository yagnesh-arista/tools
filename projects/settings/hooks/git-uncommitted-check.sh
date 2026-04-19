#!/bin/bash
# git-uncommitted-check.sh
# Stop hook: after each Claude turn, check all project repos for uncommitted changes.
# Only outputs when there are actual modifications — stays silent otherwise.

PROJECTS_DIR="/home/yagnesh/claude/projects"
CLAUDE_ROOT="/home/yagnesh/claude"

summary=""
CLAUDE_ROOT_GIT=$(git -C "$CLAUDE_ROOT" rev-parse --absolute-git-dir 2>/dev/null)

# Check each project sub-repo — skip dirs that inherit the root repo
for repo in "$PROJECTS_DIR"/*/; do
    [ -d "$repo" ] || continue
    git -C "$repo" rev-parse --git-dir > /dev/null 2>&1 || continue
    repo_git=$(git -C "$repo" rev-parse --absolute-git-dir 2>/dev/null)
    # Only report standalone sub-repos, not dirs inheriting ~/claude/.git
    [ "$repo_git" = "$CLAUDE_ROOT_GIT" ] && continue
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
    msg="[GIT] Uncommitted changes detected in:$summary. Remind the user to commit and push before ending the session."
    jq -n --arg msg "$msg" '{"systemMessage": $msg}'
fi
