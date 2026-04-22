Review the TopoAssist knowledge system for staleness, conflicts, redundancy, and gaps,
then clean it to a single consistent, refreshed state across all sources.

Sources covered: INSTRUCTIONS_topoassist.txt · CLAUDE.md (project + global) ·
~/.claude/rules/*.md · memory files · topoassist-* hooks

**NEVER resolve a conflict unilaterally — always ask the user first.**

---

## Tiering Model (read this first — it governs all checks below)

The knowledge system has three tiers:

| Tier | Source | When loaded | Purpose |
|---|---|---|---|
| **Tier 1** | `~/claude/CLAUDE.md` + `~/.claude/rules/*.md` + project `CLAUDE.md` | Always — every session | Universal rules, enforced automatically |
| **Tier 2** | `memory/*.md` files | On recall only | Project context, historical decisions, project-specific behaviors |
| **Tier 3** | `INSTRUCTIONS_<project>.txt` | Explicitly, on demand | Full technical detail for rebuild/reference |

**Core rule: Tier 2 (memory) must NEVER restate what is in Tier 1.**
A memory file that duplicates a Tier 1 rule is redundant — it adds drift risk and double-context with no benefit. Delete it; the Tier 1 source already fires every session.

**Memory belongs in Tier 2 only if:**
- It is contextual, historical, or project-specific (not a universal coding rule)
- It has genuine "why" that isn't obvious from the code or CLAUDE.md
- It is NOT already in CLAUDE.md (global or project) or rules/*.md

**"Missing" from memory ≠ undocumented:** Before flagging something as missing, check Tier 1 first.
If it's in CLAUDE.md or rules/*.md — it is NOT missing. It is correctly in Tier 1.

---

## Step 1 — Collect All Sources

Read each source in full (use Read/Grep/Bash):

```bash
# INSTRUCTIONS + CLAUDE.md
cat ~/claude/projects/topoassist/INSTRUCTIONS_topoassist.txt
cat ~/claude/projects/topoassist/CLAUDE.md
cat ~/claude/CLAUDE.md

# Global modular rules (Tier 1)
cat ~/.claude/rules/ui.md
cat ~/.claude/rules/gas.md
cat ~/.claude/rules/quality.md
cat ~/.claude/rules/security.md
cat ~/.claude/rules/testing.md

# All memory files (Tier 2)
ls ~/.claude/projects/-home-yagnesh-claude/memory/*.md
cat ~/.claude/projects/-home-yagnesh-claude/memory/MEMORY.md
# then read each file listed in MEMORY.md

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

**INSTRUCTIONS_topoassist.txt (Tier 3)**
- Each design constraint / invariant (function signatures, param counts, encoding rules, sync rules)
- The "Last updated" rolling history — flag "Previous:" entries that may be superseded

**CLAUDE.md global + rules/*.md (Tier 1)**
- List every rule by number/topic — this is the baseline for the redundancy check

**CLAUDE.md project (Tier 1)**
- Each bullet as a single claim (function name, param count, rule, invariant)

**Memory files (Tier 2)**
For each file in MEMORY.md: what it claims, its type, and whether it duplicates any Tier 1 source

**Hooks** — for each topoassist-* hook: what it guards, what pattern it expects in code

---

## Step 3 — Cross-Check for Issues

Run each check and collect findings:

### R — Redundant (memory duplicates Tier 1 — delete the memory file)
This is the most common issue. For EVERY memory file, ask:
"Is the core rule/behavior of this file already expressed in CLAUDE.md (global or project) or rules/*.md?"
- If yes → R. The Tier 1 source fires every session. The memory file adds nothing and drifts.
- Examples of correctly deleted files: feedback for JetBrains Mono (CLAUDE.md Rule 2),
  UI symmetry (Rule 3), modal canvas bounds (Rule 4), global rules propagation (Rule 5),
  user-select:none (Rule 6), SVG icons (Rule 7a), INSTRUCTIONS discipline (Rule 1),
  user feedback on long actions (Rule 9), reuse/enhance (Rule 11a), git push (Rule 17),
  input taxonomy (rules/ui.md), info-box--dim (rules/ui.md), Winnow usage (project CLAUDE.md),
  file list after changes (project CLAUDE.md), conditional format sync (project CLAUDE.md),
  UserGuide update check (project CLAUDE.md), VERSION sync (project CLAUDE.md).

### S — Stale (documented but no longer true)
- INSTRUCTIONS / CLAUDE.md mentions a function, param count, column name, or behavior
  that doesn't match what grep found in the actual code
- A memory entry references a pattern that has since been renamed, removed, or superseded
- A hook expects a code pattern (function name, file structure, test registration) that no longer exists
- Any "Previous:" entry in INSTRUCTIONS that contradicts the current "Last updated"

### C — Conflict (two sources disagree about the same thing)
- INSTRUCTIONS says X, CLAUDE.md says Y about the same function/rule
- A memory entry contradicts a global rule in rules/*.md
- A hook enforces behavior A but the code now follows behavior B
- Two memory files give different guidance for the same situation

### D — Duplicate (same rule in 2+ Tier 2 memory files, or memory vs INSTRUCTIONS verbatim)
- Two memory files covering the same topic — keep the more detailed one
- INSTRUCTIONS section copy-pasted verbatim into memory (INSTRUCTIONS is Tier 3, memory is Tier 2 — don't mirror)

### M — Missing (real pattern NOT in Tier 1 OR Tier 2 OR Tier 3)
**Before flagging missing: check Tier 1 first.** If it's in CLAUDE.md or rules/*.md, it is NOT missing.
Genuine missing items are:
- A hook enforces something with no corresponding INSTRUCTIONS entry
- A project-specific behavior (deploy step, version sync, file-pair invariant) undocumented everywhere
- A Tier 3 (INSTRUCTIONS) section with no corresponding memory or CLAUDE.md entry for a critical invariant
- A recently added code pattern (new invariant) not documented in any tier

---

## Step 4 — Present Findings

Output this report — do NOT apply any changes yet:

```
TOPOASSIST MEMORY REVIEW
========================
Sources read:
  INSTRUCTIONS_topoassist.txt — last updated: [date]
  CLAUDE.md (project) — [N] constraints
  Memory files — [N] files ([N] TopoAssist-specific + [N] system/user)
  Global rules (Tier 1) — [N] rule files
  Hooks — [N] topoassist-* hooks active

── REDUNDANT (memory duplicates Tier 1 — safe to delete) ────────
  [memory file]: "[topic]"
  → Already in: [CLAUDE.md Rule N / rules/X.md section Y]

── STALE (documented but no longer true) ─────────────────────────
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

── MISSING (not in Tier 1 OR Tier 2 OR Tier 3) ──────────────────
  [what is missing] — suggest: [add to memory / add to CLAUDE.md / add to INSTRUCTIONS]

── DUPLICATES (same rule in 2+ Tier 2 files) ────────────────────
  [file A] and [file B] both cover [topic] → keep [A/B], delete the other

─────────────────────────────────────────────────────────────────
Status: [N] redundant · [N] stale · [N] updates · [N] CONFLICTS (blocked) · [N] missing · [N] duplicates
```

---

## Step 5 — Resolve Conflicts

For **each conflict** listed above, ask the user explicitly:

> "CONFLICT [N]: Source A ([file]) says '[X]'. Source B ([file]) says '[Y]'.
> Which is the correct, authoritative version?"

Do NOT guess. Wait for the user's answer before moving on.
Ask all conflicts in a single AskUserQuestion call if the tool supports it, otherwise one at a time.

---

## Step 6 — Apply Cleanup

Apply changes in this order:

1. **Delete redundant memory files** (R items)
   - `rm` the file; remove its line from MEMORY.md
   - No cross-reference needed — the Tier 1 source already enforces it every session

2. **Remove stale entries** (S items)
   - Edit INSTRUCTIONS_topoassist.txt: delete outdated constraints
   - Delete stale memory files; remove from MEMORY.md
   - If a hook guards a removed pattern, flag it (do not edit hooks without explicit user ask)

3. **Apply updates** (UPDATE items)
   - Edit INSTRUCTIONS_topoassist.txt in-place (keep "Last updated" chain intact)
   - Edit memory files in-place (keep frontmatter, update body)
   - Edit CLAUDE.md bullets where constraints changed

4. **Add missing entries** (M items)
   - Decide tier first: universal rule → Tier 1 (CLAUDE.md or rules/*.md); contextual/project → Tier 2 (memory)
   - For Tier 2: new memory file with frontmatter, add MEMORY.md index entry
   - For Tier 1 additions: update CLAUDE.md or rules/*.md, do NOT also create a memory file
   - For Tier 3 gaps: add INSTRUCTIONS_topoassist.txt section

5. **Resolve duplicates** (D items)
   - Keep authoritative source; delete the other

6. **Update INSTRUCTIONS Last updated** to today's date with review summary.

---

## Step 7 — Final Report + Commit

After all changes applied, output:

```
CLEANUP COMPLETE
================
Deleted  : [N] redundant — [list]
Removed  : [N] stale — [list]
Updated  : [N] — [list]
Added    : [N] — [list with tier]
Conflicts resolved: [N] — [brief summary]
Duplicates removed: [N] — [list]

All sources consistent. Tier separation clean. State: CLEAN.
```

Then commit:
```bash
git add ~/claude/projects/topoassist/INSTRUCTIONS_topoassist.txt \
        ~/claude/projects/topoassist/CLAUDE.md \
        ~/.claude/projects/-home-yagnesh-claude/memory/ \
        ~/.claude/commands/topoassist-review-memory.md \
        ~/claude/CLAUDE.md
git commit -m "TopoAssist: memory review — prune redundant, resolve conflicts, fill gaps"
git push
```
