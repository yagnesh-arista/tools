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

## 6. user-select: none on UI Chrome Only (Not Visible Text Content)
**Core principle: all visible text must be selectable and copyable by the user. No exceptions.**
Apply `user-select: none; -webkit-user-select: none` to **UI chrome only**: buttons, icon buttons, tabs, modal title bars, badges, status indicators, tags, node titles, tooltips.
- **Do NOT apply to visible text content** — if the user can read it, they can select it. This includes `info-box` text, descriptions, hints, captions, and read-only values shown in the UI.
- **Explicitly set `user-select: text`** on content users clearly need to copy: diffs, configs, EOS commands, IP addresses, generated output.
- **Never apply to `body`** — breaks `execCommand("copy")` in WebKit/Chrome.
- **Never apply to `<input>`, `<textarea>`, `<select>`**.
- For clipboard copy buttons: use `navigator.clipboard.writeText()` with `execCommand` fallback.

## 7. Modal Default Background
All modals must use a white background (`#ffffff`) by default. Dark mode overrides via a `--bg-modal` CSS variable or dark-mode theme selector — never hardcode dark on a modal outside a dark-mode rule. In CSS-variable projects: define `--bg-modal: #ffffff` as the base; override with the dark card color under the dark-mode selector only.

## 7a. All Icons Must Be SVG (Never Unicode)
Use inline SVG for every icon. Unicode characters (▶, ✕, ⚙, etc.) blur at non-integer zoom levels, misalign with text baselines, and render inconsistently across platforms.

## 7b. Debugging — Root Cause Order
Before investigating any failure, rank causes by likelihood and check the simplest first:
1. Auth / credentials / permissions — before PATH or environment issues
2. Data not loaded — before display or rendering logic
3. Platform limitation — before implementing a complex workaround
Never go deep on a secondary hypothesis until the primary is ruled out with a concrete diagnostic check.

## 7d. Skills & Slash Commands — Session Restart Required
After creating, renaming, or moving any file in `~/.claude/commands/` or any project `.claude/commands/`, always tell the user: "Restart the Claude Code session for the new command to become available." Never assume a newly created skill is usable in the current session.

## 7f. UI Layout — Describe Before Editing
For any UI layout change (divider placement, badge position, icon sizing, spacing), describe the exact visual outcome before touching any file: which element, where it sits relative to its siblings, what direction/orientation (horizontal vs vertical, full-height vs partial). Wait for confirmation before editing. If spatial intent is ambiguous, ask ONE clarifying question — never guess.

**For badge / count / status displays** — before implementing, always clarify:
- **Zero values**: shown (display "0") or hidden (display:none)?
- **Count freshness**: live-computed on every state change, or cached from last known?
- **Capping**: maximum display value (e.g. "99+")? What triggers it?

Never assume these three — they are the most common source of badge correction rounds.

## 7g. UI Changes — Visual Verification
After any UI change, describe exactly where to look to verify it: which element, which panel, what state triggers it. Never just say "the code was updated." If a badge, indicator, or warning was added, name the exact container it appears in and what condition makes it visible.

## 7h. Shell Scripts in Skill Files — No Embedded Bash With Variables
Never embed complex bash in `.md` skill files when it contains positional args (`$1`, `$2`) or shell variables — markdown rendering can strip them silently. Extract to a standalone `.sh` file and reference it from the skill instead. After any edit to a bash-containing `.md` file, verify variable expansion is intact.

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

## 11a. Reuse and Enhance — Never Duplicate
Before writing a new function, search for one that already does the same job.
- If found: extend it with an optional `opts` parameter or a new argument — don't write a parallel implementation.
- Make new parameters optional so existing callers are unchanged.
- After enhancing, replace all old call sites with the unified function. Never leave parallel implementations alive.

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
- **Edit/confirm**: `.modal-actions right-align` — Delete left (`.btn-danger-mono`, `margin-right:auto`, hidden) · Cancel · Save
- **Action-only**: `.modal-actions right-align` — action buttons only, no close button needed
- Never duplicate close/cancel across both header AND footer

Button ordering (left → right): `[Delete isolated-left]` ··· `[Cancel] [Primary Action]`
- Primary action always **rightmost**; Cancel always immediately left of it
- Delete always `margin-right: auto; display: none` — never inline with Cancel/Save

**Cancel + dirty-state**: every edit/confirm modal must have a Cancel button (`.btn-mono`) immediately left of Save. The canonical close function (called by X, Cancel, and Esc) must call `_confirmDirtyClose(isDirty, label)` at top when dirty. Capture `initialState` at end of open function (after DOM populated); reset to `''` in save/delete success handlers before calling close. Exception: embedded-save panels (Config Center) use X-only dismiss.

Esc key: every new modal must be added to both `modalOrder` array AND `closeFuncs` map
in the global `keydown` handler — omitting either causes Esc to reset the canvas instead.

Full pattern: `~/.claude/rules/ui.md` (Rule 21)

## 22. Search / Filter Input Height

Browser UA stylesheets inflate `<input>` height beyond what padding implies — a `10px` font with `padding: 3px` renders ~26px in Chromium/WebKit. In compact panels or toolbars this breaks visual symmetry with adjacent icon buttons or list rows.

Every search or filter input in a compact context must pin height explicitly:
```css
height: 20px; padding: 0 7px; line-height: 20px; box-sizing: border-box;
```
- Match `height` to the tallest sibling element in the same row/section
- Never use top/bottom padding as the only height control
- Full-form modal inputs (with labels above) are exempt — use standard `padding: 5px 8px`
- Full pattern: `~/.claude/rules/ui.md` (Rule 22)

## 24. Modal Scroll + Floating Panel Minimize Baseline

Every `.modal-std` modal body must support scrolling when content can exceed 85vh. The body div must have all three:
```css
overflow-y: auto; flex: 1; min-height: 0;
```
GAS iframes do not reliably collapse flex height via child `display:none` — floating panel minimize (DevView, `.modal-floating`) must use JS height-pinning:
```javascript
panel.style.height = header.offsetHeight + 'px';  // minimize
panel.style.overflow = 'hidden';
// restore: clear both inline styles
```
**`.modal-std` minimize = fully hidden + dock chip only.** When `toggleModalMinimize()` collapses a non-floating modal, it must: (1) set `modal.style.display = 'none'` (store the prior display in `data-pre-min-display`); (2) add class `modal-minimized`; (3) call `_updateModalDock()` — which reads `.modal-std.modal-minimized` and renders a clickable chip in `#modalDock` at the bottom of the page. The minimized-header must NOT remain visible anywhere in the layout. Clicking the dock chip calls `toggleModalMinimize(id)` again to restore.

**On restore**: remove `modal-minimized`, restore `modal.style.display` from `data-pre-min-display`, delete the dataset key, call `_updateModalDock()`.

**On close**: every close function (and `closeAllModals`) must call `_onModalClose(el)` before setting `display:none`. `_onModalClose(el)` strips `modal-minimized`, deletes `preMinDisplay`/`hadOverlay` datasets, and calls `_updateModalDock()`. Without this, closing a minimized modal leaves a stale dock chip.

```javascript
function _onModalClose(el) {
  if (!el || !el.classList.contains('modal-minimized')) return;
  el.classList.remove('modal-minimized');
  delete el.dataset.preMinDisplay;
  delete el.dataset.hadOverlay;
  _updateModalDock();
}
```

**Overlay rule**: `toggleModalMinimize()` must hide `editOverlay` on minimize and restore it on un-minimize using `data-had-overlay` to remember whether the overlay was visible before. Never write a modal-specific minimize that bypasses this. Modals opened with overlay (configModal, generateAllModal, editModal, pushConfirmModal) would otherwise leave the dim backdrop blocking all background interaction.

**`.modal-floating` exception**: floating panels (deviceBridgeModal, DevView) stay visible as a collapsed header when minimized — they do NOT use `display:none`. `toggleModalMinimize` checks `modal.classList.contains('modal-floating')` and skips the hide logic for floating panels. Floating panels also do NOT appear in `#modalDock`.

Full pattern: `~/.claude/rules/ui.md` (Rule 24)

## 25. Minimize Button Position Standard

Every modal minimize button (`.btn-modal-minimize`) must sit **immediately to the left of** `.btn-modal-close`, forming an adjacent `[−][×]` pair flush at the modal header's right edge.

**Auto-injection (never hand-write in HTML):** `_injectMinimizeButtons()` runs at `initApp()` time and inserts the button into every `.modal-std` and `.modal-floating` header that lacks one, using `insertBefore(btn, closeBtn)`. Never manually place a `<button class="btn-modal-minimize">` in HTML — the injector handles it.

```javascript
// _injectMinimizeButtons() — runs once at initApp()
document.querySelectorAll('.modal-std .modal-header, .modal-floating .modal-header').forEach(hdr => {
  if (hdr.querySelector('.btn-modal-minimize')) return; // already present
  const closeBtn = hdr.querySelector('.btn-modal-close');
  if (!closeBtn) return;
  const btn = document.createElement('button');
  btn.className = 'btn-modal-minimize';
  // ... SVG + click handler
  hdr.insertBefore(btn, closeBtn); // ← always immediately before ×
});
```

**CSS positioning:** `.btn-modal-minimize { margin-left: auto; }` pushes the `[−][×]` pair to the far-right of the header. Any header title/label must sit to the left (natural flow) — never use `margin-left: auto` on the title.

**Checklist for every new modal:**
- [ ] Do NOT add `<button class="btn-modal-minimize">` in HTML — the injector adds it
- [ ] Verify `_injectMinimizeButtons()` is called at `initApp()`
- [ ] `.btn-modal-minimize { margin-left: auto }` is in Sidebar-css.html
- [ ] The `[−]` button is always the leftmost of the `[−][×]` pair (never `[×][−]`)

Full pattern: `~/.claude/rules/ui.md` (Rule 25)

## 23. Memory Tiering — Never Duplicate Tier 1 in Memory

The knowledge system has three tiers:
- **Tier 1** (always loaded every session): `~/claude/CLAUDE.md` + `~/.claude/rules/*.md` + project `CLAUDE.md`
- **Tier 2** (on recall only): `memory/*.md` files
- **Tier 3** (on demand): `INSTRUCTIONS_<project>.txt`

**Before writing a memory file — mandatory duplicate check:**
1. Search CLAUDE.md (global + project) and all `rules/*.md` for the same topic. If found → do NOT write; Tier 1 already fires every session.
2. Search existing `memory/*.md` files for overlapping content. If found → update the existing file; never create a parallel one.
3. If genuinely new and Tier 2 appropriate: state the one-line summary to the user and ask "Add this to memory?" before writing.

**"Missing from memory" ≠ undocumented** — check Tier 1 first. If it's there, it's correctly in Tier 1.

Memory belongs in Tier 2 only when it is contextual, historical, or project-specific — not a universal coding rule. When a Tier 2 feedback item proves universally applicable, promote it to Tier 1 (CLAUDE.md rule or rules/*.md entry) and delete the memory file.

## 15. Ambiguity
- Before starting any task that touches more than 2–3 files, requires a design decision, or has multiple valid approaches: surface ambiguities and ask before proceeding.
- For small, clear tasks, proceed directly.

## 32. Multi-File Rename / Refactor — Search First, Summary After

### Before editing: grep ALL references
Before touching any file, grep the entire codebase for every form of the old name (camelCase, snake_case, kebab-case, string literal, HTML id/attribute, CSS selector). Present the complete hit list to the user before making any edit:

```bash
grep -rn "oldName\|old_name\|old-name" ~/claude/projects/<project>/
```

Never start editing until the full reference map is known — missed references are the primary source of post-rename follow-up fixes.

### After editing: produce a completion summary table
After all changes are applied, produce a summary table before committing:

| Old Name | New Name | File | Line | Status |
|---|---|---|---|---|
| `old_func` | `new_func` | `Sidebar-js.html` | 412 | ✓ done |

Then run a final grep for the old name to confirm zero remaining references. Never skip either step for schema-level renames (column names, function names, element IDs, CSS selectors).

## 33. Task List for Multi-Task Sessions
When a session has 3 or more distinct tasks, create a `TaskCreate` list at the start before beginning any work. This serves two purposes: (1) the task list survives context compaction and budget-ceiling interruptions — the next session can resume from concrete items rather than reconstructing state from a summary; (2) it forces scope clarity upfront before committing to an ordering.

**Rule**: at session start with 3+ tasks → create all tasks first, then work through them in dependency order, marking each `completed` as done. If the session hits budget mid-run, the surviving task list is the handoff.

**Exception**: if the user gives a single compound request mid-session ("also fix X"), add a new task inline — don't wait to batch.

## 34. Parallel Agents for Independent File Groups
When a refactor, review, or fix touches clearly independent files or subsystems, spawn parallel `Agent` subagents rather than doing the work serially. This keeps the main context window lean and cuts wall-clock time.

**When to parallelize:**
- Multi-file rename where files share no runtime dependency (e.g. CSS + Python tests)
- Review passes over separate subsystems (e.g. Code.gs logic vs. Sidebar-js.html UI)
- Fetch/research tasks where results don't depend on each other

**When NOT to parallelize:**
- One file's change determines what to write in another (sequential dependency)
- The combined context of both is needed to make the right decision
- Total scope is small enough that subagent overhead exceeds the benefit (< 3 files, < 2 min)

Always send parallel subagents in a single message (multiple Agent tool calls in one turn).

## 36. Infrastructure Debugging — Credentials Before PATH
When any CLI tool fails (command not found, permission denied, unexpected exit, auth error): check credentials and auth status FIRST — before investigating PATH, environment variables, or shell config.

**Order of investigation:**
1. Is the tool authenticated? (`clasp status`, `gcloud auth list`, token expiry, etc.)
2. Is the binary present? (`which <tool>`, `command -v`)
3. Only then: PATH, shell env, version mismatches

**Why this order matters:** PATH issues are visible immediately (`command not found`); auth failures often masquerade as generic errors. Spending time on PATH when credentials are expired wastes entire sessions.

## 35. UI Fix Verification
After implementing any UI change, explicitly state the expected visual outcome before marking the task done:
- Describe what the user will see (element placement, visibility, zero-state behavior, exact text)
- If the result can't be rendered locally, enumerate the visible states and flag the ones that can't be verified

**Never assume a code change produces the correct visual result without confirmation.** Mismatches in placement, visibility at edge states (empty, zero, disabled), and sizing are common and often require 2–3 correction rounds when left unverified. Always close the loop before moving on.

## 37. Debugging — Test-First Bug Fix
For any bug in a file that has a test suite (device_bridge.py, Code.gs, Sidebar-js.html closures):
1. Write a failing test that reproduces the exact bug FIRST
2. Fix the production code until the test passes
3. Run the full suite to check for regressions

**Never fix a bug in a tested file without a corresponding new test case.** The test is proof that the bug existed and proof that the fix works — without it, the same bug can silently regress.

**Exception**: trivial one-liner typos (wrong string literal, off-by-one in a constant) where the fix is self-evident and a test would add no diagnostic value. In all other cases, test first.

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
| 23 | Memory tiering — Tier 2 never duplicates Tier 1 | `CLAUDE.md` | `CLAUDE.md` |
| 7b | Debugging — root cause order (auth/credentials first) | `CLAUDE.md` | `CLAUDE.md` |
| 7d | Skills/commands — session restart required after create/rename | `CLAUDE.md` | `CLAUDE.md` |
| 7f | UI layout — describe before editing + badge/count clarification | `CLAUDE.md` | `CLAUDE.md` |
| 7g | UI changes — visual verification before reporting done | `CLAUDE.md` | `CLAUDE.md` |
| 7h | Shell scripts in skills — no embedded bash with variables | `CLAUDE.md` | `CLAUDE.md` |
| 32 | Multi-file rename — search all refs first, summary table after | `CLAUDE.md` | `CLAUDE.md` |
| 33 | Task list for multi-task sessions (3+) | `CLAUDE.md` | `CLAUDE.md` |
| 34 | Parallel agents for independent file groups | `CLAUDE.md` | `CLAUDE.md` |
| 37 | Debugging — test-first bug fix for tested files | `CLAUDE.md` | `CLAUDE.md` |

When setting up a new project, use this table to decide which layers to configure and which rule files to create.
