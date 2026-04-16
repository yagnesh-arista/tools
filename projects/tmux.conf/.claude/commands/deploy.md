Show the full deploy commands for all tmux.conf project files.

The hook auto-deploys each file when edited, but run this if you need to manually deploy or verify everything is in sync.

Deploy commands (run in order):
```bash
cp ~/claude/projects/tmux.conf/tmux.conf ~/.tmux/tmux.conf
cp ~/claude/projects/tmux.conf/themes/light.conf ~/.tmux/themes/light.conf
cp ~/claude/projects/tmux.conf/themes/dark.conf ~/.tmux/themes/dark.conf
cp ~/claude/projects/tmux.conf/tmux_broadcast.sh ~/.tmux/tmux_broadcast.sh && chmod +x ~/.tmux/tmux_broadcast.sh
cp ~/claude/projects/tmux.conf/tmux_click.sh ~/.tmux/tmux_click.sh && chmod +x ~/.tmux/tmux_click.sh
tmux source-file ~/.tmux/tmux.conf
```

Also check: if any binding was REMOVED in the last change, confirm an explicit `unbind` was added — `source-file` does not remove old bindings from tmux memory.
