List every file modified in this session and categorize them for deployment.

TopoAssist has two deployment targets:

**Google Apps Script** (must be manually copied into the script editor at script.google.com):
- Code.gs
- Sidebar.html
- Sidebar-js.html
- Sidebar-css.html
- SheetAssistPanel.html
- UserGuide.html

**Local / bus-home** (run directly, no GAS upload needed):
- device_bridge.py

Steps:
1. Run: `git log --since=midnight --name-only --pretty=format: -- projects/topoassist/ | sort -u | grep -v '^$'`
   This lists all topoassist files committed today (since midnight local time).
2. Cross-reference the list above against the two deployment targets and report which files need deployment.
3. Remind the user to re-download device_bridge.py from the sidebar if device_bridge.py was changed (the embedded template in Sidebar-js.html must also have been updated).
4. If device_bridge.py was changed, confirm VERSION was bumped (or flag it if not).
