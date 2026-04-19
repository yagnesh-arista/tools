Deploy TopoAssist to Google Apps Script via clasp.

Steps:
1. Pull latest commits so the Mac is in sync:
   `git -C ~/claude pull`

2. Push all GAS files to Apps Script:
   `cd ~/claude/projects/topoassist && clasp push`

3. Report which files were pushed and confirm success or surface any errors.

Prerequisites (report and stop if either is missing):
- clasp installed: `npm list -g @google/clasp` — if missing: `npm install -g @google/clasp`
- clasp authenticated: `clasp whoami` — if not logged in: `clasp login`
