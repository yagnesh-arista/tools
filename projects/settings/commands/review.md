Run a full review of the current project. First detect the project type, then run the
appropriate checks. Report each check with ✓ / ✗ / ⚠. Treat any ✗ as a blocker.

---

## Step 1 — Detect Project Type

Run these checks on the current working directory (or the file being changed):

```bash
git rev-parse --git-dir 2>/dev/null
```

| Result | Project Type | Review Mode |
|---|---|---|
| Returns a path | Git repository | → Git Mode |
| Fails + path is under `~/claude/projects/` | Local non-git project | → Local Mode |
| Fails + path is elsewhere | Unmanaged location | → Minimal Mode |

---

## Git Mode

### 1. Staged vs Unstaged
- `git diff --cached --name-only` — list staged files
- `git diff --name-only` — list unstaged files
- ⚠ WARN if unstaged changes exist in files unrelated to this task

### 2. Unrelated Changes
- Review `git diff --cached`
- ✗ FAIL if staged changes include modifications outside the stated task scope

### 3. Secrets & Credentials
- Scan staged diff for: hardcoded tokens, API keys, passwords, private keys, connection strings
- ✗ FAIL if any found — list exact file and line

### 4. Debug Artifacts
- Scan staged diff for: `console.log`, `print(`, `debugger`, `pdb.set_trace`, `breakpoint()`, commented-out code blocks, unresolved `TODO`/`FIXME` in changed lines
- ✗ FAIL if any found — list exact file and line

### 5. Test Coverage
- Identify changed production code files
- Check if corresponding tests were added or updated
- ✗ FAIL if critical behavior changed with no test update

### 6. Code Quality
- No over-engineering or hacks introduced
- No new unnecessary dependencies
- New code matches existing conventions

### 7. Security
- New system boundaries (user input, API calls, env vars)?
- ✗ FAIL if new input is unvalidated or credentials exposed

---

## Local Mode (~/claude/projects/, no git)

### 1. Backup Check
- Look in `<project>/.claude/backups/` for recent backups
- ⚠ WARN if no backup exists for files that were changed (hook should have created one)
- List the most recent backup per file for rollback reference

### 2. Changed Files Diff
- For each changed file that has a backup, run:
  ```bash
  diff <backup_file> <current_file>
  ```
- Summarise what changed — flag anything outside the stated task scope

### 3. Secrets & Credentials
- Scan all changed file content for: hardcoded tokens, passwords, API keys, connection strings
- ✗ FAIL if any found — list exact file and line

### 4. Debug Artifacts
- Scan changed files for: `console.log`, `print(`, `debugger`, `pdb.set_trace`, `breakpoint()`, commented-out code, unresolved `TODO`/`FIXME`
- ✗ FAIL if any found

### 5. Test Coverage
- Check if tests exist and were updated alongside production code changes
- ✗ FAIL if critical behavior changed with no test update

### 6. INSTRUCTIONS sync
- ✗ FAIL if `INSTRUCTIONS_<project>.txt` was not updated after code changes
- Check "Last updated" date matches today

---

## Minimal Mode (unmanaged location, no git)

⚠ WARN: This file is outside `~/claude/projects/` and has no git tracking.
No backup was created automatically. Proceed with extra caution.

### 1. Secrets & Credentials
- Scan file content for hardcoded credentials
- ✗ FAIL if any found

### 2. Debug Artifacts
- Scan file for debug statements and unresolved TODOs
- ✗ FAIL if any found

### 3. Scope Check
- Confirm changes are limited to what was requested
- ⚠ WARN about any unrelated modifications

---

## Output Format

```
REVIEW SUMMARY — [Git / Local / Minimal] Mode
=============================================
✓ No unrelated changes
✓ No secrets found
✗ FAIL: debug statement — src/api.py:42 (console.log)
✓ Tests updated
⚠ WARN: 2 unstaged files unrelated to this task
✓ INSTRUCTIONS_<project>.txt updated

Status: BLOCKED — resolve 1 failure before proceeding.
```
