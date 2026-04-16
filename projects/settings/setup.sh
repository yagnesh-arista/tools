#!/usr/bin/env bash
# Restore full Claude Code setup on a new machine.
# Run once after cloning: bash ~/claude/projects/settings/setup.sh

set -e

SCRIPT_DIR="$(dirname "$0")"

# ── settings.json ────────────────────────────────────────────────────────────
TEMPLATE="$SCRIPT_DIR/settings.json.template"
DEST="$HOME/.claude/settings.json"

if [ ! -f "$TEMPLATE" ]; then
  echo "ERROR: template not found at $TEMPLATE"
  exit 1
fi

if [ -f "$DEST" ]; then
  echo "Backing up existing $DEST → $DEST.bak"
  cp "$DEST" "$DEST.bak"
fi

sed "s|\$HOME|$HOME|g" "$TEMPLATE" > "$DEST"
echo "✓ ~/.claude/settings.json written"

# ── api-key-helper.sh ─────────────────────────────────────────────────────────
HELPER="$SCRIPT_DIR/api-key-helper.sh"
if [ -f "$HELPER" ]; then
  cp "$HELPER" "$HOME/.claude/api-key-helper.sh"
  chmod +x "$HOME/.claude/api-key-helper.sh"
  echo "✓ ~/.claude/api-key-helper.sh installed"
fi

# ── hooks/ ────────────────────────────────────────────────────────────────────
if [ -d "$SCRIPT_DIR/hooks" ]; then
  mkdir -p "$HOME/.claude/hooks"
  cp "$SCRIPT_DIR/hooks/"*.sh "$HOME/.claude/hooks/"
  chmod +x "$HOME/.claude/hooks/"*.sh
  echo "✓ ~/.claude/hooks/ installed ($(ls "$SCRIPT_DIR/hooks/"*.sh | wc -l) files)"
fi

# ── rules/ ────────────────────────────────────────────────────────────────────
if [ -d "$SCRIPT_DIR/rules" ]; then
  mkdir -p "$HOME/.claude/rules"
  cp "$SCRIPT_DIR/rules/"*.md "$HOME/.claude/rules/"
  echo "✓ ~/.claude/rules/ installed ($(ls "$SCRIPT_DIR/rules/"*.md | wc -l) files)"
fi

# ── commands/ ─────────────────────────────────────────────────────────────────
if [ -d "$SCRIPT_DIR/commands" ]; then
  mkdir -p "$HOME/.claude/commands"
  cp "$SCRIPT_DIR/commands/"*.md "$HOME/.claude/commands/"
  echo "✓ ~/.claude/commands/ installed ($(ls "$SCRIPT_DIR/commands/"*.md | wc -l) files)"
fi

# ── global CLAUDE.md ──────────────────────────────────────────────────────────
if [ -f "$SCRIPT_DIR/global-rules/CLAUDE.md" ]; then
  mkdir -p "$HOME/claude"
  cp "$SCRIPT_DIR/global-rules/CLAUDE.md" "$HOME/claude/CLAUDE.md"
  echo "✓ ~/claude/CLAUDE.md installed"
fi

echo ""
echo "Next steps:"
echo "  1. Ensure ~/.ai-proxy-api-key exists (from Arista onboarding)"
echo "  2. Set git identity if not done:"
echo "     git config --global user.name 'Yagnesh Chauhan'"
echo "     git config --global user.email '<your email>'"
echo "  3. Clone projects: git clone https://github.com/yagnesh-arista/claude ~/claude/projects-restore"
echo "  4. Verify hooks loaded in Claude Code"
