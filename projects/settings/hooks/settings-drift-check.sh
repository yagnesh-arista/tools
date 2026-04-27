#!/bin/bash
# settings v260421.12 | 2026-04-21 12:18:24
# settings-drift-check.sh
# UserPromptSubmit — runs on every user prompt.
# Detects external edits to ~/.claude/ config files that bypassed the Edit hook,
# syncs them to ~/claude/projects/settings/, and auto-commits + pushes.

REPO="$HOME/claude"
SETTINGS_BACKUP="$REPO/projects/settings"
changed_files=""

sync_file() {
  local src="$1" dst="$2" label="$3"
  [ -f "$src" ] || return
  mkdir -p "$(dirname "$dst")"
  if ! diff -q "$src" "$dst" >/dev/null 2>&1; then
    cp "$src" "$dst"
    changed_files="${changed_files} ${label}"
  fi
}

sync_settings_json() {
  local src="$HOME/.claude/settings.json"
  local dst="$SETTINGS_BACKUP/settings.json.template"
  [ -f "$src" ] || return
  local normalized
  normalized=$(sed "s|$HOME|\$HOME|g" "$src")
  local existing=""
  [ -f "$dst" ] && existing=$(cat "$dst")
  if [ "$normalized" != "$existing" ]; then
    echo "$normalized" > "$dst"
    changed_files="${changed_files} settings.json"
  fi
}

# Sync hooks
for src in "$HOME/.claude/hooks/"*.sh; do
  [ -f "$src" ] || continue
  dst="$SETTINGS_BACKUP/hooks/$(basename "$src")"
  sync_file "$src" "$dst" "hooks/$(basename "$src")"
  [ -f "$dst" ] && chmod +x "$dst"
done

# Sync rules
for src in "$HOME/.claude/rules/"*.md; do
  [ -f "$src" ] || continue
  dst="$SETTINGS_BACKUP/rules/$(basename "$src")"
  sync_file "$src" "$dst" "rules/$(basename "$src")"
done

# Sync commands
for src in "$HOME/.claude/commands/"*.md; do
  [ -f "$src" ] || continue
  dst="$SETTINGS_BACKUP/claude-skills/$(basename "$src")"
  sync_file "$src" "$dst" "claude-skills/$(basename "$src")"
done

# Sync settings.json
sync_settings_json

# Sync global CLAUDE.md
sync_file "$HOME/claude/CLAUDE.md" \
  "$SETTINGS_BACKUP/global-rules/CLAUDE.md" "global-rules/CLAUDE.md"

[ -z "$changed_files" ] && exit 0

# Auto-commit and push drifted files (flock: prevent index.lock conflict)
exec 9>/tmp/claude-git.lock
flock -x 9
git -C "$REPO" add -A -- "$SETTINGS_BACKUP" 2>/dev/null
if ! git -C "$REPO" diff --cached --quiet 2>/dev/null; then
  git -C "$REPO" commit -m "settings: sync external edits —${changed_files}" >/dev/null 2>&1
  git -C "$REPO" push >/dev/null 2>&1
  COMMIT_HASH=$(git -C "$REPO" log -1 --format="%h" 2>/dev/null)
  REMOTE_URL=$(git -C "$REPO" remote get-url origin 2>/dev/null)
  REPO_NAME=$(echo "$REMOTE_URL" | sed 's|https://github\.com/||;s|git@github\.com:||;s|\.git$||')

  MSG="[SETTINGS DRIFT] External edits detected and auto-synced:${changed_files}
Committed ${COMMIT_HASH} and pushed to github.com/${REPO_NAME} ✓"
  jq -n --arg ctx "$MSG" '{"systemMessage":$ctx}'
fi
