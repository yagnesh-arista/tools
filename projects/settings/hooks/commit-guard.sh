#!/usr/bin/env bash
# Commit guard — runs as PreToolUse hook on git commit.
# Scans staged diff for secrets (all files) and debug code (code files only).
# Outputs JSON to block commit or pass with summary.

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

if [ -n "$issues" ]; then
  echo "{\"decision\":\"block\",\"reason\":\"COMMIT BLOCKED:$issues in staged diff. Fix and run /review before committing.\"}"
  exit 1
else
  echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"additionalContext\":\"Auto-scan passed (no secrets or debug in staged code files). Still verify: unrelated changes, test coverage, commented-out code — then proceed.\"}}"
fi
