# Run TopoAssist Tests

## Python — device_bridge.py pure functions

```bash
cd ~/claude/projects/topoassist && python3 -m pytest tests/ -v
```

Expected: 91 passed, 0 failed.

## GAS — Code.gs pure functions

- Open Apps Script editor (Extensions → Apps Script)
- Select function: `runAllTests`
- Click Run
- Alert shows summary; Execution Log has per-test detail

## Client-side JS — GW override logic (applyHint, lockFirst, g() reader)

```bash
xdg-open ~/claude/projects/topoassist/Tests-client.html   # Linux
open ~/claude/projects/topoassist/Tests-client.html        # macOS
```

Opens `Tests-client.html` in the default browser. All 20 cases should show green.
No GAS auth needed — runs entirely in the browser.

If a case fails, the row shows actual vs expected values.

> **Sync rule**: `applyHint` and `lockFirst` in `Tests-client.html` are copies of the
> closures in `Sidebar-js.html`. Both carry `// SYNC:` comments. Update both files
> whenever either function changes.
