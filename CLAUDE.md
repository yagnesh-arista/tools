# Global Project Rules
These rules apply to ALL projects in ~/claude/projects/.

## 1. INSTRUCTIONS_<project>.txt + CLAUDE.md Discipline
Every project must have both:
- `INSTRUCTIONS_<project>.txt` — full detail: project overview, file structure, design constraints, invariants, key function references.
- `CLAUDE.md` — auto-loaded summary of the most critical constraints and invariants (1-2 lines each); anything that must be checked before every change.

**On every code change:** update `INSTRUCTIONS_<project>.txt` (and bump "Last updated").
**When constraints/invariants/key rules change:** ALSO update `CLAUDE.md`.
**Before any code change:** read the relevant INSTRUCTIONS section first.
**If INSTRUCTIONS or CLAUDE.md conflicts with the code:** stop and ask — don't silently pick one.

## 2. JetBrains Mono on All UI Elements
Every UI element (buttons, inputs, labels, badges, dropdowns, modals, tooltips, status bars) must explicitly set `font-family: 'JetBrains Mono', monospace`. Do NOT rely on inheritance — it does not work in Google Apps Script dialogs or some browser contexts.
Font scale: **10px** category markers / **11px** secondary text (hints, captions) / **12px** primary controls (inputs, buttons, radio labels). Never below 10px; no arbitrary sizes outside this scale.

## 3. UI/UX Symmetry
Spacing, alignment, sizing, padding, and interactions must be consistent and balanced across all elements. If you add a button row, all buttons must share the same height, font size, and padding. If a modal has 16px padding on the left, it must have 16px on the right.
- **No text overflow**: text must never bleed outside its container — wrap or truncate (ellipsis / word-break) within the bounding box.
- **Uniform box sizing**: all sibling boxes/panels in a modal share the same width and height unless a specific design reason justifies deviation.

## 4. No Modal or HTML Object Out of Canvas
Every modal, tooltip, dropdown, overlay, and floating panel must stay fully within viewport/canvas bounds at all times — including after window resize and drag. Clamp positions to viewport edges. Never let content overflow off-screen.

## 5. Apply New Global Rules Immediately
When a new global rule is established, apply it to all existing projects without being asked. Update each project's INSTRUCTIONS file and fix the code in the same session.

## 6. user-select: none on Non-Editable Elements
Apply `user-select: none; -webkit-user-select: none` broadly to all non-editable UI elements (labels, badges, headers, cards, node titles, modal chrome, status bars, etc.).
- **Never apply to `body`** — `-webkit-user-select: none` on body breaks `execCommand("copy")` in WebKit/Chrome.
- **Never apply to `<input>`, `<textarea>`, `<select>`**, or any element the user needs to select/copy text from.
- For clipboard copy, always use `navigator.clipboard.writeText()` with an `execCommand` fallback (set `user-select: text` inline on a temporary textarea).
- If a modal displays read-only content the user might want to copy (diff output, config text), leave that specific element selectable.

## 7. Modal Default Background
All modals must use a white background (`#ffffff`) by default. Dark mode overrides via a `--bg-modal` CSS variable or dark-mode theme selector — never hardcode dark on a modal outside a dark-mode rule. In CSS-variable projects: define `--bg-modal: #ffffff` as the base; override with the dark card color under the dark-mode selector only.

## 7a. All Icons Must Be SVG (Never Unicode)
Use inline SVG for every icon. Unicode characters (▶, ✕, ⚙, etc.) blur at non-integer zoom levels, misalign with text baselines, and render inconsistently across platforms.

## 8. New Project Structure (required for every new project)

**STOP — do not create any files until the user has answered all of these:**

Run `/new-project` or ask the user directly:
1. **Project name** — directory name + INSTRUCTIONS file name
2. **Purpose** — what it does (1–2 sentences)
3. **Stack** — language, runtime, framework, key libraries/versions
4. **Deploy method** — how code gets deployed or run (scp, GAS push, local script, etc.)
5. **Invariants/constraints** — anything that must never break
6. **External integrations** — MCP tools, APIs, DBs, services
7. **Hook coverage** — should edits auto-deploy? What file triggers what?

Do NOT proceed until all 7 are confirmed.

**Once confirmed, create in this order:**
1. Create `~/claude/projects/<name>/` directory
2. `git init` — mandatory, every project must be a git repo from the start
3. `INSTRUCTIONS_<project>.txt` — full detail document (overview, file structure, design constraints, invariants, function reference). Hook auto-enforces updates.
4. `CLAUDE.md` (project-level) — critical constraints, invariants, deploy method. 1-2 lines each.
5. `.claude/commands/deploy.md` (or `check.md`) — deploy commands or sync verification.
6. Hook entry in `~/.claude/settings.json` — PostToolUse auto-deploy for main file(s).
7. Initial commit: `git add -A && git commit -m "Initial scaffold"`

**Never start a project without git init** — no git means no rollback, no history, no commit guards.

---

## 9. Always Provide User Feedback for Actions That Take Time
Any action that takes more than ~1 second must:
- Show a status message before starting ("Running…", "Fetching…")
- Display a live elapsed-seconds timer while running
- Provide continuous phase updates as it progresses
- Confirm on completion ("Done", "✓ Complete")
Never run a long action silently.

---

## 10. Code Quality (applies to all projects)
- Bug-free, well-tested, minimal surface area.
- No over-engineering: no speculative abstractions, fallbacks for impossible cases, or premature configurability.
- No under-engineering: no hacks, duplication, or deferred correctness.
- Follow SOLID where it reduces coupling. Don't apply patterns for their own sake.
- New code must integrate cleanly with existing conventions — match style, naming, and structure without being asked.
- Don't introduce new dependencies for things achievable with the existing stack.

## 11. Refactoring
- If you see a refactor or simplification opportunity, surface it. Don't act on it unless explicitly asked.

## 12. Security
- At every system boundary (user input, external APIs, env vars): check for injection, unvalidated input, and credential exposure.
- Flag any hardcoded secrets, tokens, or credentials as a blocker.

## 13. Tests
- All critical behavior must be tested: happy path + key failure/edge cases.
- Tests must exercise real production code paths. Mock only true external dependencies (network, filesystem, time).
- Tests must be fully independent — no shared mutable state, no ordering dependency.
- No duplicate tests, no testing internals, no snapshot tests as behavioral proxies.

## 14. Review — Git, Local, and Unmanaged Projects
Before every change, detect project type and apply the matching review strategy.
Run `/review` for a full structured report.

| Project type | Detection | Review strategy | Rollback |
|---|---|---|---|
| **Git repo** | `git rev-parse --git-dir` succeeds | Pre-commit: staged diff, secrets, debug, unrelated changes, test coverage | `git checkout` |
| **Local non-git** (`~/claude/projects/`) | git check fails + path matches | Pre-write hook auto-backups to `.claude/backups/`; diff backup vs current; secrets + debug scan | Restore from `.claude/backups/` |
| **Unmanaged** (elsewhere) | git check fails + outside projects/ | Secrets + debug scan only; warn no backup exists | Manual |

**Fail if:** secrets or credentials present, debug statements left in code, unrelated changes, tests missing for changed behavior.
**Warn if:** unstaged/untracked files that shouldn't be included, no backup found for a local project file.

## 17. Git Workflow (mandatory for all projects)
- Every project under `~/claude/projects/` must be a git repo (`git init` on creation).
- Commit after every meaningful change — don't batch. Small commits = easy `git revert`.
- Push to remote after every commit: `git push`.
- After any change to `~/.claude/settings.json`, `~/.claude/rules/`, `~/.claude/commands/`, or `~/claude/CLAUDE.md` — sync to `~/claude/projects/settings/` and commit.
- Pre-commit auto-scan runs via hook (blocks on secrets/debug). Run `/review` for full check.

## 18. Global Config Auto-Sync (settings backup)
All global Claude Code config files auto-sync to `~/claude/projects/settings/` via PostToolUse hook whenever they are edited:
- `~/.claude/hooks/*.sh` → `settings/hooks/`
- `~/.claude/rules/*.md` → `settings/rules/`
- `~/.claude/commands/*.md` → `settings/commands/`
- `~/.claude/settings.json` → regenerated `settings/settings.json.template` (with $HOME)
- `~/claude/CLAUDE.md` → `settings/global-rules/`

After any such edit: commit and push `~/claude` to keep the machine rebuild kit up to date.

## 19. Rollback Logging (mandatory for ALL reverts)
Whenever any change is reverted or rolled back — **regardless of method** (git revert, file edit, backup restore, direct overwrite) — always append an entry to `~/claude/ROLLBACKS.md`:
```
## YYYY-MM-DD | <project> | <git hash or "non-git">
**<what was reverted and why>**
Files: <files affected>
```
The git hook (`rollback-logger.sh`) handles `git revert` automatically. For non-git rollbacks (editing a file back, restoring a backup), Claude must write the entry manually. Never skip this — the log exists so the same failed approach is not attempted again.

## 20. GAS Loading Overlay Guard (Google Apps Script projects)

GAS framework-level failures (auth expiry, quota exhaustion, network drop) fire **neither**
`withSuccessHandler` nor `withFailureHandler`. The overlay stays up forever. Script-level
errors DO reach `withFailureHandler` — framework failures are completely silent.

**Rule: Every `showGlobalLoading()` call must be paired with a `_guard` timeout.**

```javascript
showGlobalLoading("Doing something...");
const _guard = setTimeout(() => {
  hideGlobalLoading();
  setStatus("Operation timed out — try again", "status-error");
}, 15000); // 15s read/save | 20s fetchFullConfig | 60s sync ops
google.script.run
  .withSuccessHandler(result => { clearTimeout(_guard); hideGlobalLoading(); /* ... */ })
  .withFailureHandler(err => { clearTimeout(_guard); hideGlobalLoading(); alert(err.message); })
  .yourGasFunction();
```

- `clearTimeout(_guard)` must be the FIRST statement in both handlers
- `hideGlobalLoading()` must immediately follow in modal-open handlers (before DOM ops)
- Callback queues (`fetchQueue`) must also be flushed inside the guard timeout
- Full pattern: `~/.claude/rules/gas.md`

## 21. Modal Button Standard

Every modal header must have an SVG × close button (`.btn-modal-close`) as the rightmost element — never a text "Close" button or Unicode character.

```html
<button class="btn-modal-close" onclick="closeMyModal()" title="Close">
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
    <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  </svg>
</button>
```

Footer layout by modal type:
- **View-only** (help, audit, read-only viewers): no footer — header × only
- **Edit/confirm**: `.modal-actions right-align` — Delete left (`.btn-danger-mono`, hidden) · Cancel · Save
- **Action-only**: `.modal-actions right-align` — action buttons only, no close button needed
- Never duplicate close/cancel across both header AND footer
- Full pattern: `~/.claude/rules/ui.md` (Rule 21)

## 15. Ambiguity
- Before starting any task that touches more than 2–3 files, requires a design decision, or has multiple valid approaches: surface ambiguities and ask before proceeding.
- For small, clear tasks, proceed directly.

## 16. Claude Code Project Anatomy — Full Rule Mapping
Every Claude Code project is composed of these layers. The table below maps every rule to its layer, file, and purpose.

### Layer Reference

| Layer | What it does | Local override |
|---|---|---|
| `CLAUDE.md` | Loaded at session start. Project overview, conventions, architecture, invariants. | `CLAUDE.md.local` |
| `rules/` | Modular `.md` files by topic. Can target specific file paths. | — |
| `settings.json` + `hooks/` | Permissions, tool access, model selection. Pre/post tool-use scripts for validation, linting, deploy, blocking. | `settings.local.json` |
| `commands/` | Custom slash commands (`/project:<name>`). Repeatable workflows with shell execution. | — |
| `mcp.json` | MCP integration configs (GitHub, JIRA, Slack, DBs). Shared via git. | — |
| `skills/` | Auto-triggered by task context. Loads only when needed — keeps context lightweight. | — |
| `agents/` | Sub-agents with isolated context, custom tools, and model preferences. | — |

### Rule → Layer Mapping

| # | Rule | Layer | File |
|---|---|---|---|
| 1 | INSTRUCTIONS + CLAUDE.md discipline | `CLAUDE.md` | `CLAUDE.md` |
| 2 | JetBrains Mono on all UI elements | `rules/` | `rules/ui.md` |
| 3 | UI/UX symmetry | `rules/` | `rules/ui.md` |
| 4 | No modal/overlay out of canvas | `rules/` | `rules/ui.md` |
| 5 | Apply new global rules immediately | `CLAUDE.md` | `CLAUDE.md` |
| 6 | user-select: none on non-editable elements | `rules/` | `rules/ui.md` |
| 7 | All icons must be SVG | `rules/` | `rules/ui.md` |
| 8 | New project structure | `CLAUDE.md` + `commands/` + `hooks/` | `CLAUDE.md`, `commands/deploy.md`, `settings.json` |
| 9 | User feedback + live elapsed-seconds timer | `rules/` + `hooks/` | `rules/quality.md`, `hooks/` |
| 10 | Code quality | `rules/` | `rules/quality.md` |
| 11 | Refactoring (surface, don't act) | `rules/` | `rules/quality.md` |
| 12 | Security boundaries + secrets | `rules/` | `rules/security.md` |
| 13 | Tests — independent, real paths, minimal mocks | `rules/` | `rules/testing.md` |
| 14 | Review — git/local/unmanaged + pre-commit auto-scan | `hooks/` + `commands/` | `hooks/`, `commands/review.md` |
| 15 | Ambiguity — ask before non-trivial tasks | `CLAUDE.md` | `CLAUDE.md` |
| 16 | Claude Code anatomy reference | `CLAUDE.md` | `CLAUDE.md` |
| 17 | Git workflow — every project must be a git repo | `CLAUDE.md` + `hooks/` | `CLAUDE.md`, `settings.json` |
| 18 | Global config auto-sync to settings backup | `hooks/` | `settings.json` (PostToolUse hook) |

When setting up a new project, use this table to decide which layers to configure and which rule files to create.
