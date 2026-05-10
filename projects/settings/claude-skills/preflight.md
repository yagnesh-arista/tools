Run session-start validation checks before doing any real work. Report results as a table, fix blockers before proceeding.

---

## Step 1 — Git State

```bash
cd ~/claude
git fetch origin 2>&1 | tail -3
git status --short
git log --oneline origin/main..HEAD 2>/dev/null | head -5
```

Report:
- Working tree: clean / dirty (list modified files)
- Unpushed commits: N ahead of origin
- Remote reachable: ✓ / ✗

---

## Step 2 — clasp Auth (TopoAssist sessions only)

```bash
ls -la ~/.clasprc.json 2>/dev/null && echo "exists" || echo "MISSING"
# Check age — expired tokens cause silent failures
find ~/.clasprc.json -mtime +7 2>/dev/null && echo "WARNING: >7 days old — may need re-auth"
cd ~/claude/projects/topoassist && source ~/.bashrc && clasp status 2>&1 | head -5
```

Report:
- `.clasprc.json`: exists (age) / MISSING
- clasp status: authenticated ✓ / expired ✗ / MISSING ✗

If auth is expired or missing: stop and prompt user to run `/topoassist-deploy-inst-gas-clasp`.

---

## Step 3 — Pending Work From Last Session

Read the session focus memory:
```bash
cat ~/.claude/projects/-home-yagnesh-claude/memory/project_active_focus.md 2>/dev/null
```

If a RESUME.md exists in the project dir, read and summarise it:
```bash
find ~/claude/projects -name RESUME.md 2>/dev/null | xargs cat 2>/dev/null
```

Report what was being worked on and any pending items.

---

## Step 4 — Active Task List

Check for any in-progress tasks from a previous session (TaskList tool).

---

## Step 5 — Report

Print a single table:

```
PRE-FLIGHT CHECK
================
Git state      : clean / N modified / N unpushed
Remote         : reachable ✓ / unreachable ✗
clasp auth     : ok ✓ / expired ✗ / n/a
Last session   : <project> — <summary from focus memory>
Pending tasks  : N (list titles) / none
```

If any check is ✗ FAIL: surface it and help fix it before doing anything else.
If all pass: print `✓ Pre-flight complete` and ask what the user wants to work on.

---

## Step 6 — After Each Major Task This Session

Append a checkpoint to `~/claude/RESUME.md`:
```
## <timestamp> — <task completed>
Done: <what was finished>
Next: <what's still pending>
Blocker: <anything stuck>
```

This ensures the next session can pick up seamlessly if this one hits a budget limit.
