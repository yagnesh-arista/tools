# ~/.zshrc — macbook (yagnes76D0W4m)
# Managed via ~/claude/projects/zshrc_macbook/ on bus-home
# Deploy: scp .zshrc yagnesh@<macbook>:~/.zshrc

# ==============================================================================
# 1. BUS: Interactive Tmux Menu for Jump Host
# ==============================================================================
bus() {
    local selection="${1:-}"

    # MANDATORY: Internal Auth Check
    arista-ssh check-auth >/dev/null 2>&1 || arista-ssh login >/dev/null 2>&1

    # SSH Multiplexing Setup
    local socket="/tmp/bus-home-${USER}-mux"

    if ! ssh -O check -S "$socket" bus-home >/dev/null 2>&1; then
        rm -f "$socket"
        if ! ssh -MfN -S "$socket" -o ControlPersist=10m bus-home; then
            echo "Error: Failed to establish SSH connection."
            return 1
        fi
    fi

    export BUS_SOCKET="$socket"
    export BUS_SELECT="$selection"
    echo -ne "\033]0;BUS: ${selection:-Menu}\007"

    expect -c '
        set socket $env(BUS_SOCKET)
        set selection $env(BUS_SELECT)

        # Handle Window Resizing (SIGWINCH)
        trap {
            if {[info exists spawn_out(slave,name)]} {
                set rows [stty rows]
                set cols [stty cols]
                stty rows $rows cols $cols < $spawn_out(slave,name)
            }
        } WINCH

        log_user 0

        # --- BRANCH: "bus 0" (Direct Shell) ---
        if {$selection == "0"} {
             send_user "Selection is 0. Starting new shell...\n"
             log_user 1
             spawn ssh -S $socket -t -q bus-home
             interact { \004 { send "\004" } }
             exit
        }

        # --- Fetch Session List ---
        spawn ssh -S $socket -t -q bus-home "bash -l -c \047tmux list-sessions -F \"#{session_name}\"\047 2>/dev/null || true"
        expect eof

        if {[info exists expect_out(buffer)]} { set sessions $expect_out(buffer) } else { set sessions "" }

        set session_list {}
        set clean_sessions ""
        set i 1

        foreach line [split $sessions "\n"] {
            set line [string trim $line]
            if {[string length $line] > 0 && ![string match "Connection to*" $line] && ![string match "*exit status*" $line]} {
                lappend session_list $line
                if {$i == 1} { append clean_sessions "\nTMUX sessions\n" }
                append clean_sessions "$i) $line\n"
                incr i
            }
        }

        # --- BRANCH: "bus 1" (Specific Session) ---
        if {$selection != "" && [string is integer $selection]} {
            set index [expr $selection - 1]
            if {$index >= 0 && $index < [llength $session_list]} {
                set session_name [lindex $session_list $index]
                send_user "Auto-selecting session: $session_name (Detaching others...)\n"
                log_user 1
                spawn ssh -S $socket -t -q bus-home "bash -l -c \047tmux attach-session -d -t $session_name; exec bash -l\047"
                interact { \004 { send "\004" } }
                exit
            } else {
                send_user "Session $selection not found. Falling back to menu...\n"
            }
        }

        # --- BRANCH: Interactive Menu ---
        if {[llength $session_list] > 0} {
            send_user $clean_sessions
            send_user "\nOR Just press \[Enter\] to start a new shell\n"
            stty echo -raw erase ^H

            set timeout_sec 10
            set user_input ""
            send_user "Choice (Default in $timeout_sec s): "

            for {set t $timeout_sec} {$t > 0} {incr t -1} {
                send_user "\rChoice (Default in $t s): "
                expect_user {
                    -timeout 1
                    -re "(.*)\n" {
                        set user_input $expect_out(1,string)
                        set user_input [string trim $user_input]
                        break
                    }
                    eof { send_user "\nExiting menu.\n"; exit }
                }
            }

            if {[string length $user_input] > 0 && [string is integer $user_input]} {
                 set index [expr $user_input - 1]
                 if {$index >= 0 && $index < [llength $session_list]} {
                    set session_name [lindex $session_list $index]
                    log_user 1
                    spawn ssh -S $socket -t -q bus-home "bash -l -c \047tmux attach-session -d -t $session_name; exec bash -l\047"
                    interact { \004 { send "\004" } }
                    exit
                 }
            }
        } else {
            send_user "\nNo active tmux sessions found.\n"
        }

        # --- Final Fallback: New Shell ---
        send_user "\nStarting new shell...\n"
        log_user 1
        spawn ssh -S $socket -t -q bus-home
        interact { \004 { send "\004" } }
    '
}

# ==============================================================================
# 2. WSC: Remote Wireshark Capture (Live View Only)
# ==============================================================================
wsc() {
  if [[ -z "$1" || -z "$2" ]]; then
    echo "Usage: wsc <switch_ip> <interface>"
    return 1
  fi

  local switch=$1
  local int=$2

  # Sanitize names (e.g., Ethernet1/1 -> Ethernet1-1)
  local safe_int="${int//\//-}"
  local capture_name="${switch}_${safe_int}"

  # Define path for the named pipe (FIFO)
  local pipe_name="/tmp/${capture_name}"

  # --- Preflight: SSH Host Key Handling ---
  if ! ssh-keygen -F "$switch" >/dev/null 2>&1; then
    echo "Host '$switch' not in known_hosts. Adding automatically..."
    ssh -o StrictHostKeyChecking=accept-new "admin@${switch}" "bash true" >/dev/null || return 1
    echo "Host key added."
  else
    local ssh_error
    ssh_error=$(ssh -o PasswordAuthentication=no -o StrictHostKeyChecking=yes "admin@${switch}" "bash true" 2>&1 >/dev/null) || true
    if [[ "$ssh_error" == *"REMOTE HOST IDENTIFICATION HAS CHANGED"* ]]; then
      echo "!!! WARNING: Host key for '$switch' CHANGED! !!!"
      read -q "yn?Remove old key and trust new one? (y/n) "
      echo
      if [[ "$yn" == "y" ]]; then
        ssh-keygen -R "$switch"
        ssh -o StrictHostKeyChecking=accept-new "admin@${switch}" "bash true" >/dev/null || return 1
        echo "Host key updated."
      else
        return 1
      fi
    fi
  fi

  # --- Setup Named Pipe ---
  # Creating a FIFO allows Wireshark to display the specific Pipe Name in the UI
  rm -f "$pipe_name"
  mkfifo "$pipe_name"

  # Trap: Cleanup pipe and kill background SSH when script exits
  cleanup() {
      rm -f "$pipe_name"
      kill $(jobs -p) >/dev/null 2>&1
  }
  trap cleanup EXIT INT TERM

  echo "Starting capture from ${switch}..."
  echo "Streaming to Wireshark (Interface Name: $capture_name)"
  echo "Press Ctrl+C to stop."

  # --- Start Capture ---
  ssh -q -o StrictHostKeyChecking=accept-new "admin@${switch}" \
    "bash sudo tcpdump -s 0 -Un -w - -i '${int}'" > "$pipe_name" &

  # --- Start Wireshark ---
  /Applications/Wireshark.app/Contents/MacOS/Wireshark -k -i "$pipe_name"

  echo
  echo "Capture session ended."
}

# ==============================================================================
# 3. General Settings
# ==============================================================================
stty -ixon                                          # Disable Ctrl+S/Q flow control
setopt IGNORE_EOF                                   # Require multiple Ctrl+D to exit
export IGNOREEOF=2                                  # Number of Ctrl+D presses required
export TZ=Asia/Kolkata                              # Timezone
export ZSH_AUTOSUGGEST_HIGHLIGHT_STYLE='fg=cyan'    # Autosuggestion color (visible in Tmux)
export EDITOR=vim
export VISUAL=vim
export PATH="$HOME/go/bin:$PATH"    # Go-installed binaries (fzf, gnmi, etc.)
export CDPATH=".:~:~/claude/projects"

# ==============================================================================
# 4. FZF
# ==============================================================================
export FZF_TMUX_HEIGHT=30%
export FZF_DEFAULT_OPTS='--height 30% --layout=reverse --border'
export FZF_CTRL_R_OPTS='--height 30% --no-sort --exact'   # Force height, preserve order
export FZF_CTRL_T_OPTS='--preview "bat --color=always --style=numbers --line-range=:200 {}" --preview-window=right:50%:wrap'
export FZF_ALT_C_OPTS='--preview "tree -C {} 2>/dev/null | head -50 || ls -lhF --color=always {}" --preview-window=right:40%'
source <(fzf --zsh)   # Ctrl+R: fuzzy history, Ctrl+T: file search, Alt+C: dir jump
bindkey '^[[A' fzf-history-widget   # Up arrow → fzf history panel (standard terminals)
bindkey '^[OA' fzf-history-widget   # Up arrow → fzf history panel (application mode / tmux)

# ==============================================================================
# 5. Zsh Autosuggestions (fish-style gray text as you type)
# ==============================================================================
source ~/.zsh/zsh-autosuggestions/zsh-autosuggestions.zsh

# ==============================================================================
# 6. History
# ==============================================================================
export HISTSIZE=100000
export SAVEHIST=200000
export HISTFILE=~/.zsh_history
setopt HIST_IGNORE_DUPS       # Don't record duplicate consecutive entries
setopt HIST_IGNORE_ALL_DUPS   # Remove older duplicate entries from history
setopt HIST_FIND_NO_DUPS      # Skip duplicates when navigating with up/down arrow
setopt HIST_APPEND            # Append to history file, don't overwrite
setopt SHARE_HISTORY          # Share history across all zsh sessions (tmux panes etc.)

# ==============================================================================
# 7. Aliases
# ==============================================================================
alias ll='ls -lhF --color=auto'
alias la='ls -lAhF --color=auto'
alias ls='ls --color=auto'
alias lrtha='ls -lrtha --color=auto'
alias grep='grep --color=auto'
alias ..='cd ..'
alias ...='cd ../..'

# mkcd: create directory and cd into it
mkcd() { mkdir -p "$1" && cd "$1"; }

# ==============================================================================
# 8. Prompt (with git branch)
# ==============================================================================
autoload -Uz vcs_info
zstyle ':vcs_info:git:*' formats ' (%b)'
setopt PROMPT_SUBST
vcs_info_precmd() { vcs_info }
precmd_functions+=(vcs_info_precmd)
PROMPT='%F{green}%n@%m%f:%F{blue}%~%f${vcs_info_msg_0_}%# '

# ==============================================================================
# 9. iTerm2 Shell Integration (macbook local sessions only; skips inside tmux)
# ==============================================================================
[[ -f ~/.iterm2_shell_integration.zsh ]] && source ~/.iterm2_shell_integration.zsh
