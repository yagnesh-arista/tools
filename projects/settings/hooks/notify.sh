#!/bin/bash
# settings v260510.1 | 2026-05-10 14:00:42
# notify.sh
# Notification hook: route Claude Code notifications to the system.
# tmux display-message removed — it pollutes the tmux message line (same area
# used by "Config Reloaded", resurrect save/restore, etc.) causing noise.
# AI spend widget in status-right already shows live Claude session state.

input=$(cat)
message=$(echo "$input" | jq -r '.message // "Claude Code notification"')
title=$(echo "$input" | jq -r '.title // "Claude Code"')

if command -v notify-send > /dev/null 2>&1; then
    notify-send "$title" "$message" --urgency=normal 2>/dev/null &
    exit 0
fi
