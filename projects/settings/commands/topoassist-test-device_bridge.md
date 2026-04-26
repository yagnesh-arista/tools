# Run TopoAssist Tests

Run the Python test suite for device_bridge.py pure functions.

```bash
cd ~/claude/projects/topoassist && python3 -m pytest tests/ -v
```

Expected: 62 passed, 0 failed.

For GAS tests (Code.gs pure functions):
- Open Apps Script editor (Extensions → Apps Script)
- Select function: `runAllTests`
- Click Run
- Alert shows summary; Execution Log has per-test detail
