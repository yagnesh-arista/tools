# Claude Code Reference Card
Last updated: 2026-04-21

> Update this file whenever a rule, workflow, or automation changes.
> Hook reminder fires automatically on every global config edit.

---

## 22 Global Rules

| # | Rule | Layer | File |
|---|---|---|---|
| 1 | INSTRUCTIONS + CLAUDE.md discipline — create both, read before changes, update after every change | `CLAUDE.md` | `CLAUDE.md` |
| 2 | JetBrains Mono on ALL UI elements — explicit, no inheritance; font scale 10px/11px/12px | `rules/` | `rules/ui.md` |
| 3 | UI/UX symmetry — consistent spacing/sizing; no text overflow; sibling boxes same size unless design requires otherwise | `rules/` | `rules/ui.md` |
| 4 | No modal/overlay out of canvas — clamp to viewport always | `rules/` | `rules/ui.md` |
| 5 | Apply new global rules to all existing projects immediately | `CLAUDE.md` | `CLAUDE.md` |
| 6 | `user-select: none` on non-editable elements — never on `body` | `rules/` | `rules/ui.md` |
| 7 | Modal default background — white (`#ffffff`) by default; dark mode overrides via `--bg-modal` var | `rules/` | `rules/ui.md` |
| 7a | All icons must be SVG — never Unicode | `rules/` | `rules/ui.md` |
| 7b | Info/help text boxes — `info-box info-box--dim`: left-accent border only, italic text, muted color (`#94a3b8`); add `info-box--keep-colors` for color legends; never dim warning banners | `rules/` | `rules/ui.md` |
| 7c | Input text state taxonomy — Label, Placeholder, Value, Focus, Error, Disabled, Read-only, Prefix/Suffix each has explicit CSS; `::placeholder` never inherits; dim-container inputs need both value (`font-style:italic; font-weight:400`) and `::placeholder` rules | `rules/` | `rules/ui.md` |
| 7d | Font scale extended — 10/11/12px for controls; 13px sub-section headers; 14px modal/panel titles. Five levels only, no arbitrary sizes. | `rules/` | `rules/ui.md` |
| 7e | `<textarea>` states — same taxonomy as `<input>`; all states explicit; always set `resize: vertical` or `resize: none` | `rules/` | `rules/ui.md` |
| 7f | Inline `<code>` — JetBrains Mono 11px, `var(--bg-body)` bg, light border, `border-radius: 3px`, `user-select: text`; never leave `<code>` without explicit `font-family` | `rules/` | `rules/ui.md` |
| 8 | New project structure — 7-question gate, `git init` mandatory, no files until all confirmed | `CLAUDE.md` + `commands/` + `hooks/` | `CLAUDE.md`, `commands/new-project.md` |
| 9 | User feedback for long actions — status before, live elapsed timer, confirm on complete | `rules/` | `rules/quality.md` |
| 10 | Code quality — no over/under-engineering, match existing conventions | `rules/` | `rules/quality.md` |
| 11 | Refactoring — surface opportunities, don't act without being asked | `rules/` | `rules/quality.md` |
| 11a | Reuse and enhance — before writing a new function, find an existing one; extend with optional `opts`; replace all old call sites; never leave parallel implementations alive | `rules/` | `rules/quality.md` |
| 12 | Security — validate at every system boundary, block on hardcoded secrets | `rules/` | `rules/security.md` |
| 13 | Tests — real paths, independent, no internal mocks, happy path + edge cases | `rules/` | `rules/testing.md` |
| 14 | Review — scope/hygiene, bugs, design quality (over/under-engineering), test quality, refactoring opportunities; `/review-global` before every commit | `hooks/` + `commands/` | `hooks/commit-guard.sh`, `commands/review-global.md` |
| 15 | Ambiguity — ask before tasks touching 3+ files or multiple valid approaches | `CLAUDE.md` | `CLAUDE.md` |
| 16 | Claude Code anatomy reference — layer table mapping rules to files | `CLAUDE.md` | `CLAUDE.md` |
| 17 | Git workflow — every project gets `git init`, commit after every change, push always | `CLAUDE.md` + `hooks/` | `CLAUDE.md`, `settings.json` |
| 18 | Global config auto-sync — edits to hooks/, rules/, commands/, settings.json, CLAUDE.md auto-propagate to settings backup | `hooks/` | `settings.json` (PostToolUse) |
| 19 | Rollback Logging — every revert/rollback logged to ROLLBACKS.md; git revert handled by hook, manual rollbacks written by Claude | `hooks/` + `CLAUDE.md` | `hooks/rollback-logger.sh`, `CLAUDE.md` |
| 20 | GAS loading overlay guard — every `showGlobalLoading()` must have a `_guard = setTimeout(hideGlobalLoading+setStatus, N)`; both handlers `clearTimeout(_guard)` first; timeouts: 15s read/save, 20s fetchFullConfig, 60s sync | `rules/` | `rules/gas.md` |
| 21 | Modal button standard — SVG × header (`.btn-modal-close`); footer order: Delete-isolated-left · Cancel · Primary-right; view-only = no footer; no duplicate close/cancel; every new modal must register in `modalOrder` + `closeFuncs` for Esc handling | `rules/` | `rules/ui.md` |
| 22 | Search/filter input height — browser UA inflates `<input>` to ~26px; compact inputs must pin `height: 20px; padding: 0 7px; line-height: 20px; box-sizing: border-box`; match height to sibling icons/rows; full-form modal inputs exempt | `rules/` | `rules/ui.md` |

---

## Machine Rebuild (new machine)

```bash
git clone https://github.com/yagnesh-arista/claude ~/claude
bash ~/claude/projects/settings/setup.sh
git config --global user.name "Yagnesh Chauhan"
git config --global user.email "yagnesh@arista.com"
# Then manually recreate ~/.ai-proxy-api-key (from Arista onboarding)
```

### Verify hooks after setup
```bash
jq . ~/.claude/settings.json > /dev/null && echo "valid" || echo "broken"
# Open Claude Code, edit any ~/claude/projects/ file — confirm pre-write scan fires
```

---

## Daily Workflow

```
Edit file
  → pre-write scan fires (debug/secrets/TODOs)
  → stamp.sh stamps version (YYMMDD.N) on line 1/2
  → auto-deploy fires (tmux.conf, tmux-studio, bashrc, topoassist GAS via clasp)
  → global config auto-syncs (hooks/, rules/, settings.json, CLAUDE.md)
  → INSTRUCTIONS reminder fires → update INSTRUCTIONS_<project>.txt
git commit -m "..."
  → commit guard fires (blocks on secrets/debug)
  → post-change-summary auto-pushes to GitHub
  → post-change-summary auto-clasp-pushes GAS files (if not already done by edit hook)
  → [CHANGE SUMMARY] shows in UI with file versions + Git/Clasp status
Session end (Stop)
  → any uncommitted tracked changes auto-committed + pushed
  → GAS files auto-clasp-pushed if changed
```

---

## Commands

### Global

| When | Command |
|---|---|
| New project | `/new-project` — 7-question gate, `git init` runs first |
| Before committing | `/review-global` → `/fix-and-commit` |
| New machine | `bash ~/claude/projects/settings/setup.sh` |

### TopoAssist

| Command | What it does |
|---|---|
| `/project:topoassist-review-code-design` | TopoAssist-specific compliance review (Sidebar-js, CSS, Code.gs, UI rules) |
| `/project:topoassist-review-code-full` | Full review: TopoAssist-specific checks + global review |
| `/project:topoassist-review-deploy` | Three-way sync check: git → local → GAS remote + commit history |
| `/project:topoassist-review-userguide` | Update UserGuide.html to match current session changes |
| `/project:topoassist-deploy-gas-clasp` | Deploy TopoAssist to Google Apps Script via `clasp push` |
| `/project:topoassist-deploy-git` | Push TopoAssist changes to GitHub |
| `/project:topoassist-deploy-inst-device_bridge` | Instructions: `scp device_bridge.py` to Mac |
| `/project:topoassist-deploy-inst-gas-clasp` | Instructions: re-authenticate `clasp` for headless/SSH sessions |
| `/project:topoassist-test-device_bridge` | Run `pytest tests/` for device_bridge.py pure functions |

---

## Deployment: What's Automatic vs. Manual

### Fully Automatic (no action needed)

| Trigger | What fires | Result |
|---|---|---|
| Any Write/Edit (code file) | `stamp.sh` | Version stamp YYMMDD.N on line 1/2 |
| Any Write/Edit (code file) | Pre-write scan | Blocks on secrets/debug/TODOs |
| Any Write/Edit (no git project) | Backup hook | `.claude/backups/` snapshot + `git init` warning |
| Any Write/Edit (any project) | INSTRUCTIONS reminder | Prompt to update INSTRUCTIONS_<project>.txt |
| Edit `~/.claude/**` or `~/claude/CLAUDE.md` | `settings-backup.sh` | Auto-syncs to `settings/` + commits + pushes |
| Edit `topoassist/*.gs` or `*.html` | `topoassist-deploy-tracker.sh` | `clasp push` (flock-protected); CLASP_MARKER written |
| Edit `topoassist/Code.gs` | `topoassist-gas-test-check.sh` | Detects new/changed functions with no test case in Tests.gs; lists gaps |
| Edit any `topoassist/` source | `topoassist-userguide-check.sh` | Reminds to update UserGuide.html if user-facing behavior changed |
| Edit `topoassist/device_bridge.py` | `topoassist-pytest-check.sh` | `pytest tests/ -v` summary inline |
| Edit tmux-studio file | Inline hook | Copy to `~/.tmux-studio/tmux_studio.py` |
| Edit `tmux.conf` project files | Inline hook | Copy to `~/.tmux/` + `tmux source-file` reload |
| Edit `bashrc_bus-home/.bashrc` | Inline hook | Copy to `~/.bashrc` |
| `git commit` | `commit-guard.sh` | Blocks on secrets/debug |
| `git revert` (any rollback) | `rollback-logger.sh` | Appends entry to `ROLLBACKS.md` (flock-protected) |
| `git commit` (no push) | `post-change-summary.sh` | Auto `git push` + `[CHANGE SUMMARY]` in UI |
| `git commit` with GAS files | `post-change-summary.sh` | Auto `clasp push` if not done by edit hook |
| Session end (Stop) | `git-uncommitted-check.sh` | Warns about uncommitted changes in standalone sub-repos |
| Session end (Stop) | `post-change-summary.sh` | Auto-commits + pushes any uncommitted tracked files |
| Session end with GAS changes | `post-change-summary.sh` | Auto `clasp push` |
| UserPromptSubmit | `settings-drift-check.sh` | Detects external `~/.claude/` edits, syncs + commits |
| UserPromptSubmit | `prompt-secrets-scan.sh` | Scans user prompt for accidentally pasted secrets/tokens |
| Any `mcp__winnow__*` call | `winnow-auth-check.sh` | Detects Winnow auth failures, attempts auto-login |
| Claude Code notification | `notify.sh` | Routes notification to system (`notify-send` or tmux status) |

### Requires Manual Action

| Project | Manual step | Hook reminder? |
|---|---|---|
| `topoassist/device_bridge.py` | `scp bus-home:~/claude/projects/topoassist/device_bridge.py ~/device_bridge.py` | Yes — `topoassist-deploy-tracker.sh` prints this |
| `zshrc_macbook/.zshrc` | `scp bus-home:~/claude/projects/zshrc_macbook/.zshrc ~/.zshrc && source ~/.zshrc` | Yes — always shown after edit |
| `bashrc_bus-home/.bashrc` | `source ~/.bashrc` in the running shell | No — remind user after edit |

### Lock Safety (parallel SSH sessions)

All concurrent-write risks are flock-protected:

| Lock file | Protects |
|---|---|
| `/tmp/claude-git.lock` | All `git add/commit/push` calls across all hooks |
| `/tmp/clasp-topoassist.lock` | All `clasp push` calls + `CLASP_MARKER` reads/writes |
| `/tmp/stamp-{project}.lock` | Version calculation + file stamping (per project) |
| `/tmp/claude-rollback.lock` | Multi-line append to `ROLLBACKS.md` |
| `/tmp/claude-commands.lock` | `cp` to `~/.claude/commands/` |

---

## Global Rules Location

| Layer | File | Covers |
|---|---|---|
| Always loaded | `~/claude/CLAUDE.md` | All 19 global rules |
| UI rules | `~/.claude/rules/ui.md` | Font, symmetry, canvas, icons, user-select |
| Quality rules | `~/.claude/rules/quality.md` | Progress timer, code quality, refactoring |
| GAS rules | `~/.claude/rules/gas.md` | GAS loading guard pattern (Rule 20) |
| Security rules | `~/.claude/rules/security.md` | Injection, secrets, boundaries |
| Test rules | `~/.claude/rules/testing.md` | Isolation, mocking, coverage |
| Commands | `~/.claude/commands/new-project.md` | New project gate |
| Commands | `~/.claude/commands/review-global.md` | Pre-commit review |
| Commands | `~/.claude/commands/topoassist-review-memory.md` | INSTRUCTIONS + memory + hooks cross-check — prune stale, resolve conflicts, fill gaps |
| Hooks | `~/.claude/settings.json` | All automatic enforcement |
| Backup | `~/claude/projects/settings/` | Restore kit for new machine |
| Reference | `~/claude/Reference_Card.md` | This file — single source of truth |
