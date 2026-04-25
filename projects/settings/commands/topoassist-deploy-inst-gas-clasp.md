Re-authenticate clasp for TopoAssist GAS deployment. Run on bus-home:

clasp is at ~/.local/bin/clasp (symlink, requires nvm node in PATH) and also at
~/.nvm/versions/node/v24.14.1/bin/clasp. Both require nvm to be initialized.
If `clasp: command not found`, run `source ~/.bashrc` first (it loads nvm).

1. Log in to Google via clasp (`--no-localhost` required — bus-home has no local browser listener):
   ```bash
   source ~/.bashrc && cd ~/claude/projects/topoassist && clasp login --no-localhost
   ```
   Visit the printed URL in a browser, complete the OAuth flow, then paste the
   authorization code shown on the page back into the terminal prompt.
   Credentials are saved to `~/.clasprc.json`.

2. Verify authentication succeeded:
   ```bash
   ls ~/.clasprc.json && echo "✓ authenticated"
   ```

3. Push to GAS:
   ```bash
   cd ~/claude/projects/topoassist && clasp push --force
   ```
