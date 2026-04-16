# Testing Rules (Global — applies to all projects)

## Test Standards
- All critical behavior must be tested: happy path + key failure/edge cases.
- Tests must exercise real production code paths.
- Mock only true external dependencies (network, filesystem, time) — nothing else.
- Tests must be fully independent — no shared mutable state, no ordering dependency.
- No duplicate tests.
- No testing internals (private methods, internal state).
- No snapshot tests as proxies for behavioral assertions.
