# bashrc_bus-home Project Instructions

## Context
This is **bash on Linux** (bus-home jump server). Not macOS, not zsh.

## Critical Design Constraints

**`command_not_found_handle` MUST stay before `bind -x` (Section 6).** ble.sh (now removed) wrapped the handler on load — if defined after, it would be overwritten. Even without ble.sh, keep this order as a structural invariant.

**`/etc/bashrc` disables hashing (`set +h`)** — we immediately re-enable with `set -h` after sourcing it. This is required for NVM and other tools that call `hash`. Never remove the `set -h` line.

**No ble.sh** — it was removed due to flickering and conflicts with fzf. Do not re-add it.

**`bind -x '"\e[A": "__fzf_history__"'`** — up arrow bound to fzf history. `__fzf_history__` is defined by `~/.fzf.bash`. If fzf is not installed, this silently fails (2>/dev/null).

## After Every Change
- Hook auto-deploys to `~/.bashrc`
- Remind user to open a new shell or run `source ~/.bashrc` to see changes
