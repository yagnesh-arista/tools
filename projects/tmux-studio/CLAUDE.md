# tmux-studio Project Instructions

## Critical Design Constraints

**Single file:** `tmux_studio.py` — all logic lives here. Hook auto-deploys to `~/.tmux-studio/tmux_studio.py` on every edit. Remind user to run the updated script.

**`TMUX_SEP = "\x1f"` (ASCII unit separator)** — never change back to `"|||"`. Paths and pane commands can contain `|`, which caused collisions. `split()` always uses `maxsplit=9` (list-panes) or `maxsplit=1` (list-windows) to prevent unpack ValueError if separator appears in the final field.

**Never mutate `args.override`** — use a local `do_override` variable throughout restore. `args.override` mutation caused subtle bugs where a user declining deletes would accidentally disable override for the rest of the restore.

**`ask_confirmation()` loops until explicit `y` or `n`** — Enter alone or any other key re-prompts. Never change this to default to False/n on Enter.

**All indices stored as strings** — `normalize_loaded_data()` enforces this on every JSON load. Never compare indices with `==` using integers.

## After Every Change
- Hook auto-deploys to `~/.tmux-studio/tmux_studio.py`
- Remind user to test with `tmux-studio save` or `tmux-studio restore --help`
