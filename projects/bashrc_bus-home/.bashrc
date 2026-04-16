# ~/.bashrc — bus-home
# Managed via ~/claude/projects/bashrc_bus-home/
# Deploy: cp .bashrc ~/.bashrc (auto via hook)

# 1. Load System Defaults
if [ -f /etc/bashrc ]; then
    source /etc/bashrc 2>/dev/null
fi
set -h  # Re-enable hashing (disabled by /etc/bashrc); needed by NVM and other tools

# 2. CRITICAL: Fix Tmux Resizing Issues
# Forces the shell to update window size lines/cols after every command
shopt -s checkwinsize

# 3. Enable Standard Tab Completion
if ! shopt -oq posix; then
    if [ -f /usr/share/bash-completion/bash_completion ]; then
        . /usr/share/bash-completion/bash_completion
    elif [ -f /etc/bash_completion ]; then
        . /etc/bash_completion
    fi
fi

# 4. Enable FZF
[ -f ~/.fzf.bash ] && source ~/.fzf.bash
export FZF_TMUX_HEIGHT=30%
export FZF_DEFAULT_OPTS='--height 30% --layout=reverse --border'
export FZF_CTRL_R_OPTS='--height 30% --no-sort --exact'

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

# 6. Up arrow → fzf history panel (works inside and outside tmux)
bind -x '"\e[A": "__fzf_history__"' 2>/dev/null

# 7. SAFETY: Prevent Ctrl+D from Closing/Detaching
# You must type 'exit' to close the shell. Ctrl+D will simply print a warning.
set -o ignoreeof
export IGNOREEOF=10  # Press Ctrl+D 10 times to close

# 8. Aliases
alias ta='tmux attach -d'
alias fix-tmux='tmux resize-window -x $(tput cols) -y $(tput lines)'
alias tmux-studio="python3 ~/.tmux-studio/tmux_studio.py"
alias ll='ls -lhF --color=auto'
alias la='ls -lAhF --color=auto'
alias ls='ls --color=auto'
alias lrtha='ls -lrtha --color=auto'
alias grep='grep --color=auto'
alias ..='cd ..'
alias ...='cd ../..'
alias eod='cd ~/claude && git add -A && git diff --cached --quiet && echo "Nothing to commit." || (git commit -m "EOD $(date +%Y-%m-%d)" && git push) && cd -'

# 9. TimeZone & PATH
export TZ=Asia/Kolkata
export PATH="$HOME/.local/bin:$PATH"
export EDITOR=vim
export VISUAL=vim
export CDPATH=".:~:~/claude/projects"

# 10. History
export HISTSIZE=100000
export HISTFILESIZE=200000
export HISTCONTROL=ignoredups:erasedups
shopt -s histappend
PROMPT_COMMAND="history -a; $PROMPT_COMMAND"  # Append to history file after each command

# 11. Prompt (with git branch)
PS1='\[\e[1;32m\]\u@\h\[\e[0m\]:\[\e[1;34m\]\w\[\e[0m\]$(__git_ps1 " (%s)")\$ '

# 12. NVM
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion
