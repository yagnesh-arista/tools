# Rollback Log

Reverts and rollbacks across all projects, with reasons.

---

## 2026-04-17 | topoassist | 76d3da7
**Revert fullscreen feature — GAS dialog size cap makes it non-functional**  
Files: projects/topoassist/Sidebar.html, projects/topoassist/Sidebar-js.html, projects/topoassist/Sidebar-css.html, projects/topoassist/UserGuide.html

**Why it failed:** GAS dialogs have a hard ~1050px width cap and the iframe sandbox blocks the native browser Fullscreen API (`allowfullscreen` attribute not set by GAS). `google.script.host.setWidth/setHeight` cannot exceed these limits. Do not attempt fullscreen again for GAS-hosted projects.

## 2026-04-17 | topoassist | 91d1e32
**Doc: fullscreen not possible in GAS — add to Section 24 hard constraints**  

