Re-authenticate clasp for TopoAssist GAS deployment. Run on bus-home:

1. Log in to Google via clasp:
   ```bash
   clasp login
   ```
   This opens a browser — complete the OAuth flow, then credentials are saved to `~/.clasprc.json`.

2. Verify authentication succeeded:
   ```bash
   ls ~/.clasprc.json && echo "✓ authenticated"
   ```

3. Test with a dry push:
   ```bash
   cd ~/claude/projects/topoassist && clasp push --force
   ```
