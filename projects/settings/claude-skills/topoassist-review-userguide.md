Review changes made in this session and update UserGuide.html so it always reflects the current design — adding new content, removing stale content, and keeping icon references accurate.

## Version format
APP_VERSION is now `YYMMDD.N` (e.g. `260420.73`) — not the old `v4.5` style.
The h1 in UserGuide.html uses `<?= APP_VERSION ?>` (GAS template tag, injected at runtime via
`createTemplateFromFile().evaluate()`). Do NOT flag this tag as a missing or wrong version.

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
