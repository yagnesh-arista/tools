Run a full code review. Detect project type, then execute all checks below. Report each
check with ✓ / ✗ / ⚠. Any ✗ is a blocker. Be specific — cite file and line for every finding.

---

## Step 1 — Detect Scope

Determine what to review:
- If invoked on a commit: review that commit's diff
- If invoked with staged changes: review `git diff --cached`
- If invoked on a file/directory: review that file/directory
- If no context: review all recently changed files in the project

Detect project type:
```bash
git rev-parse --git-dir 2>/dev/null
```
- Returns path → **Git Mode**
- Fails + path under `~/claude/projects/` → **Local Mode**
- Fails elsewhere → **Minimal Mode**

---

## Check A — Scope & Hygiene

### A1. Unrelated Changes
- ✗ FAIL if changes include modifications outside the stated task scope
- ⚠ WARN if unstaged files exist that are unrelated to this task

### A2. Secrets & Credentials
- Scan for: hardcoded tokens, API keys, passwords, private keys, connection strings, IPs/hostnames that look like real infra
- ✗ FAIL if any found — list exact file and line

### A3. Debug Artifacts
- Scan for: `console.log`, `print(`, `debugger`, `pdb.set_trace`, `breakpoint()`, commented-out code blocks, unresolved `TODO`/`FIXME` in changed lines
- ✗ FAIL if any found — list exact file and line

---

## Check B — Correctness & Bugs

### B1. Logic Bugs
- Read changed code carefully for: off-by-one errors, null/undefined dereference, wrong variable used, race conditions, missing error handling at system boundaries (user input, external APIs, env vars)
- ✗ FAIL for each confirmed bug — describe the failure mode

### B2. Security
- New input from users, APIs, or env vars must be validated/escaped before use
- ✗ FAIL if new input is unvalidated — SQL injection, XSS, command injection, path traversal

### B3. Error Handling
- Only validate at real boundaries — do not add defensive fallbacks for things that cannot happen
- ✗ FAIL if error handling is missing at a real boundary
- ✗ FAIL if speculative error handling was added for impossible cases (over-engineering)

---

## Check C — Design Quality

### C1. Over-Engineering
Look for: unnecessary abstractions, premature generalization, unneeded configurability, fallbacks
for scenarios that cannot happen, wrappers around single calls, indirection with no benefit.
- ✗ FAIL if found — explain what could be removed and why

### C2. Under-Engineering
Look for: copy-pasted logic (3+ similar blocks without abstraction), hardcoded values that will
obviously need to change, hacks that work now but will break under predictable conditions,
missing abstractions that make the code hard to reason about.
- ✗ FAIL if found — explain what should be abstracted and why

### C3. Elegance & Best Practices
- Does new code match the conventions and patterns already in the codebase?
- Are names clear and consistent?
- Is the logic as simple as it could be for what it does?
- ⚠ WARN for style issues; ✗ FAIL for practices that will cause maintainability problems

### C4. Refactoring Opportunities
- Identify any code (not just changed lines) that could be meaningfully simplified
- Only flag real improvements — not cosmetic or speculative ones
- Report as ⚠ (not blockers) with a concrete description of the simplification

---

## Check D — Tests

### D1. Coverage
- Identify changed production code with critical behavior
- ✗ FAIL if critical behavior was changed or added with no corresponding test

### D2. Test Quality
- Tests must test real production code, not reimplementations
- Mocks must be minimal — only mock things you cannot control (network, filesystem, time)
- ✗ FAIL if tests mock internal logic instead of external dependencies
- ✗ FAIL if tests duplicate each other (same behavior tested multiple times with no variation)
- ✗ FAIL if tests only test the mock, not the code under test

---

## Check E — Project Sync (Local Mode only)

### E1. INSTRUCTIONS sync
- ✗ FAIL if `INSTRUCTIONS_<project>.txt` was not updated after code changes
- Check "Last updated" date matches today

### E2. Backup Check
- ⚠ WARN if no recent backup exists for changed files

---

## Output Format

```
REVIEW SUMMARY
==============
Scope  : [commit abc1234 / staged changes / file X / project-wide]
Mode   : [Git / Local / Minimal]

A — Scope & Hygiene
  ✓ No unrelated changes
  ✓ No secrets found
  ✗ FAIL: debug statement — src/api.py:42  console.log("test")

B — Correctness & Bugs
  ✓ No logic bugs found
  ✗ FAIL: null dereference — Sidebar-js.html:4852  allNodesData[u].details (no null check)

C — Design Quality
  ✓ No over-engineering
  ✓ No under-engineering
  ⚠ WARN: IP resolution pattern duplicated 4× — could extract to resolveDeviceIp(name)

D — Tests
  ⚠ No test files found — GAS makes E2E hard; pure logic functions are testable

E — Project Sync
  ✓ INSTRUCTIONS_topoassist.txt updated today

─────────────────────────────────────
Status: BLOCKED — 2 failures must be resolved before proceeding.
        (or: CLEAN — ready to ship.)
```
