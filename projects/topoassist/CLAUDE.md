# TopoAssist Project Instructions

## Winnow Usage
When working on this project, always consult Winnow MCP tools before guessing or using web search for any Arista/EOS-specific questions:
- `winnow_query` — for complex questions (protocol behavior, design docs, bugs, feature details)
- `winnow_quick_query` — for fast factual lookups (acronyms, EOS config syntax, quick facts)
- `winnow_health` — if queries are failing unexpectedly

Use Winnow for: EOS feature/config questions, protocol behavior, known bugs, IXIA integration details, CloudVision APIs, AIDs/TOIs related to tested features.

## Critical Design Constraints
These are always enforced. Full details in Section 24 of INSTRUCTIONS_topoassist.txt.

**canonicalizeInterface() is the canonical interface name normalizer** — maps any EOS long-form or freetext interface name to its abbreviated form (`Ethernet25/1→Et25/1`, `Port-Channel10→Po10`, `Vlan100→Vl100`, `Vxlan1→Vx1`, `Loopback0→Lo0`, `Management0→Ma0`). **Never inline these substitutions** — always call `canonicalizeInterface()` in JS/GAS or `_norm_iface()` in device_bridge.py (Python mirror with identical substitution logic but returns lowercase). Use these for every interface name comparison, display normalization, or lookup. Duplicated in Code.gs AND Sidebar-js.html (server + client both need it without a round-trip). Both copies have a `// DUPLICATED ... last synced: <date>` comment — keep in sync whenever either changes.

**Cabling helpers are duplicated** in Code.gs AND Sidebar-js.html for server-side unit testing (Tests.gs is server-side and cannot call client-side JS). Duplicated functions: `getPhysicalPortParent`, `compressPortList`, `_breakoutSides`, `_buildCableGroupsForTest`. All carry `// DUPLICATED in Code.gs ... Last synced: <date>`. Keep in sync when either copy changes. `getPhysicalPortParent` normalizes the lane suffix to `/1` via `parts[parts.length-1]='1'` — never `parts.pop()` (that strips to `Et14` which is not a valid EOS port name). Result is always a valid EOS port: `Et14/4→Et14/1`, `Et5/22/3→Et5/22/1`.

**parseVlanWithNative() is duplicated** in Code.gs AND Sidebar-js.html. Parses the `vlan_` field which may contain an `nv<N>` native-VLAN token (e.g. `10,20,nv100`). Returns `{ native: string|null, vlans: string }`. Keep both copies in sync; both carry `// DUPLICATED ... last synced: <date>`.

**Native VLAN is encoded as `nv<N>` token inside the `vlan_` field** — there is no separate `n_vlan_` column. Example: `10,20,nv100` means allowed VLANs 10,20 with native VLAN 100. Always use `parseVlanWithNative(d.vlan_)` to split the native token before using the VLAN list or generating `switchport trunk native vlan` commands. Never re-introduce a standalone `n_vlan_` column.

**generateConfig() has 6 params**: `(portName, d, ipPrefs, seenPos, netSettings, vx1VlanSet)`. The 5th param is the full 16-flag IP family settings object — every call site must pass it (omitting silently drops all protocol-family-gated commands). The 6th param `vx1VlanSet` is optional (defaults to `new Set()`) — callers inside `getDeviceConfig` pass the real Set; callers from `getTopologyData` (config tooltips) omit it. Never remove the default or calls from `getTopologyData` will throw "vx1VlanSet is not defined". **generateBGP() has 9 params** — `settings` is the 8th; `ipPrefs` is the 9th (provides loBase for loopback/ASN derivation). **generateBGPEvpnOverlay() has 7 params** — `settings` is the 6th, `ipPrefs` is the 7th.

**16 network flags + 3 string fields** in `getNetworkSettings()`: P2P (INT_IPV4, INT_IPV6, INT_IPV6_UNNUM) + GW (GW_IPV4, GW_IPV6) + BGP (4) + OSPF (3) + VXLAN (2) + EVPN (2) + `evpn_service` ('per-vlan'|'vlan-aware-bundle') + `gw_l3_type` ('anycast'|'varp') + `varp_mac` (string). P2P and GW are fully decoupled in `generateComplexL3Block()`. `useAnycastGW = gw_l3_type !== 'varp'` drives `ip address virtual` — works with or without EVPN (no EVPN guard). `useVarpGW = gw_l3_type === 'varp'` drives `ip virtual-router address` — also works without EVPN. `ip virtual-router mac-address` goes in `generateGlobalBlock()` only when `!mlagIsActive && isLeaf && (evpn_ipv4 || evpn_ipv6) && (gw_ipv4 || gw_ipv6)` — standalone LEAF+EVPN+GW only; SPINEs and non-LEAF roles never get it. MLAG block (`generateMlagConfig()`) emits it when `isLeaf && (gw_ipv4 || gw_ipv6)` — MLAG is sufficient, EVPN not required. `isLeaf = deviceRole === 'LEAF'` at the call site; passed as 4th param to `generateGlobalBlock` and 10th to `detectMlagState` (which propagates as 8th to `generateMlagConfig`). Both standalone and MLAG use the same operator-configured `varp_mac` — **no EOS default exists** (`001c.7300.0099` is a convention only). `varp_mac` field stores empty string when unset; `validateTechSettings` Rule 5 blocks save when GW is enabled but `varp_mac` is empty. Never pre-fill the UI field with a default value. MAC must be identical on all switches in the domain. **VARP physical IP must differ from virtual-router IP** — both standalone and vx1 VARP paths use `gwLast + sheetIndex` (or `deviceSheetIndex` for vx1) for the physical `ip address`, and bare `gwLast` for `ip virtual-router address`. Never use the same octet for both (EOS requires distinct IPs).

**MLAG VXLAN uses Split Source IP (modern pattern)**: `generateVxlanBlock()` emits two loopbacks for MLAG devices — **Loopback1** (unique per device, `id.id.id.id`, description `VTEP_UNIQUE`, used as `vxlan source-interface`) and **Loopback10** (shared on both peers, `min.min.max.max` where min/max are the two device IDs, description `VTEP_MLAG_SHARED`, used as `vxlan mlag source-interface Loopback10`). Standalone devices use only Loopback0 as `vxlan source-interface`. The flood list for remote MLAG pairs always uses the shared `min.min.max.max` IP (Lo10); `myVtepIpV4` holds the Lo10 shared IP for dedup at line 6168.

**Vx1 is a logical VTEP port — excluded from topology, cabling, and audit entirely**: `getTopologyData()` nodesOnRow loop `return`s early on `pName === "Vx1"` (forEach) — Vx1 never enters `processRowLinks`, never forms a cable link, never lands in `allNodesData`, and triggers no audit checks. `vx1VlanSet` (Set built from all vx1 SVI VLANs) is passed as 5th arg to `generateComplexL3Block()` — front-panel SVIs for VLANs already in `vx1VlanSet` are skipped (vx1 takes precedence).

**EVPN service model is global (all LEAF devices)**: `evpn_service === 'vlan-aware-bundle'` → single `vlan-aware-bundle EVPN_VLAN_AWARE_BUNDLE` block with RT `asnBase:1` in both `generateBGP()` and `generateBGPEvpnOverlay()`. Never use per-device ASN for bundle RT (must be identical on all VTEPs).

**hasKey(setObj, key)** must be used instead of `.has()` for all device name lookups. Device names in Sets are lowercase; sheet names are original-cased — `.has()` will silently miss them.

**APP_VERSION must stay in sync**: `const APP_VERSION` is declared ONLY in `Code.gs` (canonical) and `Sidebar-js.html` (client-side, separate scope). All `.gs` files share one global scope — never redeclare `APP_VERSION` in `Tests.gs` or any other `.gs` file (causes `SyntaxError: Identifier already declared`). All HTML files carry a matching `<!-- TopoAssist vX.Y -->` comment at line 1. Bump Code.gs + Sidebar-js.html + all HTML comments on every release.

**VERSION must stay in sync**: after any `device_bridge.py` change, bump VERSION in both `device_bridge.py` AND the embedded template inside `downloadBridgeScript()` in `Sidebar-js.html`. The `/health` docstring line must also match.

**MLAG is explicit only**: declared via Device Manager (DEVICE_MLAG_PEERS in DocumentProperties). The old PO-count heuristic (≥4 occurrences) was removed. Never re-introduce count-based MLAG detection.

**Device ID shift detection**: `DEVICE_ID_SNAPSHOT` (DocumentProperties) stores `{deviceName: sheetIndex}` for all Arista devices. `checkDeviceIdShift()` compares current IDs vs snapshot — returns `{shifted:[{name,oldId,newId}], isFirstRun}`. Called on topology load (status-warn if shifted) and checked before push (yellow banner in push modal with "Regenerate All Configs" / "Push Anyway"). `saveDeviceIdSnapshot()` saves current IDs; called by `_regenerateAllConfigs()` and on first push commit. `_regenerateAllConfigs()` iterates all Arista devices via `getDeviceConfig()`, then saves snapshot. Vxlan1 section cleaner (`_SECTION_CLEANERS` in device_bridge.py) ensures `no interface Vxlan1` is prepended before new Vxlan1 block — prevents stale flood vtep IPs from persisting after device ID shifts. **IPv6 address cleanup (comprehensive)**: EOS IPv4 `ip address` replaces in-place; IPv6 is always additive — without cleanup, old addresses persist after device ID shifts or IP prefix changes. Rules: (1) `no ipv6 address` before every `ipv6 address` on Lo0/Lo1/Lo10, P2P Ethernet (snake and regular), GW SVIs (VARP paths, non-EVPN); (2) `default ipv6 address virtual` before every `ipv6 address virtual` on GW SVIs (Anycast — MLAG and standalone) and vx1 Anycast SVIs; (3) vx1 VARP SVIs use `no ipv6 address`. Never add `ipv6 address` anywhere without the matching cleanup line immediately before it.

**JetBrains Mono** must be explicitly set on every UI element in Sidebar-css.html. It does NOT inherit from body in Google Apps Script dialogs.

**IPv6 syntax is intentionally non-EOS**: format aligns with IPv4 for lab testing convenience. Do not "fix" it to match EOS syntax.

**SHEETNAME(dummy_cell) must not be removed**: the function is not called by the script — it is used directly by a formula in the IXIA tab of the Google Sheet.

## After Every Change
- List the exact files modified (GAS files vs local `device_bridge.py`)
- Check if `UserGuide.html` needs updating for any user-facing changes
- If editing `buildConditionalRules` in Code.gs: immediately note that the user must do **Save & Sync** in the sheet for conditional format changes to take effect
- Use `/topoassist-review-deploy`, `/topoassist-review-userguide`, `/topoassist-review-code-design`, `/topoassist-review-code-full` slash commands as needed
