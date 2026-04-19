#!/bin/bash
# prompt-secrets-scan.sh
# UserPromptSubmit hook: scan user prompts for accidentally pasted secrets.
# Outputs hookSpecificOutput so Claude immediately warns the user in-chat.

input=$(cat)
prompt=$(echo "$input" | jq -r '.prompt // .message // ""')

[ -z "$prompt" ] && exit 0

issues=""

# High-confidence API key / token patterns
if echo "$prompt" | grep -qE \
    '(AKIA[0-9A-Z]{16}|ghp_[a-zA-Z0-9]{36,}|gho_[a-zA-Z0-9]{36,}|glpat-[a-zA-Z0-9_-]{20,}|xoxb-[0-9]+-[a-zA-Z0-9-]+|sk-[a-zA-Z0-9]{20,}T3BlbkFJ[a-zA-Z0-9]{20,}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY)' \
    2>/dev/null; then
    issues="$issues [API_KEY_OR_PRIVATE_KEY]"
fi

# Generic credential assignments (key=value where value looks like a secret)
if echo "$prompt" | grep -qiE \
    '(password|passwd|secret|api_key|apikey|auth_token|access_token|private_key|client_secret)\s*[:=]\s*["\x27]?\S{8,}' \
    2>/dev/null; then
    issues="$issues [POSSIBLE_CREDENTIALS]"
fi

if [ -n "$issues" ]; then
    msg="[PROMPT SECRETS SCAN]$issues — the user's message may contain sensitive credentials. "
    msg+="Stop immediately and alert the user: tell them to check their message for accidentally pasted secrets "
    msg+="before any of this information is used or referenced further."
    jq -n --arg ctx "$msg" \
        '{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":$ctx}}'
fi
