# Claude Code Reference Card
Last updated: 2026-04-18

> Update this file whenever a rule, workflow, or automation changes.
> Hook reminder fires automatically on every global config edit.

---

## 18 Global Rules

| # | Rule | Layer | File |
|---|---|---|---|
| 1 | INSTRUCTIONS + CLAUDE.md discipline — create both, read before changes, update after every change | `CLAUDE.md` | `CLAUDE.md` |
| 2 | JetBrains Mono on ALL UI elements — explicit, no inheritance; font scale 10px/11px/12px | `rules/` | `rules/ui.md` |
| 3 | UI/UX symmetry — consistent spacing/sizing; no text overflow; sibling boxes same size unless design requires otherwise | `rules/` | `rules/ui.md` |
| 4 | No modal/overlay out of canvas — clamp to viewport always | `rules/` | `rules/ui.md` |
| 5 | Apply new global rules to all existing projects immediately | `CLAUDE.md` | `CLAUDE.md` |
| 6 | `user-select: none` on non-editable elements — never on `body` | `rules/` | `rules/ui.md` |
| 7 | All icons must be SVG — never Unicode | `rules/` | `rules/ui.md` |
| 8 | New project structure — 7-question gate, `git init` mandatory, no files until all confirmed | `CLAUDE.md` + `commands/` + `hooks/` | `CLAUDE.md`, `commands/new-project.md` |
| 9 | User feedback for long actions — status before, live elapsed timer, confirm on complete | `rules/` | `rules/quality.md` |
| 10 | Code quality — no over/under-engineering, match existing conventions | `rules/` | `rules/quality.md` |
| 11 | Refactoring — surface opportunities, don't act without being asked | `rules/` | `rules/quality.md` |
| 12 | Security — validate at every system boundary, block on hardcoded secrets | `rules/` | `rules/security.md` |
| 13 | Tests — real paths, independent, no internal mocks, happy path + edge cases | `rules/` | `rules/testing.md` |
| 14 | Review — scope/hygiene, bugs, design quality (over/under-engineering), test quality, refactoring opportunities; `/review-global` before every commit | `hooks/` + `commands/` | `hooks/commit-guard.sh`, `commands/review-global.md` |
| 15 | Ambiguity — ask before tasks touching 3+ files or multiple valid approaches | `CLAUDE.md` | `CLAUDE.md` |
| 16 | Claude Code anatomy reference — layer table mapping rules to files | `CLAUDE.md` | `CLAUDE.md` |
| 17 | Git workflow — every project gets `git init`, commit after every change, push always | `CLAUDE.md` + `hooks/` | `CLAUDE.md`, `settings.json` |
| 18 | Global config auto-sync — edits to hooks/, rules/, commands/, settings.json, CLAUDE.md auto-propagate to settings backup | `hooks/` | `settings.json` (PostToolUse) |

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
  → auto-deploy fires (tmux.conf, tmux-studio, bashrc)
  → global config auto-syncs (hooks/, rules/, settings.json, CLAUDE.md)
  → INSTRUCTIONS reminder fires → update INSTRUCTIONS_<project>.txt
/review          ← before every commit
git add <files>
git commit       ← commit guard fires automatically
git push
```

---

## Commands

| When | Command |
|---|---|
| New project | `/new-project` — 7-question gate, `git init` runs first |
| Before committing | `/review-global` → `/fix-and-commit` |
| New machine | `bash ~/claude/projects/settings/setup.sh` |

---

## What's Fully Automatic (no action needed)

| Trigger | What happens |
|---|---|
| Any Write/Edit (code files) | Pre-write scan: flags debug/secrets/TODOs |
| Any Write/Edit (no git) | Backup to `.claude/backups/` + `git init` warning |
| Any Write/Edit (any project) | INSTRUCTIONS sync reminder |
| Edit `~/.claude/**` or `~/claude/CLAUDE.md` | Auto-sync to `settings/` backup + Reference_Card reminder |
| `git commit` | Commit guard: blocks on secrets/debug |
| Edit tmux-studio file | Auto-deploy to `~/.tmux-studio/` |
| Edit tmux.conf file | Auto-deploy to `~/.tmux/` + reload tmux |
| Edit `.bashrc` | Auto-deploy to `~/.bashrc` |
| Edit `topoassist/device_bridge.py` | Auto-runs `pytest tests/ -v` and shows summary inline |
| Edit `topoassist/Code.gs` | Reminds to update `Tests.gs` if pure functions changed |

---

## Global Rules Location

| Layer | File | Covers |
|---|---|---|
| Always loaded | `~/claude/CLAUDE.md` | All 18 global rules |
| UI rules | `~/.claude/rules/ui.md` | Font, symmetry, canvas, icons, user-select |
| Quality rules | `~/.claude/rules/quality.md` | Progress timer, code quality, refactoring |
| Security rules | `~/.claude/rules/security.md` | Injection, secrets, boundaries |
| Test rules | `~/.claude/rules/testing.md` | Isolation, mocking, coverage |
| Commands | `~/.claude/commands/new-project.md` | New project gate |
| Commands | `~/.claude/commands/review-global.md` | Pre-commit review |
| Hooks | `~/.claude/settings.json` | All automatic enforcement |
| Backup | `~/claude/projects/settings/` | Restore kit for new machine |
| Reference | `~/claude/Reference_Card.md` | This file — single source of truth |
