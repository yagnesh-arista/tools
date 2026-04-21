#!/usr/bin/env bash
# settings v260420.21 | 2026-04-20 03:34:18 | git commit: 62af944
# Auto-syncs project .claude/commands/<name>.md → ~/.claude/commands/<proj>-<name>.md
# on every Write/Edit to a project command file.
# Also copies to settings backup.

input=$(cat)
f=$(echo "$input" | jq -r '.tool_input.file_path // ""')

# Match: /claude/projects/<proj>/.claude/commands/<name>.md
if echo "$f" | grep -qP '/claude/projects/[^/]+/\.claude/commands/[^/]+\.md$'; then
  proj=$(echo "$f" | grep -oP '/claude/projects/\K[^/]+')
  name=$(basename "$f")
  dest="$HOME/.claude/commands/${proj}-${name}"
  bkp="$HOME/claude/projects/settings/commands/${proj}-${name}"

  # flock: prevent interleaved writes if two sessions sync commands simultaneously
  exec 9>/tmp/claude-commands.lock
  flock -x 9
  cp "$f" "$dest"
  mkdir -p "$(dirname "$bkp")"
  cp "$f" "$bkp"
  exec 9>&-

  jq -n --arg ctx "[CMD SYNC] ${name} → global as ${proj}-${name}" \
    '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":$ctx}}'
fi 2>/dev/null || true
