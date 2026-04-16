# settings — Critical Constraints

## What this is
Backup kit for ~/.claude/settings.json. Restores all Claude Code hooks on a new machine.

## Key invariant
`settings.json.template` must stay in sync with `~/.claude/settings.json` at all times.
After any hook change: `sed "s|/home/yagnesh|\$HOME|g" ~/.claude/settings.json > settings.json.template`
Then commit both together.

## Never commit
`~/.claude/api-key-helper.sh` — contains API key. Not tracked here by design.

## Restore
`bash ~/claude/projects/settings/setup.sh` — replaces $HOME paths and writes ~/.claude/settings.json.
