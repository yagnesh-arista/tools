# TopoAssist Project Instructions

## Winnow Usage
When working on this project, always consult Winnow MCP tools before guessing or using web search for any Arista/EOS-specific questions:
- `winnow_query` — for complex questions (protocol behavior, design docs, bugs, feature details)
- `winnow_quick_query` — for fast factual lookups (acronyms, EOS config syntax, quick facts)
- `winnow_health` — if queries are failing unexpectedly

Use Winnow for: EOS feature/config questions, protocol behavior, known bugs, IXIA integration details, CloudVision APIs, AIDs/TOIs related to tested features.

## Deployment — Clasp Auth Rules
- Always run `clasp login --status` before `clasp push` — confirm auth is valid first (expired credentials fail silently as a PATH error).
- **Never run `clasp login` from two terminals simultaneously** — concurrent logins corrupt the refresh token and require full re-authentication.
- If push fails unexpectedly, check auth before debugging PATH or environment.

## Key Files — Always Check All When Renaming or Refactoring
Any rename of a variable, function, column name, or element ID must be grep'd across ALL of these before committing:
- `Code.gs` — backend logic, config generation, sheet ops
- `Sidebar-js.html` — frontend UI, all JS closures and DOM refs
- `Test-gs.gs` — server-side GAS unit tests
- `test-js.js` — client-side JS unit tests
- `INSTRUCTIONS_topoassist.txt` — design doc (function refs, column names, invariants)
- `topoassist-review-code-design.md` — constraint checklist (check names, param counts)

Missing any one of these in a rename is the most common source of follow-up correction rounds.

## Critical Design Constraints
These are always enforced. Full details in Section 24 of INSTRUCTIONS_topoassist.txt.

**VRF mapping is token-based, not index-based**: `_buildVrfMap(vrfVal, vlanVal)` builds a `Map<vlanInt, vrf>` by pairing VRF tokens to raw VLAN tokens (comma-split, ranges kept as units, each range expands to all its VLANs). `_resolveVrfForVlan(vrfMap, vrfList, vlan)` looks up by VLAN integer. Single-VRF case: `_buildVrfMap` returns null; `_resolveVrfForVlan` falls back to `vrfList[0]`. `'default'` → null (no vrf sub-command) at both paths. `_resolveVrfAtIndex` is legacy — kept for existing tests; all config-gen call sites (Vx1 SVI, l2-trunk SVI, sub-int) use `_resolveVrfForVlan`. Never re-introduce index-based lookup in config gen. `_auditVrfIssues` counts comma tokens (not expanded VLANs) — ranges count as one VRF slot.

**canonicalizeInterface() is the canonical interface name normalizer** — maps any EOS long-form or freetext interface name to its abbreviated form (`Ethernet25/1→Et25/1`, `Port-Channel10→Po10`, `Vlan100→Vl100`, `Vxlan1→Vx1`, `Loopback0→Lo0`, `Management0→Ma0`). **Never inline these substitutions** — always call `canonicalizeInterface()` in JS/GAS or `_norm_iface()` in device_bridge.py (Python mirror with identical substitution logic but returns lowercase). Use these for every interface name comparison, display normalization, or lookup. Duplicated in Code.gs AND Sidebar-js.html (server + client both need it without a round-trip). Both copies have a `// DUPLICATED ... last synced: <date>` comment — keep in sync whenever either changes.

**Cabling helpers are duplicated** in Code.gs AND Sidebar-js.html for server-side unit testing (Test-gs.gs is server-side and cannot call client-side JS). Duplicated functions: `getPhysicalPortParent`, `compressPortList`, `_breakoutSides`, `_buildCableGroupsForTest`. All carry `// DUPLICATED in Code.gs ... Last synced: <date>`. Keep in sync when either copy changes. `getPhysicalPortParent` normalizes the lane suffix to `/1` via `parts[parts.length-1]='1'` — never `parts.pop()` (that strips to `Et14` which is not a valid EOS port name). Result is always a valid EOS port: `Et14/4→Et14/1`, `Et5/22/3→Et5/22/1`.

**parseVlanWithNative() is duplicated** in Code.gs AND Sidebar-js.html. Parses the `vlan_` field which may contain an `nv<N>` native-VLAN token (e.g. `10,20,nv100`). Returns `{ native: string|null, vlans: string }`. Keep both copies in sync; both carry `// DUPLICATED ... last synced: <date>`.

**`svi_vlan_` is 1-4094 guarded; `vlan_` is not** — `_parseSviVlans()` silently drops any VLAN outside 1-4094 before generating `interface Vlan<N>` commands. `vlan_` has no such guard — values like 8888 are valid for L3-et/po-int sub-interface config (encapsulation dot1q). Never add a 1-4094 check on `vlan_` itself.

**`allVlans` (system VLAN table) — L2 ports + Vx1** — `collectDeviceData()` `analyzeRow()` adds `vlan_` values to `allVlans` when `sp_mode_` starts with `'l2'` (`l2-et-access`, `l2-et-trunk`, `l2-po-access`, `l2-po-trunk`). Additionally, the Vx1-specific post-analyzeRow block adds Vx1 `vlan_` values to `allVlans` (generates `vlan N / name VLANNNNN__TA`) AND `gwVlans` (VNI mapping) — both own-device and MLAG-peer paths. L3 ports (`l3-et-int`, `l3-et-sub-int`, `l3-po-int`, `l3-po-sub-int`) use `vlan_` for encapsulation dot1q only — no `vlan N / name X` entry is generated. Native VLAN (`nv<N>`) is gated on `isL2` (Vx1 has no native VLAN concept). GW VLANs are safe: GW ports use `l2-et-trunk` or `l2-po-trunk`, so `isL2=true` and they still reach `allVlans`. Never remove the `isL2` guard or L3 sub-int encap tags will generate spurious VLAN table entries.

**Native VLAN is encoded as `nv<N>` token inside the `vlan_` field** — there is no separate `n_vlan_` column. Example: `10,20,nv100` means allowed VLANs 10,20 with native VLAN 100. Always use `parseVlanWithNative(d.vlan_)` to split the native token before using the VLAN list or generating `switchport trunk native vlan` commands. Never re-introduce a standalone `n_vlan_` column.

**generateConfig() has 6 params**: `(portName, d, ipPrefs, seenPos, netSettings, vx1VlanSet)`. The 5th param is the full 16-flag IP family settings object — every call site must pass it (omitting silently drops all protocol-family-gated commands). The 6th param `vx1VlanSet` is optional (defaults to `new Set()`) — callers inside `getDeviceConfig` pass the real Set; callers from `getTopologyData` (config tooltips) omit it. Never remove the default or calls from `getTopologyData` will throw "vx1VlanSet is not defined". **GW config is role-split**: `getDeviceConfig()` builds `callSettings = Object.assign({}, settings, { deviceRole })` and passes it to ALL `generateConfig()` calls. `generateComplexL3Block()` → `getIpBlock()` enters the GW branch for ALL roles when `ipType.includes("gw")`, then branches on `deviceRole`: **LEAF** gets anycast (`ip address virtual`) or VARP (`ip virtual-router address`) per GW settings; **non-LEAF (SPINE/HARNESS/etc)** gets plain `ip address gw_v4_first.oct2.oct3.gwLastV4/mask` — uses `gwLastV4` (`parseInt(cfg.gw_v4_last)`), the same operator-configured last octet as LEAF anycast; NOT `sheetIndex` (device counter is arbitrary, not the intended gateway address). Never pass bare `settings` (without `deviceRole`) to `generateConfig()` from `getDeviceConfig()` — omitting `deviceRole` silently gives SPINE the LEAF path. **generateBGP() has 9 params** — `settings` is the 8th; `ipPrefs` is the 9th (provides loBase for loopback/ASN derivation). **generateBGPEvpnOverlay() has 7 params** — `settings` is the 6th, `ipPrefs` is the 7th.

**GW IP assembly — three-tier, IPv4 and IPv6 cutoffs independent**: `oct2=floor(vlan/100)`, `oct3=vlan%100` always. `getIpBlock()` and the vx1 SVI block both compute `gwPfx4` / `gwPfx6` independently. Three tiers: **IPv4 ≥ /24** (standard): `{first}.{oct2}.{oct3}.{last}/{mask}`; **IPv4 /16–/23** (wide): `{first}{oct2}.{oct3}.0.{last}/{mask}`; **IPv4 /8–/15** (super-wide): `{first}{oct3}.0.0.{last}/{mask}` — oct2 dropped entirely. **IPv6 ≥ /64** (standard): `{first}:{oct2}:{oct3}::{last}/{mask}`; **IPv6 /48–/63** (wide): `{first}{oct2}:{oct3}:0::{last}/{mask}`; **IPv6 /32–/47** (super-wide): `{first}{oct3}:0:0::{last}/{mask}` — oct2 dropped entirely. In all wide/super-wide tiers `first` is locked to `"1"` in the UI. Super-wide examples (VLAN 34, first="1"): IPv4 → `134.0.0.1/8`; IPv6 → `134:0:0::1/32`. **Preferred VLANs by tier**: standard ≥/24 — any VLAN; wide /16–/23 — VLANs ≥100 preferred (oct2 ≥ 1); super-wide /8–/15 — VLANs 1–99 preferred (oct3 = VLAN itself, maximally distinct first octet). **Collision risk in super-wide**: all VLANs sharing the same oct3 (same `VLAN%100`) map to the same IP — e.g. VLANs 34, 134, 234… all → `134.0.0.x`. oct3=0 (multiples of 100: 100, 200…) produces prefix `10.0.0.x` which overlaps IXIA reserved range `10.0.x.x/16` — avoid. Never use super-wide with multiple GW VLANs sharing the same oct3 on one device. Never use `gw_v4_mask` to gate IPv6 assembly — they are independent.

**16 network flags + 3 string fields** in `getNetworkSettings()`: P2P (INT_IPV4, INT_IPV6, INT_IPV6_UNNUM) + GW (GW_IPV4, GW_IPV6) + BGP (4) + OSPF (3) + VXLAN (2) + EVPN (2) + `evpn_service` ('per-vlan'|'vlan-aware-bundle') + `gw_l3_type` ('anycast'|'varp') + `varp_mac` (string). P2P and GW are fully decoupled in `generateComplexL3Block()`. `useAnycastGW = gw_l3_type !== 'varp'` drives `ip address virtual` — works with or without EVPN (no EVPN guard). `useVarpGW = gw_l3_type === 'varp'` drives `ip virtual-router address` — also works without EVPN. `ip virtual-router mac-address` goes in `generateGlobalBlock()` only when `!mlagIsActive && isLeaf && (evpn_ipv4 || evpn_ipv6) && (gw_ipv4 || gw_ipv6)` — standalone LEAF+EVPN+GW only; SPINEs and non-LEAF roles never get it. MLAG block (`generateMlagConfig()`) emits it when `isLeaf && (gw_ipv4 || gw_ipv6)` — MLAG is sufficient, EVPN not required. `isLeaf = deviceRole === 'LEAF'` at the call site; passed as 4th param to `generateGlobalBlock` and 10th to `detectMlagState` (which propagates as 8th to `generateMlagConfig`). Both standalone and MLAG use the same operator-configured `varp_mac` — **no EOS default exists** (`001c.7300.0099` is a convention only). `varp_mac` field stores empty string when unset; `validateTechSettings` Rule 5 blocks save when GW is enabled but `varp_mac` is empty. Never pre-fill the UI field with a default value. MAC must be identical on all switches in the domain. **VARP physical IP must differ from virtual-router IP** — both standalone and vx1 VARP paths use `gwLast + sheetIndex` (or `deviceSheetIndex` for vx1) for the physical `ip address`, and bare `gwLast` for `ip virtual-router address`. Never use the same octet for both (EOS requires distinct IPs).

**MLAG VXLAN loopback pattern**: Lo0 and Lo1 each have their own configMap sections — `configMap["000_LO0"]` (all Arista devices, `id.id.id.id`, BGP/router-id + `vxlan source-interface Loopback0`) and `configMap["000_LO1"]` (MLAG VTEP only: `isVxlan && mlagState.isActive && hasP2p && gwVlans.size>0`, shared `min.min.max.max` IP, description `VTEP_MLAG_SHARED`, `vxlan mlag source-interface Loopback1`). `generateSystemBlocks()` returns `{lo0, system}` — caller assigns each key separately. `generateVxlanBlock()` does NOT emit `interface Loopback1` or a leading `!` — `055_VXLAN.full` starts cleanly with `interface Vxlan1`. `_openLoopbackConfig()` directly accesses `data["000_LO0"]`/`data["000_LO1"]` (never via `_extractInterfaceBlock` — the old preamble in 001_SYSTEM blocked it). `showLoopbackTooltip()` mirrors `showVx1Tooltip()`. Flood list still uses shared `min.min.max.max` IP (`myVtepIpV4`) for dedup.

**Vx1 is a logical VTEP port — excluded from topology, cabling, and audit entirely**: `getTopologyData()` nodesOnRow loop `return`s early on `pName === "Vx1"` (forEach) — Vx1 never enters `processRowLinks`, never forms a cable link, never lands in `allNodesData`, and triggers no audit checks. `vx1VlanSet` (Set built from all vx1 SVI VLANs) is passed as 5th arg to `generateComplexL3Block()` — front-panel SVIs for VLANs already in `vx1VlanSet` are skipped (vx1 takes precedence).

**EVPN service model is global (all LEAF devices)**: `evpn_service === 'vlan-aware-bundle'` → single `vlan-aware-bundle EVPN_VLAN_AWARE_BUNDLE` block with RT `asnBase:1` in both `generateBGP()` and `generateBGPEvpnOverlay()`. Never use per-device ASN for bundle RT (must be identical on all VTEPs).

**hasKey(setObj, key)** must be used instead of `.has()` for all device name lookups. Device names in Sets are lowercase; sheet names are original-cased — `.has()` will silently miss them.

**APP_VERSION must stay in sync**: `const APP_VERSION` is declared ONLY in `Code.gs` (canonical) and `Sidebar-js.html` (client-side, separate scope). All `.gs` files share one global scope — never redeclare `APP_VERSION` in `Test-gs.gs` or any other `.gs` file (causes `SyntaxError: Identifier already declared`). All HTML files carry a matching `<!-- TopoAssist vX.Y -->` comment at line 1. Bump Code.gs + Sidebar-js.html + all HTML comments on every release.

**`device_bridge.py` and its embedded template are two independent copies of the same Python code — any logic change must be applied to BOTH files in the same edit session**: the standalone `device_bridge.py` (running on the Mac) and the embedded template inside `downloadBridgeScript()` in `Sidebar-js.html` (what users download) are structurally separate and have no shared import or link. Editing one without the other silently leaves the downloaded script stale. This applies to every change: new functions, modified function bodies, new parameters, new fields in the response dict, new branches. A VERSION bump alone is not sufficient.

**VERSION must stay in sync**: after any `device_bridge.py` change, bump VERSION in both `device_bridge.py` AND the embedded template inside `downloadBridgeScript()` in `Sidebar-js.html`. The `/health` docstring line must also match.

**Push sync invariant — single-device push and Push All must be equivalent**: both send `all_ifaces: true` and `allDeviceNames: [all Arista device IDs]`. `_find_ta_orphans(ip, config_text, all_device_names)` is a thin wrapper around `_detect_orphans` + `_orphans_to_cmds` — it cleans all 5 categories: (1) interface orphans — `default interface X` / `no interface X` for `__TA`-tagged interfaces not in `config_text`; (2) BGP neighbor orphans — `router bgp ASN / no neighbor X` for global-context neighbors with `__TA` descriptions where DevName is not in `all_device_names`; (3) VLAN orphans — `no vlan X` for VLANs with `__TA` in name not in `config_text` `vlan N` lines; skips 4093/4094; (4) VRF orphans — `no vrf instance VRFNAME` for VRFs with `description ... __TA` not in `config_text` `vrf instance` lines; (5) OSPF orphans — `default passive-interface X` for stale `no passive-interface X` sub-commands in router ospf/ospf3 blocks that reference orphaned interfaces (removes the override without leaving residue; `passive-interface X` would leave an explicit line redundant with `passive-interface default`). Never omit `all_ifaces: true` or `allDeviceNames` from the POST body — omitting either silently skips cleanup. **`_detect_orphans(ip, config_text, all_device_names, expected_ports)`** is the unified detection function used by BOTH push path (via `_find_ta_orphans` wrapper) and Cleanup UI (via `/reconcile` handler). Returns `{ok, ta_total, matched, interfaces:[...], bgp:[...], vlans:[...], vrfs:[...], ospf:[...]}`. **`_orphans_to_cmds(orphans)`** is a module-level pure function that converts the structured dict to flat EOS CLI commands — used by `_find_ta_orphans`. JS mirror: **`_orphansToCmds(orphans)`** in `Sidebar-js.html` (same interface: orphans dict → flat cmd list; renamed from `_orphansToCmdLines` 2026-05-09). **`_buildCleanupConfig(items)`** is a separate JS-only lower-level helper (takes structured items array, no Python equivalent) used by the Cleanup UI for selected-item command generation. **Cleanup UI vs Push**: Cleanup UI (`runCleanup()` → `/reconcile` → `_renderCleanupResults`) is interactive — shows detected orphans with Select All / per-device / per-item checkboxes, then "Clean Selected (N)" or "Clean All" to push; Push auto-cleans in its own separate configure session(s) BEFORE the main config push — orphan cmds are never prepended into the main session, because range-collapsed cmds (e.g. `no interface Vlan1-3999`) represent thousands of EOS deletions and would cause the combined session to exceed PUSH_TIMEOUT. **__TA tagging**: ALL config elements generated by TopoAssist carry `__TA` — interface descriptions, BGP neighbor descriptions, VLAN names (`VLAN0010__TA` — double underscore; EOS rejects spaces in vlan name; grep-safe unlike `#TA`), VRF descriptions (`VRFNAME __TA`), MLAG VLAN names (`MLAG_L3_UNDERLAY_PEERING__TA`, `MLAG_CONTROL_PLANE__TA`). Interface descriptions: Lo0 → `-> ROUTER_ID __TA`; Lo1 → `-> VTEP_MLAG_SHARED __TA`; Vxlan1 → `-> VTEP __TA`; Vlan4093 → `-> MLAG_L3_PEERING __TA`; Vlan4094 → `-> MLAG_CONTROL_PLANE __TA`; physical/Po → `-> PeerDev-PeerPort __TA` variants; Po remoteMlagPair path → `-> DevName-PoN __TA` when peerPo available, `-> DevName __TA` otherwise; peerPo is a scalar rescued from poGroup before JSON sanitization deletes it (`cleanDetails.peerPo = poGroup.peerPo` if starts with 'Po'). **poGroup is always deleted during sanitization** — `d.poGroup` in generateConfig is always undefined; never add logic that reads it there; SVI GW/P2P → `-> ANYCAST_GW/GW/P2P_... __TA`; SVI other → bare `__TA`. All named descriptions use `->` prefix consistently. `desc_` column: `__TA` always appended; guard prevents double-append if user already wrote `__TA`. Use `show interfaces status | grep __TA` to find all TopoAssist-managed interfaces.

**Audit log is state-based (`_auditIssues`), not event-based**: `let _auditIssues = []` is the single source of truth — cleared and rebuilt from scratch on every `runValidation()`. Design issues pushed from `validationErrors`; live issues built by iterating `bridgePortStatus` (NOT `_lastBridgeResults` — see below). The Audit tab renders via `renderAuditLog()` which reads `_auditIssues` directly — never filtered `statusLog`. `_updateLogTabCounts()` uses `_auditIssues.length` for the audit badge. `clearStatusLog()` also clears `_auditIssues`. There is NO `_loggedAuditErrors` set and NO `logIssues` gate. Summary "Audit: N Issues Found" always emitted. Never call `setStatus('[Audit...]')` directly — always push to `validationErrors[key]` or `_auditIssues`. For device-level checks without a port, use a synthetic key: `validationErrors[\`_mlag_peer_${pairKey}\`]`. Log routing: `[Audit - Live]` → statusLog (All/Errors tabs) + Audit tab (via _auditIssues); `[Audit - Design]` → Audit tab only; `[Bridge]` → statusLog Bridge tab only. Both `bridgePortStatus` and `_lastBridgeResults` set atomically in `_compareBridgeData`. **`bridgePortStatus` is the classification source for live LLDP audit entries** — `'mismatch'`→`bridgeAuditFlagMismatch`, `'missing'`→`bridgeAuditFlagMissing`. **`bridgePortSubType` (`{portId → 'errdis'|'shut'|'down'|'other'}`) is the canonical sub-type map** — populated atomically by `_populateBridgePortSubTypes(dsData)` immediately after `_compareBridgeData()`, before `devStatusMap` is updated. Both maps cleared together in `_compareBridgeData`. Link-level priority: `errdis > shut > down > other`. `errdisabled` → `'errdis'`; `disabled` → `'shut'`; `notconnect` → `'down'` unless peer device is unreachable/non-Arista in dsData (reclassified as `'shut'` — expected no-link, peer disabled). Never re-derive sub-type from `devStatusMap` or `dsData` ad-hoc in consumers — always read from `bridgePortSubType`. Removed: `_bridgeMissingSubType`, `_portLinkSt()` helper, `_ls()` helper. **`bridgePortL1Errors` (`{portId → {fcs, sym, align}}`) is the canonical L1 error map** — populated atomically by `_populateBridgePortL1Errors(dsData)` immediately after `_populateBridgePortSubTypes(dsData)` at both bridge-check call sites. Iterates `Object.keys(allNodesData)` (all topology ports) — NOT `bridgePortStatus` — so errdisable/down/shut ports that were not involved in a bridge LLDP comparison are also detected. Only ports whose counters `>= bridgeL1ErrorThreshold` (default 1, min 1) are stored. All consumers (`_renderLldpResults`, `_logBridgeIssuesToStatusLog`, `runValidation`) read from `bridgePortL1Errors` — never re-derive from `dsData` or `devStatusMap` ad-hoc. `_l1ErrDetail(u, uErr, v, vErr)` builds the detail string; it is also called inline in `_renderLldpResults` to annotate "Interface down" and "Interface shut" rows with L1 error counts when present (shows combined state). `onBridgeL1ThresholdChange(rawVal)` clamps to min 1, updates `bridgeL1ErrorThreshold`, re-runs `_populateBridgePortL1Errors(devStatusMap)`, and re-renders — no re-check needed. `bridgeAuditFlagL1Errors` defaults ON (unlike shut/down which default OFF). `_syncBridgeEnableCheckbox` syncs the `#bridgeL1Threshold` input (min=1, default=1) on modal open. `_build_devstatus_ssh(ver,ifs,ivlans,errs)` now takes a 4th `errs` arg (from `show interfaces counters errors`); REST/gNMI transports return `"interfaceErrors": {}`. `_parse_interface_errors(raw)` is a module-level pure function — only stores interfaces with at least one non-zero L1 counter (compact). `_lastBridgeResults` is a detail-message lookup only (`_portToResult` map, keyed by port ID). Never classify by `r.msg` content (e.g. `r.msg.includes('no LLDP neighbor')`) — a joined link message describes both ends; parsing it mis-routes mixed-case links (wrong neighbor one end, no neighbor other). `_logBridgeIssuesToStatusLog` applies the same rule: uses `bridgePortStatus[r.u/r.v]` for `hasMismatch`, not `noNeighbor`. Dedup in `_auditIssues` live section: `_bridgeAuditSeen` Set keyed by sorted link pair prevents double-entries when both ends appear in `bridgePortStatus`.

**Audit modal live section ↔ `_renderLldpResults` sync invariant**: The Audit modal's Bridge — LLDP and Bridge — Int State categories and the Device Bridge results panel (`_renderLldpResults` `issueParts` array in `Sidebar-js.html`) must stay in sync at all times — same labels, same order. Bridge — Other (Internal VLAN) is excluded: it is an audit-only design check, not shown in the results panel. VLAN checks are covered by a separate modal entirely.

When adding a new live interface check: (1) add the `bridgeAuditFlag*` checkbox to Sidebar.html in the correct category; (2) add the matching `subHtml('Same Label', ...)` block to `_renderLldpResults` in the same relative position; (3) gate the status-log entry in `_logBridgeIssuesToStatusLog` and the `_auditIssues` push in `runValidation` with the new flag. Never add one without the other.

**Current canonical mapping (label must be identical in both locations):**

| Audit modal | `_renderLldpResults` subHtml label | Flag |
|---|---|---|
| Bridge — LLDP: LLDP New neighbor | `'New LLDP neighbor'` | `bridgeAuditFlagOrphan` |
| Bridge — LLDP: LLDP neighbor mismatch | `'LLDP Mismatch'` | `bridgeAuditFlagMismatch` |
| Bridge — LLDP: INT Up - no LLDP neighbor | `'INT Up - no LLDP neighbor'` | `bridgeAuditFlagMissing` |
| Bridge — Int State: L1 errors (CRC / FCS) | `'L1 errors (CRC / FCS)'` | `bridgeAuditFlagL1Errors` |
| Bridge — Int State: No link (notconnect) | `'No link (notconnect)'` | `bridgeAuditFlagDown` |
| Bridge — Int State: Err-Dis (errdisabled) | `'Err-Dis (errdisabled)'` | `bridgeAuditFlagErrDis` |
| Bridge — Int State: Disabled (admin shut) | `'Disabled (admin shut)'` | `bridgeAuditFlagShut` |

**Audit flag SSoT — `var`, not `let`; `window[name]`; single registry**: All 34 `auditFlag*` / `bridgeAuditFlag*` globals are declared with `var` (not `let`) so `window[name]` dynamic property access works. `_getAuditFlag(name)` returns `window[name]` — no switch. `_setAuditFlag(name, val)` writes `window[name] = val` + `localStorage.setItem(name, val)` — no switch. A `storage` event listener propagates changes from other tabs. **Adding a new flag requires only one change**: add a `var auditFlagX = localStorage.getItem(...) !== 'false'` line to the init block — getter, setter, and cross-tab sync update automatically. Never use `let` for an audit flag (breaks `window[name]`). Never read `localStorage.getItem` for a flag at runtime — always call `_getAuditFlag`. Never write a flag without `_setAuditFlag` — direct assignment skips localStorage persistence.

**Topology render SSoT — reset before assign**: In `render()`, all topology maps (`linkMap`, `portMap`, `allNodesData`, `allDevicesData`, `devicePortsMap`, `globalPortElements`, `nodeIndexMap`) are cleared BEFORE `globalLinks = links` is assigned, and `currentDeviceConfig`/`currentLeftConfig`/`currentRightConfig` are also cleared alongside `allNodesData`. This eliminates the partial-state window where new links coexist with old maps. Never move `globalLinks = links` before the Reset Globals block.

**`selectedLineId` is a rendering variable — never read in async callbacks or click handlers.** It is cleared by `redrawLinks()` (when link coords are null) and `filterTopology()` (on any search change), both without hiding the strip UI. By the time a GAS `withSuccessHandler` or click handler fires, `selectedLineId` is often null. Use `_leftDev`/`_rightDev`/`_leftPort`/`_rightPort` for link identity in async work — set by `selectLine()`, stable across render cycles. `selectedDeviceId` is safe in async callbacks (not cleared by render pipeline). Root cause of 2026-04-28 strip-amber + View-"select a device or link first" bug.

**MLAG is explicit only**: declared via Device Manager (DEVICE_MLAG_PEERS in DocumentProperties). The old PO-count heuristic (≥4 occurrences) was removed. Never re-introduce count-based MLAG detection.

**Device ID shift detection**: `DEVICE_ID_SNAPSHOT` (DocumentProperties) stores `{deviceName: sheetIndex}` for all Arista devices. `checkDeviceIdShift()` compares current IDs vs snapshot — returns `{shifted:[{name,oldId,newId}], isFirstRun}`. Called on topology load (status-warn if shifted) and checked before push (yellow banner in push modal with "Regenerate All Configs" / "Push Anyway"). `saveDeviceIdSnapshot()` saves current IDs; called by `_regenerateAllConfigs()` and on first push commit. `_regenerateAllConfigs()` iterates all Arista devices via `getDeviceConfig()`, then saves snapshot. **Vxlan additive sub-command cleanup is in the generated config (Code.gs)**: `generateVxlanBlock()` always emits `default vxlan vlan 1-4094 vni` + `default vxlan flood vtep` as the first sub-commands in the `interface Vxlan1` block (before `vxlan udp-port 4789`). These clear all stale vlan-vni mappings and flood vtep entries before new config is pushed. EOS no-ops them when nothing is configured. `device_bridge.py` does NOT modify config during push — the generated config is the single source of truth. Never re-introduce a push-time injection (`_prepend_section_cleaners` was removed). **Interface idempotency — inline Python expansion (same configure session)**: Three cleanup marker types (`ta-clean-et`, `ta-clean-po`, `ta-clean-vl`) are emitted by Code.gs as sentinels in the generated config (e.g. `ta-clean-et Et1/1` on the line immediately before `interface Et1/1`). EOS eAPI does NOT resolve user-defined aliases — marker calls fail with `invalid command`. Cleanup and push must be in the SAME configure session for atomicity (if separate sessions are used, a cleanup commit followed by a failed push leaves interfaces with no config). `_expand_ta_cleanup(lines)` (module-level pure function) rewrites the line list in-place: marker lines are stripped and their expansion commands are injected as the FIRST sub-commands of the immediately following `interface X` block (with a leading space — EOS interface sub-command indent). Returns the rewritten flat list (not a tuple). `TA_ALIAS_EXPANSIONS` dict maps each marker name to its command list. `_push_config()` flow: `lines = _expand_ta_cleanup(lines)` → stale session abort → single main configure session with cleanup + new config merged. There is NO separate cleanup session; `_push_ta_cleanup` was deleted. L2 VLAN cleanup (trunk allowed/native/access vlan) is handled by `ta-clean-et`/`ta-clean-po`; `generateAttributesBlock()` only emits `switchport`. GW SVI IP cleanup is handled by `ta-clean-vl`; `getIpBlock()` takes `_isSvi=false` — when true, skips 6-line inline block. GW SVIs in the SVI loop and vx1 SVI array emit the marker before `interface VlanN`. `TA_ALIAS_EXPANSIONS` and `_expand_ta_cleanup` must stay in sync between `device_bridge.py` and the embedded template in `downloadBridgeScript()`. **`ta-clean-et` commands (5)**: `default switchport trunk allowed vlan` / `no switchport trunk native vlan` / `default switchport access vlan` / `no channel-group` / `no ipv6 address`. **`ta-clean-po` commands (4)**: same minus `no channel-group`. **`ta-clean-vl` commands (6)**: all 6 IPv4+IPv6 `default ip/ipv6 address` variants — unchanged. **JS display path — `_expandTaCleanDisplay(text)`**: JS mirror of `_expand_ta_cleanup` (display only — raw config is never modified before sending to device_bridge). Called in `showConfigModal` and `_openCfgPanelView` before setting `currentRawConfig` (so search, clipboard copy, and `highlightEosConfig` all see expanded paste-ready EOS). **`_TA_CLEAN_MAP`** const in `Sidebar-js.html` mirrors `TA_ALIAS_EXPANSIONS` — keep in sync when commands change. **IPv6 address cleanup (non-GW)**: EOS IPv6 is always additive — without cleanup old addresses persist. For non-GW interfaces: `no ipv6 address` before every `ipv6 address` on Lo0/Lo1/Lo10, P2P Ethernet (snake and regular). **SVI description naming**: The SVI loop emits the description based on `ip_type_`: GW SVIs → description comes from `getIpBlock()` (loop emits nothing); P2P SVIs → `P2P_{vrf}_{vlan} __TA` (vrf omitted when absent); all others → `__TA`. GW naming: LEAF+EVPN active → `ANYCAST_GW_{vrf}_{vlan} __TA`; LEAF non-EVPN or non-LEAF → `GW_{vrf}_{vlan} __TA`. Check: `_sviIsGw = _ipTypeLow.includes('gw')`, `_sviIsP2p = _ipTypeLow.includes('p2p')`.

**Per-device GW first/last override**: `GW_DEVICE_OVERRIDES` (DocumentProperties) stores `{devName:{v4_first,v4_last,v6_first,v6_last}}` — only entries with at least one non-empty field are persisted. `getDeviceConfig(deviceName)` calls `getGwDeviceOverrides()` and applies matching entry to `ipPrefs` before passing to `generateComplexL3Block()` — non-empty override fields win over global prefs, empty string falls back to global. `getIpPreferences()` stays unchanged (no sheet I/O — used in config gen). `getIpPreferencesForModal()` wraps it and adds `gw_device_overrides` + `arista_devices` list (reads sheet); called ONLY from `openIpConfigModal()`. `saveIpPreferences(prefs)` extracts `gw_device_overrides` from prefs and saves via `saveGwDeviceOverrides()` before saving the rest to UserProperties. MLAG pairs must share the same GW first octet — mismatch triggers a confirm dialog on save (not a hard block). Never put per-device override logic inside `getIpPreferences()` — that function is called from config gen and must stay fast.

**JetBrains Mono** must be explicitly set on every UI element in Sidebar-css.html. It does NOT inherit from body in Google Apps Script dialogs.

**JS HTML string literals — always use template literals (backticks)**: whenever `innerHTML`, `insertAdjacentHTML`, or any HTML string building contains single quotes (CSS `font-family:'JetBrains Mono'`, `onclick` args with string parameters, etc.), use a backtick template literal — never a single-quoted string. A `'` inside a single-quoted JS string silently terminates the string, causing `SyntaxError: Unexpected identifier` or `SyntaxError: Unexpected string`. Rule: if the HTML you are embedding could ever contain `'`, use backticks. No exceptions. Do NOT put `font-family:'JetBrains Mono'` in an inline style inside any JS string — always use a CSS class instead.

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
- [ ] **Does the logic aggregate multiple structured values into one result (e.g. two port subtypes → one link classification)?** If yes — grep for existing code that does the same reduction and copy it exactly. Never re-derive independently. The canonical case: `bridgePortSubType` across two link endpoints uses `errdis > shut > down > other` priority in multiple places — any new consumer must grep and reuse that pattern, not invent its own.

## Config State — `configCache` Is the Only Store

`configCache[deviceName].data` is the **sole source of truth** for device config. There are no secondary stores.

| What you need | How to get it |
|---|---|
| Is config loaded? | `!!configCache[devName]` |
| Full config string | `formatConfigText(configCache[devName].data)` |
| Per-port config string | `allNodesData["Dev:Port"].details.config` (set by `processDeviceConfig`) |

**Never introduce** `allDevicesData[dev].fullConfig`, `allDevicesData[dev].configLoaded`, or `allNodesData[id].details.configLoaded` — these were removed in the 2026-04-29 refactor because `_selectiveConfigInvalidate` only evicted `configCache` and left them stale, silently defeating cache invalidation.

When `delete configCache[devName]` is called (eviction, clear), that is the complete invalidation — no other state needs to be cleared.

## Modal Loading Pattern — In-Modal Spinner Only

**`showGlobalLoading()`** is reserved for full-page sheet operations only: topology load (`getTopologyData`), Force Sync, schema rebuild, column sync. It must NEVER be called from any modal-open path.

**`showModalLoading(modalId, msg)` / `hideModalLoading(modalId)`** are the only modal-open loading pattern. They:
1. Open the modal immediately (`display:flex` + `setActiveModalChip`) — header stays interactive
2. Inject `.modal-loading-state` div over the body only (top = `hdr.offsetHeight` dynamically)
3. Remove the spinner when data is ready (`hideModalLoading` in both success and failure handlers)

**Checklist for every new modal-open GAS call:**
- [ ] Call `showModalLoading(modalId, "Loading…")` before `google.script.run`
- [ ] `_guard` timeout calls `hideModalLoading(modalId)` + close modal + `setActiveModalChip(null)` + `setStatus(..., "status-error")`
- [ ] `withSuccessHandler`: `clearTimeout(_guard)` first, then `hideModalLoading(modalId)`, then populate fields
- [ ] `withFailureHandler`: `clearTimeout(_guard)` first, then `hideModalLoading(modalId)` + close + status error
- [ ] Never call `showGlobalLoading()` from inside a modal-open handler

**`editOverlay` is always `display:none`.** The `<div id="editOverlay">` element remains in the DOM (removing it breaks null-ref guards in close functions), but nothing ever sets `style.display = 'block'` on it. If you see a call that does, delete it — do not restore the overlay pattern.

## Modal Dock — `_refreshDock()` Is the Single Sync Point

`_refreshDock()` is the **only** function that updates both the `#activeModalChip` toolbar indicator and the `#modalDock` minimized-modal chip strip. Call it; never call `_updateActiveChip` or `_updateMinimizedDockChip` — they no longer exist.

**Dock chip onclick must call `_autoMinimizeOpenModal()` before `toggleModalMinimize()`:**
```javascript
dc.onclick = () => { _autoMinimizeOpenModal(); toggleModalMinimize(modal.id); };
```
Without the guard, restoring a dock chip leaves two modals open simultaneously.

**`_autoMinimizeOpenModal()`** uses a dynamic `.modal-std` query — never a hardcoded candidates array. Self-maintains as new modals are added. **Skips full-screen GAS containers** (`_FULLSCREEN_CONTAINER_IDS`: `sheetColumnManagerContainer`, `deviceManagerContainer`, `sheetVisContainer`) — minimizing them collapses the GAS dialog window to header-only height, which is never the right behavior for auto-minimize.

**`closeAllModals()`** uses the same dynamic `.modal-std` query.

**Every modal/panel must open in expanded state — always.** This is a core design rule. Whether opened fresh or restored from the dock, a modal must never reopen in minimized state:

- `setActiveModalChip(modalId)` strips `modal-minimized` + `preMinDisplay` from the incoming modal before registering it. This covers every open function that calls `setActiveModalChip` (all standard modals).
- `_showPushConfirmModal()` calls `_autoMinimizeOpenModal()` then strips `modal-minimized` from itself (it does not call `setActiveModalChip`).
- **Never add a new open function that sets `style.display='flex'` without calling `setActiveModalChip(modalId)`** — if a modal bypasses `setActiveModalChip`, it must: (1) call `_autoMinimizeOpenModal()` to collapse whatever is already open, AND (2) strip `modal-minimized` from itself explicitly. Stripping without auto-minimizing leaves two modals visible simultaneously and breaks Esc order.
- Dock chip restore via `toggleModalMinimize` always expands (the modal has `modal-minimized` when docked; toggle removes it). This is correct by construction — no change needed.

## GAS Dialog Containers — Minimize-Only Header

The three full-screen GAS dialog containers (`deviceManagerContainer`, `sheetColumnManagerContainer`, `sheetVisContainer`) use a different header pattern from regular modals:

- **Header**: `[−]` minimize button only — **no `[×]` close button**
- **Footer**: `[Cancel]` · `[Primary Action]` — Cancel is the only dismiss path

The `[−]` is injected by `_injectMinimizeButtons()` via its `appendChild` fallback (these containers have no `btn-modal-close` to anchor `insertBefore` against).

**Never add `btn-modal-close` to these container headers** — the GAS dialog chrome provides emergency close if needed; the footer `[Cancel]` handles intentional dismiss (with dirty-state check where applicable).

| Container | Cancel target | Primary action |
|---|---|---|
| `deviceManagerContainer` | `DeviceManagerCloseButton()` | `saveDeviceChanges()` |
| `sheetColumnManagerContainer` | `SheetColumnManagerCloseButton()` | `SheetColumnManagerSave()` |
| `sheetVisContainer` | `google.script.host.close()` | `submitCustomView()` |

**GAS container footer must be a single row — no stacking.** GAS dialog height is fixed via `google.script.host.setHeight()`. The body fills remaining height via `flex: 1`. If the footer wraps to multiple lines, the bottom row is silently clipped — GAS does not scroll containers. Rule: the `modal-actions` footer of any container must fit in one horizontal row. If there are too many controls, promote low-priority ones (checkboxes, toggles) to a `schema-settings-bar` row above the body. After any footer change, reopen the dialog and visually confirm the bottom row is fully visible.

## SSoT for Repeated Label / String Builders

When the same format string appears in 3+ call sites, extract it to a pure function before writing any DOM-mutating wrapper:

1. `_buildXLabel(params)` — pure, returns string only, zero DOM side-effects
2. `_setXLabel(id, params)` — calls `_buildXLabel` + applies DOM state (color, disabled, innerText)
3. Callers needing **string only** (e.g. age-refresh tickers) call `_buildXLabel` directly — never re-apply color/disabled as a side-effect
4. Callers needing **string + state** call `_setXLabel`

**Detection rule:** if a helper already exists (`updateDirtyButton`, `setSplitBtnState`) and a new function duplicates its body instead of calling it — that is a gap. Always grep for existing helpers before writing new DOM mutation logic.

**Canonical examples:**
- `_buildSplitLabel` / `_setSplitBtnLabel` — split-btn label format (all 3 states + colors in one place)
- `updateDirtyButton("#id", isDirty)` — dirty-state button (amber/green + " *" label); `DeviceManagerSaveButton` and `SheetColumnManagerSaveButton` must call this, never inline it

## After Every Change
- List the exact files modified (GAS files vs local `device_bridge.py`)
- Check if `UserGuide.html` needs updating for any user-facing changes
- If editing `buildConditionalRules` in Code.gs: immediately note that the user must do **Save & Sync** in the sheet for conditional format changes to take effect
- Use `/topoassist-review-deploy-sync`, `/topoassist-review-userguide-update`, `/topoassist-review-code-design`, `/topoassist-review-code-full` slash commands as needed
