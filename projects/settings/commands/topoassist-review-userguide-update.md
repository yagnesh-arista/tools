Review UserGuide.html against the current code and design — full structural audit, not just session changes.
Fix every gap found. Do not skip any step.

## Version format
APP_VERSION is `YYMMDD.N` (e.g. `260504.15`). The `<h1>` in UserGuide.html uses `<?= APP_VERSION ?>` (GAS template tag). Do NOT flag this as wrong.

---

## UserGuide structure (as of 2026-05-04)

All `<h2>` sections are auto-wrapped in `<details>/<summary>` by JS. Two sections open by default: **Installation** and **Typical Workflow**.

### Section order and IDs
| ID | Section |
|---|---|
| `#installation` | 📦 Installation |
| `#typical-workflow` | 🗺️ Typical Workflow (10-step user journey) |
| `#device-manager` | 🖥️ Device Manager |
| `#sheet-filling` | 📋 Sheet Filling |
| `#topology-toolbar` | 🔲 Topology Toolbar |
| `#keyboard-shortcuts` | ⌨️ Keyboard Shortcuts |
| `#visual-color-coding` | 🎨 Visual Color Coding |
| `#group-rects` | ⬛ Group Rects |
| `#sheet-schema` | 🔧 Sheet & Schema Management |
| `#config-generation` | ⚙️ Configuration Generation |
| `#audit-engine` | 🛡️ Audit Engine |
| `#device-bridge` | 🔌 Device Bridge |
| `#tips` | 💡 Tips & Notes |
| `#appendix` | 📎 Appendix |

---

## Step 1 — Toolbar Structural Audit (highest drift risk)

The toolbar evolves frequently. Always verify the UserGuide tables against the actual HTML.

### 1a — Read the actual toolbar

```bash
# Primary row sections (toolbar-row primary-row)
grep -n "tb-section\|tb-label\|icon-btn\|segmented-group\|mono-btn\|mono-input\|onclick" \
  ~/claude/projects/topoassist/Sidebar.html | head -80

# Secondary row (toolbar-row secondary-row)
# Holistic floating controls (holistic-controls)
grep -n "holistic-controls\|secondary-row\|toolbar-row" \
  ~/claude/projects/topoassist/Sidebar.html
```

### 1b — Verify each toolbar section exists in UserGuide

For **every** `<div class="tb-section">` in the primary row, check that UserGuide's Primary Row table has a matching row (icon or label matches). Flag any button present in code but absent from the table, and any row in the table that no longer has a matching button.

Sections to verify: APP (Minimize) · LAYOUT (W G) · CABLE (O T) · CABLING (Edit Mode) · CONFIG (Refresh, Tech Stack, IP Config, Global Config Template, Generate All) · VIEW (Collapse All Cards, VLAN Summary, Device Visibility Panel, Snapshot, Cabling Export) · AUDIT (Device Bridge, Audit Mode, Errors Only) · THEME (Bold, Dark/Light) · HELP (Shortcuts)

For the **secondary row**: TOPO (Linear/Simple/Flexible), INT SORT (SHEET/MODE/CAT/A-Z), SEARCH (filter + STRICT), STATUS LIVE LOGS (status bar), STATUS LOGS (HISTORY button).

For **holistic-controls**: Group Rect, Node Size −/+. These must be in the "Holistic-View Floating Controls" subsection — NOT the Primary Row table.

✗ FAIL if any button present in code is missing from the UserGuide.
✗ FAIL if any UserGuide row describes a button that no longer exists.
✗ FAIL if a control is in the wrong subsection (e.g. holistic floating control listed as a primary row toolbar button).

### 1c — Icon SVG accuracy

For each icon in the Primary Row table, compare the SVG `<path d="...">` to the matching button in Sidebar.html.

```bash
# Extract SVG paths from the toolbar section of UserGuide.html
grep -A2 "icon-cell" ~/claude/projects/topoassist/UserGuide.html | grep "path d\|circle\|rect\|line\|polyline" | head -40

# Compare against Sidebar.html button SVGs
grep -A3 "icon-btn\|btn-yellow" ~/claude/projects/topoassist/Sidebar.html | grep "path d\|circle\|rect\|line" | head -40
```

✗ FAIL if an icon's SVG path in UserGuide does not match the actual sidebar button.
✗ FAIL if a button is described as "chevron-down" but the actual SVG is chevron-up (or vice versa).

---

## Step 2 — Section Content Audit

For each major section, read the UserGuide content and cross-check against the current code.

### 2a — Device Manager section

Read `#device-manager` in UserGuide.html and verify against Sidebar-js.html (DeviceManager* functions):

```bash
grep -n "DeviceManager\|openDeviceManager\|deviceManagerSave\|pencil\|dns\|hostname\|inline.*edit\|was-span\|wasChanged\|.changed" \
  ~/claude/projects/topoassist/Sidebar-js.html | head -30
```

Check that the UserGuide covers:
- [ ] Inline editing (no pencil column — click field to edit)
- [ ] Change indicators (green + "was: X" span on text, `.changed` border on selects)
- [ ] DNS name field (per-device hostname for Device Bridge)
- [ ] DID explanation (Loopback0 IP, BGP ASN, VARP last octet)
- [ ] MLAG pairing
- [ ] Non-EOS toggle
- [ ] Model, Rack
- [ ] Visibility (eye icon)

✗ FAIL for any missing item above.

### 2b — Configuration Generation section

Verify the numbered subsections (1–6+) match the actual modals and config generation functions:

```bash
grep -n "^function generate\|^function open.*Modal\|openTechModal\|openIpConfigModal\|openGlobalCfgModal\|openGenerateAllModal" \
  ~/claude/projects/topoassist/Sidebar-js.html | head -20
grep -n "getNetworkSettings\|techModal\|ipConfigModal\|generateAllModal\|globalCfgModal" \
  ~/claude/projects/topoassist/Sidebar-js.html | head -20
```

Check each subsection label matches the current modal name and function.

### 2c — Device Bridge section

```bash
grep -n "^function.*[Bb]ridge\|openBridge\|runCleanup\|reconcile\|Cleanup\|onBridgeIconClick" \
  ~/claude/projects/topoassist/Sidebar-js.html | head -20
grep -n "^def \|^class \|^VERSION\|METHOD\|JUMP_HOST" \
  ~/claude/projects/topoassist/device_bridge.py | head -20
```

Check:
- [ ] Download Bridge step matches actual download function
- [ ] `device_bridge.py` config variables (METHOD, JUMP_HOST, SSH_USER) match UserGuide table
- [ ] Cleanup section (not "Reconcile") is the current terminology
- [ ] Bridge auto-check behavior matches double-click description

### 2d — Audit Engine section

```bash
grep -n "runValidation\|_auditIssues\|auditChecks\|auditModal\|validationErrors\|toggleAuditOnly" \
  ~/claude/projects/topoassist/Sidebar-js.html | head -20
```

Check that documented audit checks match the actual check list in the code.

### 2e — Sheet & Schema Management section

```bash
grep -n "openCheckpointModal\|openColumnManager\|SheetColumnManager\|applyCustomView\|Force Sync\|buildConditionalRules" \
  ~/claude/projects/topoassist/Sidebar-js.html ~/claude/projects/topoassist/Code.gs | head -20
```

Check that menu paths and feature names match current code.

### 2f — Group Rects section

```bash
grep -n "newGroupRect\|groupRectBtn\|holistic-controls\|groupRectModal\|deleteGroupRect" \
  ~/claude/projects/topoassist/Sidebar.html ~/claude/projects/topoassist/Sidebar-js.html | head -15
```

Verify:
- [ ] Group Rect is described as a floating TOPO EDIT panel control (not a toolbar button)
- [ ] Create/edit/delete flow matches current modal
- [ ] localStorage persistence note is accurate

### 2g — Enumeration Completeness

Any list or table in UserGuide.html that enumerates a set of values (interface types, column names, config blocks, SP modes, roles, etc.) must not just name the values — it must explain for each value whether it is:
- **User-entered** (which column or field)
- **Auto-generated** (from which settings or columns)
- **Not configured by TopoAssist** (out of scope)

**The canonical failure pattern**: listing all recognized values in a flat bullet list without saying which ones the user actually touches. A user reading the list cannot tell what they need to enter vs. what happens automatically.

Checks to run:

```bash
# Find <ul> lists and <table> blocks in UserGuide.html that enumerate values
# (interface types, sp_mode_ values, ip_type_ values, roles, etc.)
grep -n "Et\|Vl\|Lo\|Ma\|Po\|Vx\|l2-et\|l3-et\|gw-et\|int_\|sp_mode_\|ip_type_\|svi_vlan_\|vlan_\|po_\|tag_\|role_" \
  ~/claude/projects/topoassist/UserGuide.html | head -40
```

For every enumeration found, check:
- [ ] Interface type table — each of `Et`, `Vx`, `Po`, `Lo`, `Vl`, `Ma` has an explicit "how configured" column or annotation
- [ ] `sp_mode_` values (l2-et-access, l3-et-int, etc.) — each explains what columns pair with it
- [ ] `ip_type_` values — each explains what columns are relevant
- [ ] Any other "code value → meaning" table — does it say where the value comes from?

✗ FAIL if any enumeration table or list names values without explaining which are user-entered vs. auto-generated vs. out of scope.

### 2h — Contextual Completeness

Every instruction, step, or reference in the guide must be self-contained — a user must not need to already know the answer to follow the step.

For every column name, button, field, or value mentioned:
- [ ] Is it clear WHERE to find it? (which modal, which row of the sheet, which toolbar section)
- [ ] Is it clear WHAT to put in it? (format, example value, valid range)
- [ ] Is it clear WHAT HAPPENS as a result? (auto-generated output, downstream effect)
- [ ] Is it clear what NOT to do? (common mistakes — e.g. "do not put Lo in int_")

**The canonical failure pattern**: mentioning a column name (`int_`, `sp_mode_`, `vlan_`) without saying what format it accepts, what values are valid, or what the column controls. A user seeing `vlan_` for the first time should not have to guess.

Check every `<code>` tag that names a column or field:
```bash
grep -o '<code>[a-z_]*_</code>' ~/claude/projects/topoassist/UserGuide.html | sort -u
```

For each column code tag found, verify the surrounding paragraph or a linked section answers: where, what format, what effect, and what to avoid.

✗ FAIL if a column/field is referenced without enough context for a first-time user to fill it correctly.
⚠ WARN if context exists but is in a different section with no cross-reference or link.

---

## Step 3 — Menu Path Accuracy

```bash
# Extract all menu-path spans from UserGuide.html
grep -o '<span class="menu-path">[^<]*</span>' ~/claude/projects/topoassist/UserGuide.html | sort -u
```

For each menu path, verify:
- The menu item exists in `onOpen()` in Code.gs
- The submenu label matches exactly

```bash
grep -n "addItem\|addSubMenu\|addSeparator\|createMenu\|addMenu" \
  ~/claude/projects/topoassist/Code.gs | head -30
```

✗ FAIL if a menu path in UserGuide does not match the actual menu structure in Code.gs.

---

## Step 4 — Session Changes (add what's missing, remove what's stale)

Check git log for any user-facing changes since the last UserGuide update:

```bash
# Changes since last UserGuide commit
git -C ~/claude log --oneline -- projects/topoassist/ | head -20

# What changed in GAS/bridge files recently
git -C ~/claude diff HEAD~5..HEAD --stat -- projects/topoassist/ 2>/dev/null | head -20
```

For each changed file, identify whether any user-facing feature was added, removed, or renamed that the UserGuide does not yet reflect.

---

## Step 5 — Readability & First-User Quality

Read UserGuide.html from the perspective of a new user opening it for the first time — someone who knows EOS but has never used TopoAssist before.

### 5a — Navigation and flow
- [ ] Is there a clear "start here" entry point? (Installation → Typical Workflow should be obvious)
- [ ] Does the Typical Workflow give a complete end-to-end path without assuming prior knowledge?
- [ ] Are sections in the order a user naturally encounters them? (e.g. Device Manager before Config Generation)
- [ ] Does the table of contents (quick-nav or section order) match the actual section sequence?

### 5b — Terminology consistency
- [ ] Is every term used consistently throughout? (e.g. always "Device Manager", never "device manager" or "DM")
- [ ] Are abbreviations expanded on first use? (DID, ASN, VTEP, MLAG, VNI, SVI — are these explained?)
- [ ] Are column names always shown in `<code>` tags? (never bare `int_` without code formatting)

### 5c — Example coverage
- [ ] Does every complex field or column have at least one example value? (e.g. `Et5/1`, `l2-et-trunk`, `10,20,nv100`)
- [ ] Do workflow steps show what the user should see/click, not just what they should do?
- [ ] Are error cases and common mistakes called out? (what happens if you put Lo in int_, what if MLAG + L3, etc.)

### 5d — Completeness of warnings and constraints
- [ ] Is every known constraint mentioned at the point of use, not just buried in Tips?
  - MLAG + L3 is invalid → mentioned in Config Generation section?
  - Only Et and Vx1 go in `int_` → mentioned in Sheet Filling section?
  - Audit errors for wrong interface types → mentioned alongside the interface table?
- [ ] Are audit error conditions explained so the user knows how to fix them, not just that they exist?

### 5e — Readability
- [ ] No paragraph longer than ~5 lines without a break, list, or header
- [ ] No step that requires reading a different section to complete it (or has a visible cross-reference)
- [ ] No jargon used before it is defined in the same section

⚠ WARN for each quality issue found — these are not correctness failures but make the guide harder to use.
✗ FAIL only if a critical path (Installation, Typical Workflow, Sheet Filling) is missing steps or uses undefined terms that would block a new user from completing the task.

---

## Step 6 — Report

```
USERGUIDE AUDIT
===============
Step 1 — Toolbar
  Primary Row: [N buttons in code] / [N rows in UserGuide] — ✓ match / ✗ [list gaps]
  Secondary Row: [N items] — ✓ / ✗
  Holistic Controls: ✓ / ✗
  Icon SVG accuracy: ✓ / ✗ [list mismatches]

Step 2 — Section Content
  2a Device Manager       : ✓ / ✗ [missing items]
  2b Config Generation    : ✓ / ✗
  2c Device Bridge        : ✓ / ✗
  2d Audit Engine         : ✓ / ✗
  2e Sheet & Schema       : ✓ / ✗
  2f Group Rects          : ✓ / ✗
  2g Enumeration complete : ✓ / ✗ [which enumerations are incomplete]
  2h Contextual complete  : ✓ / ✗ [which columns/fields lack context]

Step 3 — Menu Paths       : ✓ / ✗ [mismatches]
Step 4 — Session Changes  : ✓ none / ✗ [gaps]

Step 5 — Readability
  5a Navigation/flow      : ✓ / ⚠ [issues]
  5b Terminology          : ✓ / ⚠ [inconsistencies]
  5c Examples             : ✓ / ⚠ [missing examples]
  5d Warnings/constraints : ✓ / ⚠ / ✗ [critical path failures]
  5e Readability          : ✓ / ⚠

──────────────────────────────────────────
Status: CLEAN — UserGuide matches code and is user-navigable.
        (or: GAPS FOUND — N correctness failures, M quality warnings fixed/flagged.)
```

---

## Step 7 — Apply Fixes + Update INSTRUCTIONS + Commit

After all fixes are applied:

```bash
# Update INSTRUCTIONS
# (bump Last updated with a docs summary)

git -C ~/claude add projects/topoassist/UserGuide.html \
                    projects/topoassist/INSTRUCTIONS_topoassist.txt
git -C ~/claude commit -m "docs(userguide): full audit — fix toolbar, section content, menu paths"
git -C ~/claude push
```

---

## Why session-only checking misses drift

Toolbar restructuring (buttons moved between rows, controls moved to floating panels, new buttons added silently) accumulates across sessions. A session-only check only catches changes made in the current conversation — it misses any drift that predates this session. The structural checks in Steps 1–3 above catch cross-session drift because they compare the live code against the UserGuide content directly, without relying on session context.
