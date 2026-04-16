Before creating any files or directories for this new project, you MUST collect all of the
following. Ask for any that are missing — do not proceed until all are confirmed.

Ask the user these questions (one message, all at once):

---

**New Project Setup — please answer all before I start:**

1. **Project name** — what is the project called? (used for directory name and INSTRUCTIONS file)
2. **Purpose** — what does it do in 1–2 sentences?
3. **Stack** — language, runtime, framework, key libraries/versions
4. **Deploy method** — how does the code get deployed or run? (e.g. scp to remote, GAS push, local script, npm run, etc.)
5. **Invariants / constraints** — anything that must never break or change? (e.g. data safety rules, API contracts, auth boundaries)
6. **External integrations** — any MCP tools, APIs, DBs, or services this project talks to?
7. **Hook coverage** — should edits auto-deploy? If yes, what file triggers what action?

---

Once the user provides all answers, proceed in this order:
1. Create `~/claude/projects/<name>/` directory
2. Run `git init ~/claude/projects/<name>/` — every project must be a git repo from the start
3. Create `INSTRUCTIONS_<name>.txt` with full project detail
4. Create `CLAUDE.md` (project-level) with critical constraints summary
5. Create `.claude/commands/deploy.md` (or `check.md` if auto-deploy isn't possible)
6. Update `~/.claude/settings.json` with PostToolUse hook for auto-deploy if applicable
7. Make an initial git commit: `git add -A && git commit -m "Initial scaffold"`
8. Confirm to user: "Project scaffold complete. Files created: [list]. Git repo initialized."

Do NOT create any files before step 1.
Do NOT skip git init — a project without git has no rollback, no history, no commit guards.
