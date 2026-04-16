#!/bin/sh
# tmux_click.sh — DoubleClick/TripleClick word/line selection in copy mode
# Usage:
#   tmux_click.sh word <mouse_y> <mouse_x>   (DoubleClick → select word)
#   tmux_click.sh line <mouse_y>             (TripleClick → select line)
#
# Called by tmux bindings with #{mouse_y} and #{mouse_x} pre-expanded.
# All send-keys -X commands are batched into a single tmux invocation
# to avoid inter-process ordering issues between separate tmux calls.

MODE="$1"
MY="$2"
MX="${3:-0}"

tmux copy-mode
sleep 0.02   # let copy-mode settle before sending nav commands

if [ "$MODE" = "word" ]; then
    if [ "$MY" -gt 0 ] && [ "$MX" -gt 0 ]; then
        tmux send-keys -X top-line \; send-keys -X -N "$MY" cursor-down \; send-keys -X -N "$MX" cursor-right \; send-keys -X select-word
    elif [ "$MY" -gt 0 ]; then
        tmux send-keys -X top-line \; send-keys -X -N "$MY" cursor-down \; send-keys -X select-word
    elif [ "$MX" -gt 0 ]; then
        tmux send-keys -X top-line \; send-keys -X -N "$MX" cursor-right \; send-keys -X select-word
    else
        tmux send-keys -X top-line \; send-keys -X select-word
    fi
else
    # line mode (TripleClick): column doesn't matter for line selection
    if [ "$MY" -gt 0 ]; then
        tmux send-keys -X top-line \; send-keys -X -N "$MY" cursor-down \; send-keys -X select-line
    else
        tmux send-keys -X top-line \; send-keys -X select-line
    fi
fi

sleep 0.05
tmux send-keys -X copy-pipe-and-cancel
