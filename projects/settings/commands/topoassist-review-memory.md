Review the TopoAssist knowledge system for staleness, conflicts, duplicates, and gaps,
then clean it to a single consistent, refreshed state across all sources.

Sources covered: INSTRUCTIONS_topoassist.txt · CLAUDE.md (project + global) ·
~/.claude/rules/*.md · memory files · topoassist-* hooks

**NEVER resolve a conflict unilaterally — always ask the user first.**

---

## Step 1 — Collect All Sources

Read each source in full (use Read/Grep/Bash):

```bash
# INSTRUCTIONS + CLAUDE.md
cat ~/claude/projects/topoassist/INSTRUCTIONS_topoassist.txt
cat ~/claude/projects/topoassist/CLAUDE.md
cat ~/claude/CLAUDE.md

# Global modular rules
cat ~/.claude/rules/ui.md
cat ~/.claude/rules/gas.md
cat ~/.claude/rules/quality.md
cat ~/.claude/rules/security.md
cat ~/.claude/rules/testing.md

# All memory files (TopoAssist-specific + "ALL projects")
ls ~/.claude/projects/-home-yagnesh-claude/memory/*.md
cat ~/.claude/projects/-home-yagnesh-claude/memory/MEMORY.md
# then read each file mentioned in MEMORY.md under TopoAssist or "ALL projects"

# Hooks
cat ~/.claude/settings.json    # PostToolUse/PreToolUse hook list
cat ~/.claude/hooks/topoassist-pytest-check.sh
cat ~/.claude/hooks/topoassist-gas-test-check.sh
cat ~/.claude/hooks/topoassist-userguide-check.sh
cat ~/.claude/hooks/topoassist-deploy-tracker.sh

# Code verification — grep for function signatures + key identifiers
grep -n "^function generate\|^function canonicalize\|^function parseVlan\|^function getPhysical\|^function compress\|^function _break\|^function _build\|^function getNetworkSettings\|^function hasKey" \
  ~/claude/projects/topoassist/Code.gs
grep -n "APP_VERSION\|generateConfig\|generateBGP\|getNetworkSettings" \
  ~/claude/projects/topoassist/Code.gs | head -20
grep -n "DUPLICATED\|last synced" \
  ~/claude/projects/topoassist/Code.gs \
  ~/claude/projects/topoassist/Sidebar-js.html
```

---

## Step 2 — Build the Inventory

For each source, extract its claims as a flat list:

**INSTRUCTIONS_topoassist.txt**
- Each design constraint / invariant (function signatures, param counts, encoding rules, sync rules)
- The "Last updated" rolling history — flag any "Previous:" entries that may have been superseded by code changes since

**CLAUDE.md (project)**
- Each bullet as a single claim (function name, param count, rule, invariant)

**Memory files**
For each TopoAssist or "ALL projects" memory file: what it claims, its type, scope

**Hooks** — for each topoassist-* hook: what it guards, what pattern it expects in code

**Global rules** — list each rule that overlaps with any TopoAssist memory/INSTRUCTIONS claim

---

## Step 3 — Cross-Check for Issues

Run each check and collect findings:

### S — Stale (documented but no longer true)
- INSTRUCTIONS / CLAUDE.md mentions a function, param count, column name, or behavior
  that doesn't match what grep found in the actual code
- A memory entry references a pattern that has since been renamed, removed, or superseded
- A hook expects a code pattern (function name, file structure, test registration) that no longer exists
- Any "Previous:" entry in INSTRUCTIONS that contradicts the current "Last updated" — is the old entry still valid or fully superseded?

### C — Conflict (two sources disagree about the same thing)
- INSTRUCTIONS says X, CLAUDE.md says Y about the same function/rule
- A memory entry contradicts a global rule in rules/*.md
- A hook enforces behavior A but the code now follows behavior B
- Two memory files give different guidance for the same situation

### D — Duplicate (identical rule in 2+ places)
- A memory entry that fully restates a rule already in rules/*.md or CLAUDE.md verbatim
- An INSTRUCTIONS section that is copy-pasted verbatim into CLAUDE.md
  (CLAUDE.md should be a 1-2 line summary pointer, not a full restatement)

### M — Missing (real pattern/constraint not documented anywhere)
- A hook enforces something with no corresponding INSTRUCTIONS entry or memory file
- A code pattern enforced consistently (e.g. a new invariant added recently) has no documentation
- A CLAUDE.md bullet has no supporting detail in INSTRUCTIONS

---

## Step 4 — Present Findings

Output this report — do NOT apply any changes yet:

```
TOPOASSIST MEMORY REVIEW
========================
Sources read:
  INSTRUCTIONS_topoassist.txt — last updated: [date]
  CLAUDE.md (project) — [N] constraints
  Memory files — [N] TopoAssist + [N] ALL-projects files
  Global rules — [N] rule files
  Hooks — [N] topoassist-* hooks active

── STALE (safe to remove/update, no user input needed) ──────────
  [source] "[what it says]"
  → Reason stale: [why]

── UPDATE (partially correct — needs a specific fix) ─────────────
  [source] "[current text]"
  → Should be: "[corrected text]"

── CONFLICTS — MUST resolve before proceeding ────────────────────
  CONFLICT 1: [topic]
    Source A ([file]): "[says X]"
    Source B ([file]): "[says Y]"
    → Which is correct?

  CONFLICT 2: ...

── MISSING (no documentation found) ─────────────────────────────
  Hook [name] enforces [pattern] — no INSTRUCTIONS/memory entry found
  Code pattern [X] has no memory or INSTRUCTIONS entry

── DUPLICATES (keep one, trim the other) ─────────────────────────
  [memory file] restates [rules/X.md] rule verbatim → remove from memory
  [INSTRUCTIONS section] fully repeated in CLAUDE.md → trim CLAUDE.md to 1-2 lines

─────────────────────────────────────────────────────────────────
Status: [N] stale · [N] updates · [N] CONFLICTS (blocked) · [N] missing · [N] duplicates
```

---

## Step 5 — Resolve Conflicts

For **each conflict** listed above, ask the user explicitly:

> "CONFLICT [N]: Source A ([file]) says '[X]'. Source B ([file]) says '[Y]'.
> Which is the correct, authoritative version?"

Present both options clearly. Do NOT guess. Wait for the user's answer before moving on.
Ask all conflicts in a single AskUserQuestion call if the tool supports it, otherwise ask one at a time.

Record each answer before proceeding to Step 6.

---

## Step 6 — Apply Cleanup

Apply changes in this order:

1. **Remove stale entries**
   - Edit INSTRUCTIONS_topoassist.txt: delete or strike outdated constraints
   - Delete stale memory files; remove their line from MEMORY.md
   - If a hook guards a removed pattern, flag it (do not edit hooks without explicit user ask)

2. **Apply updates**
   - Edit INSTRUCTIONS_topoassist.txt sections in-place (keep "Last updated" chain intact)
   - Edit memory files in-place (keep frontmatter, update body)
   - Edit CLAUDE.md bullets where constraints changed

3. **Add missing entries**
   - New memory file for each undocumented pattern (follow memory frontmatter format)
   - Add MEMORY.md index entry for each new file
   - Add INSTRUCTIONS_topoassist.txt section for each new constraint
   - Add CLAUDE.md bullet for each new critical invariant

4. **Trim duplicates**
   - Keep the authoritative source intact
   - In the secondary source, replace the full text with a 1-line cross-reference:
     "See [authoritative source] — not duplicated here"

5. **Update INSTRUCTIONS Last updated** to today's date with a summary of this review run.

---

## Step 7 — Final Report + Commit

After all changes applied, output:

```
CLEANUP COMPLETE
================
Removed  : [N] items — [list]
Updated  : [N] items — [list]
Added    : [N] items — [list]
Conflicts resolved: [N] — [brief summary of each decision]
Duplicates removed: [N] items — [list]

All sources consistent. State: CLEAN.
```

Then commit:
```bash
git add ~/claude/projects/topoassist/INSTRUCTIONS_topoassist.txt \
        ~/claude/projects/topoassist/CLAUDE.md \
        ~/.claude/projects/-home-yagnesh-claude/memory/ \
        ~/claude/CLAUDE.md
git commit -m "TopoAssist: memory/instruction review — prune stale, resolve conflicts, fill gaps"
git push
```
