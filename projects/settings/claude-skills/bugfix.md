Fix the bug described by the user. Follow this structured workflow — do not skip steps.

## Step 1 — Diagnose Before Diving

List the top 3 most likely root causes ranked by probability. For each, state:
- What evidence would confirm or rule it out
- Which diagnostic command would check it

**Always check credentials/auth first** if the failure involves a CLI tool, API, or external
service. Expired tokens and quota exhaustion are the most common silent failure modes.

Do NOT write any code yet.

---

## Step 2 — Confirm Root Cause

Run the diagnostic(s) from Step 1. Read the output carefully.

If the most likely hypothesis is confirmed → proceed to Step 3.
If ruled out → re-rank and try the next candidate. Do not guess — diagnose.

---

## Step 3 — Plan the Fix

Before editing any file:
- State the root cause in one sentence
- State the minimal fix (what exactly changes, in what file, at what line)
- State what could go wrong (side effects, edge cases)

For UI changes: describe the exact visual outcome. Example: "The badge will hide when count
is 0 (display:none), show a live-computed count otherwise. No capping." Wait for confirmation
if the visual outcome is ambiguous.

---

## Step 4 — Implement

Apply the minimal fix. Do NOT:
- Refactor surrounding code
- Add error handling for impossible cases
- Change anything outside the stated scope

---

## Step 5 — Verify

- Run the relevant test suite if one exists
- For UI changes: trace the full rendering path (data → DOM → CSS visibility) and confirm
  the change would be visible after a page/sidebar reload — state this explicitly
- For GAS changes: state "requires clasp push + sidebar reload to verify"
- For Python: `pytest tests/ -v` and confirm 0 failures

---

## Step 6 — Commit

Stage only the changed files. Write a commit message that names the root cause and fix:

```
fix(<scope>): <what broke> — <what fixed it>
```

Example: `fix(bridge): shut ports counted as down — bridgePortSubType now set before render`

Push: `git push`

---

## Step 7 — Report

One-line summary:
- Root cause found
- Fix applied (file:line)
- Test result
- Any follow-up needed
