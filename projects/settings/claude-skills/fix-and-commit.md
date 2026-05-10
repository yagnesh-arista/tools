Fix all failures from the most recent /review-global (or /review-topoassist) run, then commit.
Also handles test-failure mode: run the test suite, fix root causes, loop until green, then commit.

---

## Mode Detection

**If the user says "fix failing tests", "tests are failing", or similar → enter Test-Failure Loop (below).**
Otherwise → proceed to Step 1 (review-driven fix).

---

## Test-Failure Loop (autonomous — no questions)

Run this loop until the full suite is green:

### Round start
1. Run the appropriate test suite for the project:
   - Python (`device_bridge.py`): `cd ~/claude/projects/topoassist && python -m pytest tests/ -v 2>&1 | tail -40`
   - GAS server-side (`Code.gs`): report which tests fail based on last known run or ask user to paste output
   - JS client-side (`test-js.js`): report based on last known run or ask user to paste output
2. Collect all failures. If zero failures → skip to Commit.

### For each failing test
1. Read the failing test to understand the **expected behavior** (not just the assertion).
2. Read the relevant production code in `Code.gs`, `Sidebar-js.html`, or `device_bridge.py`.
3. Identify the **root cause** — do NOT just make the assertion pass; fix the actual bug.
4. Apply the minimal fix. Do not refactor surrounding code.
5. If fixing one test could affect others, note the risk before editing.

### After all fixes in this round
- Re-run the full suite. If new failures appear, fix those too.
- Loop until the suite is fully green.
- Do not ask questions — make best-judgment calls and document any assumptions.

### Then → Commit (Step 4 below)
Write a commit message that lists each bug fixed and its root cause — one line per fix.

---

## Step 1 — Collect Failures

If a review was just run in this session, use those findings.
Otherwise, re-run /review-global now to get current findings.

List every ✗ FAIL item. Do NOT fix ⚠ WARN items unless explicitly asked —
refactoring opportunities are surfaced for awareness, not auto-fixed.

---

## Step 2 — Fix Each Failure

For each ✗ FAIL:
- Read the relevant file and line before editing
- Apply the minimal fix — do not refactor surrounding code
- Confirm the fix addresses the exact failure mode described
- If a fix requires a decision (multiple valid approaches), ask before proceeding

Order of fixes:
1. Secrets / credentials — fix first, never commit these
2. Bugs / null dereferences / logic errors
3. Security (unvalidated input)
4. Missing test coverage
5. Scope / hygiene issues last

---

## Step 3 — Verify Clean

After all fixes applied, re-run /review-global.
- If still BLOCKED: fix remaining failures and repeat
- If CLEAN: proceed to commit

---

## Step 4 — Commit

Stage only the files that were changed as part of the fixes.
Do NOT use `git add -A` blindly — check `git status` first.

Write a commit message that:
- Summarises what was broken and what was fixed
- Does NOT say "fix review failures" — describe the actual issues
- Is concise (1-2 sentences)

```bash
git add <specific files>
git commit -m "..."
git push
```

---

## Step 5 — Report

After committing, summarise:
- What was fixed (one line per failure)
- Commit hash
- Any ⚠ WARN items that were intentionally left for later
