Check that VERSION is in sync between device_bridge.py and the embedded template inside Sidebar-js.html (inside the downloadBridgeScript() function).

Steps:
1. Grep for `VERSION` in device_bridge.py and extract the value.
2. Grep for the same VERSION string inside Sidebar-js.html to confirm the embedded template matches.
3. Also check that the /health endpoint docstring in device_bridge.py mentions the correct version.
4. If anything is out of sync, bump all three locations to the next patch version now and report what changed.
5. If all are in sync, confirm the current version number.
