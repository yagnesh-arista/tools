#!/bin/bash
# settings v260420.21 | 2026-04-20 03:34:18 | git commit: 62af944
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

# ~/claude root is handled by post-change-summary.sh Stop hook (auto-commits on session end)

if [ -n "$summary" ]; then
    msg="[GIT] Uncommitted changes in standalone sub-repos:$summary. Commit and push before ending the session."
    jq -n --arg msg "$msg" '{"systemMessage": $msg}'
fi
