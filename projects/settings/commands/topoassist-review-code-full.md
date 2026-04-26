Run the complete TopoAssist review: TopoAssist-specific checks first, then the global review.
Report each check with ✓ / ✗ / ⚠. Any ✗ is a blocker. Cite file and line for every finding.

---

# Part 1 — TopoAssist-Specific Checks

## Check 1 — JetBrains Mono (CLAUDE.md Rule 2)

Every UI element must explicitly set `font-family: 'JetBrains Mono', monospace`.
Do NOT rely on inheritance — it does not work in GAS dialogs.

Scan Sidebar-js.html and Sidebar-css.html for:
- Buttons, inputs, labels, badges, dropdowns, modals, tooltips, status bars, textareas
- Any element rendered in the UI that does NOT have an explicit `font-family` setting

✗ FAIL for each element missing explicit font — cite the element and line.

---

## Check 2 — SVG Icons Only (CLAUDE.md Rule 7)

No Unicode characters used as icons (▶ ✕ ⚙ ← → ✓ ✗ etc.).

Scan for Unicode icon characters in:
- Button labels, tooltips, status text, badge text, any innerHTML
- JS strings that render into the DOM

✗ FAIL for each Unicode icon found — cite file and line.
Note: Unicode in comments or non-rendered strings is fine.

---

## Check 3 — user-select: none (CLAUDE.md Rule 6)

Non-editable UI elements must have `user-select: none; -webkit-user-select: none`.

Rules:
- NEVER apply to `body` — breaks `execCommand("copy")` in WebKit/Chrome
- NEVER apply to `<input>`, `<textarea>`, `<select>`
- Read-only content the user might want to copy (diff output, config text) should remain selectable
- All clipboard copy must use `navigator.clipboard.writeText()` with `execCommand` fallback

✗ FAIL if `user-select: none` is on `body`
✗ FAIL if `user-select: none` is on an input/textarea/select
✗ FAIL if a non-editable label/badge/header/card has no `user-select: none`
✗ FAIL if clipboard copy uses `execCommand` without the `navigator.clipboard` primary path

---

## Check 4 — Canvas Bounds (CLAUDE.md Rule 4)

Every modal, tooltip, dropdown, overlay, and floating panel must stay fully within
viewport bounds — including after window resize and drag.

Check for:
- Modals/overlays that set `position: fixed` or `position: absolute` — do they clamp to viewport?
- Drag handlers — do they clamp `x`/`y` to `[0, viewportW - elW]` / `[0, viewportH - elH]`?
- Tooltips/dropdowns that position relative to a clicked element — do they flip or clamp near edges?

✗ FAIL if any positioned element can overflow the viewport with no clamping logic.

---

## Check 5 — UI/UX Symmetry (CLAUDE.md Rule 3)

Spacing, alignment, sizing, padding, and interactions must be consistent.

Check for:
- Button rows where buttons have different heights, font sizes, or padding
- Modals with asymmetric left/right padding
- Inconsistent gap between similar elements across different sections

⚠ WARN for minor inconsistencies; ✗ FAIL for obviously broken symmetry.

---

## Check 6 — VERSION Sync

device_bridge.py VERSION must match the embedded template in `downloadBridgeScript()` in Sidebar-js.html.

```bash
grep "^VERSION" ~/claude/projects/topoassist/device_bridge.py
grep 'VERSION = ' ~/claude/projects/topoassist/Sidebar-js.html
```

Also check /health docstring in device_bridge.py matches VERSION.

✗ FAIL if any of the three are out of sync — cite the mismatched values.

---

## Check 7 — canonicalizeInterface Sync

Both copies must be in sync. Check the `// DUPLICATED ... last synced:` comment date.

✗ FAIL if the two implementations differ in logic (not just whitespace).
⚠ WARN if the `last synced` date is stale (older than the most recent edit to either file).

---

## Check 8 — INSTRUCTIONS_topoassist.txt Updated

✗ FAIL if "Last updated" date in INSTRUCTIONS_topoassist.txt does not match today's date
after any code change was made this session.

---

## Check 9 — Modal Button Standard (CLAUDE.md Rule 21)

Scan every `<div id="*Modal"` in Sidebar.html and every modal created in Sidebar-js.html.

### 9a — Exactly one header close button
- Every modal must have exactly one `.btn-modal-close` with the standard SVG × path:
  `M1 1l10 10M11 1L1 11`
- ✗ FAIL if a modal has zero `.btn-modal-close` buttons
- ✗ FAIL if a modal has more than one `.btn-modal-close` button

### 9b — No duplicate Close in footer
- Footer must NEVER contain a "Close" button — that duplicates the header ×
- Allowed footer patterns by modal type:
  - **Edit/confirm**: `[Delete isolated-left]` · `[Cancel]` · `[Primary Action]`
  - **Action-only**: action buttons only (Enable All, Disable All, etc.) — no close
  - **View-only**: no footer at all — header × only
- ✗ FAIL if any footer button is labeled "Close" — rename to "Cancel" (edit/confirm) or remove (action-only/view-only)

### 9c — No Unicode ✕ or text "Close" in header
- ✗ FAIL if header uses text "Close" or Unicode ✕ instead of `.btn-modal-close` SVG

### 9d — Esc key registration
- Every modal must appear in both `modalOrder` array AND `closeFuncs` map in the global keydown handler
- ✗ FAIL if a modal is missing from either list

```bash
grep -n "btn-modal-close\|>Close<\|>Cancel<" ~/claude/projects/topoassist/Sidebar.html
grep -n "modalOrder\|closeFuncs" ~/claude/projects/topoassist/Sidebar-js.html | head -20
```

---

# Part 2 — Global Review

## Step 1 — Detect Scope

Determine what to review:
- If invoked on a commit: review that commit's diff
- If invoked with staged changes: review `git diff --cached`
- If invoked on a file/directory: review that file/directory
- If no context: review all recently changed files in the project

Detect project type:
```bash
git rev-parse --git-dir 2>/dev/null
```
- Returns path → **Git Mode**
- Fails + path under `~/claude/projects/` → **Local Mode**
- Fails elsewhere → **Minimal Mode**

---

## Check A — Scope & Hygiene

### A1. Unrelated Changes
- ✗ FAIL if changes include modifications outside the stated task scope
- ⚠ WARN if unstaged files exist that are unrelated to this task

### A2. Secrets & Credentials
- Scan for: hardcoded tokens, API keys, passwords, private keys, connection strings, IPs/hostnames that look like real infra
- ✗ FAIL if any found — list exact file and line

### A3. Debug Artifacts
- Scan for: `console.log`, `print(`, `debugger`, `pdb.set_trace`, `breakpoint()`, commented-out code blocks, unresolved `TODO`/`FIXME` in changed lines
- ✗ FAIL if any found — list exact file and line

---

## Check B — Correctness & Bugs

### B1. Logic Bugs
- Read changed code carefully for: off-by-one errors, null/undefined dereference, wrong variable used, race conditions, missing error handling at system boundaries (user input, external APIs, env vars)
- ✗ FAIL for each confirmed bug — describe the failure mode

### B2. Security
- New input from users, APIs, or env vars must be validated/escaped before use
- ✗ FAIL if new input is unvalidated — SQL injection, XSS, command injection, path traversal

### B3. Error Handling
- Only validate at real boundaries — do not add defensive fallbacks for things that cannot happen
- ✗ FAIL if error handling is missing at a real boundary
- ✗ FAIL if speculative error handling was added for impossible cases (over-engineering)

---

## Check C — Design Quality

### C1. Over-Engineering
Look for: unnecessary abstractions, premature generalization, unneeded configurability, fallbacks
for scenarios that cannot happen, wrappers around single calls, indirection with no benefit.
- ✗ FAIL if found — explain what could be removed and why

### C2. Under-Engineering
Look for: copy-pasted logic (3+ similar blocks without abstraction), hardcoded values that will
obviously need to change, hacks that work now but will break under predictable conditions,
missing abstractions that make the code hard to reason about.
- ✗ FAIL if found — explain what should be abstracted and why

### C3. Elegance & Best Practices
- Does new code match the conventions and patterns already in the codebase?
- Are names clear and consistent?
- Is the logic as simple as it could be for what it does?
- ⚠ WARN for style issues; ✗ FAIL for practices that will cause maintainability problems

### C4. Refactoring Opportunities
- Identify any code (not just changed lines) that could be meaningfully simplified
- Only flag real improvements — not cosmetic or speculative ones
- Report as ⚠ (not blockers) with a concrete description of the simplification

---

## Check D — Tests

### D1. Coverage
- Identify changed production code with critical behavior
- ✗ FAIL if critical behavior was changed or added with no corresponding test

### D2. Test Quality
- Tests must test real production code, not reimplementations
- Mocks must be minimal — only mock things you cannot control (network, filesystem, time)
- ✗ FAIL if tests mock internal logic instead of external dependencies
- ✗ FAIL if tests duplicate each other (same behavior tested multiple times with no variation)
- ✗ FAIL if tests only test the mock, not the code under test

---

## Check E — Project Sync

### E1. INSTRUCTIONS sync
- ✗ FAIL if `INSTRUCTIONS_topoassist.txt` was not updated after code changes
- Check "Last updated" date matches today

### E2. Backup Check
- ⚠ WARN if no recent backup exists for changed files

---

# Output Format

```
TOPOASSIST FULL REVIEW
======================
Scope  : [commit abc1234 / staged changes / project-wide]
Mode   : [Git / Local]

── Part 1: TopoAssist ──────────────────
1 — JetBrains Mono        ✓ / ✗ / ⚠
2 — SVG Icons             ✓ / ✗ / ⚠
3 — user-select           ✓ / ✗ / ⚠
4 — Canvas Bounds         ✓ / ✗ / ⚠
5 — UI/UX Symmetry        ✓ / ✗ / ⚠
6 — VERSION Sync          ✓ / ✗ / ⚠
7 — canonicalizeInterface ✓ / ✗ / ⚠
8 — INSTRUCTIONS Updated  ✓ / ✗ / ⚠

── Part 2: Global ──────────────────────
A — Scope & Hygiene       ✓ / ✗ / ⚠
B — Correctness & Bugs    ✓ / ✗ / ⚠
C — Design Quality        ✓ / ✗ / ⚠
D — Tests                 ✓ / ✗ / ⚠
E — Project Sync          ✓ / ✗ / ⚠

─────────────────────────────────────
Status: BLOCKED — N failures must be resolved before proceeding.
        (or: CLEAN — ready to ship.)
```
