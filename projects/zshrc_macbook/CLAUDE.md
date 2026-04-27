# zshrc_macbook Project Instructions

## Context
This is **zsh on macOS** (macbook: yagnes76D0W4m). Not bash, not Linux.

## Critical Design Constraints

**No auto-deploy** — this is a remote machine. After every change, always end the response with:
```
scp bus-home:~/claude/projects/zshrc_macbook/.zshrc ~/.zshrc && source ~/.zshrc
```

**Source order matters:**
1. General Settings (stty, setopt, exports, PATH, CDPATH)
2. fzf — `source <(fzf --zsh)`, then immediately `bindkey '^[[A' fzf-history-widget` + `bindkey '^[OA' fzf-history-widget` (up arrow → fzf panel; both sequences for standard + tmux/application mode). bindkey MUST come after the source line — the widget doesn't exist before it.
3. zsh-autosuggestions — must come AFTER fzf
4. History (setopt)
5. Aliases
6. Prompt (vcs_info, precmd_functions)
7. iTerm2 shell integration — LAST, appends to precmd_functions cleanly

**iTerm2 integration: use `precmd_functions+=(vcs_info_precmd)`**, NOT `precmd()` directly. Defining `precmd()` directly overwrites iTerm2's hook, breaking shell integration markers.

**iTerm2 self-skips inside tmux** — the integration checks `$TERM == tmux-256color` and skips itself automatically. No guard needed.

**zsh syntax only** — use `setopt`/`[[ ]]`/`(( ))`. Never use bash-isms (`set -o`, `[ ]`, `shopt`).

**`expect -c '...'` — NO apostrophes inside the block** — the entire Tcl script is passed as a zsh single-quoted string. Any apostrophe (including contractions like "don't", "it's", "we'll") closes the string early, causing zsh to parse the rest of the Tcl code as shell syntax. Use "do not", "it is", etc. in comments, and `\047` for literal single quotes in Tcl string arguments.
