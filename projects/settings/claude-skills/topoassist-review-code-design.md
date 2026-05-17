<!-- rules-synced: 2026-05-17 (Check 32 extended: dynamic Cancel label "Close"/"Abort *" via _updateCancelBtn; Check 42 extended: _updateCancelBtn added to SSoT helpers list) -->
Run a TopoAssist-specific compliance review across Sidebar-js.html, Sidebar-css.html,
Code.gs, and any other UI-bearing or logic files edited this session.
Report each check with ✓ / ✗ / ⚠. Any ✗ is a blocker. Cite file and line for every finding.

---

## Step 0 — Load Design Memory

Before running any checks, read ALL TopoAssist design-relevant memory files. These carry
established UI/UX patterns and feedback from past sessions — treat any pattern found as an
additional implicit check for this session's changes.

```bash
ls ~/.claude/projects/-home-yagnesh-claude/memory/feedback_topoassist_*.md 2>/dev/null
```

Read each file listed. Design-relevant entries include (but are not limited to):
- `feedback_topoassist_change_indicators.md` — was-spans, .changed selects, .modified-highlight
- `feedback_topoassist_editor_light_mode.md` — config editor textarea colors (always light mode)
- `feedback_topoassist_strip_dividers.md` — non-EOS strip divider/button parity rules
- `feedback_topoassist_view_terminology.md` — DevVis / SheetVis / SheetViewMenu taxonomy

For each memory pattern: if new code added this session violates it, report ✗ FAIL with the
memory file as the source. Patterns already caught by static checks below need not be re-reported.

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

## Check 3 — user-select (CLAUDE.md Rule 6)

`user-select: none` applies to UI chrome only — NOT to visible text content.

UI chrome (must have `user-select: none`):
- Buttons, icon buttons, tabs, nav items
- Modal title bars, section headers, badges, status indicators, tags, node titles
- Tooltips that are purely decorative labels

Visible text content (must remain selectable — no `user-select: none`):
- `info-box` / `info-box--dim` text, descriptions, hints, captions
- Read-only values displayed in the UI

Explicitly `user-select: text`:
- Diffs, configs, EOS commands, IP addresses, generated output

Hard rules:
- NEVER apply to `body` — breaks `execCommand("copy")` in WebKit/Chrome
- NEVER apply to `<input>`, `<textarea>`, `<select>`
- Clipboard copy buttons must use `navigator.clipboard.writeText()` with `execCommand` fallback

✗ FAIL if `user-select: none` is on `body`
✗ FAIL if `user-select: none` is on an input/textarea/select
✗ FAIL if `user-select: none` is on an info-box, description, hint, or read-only value
✗ FAIL if UI chrome (buttons/badges/modal title) is missing `user-select: none`
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

Grep for `generateConfig(` in Code.gs. The signature is:
`(portName, d, ipPrefs, seenPos, netSettings, vx1VlanSet)` — 6 parameters.
`vx1VlanSet` is optional: callers from `getTopologyData` may omit it intentionally — that is correct.
Every call must pass at least 5 args; omitting `netSettings` (arg 5) silently drops all protocol-family-gated commands.

✗ FAIL if any call site has fewer than 5 arguments — cite file and line.
⚠ WARN if a non-getTopologyData caller omits vx1VlanSet (arg 6) unexpectedly.

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

**Timeout tier table:**

| Tier | Timeout | Operations |
|---|---|---|
| Read / modal open | 15s | `openTechModal`, `openIpConfigModal`, `getNetworkSettings` |
| Save settings | 15s | `saveTechSettings`, `saveAutoIpConfig`, simple saves |
| Config fetch | 20s | `getDeviceConfig`, `fetchFullConfig` (also clears fetchQueue) |
| Full data load | 60s | `getTopologyData` — cold GAS start adds 10-15s; use `_fetchGuardFired` bool to discard late arrivals |
| Force sync / schema | 60s | `forceSyncColumnOrder`, `syncSchemaPreservingOrder`, sheet rebuild — also `clearInterval(pollTimer)` |

Exempt: `saveSchemaChanges()` uses `schemaLockTimer` (30s `clearInterval`+`hideGlobalLoading`) — approved alternative pattern.

✗ FAIL for each `showGlobalLoading()` site missing a `_guard` timeout.
✗ FAIL if `clearTimeout(_guard)` is NOT the first statement in a handler.
✗ FAIL if `hideGlobalLoading()` is missing from either handler.
✗ FAIL if a modal-open handler calls `hideGlobalLoading()` after DOM field assignments.
✗ FAIL if `getTopologyData` guard is not 60s (was 30s — fires legitimately on cold start + large topology).
✗ FAIL if a sync/schema op guard is not 60s or is missing entirely (e.g. `syncSchemaPreservingOrder` without `_colSyncGuard`).

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
✗ FAIL if a two-choice confirmation modal (Cancel · Primary Action) hides the footer Cancel during idle state — both choices must be visible when idle; only hide Cancel during in-progress state (e.g. `_commitInFlight`)

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
# Find all modal-std modal IDs in Sidebar.html
grep -n 'class="modal-std' ~/claude/projects/topoassist/Sidebar.html

# For each modal, find its body div (the div between header and footer that holds scrollable content)
# and verify it has all three scroll trio properties:
#   overflow-y: auto   — shows scrollbar when content overflows
#   flex: 1            — body expands to fill space between header and footer
#   min-height: 0      — allows body to shrink below content height (enables scroll in flex context)
#
# Run this to show all body-level divs inside modal-std that have overflow-y set:
grep -n "overflow-y" ~/claude/projects/topoassist/Sidebar.html | grep -v "<!--"

# For each hit, check the same line for flex:1 and min-height:0.
# A line with overflow-y:auto but missing flex:1 OR min-height:0 is a FAIL.
# Also check CSS classes used on body divs:
grep -n "modal-body-scroll\|ip-modal-body\|audit-body" ~/claude/projects/topoassist/Sidebar.html
# Then verify those classes include all three in Sidebar-css.html:
grep -A5 "\.modal-body-scroll\|\.ip-modal-body\|\.audit-body" ~/claude/projects/topoassist/Sidebar-css.html | grep -E "overflow-y|flex|min-height"
```

```bash
# Check floating panel minimize uses height-pinning (not CSS-only)
grep -A10 "toggleDevVisMinimize" \
  ~/claude/projects/topoassist/Sidebar-js.html | grep -E "style.height|style.overflow"

# Check toggleModalMinimize for modal-minimized CSS class approach (correct for .modal-std)
grep -A5 "function toggleModalMinimize" \
  ~/claude/projects/topoassist/Sidebar-js.html | head -10

# Check overlay management in toggleModalMinimize
grep -A20 "function toggleModalMinimize" \
  ~/claude/projects/topoassist/Sidebar-js.html | grep -E "editOverlay|hadOverlay|data-had"
```

✗ FAIL if a `.modal-std` body div has `overflow-y: auto` but is missing `flex: 1` — content clips silently in flex column context instead of scrolling
✗ FAIL if a `.modal-std` body div has `overflow-y: auto` but is missing `min-height: 0` — flex item refuses to shrink below content height, overflows modal instead of scrolling
✗ FAIL if a `.modal-std` body div lacks `overflow-y: auto` AND content can exceed 85vh
✗ FAIL if a CSS class used as a modal body (e.g. `.modal-body-scroll`, `.ip-modal-body`) is missing any of the three scroll trio properties
✗ FAIL if a floating panel minimize function sets child `display:none` but does NOT also set `panel.style.height = header.offsetHeight + 'px'`
✗ FAIL if `panel.style.overflow = 'hidden'` is missing from the minimize path
✗ FAIL if `toggleModalMinimize` does not hide `editOverlay` on minimize (leaves dim backdrop blocking background)
✗ FAIL if `toggleModalMinimize` does not use `data-had-overlay` to restore overlay on un-minimize
✗ FAIL if a modal-specific minimize function bypasses `toggleModalMinimize` (loses overlay management)

**Known compliant modals (scroll trio verified 2026-05-13):** networkStackModal, autoConfigModal (ip-modal-body class), deviceBridgeModal, guiEditModal (modal-body-scroll class), auditSettingsModal, auditModal (audit-body class), pushConfirmModal, helpModal, vlanSummaryModal.

---

## Check 22 — Modal White Background (CLAUDE.md Rule 7)

Every `.modal-std` and `.modal-floating` must use a white background by default.
Dark mode overrides via `--bg-modal` CSS variable or a dark-mode selector — never
hardcode a dark background on a modal outside a dark-mode rule.

```bash
# Check for hardcoded dark backgrounds on modals outside dark-mode selectors
grep -n "modal-std\|modal-floating" ~/claude/projects/topoassist/Sidebar-css.html \
  | grep -i "background\|bg" | head -20

# Verify --bg-modal is defined as white in base (non-dark) scope
grep -n "\-\-bg-modal" ~/claude/projects/topoassist/Sidebar-css.html | head -10

# Check for dark bg colors on modals NOT inside a dark-mode selector
grep -B5 "background.*#1e\|background.*#0f\|background.*#111\|background.*#222" \
  ~/claude/projects/topoassist/Sidebar-css.html | grep -A5 "modal" | head -30
```

✗ FAIL if any `.modal-std` or `.modal-floating` has a hardcoded dark background outside a dark-mode selector
✗ FAIL if `--bg-modal` is not set to `#ffffff` in the base (light) scope
⚠ WARN if modal background is set without using `--bg-modal` (makes dark-mode overrides harder)

---

## Check 23 — Minimize Button Position (CLAUDE.md Rule 25)

`.btn-modal-minimize` must sit immediately to the left of `.btn-modal-close`, forming
an adjacent `[−][×]` pair at the far right of the modal header. The button must be
auto-injected by `_injectMinimizeButtons()` — never hand-written in HTML.

```bash
# Verify _injectMinimizeButtons() exists in Sidebar-js.html
grep -n "_injectMinimizeButtons" ~/claude/projects/topoassist/Sidebar-js.html | head -10

# Verify it is called at initApp()
grep -n "initApp\|_injectMinimizeButtons" ~/claude/projects/topoassist/Sidebar-js.html \
  | grep -v "^.*function" | head -20

# Verify margin-left: auto on .btn-modal-minimize in CSS
grep -A5 "btn-modal-minimize" ~/claude/projects/topoassist/Sidebar-css.html | grep "margin-left" | head -5

# Verify NO hand-written btn-modal-minimize in Sidebar.html
grep -c "btn-modal-minimize" ~/claude/projects/topoassist/Sidebar.html

# Verify insertBefore(btn, closeBtn) pattern in _injectMinimizeButtons()
grep -A20 "_injectMinimizeButtons" ~/claude/projects/topoassist/Sidebar-js.html \
  | grep "insertBefore" | head -5
```

✗ FAIL if `_injectMinimizeButtons()` does not exist in Sidebar-js.html
✗ FAIL if `_injectMinimizeButtons()` is not called at `initApp()`
✗ FAIL if `.btn-modal-minimize` does not have `margin-left: auto` in CSS
✗ FAIL if `<button class="btn-modal-minimize">` appears directly in Sidebar.html (must be injected, not hand-written)
✗ FAIL if `insertBefore(btn, closeBtn)` pattern is absent (ensures `[−]` is left of `[×]`)

---

## Check 24 — Label-Column Alignment (Rule 26)

Any UI section with multiple rows of options under a shared category must use tabular alignment:
fixed-width label column + `flex:1` options so items align vertically across rows.

```bash
# Find proto-underlay-label usage — verify min-width and flex-shrink:0 present
grep -n "proto-underlay-label\|row-label" ~/claude/projects/topoassist/Sidebar-css.html \
  | grep -v "^.*<!--"

# Verify flex-shrink:0 is set on label columns
grep -A10 "proto-underlay-label" ~/claude/projects/topoassist/Sidebar-css.html \
  | grep "flex-shrink\|min-width"

# Check for any fixed-width sub-label spans inside EVPN service/VGW rows
grep -n "width:80px\|width: 80px" ~/claude/projects/topoassist/Sidebar.html | head -10

# Check for flex:1 on option labels inside aligned rows
grep -n "flex:1" ~/claude/projects/topoassist/Sidebar.html | grep "tech-radio-label\|rowEvpn\|labelGw" | head -10
```

✗ FAIL if a multi-row option group uses no fixed-width label column (options will not column-align)
✗ FAIL if `flex-shrink:0` is missing from the label column (label can compress and break alignment)
✗ FAIL if nested sub-label widths differ across rows in the same group (e.g. SERVICE=80px but VGW=auto)
✗ FAIL if a sub-label span contains only text but its sibling icon button is outside the span (breaks fixed-cell width)
⚠ WARN if any modal header manually positions a minimize button without using the injector

---

## Check 25 — Full-Screen Dialog Minimize (GAS Modeless Dialog Baseline)

Full-screen mode containers (`mode-schema #schemaContainer`, `mode-reorder #reorderModal`,
`mode-view_custom #viewCustomContainer`) are pinned to `height: 100vh !important` via their
mode class. This beats the `height: auto !important` in `.modal-minimized` at the same
`!important` weight (last rule evaluated wins). Two things must both be present:

1. **Higher-specificity CSS override** — container + `.modal-minimized` combined selector
   wins over the mode-class rule (ID + 2 classes > ID + 1 class):
   ```css
   body.mode-schema #schemaContainer.modal-minimized,
   body.mode-reorder #reorderModal.modal-minimized,
   body.mode-view_custom #viewCustomContainer.modal-minimized {
     height: auto !important;
   }
   ```

2. **`google.script.host.setHeight()` in `toggleModalMinimize()`** — CSS collapsing the
   container alone leaves the GAS dialog window at its original 800px height, showing a
   blank rectangle below the minimized header. The dialog must be resized via host API.

```bash
# 1. Check higher-specificity .modal-minimized CSS overrides exist for all three modes
grep -c "schemaContainer\.modal-minimized\|reorderModal\.modal-minimized\|viewCustomContainer\.modal-minimized" \
  ~/claude/projects/topoassist/Sidebar-css.html

# 2. Check toggleModalMinimize() calls google.script.host.setHeight
grep -A40 "function toggleModalMinimize" \
  ~/claude/projects/topoassist/Sidebar-js.html | grep "setHeight"

# 3. Verify restore height matches Code.gs dialog height
grep "setHeight" ~/claude/projects/topoassist/Sidebar-js.html | grep "toggleModal\|800"
grep "setHeight(800)" ~/claude/projects/topoassist/Code.gs
```

✗ FAIL if the CSS `.modal-minimized` override is missing for ANY of the three full-screen containers
✗ FAIL if `google.script.host.setHeight()` is absent from `toggleModalMinimize()`
⚠ WARN if the restore height in `setHeight(N)` doesn't match the `.setHeight(N)` in Code.gs

**Auto-fix recipe** (apply when check fails):

CSS — add inside the mode-block section of Sidebar-css.html, after the border-radius removal rule:
```css
body.mode-schema #schemaContainer.modal-minimized,
body.mode-reorder #reorderModal.modal-minimized,
body.mode-view_custom #viewCustomContainer.modal-minimized {
  height: auto !important;
}
```

JS — add at the end of `toggleModalMinimize()`, before the closing `}`:
```javascript
if (typeof google !== 'undefined' && google.script && google.script.host) {
  if (document.body.classList.contains('mode-schema') ||
      document.body.classList.contains('mode-reorder') ||
      document.body.classList.contains('mode-view_custom')) {
    if (isMin) {
      const hdr = modal.querySelector('.modal-header');
      google.script.host.setHeight(hdr ? hdr.offsetHeight + 2 : 50);
    } else {
      google.script.host.setHeight(800);
    }
  }
}
```

---

## Check 26 — Split Strip Divider / Button Parity

When Copy/View/Push buttons are hidden in any split strip (`splitDevice`, `splitLeft`, `splitRight`)
for non-EOS devices, the `.split-action-divider` elements must be hidden too.
Hiding buttons alone leaves 1px bars visible after the label, rendering as stray `|` characters.

```bash
# Confirm all three strips hide their dividers alongside buttons
grep -n "split-action-divider" ~/claude/projects/topoassist/Sidebar-js.html
```

For each strip where buttons are conditionally hidden:
- `querySelectorAll('#splitXxx .split-action-divider').forEach(d => d.style.display = ...)` must be present
- The display value must mirror the button visibility (same condition, same value)
- Must cover ALL three strips — `splitDevice`, `splitLeft`, `splitRight`

✗ FAIL if any strip hides buttons without a matching divider hide on the same condition
✗ FAIL if fewer than three strips have divider-hide logic

---

## Check 27 — Non-EOS Strip EOS Guard + actionsDisabled

Non-EOS device strips must always stay grey. Two rules enforce this:

**Rule A — `_isEosDev` guard in `processDeviceConfig`**: Both CASE 1 (device strip) and CASE 2 (link strips) must check `_isEosDev` before calling `setSplitBtnState(..., "#10b981", ...)`. Without this, any edge-case call to `processDeviceConfig` for a non-EOS device turns the strip green.

**Rule B — `actionsDisabled=true` for non-EOS `setSplitBtnState` calls**: Non-EOS strips are static indicators. Passing `false` enables hidden buttons and triggers the "ready" flash animation spuriously.

```bash
# Check _isEosDev guards CASE 1 and CASE 2
grep -A3 "_isEosDev" ~/claude/projects/topoassist/Sidebar-js.html | grep -E "CASE|setSplitBtn|#10b981"

# Verify non-EOS setSplitBtnState calls pass actionsDisabled=true (not false)
grep -n "Non-EOS.*#64748b" ~/claude/projects/topoassist/Sidebar-js.html
```

For each `setSplitBtnState(..., "#10b981", ...)` call in `processDeviceConfig`:
- Must be preceded by `_isEosDev &&` in the same condition

For each `setSplitBtnState(..., "— Non-EOS", "#64748b", ...)` call:
- 4th argument must be `true` (actionsDisabled), never `false`

✗ FAIL if any `setSplitBtnState(..., "#10b981", ...)` in `processDeviceConfig` lacks `_isEosDev &&`
✗ FAIL if any non-EOS strip `setSplitBtnState` call passes `actionsDisabled=false`

---

## Check 28 — configCache Is the Sole Config State Store

`configCache[deviceName].data` is the only source of truth for device config.
`allDevicesData[dev].fullConfig`, `allDevicesData[dev].configLoaded`, and
`allNodesData[id].details.configLoaded` were removed in the 2026-04-29 refactor —
any reintroduction silently defeats cache invalidation (eviction removes `configCache[dev]`
but leaves stale `.fullConfig`/`.configLoaded`, so old config is shown as green/cached).

```bash
# Must return 0 — no fullConfig writes anywhere
grep -n "\.fullConfig\s*=" ~/claude/projects/topoassist/Sidebar-js.html

# Must return 0 — no configLoaded writes on allDevicesData
grep -n "allDevicesData\[.*\]\.configLoaded\s*=" ~/claude/projects/topoassist/Sidebar-js.html

# Must return 0 — no configLoaded writes on allNodesData
grep -n "allNodesData\[.*\]\.details\.configLoaded\s*=" ~/claude/projects/topoassist/Sidebar-js.html

# Config-ready checks must use configCache, not .configLoaded
grep -n "\.configLoaded" ~/claude/projects/topoassist/Sidebar-js.html
```

✗ FAIL if any `allDevicesData[dev].fullConfig =` write is found — cite line
✗ FAIL if any `allDevicesData[dev].configLoaded =` write is found — cite line
✗ FAIL if any `allNodesData[id].details.configLoaded =` write is found — cite line
✗ FAIL if `.configLoaded` is read as a config-ready check (must be `!!configCache[dev]`) — cite line

---

## Check 29 — Function Naming & Documentation

### 29a. Vague or short function names (⚠ warn; ✗ fail if added this session)

```bash
# Names ≤ 4 chars — may be fine for utilities, judge by body content
grep -nP "^function [a-zA-Z_$]{1,4}\s*\(" ~/claude/projects/topoassist/Sidebar-js.html

# Lone generic verb with no qualifier — exact name only (not 'openIpConfigModal')
grep -nP "^function (show|hide|open|close|run|go|do|set|get|init|load|save|reset|update|handle|process)\s*\(" ~/claude/projects/topoassist/Sidebar-js.html ~/claude/projects/topoassist/Code.gs
```

For each result: read the body. If the function does a non-obvious thing with no clear call-site context, ✗ FAIL for anything added this session — suggest a name that encodes intent. For pre-existing functions, ⚠ WARN only.

### 29b. Single-letter parameters (⚠ warn)

```bash
grep -nP "^function \w+\(\s*[a-wyz]\s*[,)]" ~/claude/projects/topoassist/Sidebar-js.html
```

Exempt: `e` (event), `i` / `j` / `k` (loop indices), `cb` (callback), `el` (element), `id`.
⚠ WARN for any others — suggest a descriptive name.

### 29c. Non-obvious functions without a WHY comment (⚠ warn)

Manually scan functions that:
- Work around a browser or GAS quirk (e.g. `flex: 1; min-height: 0` for scroll, `scrollIntoView` after re-render)
- Enforce a non-obvious invariant (ordering, guard condition, fallback)
- Have a multi-case state machine or multiple early-return branches

For each such function with NO inline `//` comment at the key decision point:
⚠ WARN — cite function name and the specific non-obvious line that needs a WHY note.

Rule: comments explain **WHY**, not WHAT. Straightforward functions whose intent is clear from names + structure always ✓ PASS — do not add JSDoc or describe what the code obviously does.

### 29d. Stale names from 2026-05-03 rename session (✗ fail)

```bash
grep -nP "\b(isDeviceListDirty|renderManagerList|showDeviceDataUi|showDeviceManagerUi|\
openDeviceManager|initSchemaManager|attemptCloseManager|attemptCloseSchema|\
schemaBody|schemaContainer|btnSaveSchema|isSchemaDirty|isSchemaSaving|\
schemaLockTimer|currentSchemaList|initialSchemaList|initialSchemaState|\
initialSchemaKeyOrder|getCleanSchema|saveSchemaChanges|updateSchemaLabel|\
updateSchemaOption|globalSchema|pendingDeleteIndex|deleteField|addNewField|\
getOriginalItem|silentRefreshDeviceManager|promptRenameDevice|\
applyDeviceListFromServer|runSchemaAudit)\b" \
  ~/claude/projects/topoassist/Sidebar-js.html \
  ~/claude/projects/topoassist/Sidebar.html \
  ~/claude/projects/topoassist/Code.gs
```

✗ FAIL if any stale name is found — cite file and line.

---

## Check 30 — Change Indicators on Editable Fields

Every editable field in any manager panel (Device Manager, SheetColumnManager, or any future panel)
must provide visual change feedback when its value differs from the originally loaded state.

### Pattern by field type

| Field type | Required indicator |
|---|---|
| Short text input (name, label, hostname) | Green border via `.dev-name-changed` or `.modified-highlight` + dim italic "was: [original]" span below |
| Select / dropdown (role, MLAG peer) | `.changed` CSS class → green border + green text |
| Textarea / options list | `.modified-highlight` CSS class → amber bottom-border + amber tint |

### 30a — `_orig*` fields at load time

Every manager panel must store original values on each item at load time so change detection
is possible without a server round-trip.

```bash
# Device Manager — check _orig* fields are set in DeviceManagerLoadDevices
grep -n "_origHostname\|_origRole\|_origMlagPeer" ~/claude/projects/topoassist/Sidebar-js.html | head -10

# SheetColumnManager uses initialSheetColumnManagerState snapshot instead of per-field _orig*
grep -n "initialSheetColumnManagerState" ~/claude/projects/topoassist/Sidebar-js.html | head -5
```

✗ FAIL if a manager panel has editable fields but no original-value storage mechanism.

### 30b — Was-spans rendered and updated in-place

Text inputs must have a `<span>` with a stable DOM ID rendered in the HTML (hidden when
unchanged), updated in-place by the `oninput`/`onchange` handler — NOT by re-rendering the
whole list (breaks focus/cursor).

```bash
# Device Manager was-spans
grep -n "devHostnameWas_\|dev-name-was" ~/claude/projects/topoassist/Sidebar-js.html | head -10

# SheetColumnManager was-spans
grep -n "schemaWas_" ~/claude/projects/topoassist/Sidebar-js.html | head -10

# In-place update in handlers (not DeviceManager() re-render)
grep -n "devHostnameWas\|schemaWas" ~/claude/projects/topoassist/Sidebar-js.html | head -10
```

✗ FAIL if a text input field changes the underlying data but has no was-span shown to the user.
✗ FAIL if the was-span is updated by calling a full re-render function instead of a targeted DOM update.

### 30c — `.changed` CSS class exists for selects

```bash
grep -n "role-select.changed\|mlag-peer-select.changed\|\.changed" \
  ~/claude/projects/topoassist/Sidebar-css.html | head -10
```

✗ FAIL if a select/dropdown is changed and re-rendered but no `.changed` CSS rule gives it a visual cue.

### 30d — `.modified-highlight` CSS class exists for textareas

```bash
grep -n "modified-highlight" ~/claude/projects/topoassist/Sidebar-css.html
```

✗ FAIL if `.modified-highlight` rule is missing (amber underline + tint).
✗ FAIL if a textarea in a manager panel has no `modified-highlight` applied when its value changes.

### 30e — New editable fields in any manager panel

When reviewing code added this session: identify every new `<input>`, `<select>`, or `<textarea>`
inside a manager panel. For each one:
- Is there a change indicator wired up?
- Is the original value stored at load time?
- Is the was-span or `.changed` class applied both at render time AND in the update handler?

✗ FAIL if a new editable field in a manager panel has no change indicator.

---

## Check 31 — setTitle / showModelessDialog String Sync

Every `showModelessDialog(html, 'X')` call in Code.gs must have a matching `.setTitle('X')` on
the html object, with the **identical string** — no version suffix, no variation.

```bash
# Extract all setTitle and showModelessDialog strings and compare
grep -n "setTitle\|showModelessDialog" ~/claude/projects/topoassist/Code.gs \
  | grep -v "showModalDialog\|^.*\/\/" | grep -oP "(?<=setTitle\('|showModelessDialog\(html, ')([^']+)"
```

Pair each `.setTitle('X')` with its adjacent `showModelessDialog(html, 'X')`. They must be
identical strings.

✗ FAIL if any pair has mismatched strings (e.g. one has a version suffix, different wording).
✗ FAIL if a `showModelessDialog` call has no preceding `.setTitle(...)` on the html object.

---

## Check 32 — Cancel Button + Dirty-State Warning + Dynamic Label

Every **edit/confirm** modal with a Save button must have a Cancel button and dirty-state protection. The Cancel button label must be dynamic: "Close" (clean) or "Abort *" (dirty).

```bash
# Verify Cancel buttons exist in edit/confirm modal footers and have stable ids
grep -n "btnCancelTech\|btnCancelIp\|btnCancelEdit\|btnCancelGroupRect\|btnCancelDeviceManager\|btnCancelSheetColumnManager" \
  ~/claude/projects/topoassist/Sidebar.html

# Verify close functions call _confirmDirtyClose
grep -n "_confirmDirtyClose" ~/claude/projects/topoassist/Sidebar-js.html

# Verify _updateCancelBtn helper exists
grep -n "function _updateCancelBtn" ~/claude/projects/topoassist/Sidebar-js.html

# Verify _updateCancelBtn is called in dirty-check functions (Tier 1) and close functions (Tier 2)
grep -n "_updateCancelBtn" ~/claude/projects/topoassist/Sidebar-js.html

# Verify _confirmDirtyClose, _captureFormState, _captureGroupRectState helpers exist
grep -n "function _confirmDirtyClose\|function _captureFormState\|function _captureGroupRectState" \
  ~/claude/projects/topoassist/Sidebar-js.html
```

For each edit/confirm modal (`networkStackModal`, `autoConfigModal`, `guiEditModal`, `groupRectModal`, `configCenterModal`, `deviceManagerContainer`, `sheetColumnManagerContainer`):
- [ ] `networkStackModal`: `id="btnCancelTech"` present; `checkTechDirty()` calls `_updateCancelBtn('btnCancelTech', isDirty)`; `closeTechModal()` calls `_confirmDirtyClose`
- [ ] `autoConfigModal`: `id="btnCancelIp"` present; `checkIpDirty()` calls `_updateCancelBtn('btnCancelIp', isDirty)`; `closeIpModal()` calls `_confirmDirtyClose`
- [ ] `guiEditModal`: `id="btnCancelEdit"` present; all 3 open paths reset `_updateCancelBtn('btnCancelEdit', false)` and capture `initialEditModalState`; `closeEditModal()` calls `_updateCancelBtn('btnCancelEdit', isDirty)` BEFORE `_confirmDirtyClose`
- [ ] `groupRectModal`: `id="btnCancelGroupRect"` present; `openGroupRectModal()` calls `_updateCancelBtn('btnCancelGroupRect', false)` after state capture; `closeGroupRectModal()` calls `_updateCancelBtn('btnCancelGroupRect', isDirty)` BEFORE `_confirmDirtyClose`
- [ ] `deviceManagerContainer`: `id="btnCancelDeviceManager"` present; `DeviceManagerSaveButton()` calls `_updateCancelBtn('btnCancelDeviceManager', isDeviceManagerDirty)`
- [ ] `sheetColumnManagerContainer`: `id="btnCancelSheetColumnManager"` present; `SheetColumnManagerSaveButton()` calls `_updateCancelBtn('btnCancelSheetColumnManager', isSheetColumnManagerDirty)`
- [ ] `configCenterModal`: `closeGenerateAllModal()` calls `_confirmDirtyClose` for global cfg dirty state (no Cancel button — X-only dismiss; exempt from dynamic label)

Reset rules:
- [ ] Save success handlers reset `initialState = ''` before calling close
- [ ] Delete/destructive success handlers reset `initialState = ''` before calling close
- [ ] `confirmGroupRect()` resets `initialGroupRectState = ''` at top (user clicked Save)

✗ FAIL if any edit/confirm modal has a Save button but no Cancel button in the footer (exception: Config Center with embedded Save)
✗ FAIL if any Cancel button in scope is missing its `id` attribute
✗ FAIL if any canonical close function for a dirty-tracked modal does not call `_confirmDirtyClose`
✗ FAIL if `_confirmDirtyClose`, `_captureFormState`, `_captureGroupRectState`, or `_updateCancelBtn` helper is missing
✗ FAIL if `_updateCancelBtn` is called AFTER `_confirmDirtyClose` in a close function (must be before, so label persists on dismiss)
✗ FAIL if Cancel label is set inline (`btn.textContent = ...`) instead of via `_updateCancelBtn`

---

## Check 33 — alert() in Error/Async Paths

`alert()` is permitted only for two cases: (1) **input validation that gates an action** (e.g. "Field ID required", "Interface Name required", IP mask validation errors, "Device already in list"), and (2) the **D3 cable tooltip** on link click (line ~9396). All other uses — withFailureHandler, server response errors (res.error), catch blocks, precondition guards, copy failures, timeouts — must use `setStatus(..., 'status-error')` or `setStatus(..., 'status-warn')`.

```bash
# Find ALL alert() calls not in comments
grep -n "alert(" ~/claude/projects/topoassist/Sidebar-js.html \
  | grep -v "^.*//.*alert("
```

For each result, classify:
- **KEEP** if it is: input validation (`if (!field) { alert(...); return; }`), or the D3 tooltip (`alert(\`${d.source.id}...`)`)
- **FAIL** if it is: inside a `withFailureHandler`, a `catch` block, checking `res.error`, a guard against missing topology/config data, or a copy/clipboard failure

✗ FAIL if any `alert()` exists in a withFailureHandler callback
✗ FAIL if any `alert()` exists in a `catch` block handling async/server errors
✗ FAIL if any `alert()` checks `res.error` or `err.message` from a GAS response
✗ FAIL if any `alert()` is used as a precondition guard ("No topology data", "D3 not loaded", etc.)
✗ FAIL if any `alert()` is used for copy/clipboard failures
✗ FAIL if `window.onerror` does not call `setStatus()` (line ~595)
✗ FAIL if `window.addEventListener('unhandledrejection', ...)` handler is missing or does not call `setStatus()`

---

## Check 34 — allDevicesData / allNodesData Null Guards in Async Callbacks

`allDevicesData` and `allNodesData` are cleared during topology reload. Any GAS `withSuccessHandler` callback or event handler registered during render (and fired later) may access these after they are cleared. The safe patterns are `?.prop`, `&& obj.prop`, or an `if (obj)` guard before the block. The **unsafe** pattern is `allDevicesData[x].prop` or a variable `d = allDevicesData[x]` followed by `d.prop` without checking `d` first.

Known fixed locations (verify guards still present):
- `processDeviceConfig()` line ~6768: `(wasAlreadyLoaded && allDevicesData[deviceName]) ? ... .fetchTime`
- `selectDevice()` line ~6555: `devData?.fetchEpoch`

```bash
# Find bracket-indexed allDevicesData property reads — scan for unguarded patterns
grep -n "allDevicesData\[" ~/claude/projects/topoassist/Sidebar-js.html \
  | grep -v "allDevicesData\[.*\]?\." \
  | grep -v "if (allDevicesData\[" \
  | grep -v "allDevicesData\[.*\] &&" \
  | grep -v "for (" \
  | grep -v "Object\.keys\|Object\.values\|delete " \
  | head -30

# Confirm known guards are still present
grep -n "wasAlreadyLoaded && allDevicesData\[deviceName\]" \
  ~/claude/projects/topoassist/Sidebar-js.html
grep -n "devData?\.fetchEpoch" ~/claude/projects/topoassist/Sidebar-js.html
```

For any new code added this session that accesses `allDevicesData[x]` or `allNodesData[x]` inside a `withSuccessHandler`, a click/event handler registered during render, or a `setTimeout`:
- [ ] Is there a null check before accessing properties on the result?
- [ ] If a variable `d = allDevicesData[x]` is used, is `d` checked before `d.prop`?

✗ FAIL if a new `withSuccessHandler` callback accesses `allDevicesData[x].prop` without a null guard
✗ FAIL if a new render-time event handler closure accesses `allNodesData[x].prop` without a guard
✗ FAIL if the known guards at `processDeviceConfig` and `selectDevice` have been removed

---

## Check 35 — Bridge Port Sub-type SSoT (`bridgePortSubType`)

Sub-type classification (`'shut'`/`'down'`/`'other'`) for missing bridge ports must come exclusively from
the pre-computed `bridgePortSubType` map — never re-derived from `devStatusMap` or `dsData` ad-hoc.

**How to verify:**
- [ ] No function other than `_populateBridgePortSubTypes` writes to `bridgePortSubType`
- [ ] No helper function reads link/interface status from `devStatusMap` or `dsData` to classify a port sub-type outside of `_populateBridgePortSubTypes`
- [ ] All consumers — `_bridgeEffectiveClass`, `_renderLldpResults`, `_logBridgeIssuesToStatusLog`, `runValidation` — read only from `bridgePortSubType`
- [ ] `_populateBridgePortSubTypes(dsData)` is called in both bridge paths (auto + manual) BEFORE any rendering/logging call and BEFORE `devStatusMap` is reassigned
- [ ] Link-level priority is applied: `shut` wins over `down`; either side of the link being `disabled` → whole link is `'shut'`

**Why this check exists:** Prior to 2026-05-06 there were three separate derivations from two different data sources. `_bridgeMissingSubType` read from `devStatusMap` (potentially stale), `_portLinkSt` and `_ls` read from `dsData` (correct but repeated). The timing divergence caused admin-shut ports to show as `down` in audit counts and dots to stay red after disabling an audit flag.

---

## Check 37 — Handler Name ↔ UI Label Consistency

Every `onclick`, `onchange`, `oninput`, and `onkeydown` handler added **this session** must
have a name that a reader can map to the UI action without opening the function body.

**How to verify:**
```bash
# Find all event handlers added this session
git diff HEAD~1 -- Sidebar.html Sidebar-js.html | grep -E 'onclick=|onchange=|oninput=|onkeydown=' | grep '^+' | head -40
```

For each result, compare the **UI label** (button text, modal title, section header, input
label) with the **function name**:

| UI label | ✓ Good name | ✗ Bad name |
|---|---|---|
| "Clean Selected" button | `runCleanSelected()` | `_doClean()`, `execSel()` |
| "Device Bridge" modal open | `openBridgeModal()` | `_bOpen()`, `showB()` |
| "CRC/FCS threshold" input | `onBridgeL1ThresholdChange()` | `_threshChange()` |
| "Save & Close" button | `saveAndClose()` | `_sc()`, `doSave()` |

**Rules:**
- [ ] Function name must contain the **noun** (what thing) and the **verb** (what action): `open/close/run/save/toggle` + `BridgeModal/CleanSelected/L1Threshold`
- [ ] Generic verbs alone (`run()`, `save()`, `open()`) are a ✗ FAIL — must have a qualifier
- [ ] Abbreviations are only acceptable when the abbreviated form IS the UI label (e.g. `onBgpChange` for a "BGP" input)
- [ ] Private helpers (`_buildX`, `_renderX`, `_parseX`) are exempt — they are not event handlers
- [ ] Pre-existing functions are ⚠ WARN only; anything added this session is ✗ FAIL

**Why this check exists:** When function names don't reflect UI labels, a developer reading
an `onclick` in HTML has no idea what feature it touches without jumping to the JS. This is
especially costly in TopoAssist where Sidebar.html and Sidebar-js.html are separate files —
the HTML→JS mapping must be self-documenting at the call site.

---

## Check 36 — device_bridge.py ↔ Embedded Template Sync

`downloadBridgeScript()` in Sidebar-js.html embeds a full copy of `device_bridge.py` as a
template string. Shared functions in both files must stay byte-for-byte equivalent.
Functions to verify: `_extract_eos_errors`, `_push_config`, `_abort_stale_sessions`
(and any other function that exists in both places).

```bash
# Confirm function exists in device_bridge.py
grep -n "^def _extract_eos_errors\|^def _push_config\|^def _abort_stale_sessions" \
  ~/claude/projects/topoassist/device_bridge.py

# Confirm same functions exist in the embedded template
grep -n "_extract_eos_errors\|_push_config\|_abort_stale_sessions" \
  ~/claude/projects/topoassist/Sidebar-js.html | grep "^def \|def " | head -10
```

If this session changed any such function in one file, manually diff the function body
in `device_bridge.py` against the same function in the `downloadBridgeScript()` template block
in `Sidebar-js.html`. Both must be identical (ignoring surrounding JS string quoting).

✗ FAIL if any shared function body differs between device_bridge.py and the embedded template
✗ FAIL if a function was added to device_bridge.py but not mirrored in the embedded template

---

## Check 38 — XSS / innerHTML Safety (OWASP A03)

`innerHTML` with unescaped external data is the primary XSS vector in this app. External data
sources include: device names (from Google Sheet), LLDP neighbor names (from EOS), config text
(from devices), and any user-supplied field values that are reflected back into the DOM.

**Safe patterns:**
- Static HTML strings with no external data interpolated → ✓ OK
- `textContent = value` / `innerText = value` → always safe (no HTML parsing)
- Template literal with `_esc(value)` / `_htmlEscape(value)` / `.replace(/</g,'&lt;')` → ✓ OK

**Unsafe patterns:**
- `` el.innerHTML = `<span>${deviceName}</span>` `` → device names come from the sheet (user-controlled)
- `` el.innerHTML = `...${neighborName}...` `` → LLDP neighbor names come from the network
- `` el.innerHTML = `...${cfgLine}...` `` → config text can contain `<`, `>`, `"`, `&`

```bash
# Find innerHTML assignments that interpolate variables (not pure static HTML)
grep -n "innerHTML\s*=\s*['\`]" ~/claude/projects/topoassist/Sidebar-js.html \
  | grep '\${' | grep -v "//.*innerHTML" | head -40

# Also check JS-constructed innerHTML via string concatenation
grep -n "innerHTML\s*=" ~/claude/projects/topoassist/Sidebar-js.html \
  | grep -v "innerHTML\s*=\s*['\`][^'\"]*['\`]" | head -20
```

For each result, determine the data source of each interpolated `${}`:
- **Sheet data** (device names, hostnames, roles, labels, IPs from `allDevicesData`) → must be escaped
- **Network data** (LLDP neighbor IDs, interface names, config lines from EOS responses) → must be escaped
- **App-internal constants** (SVG strings, CSS class names, hardcoded enums) → safe, no escaping needed
- **User-typed input** (text fields, search boxes) → must be escaped if reflected to innerHTML

**Verify `_esc()` or equivalent exists and is used:**
```bash
# Check for an HTML-escape helper
grep -n "function _esc\|function _htmlEsc\|htmlEscape\|escapeHtml" \
  ~/claude/projects/topoassist/Sidebar-js.html | head -5
```

✗ FAIL if device names, LLDP neighbor names, or config text from external sources are interpolated
  into `innerHTML` without HTML escaping — cite file and line
✗ FAIL if no HTML-escape helper (`_esc` / `_htmlEscape`) exists and external data appears in innerHTML
⚠ WARN for any innerHTML assignment where the data source is ambiguous — flag for manual review
✓ PASS for innerHTML assignments using only SVG strings, CSS class names, or hardcoded app constants

---

## Check 39 — console.log / debugger Residue

`console.log`, `console.error`, `console.warn`, `console.debug`, and `debugger` statements
must not appear in production code paths. They expose internal state in the browser console and
have a measurable performance cost on hot paths (rendering loops, event handlers).

**Allowed exceptions:**
- `console.error` inside `window.onerror` and `window.addEventListener('unhandledrejection', ...)` — these are intentional error reporters
- Comments mentioning console (e.g. `// was: console.log(...)`) — fine

```bash
# Find all console.* and debugger statements (exclude comments)
grep -n "console\.log\|console\.error\|console\.warn\|console\.debug\|debugger" \
  ~/claude/projects/topoassist/Sidebar-js.html \
  | grep -v "^\s*//" \
  | grep -v "window\.onerror\|unhandledrejection" | head -40

# Also check Code.gs
grep -n "console\.log\|console\.error\|debugger" \
  ~/claude/projects/topoassist/Code.gs \
  | grep -v "^\s*//" | head -20
```

For each result added **this session** (use `git diff HEAD~1`):
✗ FAIL if a `console.log` or `debugger` was added this session in a production code path

For pre-existing results:
⚠ WARN for each one — note the line and suggest removal or promotion to `setStatus()`

**Python-side**: `print()` in `device_bridge.py` is intentional server-side logging to stdout — do NOT flag.

---

## Check 40 — JSON.parse Safety

`JSON.parse()` throws a `SyntaxError` on malformed input. In this app, JSON is parsed from:
- `localStorage` (which can be corrupted by browser extensions or manual edits)
- `devStatusMap` / EOS API responses (which can be truncated on timeout)
- `cb.dataset.*` attributes (which can be malformed if DOM is manipulated)

Every bare `JSON.parse(x)` outside a `try/catch` is an unhandled exception risk.

```bash
# Find JSON.parse calls not preceded by 'try' on the same or previous line
grep -n "JSON\.parse(" ~/claude/projects/topoassist/Sidebar-js.html \
  | grep -v "^\s*//" | head -30
```

For each result, check the surrounding context (3 lines up):
- Is there a `try {` block enclosing this call? → ✓ PASS
- Is there a `|| {}` or `|| []` fallback AFTER `JSON.parse(...)`, but no try-catch? → ⚠ WARN (fallback doesn't catch SyntaxError — it only catches null/undefined from `localStorage.getItem`)
- Bare `JSON.parse(x)` with no try-catch and no safe fallback → ✗ FAIL

**Safe pattern:**
```javascript
let parsed = {};
try { parsed = JSON.parse(raw); } catch (_) { /* malformed — use default */ }
```

**Unsafe pattern (WARN, not FAIL — common pattern in the codebase):**
```javascript
JSON.parse(localStorage.getItem('key') || '{}')
// localStorage.getItem returns null → '{}' is safe fallback
// BUT if key exists but is malformed JSON, this still throws
```

For code **added this session**:
✗ FAIL if a new `JSON.parse()` call has no surrounding try-catch and the data source is external
  (localStorage, server response, dataset attribute) — cite file and line

For pre-existing bare `JSON.parse(localStorage.getItem(...) || '{}')` calls:
⚠ WARN only — note the pattern is partially safe (null → fallback) but not fully safe
  (corrupted value still throws). Flag for future hardening.

---

## Check 41 — Accessibility: Icon-Only Button Labels (WCAG 2.1 SC 1.1.1 / 4.1.2)

Every button that has no visible text label — icon-only buttons (SVG-only, no text child) —
must have an accessible name via `aria-label` or `title`. Without this, screen readers announce
"button" with no context, and keyboard users cannot determine the button's purpose.

**Required:** at minimum a `title="..."` attribute on every icon-only button. Preferred: `aria-label="..."` (more reliable than `title` for screen reader announcement).

Icon-only buttons in TopoAssist:
- Toolbar icon buttons (`.icon-btn`) — already have `title=` ✓
- Modal close buttons (`.btn-modal-close`) — must have `title="Close"`
- Modal minimize buttons (`.btn-modal-minimize`) — must have `title="Minimize"` (injected by `_injectMinimizeButtons`)
- Copy buttons, refresh buttons, expand/collapse buttons in panels

```bash
# Check btn-modal-close has title="Close"
grep -n 'btn-modal-close' ~/claude/projects/topoassist/Sidebar.html \
  | grep -v 'title=' | head -10

# Check _injectMinimizeButtons adds title to the minimize button
grep -A15 "_injectMinimizeButtons" ~/claude/projects/topoassist/Sidebar-js.html \
  | grep "title\|aria-label" | head -5

# Find icon-only buttons (buttons containing SVG but no text node)
grep -n 'class="icon-btn\|btn-icon-sm\|btn-copy\|btn-refresh' ~/claude/projects/topoassist/Sidebar.html \
  | grep -v 'title=\|aria-label=' | head -20
```

For buttons added **this session**:
✗ FAIL if a new icon-only button (SVG-only, no visible text) has no `title` or `aria-label` attribute

For pre-existing icon-only buttons:
⚠ WARN if missing `title` — suggest adding in the same edit pass when touching the surrounding HTML

**Note:** `title` is sufficient for this app (GAS dialog, mouse-driven UI). `aria-label` is preferred
but not required unless the button is in a screen-reader-critical workflow.

---

## Check 42 — SSoT Label / String Builders

When the same format string is constructed in 3+ call sites, it must be extracted to a
pure builder function. The pattern has two levels:

1. `_buildXLabel(params)` — pure, returns string only, zero DOM side-effects
2. `_setXLabel(id, params)` — delegates to `_buildXLabel`, adds DOM mutations (color, disabled)

Callers needing **string only** (e.g. periodic tickers, age refreshers) call `_buildXLabel` directly.
Callers needing **string + state** call `_setXLabel`.

**Canonical helpers — never duplicate their bodies inline:**
- `_buildSplitLabel(sheetId, dev, port, state, ageOrTime)` → string for all 3 split-btn states
- `_setSplitBtnLabel(splitId, sheetId, dev, port, state, ageOrTime)` → calls `_buildSplitLabel` + `setSplitBtnState`
- `updateDirtyButton(selector, isDirty)` → amber/green + " *" label; use for ALL dirty-state save buttons

```bash
# Confirm _buildSplitLabel is the only place that formats split-btn labels
grep -n "]:.*Config\b" ~/claude/projects/topoassist/Sidebar-js.html \
  | grep -v "_buildSplitLabel\|function\|//" | head -10

# Confirm DeviceManagerSaveButton / SheetColumnManagerSaveButton use updateDirtyButton
grep -A3 "DeviceManagerSaveButton\|SheetColumnManagerSaveButton" \
  ~/claude/projects/topoassist/Sidebar-js.html | grep -v "^--$" | head -20

# Confirm no inline " *" label logic outside updateDirtyButton
grep -n 'label + " \*"\|innerText.*\*"' ~/claude/projects/topoassist/Sidebar-js.html \
  | grep -v "updateDirtyButton\|function updateDirty" | head -10
```

✗ FAIL if a format string appearing in 3+ places is not behind a pure builder function
✗ FAIL if `DeviceManagerSaveButton` or `SheetColumnManagerSaveButton` contain inline dirty-state logic instead of calling `updateDirtyButton`
✗ FAIL if any call site builds a split-btn label string without going through `_buildSplitLabel`

---

## Output Format

```
TOPOASSIST CODE REVIEW
======================
 1 — JetBrains Mono           ✓ / ✗ / ⚠
 2 — SVG Icons                ✓ / ✗ / ⚠
 3 — user-select              ✓ / ✗ / ⚠
 4 — Canvas Bounds            ✓ / ✗ / ⚠
 5 — UI/UX Symmetry           ✓ / ✗ / ⚠
 6 — VERSION Sync             ✓ / ✗ / ⚠
 7 — canonicalizeInterface    ✓ / ✗ / ⚠
 8 — INSTRUCTIONS Updated     ✓ / ✗ / ⚠
 9 — generateConfig params    ✓ / ✗ / ⚠
10 — hasKey() usage           ✓ / ✗ / ⚠
11 — MLAG explicit only       ✓ / ✗ / ⚠
12 — info-box--dim CSS        ✓ / ✗ / ⚠
13 — Input state taxonomy     ✓ / ✗ / ⚠
14 — Font scale               ✓ / ✗ / ⚠
15 — Textarea resize          ✓ / ✗ / ⚠
16 — Inline code font         ✓ / ✗ / ⚠
17 — GAS loading guard        ✓ / ✗ / ⚠
18 — Modal button standard    ✓ / ✗ / ⚠
22 — Modal white bg           ✓ / ✗ / ⚠
23 — Minimize btn position    ✓ / ✗ / ⚠
25 — Full-screen dialog min.  ✓ / ✗ / ⚠
26 — Strip divider parity      ✓ / ✗ / ⚠
27 — Non-EOS strip EOS guard   ✓ / ✗ / ⚠
28 — configCache sole store    ✓ / ✗ / ⚠
29 — Naming & documentation    ✓ / ✗ / ⚠
30 — Change indicators         ✓ / ✗ / ⚠
31 — setTitle/showModelessDialog sync ✓ / ✗ / ⚠
32 — Cancel btn + dirty-state warning  ✓ / ✗ / ⚠
33 — alert() in error/async paths      ✓ / ✗ / ⚠
34 — allDevicesData null guards        ✓ / ✗ / ⚠
35 — Bridge sub-type SSoT             ✓ / ✗ / ⚠
36 — device_bridge template sync      ✓ / ✗ / ⚠
37 — Handler name ↔ UI label          ✓ / ✗ / ⚠
38 — XSS / innerHTML safety           ✓ / ✗ / ⚠
39 — console.log / debugger residue   ✓ / ✗ / ⚠
40 — JSON.parse safety                ✓ / ✗ / ⚠
41 — Accessibility: icon-button label ✓ / ✗ / ⚠
42 — SSoT label/string builders       ✓ / ✗ / ⚠

─────────────────────────────────────
Status: BLOCKED — N failures must be resolved before proceeding.
        (or: CLEAN — ready to ship.)
```
