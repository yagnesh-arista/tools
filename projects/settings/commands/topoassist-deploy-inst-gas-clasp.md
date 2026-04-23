Re-authenticate clasp for TopoAssist GAS deployment. Run on bus-home:

clasp is installed under nvm. If `clasp` is not found, load it first:
```bash
export PATH="$HOME/.nvm/versions/node/v24.14.1/bin:$PATH"
```

1. Log in to Google via clasp (use `--no-localhost` — required for SSH/headless sessions):
   ```bash
   cd ~/claude/projects/topoassist && clasp login --no-localhost
   ```
   Visit the printed URL in a browser, complete the OAuth flow, then paste the redirect URL back into the terminal. Credentials are saved to `~/.clasprc.json`.

2. Verify authentication succeeded:
   ```bash
   ls ~/.clasprc.json && echo "✓ authenticated"
   ```

3. Push to GAS:
   ```bash
   cd ~/claude/projects/topoassist && clasp push --force
   ```
