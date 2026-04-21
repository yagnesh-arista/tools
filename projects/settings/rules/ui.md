# UI Rules (Global — applies to all projects)

## JetBrains Mono on All UI Elements
Every UI element (buttons, inputs, labels, badges, dropdowns, modals, tooltips, status bars)
must explicitly set `font-family: 'JetBrains Mono', monospace`.
Do NOT rely on inheritance — it does not work in Google Apps Script dialogs or some browser contexts.

### Font Scale
Use this 3-level scale consistently across all projects:
- **10px** — category markers, section labels, de-emphasized annotations
- **11px** — secondary text: hints, examples, captions, sub-labels
- **12px** — primary control text: inputs, checkboxes, radio labels, button text, main body

Never go below 10px. Do not mix arbitrary font sizes outside this scale.

## UI/UX Symmetry
Spacing, alignment, sizing, padding, and interactions must be consistent and balanced across all elements.
- Button rows: all buttons share the same height, font size, and padding.
- Modals: if 16px padding on the left, must be 16px on the right.
- **No text overflow**: text must never bleed outside its container — wrap or truncate within the bounding box. Apply `overflow: hidden; text-overflow: ellipsis` or `word-break: break-word` as appropriate.
- **Uniform box sizing in modals**: all sibling boxes/panels inside a modal should share the same width and height unless a specific design reason requires otherwise (e.g. one panel is a scrollable list, another is a fixed form). Never leave one panel significantly taller or wider than its peers without intent.

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

## Modal Default Background
All modals must use a white background (`#ffffff`) by default. Dark mode overrides the
background via a dedicated `--bg-modal` CSS variable or a dark-mode theme selector.
Never hardcode a dark background on a modal outside of a dark-mode rule.
In projects with CSS variables: set `--bg-modal: #ffffff` as the base, and override with
the dark card color only under the dark-mode selector.

## Info / Help Text Boxes (info-box--dim)
Static reference panels (hint text, examples, formula keys, auto-derived value panels) must be visually distinct from actual data values. Use the `info-box info-box--dim` pattern:
- **Left-accent border only**: `border-left: 3px solid var(--border)` — no full border, no border-radius. Signals "aside/annotation".
- **Italic text**: `font-style: italic` cascades to all children — universally reads as "note, not a value".
- **Muted text color**: `#94a3b8` or equivalent dim gray.
- Add `info-box--keep-colors` when the box contains a color legend that must stay distinguishable.
- Warning/error banners (colored background) are excluded — never apply dim styling to those.
- Proactively add info boxes to every modal/panel; ask the user if content is unclear.

## Placeholder Text Must Be Styled Explicitly (Never Inherited)
`::placeholder` does NOT inherit `color`, `font-style`, `font-weight`, or `opacity` from any parent element — the browser resets all inherited styles on `::placeholder`.

**Rule:** Whenever a container applies color or font-style to dim/annotate its content (e.g. `info-box--dim`), any `<input>` inside must also have an explicit `::placeholder` rule to match:
```css
.my-dim-container input::placeholder {
  color: #94a3b8;
  font-style: italic;
}
```
**Checklist:** After adding any color/font-style rule to a container that holds inputs — always add the matching `::placeholder` rule. Never assume it will cascade.

## All Icons Must Be SVG (Never Unicode)
Use inline SVG for every icon.
Unicode characters (▶, ✕, ⚙, etc.) blur at non-integer zoom levels, misalign with text
baselines, and render inconsistently across platforms.
