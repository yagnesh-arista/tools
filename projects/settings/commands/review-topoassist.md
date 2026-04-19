Run a TopoAssist-specific compliance review across Sidebar-js.html, Sidebar-css.html,
and any other UI-bearing files. This supplements the global `/review` — run both.
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

Both copies must be in sync. Check the `// DUPLICATED ... last synced:` comment date.

✗ FAIL if the two implementations differ in logic (not just whitespace).
⚠ WARN if the `last synced` date is stale (older than the most recent edit to either file).

---

## Check 8 — INSTRUCTIONS_topoassist.txt Updated

✗ FAIL if "Last updated" date in INSTRUCTIONS_topoassist.txt does not match today's date
after any code change was made this session.

---

## Output Format

```
TOPOASSIST REVIEW SUMMARY
=========================
1 — JetBrains Mono
  ✓ All UI elements have explicit font-family

2 — SVG Icons
  ✗ FAIL: Unicode icon "▶" — Sidebar-js.html:3421 (button label)

3 — user-select
  ✓ No violations found

4 — Canvas Bounds
  ⚠ WARN: push modal drag handler — no horizontal clamp on resize

5 — UI/UX Symmetry
  ✓ No obvious asymmetry found

6 — VERSION Sync
  ✓ device_bridge.py, template, and /health docstring all say 2.7

7 — canonicalizeInterface Sync
  ✓ Both copies match; last synced 2026-04-07

8 — INSTRUCTIONS Updated
  ✓ Last updated: 2026-04-17

─────────────────────────────────────
Status: BLOCKED — 1 failure must be resolved before proceeding.
        (or: CLEAN — ready to ship.)
```
