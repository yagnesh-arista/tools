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

**`svi_vlan_` is 1-4094 guarded; `vlan_` is not** — `_parseSviVlans()` silently drops any VLAN outside 1-4094 before generating `interface Vlan<N>` commands. `vlan_` has no such guard — values like 8888 are valid for L3-et/po-int sub-interface config (encapsulation dot1q). Never add a 1-4094 check on `vlan_` itself.

**Native VLAN is encoded as `nv<N>` token inside the `vlan_` field** — there is no separate `n_vlan_` column. Example: `10,20,nv100` means allowed VLANs 10,20 with native VLAN 100. Always use `parseVlanWithNative(d.vlan_)` to split the native token before using the VLAN list or generating `switchport trunk native vlan` commands. Never re-introduce a standalone `n_vlan_` column.

**generateConfig() has 6 params**: `(portName, d, ipPrefs, seenPos, netSettings, vx1VlanSet)`. The 5th param is the full 16-flag IP family settings object — every call site must pass it (omitting silently drops all protocol-family-gated commands). The 6th param `vx1VlanSet` is optional (defaults to `new Set()`) — callers inside `getDeviceConfig` pass the real Set; callers from `getTopologyData` (config tooltips) omit it. Never remove the default or calls from `getTopologyData` will throw "vx1VlanSet is not defined". **GW config is role-split**: `getDeviceConfig()` builds `callSettings = Object.assign({}, settings, { deviceRole })` and passes it to ALL `generateConfig()` calls. `generateComplexL3Block()` → `getIpBlock()` enters the GW branch for ALL roles when `ipType.includes("gw")`, then branches on `deviceRole`: **LEAF** gets anycast (`ip address virtual`) or VARP (`ip virtual-router address`) per GW settings; **non-LEAF (SPINE/HARNESS/etc)** gets plain `ip address gw_v4_first.oct2.oct3.gwLastV4/mask` — uses `gwLastV4` (`parseInt(cfg.gw_v4_last)`), the same operator-configured last octet as LEAF anycast; NOT `sheetIndex` (device counter is arbitrary, not the intended gateway address). Never pass bare `settings` (without `deviceRole`) to `generateConfig()` from `getDeviceConfig()` — omitting `deviceRole` silently gives SPINE the LEAF path. **generateBGP() has 9 params** — `settings` is the 8th; `ipPrefs` is the 9th (provides loBase for loopback/ASN derivation). **generateBGPEvpnOverlay() has 7 params** — `settings` is the 6th, `ipPrefs` is the 7th.

**16 network flags + 3 string fields** in `getNetworkSettings()`: P2P (INT_IPV4, INT_IPV6, INT_IPV6_UNNUM) + GW (GW_IPV4, GW_IPV6) + BGP (4) + OSPF (3) + VXLAN (2) + EVPN (2) + `evpn_service` ('per-vlan'|'vlan-aware-bundle') + `gw_l3_type` ('anycast'|'varp') + `varp_mac` (string). P2P and GW are fully decoupled in `generateComplexL3Block()`. `useAnycastGW = gw_l3_type !== 'varp'` drives `ip address virtual` — works with or without EVPN (no EVPN guard). `useVarpGW = gw_l3_type === 'varp'` drives `ip virtual-router address` — also works without EVPN. `ip virtual-router mac-address` goes in `generateGlobalBlock()` only when `!mlagIsActive && isLeaf && (evpn_ipv4 || evpn_ipv6) && (gw_ipv4 || gw_ipv6)` — standalone LEAF+EVPN+GW only; SPINEs and non-LEAF roles never get it. MLAG block (`generateMlagConfig()`) emits it when `isLeaf && (gw_ipv4 || gw_ipv6)` — MLAG is sufficient, EVPN not required. `isLeaf = deviceRole === 'LEAF'` at the call site; passed as 4th param to `generateGlobalBlock` and 10th to `detectMlagState` (which propagates as 8th to `generateMlagConfig`). Both standalone and MLAG use the same operator-configured `varp_mac` — **no EOS default exists** (`001c.7300.0099` is a convention only). `varp_mac` field stores empty string when unset; `validateTechSettings` Rule 5 blocks save when GW is enabled but `varp_mac` is empty. Never pre-fill the UI field with a default value. MAC must be identical on all switches in the domain. **VARP physical IP must differ from virtual-router IP** — both standalone and vx1 VARP paths use `gwLast + sheetIndex` (or `deviceSheetIndex` for vx1) for the physical `ip address`, and bare `gwLast` for `ip virtual-router address`. Never use the same octet for both (EOS requires distinct IPs).

**MLAG VXLAN loopback pattern**: Lo0 and Lo1 each have their own configMap sections — `configMap["000_LO0"]` (all Arista devices, `id.id.id.id`, BGP/router-id + `vxlan source-interface Loopback0`) and `configMap["000_LO1"]` (MLAG VTEP only: `isVxlan && mlagState.isActive && hasP2p && gwVlans.size>0`, shared `min.min.max.max` IP, description `VTEP_MLAG_SHARED`, `vxlan mlag source-interface Loopback1`). `generateSystemBlocks()` returns `{lo0, system}` — caller assigns each key separately. `generateVxlanBlock()` does NOT emit `interface Loopback1` or a leading `!` — `055_VXLAN.full` starts cleanly with `interface Vxlan1`. `_openLoopbackConfig()` directly accesses `data["000_LO0"]`/`data["000_LO1"]` (never via `_extractInterfaceBlock` — the old preamble in 001_SYSTEM blocked it). `showLoopbackTooltip()` mirrors `showVx1Tooltip()`. Flood list still uses shared `min.min.max.max` IP (`myVtepIpV4`) for dedup.

**Vx1 is a logical VTEP port — excluded from topology, cabling, and audit entirely**: `getTopologyData()` nodesOnRow loop `return`s early on `pName === "Vx1"` (forEach) — Vx1 never enters `processRowLinks`, never forms a cable link, never lands in `allNodesData`, and triggers no audit checks. `vx1VlanSet` (Set built from all vx1 SVI VLANs) is passed as 5th arg to `generateComplexL3Block()` — front-panel SVIs for VLANs already in `vx1VlanSet` are skipped (vx1 takes precedence).

**EVPN service model is global (all LEAF devices)**: `evpn_service === 'vlan-aware-bundle'` → single `vlan-aware-bundle EVPN_VLAN_AWARE_BUNDLE` block with RT `asnBase:1` in both `generateBGP()` and `generateBGPEvpnOverlay()`. Never use per-device ASN for bundle RT (must be identical on all VTEPs).

**hasKey(setObj, key)** must be used instead of `.has()` for all device name lookups. Device names in Sets are lowercase; sheet names are original-cased — `.has()` will silently miss them.

**APP_VERSION must stay in sync**: `const APP_VERSION` is declared ONLY in `Code.gs` (canonical) and `Sidebar-js.html` (client-side, separate scope). All `.gs` files share one global scope — never redeclare `APP_VERSION` in `Tests.gs` or any other `.gs` file (causes `SyntaxError: Identifier already declared`). All HTML files carry a matching `<!-- TopoAssist vX.Y -->` comment at line 1. Bump Code.gs + Sidebar-js.html + all HTML comments on every release.

**`device_bridge.py` and its embedded template are two independent copies of the same Python code — any logic change must be applied to BOTH files in the same edit session**: the standalone `device_bridge.py` (running on the Mac) and the embedded template inside `downloadBridgeScript()` in `Sidebar-js.html` (what users download) are structurally separate and have no shared import or link. Editing one without the other silently leaves the downloaded script stale. This applies to every change: new functions, modified function bodies, new parameters, new fields in the response dict, new branches. A VERSION bump alone is not sufficient.

**VERSION must stay in sync**: after any `device_bridge.py` change, bump VERSION in both `device_bridge.py` AND the embedded template inside `downloadBridgeScript()` in `Sidebar-js.html`. The `/health` docstring line must also match.

**Push sync invariant — single-device push and Push All must be equivalent**: both send `all_ifaces: true` and `allDeviceNames: [all Arista device IDs]`. `_find_ta_orphans(ip, config_text, all_device_names)` cleans: (1) interface orphans — `default interface X` / `no interface X` for `#TA`-tagged interfaces not in `config_text`; (2) BGP neighbor orphans — `router bgp ASN / no neighbor X` for global-context neighbors with `#TA` descriptions (`To DevName via iface #TA` OR `Overlay to DevName #TA`) where DevName is not in `all_device_names` (global BGP context only — splits on first `vrf` sub-context line); (3) VLAN orphans — `no vlan X` for VLANs with `#TA` in name (via `show vlan | json`) not in `config_text` `vlan N` lines; skips 4093/4094; (4) VRF orphans — `no vrf instance VRFNAME` for VRFs with `description ... #TA` (via SSH `show running-config | section vrf instance`) not in `config_text` `vrf instance` lines. Never omit `all_ifaces: true` or `allDeviceNames` from the POST body — omitting either silently skips cleanup. **#TA tagging**: ALL config elements generated by TopoAssist carry `#TA` — interface descriptions, BGP neighbor descriptions, VLAN names (`VLAN0010_#TA` — underscore, NOT space; EOS rejects spaces in vlan name), VRF descriptions (`VRFNAME #TA`), MLAG VLAN names (`MLAG_L3_UNDERLAY_PEERING_#TA`, `MLAG_CONTROL_PLANE_#TA`). `desc_` column: `#TA` always appended; guard prevents double-append if user already wrote `#TA`. **Reconcile vs Push**: Reconcile is read-only (reports stale interfaces + BGP orphans — VLAN/VRF orphan detection requires config_text, so reconcile shows interfaces/BGP only); Push auto-cleans all four categories in the same configure session.

**Audit log is state-based (`_auditIssues`), not event-based**: `let _auditIssues = []` is the single source of truth — cleared and rebuilt from scratch on every `runValidation()`. Design issues pushed from `validationErrors`; live issues built by iterating `bridgePortStatus` (NOT `_lastBridgeResults` — see below). The Audit tab renders via `renderAuditLog()` which reads `_auditIssues` directly — never filtered `statusLog`. `_updateLogTabCounts()` uses `_auditIssues.length` for the audit badge. `clearStatusLog()` also clears `_auditIssues`. There is NO `_loggedAuditErrors` set and NO `logIssues` gate. Summary "Audit: N Issues Found" always emitted. Never call `setStatus('[Audit...]')` directly — always push to `validationErrors[key]` or `_auditIssues`. For device-level checks without a port, use a synthetic key: `validationErrors[\`_mlag_peer_${pairKey}\`]`. Log routing: `[Audit - Live]` → statusLog (All/Errors tabs) + Audit tab (via _auditIssues); `[Audit - Design]` → Audit tab only; `[Bridge]` → statusLog Bridge tab only. Both `bridgePortStatus` and `_lastBridgeResults` set atomically in `_compareBridgeData`. **`bridgePortStatus` is the classification source for live LLDP audit entries** — `'mismatch'`→`bridgeAuditFlagMismatch`, `'missing'`→`bridgeAuditFlagMissing`. `_lastBridgeResults` is a detail-message lookup only (`_portToResult` map, keyed by port ID). Never classify by `r.msg` content (e.g. `r.msg.includes('no LLDP neighbor')`) — a joined link message describes both ends; parsing it mis-routes mixed-case links (wrong neighbor one end, no neighbor other). `_logBridgeIssuesToStatusLog` applies the same rule: uses `bridgePortStatus[r.u/r.v]` for `hasMismatch`, not `noNeighbor`. Dedup in `_auditIssues` live section: `_bridgeAuditSeen` Set keyed by sorted link pair prevents double-entries when both ends appear in `bridgePortStatus`.

**`selectedLineId` is a rendering variable — never read in async callbacks or click handlers.** It is cleared by `redrawLinks()` (when link coords are null) and `filterTopology()` (on any search change), both without hiding the strip UI. By the time a GAS `withSuccessHandler` or click handler fires, `selectedLineId` is often null. Use `_leftDev`/`_rightDev`/`_leftPort`/`_rightPort` for link identity in async work — set by `selectLine()`, stable across render cycles. `selectedDeviceId` is safe in async callbacks (not cleared by render pipeline). Root cause of 2026-04-28 strip-amber + View-"select a device or link first" bug.

**MLAG is explicit only**: declared via Device Manager (DEVICE_MLAG_PEERS in DocumentProperties). The old PO-count heuristic (≥4 occurrences) was removed. Never re-introduce count-based MLAG detection.

**Device ID shift detection**: `DEVICE_ID_SNAPSHOT` (DocumentProperties) stores `{deviceName: sheetIndex}` for all Arista devices. `checkDeviceIdShift()` compares current IDs vs snapshot — returns `{shifted:[{name,oldId,newId}], isFirstRun}`. Called on topology load (status-warn if shifted) and checked before push (yellow banner in push modal with "Regenerate All Configs" / "Push Anyway"). `saveDeviceIdSnapshot()` saves current IDs; called by `_regenerateAllConfigs()` and on first push commit. `_regenerateAllConfigs()` iterates all Arista devices via `getDeviceConfig()`, then saves snapshot. **Vxlan additive sub-command cleanup is in the generated config (Code.gs)**: `generateVxlanBlock()` always emits `default vxlan vlan 1-4094 vni` + `default vxlan flood vtep` as the first sub-commands in the `interface Vxlan1` block (before `vxlan udp-port 4789`). These clear all stale vlan-vni mappings and flood vtep entries before new config is pushed. EOS no-ops them when nothing is configured. `device_bridge.py` does NOT modify config during push — the generated config is the single source of truth. Never re-introduce a push-time injection (`_prepend_section_cleaners` was removed). **IPv6 address cleanup (comprehensive)**: EOS IPv4 `ip address` replaces in-place; IPv6 is always additive — without cleanup, old addresses persist after device ID shifts or IP prefix changes. Rules: (1) `no ipv6 address` before every `ipv6 address` on Lo0/Lo1/Lo10, P2P Ethernet (snake and regular), GW SVIs (VARP paths, non-EVPN); (2) `default ipv6 address virtual` before every `ipv6 address virtual` on GW SVIs (Anycast — MLAG and standalone) and vx1 Anycast SVIs; (3) vx1 VARP SVIs use `no ipv6 address`. Never add `ipv6 address` anywhere without the matching cleanup line immediately before it.

**JetBrains Mono** must be explicitly set on every UI element in Sidebar-css.html. It does NOT inherit from body in Google Apps Script dialogs.

**IPv6 syntax is intentionally non-EOS**: format aligns with IPv4 for lab testing convenience. Do not "fix" it to match EOS syntax.

**SHEETNAME(dummy_cell) must not be removed**: the function is not called by the script — it is used directly by a formula in the IXIA tab of the Google Sheet.

## Design Review — Find Bar / Textarea Search

Any modal that has a find bar searching inside a `<textarea>` must follow the Ctrl+F bar pattern:

**Rule: focus never leaves the find input — `inp.focus()` is unconditional at the end of every jump.**

`setSelectionRange()` requires the textarea to have focus momentarily, so `ta.focus()` then `ta.setSelectionRange()` is correct — but must always be followed by `inp.focus()` to return focus to the search input. Without this, the first jump steals focus to the textarea, and the next keystroke (Enter, character) goes to the content instead of the find bar.

**The global-cfg-modal bug (2026-04-30) is the canonical example:** `_gcfgJumpTo()` called `ta.focus()` without returning focus to `inp`, so typing a character jumped focus to the textarea after the first match, and pressing Enter a second time replaced the selected matched text with a newline.

**Checklist for any new textarea find bar:**
- [ ] `ta.focus()` → `ta.setSelectionRange()` → scroll → **`inp.focus()`** — always, no conditional
- [ ] `oninput` handler calls jump — focus returns to inp ✓
- [ ] Enter/Shift+Enter calls jump — focus returns to inp ✓
- [ ] Prev/Next buttons call jump — focus returns to inp ✓
- [ ] Escape clears the find bar and keeps focus in inp (not in textarea)
- [ ] Global `topologyKeyHandler` Escape block checks `inp.value.trim() !== ""` and clears first before closing the modal (mirror the `configModal` guard pattern)

## Design Review — Single Source of Truth

Before writing any logic that classifies, routes, or counts data:

**Rule: structured data drives logic; display strings drive display only.**

| ✓ Do | ✗ Never |
|---|---|
| Read `bridgePortStatus[portId]` (`'mismatch'`/`'missing'`) to classify | Parse `r.msg.includes('no LLDP neighbor')` to classify |
| Use `_auditIssues.length` for count/badge | Filter `statusLog` by type for count |
| Use `e.src === 'live'` / `e.cls` to route | Scan `e.msg` prefixes to route |
| One array/map owns a state; readers are read-only | Two arrays tracking "the same thing" diverge under edge cases |

**The mixed-case LLDP bug (2026-04-29) is the canonical example:** `r.msg` was a joined string of both link ends — one end's "no LLDP neighbor" substring caused wrong routing for the other end's 'mismatch' port status. Fix: use `bridgePortStatus[portId]` (enum value, per-port) not `r.msg` (display text, per-link, lossy join).

**Checklist for any new routing/classification/count logic:**
- [ ] Is the source a structured value (enum, boolean, Set, length)? If not, find one.
- [ ] Does any display string combine multiple conditions into one field? Never parse it for routing.
- [ ] Is the same state tracked in two places? Eliminate the secondary tracker or make it a strict read-only view.
- [ ] Does count come from the same array that drives the UI? If not, they will diverge.

## Config State — `configCache` Is the Only Store

`configCache[deviceName].data` is the **sole source of truth** for device config. There are no secondary stores.

| What you need | How to get it |
|---|---|
| Is config loaded? | `!!configCache[devName]` |
| Full config string | `formatConfigText(configCache[devName].data)` |
| Per-port config string | `allNodesData["Dev:Port"].details.config` (set by `processDeviceConfig`) |

**Never introduce** `allDevicesData[dev].fullConfig`, `allDevicesData[dev].configLoaded`, or `allNodesData[id].details.configLoaded` — these were removed in the 2026-04-29 refactor because `_selectiveConfigInvalidate` only evicted `configCache` and left them stale, silently defeating cache invalidation.

When `delete configCache[devName]` is called (eviction, clear), that is the complete invalidation — no other state needs to be cleared.

## After Every Change
- List the exact files modified (GAS files vs local `device_bridge.py`)
- Check if `UserGuide.html` needs updating for any user-facing changes
- If editing `buildConditionalRules` in Code.gs: immediately note that the user must do **Save & Sync** in the sheet for conditional format changes to take effect
- Use `/topoassist-review-deploy`, `/topoassist-review-userguide`, `/topoassist-review-code-design`, `/topoassist-review-code-full` slash commands as needed
