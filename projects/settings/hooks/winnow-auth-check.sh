#!/bin/bash
# winnow-auth-check.sh
# PostToolUse / PostToolUseFailure hook: detect Winnow auth failures, attempt
# auto-login, and prompt user if re-auth still needed.
# Fires after any mcp__winnow__* tool call.

input=$(cat)

# Only run for Winnow MCP tools (bash glob, no subprocess)
tool_name=$(jq -r '.tool_name // ""' <<< "$input")
[[ "$tool_name" == mcp__winnow__* ]] || exit 0

# MCP tools may return a plain string or a JSON object
response=$(jq -r '.tool_response // ""' <<< "$input")

# Detect auth failure: empty/null response, or auth-failure keywords
is_auth_failure=false
if [ -z "$response" ] || [ "$response" = "null" ]; then
    is_auth_failure=true
elif echo "$response" | grep -qiE \
    '(401|403|Unauthorized|Authentication required|Please log in|Session expired|Forbidden|Not authenticated|Invalid token|Access denied|Login required|credentials)'; then
    is_auth_failure=true
fi

[ "$is_auth_failure" = true ] || exit 0

# Attempt silent token refresh; 15s covers a normal OIDC refresh round-trip
timeout 15 winnow login >/dev/null 2>&1
login_exit=$?

if [ "$login_exit" -eq 0 ]; then
    msg="[WINNOW AUTH] Token refreshed automatically. Please retry the Winnow query now."
elif [ "$login_exit" -eq 124 ]; then
    msg="[WINNOW AUTH] winnow login timed out — device-code flow likely required. "
    msg+="Run '! winnow login' in the Claude Code terminal, then tell me to 'retry'."
else
    msg="[WINNOW AUTH] Automatic login failed (exit $login_exit). "
    msg+="Run '! winnow login' in the Claude Code terminal to complete "
    msg+="the device-code authentication flow, then tell me to 'retry'."
fi

jq -n --arg ctx "$msg" \
    '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":$ctx}}'
