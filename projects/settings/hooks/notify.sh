#!/bin/bash
# notify.sh
# Notification hook: route Claude Code notifications to the system.
# Tries notify-send (Linux desktop), then tmux display-message, then silent.

input=$(cat)
message=$(echo "$input" | jq -r '.message // "Claude Code notification"')
title=$(echo "$input" | jq -r '.title // "Claude Code"')

if command -v notify-send > /dev/null 2>&1; then
    notify-send "$title" "$message" --urgency=normal 2>/dev/null &
    exit 0
fi

if [ -n "$TMUX" ]; then
    tmux display-message -d 4000 "[$title] $message" 2>/dev/null
    exit 0
fi
