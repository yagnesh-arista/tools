# Code Quality Rules (Global — applies to all projects)

## User Feedback for Actions That Take Time
Any action that takes more than ~1 second must:
- Show a status message before starting ("Running…", "Fetching…")
- Display a live elapsed-seconds timer while running
- Provide continuous phase updates as it progresses
- Confirm on completion ("Done", "✓ Complete")
Never run a long action silently.

## Code Quality
- Bug-free, well-tested, minimal surface area.
- No over-engineering: no speculative abstractions, fallbacks for impossible cases, or premature configurability.
- No under-engineering: no hacks, duplication, or deferred correctness.
- Follow SOLID where it reduces coupling. Don't apply patterns for their own sake.
- New code must integrate cleanly with existing conventions — match style, naming, and structure without being asked.
- Don't introduce new dependencies for things achievable with the existing stack.

## Reuse and Enhance — Never Duplicate
Before writing a new function, search for one that already does the same job.
- If found: extend it with an optional `opts` parameter or a new argument — don't write a parallel implementation.
- Make new parameters optional so existing callers are unchanged.
- After enhancing, replace all old call sites with the unified function. Never leave parallel implementations alive.

Example: three separate drag implementations were later unified into one `_makeDraggable(elOrId, opts)` with `opts.headerSel / opts.saveKey / opts.noReset / opts.toolbarGap`. That unification cost extra work that a search-first habit would have avoided.

## Refactoring
- If you see a refactor or simplification opportunity, surface it.
- Do NOT act on it unless explicitly asked.
