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

2. Fix credential format — `clasp login` writes `tokens.default` but the installed clasp
   reads `token`. Run this after every login:
   ```bash
   python3 -c "
   import json
   with open('/home/yagnesh/.clasprc.json') as f:
       d = json.load(f)
   tok = d['tokens']['default']
   out = {'token': {
       'access_token': tok['access_token'],
       'refresh_token': tok['refresh_token'],
       'client_id': tok['client_id'],
       'client_secret': tok['client_secret'],
       'token_type': 'Bearer'
   }}
   with open('/home/yagnesh/.clasprc.json', 'w') as f:
       json.dump(out, f, indent=2)
   print('✓ clasprc rewritten to token format')
   "
   ```

3. Push to GAS (dev sheet):
   ```bash
   cd ~/claude/projects/topoassist && clasp push --force
   ```
