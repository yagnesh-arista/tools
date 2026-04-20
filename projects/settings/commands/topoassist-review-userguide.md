Review changes made in this session and determine if UserGuide.html needs updating.

## Version format
APP_VERSION is now `YYMMDD.N` (e.g. `260420.73`) — not the old `v4.5` style.
The h1 in UserGuide.html uses `<?= APP_VERSION ?>` (GAS template tag, injected at runtime via
`createTemplateFromFile().evaluate()`). Do NOT flag this tag as a missing or wrong version.

## UserGuide.html must be updated whenever a change affects anything user-facing:
- New UI elements, buttons, panels, or modals
- Changed button names, labels, or workflows
- New features or removed features
- Changed behavior of existing features (e.g., push flow, LLDP check, config generation)
- New Device Manager fields (roles, MLAG peer, tags, etc.)

Steps:
1. Summarize what changed in this session (from the files edited).
2. For each change, decide: does a user need to know about this to use the feature correctly?
3. If yes — open UserGuide.html, find the relevant section, and update it now as part of this response.
4. If no user-facing changes — confirm that and explain why UserGuide.html is unchanged.

Do not skip this check. UserGuide.html is the only end-user documentation.
