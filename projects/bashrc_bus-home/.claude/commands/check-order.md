Verify the source order in .bashrc is correct after changes.

Check the following ordering invariants in ~/claude/projects/bashrc_bus-home/.bashrc:

1. **`set -h` immediately after `/etc/bashrc` source** — grep for `set -h` and confirm it appears within 2 lines of the `/etc/bashrc` block. /etc/bashrc disables hashing; we must re-enable it immediately.

2. **`command_not_found_handle` before `bind -x`** — confirm the function definition appears before the `bind -x '"\e[A"'` line (Section 6). Check line numbers.

3. **fzf sourced before `bind -x`** — `source ~/.fzf.bash` must appear before the up-arrow binding, because `__fzf_history__` is defined by fzf's bash integration.

4. **No ble.sh** — grep for `ble` and confirm no ble.sh source lines exist.

5. **Section numbers are sequential** — grep for `# [0-9]*\.` and confirm sections are numbered 1-12 with no duplicates or gaps.

Report which checks passed and which failed, with line numbers.
