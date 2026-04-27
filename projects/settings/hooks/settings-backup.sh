#!/bin/bash
# settings v260427.5 | 2026-04-27 11:11:09
# settings-backup.sh
# PostToolUse:Write|Edit — fires when Claude edits a settings file.
# Syncs the file to ~/claude/projects/settings/, auto-commits, and pushes.

input=$(cat)
f=$(echo "$input" | jq -r '.tool_input.file_path // ""')

REPO="$HOME/claude"
SETTINGS_BACKUP="$REPO/projects/settings"
changed=0
backup_path=""

case "$f" in
  "$HOME/.claude/hooks/"*.sh)
    mkdir -p "$SETTINGS_BACKUP/hooks"
    cp "$f" "$SETTINGS_BACKUP/hooks/" && chmod +x "$SETTINGS_BACKUP/hooks/$(basename "$f")"
    backup_path="$SETTINGS_BACKUP/hooks/$(basename "$f")"
    changed=1 ;;
  "$HOME/.claude/rules/"*.md)
    mkdir -p "$SETTINGS_BACKUP/rules"
    cp "$f" "$SETTINGS_BACKUP/rules/"
    backup_path="$SETTINGS_BACKUP/rules/$(basename "$f")"
    changed=1
    RULES_CHANGED=1 ;;
  "$HOME/.claude/commands/"*.md)
    mkdir -p "$SETTINGS_BACKUP/claude-skills"
    cp "$f" "$SETTINGS_BACKUP/claude-skills/"
    backup_path="$SETTINGS_BACKUP/claude-skills/$(basename "$f")"
    changed=1 ;;
  "$HOME/.claude/settings.json")
    sed "s|$HOME|\$HOME|g" "$f" > "$SETTINGS_BACKUP/settings.json.template"
    backup_path="$SETTINGS_BACKUP/settings.json.template"
    changed=1 ;;
  "$HOME/claude/CLAUDE.md")
    mkdir -p "$SETTINGS_BACKUP/global-rules"
    cp "$f" "$SETTINGS_BACKUP/global-rules/CLAUDE.md"
    backup_path="$SETTINGS_BACKUP/global-rules/CLAUDE.md"
    changed=1 ;;
esac

[ "$changed" -eq 0 ] && exit 0

# Auto-commit and push (flock: prevent index.lock conflict with parallel sessions)
fname=$(basename "$f")
exec 9>/tmp/claude-git.lock
flock -x 9
git -C "$REPO" add -A -- "$SETTINGS_BACKUP" 2>/dev/null
if ! git -C "$REPO" diff --cached --quiet 2>/dev/null; then
  git -C "$REPO" commit -m "settings: auto-sync ${fname}" >/dev/null 2>&1
  git -C "$REPO" push >/dev/null 2>&1
  COMMIT_HASH=$(git -C "$REPO" log -1 --format="%h" 2>/dev/null)
  REMOTE_URL=$(git -C "$REPO" remote get-url origin 2>/dev/null)
  REPO_NAME=$(echo "$REMOTE_URL" | sed 's|https://github\.com/||;s|git@github\.com:||;s|\.git$||')

  if [ "${RULES_CHANGED:-0}" -eq 1 ]; then
    msg="[SETTINGS BACKUP] ${fname} auto-synced. RULES CHANGED — update: (1) ~/claude/Reference_Card.md, (2) bump 'rules-synced' date in ~/.claude/commands/topoassist-review-code-design.md and add/update checks for any new rules. Then commit and push ~/claude."
  else
    msg="[SETTINGS BACKUP] ${fname} auto-synced. If rules or workflow changed, update ~/claude/Reference_Card.md. Then commit and push ~/claude."
  fi
  jq -n --arg ctx "$msg" \
    '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":$ctx}}'
else
  # Synced but no git diff (file unchanged from git's perspective)
  jq -n --arg ctx "[SETTINGS BACKUP] ${fname} synced (no git change)." \
    '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":$ctx}}'
fi
