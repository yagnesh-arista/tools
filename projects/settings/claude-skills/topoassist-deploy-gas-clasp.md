Deploy TopoAssist to Google Apps Script via clasp.

Steps:
1. Check clasp is installed:
   `npm list -g @google/clasp 2>/dev/null | grep clasp`
   If missing: `npm install -g @google/clasp`

2. Verify clasp auth is valid (not just present — token may be expired):
   `clasp login --status 2>&1`
   - If output contains "Logged in": ✓ authenticated — continue.
   - If output contains "not logged in" or any error: ✗ stop immediately — tell the user to run `clasp login` manually (never run it yourself — concurrent logins corrupt the token).
   Do NOT proceed to push if auth is uncertain.

3. Pull latest commits so local is in sync:
   `git -C ~/claude pull`

4. Push all GAS files to Apps Script:
   `cd ~/claude/projects/topoassist && clasp push`

5. Report results as a status block:
   - clasp: ✓ authenticated
   - git: ✓ up to date  (or show what was pulled)
   - push: ✓ 8 files pushed at <time>  (or ✗ error message)
