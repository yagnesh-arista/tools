# bashrc_bus-home Project Instructions

## Context
This is **bash on Linux** (bus-home jump server). Not macOS, not zsh.

## Critical Design Constraints

**ble.sh source order (critical):**
- Section 0: `source ble.sh --noattach` — MUST be first; guarded by `$- == *i*` AND `$TERM` not dumb/unknown
- Immediately after section 0: `case $- in *i*) ;; *) return;; esac` — early exit for non-interactive shells (scp/Python SSH); prevents CliTimeout
- Section 5: `command_not_found_handle` — MUST be defined before `ble-attach` so ble.sh wraps it
- Section 13: `ble-attach` — MUST be last; ble.sh takes over line editing here

**No raw `bind -x` for up arrow** — ble.sh neutralizes readline bind calls. Up arrow is handled via `ble-bind -m emacs -x up fzf-history-widget` in section 13.

**No raw `bind` calls at all after section 0** — ble.sh intercepts them. Use `ble-bind` inside the `if [[ "${BLE_VERSION-}" ]]` block instead.

**`/etc/bashrc` disables hashing (`set +h`)** — we immediately re-enable with `set -h` after sourcing it. This is required for NVM and other tools that call `hash`. Never remove the `set -h` line.

**Atuin** (section 12) must be initialized with `--disable-up-arrow --disable-ctrl-r` — fzf/ble.sh handle those bindings. Atuin provides ghost-text autosuggestions via its ble.sh integration hook.

## After Every Change
- Hook auto-deploys to `~/.bashrc`
- Remind user to open a new shell or run `source ~/.bashrc` to see changes
