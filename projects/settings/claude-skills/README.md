# Claude Skills

Custom slash commands for Claude Code. Each `.md` file is a skill invoked via `/skill-name` in a Claude session.

Skills live in `~/.claude/commands/` and are auto-backed-up here by hook on every edit.

## General Skills

| Skill | Description |
|---|---|
| `new-project` | Bootstrap a new project — collects name, stack, deploy method, invariants before creating any files |
| `review-global` | Full code review: secrets scan, debug check, test coverage, git status, pre-commit validation |
| `fix-and-commit` | Fix all failures from the last `/review-global` run, then commit |
| `review-memory` | Audit the memory system for staleness, conflicts, redundancy, and gaps |

## TopoAssist Skills

| Skill | Description |
|---|---|
| `topoassist-deploy-gas-clasp` | Push all GAS files to Google Apps Script via clasp |
| `topoassist-deploy-git` | Push TopoAssist changes to GitHub |
| `topoassist-deploy-inst-gas-clasp` | Re-authenticate clasp (headless/SSH sessions) |
| `topoassist-deploy-inst-device_bridge` | Deploy `device_bridge.py` to Mac via scp |
| `topoassist-review-deploy` | Three-way sync check: git → local → GAS remote + commit history |
| `topoassist-review-code-design` | TopoAssist design constraint review |
| `topoassist-review-code-full` | Full TopoAssist review (design + global) |
| `topoassist-review-userguide` | Review session changes and update UserGuide.html |
| `topoassist-review-memory` | Review TopoAssist memory entries for staleness |
| `topoassist-test-device_bridge` | Run pytest suite for `device_bridge.py` |
