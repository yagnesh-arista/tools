Re-authenticate clasp for TopoAssist GAS deployment. Run on bus-home:

clasp is at ~/.local/bin/clasp (symlink, requires nvm node in PATH) and also at
~/.nvm/versions/node/v24.14.1/bin/clasp. Both require nvm to be initialized.
If `clasp: command not found`, run `source ~/.bashrc` first (it loads nvm).

1. Delete stale credentials and log in fresh (`--no-localhost` required — bus-home has no local browser):
   ```bash
   rm -f ~/.clasprc.json
   source ~/.bashrc && cd ~/claude/projects/topoassist && clasp login --no-localhost
   ```
   Visit the printed URL in a browser, complete the OAuth flow, then paste the
   full `http://localhost:8888/?code=...` URL back into the terminal prompt.

   `clasp login` writes V3 format `{"tokens":{"default":{...}}}` — **do NOT reformat it**.
   The NVM clasp binary reads this format natively. Converting to `{"token":{...}}` (V1)
   breaks subsequent pushes because V1 local requires `oauth2ClientSettings` which login
   does not write.

2. Push to GAS (dev sheet):
   ```bash
   source ~/.bashrc && cd ~/claude/projects/topoassist && clasp push --force
   ```
