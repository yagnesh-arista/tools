#!/bin/bash
# settings v260421.28 | 2026-04-21 12:35:23
# stamp.sh — unified version stamp hook (replaces topoassist-stamp.sh + project-stamp.sh)
# PostToolUse Write|Edit
#
# 1. Resolves project from file path (once)
# 2. Calculates YYMMDD.N version from today's project commit count (once)
# 3. Determines comment style from file extension
# 4. Stamps line 1 (or line 2 for shebang files) of the edited file
# 5. TopoAssist GAS only: syncs APP_VERSION + re-stamps all 7 GAS files on version bump
#
# Skips: .md .json .lock .log .gitignore .template INSTRUCTIONS_* CLAUDE.md MEMORY.md *.txt

input=$(cat)
f=$(echo "$input" | jq -r '.tool_input.file_path // ""')
[ -f "$f" ] || exit 0

PROJECTS_DIR="$HOME/claude/projects"
CLAUDE_CFG="$HOME/.claude"

# ── Skip metadata / non-source files ──────────────────────────────────────────
fname=$(basename "$f")
case "$fname" in
  *.md|*.json|*.lock|*.log|*.gitignore|*.template) exit 0 ;;
  INSTRUCTIONS_*|CLAUDE.md|MEMORY.md|ROLLBACKS.md|*.txt) exit 0 ;;
esac

# ── Resolve project from path ──────────────────────────────────────────────────
case "$f" in
  $CLAUDE_CFG/hooks/*|$CLAUDE_CFG/rules/*|$CLAUDE_CFG/commands/*)
    project="settings" ;;
  $PROJECTS_DIR/*)
    proj_rel="${f#$PROJECTS_DIR/}"
    project=$(echo "$proj_rel" | cut -d'/' -f1) ;;
  *) exit 0 ;;
esac

# ── Exclusive lock: prevent version collision from parallel sessions ───────────
exec 9>/tmp/stamp-"${project}".lock
flock -x 9

# ── Calculate version: YYMMDD.N ───────────────────────────────────────────────
YYMMDD=$(date "+%y%m%d")
COUNT=$(git -C "$HOME/claude" log --since=midnight --oneline -- "projects/${project}/" 2>/dev/null | wc -l | tr -d ' ')
N=$((COUNT + 1))
VERSION="${YYMMDD}.${N}"
DATETIME=$(date "+%Y-%m-%d %H:%M:%S")

# ── Generic stamp function: update or insert line 1/2 ─────────────────────────
stamp_file() {
  local path="$1" new_line="$2" marker="$3"
  python3 - "$path" "$new_line" "$marker" <<'PYEOF'
import sys
path, new_line, marker = sys.argv[1], sys.argv[2], sys.argv[3]
try:
    with open(path, 'r') as fh:
        lines = fh.readlines()
    if not lines:
        sys.exit(0)
    idx = 1 if lines[0].startswith('#!') else 0
    target = lines[idx] if idx < len(lines) else ''
    if target.strip().startswith(marker.strip()):
        lines[idx] = new_line + '\n'
    else:
        lines.insert(idx, new_line + '\n')
    with open(path, 'w') as fh:
        fh.writelines(lines)
except Exception:
    sys.exit(0)
PYEOF
}

# ── Determine stamp line and marker from file extension ───────────────────────
# TopoAssist GAS files use display name "TopoAssist"; all others use project folder name
case "$f" in
  */topoassist/*.gs)
    NEW_LINE="// TopoAssist v${VERSION} | ${DATETIME}";    MARKER="// TopoAssist v" ;;
  */topoassist/*.html)
    NEW_LINE="<!-- TopoAssist v${VERSION} | ${DATETIME} -->"; MARKER="<!-- TopoAssist v" ;;
  *.html)
    NEW_LINE="<!-- ${project} v${VERSION} | ${DATETIME} -->"; MARKER="<!-- ${project} v" ;;
  *.gs|*.js|*.ts)
    NEW_LINE="// ${project} v${VERSION} | ${DATETIME}";    MARKER="// ${project} v" ;;
  *.py|*.sh|*.bash|*.zsh|*.conf|*.bashrc|*.zshrc|*.tmux|.bashrc|.zshrc)
    NEW_LINE="# ${project} v${VERSION} | ${DATETIME}";     MARKER="# ${project} v" ;;
  *) exit 0 ;;
esac

# Stamp the edited file
stamp_file "$f" "$NEW_LINE" "$MARKER"

# ── TopoAssist GAS only: APP_VERSION sync + all-file re-stamp on version bump ─
case "$f" in
  */topoassist/Code.gs|*/topoassist/Tests.gs|\
  */topoassist/Sidebar.html|*/topoassist/Sidebar-js.html|\
  */topoassist/Sidebar-css.html|*/topoassist/SheetAssistPanel.html|\
  */topoassist/UserGuide.html)

    TOPODIR="$HOME/claude/projects/topoassist"
    CURRENT_VER=$(grep 'const APP_VERSION' "$TOPODIR/Code.gs" 2>/dev/null \
      | sed "s/.*APP_VERSION = \"//;s/\".*//" | head -1)

    [ "$CURRENT_VER" = "$VERSION" ] && exit 0

    # Sync APP_VERSION constant in Code.gs + Sidebar-js.html
    python3 - "$TOPODIR" "$VERSION" <<'PYEOF'
import sys, re
topodir, ver = sys.argv[1], sys.argv[2]
for fname in ['Code.gs', 'Sidebar-js.html']:
    path = f'{topodir}/{fname}'
    try:
        with open(path) as fh: content = fh.read()
        new = re.sub(r'const APP_VERSION = "[^"]*"', f'const APP_VERSION = "{ver}"', content)
        if new != content:
            with open(path, 'w') as fh: fh.write(new)
    except: pass
PYEOF

    # Re-stamp all GAS files so every file ships the same version
    STAMPED_EXTRA=""
    for gas in Code.gs Tests.gs Sidebar.html Sidebar-js.html Sidebar-css.html SheetAssistPanel.html UserGuide.html; do
      gas_path="$TOPODIR/$gas"
      [ "$gas_path" = "$f" ] && continue
      [ -f "$gas_path" ] || continue
      if [[ "$gas_path" == *.gs ]]; then
        stamp_file "$gas_path" "// TopoAssist v${VERSION} | ${DATETIME}" "// TopoAssist v"
      else
        stamp_file "$gas_path" "<!-- TopoAssist v${VERSION} | ${DATETIME} -->" "<!-- TopoAssist v"
      fi
      STAMPED_EXTRA="${STAMPED_EXTRA}${gas} "
    done

    # Stage all stamped GAS files under claude-git.lock (prevents index.lock conflicts)
    exec 8>/tmp/claude-git.lock
    flock -x 8
    for gas in Code.gs Tests.gs Sidebar.html Sidebar-js.html Sidebar-css.html SheetAssistPanel.html UserGuide.html; do
      gas_path="$TOPODIR/$gas"
      [ -f "$gas_path" ] && git -C "$HOME/claude" add "$gas_path" &>/dev/null
    done
    exec 8>&-   # release git lock

    jq -n --arg ctx "[STAMP] APP_VERSION bumped ${CURRENT_VER} → ${VERSION}. All GAS files re-stamped and staged: ${STAMPED_EXTRA}— commit when ready." \
      '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":$ctx}}'
    ;;
esac
