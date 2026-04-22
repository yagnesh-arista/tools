Review the full memory system for staleness, conflicts, redundancy, and gaps,
then clean it to a single consistent, refreshed state across all sources.

Sources covered (Phase 1 — all projects): all memory/*.md files · CLAUDE.md (global + all projects) · ~/.claude/rules/*.md
Sources covered (Phase 2 — TopoAssist): INSTRUCTIONS_topoassist.txt · Code.gs · Sidebar-js.html · topoassist-* hooks

**NEVER resolve a conflict unilaterally — always ask the user first.**

---

## Tiering Model (governs all checks below)

| Tier | Source | When loaded | Purpose |
|---|---|---|---|
| **Tier 1** | `~/claude/CLAUDE.md` + `~/.claude/rules/*.md` + project `CLAUDE.md` | Always — every session | Universal rules, enforced automatically |
| **Tier 2** | `memory/*.md` files | On recall only | Project context, historical decisions, project-specific behaviors |
| **Tier 3** | `INSTRUCTIONS_<project>.txt` | Explicitly, on demand | Full technical detail for rebuild/reference |

**Core rule (CLAUDE.md Rule 23): Tier 2 must NEVER restate what is in Tier 1.**
A memory file that duplicates a Tier 1 rule adds drift risk and double-context. Delete it.

**"Missing from memory" ≠ undocumented.** Check Tier 1 first — if it's there, it's correctly placed.

Memory belongs in Tier 2 only when it is contextual, historical, or project-specific.
When a Tier 2 item proves universally applicable, promote it to Tier 1 and delete the memory file.

---

## Phase 1 — All-Memory Sweep

### Step 1a — Collect Tier 1 Sources

```bash
# Global rules (Tier 1 baseline for redundancy check)
cat ~/claude/CLAUDE.md
cat ~/.claude/rules/ui.md ~/.claude/rules/gas.md ~/.claude/rules/quality.md \
    ~/.claude/rules/security.md ~/.claude/rules/testing.md

# All project CLAUDE.md files (also Tier 1)
for f in ~/claude/projects/*/CLAUDE.md; do echo "=== $f ==="; cat "$f"; done
```

### Step 1b — Collect All Memory Files

```bash
cat ~/.claude/projects/-home-yagnesh-claude/memory/MEMORY.md
ls ~/.claude/projects/-home-yagnesh-claude/memory/*.md
# Read every file listed in MEMORY.md
```

### Step 1c — Verify Memory File Integrity

```bash
# Check all project dirs referenced in memory still exist
ls ~/claude/projects/tmux-studio/ ~/claude/projects/tmux.conf/ \
   ~/claude/projects/bashrc_bus-home/ ~/claude/projects/zshrc_macbook/ 2>&1

# Check autodeploy hook targets match what memory files describe
grep -A3 'tmux_studio\|tmux\.conf\|\.bashrc\|zshrc' ~/.claude/settings.json | head -30

# Check MEMORY.md for orphaned pointers (files listed but deleted)
while IFS= read -r line; do
  f=$(echo "$line" | grep -oP '\[.*?\]\(\K[^)]+(?=\))'); 
  [ -n "$f" ] && [ ! -f ~/.claude/projects/-home-yagnesh-claude/memory/"$f" ] && echo "ORPHAN: $f"
done < ~/.claude/projects/-home-yagnesh-claude/memory/MEMORY.md
```

### Step 1d — Cross-Check All Memory

For **every** memory file, run these checks:

**R — Redundant (memory duplicates Tier 1 → delete)**
Ask: "Is the core rule/behavior of this file already in CLAUDE.md (global or project) or rules/*.md?"
- If yes → delete. The Tier 1 source fires every session; the memory file adds nothing.
- Known-good deletions for reference: JetBrains Mono (Rule 2), UI symmetry (Rule 3), canvas bounds (Rule 4),
  apply-global-rules (Rule 5), user-select (Rule 6), SVG icons (Rule 7a), INSTRUCTIONS discipline (Rule 1),
  progress feedback (Rule 9), reuse/enhance (Rule 11a), git push (Rule 17), input taxonomy (rules/ui.md),
  info-box--dim (rules/ui.md), Winnow usage (project CLAUDE.md), file list / conditional-format sync /
  UserGuide check / VERSION sync (project CLAUDE.md).

**S — Stale (documented but no longer true)**
- `project_*.md`: described path or file structure no longer exists on disk
- `feedback_*_autodeploy.md`: described hook target differs from `settings.json`
- `user_profile.md`: machine names or role info outdated
- Orphaned MEMORY.md pointer (file deleted but index line remains)
- Any memory entry referencing a renamed, removed, or superseded pattern

**D — Duplicate (same content in 2+ Tier 2 files)**
- Two memory files covering the same topic — keep the more detailed one

**M — Missing (real pattern not in Tier 1 or Tier 2)**
Check Tier 1 first. Genuine missing items are project-specific behaviors undocumented anywhere.

---

## Phase 2 — TopoAssist Technical Verification

Run this phase whenever TopoAssist files have changed since the last review.

### Step 2a — Collect TopoAssist Sources

```bash
cat ~/claude/projects/topoassist/INSTRUCTIONS_topoassist.txt
cat ~/claude/projects/topoassist/CLAUDE.md

# Hook files
cat ~/.claude/hooks/topoassist-pytest-check.sh
cat ~/.claude/hooks/topoassist-gas-test-check.sh
cat ~/.claude/hooks/topoassist-userguide-check.sh
cat ~/.claude/hooks/topoassist-deploy-tracker.sh
cat ~/.claude/settings.json   # PostToolUse/PreToolUse hook list

# Code verification
grep -n "^function generate\|^function canonicalize\|^function parseVlan\|^function getPhysical\|^function compress\|^function _break\|^function _build\|^function getNetworkSettings\|^function hasKey" \
  ~/claude/projects/topoassist/Code.gs
grep -n "APP_VERSION\|generateConfig\|generateBGP\|getNetworkSettings" \
  ~/claude/projects/topoassist/Code.gs | head -20
grep -n "DUPLICATED\|last synced" \
  ~/claude/projects/topoassist/Code.gs \
  ~/claude/projects/topoassist/Sidebar-js.html
```

### Step 2b — TopoAssist-Specific Checks

**S — Stale in INSTRUCTIONS / project CLAUDE.md**
- Function name, param count, column name, or behavior that doesn't match grep output from Code.gs
- A hook expects a code pattern (function name, test registration) that no longer exists
- Any "Previous:" entry in INSTRUCTIONS that contradicts the current "Last updated"

**C — Conflict between INSTRUCTIONS and project CLAUDE.md**
- INSTRUCTIONS says X, project CLAUDE.md says Y about the same function/rule

**M — Missing TopoAssist technical invariant**
- A hook enforces something with no INSTRUCTIONS entry
- A code invariant enforced consistently but undocumented in any tier
- A CLAUDE.md bullet with no supporting detail in INSTRUCTIONS

---

## Step 3 — Present Findings

Output this report — do NOT apply any changes yet:

```
MEMORY REVIEW
=============
Phase 1 — All-Memory Sweep
  Memory files: [N] total
  Global rules (Tier 1): [N] rule files + [N] project CLAUDE.md files

  ── REDUNDANT (Tier 2 duplicates Tier 1 → delete) ─────────────
    [file]: "[topic]" → already in [CLAUDE.md Rule N / rules/X.md]

  ── STALE ──────────────────────────────────────────────────────
    [file or MEMORY.md entry]: "[what it says]" → [reason stale]

  ── DUPLICATES (2+ Tier 2 files, same content) ─────────────────
    [file A] + [file B]: [topic] → keep [A/B]

  ── MISSING ────────────────────────────────────────────────────
    [pattern] not in any tier → suggest: [Tier 1 / Tier 2 / Tier 3]

Phase 2 — TopoAssist Technical Verification
  INSTRUCTIONS last updated: [date]
  Project CLAUDE.md: [N] constraints

  ── STALE ──────────────────────────────────────────────────────
    [source] "[what it says]" → [reason stale]

  ── CONFLICTS — MUST resolve before proceeding ─────────────────
    CONFLICT 1: [topic]
      Source A ([file]): "[says X]"
      Source B ([file]): "[says Y]"
      → Which is correct?

  ── MISSING ────────────────────────────────────────────────────
    [pattern] → suggest: [add to INSTRUCTIONS / project CLAUDE.md]

──────────────────────────────────────────────────────────────────
Status: [N] redundant · [N] stale · [N] CONFLICTS (blocked) · [N] missing · [N] duplicates
```

---

## Step 4 — Resolve Conflicts

For each conflict, ask the user explicitly. Do NOT guess. Wait for answers before proceeding.

---

## Step 5 — Apply Cleanup

Apply in this order:

1. **Delete redundant memory files** — `rm` + remove MEMORY.md line. No cross-reference needed.
2. **Fix stale entries** — edit memory files / INSTRUCTIONS / CLAUDE.md in-place; remove orphaned MEMORY.md lines
3. **Apply updates** — edit INSTRUCTIONS in-place (keep "Last updated" chain); edit memory files (keep frontmatter)
4. **Add missing entries** — decide tier first; Tier 1 → CLAUDE.md or rules/*.md; Tier 2 → new memory file + MEMORY.md line; never add to both
5. **Resolve duplicates** — keep authoritative; delete the other
6. **Update INSTRUCTIONS Last updated** to today's date with review summary

---

## Step 6 — Final Report + Commit

```
CLEANUP COMPLETE
================
Deleted  : [N] redundant — [list]
Fixed    : [N] stale — [list]
Updated  : [N] — [list]
Added    : [N] — [list with tier]
Conflicts resolved: [N] — [brief summary]
Duplicates removed: [N] — [list]

All sources consistent. Tier separation clean. State: CLEAN.
```

```bash
git add ~/claude/projects/topoassist/INSTRUCTIONS_topoassist.txt \
        ~/claude/projects/topoassist/CLAUDE.md \
        ~/.claude/commands/review-memory.md \
        ~/claude/CLAUDE.md \
        ~/claude/Reference_Card.md
git commit -m "memory review — prune redundant, fix stale, fill gaps"
git push
```
