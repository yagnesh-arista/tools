# bashrc_bus-home v260505.1 | 2026-05-05 10:10:11
# Managed via ~/claude/projects/bashrc_bus-home/
# Deploy: cp .bashrc ~/.bashrc (auto via hook)

# 0. ble.sh — MUST be first (loaded in noattach mode; attaches at section 13)
# STRICTER CHECK: Only load if interactive AND a real terminal type is set.
# This prevents it from loading during automated Python SSH script execution.
if [[ $- == *i* ]] && [[ -n "$TERM" ]] && [[ "$TERM" != "dumb" ]] && [[ "$TERM" != "unknown" ]]; then
    source ~/.local/share/blesh/ble.sh --noattach 2>/dev/null
fi

# EARLY EXIT: Stop here for non-interactive shells (scp, rsync, Python SSH automation).
# Prevents nvm/fzf/atuin loading which causes timeouts in automated connections.
case $- in
    *i*) ;;
      *) return;;
esac

# 1. Load System Defaults
if [ -f /etc/bashrc ]; then
    source /etc/bashrc 2>/dev/null
fi
set -h  # Re-enable hashing (disabled by /etc/bashrc); needed by NVM and other tools

# 2. CRITICAL: Fix Tmux Resizing Issues
# Forces the shell to update window size lines/cols after every command
shopt -s checkwinsize

# 2a. Disable XON/XOFF flow control so C-s reaches tmux as prefix
stty -ixon 2>/dev/null

# 3. Enable Standard Tab Completion
if ! shopt -oq posix; then
    if [ -f /usr/share/bash-completion/bash_completion ]; then
        . /usr/share/bash-completion/bash_completion
    elif [ -f /etc/bash_completion ]; then
        . /etc/bash_completion
    fi
fi

# 4. Enable FZF
# Note: ~/.fzf.bash sets readline bind calls that ble.sh (section 13) overrides after attach.
# Keep this source for shell completion helpers (fzf ** tab expansion) — not for bindings.
[ -f ~/.fzf.bash ] && source ~/.fzf.bash
export FZF_TMUX_HEIGHT=30%
export FZF_DEFAULT_OPTS='--height 30% --layout=reverse --border'
export FZF_CTRL_R_OPTS='--height 30% --no-sort --exact'
export FZF_CTRL_T_OPTS='--preview "bat --color=always --style=numbers --line-range=:200 {}" --preview-window=right:50%:wrap'
export FZF_ALT_C_OPTS='--preview "ls -lhF --color=always {}" --preview-window=right:40%'

# 5. Custom Functions
# Quick SSH to a device as admin.
# Usage: @<device_name_or_ip>
command_not_found_handle() {
    if [[ "$1" == @* ]]; then
        ssh admin@"${1#@}"
    else
        echo "bash: $1: command not found" >&2
        return 127
    fi
}

# mkcd: create directory and cd into it
mkcd() { mkdir -p "$1" && cd "$1"; }

# 6. SAFETY: Prevent Ctrl+D from Closing/Detaching
# You must type 'exit' to close the shell. Ctrl+D will simply print a warning.
set -o ignoreeof
export IGNOREEOF=10  # Press Ctrl+D 10 times to close

# 7. Aliases
alias ta='tmux attach -d'
fix-tmux() {
  # Push actual PTY size into tmux — works after display switch when iTerm2 doesn't propagate SIGWINCH
  local size; size=$(stty size)          # "rows cols" from PTY (never stale)
  local rows=${size% *} cols=${size#* }
  tmux refresh-client -C "${cols}x${rows}"
  tmux resize-window -A
}
alias tmux-studio="python3 ~/.tmux-studio/tmux_studio.py"
alias ll='ls -lhF --color=auto'
alias la='ls -lAhF --color=auto'
alias ls='ls --color=auto'
alias lrtha='ls -lrtha --color=auto'
alias grep='grep --color=auto'
alias ..='cd ..'
alias ...='cd ../..'
alias eod='(cd ~/claude && git add -A && git diff --cached --quiet && echo "Nothing to commit." || { git commit -m "EOD $(date +%Y-%m-%d)" && git push; })'
alias fix-ssh='export SSH_AUTH_SOCK=$(tmux show-environment | grep "^SSH_AUTH_SOCK" | cut -d= -f2)'
alias fix-path='source ~/.bashrc && echo "PATH reloaded"'
# Absolute-path fallback: works even if ~/.local/bin drops from PATH
clasp() { "$HOME/.local/bin/clasp" "$@"; }
eostricks() {
  local f=~/claude/projects/eos-tricks/EOS_CLI_Tricks.md
  if [[ -n "$1" ]]; then
    grep -n -i "$1" "$f" | less -R
  else
    fzf --no-sort < "$f"
  fi
}

# 8. TimeZone & PATH
export TZ=Asia/Kolkata
export PATH="$HOME/.local/bin:$HOME/.atuin/bin:$PATH"
export EDITOR=vim
export VISUAL=vim
export CDPATH=".:~:~/claude/projects"

# 9. History
export HISTSIZE=100000
export HISTFILESIZE=200000
export HISTCONTROL=ignoredups:erasedups
shopt -s histappend
[[ "$PROMPT_COMMAND" != *"history -a"* ]] && PROMPT_COMMAND="history -a${PROMPT_COMMAND:+; $PROMPT_COMMAND}"

# 10. Prompt (with git branch + AI spend in right-aligned RPROMPT via PROMPT_COMMAND)
_ai_spend_ps1() {
    local cache="$HOME/.cache/ai-spend.json"
    local key_file="$HOME/.ai-proxy-api-key"
    local api_url="https://ai-proxy.infra.corp.arista.io/key/info"

    # Refresh cache in background — double-fork suppresses [N] PID noise; PID-unique tmp avoids mv race
    if [[ ! -f "$cache" ]] || \
       (( $(date +%s) - $(stat -c %Y "$cache" 2>/dev/null || echo 0) > 60 )); then
        mkdir -p "$HOME/.cache"
        local tmp="${cache}.tmp.$$"
        ( ( curl -sf --max-time 5 \
              -H "Authorization: Bearer $(cat "$key_file" 2>/dev/null)" \
              "$api_url" 2>/dev/null \
            | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps({'spend':d['info']['spend'],'max_budget':d['info']['max_budget']}))" \
            > "$tmp" && mv "$tmp" "$cache" || rm -f "$tmp"
          ) &>/dev/null & ) 2>/dev/null
    fi

    # Display is handled by tmux status bar — this function only refreshes the cache
}

if type __git_ps1 >/dev/null 2>&1; then
    PS1='\[\e[1;32m\]\u@\h\[\e[0m\]:\[\e[1;34m\]\w\[\e[0m\]$(__git_ps1 " (%s)")\$ '
else
    PS1='\[\e[1;32m\]\u@\h\[\e[0m\]:\[\e[1;34m\]\w\[\e[0m\]\$ '
fi
[[ "$PROMPT_COMMAND" != *"_ai_spend_ps1"* ]] && PROMPT_COMMAND="_ai_spend_ps1${PROMPT_COMMAND:+; $PROMPT_COMMAND}"

# 11. NVM
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion
# Ensure nvm-managed node/npm/clasp are always on PATH even if nvm init fires late or skips.
# Reads the default alias version so this stays correct across nvm upgrades.
_nvm_default="$NVM_DIR/alias/default"
if [ -f "$_nvm_default" ]; then
  _nvm_ver=$(cat "$_nvm_default")
  # Walk lts/* → lts/name → version (strips lts/ prefix each hop)
  while [[ "$_nvm_ver" == lts/* ]]; do
    _lts_name="${_nvm_ver#lts/}"
    [ -f "$NVM_DIR/alias/lts/$_lts_name" ] || break
    _nvm_ver=$(cat "$NVM_DIR/alias/lts/$_lts_name")
  done
  [ -d "$NVM_DIR/versions/node/$_nvm_ver/bin" ] && \
    export PATH="$NVM_DIR/versions/node/$_nvm_ver/bin:$PATH"
fi
unset _nvm_default _nvm_ver _lts_name

# 12. Atuin (history tracking + inline ghost-text via ble.sh)
# --disable-up-arrow: ble-bind handles up arrow below
# --disable-ctrl-r:   ble.sh fzf-key-bindings handles Ctrl+R
eval "$(atuin init bash --disable-up-arrow --disable-ctrl-r)"

# 13. ble.sh: Attach + fzf integration + up-arrow binding
# MUST be last — ble.sh takes over line editing here.
# command_not_found_handle (section 5) must be defined before this point.
if [[ "${BLE_VERSION-}" ]]; then
    ble-import -d integration/fzf-key-bindings  # Ctrl+R + Ctrl+T + Alt+C via ble-bind
    ble-import -d integration/fzf-completion    # fzf-powered tab completion
    ble-bind -m emacs -x up fzf-history-widget  # Up arrow → fzf history panel
    ble-attach
fi
