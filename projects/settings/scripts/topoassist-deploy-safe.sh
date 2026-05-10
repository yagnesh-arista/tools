#!/usr/bin/env bash
# Self-healing TopoAssist deploy — pre-flight checks before clasp push.
# Blocks push if any critical invariant is violated; prints exactly what failed.
#
# Usage:
#   ~/.claude/scripts/topoassist-deploy-safe.sh           # full pre-flight + push
#   ~/.claude/scripts/topoassist-deploy-safe.sh --check   # pre-flight only, no push

set -e

TA="$HOME/claude/projects/topoassist"
CHECK_ONLY="${1:-}"

echo "TopoAssist Safe Deploy — $(date '+%H:%M:%S')"
echo ""

issues=""
warns=""

# ── 1. Clasp auth ──────────────────────────────────────────────────────────
printf "  [1] Clasp auth status... "
AUTH_OUT=$(clasp login --status 2>&1 || true)
if echo "$AUTH_OUT" | grep -qiE 'not logged|error|expired|invalid'; then
  echo "FAIL"
  issues="$issues\n  ✗ Clasp auth: $AUTH_OUT"
  echo "  → Run: clasp login"
else
  echo "OK"
fi

# ── 2. VERSION sync: device_bridge.py ↔ embedded template ─────────────────
printf "  [2] VERSION sync (device_bridge ↔ template)... "
DB_VER=$(grep '^VERSION' "$TA/device_bridge.py" 2>/dev/null | head -1 | grep -oP '"[^"]+"' || echo "")
TMPL_VER=$(grep 'VERSION = ' "$TA/Sidebar-js.html" 2>/dev/null | grep -v 'APP_VERSION' | head -1 | grep -oP '"[^"]+"' || echo "")
if [ -z "$DB_VER" ] || [ -z "$TMPL_VER" ]; then
  echo "WARN (could not read)"
  warns="$warns\n  ⚠ VERSION: could not grep one or both files"
elif [ "$DB_VER" != "$TMPL_VER" ]; then
  echo "FAIL"
  issues="$issues\n  ✗ VERSION mismatch: device_bridge.py=$DB_VER, embedded template=$TMPL_VER"
  echo "  → Bump VERSION in the lagging file to match"
else
  echo "OK ($DB_VER)"
fi

# ── 3. APP_VERSION sync: Code.gs ↔ Sidebar-js.html ───────────────────────
printf "  [3] APP_VERSION sync (Code.gs ↔ Sidebar-js.html)... "
GS_APPVER=$(grep 'const APP_VERSION' "$TA/Code.gs" 2>/dev/null | head -1 | grep -oP '"[^"]+"' || echo "")
JS_APPVER=$(grep 'const APP_VERSION' "$TA/Sidebar-js.html" 2>/dev/null | head -1 | grep -oP '"[^"]+"' || echo "")
if [ -z "$GS_APPVER" ] || [ -z "$JS_APPVER" ]; then
  echo "WARN (could not read)"
  warns="$warns\n  ⚠ APP_VERSION: could not grep one or both files"
elif [ "$GS_APPVER" != "$JS_APPVER" ]; then
  echo "FAIL"
  issues="$issues\n  ✗ APP_VERSION mismatch: Code.gs=$GS_APPVER, Sidebar-js.html=$JS_APPVER"
  echo "  → Bump APP_VERSION in the lagging file to match"
else
  echo "OK ($GS_APPVER)"
fi

# ── 4. No .fullConfig= writes in Sidebar-js.html ──────────────────────────
printf "  [4] configCache invariant (no .fullConfig= writes)... "
FC=$(grep -cE '\.fullConfig\s*=' "$TA/Sidebar-js.html" 2>/dev/null || echo 0)
if [ "${FC:-0}" -gt 0 ]; then
  echo "FAIL ($FC occurrences)"
  issues="$issues\n  ✗ configCache: $FC .fullConfig= write(s) in Sidebar-js.html — remove and use configCache[dev].data"
else
  echo "OK"
fi

# ── 5. INSTRUCTIONS_topoassist.txt updated today ──────────────────────────
printf "  [5] INSTRUCTIONS updated today... "
TODAY=$(date +%Y-%m-%d)
INSTR_DATE=$(grep -oP '\d{4}-\d{2}-\d{2}' "$TA/INSTRUCTIONS_topoassist.txt" 2>/dev/null | head -1 || echo "")
if [ -z "$INSTR_DATE" ]; then
  echo "WARN (no date found)"
  warns="$warns\n  ⚠ INSTRUCTIONS: no date stamp found"
elif [ "$INSTR_DATE" != "$TODAY" ]; then
  echo "WARN (last: $INSTR_DATE)"
  warns="$warns\n  ⚠ INSTRUCTIONS: last updated $INSTR_DATE, not today — update if code changed today"
else
  echo "OK"
fi

# ── 6. No Unicode icon characters in HTML/GS files ───────────────────────
printf "  [6] SVG-only icons (no Unicode icons in HTML/GS)... "
UNICODE=$(grep -rP '[\x{25B6}\x{2715}\x{2699}\x{25BC}\x{25B2}\x{2212}\x{2714}\x{26A0}\x{2139}]' \
  "$TA/Sidebar.html" "$TA/Sidebar-js.html" "$TA/Sidebar-css.html" "$TA/Code.gs" 2>/dev/null \
  | grep -v '^\s*//' | wc -l || echo 0)
if [ "${UNICODE:-0}" -gt 0 ]; then
  echo "WARN ($UNICODE lines)"
  warns="$warns\n  ⚠ Unicode icons: $UNICODE lines — run /topoassist-review-code-full Check 2 for details"
else
  echo "OK"
fi

echo ""

# ── Summary ────────────────────────────────────────────────────────────────
if [ -n "$issues" ]; then
  echo "PRE-FLIGHT FAILED — push blocked:"
  echo -e "$issues"
  echo ""
  [ -n "$warns" ] && echo -e "Warnings:$warns\n"
  echo "Fix the above and re-run."
  exit 1
fi

[ -n "$warns" ] && echo -e "Warnings (non-blocking):$warns\n"

if [ "$CHECK_ONLY" = "--check" ]; then
  echo "Pre-flight CLEAN. (--check mode — skipping push)"
  exit 0
fi

# ── Push ───────────────────────────────────────────────────────────────────
echo "Pre-flight CLEAN. Pushing..."
echo ""
cd "$TA"
clasp push 2>&1
echo ""
echo "Deploy complete — $(date '+%H:%M:%S')"
echo "Reload the GAS sidebar to pick up changes."
