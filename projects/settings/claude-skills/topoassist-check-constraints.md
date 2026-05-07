Check that the critical design constraints are being followed after this session's changes.
TRIGGER when: any Code.gs, Sidebar-js.html, Sidebar-css.html, or device_bridge.py was edited this session; before running any deploy command on TopoAssist.
SKIP: read-only sessions, documentation-only changes, non-TopoAssist work.

Run the following checks in order:

1. **canonicalizeInterface() sync**: Grep for `// DUPLICATED` comments in both Code.gs and Sidebar-js.html. Confirm both show the same "last synced" date. If one was changed this session and the date wasn't updated, flag it and fix it.

2. **generateConfig() param count**: Grep for `generateConfig(` in Code.gs. Confirm every call site passes exactly 6 arguments (portName, d, ipPrefs, seenPos, netSettings, vx1VlanSet). Note: vx1VlanSet is optional (callers from getTopologyData omit it intentionally — that is correct). Flag any call missing netSettings (arg 5).

3. **hasKey() usage**: Grep for `.has(` in Code.gs. Flag any usage where the Set/Map contains device names (those should use hasKey() instead). hasKey() is case-insensitive; .has() is not — device names in Sets are lowercase but sheet names are original-cased.

4. **device_bridge.py ↔ embedded template logic sync**: For every function that exists in `device_bridge.py` that is also present in the embedded template inside `downloadBridgeScript()` in `Sidebar-js.html` (e.g. `_extract_eos_errors`, `_push_config`, `_abort_stale_sessions`), confirm the function bodies are equivalent. If this session changed any such function in one file, check that the same change was applied to the other. Flag any divergence.

5. **VERSION sync**: Grep for the VERSION constant in device_bridge.py and the downloadBridgeScript() template block in Sidebar-js.html. Confirm they match. Also check the /health endpoint docstring line matches the same version.

5. **MLAG explicit only**: Grep for any >= 4 threshold checks or "poGlobalCount" logic in Code.gs that might re-introduce the old heuristic. MLAG pairs must be declared exclusively via DEVICE_MLAG_PEERS — no count-based detection.

Report which checks passed, which failed, and what to fix.
