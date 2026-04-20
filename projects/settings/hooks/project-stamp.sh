#!/bin/bash
# settings v260420.21 | 2026-04-20 03:34:18 | git commit: 62af944
# project-stamp.sh
# Global stamp hook for all ~/claude/projects/ files.
# Stamps with: # <project> vYYMMDD.N | YYYY-MM-DD HH:MM:SS | git commit: <hash>
#
# Version format: YYMMDD.N
#   - YYMMDD = today's date
#   - N      = committed changes to this project today + 1
#
# Stamp placement:
#   - Line 1 if file does NOT start with a shebang (#!)
#   - Line 2 if file starts with a shebang (shebang must stay on line 1)
#
# Only updates if the stamp marker is already present on the target line.
# TopoAssist GAS files are handled by topoassist-stamp.sh — skipped here.

input=$(cat)
f=$(echo "$input" | jq -r '.tool_input.file_path // ""')

PROJECTS_DIR="$HOME/claude/projects"
CLAUDE_CFG="$HOME/.claude"

[ -f "$f" ] || exit 0

# Determine project name and insert-mode based on path
insert_if_missing=0
case "$f" in
  $CLAUDE_CFG/hooks/*|$CLAUDE_CFG/rules/*|$CLAUDE_CFG/commands/*)
    project="settings"
    insert_if_missing=1
    ;;
  $PROJECTS_DIR/*)
    proj_rel="${f#$PROJECTS_DIR/}"
    project=$(echo "$proj_rel" | cut -d'/' -f1)
    ;;
  *) exit 0 ;;
esac

# Skip INSTRUCTIONS, CLAUDE.md, metadata, and non-source files
fname=$(basename "$f")
case "$fname" in
  *.md|*.json|*.lock|*.log|*.gitignore|*.template) exit 0 ;;
  INSTRUCTIONS_*|CLAUDE.md|MEMORY.md|ROLLBACKS.md|*.txt) exit 0 ;;
esac

# Skip TopoAssist GAS files (handled by topoassist-stamp.sh)
case "$f" in
  */topoassist/Code.gs|\
  */topoassist/Tests.gs|\
  */topoassist/Sidebar.html|\
  */topoassist/Sidebar-js.html|\
  */topoassist/Sidebar-css.html|\
  */topoassist/SheetAssistPanel.html|\
  */topoassist/UserGuide.html) exit 0 ;;
esac

# Determine comment prefix by extension / filename
case "$f" in
  *.html) PREFIX="<!--"; SUFFIX=" -->"; MARKER_PAT="<!-- ${project} v" ;;
  *.gs|*.js|*.ts) PREFIX="//"; SUFFIX=""; MARKER_PAT="// ${project} v" ;;
  *.py|*.sh|*.bash|*.zsh|*.conf|*.bashrc|*.zshrc|*.tmux) PREFIX="#"; SUFFIX=""; MARKER_PAT="# ${project} v" ;;
  .bashrc|.zshrc) PREFIX="#"; SUFFIX=""; MARKER_PAT="# ${project} v" ;;
  *) exit 0 ;;
esac

# ── Calculate version: YYMMDD.N ─────────────────────────────────────────────
YYMMDD=$(date "+%y%m%d")
COUNT=$(git -C "$HOME/claude" log --since=midnight --oneline -- "projects/${project}/" 2>/dev/null | wc -l | tr -d ' ')
N=$((COUNT + 1))
VERSION="${YYMMDD}.${N}"
DATETIME=$(date "+%Y-%m-%d %H:%M:%S")

NEW_LINE="${PREFIX} ${project} v${VERSION} | ${DATETIME}${SUFFIX}"

# ── Determine stamp line (1 or 2) and update/insert ─────────────────────────
python3 - "$f" "$NEW_LINE" "$MARKER_PAT" "$insert_if_missing" <<'PYEOF'
import sys
path, new_line, marker, insert_mode = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
insert_if_missing = insert_mode == '1'
try:
    with open(path, 'r') as fh:
        lines = fh.readlines()
    if not lines:
        sys.exit(0)

    # Determine target line index: 0 normally, 1 if shebang on line 0
    idx = 1 if lines[0].startswith('#!') else 0

    target = lines[idx] if idx < len(lines) else ''
    if target.strip().startswith(marker.strip()):
        # Update existing stamp
        lines[idx] = new_line + '\n'
    elif insert_if_missing:
        # Insert stamp at target index (after shebang if present)
        lines.insert(idx, new_line + '\n')
    else:
        sys.exit(0)

    with open(path, 'w') as fh:
        fh.writelines(lines)
except Exception:
    sys.exit(0)
PYEOF
