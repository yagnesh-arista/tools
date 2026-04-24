# Rollback Log

Reverts and rollbacks across all projects, with reasons.

---

## 2026-04-24 | topoassist | 907963d
**Removed bridge URL configurability (BRIDGE_URL as localStorage-backed let, URL input field in bridge modal, saveBridgeUrl function)**
Reason: running bridge on bus-home requires `ssh -NL 8765:localhost:8765 bus-home` SSH tunnel from Mac anyway (browser mixed-content blocks HTTP to non-localhost; bridge also binds 127.0.0.1 only) — the tunnel overhead defeats the performance gain, so the complexity is not justified.
Files: Sidebar-js.html, Sidebar.html

---

## 2026-04-23 | topoassist | 789d08b
**Rolled back: MLAG Peer Link inner label shortening.**
Shortened label lost useful info. Restored "Base (lower gets .base, higher .base+1)".
Real fix: set --ip-label-w:110px on the ip-row so "Peer Link IP" isn't clipped (was 80px default).
Files: Sidebar.html

---

## 2026-04-23 | topoassist | 27778ff
**Rolled back: LOOPBACK and MLAG PEER LINK section reorder in ipConfigModal.**
User wanted label rename only ("Peer Link Base" → "Peer Link IP"), not a layout reorder.
Sections restored to original position (after the 3 info boxes). Label renamed in place.
Files: Sidebar.html

---

## 2026-04-21 | topoassist | 5de81d1
**Reverted _INT_MODE_ITEMS abbreviated→full labels in Sidebar-js.html — wrong target (Dev Vis "Topology View" panel, not SheetAssistPanel). Restored l2ea/l2et/etc. in topology Dev Vis filter; applied full names to SheetAssistPanel.html INT_MODE_FILTER_ITEMS instead.**  
Files: projects/topoassist/Sidebar-js.html

---

## 2026-04-17 | topoassist | 76d3da7
**Revert fullscreen feature — GAS dialog size cap makes it non-functional**  
Files: projects/topoassist/Sidebar.html, projects/topoassist/Sidebar-js.html, projects/topoassist/Sidebar-css.html, projects/topoassist/UserGuide.html

**Why it failed:** GAS dialogs have a hard ~1050px width cap and the iframe sandbox blocks the native browser Fullscreen API (`allowfullscreen` attribute not set by GAS). `google.script.host.setWidth/setHeight` cannot exceed these limits. Do not attempt fullscreen again for GAS-hosted projects.


## 2026-04-19 | topoassist | ac18352
**Reverted SheetAssistPanel.html width changes (dialog 490→580, col-left 230→280) — wrong target; user wanted Device Manager widened, not Sheet View.**
Files: Code.gs (setWidth 580→490), SheetAssistPanel.html (col-left 280→230)
## 2026-04-24 | topoassist | 1ff2952
**rollback-log: topoassist bridge URL configurability removed 2026-04-24**  
Files: ROLLBACKS.md,projects/topoassist/Code.gs,projects/topoassist/SheetAssistPanel.html,projects/topoassist/Sidebar-css.html,projects/topoassist/Sidebar-js.html,projects/topoassist/Sidebar.html,projects/topoassist/Tests.gs,projects/topoassist/UserGuide.html

