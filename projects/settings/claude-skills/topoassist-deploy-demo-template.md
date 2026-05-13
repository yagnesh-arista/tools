Push the current TopoAssist code to the template/demo Google Sheet.

Steps:

1. Verify clasp auth is valid:
   `python3 -c "import json; d=json.load(open('/root/.clasprc.json' if __import__('os').path.exists('/root/.clasprc.json') else '/home/' + __import__('os').environ.get('USER','') + '/.clasprc.json')); t=d.get('tokens',{}).get('default',{}); print('refresh_token present:', bool(t.get('refresh_token')))" 2>/dev/null || echo "no .clasprc.json or parse error"`
   - If output contains "refresh_token present: True": ✓ authenticated — continue.
   - If output contains "False", "no .clasprc.json", or any error: ✗ stop — tell the user to run `clasp login --no-localhost` manually (never run it yourself — concurrent logins corrupt the token).
   Do NOT proceed if auth is uncertain.

2. Swap to the template Script ID, push, then restore dev config:
   ```
   cd ~/claude/projects/topoassist && source ~/.bashrc && \
   cp .clasp.json .clasp.json.dev && \
   cp .clasp-template.json .clasp.json && \
   clasp push --force; \
   cp .clasp.json.dev .clasp.json && \
   rm .clasp.json.dev
   ```
   The semicolon before the restore ensures `.clasp.json` is always restored even if push fails.

3. Report results as a status block:
   - clasp auth: ✓ authenticated
   - template push: ✓ N files pushed at <time>  (or ✗ error message)
   - dev config: ✓ .clasp.json restored

---

## Reference

| | ID |
|---|---|
| Template Drive (Sheet) | `1mIF9aeQ5oZ1QPkOUpQgGKn55zWAPGIcSjvy7xoapVos` |
| Template Script | `1CliQdcCkaLfvNoXakyu6wX5MgHQTEVu5kLTOlhxVM5IlyCX180TMx51d` |
| Dev Script | `1NL5x7CnPy2Rceet87qUTWlYxfqWaRC19pk5f1zpQR6k5FWf53BQ2JfDJ` |

## When to deploy to template
- After any bug fix or user-facing change to reflect in the shared template
- After major feature milestones
- NOT on every commit — template is intentional releases only

## Optional: tag the release in git
`git -C ~/claude tag v$(date +%y%m%d) -m "Template release $(date +%Y-%m-%d)"`
