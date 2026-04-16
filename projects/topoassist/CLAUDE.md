# TopoAssist Project Instructions

## Winnow Usage
When working on this project, always consult Winnow MCP tools before guessing or using web search for any Arista/EOS-specific questions:
- `winnow_query` — for complex questions (protocol behavior, design docs, bugs, feature details)
- `winnow_quick_query` — for fast factual lookups (acronyms, EOS config syntax, quick facts)
- `winnow_health` — if queries are failing unexpectedly

Use Winnow for: EOS feature/config questions, protocol behavior, known bugs, IXIA integration details, CloudVision APIs, AIDs/TOIs related to tested features.

## Critical Design Constraints
These are always enforced. Full details in Section 24 of INSTRUCTIONS_topoassist.txt.

**canonicalizeInterface() is duplicated** in Code.gs AND Sidebar-js.html (intentional — server + client both need it without a round-trip). Both copies have a `// DUPLICATED ... last synced: <date>` comment. Update the date and keep both copies in sync whenever either changes.

**generateConfig() has exactly 5 params**: `(portName, d, ipPrefs, seenPos, underlayProtocol)`. The 5th param drives OSPF per-interface commands in `generateComplexL3Block()`. Every call site must pass it — omitting it silently drops OSPF commands.

**hasKey(setObj, key)** must be used instead of `.has()` for all device name lookups. Device names in Sets are lowercase; sheet names are original-cased — `.has()` will silently miss them.

**VERSION must stay in sync**: after any `device_bridge.py` change, bump VERSION in both `device_bridge.py` AND the embedded template inside `downloadBridgeScript()` in `Sidebar-js.html`. The `/health` docstring line must also match.

**MLAG is explicit only**: declared via Device Manager (DEVICE_MLAG_PEERS in DocumentProperties). The old PO-count heuristic (≥4 occurrences) was removed. Never re-introduce count-based MLAG detection.

**JetBrains Mono** must be explicitly set on every UI element in Sidebar-css.html. It does NOT inherit from body in Google Apps Script dialogs.

**IPv6 syntax is intentionally non-EOS**: format aligns with IPv4 for lab testing convenience. Do not "fix" it to match EOS syntax.

**SHEETNAME(dummy_cell) must not be removed**: the function is not called by the script — it is used directly by a formula in the IXIA tab of the Google Sheet.

## After Every Change
- List the exact files modified (GAS files vs local `device_bridge.py`)
- Check if `UserGuide.html` needs updating for any user-facing changes
- If editing `buildConditionalRules` in Code.gs: immediately note that the user must do **Save & Sync** in the sheet for conditional format changes to take effect
- Use `/version-bump`, `/check-deploy`, `/check-constraints`, `/check-userguide` slash commands as needed
