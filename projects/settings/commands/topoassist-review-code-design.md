<!-- rules-synced: 2026-04-23 (Rule 24 updated: minimize must hide editOverlay via data-had-overlay) -->
Run a TopoAssist-specific compliance review across Sidebar-js.html, Sidebar-css.html,
Code.gs, and any other UI-bearing or logic files edited this session.
Report each check with ✓ / ✗ / ⚠. Any ✗ is a blocker. Cite file and line for every finding.

---

## Check 0 — Rules Currency

Verify this review command is in sync with the current global UI rules.

```bash
# Date this file was last updated
grep "rules-synced:" ~/.claude/commands/topoassist-review-code-design.md

# Date ui.md was last changed (git)
git -C ~/claude log -1 --format="%as" -- projects/settings/rules/ui.md

# Date CLAUDE.md was last changed
git -C ~/claude log -1 --format="%as" -- CLAUDE.md
```

⚠ WARN if `rules-synced` date is older than the last git change to `ui.md` or `CLAUDE.md` —
  the review may be missing checks for recently added rules.
✗ FAIL if the dates differ by more than 7 days — cite the delta and which rules file is newer.

---

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

Both copies (Code.gs + Sidebar-js.html) must be in sync.
Check the `// DUPLICATED ... last synced:` comment date.

✗ FAIL if the two implementations differ in logic (not just whitespace).
⚠ WARN if the `last synced` date is stale (older than the most recent edit to either file).

---

## Check 8 — INSTRUCTIONS_topoassist.txt Updated

✗ FAIL if "Last updated" date in INSTRUCTIONS_topoassist.txt does not match today's date
after any code change was made this session.

---

## Check 9 — generateConfig() Param Count

Grep for `generateConfig(` in Code.gs. Every call site must pass exactly 5 arguments:
`(portName, d, ipPrefs, seenPos, netSettings)`. Omitting the 5th silently drops all
protocol-family-gated commands.

✗ FAIL if any call site has fewer than 5 arguments — cite file and line.

---

## Check 10 — hasKey() vs .has()

Grep for `.has(` in Code.gs. Flag any usage where the Set/Map contains device names —
those must use `hasKey()` instead. Device names in Sets are lowercase; sheet names are
original-cased — `.has()` will silently miss them.

✗ FAIL for each `.has(` on a device-name Set that should be `hasKey()` — cite line.

---

## Check 11 — MLAG Explicit Only

Grep Code.gs for any `>= 4` threshold checks or `poGlobalCount` logic that might
re-introduce the old heuristic. MLAG pairs must be declared exclusively via
`DEVICE_MLAG_PEERS` in DocumentProperties — no count-based detection.

✗ FAIL if any count-based MLAG heuristic is found — cite file and line.

---

## Check 12 — info-box--dim (Rule 7b)

Static reference panels (hints, examples, formula keys, auto-derived values) must use
`info-box info-box--dim`. Verify the CSS definitions are intact.

```bash
grep -n "info-box--dim" ~/claude/projects/topoassist/Sidebar-css.html | head -20
```

Check that Sidebar-css.html contains ALL of:
- `.info-box.info-box--dim` rule with `border: none; border-left: 3px solid var(--border); border-radius: 0`
- `.info-box--dim` rule with `font-style: italic`
- `.info-box--dim .ip-label` with `color: #94a3b8`
- `.info-box--dim .input-wrapper label` with `color: #94a3b8`
- `.info-box--dim .input-wrapper input` with `background: var(--bg-body); font-style: italic; font-weight: 400`
- `.info-box--dim .input-wrapper input::placeholder` with `color: #94a3b8; font-style: italic`

✗ FAIL if any of the six sub-rules above is missing — cite which one.

---

## Check 13 — Input State Taxonomy (Rule 7c)

Sidebar-css.html must define all input states for `.input-wrapper`:

```bash
grep -n "has-error\|error-msg\|:disabled\|:read-only\|input-affix\|input:focus" \
  ~/claude/projects/topoassist/Sidebar-css.html
```

Required:
- `.input-wrapper.has-error input` — red border (`#ef4444`)
- `.input-wrapper .error-msg` — `color: #ef4444; font-size: 11px`
- `.input-wrapper input:disabled` — muted color, `cursor: not-allowed`, `opacity: 0.6`
- `.input-wrapper input:read-only` — `user-select: text`
- `.input-affix` — `color: #94a3b8; user-select: none`
- `.input-wrapper input:focus` — `border-color: #3b82f6`

✗ FAIL for each missing state rule — cite which one.

---

## Check 14 — Font Scale (Rule 7d)

Only five font sizes are allowed: 10px, 11px, 12px, 13px, 14px.

```bash
grep -oP 'font-size:\s*\K[\d.]+px' ~/claude/projects/topoassist/Sidebar-css.html \
  | sort -u | grep -vE '^(10|11|12|13|14)px$'
grep -oP "font-size['\"]?\s*:\s*['\"]?\K[\d.]+px" ~/claude/projects/topoassist/Sidebar-js.html \
  | sort -u | grep -vE '^(10|11|12|13|14)px$'
```

⚠ WARN for each value outside the scale — cite file and approximate usage.
✗ FAIL if values below 10px are found.

---

## Check 15 — Textarea Resize (Rule 7e)

Every `<textarea>` in Sidebar.html must have an explicit `resize` property set
(either in CSS or inline style). Never leave as browser default.

```bash
grep -n "<textarea" ~/claude/projects/topoassist/Sidebar.html
grep -n "textarea" ~/claude/projects/topoassist/Sidebar-css.html | grep "resize"
grep -n "resize" ~/claude/projects/topoassist/Sidebar-js.html | grep -i "textarea\|style"
```

Also verify each textarea has `::placeholder` styled and `font-family` explicit.

✗ FAIL for each textarea with no `resize` property — cite element and line.
✗ FAIL for each textarea missing explicit `font-family`.

---

## Check 16 — Inline Code Font (Rule 7f)

Every `<code>` element rendered in the UI must have explicit
`font-family: 'JetBrains Mono', monospace`. Browser default for `<code>` is serif mono.

```bash
grep -c "font-family.*JetBrains" ~/claude/projects/topoassist/Sidebar-css.html
grep -n "^  code," ~/claude/projects/topoassist/Sidebar-css.html
```

Check Sidebar-css.html defines a `code, .inline-code` rule with:
- `font-family: 'JetBrains Mono', monospace`
- `user-select: text` (inline code is always copyable)

✗ FAIL if no `code` CSS rule exists with explicit `font-family`.
⚠ WARN if `<code>` elements appear in Sidebar.html/js without a CSS rule covering them.

---

## Check 17 — GAS Loading Overlay Guard (Rule 20)

Every `showGlobalLoading()` call in Sidebar-js.html must be paired with a `_guard` timeout.
GAS framework-level failures (auth expiry, quota, network drop) fire no handler — without a
guard the overlay stays up forever.

```bash
grep -n "showGlobalLoading\|showModalLoading\|_guard\|clearTimeout(_guard)" \
  ~/claude/projects/topoassist/Sidebar-js.html | head -60
```

For each call site that shows `showGlobalLoading` or `showModalLoading`:
- `_guard = setTimeout(hideGlobalLoading + setStatus, N)` must appear before `.run`
- `clearTimeout(_guard)` must be the FIRST statement in `withSuccessHandler`
- `clearTimeout(_guard)` must be the FIRST statement in `withFailureHandler`
- `hideGlobalLoading()` must be called in BOTH handlers
- For modal-open handlers: `hideGlobalLoading()` must come before any DOM assignments
- For callback-queue callers (`fetchFullConfig`): `_guard` must flush the queue on timeout

Timeout values: 15s for read/save ops, 20s for `fetchFullConfig`, 60s for sync/schema ops.

Exempt: `saveSchemaChanges()` uses `schemaLockTimer` (30s `clearInterval`+`hideGlobalLoading`) — this is the approved alternative pattern.

✗ FAIL for each `showGlobalLoading()` site missing a `_guard` timeout.
✗ FAIL if `clearTimeout(_guard)` is NOT the first statement in a handler.
✗ FAIL if `hideGlobalLoading()` is missing from either handler.
✗ FAIL if a modal-open handler calls `hideGlobalLoading()` after DOM field assignments.

---

## Check 18 — Modal Button Standard (Rule 21)

Every modal in Sidebar.html must follow the standard:

```bash
# All modal header close buttons should use btn-modal-close (SVG ×), never btn-mono text "Close"
grep -n 'class="btn-mono">Close\|class="btn-mono">Cancel' \
  ~/claude/projects/topoassist/Sidebar.html | grep -v "footer\|modal-actions" | head -20

# Count btn-modal-close occurrences (expect 16 — one per modal)
grep -c "btn-modal-close" ~/claude/projects/topoassist/Sidebar.html

# Check .btn-modal-close CSS exists in Sidebar-css.html
grep -c "btn-modal-close" ~/claude/projects/topoassist/Sidebar-css.html

# View-only modals must NOT have a modal-actions footer
# (helpModal, auditModal, cablingModal, generateAllModal, configModal)
grep -A5 'id="helpModal"\|id="auditModal"\|id="cablingModal"\|id="generateAllModal"' \
  ~/claude/projects/topoassist/Sidebar.html | grep "modal-actions"
```

For each modal:
- Header must have exactly one `.btn-modal-close` SVG × button as the **rightmost** element
- View-only modals (help, audit, cabling, generateAll, configModal) must have **no** `.modal-actions` footer
- Edit/confirm modals must use `.modal-actions right-align`
- No text "Close" or "Cancel" button in the header (SVG × replaces these)
- No duplicate close/cancel across both header AND footer
- `.btn-modal-close` must be in the no-select list in Sidebar-css.html

```bash
# Verify Esc LIFO list covers all modals (expect 16 entries)
grep "const modalOrder" ~/claude/projects/topoassist/Sidebar-js.html

# Verify button ordering in edit/confirm footers: Delete left, Cancel, Primary right
grep -B2 -A5 'btn-danger-mono.*margin-right:auto' ~/claude/projects/topoassist/Sidebar.html
```

✗ FAIL if any modal header still uses a text "Close" button (`.btn-mono`) instead of `.btn-modal-close`
✗ FAIL if any modal header is missing a close button entirely
✗ FAIL if `.btn-modal-close` CSS class is missing from Sidebar-css.html
✗ FAIL if the same dismiss action appears in both header AND footer as labeled buttons
✗ FAIL if a new modal ID is missing from `modalOrder` or `closeFuncs` in the Esc handler
✗ FAIL if a Delete button is not isolated left with `margin-right: auto` (i.e. inline with Cancel/Save)
✗ FAIL if the primary action button is not the rightmost in its footer
⚠ WARN if a view-only modal has a `.modal-actions` footer with only a Close/status element

---

## Check 20 — Reuse and Enhance (Rule 11a)

When reviewing code added this session, flag any new function that duplicates logic already
present in the codebase.

```bash
# Look for near-duplicate drag handlers, modal openers, loader patterns, etc.
grep -n "addEventListener.*mousedown\|function.*[Dd]rag\|function.*[Mm]odal" \
  ~/claude/projects/topoassist/Sidebar-js.html | head -30
```

For each new function added:
- Does an existing function already do the same job?
- If yes: was it extended with opts/params, or was a parallel copy written?
- Are all old call sites updated to use the enhanced version?
- Are there any dead/unreachable old implementations left behind?

✗ FAIL if a new function duplicates logic from an existing one without consolidating
✗ FAIL if old call sites still reference a replaced implementation
⚠ WARN if two functions have >80% similar structure — flag as a consolidation candidate

---

## Check 19 — Search / Filter Input Height (Rule 22)

Every search or filter input in a compact context (panel, toolbar, list) must have explicit height — never rely on browser UA default (~26px).

```bash
# Find compact search/filter inputs — they should NOT have top/bottom padding without height
grep -n "search-inp\|filter-inp\|search.*input\|input.*search" \
  ~/claude/projects/topoassist/Sidebar-css.html | head -20

# Confirm explicit height is set (not just padding)
grep -A10 "dev-vis-search-inp\|search-inp" \
  ~/claude/projects/topoassist/Sidebar-css.html | grep -E "height|padding|line-height"
```

Required pattern for compact inputs:
```css
height: 20px;          /* explicit — never rely on browser UA */
padding: 0 7px;        /* horizontal only */
line-height: 20px;
box-sizing: border-box;
```

✗ FAIL if a compact search/filter input has top/bottom padding but no explicit `height`
✗ FAIL if `box-sizing: border-box` is missing when `height` is set
⚠ WARN if input height visually exceeds adjacent icon buttons or list row heights

---

## Check 21 — Modal Scroll + Floating Panel Minimize Baseline (Rule 24)

Every `.modal-std` modal body must scroll when content overflows, and every floating panel minimize must use JS height-pinning.

```bash
# Find modal-std modals — check each body div for overflow-y/flex/min-height
grep -n "class=\"modal-std\|id=\".*[Mm]odal" \
  ~/claude/projects/topoassist/Sidebar.html | head -30

# Check tech modal body specifically
grep -n "padding: 18px 22px" \
  ~/claude/projects/topoassist/Sidebar.html

# Check floating panel minimize uses height-pinning (not CSS-only)
grep -A10 "toggleDevVisMinimize" \
  ~/claude/projects/topoassist/Sidebar-js.html | grep -E "style.height|style.overflow"

# Check toggleModalMinimize for modal-minimized CSS class approach (correct for .modal-std)
grep -A5 "function toggleModalMinimize" \
  ~/claude/projects/topoassist/Sidebar-js.html | head -10
```

```bash
# Check overlay management in toggleModalMinimize
grep -A20 "function toggleModalMinimize" \
  ~/claude/projects/topoassist/Sidebar-js.html | grep -E "editOverlay|hadOverlay|data-had"
```

✗ FAIL if a `.modal-std` body div lacks `overflow-y: auto` AND content can exceed 85vh
✗ FAIL if a floating panel minimize function sets child `display:none` but does NOT also set `panel.style.height = header.offsetHeight + 'px'`
✗ FAIL if `panel.style.overflow = 'hidden'` is missing from the minimize path
✗ FAIL if `toggleModalMinimize` does not hide `editOverlay` on minimize (leaves dim backdrop blocking background)
✗ FAIL if `toggleModalMinimize` does not use `data-had-overlay` to restore overlay on un-minimize
✗ FAIL if a modal-specific minimize function bypasses `toggleModalMinimize` (loses overlay management)
⚠ WARN if body div has `overflow-y: auto` but no `flex: 1; min-height: 0` (clips in flex containers)

---

## Output Format

```
TOPOASSIST CODE REVIEW
======================
 1 — JetBrains Mono        ✓ / ✗ / ⚠
 2 — SVG Icons             ✓ / ✗ / ⚠
 3 — user-select           ✓ / ✗ / ⚠
 4 — Canvas Bounds         ✓ / ✗ / ⚠
 5 — UI/UX Symmetry        ✓ / ✗ / ⚠
 6 — VERSION Sync          ✓ / ✗ / ⚠
 7 — canonicalizeInterface ✓ / ✗ / ⚠
 8 — INSTRUCTIONS Updated  ✓ / ✗ / ⚠
 9 — generateConfig params ✓ / ✗ / ⚠
10 — hasKey() usage        ✓ / ✗ / ⚠
11 — MLAG explicit only    ✓ / ✗ / ⚠
12 — info-box--dim CSS     ✓ / ✗ / ⚠
13 — Input state taxonomy  ✓ / ✗ / ⚠
14 — Font scale            ✓ / ✗ / ⚠
15 — Textarea resize       ✓ / ✗ / ⚠
16 — Inline code font      ✓ / ✗ / ⚠
17 — GAS loading guard     ✓ / ✗ / ⚠
18 — Modal button standard ✓ / ✗ / ⚠

─────────────────────────────────────
Status: BLOCKED — N failures must be resolved before proceeding.
        (or: CLEAN — ready to ship.)
```
