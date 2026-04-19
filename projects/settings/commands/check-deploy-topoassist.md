Run a three-way sync check across git → local → GAS remote, then show commit history by time window.

Execute the standalone script and report the results:

```bash
bash ~/claude/projects/topoassist/.claude/check-deploy.sh
```

After running:
1. Show the sync table (Section 1) — highlight any DIRTY or DIFFERS rows and state the action needed (git commit, clasp push, VERSION bump).
2. Show the commit history (Section 2) — note any [GAS] files changed (auto-pushed by hook or needs manual clasp push), any [LOCAL] files (needs Mac scp deploy), and any uncommitted files (⚠ needs git commit).
