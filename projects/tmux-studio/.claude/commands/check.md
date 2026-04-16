Run a quick sanity check on tmux_studio.py after changes.

Steps:
1. Verify the deployed file is in sync: compare the last-modified timestamps of `~/claude/projects/tmux-studio/tmux_studio.py` and `~/.tmux-studio/tmux_studio.py`. If the source is newer, the hook may not have fired — remind the user to manually copy.

2. Syntax check: run `python3 -m py_compile ~/.tmux-studio/tmux_studio.py` and report pass/fail.

3. Help smoke test: run `python3 ~/.tmux-studio/tmux_studio.py --help` and confirm it exits cleanly with subcommand list (save, restore, manage).

4. Check TMUX_SEP is still `"\x1f"` (ASCII unit separator) — grep for `TMUX_SEP` in the source and confirm it is not `"|||"` or any other value.

Report any failures with the exact output.
