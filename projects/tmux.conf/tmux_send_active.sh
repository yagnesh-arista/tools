#!/bin/bash

# --- Debugging Setup ---
# This script will write its progress to a log file in the user's home directory.
LOG_FILE="$HOME/.tmux-script.log"
# Clear the log file for a fresh start on each run.
> "$LOG_FILE"
echo "--- Script started at $(date) ---" >> "$LOG_FILE"

# --- Configuration ---
# Default to targeting the current session (-s).
# If --all is passed, switch to targeting all sessions (-a).
TARGET_FLAG="-s"
if [[ "$1" == "--all" ]]; then
    TARGET_FLAG="-a"
    echo "Mode: All sessions (--all)" >> "$LOG_FILE"
    shift # Remove the --all flag to process the remaining arguments
else
    echo "Mode: Current session only (-s)" >> "$LOG_FILE"
fi

COMMAND_STRING="$1"
echo "Received command string: '$COMMAND_STRING'" >> "$LOG_FILE"

# --- Validation ---
if [ -z "$COMMAND_STRING" ]; then
    echo "Validation failed: No command provided." >> "$LOG_FILE"
    tmux display-message "Error: No command provided. See log."
    exit 1
fi

# --- Logic ---
TMUX_CMD=$(command -v tmux)
if [ -z "$TMUX_CMD" ]; then
    echo "Logic failed: Could not find tmux command." >> "$LOG_FILE"
    tmux display-message "Error: tmux command not found. See log."
    exit 1
fi
echo "Found tmux at: $TMUX_CMD" >> "$LOG_FILE"

# Find all active panes using the correct target flag (-s or -a).
ACTIVE_PANES=$($TMUX_CMD list-panes $TARGET_FLAG -F '#{pane_active} #{session_name}:#{window_index}.#{pane_index}' | grep '^1' | cut -d' ' -f2-)
echo "Found active panes:" >> "$LOG_FILE"
echo "$ACTIVE_PANES" >> "$LOG_FILE"

if [ -z "$ACTIVE_PANES" ]; then
    echo "Logic failed: No active panes found." >> "$LOG_FILE"
    tmux display-message "No active panes found. See log."
    exit 1
fi

# Split the input string into an array of commands.
IFS='#' read -r -a commands <<< "$COMMAND_STRING"

# --- Execution ---
echo "Executing commands..." >> "$LOG_FILE"
for cmd in "${commands[@]}"; do
    trimmed_cmd=$(echo "$cmd" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    echo "Processing trimmed command: '$trimmed_cmd'" >> "$LOG_FILE"

    if [ -n "$trimmed_cmd" ]; then
        for pane in $ACTIVE_PANES; do
            echo "Sending to pane: $pane" >> "$LOG_FILE"
            $TMUX_CMD send-keys -t "$pane" "$trimmed_cmd" C-m
        done
    else
         echo "Skipping empty command." >> "$LOG_FILE"
    fi
done

echo "--- Script finished ---" >> "$LOG_FILE"
tmux display-message "Commands sent. See ~/.tmux-script.log for details."

