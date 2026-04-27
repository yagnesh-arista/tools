Fix all failures from the most recent /review-global (or /review-topoassist) run, then commit.

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
