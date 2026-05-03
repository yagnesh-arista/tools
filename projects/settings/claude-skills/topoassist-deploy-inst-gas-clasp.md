Re-authenticate clasp for TopoAssist GAS deployment. Run on bus-home:

`clasp` at `~/.local/bin/clasp` is a symlink to the NVM v3.3.0 binary at
`~/.nvm/versions/node/v24.14.1/bin/clasp`. If `clasp: command not found`, run
`source ~/.bashrc` first (it loads nvm).

**Do NOT reformat credentials after login.** `clasp login` writes V3 format
`{"tokens":{"default":{...}}}` which clasp v3.3.0 reads natively.

1. Delete stale credentials and log in fresh (`--no-localhost` required — bus-home has no local browser):
   ```bash
   rm -f ~/.clasprc.json
   source ~/.bashrc && cd ~/claude/projects/topoassist && clasp login --no-localhost
   ```
   Visit the printed URL in a browser, complete the OAuth flow, then paste the
   full `http://localhost:8888/?code=...` redirect URL back into the terminal prompt.

2. Push to GAS (dev sheet):
   ```bash
   source ~/.bashrc && cd ~/claude/projects/topoassist && clasp push --force
   ```
