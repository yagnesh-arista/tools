Push the current TopoAssist code to the template/demo Google Sheet.

Run on bus-home. Requires valid clasp auth (`~/.clasprc.json`).

## When to use this
- After any bug fix or user-facing change you want reflected in the shared template
- After major feature milestones (consider git tagging with `git tag vYYMMDD`)
- NOT on every commit — template is intentional releases only

## Deploy steps

```bash
cd ~/claude/projects/topoassist && source ~/.bashrc

# Swap to template Script ID, push, restore dev config
cp .clasp.json .clasp.json.dev && \
cp .clasp-template.json .clasp.json && \
clasp push --force; \
cp .clasp.json.dev .clasp.json && \
rm .clasp.json.dev && \
echo "✓ Template push done — dev .clasp.json restored"
```

## If push fails with invalid_grant

Re-auth first:
```bash
cd ~/claude/projects/topoassist && source ~/.bashrc
clasp login --no-localhost
```
Visit the printed URL, complete OAuth, paste the code. Then re-run the deploy steps above.

## Template sheet IDs (reference)

| | ID |
|---|---|
| Drive (Sheet) | `1mIF9aeQ5oZ1QPkOUpQgGKn55zWAPGIcSjvy7xoapVos` |
| Script | `1CliQdcCkaLfvNoXakyu6wX5MgHQTEVu5kLTOlhxVM5IlyCX180TMx51d` |
| Dev Script | `1NL5x7CnPy2Rceet87qUTWlYxfqWaRC19pk5f1zpQR6k5FWf53BQ2JfDJ` |

Users copy the template sheet via its `/copy` URL (Drive UI → File → Make a copy).

## Optional: tag the release in git

```bash
cd ~/claude && git tag v260503 -m "Template release 2026-05-03"
```
