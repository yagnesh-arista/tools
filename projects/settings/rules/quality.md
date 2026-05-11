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

## SSoT — Extract at the Second Use

The second time something appears in code is the trigger to extract it. Do not wait for a third.

| What appears twice | Extract to |
|---|---|
| Magic value (color `"#f59e0b"`, threshold `15000`, string `"Non-EOS"`) | Named constant |
| Format template (label string, URL pattern, log prefix) | Pure builder function `_buildXLabel(params)` |
| Logic block (>3 lines of the same flow) | Named helper function |
| DOM mutation + format (color + label + disabled) | Wrapper that calls the pure builder |

**Pure builder pattern** (for labels/strings used in multiple contexts with different side-effects):
1. `_buildXLabel(params)` — pure, returns string, zero side-effects — callers needing string-only use this
2. `_setXState(id, params)` — calls `_buildXLabel` + applies DOM mutations (color, disabled, innerText)

Never let side-effect-free consumers (e.g. a 30s age-refresh ticker) call the DOM-mutating wrapper — they'd trigger unintended effects (flash animations, color resets). Give them the pure builder instead.

**One exception:** a single-line expression repeated 2× where the name would be longer than the expression and the intent is obvious — leave it inline.

## Refactoring
- If you see a refactor or simplification opportunity, surface it.
- Do NOT act on it unless explicitly asked.
