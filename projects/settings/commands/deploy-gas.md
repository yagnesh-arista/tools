Deploy TopoAssist to Google Apps Script via clasp.

Steps:
1. Check clasp is installed:
   `npm list -g @google/clasp 2>/dev/null | grep clasp`
   If missing: `npm install -g @google/clasp`

2. Check clasp is authenticated (credentials file exists):
   `ls ~/.clasprc.json 2>/dev/null && echo "authenticated" || echo "run: clasp login"`
   If not authenticated: stop and tell the user to run `clasp login`.

3. Pull latest commits so local is in sync:
   `git -C ~/claude pull`

4. Push all GAS files to Apps Script:
   `cd ~/claude/projects/topoassist && clasp push`

5. Report the list of pushed files and confirm success or surface any errors.
