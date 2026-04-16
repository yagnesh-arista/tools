# UI Rules (Global — applies to all projects)

## JetBrains Mono on All UI Elements
Every UI element (buttons, inputs, labels, badges, dropdowns, modals, tooltips, status bars)
must explicitly set `font-family: 'JetBrains Mono', monospace`.
Do NOT rely on inheritance — it does not work in Google Apps Script dialogs or some browser contexts.

## UI/UX Symmetry
Spacing, alignment, sizing, padding, and interactions must be consistent and balanced across all elements.
- Button rows: all buttons share the same height, font size, and padding.
- Modals: if 16px padding on the left, must be 16px on the right.

## No Modal or HTML Object Out of Canvas
Every modal, tooltip, dropdown, overlay, and floating panel must stay fully within viewport/canvas
bounds at all times — including after window resize and drag.
Clamp positions to viewport edges. Never let content overflow off-screen.

## user-select: none on Non-Editable Elements
Apply `user-select: none; -webkit-user-select: none` to all non-editable UI elements
(labels, badges, headers, cards, node titles, modal chrome, status bars, etc.).
- **Never apply to `body`** — breaks `execCommand("copy")` in WebKit/Chrome.
- **Never apply to `<input>`, `<textarea>`, `<select>`**.
- For clipboard copy: use `navigator.clipboard.writeText()` with `execCommand` fallback.
- If a modal shows read-only content the user might copy (diff, config): leave that element selectable.

## All Icons Must Be SVG (Never Unicode)
Use inline SVG for every icon.
Unicode characters (▶, ✕, ⚙, etc.) blur at non-integer zoom levels, misalign with text
baselines, and render inconsistently across platforms.
