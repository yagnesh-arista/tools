#!/usr/bin/env bash
# settings v260510.18 | 2026-05-10 15:26:36
# Commit guard — runs as PreToolUse hook on git commit.
# Scans staged diff for secrets and debug code (all projects).
# For topoassist commits: also checks VERSION sync and configCache invariant.

input=$(cat)
cmd=$(echo "$input" | jq -r '.tool_input.command // ""')

# Only run on git commit
echo "$cmd" | grep -qE 'git commit' || exit 0

issues=""

# Scan ALL staged files for secrets
all_diff=$(git diff --cached 2>/dev/null)
sec=$(echo "$all_diff" | grep -icE '^\+(password|secret|api_key|apikey|token|auth_token)\s*=' 2>/dev/null || echo 0)
[ "${sec:-0}" -gt 0 ] && issues="$issues [SECRETS:$sec]"

# Scan only CODE files for debug statements (skip docs, configs, and hook scripts)
code_files=$(git diff --cached --name-only 2>/dev/null | grep -vE '\.(md|txt|json|yaml|yml|toml|template)$' | grep -v '/hooks/')
if [ -n "$code_files" ]; then
  code_diff=$(git diff --cached -- $code_files 2>/dev/null)
  dbg=$(echo "$code_diff" | grep -cE '^\+.*(console\.(log|debug|warn|error)\(|debugger;|pdb\.set_trace|breakpoint\(\))' 2>/dev/null || echo 0)
  [ "${dbg:-0}" -gt 0 ] && issues="$issues [DEBUG:$dbg]"
fi

# TopoAssist-specific checks (only when topoassist files are staged)
ta_staged=$(git diff --cached --name-only 2>/dev/null | grep -c 'topoassist/')
if [ "${ta_staged:-0}" -gt 0 ]; then
  TA="$HOME/claude/projects/topoassist"

  # Check VERSION sync: device_bridge.py vs embedded template in Sidebar-js.html
  if [ -f "$TA/device_bridge.py" ] && [ -f "$TA/Sidebar-js.html" ]; then
    db_ver=$(grep '^VERSION' "$TA/device_bridge.py" | head -1 | grep -oP '"[^"]+"')
    tmpl_ver=$(grep 'VERSION = ' "$TA/Sidebar-js.html" | grep -v 'APP_VERSION' | head -1 | grep -oP '"[^"]+"')
    if [ -n "$db_ver" ] && [ -n "$tmpl_ver" ] && [ "$db_ver" != "$tmpl_ver" ]; then
      issues="$issues [TA-VERSION-MISMATCH:device_bridge=$db_ver,template=$tmpl_ver]"
    fi
  fi

  # Check configCache invariant: no .fullConfig writes
  staged_js=$(git diff --cached --name-only 2>/dev/null | grep 'Sidebar-js.html')
  if [ -n "$staged_js" ]; then
    fc=$(git diff --cached -- "$staged_js" 2>/dev/null | grep -cE '^\+.*\.fullConfig\s*=' 2>/dev/null || echo 0)
    [ "${fc:-0}" -gt 0 ] && issues="$issues [TA-FULLCONFIG-WRITE:remove .fullConfig= and use configCache]"
  fi
fi

warns=""
if [ "${ta_staged:-0}" -gt 0 ]; then
  warns=" | TopoAssist: VERSION sync ✓, configCache invariant ✓"
fi

if [ -n "$issues" ]; then
  echo "{\"decision\":\"block\",\"reason\":\"COMMIT BLOCKED:$issues in staged diff. Fix and run /review before committing.\"}"
  exit 1
else
  echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"additionalContext\":\"Auto-scan passed (secrets ✓, debug ✓$warns). Still verify: unrelated changes, test coverage, commented-out code.\"}}"
fi
