# EOS Device Check Skill

Use this skill when the user asks to check, query, or run commands on an EOS device.

## How to run

```bash
python3 ~/claude/projects/ixia/eos_check.py <host> [cmd1 cmd2 ...]
python3 ~/claude/projects/ixia/eos_check.py <host> --json [cmd1 cmd2 ...]
python3 ~/claude/projects/ixia/eos_check.py <host> --topo <pattern> [cmds...]
```

The user provides the EOS device hostname each session. Ask for it if not given.

## Credentials

Set via env vars before running if non-default:
```bash
EOS_USERNAME=admin EOS_PASSWORD=secret python3 ~/claude/projects/ixia/eos_check.py <host>
```
Default: username=admin, no password.

## Default commands (when no cmds given)

- `show version`
- `show ip bgp summary`
- `show vxlan vtep`
- `show vxlan vni`
- `show interfaces status`

## Common targeted queries

```bash
# BGP state
python3 ~/claude/projects/ixia/eos_check.py <host> 'show ip bgp summary' 'show bgp evpn summary'

# VXLAN/VTEP
python3 ~/claude/projects/ixia/eos_check.py <host> 'show vxlan vtep' 'show vxlan vni' 'show vxlan address-table'

# Interface detail
python3 ~/claude/projects/ixia/eos_check.py <host> 'show interfaces status' 'show ip interface brief'

# Structured output
python3 ~/claude/projects/ixia/eos_check.py <host> --json 'show vxlan vtep'
```

## Transport

1. eAPI (HTTPS POST to port 443/command-api) — tried first
2. netmiko SSH — fallback if eAPI fails or unreachable

## Diagnosis tips

- If eAPI fails with SSL error: device may not have `management api http-commands` enabled
- If both fail: check reachability (`ping <host>`) and credentials
- For piped commands (`show run | grep X`): SSH path handles these; eAPI does not support pipes
- VXLAN VTEPs not coming up: check `show vxlan vtep`, `show ip bgp <prefix>`, underlay reachability
