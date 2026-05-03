# tmux.conf Project Instructions

## Critical Design Constraints

**Prefix key is C-s** (not C-b). C-b conflicts with Vim. C-s is rebound to send-prefix for nested sessions.

**`source-file` does NOT unbind old bindings.** It only adds/overrides. If a binding is removed from config and reload runs, the old binding stays in tmux memory. Always add an explicit `unbind` for any binding you delete.

**Section 8 (post-plugin overrides) MUST appear AFTER `run tpm`.** These overrides must win over what plugins set. Moving them before `run tpm` silently loses all mouse binding fixes.

**`default-terminal` is `tmux-256color`** (not `xterm-256color`). `xterm-256color` caused space characters typed in Claude CLI to not render until the next keystroke. `tmux-256color` is the correct native TERM for tmux. True color still works via `terminal-overrides ',*:Tc'`.

**`copy-mode -H` and `copy-mode -M` are NOT supported in tmux 3.2a.** They print usage errors when called inside an `if-F` branch chain. DoubleClick/TripleClick use inline `copy-mode \; send-keys -X select-word/line` — no external script.

**`mode-keys vi` is set.** All copy-mode bindings use the `copy-mode-vi` table. Root WheelUpPane/WheelDownPane use `send-keys -M` re-dispatch (NOT `copy-mode -M` which is unsupported) to enter copy-mode-vi and re-fire the wheel event.

**5 deployable files** — hook auto-deploys each individually when edited:
- `tmux.conf` → `~/.tmux/tmux.conf` + `tmux source-file` (reload)
- `themes/light.conf` → `~/.tmux/themes/light.conf`
- `themes/dark.conf` → `~/.tmux/themes/dark.conf`
- `tmux_broadcast.sh` → `~/.tmux/tmux_broadcast.sh` (chmod +x)
- `tmux_ai_spend.sh` → `~/.tmux/tmux_ai_spend.sh` (chmod +x)

## What Works (Confirmed) — Do Not Regress

**Scroll:** Root `WheelUpPane` uses `if-shell -F "#{mouse_any_flag}" "send-keys -M" "if -Ft= '#{pane_in_mode}' 'send-keys -M' 'copy-mode -e; send-keys -M'"`. `send-keys -M` re-dispatches the event into `copy-mode-vi` where default scroll bindings fire. `WheelDownPane` same pattern without `copy-mode -e`.

**Double/Triple click copy:** Root bindings: `copy-mode \; send-keys -X select-word \; run -d 0.3 \; send-keys -X copy-selection-and-cancel`. The `run -d 0.3` delay (300ms) lets the highlight render visibly before copy fires — without it nothing gets copied (race condition). `copy-mode-vi` table bindings handle same clicks when already in copy mode.

**Drag/lift copy:** `bind -T copy-mode-vi MouseDragEnd1Pane send-keys -X copy-selection-and-cancel` + `MouseUp1Pane if -F '#{selection_active}'` guard.

**y key:** `bind-key -T copy-mode-vi y send-keys -X copy-selection-and-cancel` in both Section 5 and Section 8 (Section 8 wins over yank plugin).

**Prefix+F layout fix (display-switch resize, all windows):** Uses `run-shell -b` (background flag) — background mode never reports exit status, so "returned N" errors are completely eliminated regardless of which subcommand fails. `stty size < #{client_tty} 2>/dev/null` reads the real PTY size; captured into `DIMS`; `[ -n "$DIMS" ] && refresh-client -C "$DIMS"` skips when stty fails or returns zeros. `resize-window -A` and `select-layout -E` use `2>/dev/null` to suppress pane-minimum-size errors when shrinking. `aggressive-resize off` prevents pane size jumps when multiple clients at different sizes are attached. **Do NOT use `run-shell` (foreground) for this command — it will show "returned N" on any subcommand failure during display-switch.**

**Broadcast C-c pre-clear:** `tmux_broadcast.sh` sends `C-c` + 100ms sleep before every command so `--More--` pager and stuck prompts are cleared first. Applies to all four broadcast bindings (e/E/C-e/C-E) since they all call the same script.

## What Broke — Do Not Retry

**`copy-mode -M` and `copy-mode -H`:** Unsupported in tmux 3.2a. Print "usage: copy-mode ..." error string into the pane. macOS trackpad sends drag events during scroll, triggering these errors on every scroll. Never use these flags.

**`mode-keys vi` without explicit root WheelUpPane/WheelDownPane bindings:** tmux-sensible only adds wheel bindings to the `copy-mode` (emacs) table. With vi mode and no explicit root wheel bindings, scroll is completely dead.

**`run-shell 'sleep 0.05'` in DoubleClick/TripleClick:** Spawns a shell process, causes a visible flash on each double-click. Use `run -d N` (tmux built-in delay) instead.

**tmux_click.sh external script for DoubleClick/TripleClick:** Shell spawn + two `sleep` calls caused a visible screen flash on every double-click. Removed. All click handling is now inline.

**Unbind-only approach for WheelUpPane/WheelDownPane:** After removing stale bindings, scroll died because there were no bindings left. tmux built-ins only exist in copy-mode tables; root needs explicit bindings or re-dispatch.

## After Every Change
- Check if any removed binding needs an explicit `unbind` (source-file won't remove it automatically)
- Use `/deploy` to see the full deploy commands if hook didn't fire
