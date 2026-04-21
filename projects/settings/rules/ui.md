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

## Input Text State Taxonomy

Every `<input>` has distinct text states. Each must be styled explicitly — none inherit reliably from parent containers.

| State | When | Target | Required styles |
|---|---|---|---|
| **Label** | Always visible beside input | `<label>`, `.ip-label` | `font-family`, `font-size`, `color`, `user-select: none` |
| **Placeholder** | Input is empty | `::placeholder` | `color: #94a3b8`, `font-style: italic` — **never inherits**, always explicit |
| **Value** | User has typed | `input` element | `font-family`, `font-size`, `color: var(--text-main)` |
| **Focus** | Input has keyboard focus | `input:focus` | `border-color: #3b82f6`, `box-shadow: 0 0 0 2px rgba(59,130,246,0.1)`, `outline: none` |
| **Error** | Validation failed | `input-wrapper.has-error input` + `.error-msg` span | Input: `border-color: #ef4444`, box-shadow tint. Error text: `color: #ef4444`, `font-size: 11px`, `font-weight: 500` |
| **Disabled** | `input:disabled` | `input:disabled` | `color: #94a3b8`, `background: var(--bg-body)`, `cursor: not-allowed`, `opacity: 0.6` |
| **Read-only** | `input:read-only` | `input:read-only` | `color: var(--text-main)`, `background: var(--bg-body)`, `cursor: default`, `user-select: text` (copyable) |
| **Prefix / Suffix** | Static unit beside input | `.input-affix` span | `color: #94a3b8`, `font-size: 12px`, `font-weight: 400`, `user-select: none` |
| **Helper / Info** | Annotation outside input | `info-box info-box--dim` | Left-accent border, `font-style: italic`, `color: #94a3b8` |

### Dim-container rule (e.g. `info-box--dim`)
When inputs live inside an annotation container, override both the value AND placeholder explicitly — neither cascades:
```css
.my-dim-container input            { font-style: italic; font-weight: 400; }
.my-dim-container input::placeholder { color: #94a3b8; font-style: italic; }
```

### Error pattern
Add `.has-error` to the `.input-wrapper`; place a `.error-msg` span immediately after the input:
```html
<div class="input-wrapper has-error">
  <label>Field</label>
  <input type="text" ...>
  <span class="error-msg">Required</span>
</div>
```

## Font Scale — Extended (Section Headers)
The 3-level scale (10/11/12px) covers control text. Modal and panel section headers sit above it:
- **13px** — sub-section headers, card titles, collapsible group labels
- **14px** — modal section headers, primary panel titles

Never use arbitrary sizes. Every text element must land on one of these five levels: 10 / 11 / 12 / 13 / 14px.

## `<textarea>` States
`<textarea>` follows the same state taxonomy as `<input>` — all states must be styled explicitly:
- **Placeholder**: `::placeholder { color: #94a3b8; font-style: italic }` — never inherits
- **Value**: `font-family`, `font-size: 12px`, `color: var(--text-main)`
- **Focus**: same as input — `border-color: #3b82f6`, blue box-shadow, `outline: none`
- **Disabled**: `color: #94a3b8`, `background: var(--bg-body)`, `cursor: not-allowed`, `opacity: 0.6`
- **Read-only**: `color: var(--text-main)`, `background: var(--bg-body)`, `user-select: text`
- **Resize**: always set explicitly — `resize: vertical` (user-adjustable height) or `resize: none` (fixed layout). Never leave as browser default.
- **Dim-container override**: same pair as input — explicit `font-style: italic; font-weight: 400` + `::placeholder` rule.

## Inline Code / Config Text
For EOS commands, config snippets, or technical strings displayed inline in labels, descriptions, or info boxes:
```css
code, .inline-code {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;          /* secondary scale — it's reference text, not a control */
  background: var(--bg-body);
  border: 1px solid var(--border-light);
  border-radius: 3px;
  padding: 1px 4px;
  color: var(--text-main);
  user-select: text;        /* always copyable */
  -webkit-user-select: text;
}
```
Never use `<code>` without explicit font-family — it defaults to the browser serif mono, not JetBrains Mono.

## All Icons Must Be SVG (Never Unicode)
Use inline SVG for every icon.
Unicode characters (▶, ✕, ⚙, etc.) blur at non-integer zoom levels, misalign with text
baselines, and render inconsistently across platforms.

## Modal Button Standard (Rule 21)

### Header close button — always an SVG × icon
Every modal must have a close button as the last element in its header, using `.btn-modal-close`:

```html
<button class="btn-modal-close" onclick="closeMyModal()" title="Close">
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
    <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  </svg>
</button>
```

```css
.btn-modal-close {
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; padding: 0;
  border: none; background: transparent; border-radius: 4px;
  cursor: pointer; color: var(--text-muted);
  font-family: 'JetBrains Mono', monospace; flex-shrink: 0;
  transition: background 0.12s, color 0.12s;
  user-select: none; -webkit-user-select: none;
}
.btn-modal-close:hover { background: rgba(0,0,0,0.07); color: var(--text-main); }
```

- **Never** use a text "Close" button or a Unicode ✕ character as the header dismiss control
- The SVG × must always be the **rightmost** element in the modal header
- `.btn-modal-close` must be in the no-select list

### Footer button standard

| Modal type | Footer layout | Button classes |
|---|---|---|
| **Edit/confirm** | `.modal-actions right-align` | Delete (`.btn-danger-mono`, left, `margin-right:auto`, hidden by default) · Cancel (`.btn-mono`) · Save (`.btn-success-mono`) |
| **Action-only** | `.modal-actions right-align` | One or more primary action buttons, no close needed |
| **View-only** | **No footer** — header × only | — |

- Footer buttons: all share same height, font-size, and padding (`.btn-mono` scale)
- Never duplicate the close/cancel across both header and footer
- Never use text "Close" in the header when an SVG × button exists
