#!/bin/sh
# tmux.conf v260430.5 | 2026-04-30 19:01:05
# Broadcast a command to tmux panes.
# The command is read from the TMUX_BROADCAST_CMD global environment variable,
# which must be set before calling this script via:
#   tmux set-environment -g TMUX_BROADCAST_CMD "the command"
#
# Usage: tmux_broadcast.sh [-A] [-a]
#   -A: all sessions (default: current session only)
#   -a: all panes   (default: active panes only)

SCOPE="-s"
ACTIVE_ONLY=1

while getopts "Aa" opt; do
    case "$opt" in
        A) SCOPE="-a" ;;
        a) ACTIVE_ONLY=0 ;;
    esac
done

CMD=$(tmux show-environment -g TMUX_BROADCAST_CMD | cut -d= -f2-)
PANES=$(tmux list-panes $SCOPE)

if [ "$ACTIVE_ONLY" = "1" ]; then
    PANES=$(echo "$PANES" | grep '(active)')
fi

echo "$PANES" | grep -oE '%[0-9]+' | while IFS= read -r p; do
    tmux send-keys -t "$p" C-c
    sleep 0.1
    tmux send-keys -t "$p" "$CMD" Enter
done
