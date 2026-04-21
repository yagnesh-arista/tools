#!/bin/bash
# settings v260421.8 | 2026-04-21 12:09:56
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
    changed=1 ;;
  "$HOME/.claude/commands/"*.md)
    mkdir -p "$SETTINGS_BACKUP/commands"
    cp "$f" "$SETTINGS_BACKUP/commands/"
    backup_path="$SETTINGS_BACKUP/commands/$(basename "$f")"
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

  SUMMARY="[CHANGE SUMMARY] commit hash: ${COMMIT_HASH} — settings: auto-sync ${fname}
Files:
  ${fname}  (settings backup)
Git:   pushed to github.com/${REPO_NAME} ✓
Clasp: N/A (no GAS files changed)"

  LOG="$HOME/claude/.change-log"
  echo "$SUMMARY" > "$LOG"
  jq -n --arg ctx "$SUMMARY" '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":$ctx}}'
else
  # Synced but no git diff (file unchanged from git's perspective)
  jq -n --arg ctx "[SETTINGS BACKUP] ${fname} synced (no git change)." \
    '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":$ctx}}'
fi
