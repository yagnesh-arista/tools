# tmux.conf Project Instructions

## Critical Design Constraints

**Prefix key is C-s** (not C-b). C-b conflicts with Vim. C-s is rebound to send-prefix for nested sessions.

**`source-file` does NOT unbind old bindings.** It only adds/overrides. If a binding is removed from config and reload runs, the old binding stays in tmux memory. Always add an explicit `unbind` for any binding you delete.

**Section 8 (post-plugin overrides) MUST appear AFTER `run tpm`.** These overrides must win over what plugins set. Moving them before `run tpm` silently loses all mouse binding fixes.

**`copy-mode -H` and `copy-mode -M` are NOT supported in tmux 3.2a.** They print usage errors when called inside an `if-F` branch chain. Use external scripts (tmux_click.sh) for DoubleClick/TripleClick instead.

**5 deployable files** — hook auto-deploys each individually when edited:
- `tmux.conf` → `~/.tmux/tmux.conf` + `tmux source-file` (reload)
- `themes/light.conf` → `~/.tmux/themes/light.conf`
- `themes/dark.conf` → `~/.tmux/themes/dark.conf`
- `tmux_broadcast.sh` → `~/.tmux/tmux_broadcast.sh` (chmod +x)
- `tmux_click.sh` → `~/.tmux/tmux_click.sh` (chmod +x)

## After Every Change
- Check if any removed binding needs an explicit `unbind` (source-file won't remove it automatically)
- Use `/deploy` to see the full deploy commands if hook didn't fire
