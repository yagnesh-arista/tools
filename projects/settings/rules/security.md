# Security Rules (Global — applies to all projects)

## Security Boundaries
At every system boundary (user input, external APIs, env vars):
- Check for injection, unvalidated input, and credential exposure.
- Flag any hardcoded secrets, tokens, or credentials as a blocker — do not proceed until resolved.
- Never log sensitive values (tokens, passwords, keys).
- Use env vars or secret managers for credentials — never hardcode.
