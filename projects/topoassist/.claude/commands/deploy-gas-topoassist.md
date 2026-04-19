Deploy TopoAssist to Google Apps Script via clasp.

Steps:
1. Check clasp is installed:
   `npm list -g @google/clasp 2>/dev/null | grep clasp`
   If missing: `npm install -g @google/clasp`

2. Check clasp is authenticated (credentials file exists):
   `ls ~/.clasprc.json 2>/dev/null && echo "authenticated" || echo "not authenticated"`
   Report clearly: "✓ clasp authenticated" or "✗ Not authenticated — run: clasp login" and stop if not authenticated.

3. Pull latest commits so local is in sync:
   `git -C ~/claude pull`

4. Push all GAS files to Apps Script:
   `cd ~/claude/projects/topoassist && clasp push`

5. Report results as a status block:
   - clasp: ✓ authenticated
   - git: ✓ up to date  (or show what was pulled)
   - push: ✓ 8 files pushed at <time>  (or ✗ error message)
