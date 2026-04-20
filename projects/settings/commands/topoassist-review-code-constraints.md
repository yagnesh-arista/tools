Check that the critical design constraints are being followed after this session's changes.

Run the following checks in order:

1. **canonicalizeInterface() sync**: Grep for `// DUPLICATED` comments in both Code.gs and Sidebar-js.html. Confirm both show the same "last synced" date. If one was changed this session and the date wasn't updated, flag it and fix it.

2. **generateConfig() param count**: Grep for `generateConfig(` in Code.gs. Confirm every call site passes exactly 5 arguments (portName, d, ipPrefs, seenPos, underlayProtocol). Flag any call with fewer than 5.

3. **hasKey() usage**: Grep for `.has(` in Code.gs. Flag any usage where the Set/Map contains device names (those should use hasKey() instead). hasKey() is case-insensitive; .has() is not — device names in Sets are lowercase but sheet names are original-cased.

4. **VERSION sync**: Grep for the VERSION constant in device_bridge.py and the downloadBridgeScript() template block in Sidebar-js.html. Confirm they match. Also check the /health endpoint docstring line matches the same version.

5. **MLAG explicit only**: Grep for any >= 4 threshold checks or "poGlobalCount" logic in Code.gs that might re-introduce the old heuristic. MLAG pairs must be declared exclusively via DEVICE_MLAG_PEERS — no count-based detection.

Report which checks passed, which failed, and what to fix.
