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
1. Run these three commands to get changed topoassist files by time window:
   - Today:      `git log --since=midnight --name-only --pretty=format: -- projects/topoassist/ | sort -u | grep -v '^$'`
   - Last week:  `git log --since="7 days ago" --until=midnight --name-only --pretty=format: -- projects/topoassist/ | sort -u | grep -v '^$'`
   - Last month: `git log --since="30 days ago" --until="7 days ago" --name-only --pretty=format: -- projects/topoassist/ | sort -u | grep -v '^$'`

2. Report three sections — **Today**, **Last Week (1–7 days ago)**, **Last Month (8–30 days ago)** — each listing which files changed and which deployment target they belong to. Omit a section if it has no changes.

3. Remind the user to re-download device_bridge.py from the sidebar if device_bridge.py appears in any section (the embedded template in Sidebar-js.html must also have been updated).
4. If device_bridge.py was changed, confirm VERSION was bumped (or flag it if not).
