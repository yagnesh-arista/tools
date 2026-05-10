#!/usr/bin/env bash
# settings v260510.1 | 2026-05-10
# UserPromptSubmit hook — fires once per session on first user message.
# Runs lightweight preflight checks and injects a systemMessage summary.
# Stop hook removes the marker so the next session gets a fresh run.

MARKER=/tmp/claude-preflight-done
SESSION_WINDOW=43200  # 12h — covers long sessions; handles crash-no-Stop case

if [ -f "$MARKER" ]; then
  age=$(( $(date +%s) - $(stat -c %Y "$MARKER" 2>/dev/null || echo 0) ))
  [ "$age" -lt "$SESSION_WINDOW" ] && exit 0
fi

# Mark immediately — prevents duplicate fires if hook is somehow called twice
touch "$MARKER"

REPO="$HOME/claude"

# 1. Git state
git_short=$(git -C "$REPO" status --short 2>/dev/null | grep -v '^??' | head -5)
unpushed=$(git -C "$REPO" log --oneline origin/main..HEAD 2>/dev/null | wc -l | tr -d ' ')
if [ -z "$git_short" ] && [ "${unpushed:-0}" -eq 0 ]; then
  git_line="clean ✓"
else
  dirty=$(echo "$git_short" | grep -c . 2>/dev/null || echo 0)
  git_line="${dirty} modified, ${unpushed} unpushed"
fi

# 2. clasp auth age
clasp_line="n/a"
if [ -f "$HOME/.clasprc.json" ]; then
  mtime=$(stat -c %Y "$HOME/.clasprc.json" 2>/dev/null \
       || stat -f %m "$HOME/.clasprc.json" 2>/dev/null \
       || echo 0)
  age_days=$(( ( $(date +%s) - mtime ) / 86400 ))
  if [ "$age_days" -gt 7 ]; then
    clasp_line="⚠ ${age_days}d old — may need re-auth"
  else
    clasp_line="✓ ${age_days}d old"
  fi
else
  clasp_line="✗ missing"
fi

# 3. Last session focus from memory
focus_line="none"
FOCUS="$HOME/.claude/projects/-home-yagnesh-claude/memory/project_active_focus.md"
if [ -f "$FOCUS" ]; then
  last=$(grep '^Last session:' "$FOCUS" 2>/dev/null | sed 's/^Last session: *//' | head -1)
  proj=$(grep '^Projects:' "$FOCUS" 2>/dev/null | sed 's/^Projects: *//' | head -1)
  [ -n "$last" ] && [ -n "$proj" ] && focus_line="${last} — ${proj}"
fi

msg="[PRE-FLIGHT] git: ${git_line} | clasp: ${clasp_line} | last session: ${focus_line}"

jq -n --arg ctx "$msg" '{"systemMessage": $ctx}'
