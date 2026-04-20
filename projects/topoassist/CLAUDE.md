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

**Cabling helpers are duplicated** in Code.gs AND Sidebar-js.html for server-side unit testing (Tests.gs is server-side and cannot call client-side JS). Duplicated functions: `getPhysicalPortParent`, `compressPortList`, `_breakoutSides`, `_buildCableGroupsForTest`. All carry `// DUPLICATED in Code.gs ... Last synced: <date>`. Keep in sync when either copy changes. `getPhysicalPortParent` normalizes the lane suffix to `/1` via `parts[parts.length-1]='1'` — never `parts.pop()` (that strips to `Et14` which is not a valid EOS port name). Result is always a valid EOS port: `Et14/4→Et14/1`, `Et5/22/3→Et5/22/1`.

**parseVlanWithNative() is duplicated** in Code.gs AND Sidebar-js.html. Parses the `vlan_` field which may contain an `nv<N>` native-VLAN token (e.g. `10,20,nv100`). Returns `{ native: string|null, vlans: string }`. Keep both copies in sync; both carry `// DUPLICATED ... last synced: <date>`.

**Native VLAN is encoded as `nv<N>` token inside the `vlan_` field** — there is no separate `n_vlan_` column. Example: `10,20,nv100` means allowed VLANs 10,20 with native VLAN 100. Always use `parseVlanWithNative(d.vlan_)` to split the native token before using the VLAN list or generating `switchport trunk native vlan` commands. Never re-introduce a standalone `n_vlan_` column.

**generateConfig() has exactly 5 params**: `(portName, d, ipPrefs, seenPos, netSettings)`. The 5th param is the full 16-flag IP family settings object. Every call site must pass it — omitting silently drops all protocol-family-gated commands. **generateBGP() has 8 params** — `settings` is the 8th; gates peer group emission per flag.

**16 network flags** in `getNetworkSettings()`: P2P (INT_IPV4, INT_IPV6, INT_IPV6_UNNUM) + GW (GW_IPV4, GW_IPV6) + BGP (4) + OSPF (3) + VXLAN (2) + EVPN (2). P2P and GW are fully decoupled in `generateComplexL3Block()` — never use `useIpv6Explicit` to gate GW config. `hasP2pIpv6` gates Lo0 IPv6 / router-id ipv6; `hasAnyIpv6` (adds gw_ipv6) gates VRF `ipv6 unicast-routing`.

**hasKey(setObj, key)** must be used instead of `.has()` for all device name lookups. Device names in Sets are lowercase; sheet names are original-cased — `.has()` will silently miss them.

**APP_VERSION must stay in sync**: `const APP_VERSION` is declared ONLY in `Code.gs` (canonical) and `Sidebar-js.html` (client-side, separate scope). All `.gs` files share one global scope — never redeclare `APP_VERSION` in `Tests.gs` or any other `.gs` file (causes `SyntaxError: Identifier already declared`). All HTML files carry a matching `<!-- TopoAssist vX.Y -->` comment at line 1. Bump Code.gs + Sidebar-js.html + all HTML comments on every release.

**VERSION must stay in sync**: after any `device_bridge.py` change, bump VERSION in both `device_bridge.py` AND the embedded template inside `downloadBridgeScript()` in `Sidebar-js.html`. The `/health` docstring line must also match.

**MLAG is explicit only**: declared via Device Manager (DEVICE_MLAG_PEERS in DocumentProperties). The old PO-count heuristic (≥4 occurrences) was removed. Never re-introduce count-based MLAG detection.

**JetBrains Mono** must be explicitly set on every UI element in Sidebar-css.html. It does NOT inherit from body in Google Apps Script dialogs.

**IPv6 syntax is intentionally non-EOS**: format aligns with IPv4 for lab testing convenience. Do not "fix" it to match EOS syntax.

**SHEETNAME(dummy_cell) must not be removed**: the function is not called by the script — it is used directly by a formula in the IXIA tab of the Google Sheet.

## After Every Change
- List the exact files modified (GAS files vs local `device_bridge.py`)
- Check if `UserGuide.html` needs updating for any user-facing changes
- If editing `buildConditionalRules` in Code.gs: immediately note that the user must do **Save & Sync** in the sheet for conditional format changes to take effect
- Use `/topoassist-review-deploy-gas`, `/topoassist-review-userguide`, `/topoassist-review-code-design`, `/topoassist-review-code-full` slash commands as needed
