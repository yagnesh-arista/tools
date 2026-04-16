Show the scp deploy command to push .zshrc to the macbook.

Run this from the macbook to pull the latest .zshrc from bus-home:

```bash
scp bus-home:~/claude/projects/zshrc_macbook/.zshrc ~/.zshrc
```

Then reload in the current shell:
```bash
source ~/.zshrc
```

Note: `source ~/.zshrc` is safe for most changes. If you changed PATH or fzf setup, open a new terminal window for a clean reload.

Also verify source order is correct:
1. General Settings (stty, setopt, PATH, CDPATH)
2. fzf (`source <(fzf --zsh)`)
3. zsh-autosuggestions (AFTER fzf)
4. History
5. Aliases
6. Prompt (vcs_info + precmd_functions)
7. iTerm2 shell integration (LAST)
