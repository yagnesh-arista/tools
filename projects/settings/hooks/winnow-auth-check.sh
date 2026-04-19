#!/bin/bash
# winnow-auth-check.sh
# PostToolUse hook: detect Winnow auth failures and prompt re-authentication.
# Fires after any mcp__winnow__* tool call. Outputs a hookSpecificOutput message
# that Claude will surface to the user so work can be retried after re-auth.

input=$(cat)
tool_name=$(echo "$input" | jq -r '.tool_name // ""')

# Only run for Winnow MCP tools
echo "$tool_name" | grep -q 'mcp__winnow__' || exit 0

# Extract the response — MCP tools may return a plain string or a JSON object
response=$(echo "$input" | jq -r '.tool_response // ""')

# Detect auth failure: empty/null response, or keywords in the full output
is_empty=0
is_auth_err=0

if [ -z "$response" ] || [ "$response" = "null" ]; then
    is_empty=1
fi

if echo "$response" | grep -qiE \
    '(401|403|Unauthorized|Authentication required|Please log in|Session expired|Forbidden|Not authenticated|Invalid token|Access denied|Login required|credentials)'; then
    is_auth_err=1
fi

if [ "$is_empty" -eq 1 ] || [ "$is_auth_err" -eq 1 ]; then
    label=""
    [ "$is_empty"    -eq 1 ] && label="${label}empty "
    [ "$is_auth_err" -eq 1 ] && label="${label}auth-error "
    msg="[WINNOW AUTH] Winnow returned an ${label}response for '${tool_name}'. "
    msg+="Your session has likely expired. "
    msg+="Please open https://winnow.infra.corp.arista.io in your browser to re-authenticate, "
    msg+="then tell me to 'retry' and I will resume the pending work."
    printf '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"%s"}}' \
        "$(echo "$msg" | sed 's/"/\\"/g')"
fi
