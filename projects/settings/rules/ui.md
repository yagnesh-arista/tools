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

## user-select: none on UI Chrome (Not on Visible Text Content)
Apply `user-select: none; -webkit-user-select: none` to **UI chrome only** — elements the user interacts with but does not read as content:
- Buttons, icon buttons, tabs, nav items
- Modal title bars, section headers, collapsible group labels
- Badges, status indicators, tags, node titles
- Tooltips that are purely decorative labels

**Do NOT apply to visible text content** — if the user can read it, they should be able to select and copy it:
- `info-box` / `info-box--dim` text (hints, examples, annotations)
- Description text, help text, captions
- Read-only values displayed in the UI
- Any label whose value a user would reasonably want to copy

**Explicitly set `user-select: text`** on content users clearly need to copy:
- Diffs, configs, EOS commands, IP addresses, paths, generated output

**Hard rules:**
- **Never apply to `body`** — breaks `execCommand("copy")` in WebKit/Chrome.
- **Never apply to `<input>`, `<textarea>`, `<select>`**.
- For clipboard copy buttons: use `navigator.clipboard.writeText()` with `execCommand` fallback.

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

## Search / Filter Input Height (Rule 22)

Browser UA stylesheets inflate `<input>` height beyond what padding alone suggests — a `10px` font with `padding: 3px` renders at ~26px in Chromium/WebKit instead of the expected ~16px. In compact panels, toolbars, or lists, this makes filter inputs visually taller than adjacent icon buttons or list rows, breaking symmetry.

**Rule: every search or filter input in a compact context must pin height explicitly.**

```css
.my-search-input {
  height: 20px;          /* explicit — never rely on browser UA */
  padding: 0 7px;        /* horizontal only — vertical handled by height */
  line-height: 20px;     /* keeps text vertically centered */
  box-sizing: border-box;
  font-size: 10px;       /* match surrounding row scale */
}
```

- Match `height` to the tallest sibling element in the same row or section (icon buttons, list item rows, close buttons)
- Never use top/bottom padding as the only height control — always pair with explicit `height` + `line-height`
- `box-sizing: border-box` is required whenever `height` is set on an input
- Applies to: panel search boxes, toolbar filter inputs, modal search bars, inline keyword filters
- Full-form inputs (modals with labels above) are exempt — they use the standard `padding: 5px 8px` form style

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

### Button ordering — always left-to-right

```
[Delete]  ·····················  [Cancel]  [Primary Action]
 left, isolated                  right-aligned group
 margin-right: auto
 display: none (shown only when editing existing entity)
```

- **Primary action** (Save, Apply, Commit) is always the **rightmost** button
- **Cancel** is always immediately left of the primary action
- **Destructive Delete** is always isolated far-left with `margin-right: auto; display: none`
  — never inline with the Cancel/Save group
- **Secondary actions** (e.g. Reset Defaults, Download) go between Delete and Cancel

### Esc key — every new modal must be in the LIFO close list

Every modal added to the project must be registered in two places in the global `keydown` handler:
1. The `modalOrder` array (determines close priority — put overlay modals first)
2. The `closeFuncs` map (maps modal ID → its canonical close function)

```javascript
const modalOrder = [..., "myNewModal"];
const closeFuncs = {
  ...,
  "myNewModal": closeMyModal
};
```

Omitting either entry means Esc falls through to the global canvas reset instead of closing the modal.

## Modal Scroll + Minimize Baseline (Rule 24)

Every modal must satisfy two baseline requirements before shipping:

### Scroll
Every `.modal-std` modal body must scroll when content exceeds available height. The modal itself has `max-height: 85vh; overflow: hidden; flex-direction: column` — the body div must have:
```css
overflow-y: auto;
flex: 1;
min-height: 0;
```
Apply this via inline style or a `.modal-body` class. **Never leave a modal body without these three properties** — missing any one causes the content to clip silently instead of scrolling.

**GAS iframes note**: `max-height` on a child div is unreliable in GAS dialogs — use `flex: 1; min-height: 0` on the body and let the parent `.modal-std` `max-height: 85vh` constrain it.

### Minimize (floating panels only)
Floating panels (`.modal-floating`, DevView) must minimize to header-only height. CSS `display: none` on children does NOT collapse flex panel height in GAS iframes — you must pin height in JS:

```javascript
if (isMin) {
  panel.style.height = header.offsetHeight + 'px';
  panel.style.overflow = 'hidden';
} else {
  panel.style.height = '';
  panel.style.overflow = '';
}
```

### Overlay (dim backdrop) management on minimize

**Rule: minimizing any modal must hide the dim backdrop (`editOverlay`); restoring must bring it back.**

Modals opened with `editOverlay` visible (configModal, generateAllModal, editModal, pushConfirmModal) keep the backdrop up even after minimize — blocking all background interaction. `toggleModalMinimize()` must manage the overlay:

```javascript
const ov = document.getElementById('editOverlay');
if (ov) {
  if (isMin) {
    modal.dataset.hadOverlay = (ov.style.display === 'block') ? '1' : '0';
    ov.style.display = 'none';
  } else {
    if (modal.dataset.hadOverlay === '1') ov.style.display = 'block';
    delete modal.dataset.hadOverlay;
  }
}
```

- Store whether overlay was visible **before** hiding it (`data-had-overlay`)
- On restore, only show overlay if it was showing before minimize — never show overlay for modals that opened without one
- This is already wired into the shared `toggleModalMinimize()` — never bypass it with a modal-specific minimize function

### Checklist for every new modal
- [ ] Body div has `overflow-y: auto; flex: 1; min-height: 0`
- [ ] Header has `flex-shrink: 0` (or is `flex-shrink: 0` by default as a non-growing flex child)
- [ ] Floating panels: minimize uses JS height-pinning, not CSS-only
- [ ] `.modal-std` modals: minimize uses `.modal-minimized > *:not(.modal-header) { display:none }` (CSS is sufficient for non-floating)
- [ ] `toggleModalMinimize()` handles overlay — do NOT write a modal-specific minimize that skips it
