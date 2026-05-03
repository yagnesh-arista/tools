Review changes made in this session and update UserGuide.html so it always reflects the current design — adding new content, removing stale content, and keeping icon references accurate.

## Version format
APP_VERSION is now `YYMMDD.N` (e.g. `260420.73`) — not the old `v4.5` style.
The h1 in UserGuide.html uses `<?= APP_VERSION ?>` (GAS template tag, injected at runtime via
`createTemplateFromFile().evaluate()`). Do NOT flag this tag as a missing or wrong version.

---

## UserGuide structure (as of 2026-05-03)

All `<h2>` sections are auto-wrapped in `<details>/<summary>` by JS at DOMContentLoaded.
Two sections are open by default: **Installation** and **Typical Workflow**. All others start closed.
A `.quick-nav` grid at the top provides anchor links to every section.

### Section order and IDs
| ID | Section |
|---|---|
| `#installation` | 📦 Installation |
| `#typical-workflow` | 🗺️ Typical Workflow (replaced Quick Start; 10-step user journey) |
| `#device-manager` | 🖥️ Device Manager (DID, MLAG pairing, Non-EOS toggle, Model/Rack, Visibility, mid-project insert callout) |
| `#sheet-filling` | 📋 Sheet Filling (progressive views: Cabling→Mode→Speed/Xcvr→Vlan→Show All; SheetAssist Panel; formatting; connecting interfaces) |
| `#topology-toolbar` | 🔲 Topology Toolbar |
| `#keyboard-shortcuts` | ⌨️ Keyboard Shortcuts |
| `#visual-color-coding` | 🎨 Visual Color Coding |
| `#group-rects` | ⬛ Group Rects (Simple view only; localStorage persistence) |
| `#sheet-schema` | 🔧 Sheet & Schema Management |
| `#config-generation` | ⚙️ Configuration Generation (incl. Snake Test sub-section) |
| `#audit-engine` | 🛡️ Audit Engine |
| `#device-bridge` | 🔌 Device Bridge (Cleanup section — was "Reconcile" before 2026-05-03) |
| `#tips` | 💡 Tips & Notes |
| `#appendix` | 📎 Appendix (Checkpoints, Snake Test reference, Custom View) |

### Key renames since last review
- **Quick Start → Typical Workflow** (10-step guide replacing the old 4-step quick start)
- **Reconcile → Cleanup** (Device Bridge modal button and h3 heading)
- **Checkpoints** moved from Sheet & Schema Management → Appendix
- New sections added: Device Manager, Sheet Filling, Group Rects, Appendix

### What the Device Manager section covers
DID (Device ID) — sequential Arista device index driving Lo0 IP (`id.id.id.id/32`), BGP ASN
(`asn_base+DID`), VARP physical IP last octet. DID shifts when a device is inserted mid-project
(amber callout box). MLAG Pairing UI. Non-EOS toggle (EOS badge click). Model & Rack fields.
Visibility (eye icon).

### What the Sheet Filling section covers
Progressive column views (Cabling→Mode→Speed/Xcvr→Vlan→Show All). SheetAssist Panel.
Sheet formatting (auto-applied; re-sync via Save & Sync + Apply GSheet Coloring). Connecting
interfaces (sheet matrix vs Visual Edit Mode).

### What the Group Rects section covers
Draw mode (Simple view only, dashed-square toolbar button). Create/edit/delete rect.
localStorage persistence (not written to sheet).

---

## Step 1 — What changed this session?

Summarize every file edited this session and what changed. Focus on anything user-facing:
- New UI elements, buttons, panels, or modals
- Changed button names, labels, or workflows
- New features or removed features
- Changed behavior of existing features (push flow, LLDP check, config generation, etc.)
- New or removed Device Manager fields (roles, MLAG peer, tags, etc.)
- Renamed config blocks or sections

---

## Step 2 — Add missing content

For each user-facing change: does UserGuide.html have a section covering it?
- If no section exists — add one now in the appropriate place.
- If a section exists but is incomplete or wrong — update it.

---

## Step 3 — Remove stale content (mandatory)

Read UserGuide.html and check every section against the current code. Flag and remove:
- References to features, buttons, fields, or workflows that no longer exist
- Old config block names that were renamed (e.g. if `080_SNAKE` was split, update references)
- Descriptions of behavior that the code no longer does
- Field names, menu paths, or UI labels that have changed

✗ FAIL if stale content is found and not removed — do not leave outdated docs in place.

Cross-check against Code.gs and Sidebar-js.html to verify:
- Every menu path mentioned in UserGuide.html still exists in the code
- Every config block name (e.g. `080_SNAKE`, `081_SNAKE_PBR`) mentioned is still generated
- Every field name in tables matches the current sheet schema or UI field names

---

## Step 4 — Icon accuracy check (mandatory)

UserGuide.html references toolbar icons and action buttons using inline SVG. These must always
match what is actually rendered in the sidebar.

For every icon referenced in UserGuide.html (e.g. inside `.inline-icon` spans or described in
text as "the X button"):
1. Find the matching button or icon in Sidebar.html or Sidebar-js.html.
2. Compare the SVG path data — do they match?
3. If the icon in the sidebar changed (new SVG path, replaced with a different icon symbol),
   update the inline SVG in UserGuide.html to match.
4. If UserGuide.html describes an icon by shape or name (e.g. "the globe icon", "the shield icon"),
   verify the sidebar still uses that icon for that function.

✗ FAIL if any icon in UserGuide.html does not match what the sidebar actually shows — update it.
✗ FAIL if a button referenced in UserGuide.html no longer has an icon (or vice versa).

---

## Step 5 — Report

Report:
- What was added to UserGuide.html (section name + why)
- What was removed from UserGuide.html (what was stale + why)
- What was updated in place
- Icon changes: which icons were verified, which were updated
- If nothing changed: confirm and explain why UserGuide.html is already accurate

Do not skip this check. UserGuide.html is the only end-user documentation.
