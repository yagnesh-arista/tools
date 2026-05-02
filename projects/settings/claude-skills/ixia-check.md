# Check IxNetwork Config and State

Connect to an IxNetwork chassis and report topology, BGP session status, and
advertised routes. Use this whenever the user asks to check, inspect, or debug
an IXIA configuration.

## Usage

```bash
python3 ~/claude/projects/ixia/ixia_check.py <host> [--topo PATTERN] [--verbose] 2>/dev/null
```

The user will provide the hostname each time (e.g. `ixs10108`, `ixs1114`).
Always suppress stderr with `2>/dev/null` — ixiaDut emits noisy logging.

## When to add --topo
If the user names specific topologies or devices, pass them as `--topo <substring>`.
Multiple topology patterns require multiple runs or omit the filter to show all.

## What to report
After running, summarize:
1. **Topologies found** — list all matched topology names
2. **BGP sessions** — local IP, DUT IP, session status (flag any not `up`)
3. **Network groups** — prefix pools being advertised (count, range, active=true/false)
4. **Anomalies** — anything the script flags with `***` (session down, route inactive,
   port down, name mismatch, 0.0.0.0 placeholders)
5. **Traffic items** — state and status if traffic is configured

## Diagnosis tips
- `sessionStatus != up` → BGP not established; check underlay reachability
- `active=false` on bgpIPRouteProperty → routes not being advertised
- `nhop=0.0.0.0` → IXIA uses its own interface IP as BGP next-hop; EOS forms VTEP tunnels to that IP
- `evpn=false` → EVPN not enabled on BGP peer; verify this is intentional
- Port name mismatch → topology likely cloned and not fully updated
- `0.0.0.0` in prefix list → placeholder entry, harmless but inconsistent
