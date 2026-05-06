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
cd ~/claude/projects/topoassist && node tests-client-node.js
```

Expected: 22 passed, 0 failed. No dependencies — pure Node.js with a minimal DOM mock.

`Tests-client.html` is also available for browser runs (macOS: `open Tests-client.html`).

> **Sync rule**: `applyHint` and `lockFirst` in both test files are copies of the
> closures in `Sidebar-js.html`. Both carry `// SYNC:` comments. Update all three
> whenever either function changes.
