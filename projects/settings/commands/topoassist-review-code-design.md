Run a TopoAssist-specific compliance review across Sidebar-js.html, Sidebar-css.html,
Code.gs, and any other UI-bearing or logic files edited this session.
Report each check with ✓ / ✗ / ⚠. Any ✗ is a blocker. Cite file and line for every finding.

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

─────────────────────────────────────
Status: BLOCKED — N failures must be resolved before proceeding.
        (or: CLEAN — ready to ship.)
```
