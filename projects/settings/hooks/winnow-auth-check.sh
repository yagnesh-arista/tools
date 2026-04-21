#!/bin/bash
# winnow-auth-check.sh
# PostToolUse / PostToolUseFailure hook: detect Winnow auth failures, attempt
# auto-login, and prompt user if re-auth still needed.
# Fires after any mcp__winnow__* tool call.

input=$(cat)
tool_name=$(echo "$input" | jq -r '.tool_name // ""')

# Only run for Winnow MCP tools
echo "$tool_name" | grep -q 'mcp__winnow__' || exit 0

# Extract the response — MCP tools may return a plain string or a JSON object
response=$(echo "$input" | jq -r '.tool_response // ""')

# Detect auth failure: empty/null response, or auth-failure keywords
is_empty=0
is_auth_err=0

if [ -z "$response" ] || [ "$response" = "null" ]; then
    is_empty=1
fi

if echo "$response" | grep -qiE \
    '(401|403|Unauthorized|Authentication required|Please log in|Session expired|Forbidden|Not authenticated|Invalid token|Access denied|Login required|credentials)'; then
    is_auth_err=1
fi

if [ "$is_empty" -eq 0 ] && [ "$is_auth_err" -eq 0 ]; then
    exit 0  # No auth issue — nothing to do
fi

# Attempt silent token refresh (succeeds when token can be renewed automatically)
login_out=$(timeout 15 winnow login 2>&1)
login_exit=$?

if [ "$login_exit" -eq 0 ]; then
    msg="[WINNOW AUTH] Token refreshed automatically (winnow login succeeded). "
    msg+="Please retry the Winnow query now."
else
    msg="[WINNOW AUTH] Winnow auth failed and automatic login did not succeed "
    msg+="(winnow login exited $login_exit: ${login_out}). "
    msg+="Please run '! winnow login' in the Claude Code terminal to complete "
    msg+="the device-code authentication flow, then tell me to 'retry'."
fi

jq -n --arg ctx "$msg" \
    '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":$ctx}}'
