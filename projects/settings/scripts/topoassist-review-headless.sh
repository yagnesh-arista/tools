#!/usr/bin/env bash
# Headless TopoAssist compliance review — runs claude -p outside an interactive session.
# Saves budget by running reviews non-interactively; results go to a timestamped log.
#
# Usage:
#   ~/.claude/scripts/topoassist-review-headless.sh            # full review
#   ~/.claude/scripts/topoassist-review-headless.sh --quick    # constraints only
#
# Output: ~/.claude/scripts/review-logs/topoassist-YYYYMMDD-HHMM.md

set -e

LOGDIR="$HOME/.claude/scripts/review-logs"
mkdir -p "$LOGDIR"
LOGFILE="$LOGDIR/topoassist-$(date +%Y%m%d-%H%M).md"

MODE="${1:-}"

if [ "$MODE" = "--quick" ]; then
  PROMPT="You are running a quick TopoAssist constraint check (non-interactive). Run the commands from /topoassist-check-constraints and report pass/fail for each check. Be concise — one line per check. Output in markdown."
  echo "Running quick constraint check..."
else
  PROMPT="You are running a full TopoAssist code review (non-interactive). Run all checks from /topoassist-review-code-design. Output the full review in the standard format (check number, status ✓/✗/⚠, one-line finding). Be thorough but concise — no preamble, no filler. Output in markdown."
  echo "Running full TopoAssist review (this takes ~2 min)..."
fi

echo "# TopoAssist Review — $(date)" > "$LOGFILE"
echo "# Mode: ${MODE:-full}" >> "$LOGFILE"
echo "" >> "$LOGFILE"

claude -p "$PROMPT" \
  --allowedTools "Bash,Read,Glob,Grep" \
  --cwd "$HOME/claude/projects/topoassist" \
  >> "$LOGFILE" 2>&1

echo ""
echo "Review complete: $LOGFILE"
echo ""
# Print a summary (lines with ✗ or FAIL)
FAILS=$(grep -c "✗\|FAIL\|BLOCKED" "$LOGFILE" 2>/dev/null || echo 0)
WARNS=$(grep -c "⚠\|WARN" "$LOGFILE" 2>/dev/null || echo 0)
echo "  Failures: $FAILS  |  Warnings: $WARNS"
echo ""
echo "View full report: cat '$LOGFILE'"
