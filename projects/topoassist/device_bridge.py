#!/usr/bin/env python3
# topoassist v260509.27 | 2026-05-09 03:53:14
"""
TopoAssist Device Bridge
========================
Local HTTP server that bridges the TopoAssist sidebar to lab devices.
Runs on http://localhost:8765 — no SSL cert needed (localhost is exempt from
browser mixed-content policy when called from HTTPS pages).

Usage:
    python3 device_bridge.py

Keep this terminal open while using Device Bridge in the sidebar.
Ctrl+C to stop.

Transport options (set _cfg['transport'] below):
  eapi  — Arista eAPI JSON-RPC over HTTPS (default; stdlib only)
  ssh   — SSH via jump host or direct (stdlib only)
  rest  — RESTCONF over HTTPS, OpenConfig YANG (stdlib only; EOS 4.22+)
  gnmi  — gRPC/gNMI, OpenConfig YANG (requires: pip install pygnmi; EOS 4.22+)

Endpoints:
  GET  /health      → {"status":"ok","version":"<VERSION>","port":8765}
  POST /lldp        → {ipMap} → per-device LLDP neighbors
  POST /devstatus   → {ipMap} → per-device EOS version, platform, interface op-status
  POST /pushconfig  → {ipMap: {dev:{ip,config}}} → per-device push result + session diff
"""

from http.server import HTTPServer, BaseHTTPRequestHandler
import subprocess, json, threading, sys, urllib.request, ssl, base64, time, os, re, shutil
import atexit, stat as _stat, tempfile

# sshpass is not available on all platforms (e.g. macOS without Homebrew).
# Detect once at startup; fall through to SSH_ASKPASS shim, then key-based.
_SSHPASS_BIN = shutil.which("sshpass")

# SSH_ASKPASS shim — empty-password auth without sshpass.
# Creates a temp shell script that echoes nothing (= empty password) and
# registers it as SSH_ASKPASS so SSH calls it instead of prompting.
# Works on any platform with standard /bin/sh and OpenSSH 8.4+
# (pre-8.4 needs DISPLAY set, which we include as a fallback).
_ASKPASS_SCRIPT = None
_SSH_ENV        = None   # subprocess env for SSH_ASKPASS mode; None = inherit
if not _SSHPASS_BIN:
    try:
        _f = tempfile.NamedTemporaryFile(
            mode='w', suffix='.sh', delete=False, prefix='ta_askpass_')
        _f.write('#!/bin/sh\necho\n')   # echo empty line = empty password
        _f.flush(); _f.close()
        os.chmod(_f.name, _stat.S_IRWXU)
        _ASKPASS_SCRIPT = _f.name
        _SSH_ENV = {**os.environ,
                    "SSH_ASKPASS":         _ASKPASS_SCRIPT,
                    "SSH_ASKPASS_REQUIRE": "force",                # OpenSSH 8.4+
                    "DISPLAY":             os.environ.get("DISPLAY") or ":0"}  # pre-8.4 fallback
        atexit.register(os.unlink, _ASKPASS_SCRIPT)
    except Exception:
        pass   # fall back to BatchMode=yes key-based auth

def _ssh_base(force_tty=False):
    """Return the base SSH command list.
    sshpass (Linux): supplies empty password via wrapper binary.
    SSH_ASKPASS shim (macOS/no sshpass): SSH_ASKPASS env supplies empty password.
    Fallback: key-based auth via BatchMode=yes.

    force_tty=True: use -tt (force PTY) so EOS assigns a named VTY instead of
    showing 'UnknownTty' in 'show users' and syslog. Used by _ssh_stdin for
    configure-session pushes. _ssh_cmds (show | json path) always uses -T."""
    tty      = "-tt" if force_tty else "-T"
    ssh_pass = _cfg.get("ssh_pass", "")
    ssh_port = int(_cfg.get("ssh_port", 22))
    port_arg = ["-p", str(ssh_port)] if ssh_port != 22 else []
    if _SSHPASS_BIN:
        return [_SSHPASS_BIN, "-p", ssh_pass, "ssh", tty, *port_arg,
                "-o", "StrictHostKeyChecking=no",
                "-o", "PasswordAuthentication=yes",
                "-o", "PubkeyAuthentication=no",
                "-o", "LogLevel=ERROR",
                "-o", "ConnectTimeout=8"]
    if _ASKPASS_SCRIPT:
        return ["ssh", tty, *port_arg,
                "-o", "StrictHostKeyChecking=no",
                "-o", "BatchMode=no",
                "-o", "PasswordAuthentication=yes",
                "-o", "PubkeyAuthentication=no",
                "-o", "NumberOfPasswordPrompts=1",
                "-o", "LogLevel=ERROR",
                "-o", "ConnectTimeout=8"]
    return ["ssh", tty, *port_arg,
            "-o", "StrictHostKeyChecking=no",
            "-o", "BatchMode=yes",
            "-o", "LogLevel=ERROR",
            "-o", "ConnectTimeout=8"]

# Strip ANSI escape sequences from PTY output so diff parsing is not confused
# by terminal control codes EOS may emit when a pseudo-terminal is allocated.
_ANSI_RE = re.compile(r'\x1b(?:\[[0-9;]*[A-Za-z]|[^[])')

def _check_ssh_agent():
    """Check arista-ssh credentials via 'arista-ssh check-auth'.
    Only called when using key-based SSH auth (sshpass is absent).

    arista-ssh check-auth exit codes:
      0 — authenticated → ok
      non-zero — session expired or not logged in

    Returns {"ok": True} or {"ok": False, "msg": "<reason>"}.
    """
    if not shutil.which("arista-ssh"):
        return {"ok": False, "msg": "arista-ssh not found — install arista-ssh or set BRIDGE_SSH_USER / use sshpass"}
    try:
        r = subprocess.run(["arista-ssh", "check-auth"],
                           capture_output=True, text=True, timeout=5)
        if r.returncode == 0:
            return {"ok": True}
        return {"ok": False, "msg": "arista-ssh session expired — run: arista-ssh login"}
    except subprocess.TimeoutExpired:
        return {"ok": False, "msg": "arista-ssh check-auth timed out — run: arista-ssh login"}

# Dynamic SSH auth observation — updated by _ssh_cmds on exit-255 detection.
# arista-ssh-agent certificates can expire while still appearing in ssh-add -l
# (the cert is listed but EOS rejects it → SSH exits 255 before any command runs).
# Dict is mutated in-place — GIL-safe for simple key assignments, no lock needed.
_ssh_auth = {"ok": True, "msg": "", "failures": 0}
_SSH_AUTH_THRESHOLD = 3  # consecutive exit-255 without a success → flag as auth issue

def _arg(flag):
    """Return the value after flag in sys.argv, or None if flag absent or has no value."""
    try:
        i = sys.argv.index(flag)
        return sys.argv[i + 1]
    except (ValueError, IndexError):
        return None

VERBOSE = "-v" in sys.argv

VERSION           = "260509.1"
PORT              = 8765
# CLI flags (-b/-t/-p) take priority; env vars are the fallback.
_b        = _arg("-b")
JUMP_HOST = _b if _b is not None else os.environ.get("BRIDGE_JUMP_HOST", "bus-home")
TIMEOUT   = int(_arg("-t") or os.environ.get("BRIDGE_TIMEOUT", "15"))
# PUSH_TIMEOUT: separate ceiling for large configure-session pushes.
# TIMEOUT (-t) is for read queries (show, lldp, etc.) and should stay small.
# Large configs (10k+ commands) can exceed TIMEOUT — set this independently.
# Default: max(TIMEOUT*4, 300) so it auto-scales with -t but never below 5 min.
PUSH_TIMEOUT = int(_arg("-p") or os.environ.get("BRIDGE_PUSH_TIMEOUT",
                                                 str(max(TIMEOUT * 4, 300))))
PUSH_RETRIES      = 2   # retries on connection refused / SSH failure (device warm-restart)
PUSH_RETRY_DELAY  = 4   # seconds between retries
CLEANUP_BATCH_SIZE = 300  # max orphan-cleanup commands per configure session (~90s on EOS; 1000 timed out at 300s on GW-SVI-heavy devices)

# _cfg: active transport settings — initialized from CLI/env, overridable at runtime
# via POST /settings so the sidebar can switch transport without restarting the bridge.
_cfg = {
    "transport":  _arg("-m")  or os.environ.get("BRIDGE_METHOD",    "eapi"),
    "ssh_user":   _arg("-u")  or os.environ.get("BRIDGE_SSH_USER",  "admin"),
    "ssh_pass":                  os.environ.get("BRIDGE_SSH_PASS",  ""),
    "ssh_port":   int(            os.environ.get("BRIDGE_SSH_PORT",  "22")),
    "jump_host":  JUMP_HOST,
    "jump_user":  os.environ.get("BRIDGE_JUMP_USER", ""),
    "eapi_user":  _arg("-eu") or os.environ.get("BRIDGE_EAPI_USER", "admin"),
    "eapi_pass":  _arg("-ep") or os.environ.get("BRIDGE_EAPI_PASS", ""),
    "eapi_port":  int(_arg("--eapi-port") or os.environ.get("BRIDGE_EAPI_PORT", "443")),
    "eapi_proto": "http" if "--eapi-http" in sys.argv else "https",
}

def _jump_args():
    """Return ['-J', 'user@host'] if jump host configured in _cfg, else []."""
    host = _cfg.get('jump_host', '')
    if not host:
        return []
    user = _cfg.get('jump_user', '')
    via  = f'{user}@{host}' if user else host
    return ['-J', via]

# ── RESTCONF config (_cfg['transport'] = "rest") ─────────────────────────────────────────
# OpenConfig YANG over HTTPS; EOS 4.22+; enable with: management api restconf
REST_USER = "admin"
REST_PASS = ""
REST_PORT = 443

# ── gNMI config (_cfg['transport'] = "gnmi") ─────────────────────────────────────────────
# gRPC/gNMI; enable with: management api gnmi; requires: pip install pygnmi
GNMI_USER = "admin"
GNMI_PASS = ""
GNMI_PORT = 6030

# ── Concurrency cap for bulk SSH operations ────────────────────────────────────
MAX_WORKERS = 10   # max concurrent SSH sessions for /lldp, /devstatus, /pushconfig

# ── Optional gNMI import ───────────────────────────────────────────────────────
try:
    from pygnmi.client import gNMIclient
    HAS_GNMI = True
except ImportError:
    HAS_GNMI = False

def _print_transport_status():
    """Print current transport settings — called at startup and on /settings change."""
    t = _cfg['transport']
    print(f"  Transport : {t.upper()}", flush=True)
    if t == "ssh":
        _auth_mode = ("empty-password (sshpass)"    if _SSHPASS_BIN    else
                      "empty-password (SSH_ASKPASS)" if _ASKPASS_SCRIPT else
                      "key-based (arista-ssh)")
        _jh = _cfg.get('jump_host', '')
        _ju = _cfg.get('jump_user', '')
        _jvia = (f'{_ju}@{_jh}' if _ju else _jh) if _jh else ''
        print(f"  SSH user  : {_cfg['ssh_user']}  auth: {_auth_mode}", flush=True)
        if _jvia:
            print(f"  Jump host : {_jvia}", flush=True)
    elif t == "eapi":
        print(f"  eAPI user : {_cfg['eapi_user']}  port: {_cfg['eapi_port']}  proto: {_cfg['eapi_proto']}", flush=True)
    elif t == "rest":
        print(f"  REST user : {REST_USER}  port: {REST_PORT}", flush=True)
    elif t == "gnmi":
        _gnmi_note = "" if HAS_GNMI else " (pygnmi not installed)"
        print(f"  gNMI user : {GNMI_USER}  port: {GNMI_PORT}{_gnmi_note}", flush=True)


# ── Shared SSL context (eAPI + REST — self-signed certs OK) ───────────────────
_SSL_CTX = ssl.create_default_context()
_SSL_CTX.check_hostname = False
_SSL_CTX.verify_mode    = ssl.CERT_NONE


# ── OpenConfig → EOS format normalizers (used by rest + gnmi) ─────────────────

def _oc_lldp_to_eos(raw):
    """Convert openconfig-lldp GET response to EOS lldpNeighbors dict."""
    neighbors = {}
    root = raw.get("openconfig-lldp:lldp", raw)
    for iface in root.get("interfaces", {}).get("interface", []):
        name = iface.get("name", "")
        nbrs = iface.get("neighbors", {}).get("neighbor", [])
        if not nbrs:
            continue
        state = nbrs[0].get("state", {})
        neighbors[name] = {"bridgeNeighborInfo": [{
            "systemName": state.get("system-name", ""),
            "neighborInterfaceInfo": {
                "interfaceId_v2": state.get("port-id", ""),
            },
        }]}
    return neighbors


def _normalize_lldp_neighbors(raw_lldp_neighbors):
    """Rename EOS native key 'lldpNeighborInfo' → 'bridgeNeighborInfo'.

    EOS JSON (show lldp neighbors detail | json) uses 'lldpNeighborInfo' per
    interface.  The client _compareBridgeData reads 'bridgeNeighborInfo' — the
    single canonical key used across all transports (ssh/eapi/rest/gnmi).
    Interfaces that already lack 'lldpNeighborInfo' are passed through as-is.
    """
    return {
        iface: {"bridgeNeighborInfo": info["lldpNeighborInfo"]}
        if "lldpNeighborInfo" in info else info
        for iface, info in raw_lldp_neighbors.items()
    }


def _oc_version(raw):
    """Extract software version string from openconfig-platform GET response."""
    for comp in raw.get("openconfig-platform:components", raw).get("component", []):
        ver = comp.get("state", {}).get("software-version", "")
        if ver:
            return ver.split(" (")[0].strip()
    return ""


def _oc_platform(raw):
    """Extract platform/model name from openconfig-platform GET response."""
    for comp in raw.get("openconfig-platform:components", raw).get("component", []):
        t = comp.get("state", {}).get("type", "")
        if "CHASSIS" in t:
            return comp["state"].get("description", "").lstrip("DCS-")
    return ""


def _oc_iface_status(raw):
    """Convert openconfig-interfaces GET response to EOS interfaceStatuses dict."""
    oc_to_eos = {"UP": "connected", "DOWN": "notconnect",
                 "LOWER_LAYER_DOWN": "notconnect", "DORMANT": "notconnect"}
    result = {}
    for iface in raw.get("openconfig-interfaces:interfaces", raw).get("interface", []):
        name  = iface.get("name", "")
        oper  = iface.get("state", {}).get("oper-status", "")
        result[name] = {"linkStatus": oc_to_eos.get(oper, "notconnect")}
    return result


def _gnmi_val(response):
    """Extract the value dict from a pygnmi get() response."""
    try:
        return response["notification"][0]["update"][0]["val"]
    except (KeyError, IndexError, TypeError):
        return {}


def _parse_internal_vlans(ivlans):
    """Parse 'show vlan internal usage' JSON response into a sorted int list.

    EOS returns: {"internalVlans": {"1025": "Ethernet1", "1026": "Ethernet2", ...}}
    Returns [] when the response is empty, None (command failed), or the key is absent.
    """
    if not ivlans:
        return []
    return sorted(int(vid) for vid in ivlans.get("internalVlans", {}).keys())


def _parse_interface_errors(raw):
    """Return {IfaceName: {fcs, sym, align}} for interfaces with any non-zero L1 counter.

    EOS returns: {"interfaceErrorCounters": {"Ethernet1": {"fcsErrors": 3, ...}, ...}}
    Only interfaces with at least one non-zero counter are included (compact response).
    """
    out = {}
    for iface, c in (raw or {}).get("interfaceErrorCounters", {}).items():
        fcs   = c.get("fcsErrors",       0)
        sym   = c.get("symbolErrors",    0)
        align = c.get("alignmentErrors", 0)
        if fcs or sym or align:
            out[iface] = {"fcs": fcs, "sym": sym, "align": align}
    return out


def _build_devstatus_ssh(ver, ifs, ivlans, errs=None):
    """Build devstatus response dict from raw _run_cmds results (any may be None on failure).

    Each argument corresponds to one SSH/eAPI command result:
      ver    — 'show version'                    (None if command failed)
      ifs    — 'show interfaces status'          (None if command failed)
      ivlans — 'show vlan internal usage'        (None if command failed)
      errs   — 'show interfaces counters errors' (None if command failed)

    A failed command contributes empty data but never causes ok:False — the
    other commands' data is still returned intact.
    """
    ver = ver or {}
    ifs = ifs or {}
    raw_ver = ver.get("version", "")
    if raw_ver.startswith("Software image version: "):
        raw_ver = raw_ver[len("Software image version: "):]
    raw_ver = raw_ver.split(" (")[0].strip()
    return {
        "ok":             True,
        "hostname":       ver.get("hostname", ""),
        "version":        raw_ver,
        "platform":       ver.get("modelName", "").lstrip("DCS-"),
        "bridgeMac":      ver.get("systemMacAddress", ""),
        "interfaces":     {
            k: {"linkStatus": v.get("linkStatus", "")}
            for k, v in ifs.get("interfaceStatuses", {}).items()
        },
        "internalVlans":  _parse_internal_vlans(ivlans),
        "interfaceErrors": _parse_interface_errors(errs),
    }


def _extract_session_diff(output):
    """Extract 'show session-config diffs' text from raw SSH stdout.

    EOS unified-diff format (no @@ hunk headers):
      --- system:/running-config
      +++ session:/topoassist-session-config
      interface Ethernet1/1
      +   description foo

    Capture starts at the first diff header line ('--- ' or '+++ ').
    Capture stops when EOS echoes the next command (always contains '#commit'
    or '#abort' because the prompt includes the mode, e.g.
    'Arista(config-s-topoas)#commit').

    Robustness notes:
      - Accepts either '--- ' or '+++ ' as the start trigger in case EOS
        emits '+++ ' before '--- ' on some versions.
      - Ignores any trailing whitespace on each line.
      - Returns '' for an empty diff (no changes staged).
      - For open_only pushes we don't send a final 'exit' command, so EOS
        outputs a bare prompt ("Hostname#") at EOF — detected by s.endswith('#')."""
    lines   = output.split('\n')
    diff    = []
    started = False
    for line in lines:
        s = line.rstrip()
        if not started:
            # Accept both orderings of the unified-diff header
            if s.startswith('--- ') or s.startswith('+++ '):
                started = True
                diff.append(s)
        else:
            # EOS echoes the final command as "Prompt#commit", "Prompt#abort",
            # or "Prompt#exit" — '#' is part of the prompt, safe vs diff content.
            # For open_only (no final cmd) a bare EOS prompt ending with '#'
            # signals end of diff output.
            if '#commit' in s or '#abort' in s or '#exit' in s or s.endswith('#'):
                break
            diff.append(s)
    return '\n'.join(diff).strip()


# EOS block-entering commands — entering these sub-modes changes the PTY prompt context.
# Used to inject context lines into eos_errors so '!' separators can be inserted between blocks.
_BLOCK_CMD_RE = re.compile(
    r'^(?:interface|router\s+(?:bgp|ospf|isis)|vlan\s+\d|address-family)\s',
    re.IGNORECASE,
)


def _extract_eos_errors(text):
    """Collect EOS % error/warning lines from session output (SSH or joined eAPI text).

    Two stop conditions bound the scan to the config-command phase only:
      1. Diff header ('--- ' or '+++ ') — reached the show session-config diffs output.
      2. Bare exec-mode prompt ('HOSTNAME#') — 'end' was processed and the session
         sub-mode has been exited.  In PTY mode (_ssh_stdin force_tty=True) EOS
         emits a standalone prompt line after 'end' before echoing the next command.
         Condition: line ends with '#' and contains no '(config' (which would indicate
         a configure-session context rather than exec mode).

    In PTY (SSH) mode EOS echoes each command as 'HOSTNAME(config-s-...)#<command>'.
    When a % error follows, the preceding echo is captured as command context so the
    caller can show 'channel-group 4003 mode active → % Invalid input' instead of just
    '% Invalid input'.  Context is only extracted from PTY prompt echoes (lines
    containing both '#' and '(config') — plain eAPI result lines are not treated as
    command echoes, so eAPI mode falls back to bare % lines with no context.

    When a block command (interface, router bgp, vlan, address-family) succeeds but
    sub-commands inside it fail, the block command itself is injected as a context line
    before the first sub-command error.  This lets the caller insert '!' separators
    between distinct config blocks even when the block-entry command produced no error.

    Returns (errors, warnings) — both lists of strings.
    errors: '% error' lines (command rejected), with block context and separators.
    warnings: '! text' lines (command accepted with informational note, e.g. transceiver absent).
    Both lists are empty if no matching lines are found."""
    errors = []
    warnings = []
    prev_cmd = ''
    current_block = ''        # most recent block-entering command seen
    last_block_in_errors = '' # last block whose context line was injected into errors
    for line in text.split('\n'):
        s = line.strip()
        if s.startswith('--- ') or s.startswith('+++ '):
            break   # reached diff section
        if s.endswith('#') and '(config' not in s:
            break   # bare exec-mode prompt — 'end' was processed, config phase over
        if s.startswith('%'):
            # If we're inside a block that succeeded (e.g. 'interface Eth13' entered OK
            # but 'speed 25g' failed), inject the block command as a context line so
            # the caller can group errors by block with '!' separators.
            if (current_block and current_block != last_block_in_errors
                    and not _BLOCK_CMD_RE.match(prev_cmd)):
                errors.append(current_block)
                last_block_in_errors = current_block
            errors.append(f'{prev_cmd} \u2192 {s}' if prev_cmd else s)
            # If the block command itself failed, mark it represented so sub-commands
            # in the same block don't re-inject the context line.
            if _BLOCK_CMD_RE.match(prev_cmd):
                last_block_in_errors = current_block
        elif s.startswith('!') and len(s) > 1 and not ('#' in s and '(config' in s):
            # EOS informational note — command was accepted, just a caveat.
            # Exclude PTY prompt-echo lines (!HOSTNAME(config-s-...)#cmd) — those are
            # echoed commands, not warnings, and were being misclassified.
            warnings.append(f'{prev_cmd} \u2192 {s}' if prev_cmd else s)
        elif '#' in s and '(config' in s:
            # PTY prompt echo: 'HOSTNAME(config-s-...)#the command' → 'the command'
            cmd = s.split('#', 1)[-1].strip()
            if cmd:
                prev_cmd = cmd
                if _BLOCK_CMD_RE.match(cmd):
                    current_block = cmd
    return errors, warnings


_EAPI_FAILED_CMD_RE = re.compile(r"CLI command \d+ of \d+ '([^']+)' failed", re.IGNORECASE)

def _annotate_eapi_errors(errors, lines):
    """Inject block-context lines into eAPI error list.

    eAPI errors report 'CLI command N of M <cmd> failed: reason' but carry no
    surrounding block context (no PTY prompt echoes). This function parses the
    failed command name from each error, locates it in lines[], scans backwards
    for the nearest block-entering command (interface / router bgp / etc.), and
    injects that block command as a context line immediately before the error so
    the UI can show 'interface Ethernet5 → ip address ... failed' instead of just
    the raw error with no interface name.
    """
    result = []
    last_injected_block = ''
    for err in errors:
        m = _EAPI_FAILED_CMD_RE.search(err)
        if m:
            failed_cmd = m.group(1).strip()
            block_cmd  = ''
            for i, line in enumerate(lines):
                if line.strip() == failed_cmd:
                    for j in range(i - 1, -1, -1):
                        if _BLOCK_CMD_RE.match(lines[j].strip()):
                            block_cmd = lines[j].strip()
                            break
                    break  # first occurrence of the failed command
            if block_cmd and block_cmd != last_injected_block:
                result.append(block_cmd)
                last_injected_block = block_cmd
        result.append(err)
    return result


# ── Section-level cleaners for idempotent push ────────────────────────────────

# Interfaces excluded from __TA orphan cleanup — system/VTEP/MLAG-control, not per-link
_TA_ORPHAN_SKIP_RE = re.compile(
    r'^(?:Loopback|Management|Vxlan)\d|^Vlan409[34]$', re.IGNORECASE
)


# ── SSH stderr cleaner ────────────────────────────────────────────────────────
# Strip known-noisy SSH informational lines from stderr before surfacing errors.
# With -T + LogLevel=ERROR these shouldn't appear; this is a safety net so that
# if they do appear (e.g. older SSH, jump-host quirks), the real error is first.
_SSH_NOISE_RE = re.compile(
    r'^\s*(pseudo-terminal will not be allocated'
    r'|warning: permanently added'
    r'|debug[123]:'
    r')',
    re.IGNORECASE)

def _clean_ssh_err(err_text):
    """Return err_text with SSH noise lines removed. Strips leading/trailing whitespace."""
    lines = [l for l in err_text.splitlines() if not _SSH_NOISE_RE.match(l)]
    cleaned = '\n'.join(lines).strip()
    return cleaned or err_text.strip()   # fall back to raw if everything was noise


def _norm_iface(name):
    """Normalize EOS interface names to abbreviated lowercase form for comparison.

    EOS JSON returns long form (Ethernet25/1, Port-Channel10) while the
    topology stores abbreviated form (Et25/1, Po10).  Sub-interfaces
    (Ethernet25/1.100) are handled by the same prefix substitution.
    """
    n = re.sub(r'^Ethernet', 'Et', name, flags=re.IGNORECASE)
    n = re.sub(r'^Port-Channel', 'Po', n, flags=re.IGNORECASE)
    return n.lower()


def _orphans_to_cmds(orphans):
    """Convert _detect_orphans() result to flat EOS CLI cleanup commands.

    Interface orphans (physical/PO) → default interface X
    Interface orphans (sub-int/SVI) → no interface X
    BGP orphans → router bgp ASN / no neighbor X / !
    VLAN orphans → no vlan X
    VRF orphans → no vrf instance X
    OSPF orphans → router ospf_kw N [vrf V] / default passive-interface X / ! (grouped by context)
    """
    cmds = []
    for o in orphans.get('interfaces', []):
        name = o['name']
        if '.' in name or re.match(r'^vlan\d+$', name, re.IGNORECASE):
            cmds.append(f'no interface {name}')
        else:
            cmds.append(f'default interface {name}')
    bgp_by_asn = {}
    for o in orphans.get('bgp', []):
        asn = o.get('asn')
        if asn:
            bgp_by_asn.setdefault(asn, []).append(o['neighbor'])
    for asn, neighbors in bgp_by_asn.items():
        cmds.append(f'router bgp {asn}')
        for n in neighbors:
            cmds.append(f'   no neighbor {n}')
        cmds.append('!')
    for o in orphans.get('vlans', []):
        cmds.append(f'no vlan {o["vid"]}')
    for o in orphans.get('vrfs', []):
        cmds.append(f'no vrf instance {o["name"]}')
    ospf_by_ctx = {}
    for o in orphans.get('ospf', []):
        ospf_by_ctx.setdefault(o['context'], []).append(o['iface'])
    for ctx, ifaces in ospf_by_ctx.items():
        cmds.append(ctx)
        for iface in ifaces:
            cmds.append(f'   default passive-interface {iface}')
        cmds.append('!')
    return cmds


def _batch_orphan_cmds(cmds, batch_size):
    """Split orphan command list into batches that never cut mid-block.

    EOS cleanup blocks (BGP, OSPF) are multi-line: 'router bgp N' / sub-cmds / '!'.
    Slicing by raw line count can land a batch boundary inside a block, sending EOS
    an incomplete context — the remaining sub-commands then arrive in the next batch
    with no parent context and fail.

    Strategy: segment the list first (one segment = one standalone cmd OR one complete
    block ending with '!'), then fill batches by segment until batch_size is reached.
    A segment boundary only occurs after a standalone line or after '!'.
    """
    # Build segments: each segment is a list of lines forming one logical command/block
    segments = []
    current = []
    for line in cmds:
        if line.strip() == '!':
            current.append(line)
            segments.append(current)
            current = []
        elif (not line.startswith(' ')           # non-indented → standalone or block opener
              and current
              and not current[-1].startswith(' ')  # previous line also non-indented
              and current[-1].strip() != '!'):      # previous line was not a block-end
            # Two consecutive non-indented non-'!' lines → first is a standalone command
            segments.append(current)
            current = [line]
        else:
            current.append(line)
    if current:
        segments.append(current)

    # Pack segments into batches of up to batch_size lines
    batches, batch = [], []
    for seg in segments:
        if batch and len(batch) + len(seg) > batch_size:
            batches.append(batch)
            batch = list(seg)
        else:
            batch.extend(seg)
    if batch:
        batches.append(batch)
    return batches


# ── Bridge HTTP handler ────────────────────────────────────────────────────────

class BridgeHandler(BaseHTTPRequestHandler):

    # ── CORS ──────────────────────────────────────────────────────────────────
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin",  "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            health = {"status": "ok", "version": VERSION,
                      "port": PORT, "method": _cfg['transport'], "timeout": TIMEOUT}
            # Only check arista-ssh credentials for pure key-based auth.
            # Password-based modes (sshpass or SSH_ASKPASS shim) don't use
            # arista-ssh certs, so the check is irrelevant.
            if _cfg['transport'] == "ssh":
                if not _SSHPASS_BIN and not _ASKPASS_SCRIPT:
                    # Key-based auth: proactively check arista-ssh cert validity.
                    auth = _check_ssh_agent()
                    if auth["ok"]:
                        _ssh_auth["failures"] = 0
                        _ssh_auth["ok"]  = True
                        _ssh_auth["msg"] = ""
                    else:
                        _ssh_auth["ok"]  = auth["ok"]
                        _ssh_auth["msg"] = auth["msg"]
                # Always report current auth state so the sidebar can show/clear
                # the auth warning banner regardless of the auth method in use.
                health["auth"] = dict(_ssh_auth)
            self._json(200, health)
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self):
        if self.path not in ("/lldp", "/devstatus", "/pushconfig",
                              "/pushconfig/finalize", "/reconcile", "/settings"):
            self._json(404, {"error": "not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            body   = json.loads(self.rfile.read(length))
        except Exception:
            self._json(400, {"error": "invalid JSON body"})
            return
        if self.path == "/settings":
            allowed = {"transport", "ssh_user", "ssh_pass", "ssh_port",
                       "jump_host", "jump_user",
                       "eapi_user", "eapi_pass", "eapi_port", "eapi_proto"}
            old_transport = _cfg.get("transport")
            changed = []
            for k, v in body.items():
                if k in allowed:
                    new_v = int(v) if k in ("ssh_port", "eapi_port") else v
                    if _cfg.get(k) != new_v:
                        changed.append((k, _cfg.get(k), new_v))
                    _cfg[k] = new_v
            if changed:
                new_transport = _cfg.get("transport")
                for k, old_v, new_v in changed:
                    if k not in ("ssh_pass", "eapi_pass"):
                        print(f"  {k}: {old_v!r} → {new_v!r}", flush=True)
                if old_transport != new_transport:
                    _print_transport_status()
            self._json(200, {"ok": True, "cfg": {k: _cfg[k] for k in allowed}})
            return
        ip_map           = body.get("ipMap", {})
        dry_run          = bool(body.get("dry_run", False))
        open_session     = bool(body.get("open_session", False))
        all_ifaces       = bool(body.get("all_ifaces", False))
        all_device_names = body.get("allDeviceNames")  # for BGP __TA neighbor cleanup
        # Auth pre-check: for key-based SSH, fail fast before spawning device threads.
        # Saves 30–120s of per-device SSH timeouts when arista-ssh cert has expired.
        if _cfg['transport'] == "ssh" and not _SSHPASS_BIN and not _ASKPASS_SCRIPT:
            if not _ssh_auth["ok"]:
                self._json(200, {"auth_expired": True, "message": _ssh_auth["msg"]})
                return
            auth = _check_ssh_agent()
            if not auth["ok"]:
                _ssh_auth["ok"]       = False
                _ssh_auth["msg"]      = auth["msg"]
                _ssh_auth["failures"] = _SSH_AUTH_THRESHOLD
                self._json(200, {"auth_expired": True, "message": auth["msg"]})
                return
        if self.path == "/lldp":
            self._json(200, self._run_parallel(ip_map, self._check_lldp))
        elif self.path == "/devstatus":
            self._json(200, self._run_parallel(ip_map, self._check_devstatus))
        elif self.path == "/reconcile":
            # ipMap values are {ip, ports:[...], config_text} dicts
            all_device_names = body.get("allDeviceNames")
            results = {dev: None for dev in ip_map}
            lock    = threading.Lock()
            sem     = threading.Semaphore(MAX_WORKERS)
            def run_cleanup(dev, entry):
                ip             = (entry.get("ip") or "").strip()
                expected_ports = entry.get("ports", [])
                config_text    = entry.get("config_text") or None
                if not ip:
                    with lock: results[dev] = {"ok": False, "error": "No IP configured"}
                    return
                with sem:
                    try:
                        res = self._detect_orphans(ip, config_text=config_text,
                                                   all_device_names=all_device_names,
                                                   expected_ports=expected_ports)
                        with lock: results[dev] = res
                    except subprocess.TimeoutExpired:
                        with lock: results[dev] = {"ok": False, "error": f"Timeout — {ip} unreachable?"}
                    except Exception as e:
                        with lock: results[dev] = {"ok": False, "error": str(e)[:120]}
            threads = [threading.Thread(target=run_cleanup, args=(d, v), daemon=True)
                       for d, v in ip_map.items()]
            for t in threads: t.start()
            for t in threads: t.join(timeout=TIMEOUT + 5)
            with lock:
                for dev in results:
                    if results[dev] is None:
                        results[dev] = {"ok": False, "error": "Cleanup timed out"}
            self._json(200, results)
        elif self.path == "/pushconfig/finalize":
            # Phase 2 of two-phase push: commit or abort an already-open named session.
            # ipMap values are {ip, session_name} — no config re-push needed.
            action = body.get("action", "abort")
            results = {}
            for dev, entry in ip_map.items():
                ip           = (entry.get("ip") or "").strip()
                session_name = (entry.get("session_name") or "").strip()
                if not ip or not session_name:
                    results[dev] = {"ok": False, "error": "Missing ip or session_name"}
                    continue
                try:
                    results[dev] = self._finalize_session(ip, session_name, action)
                except subprocess.TimeoutExpired:
                    results[dev] = {"ok": False, "error": f"Timeout — {ip} unreachable?"}
                except Exception as e:
                    results[dev] = {"ok": False, "error": str(e)[:200]}
            self._json(200, results)
        else:
            # /pushconfig — ipMap values are {ip, config} dicts, not plain IPs
            # Pre-initialize every device to None so the key always exists in the
            # response even if the thread doesn't finish before join() returns.
            results  = {dev: None for dev in ip_map}
            _n_lines = {}  # dev → config line count, for timeout diagnostics
            lock    = threading.Lock()
            sem     = threading.Semaphore(MAX_WORKERS)
            def run_push(dev, entry):
                ip     = (entry.get("ip") or "").strip()
                config = entry.get("config", "")
                _n_lines[dev] = len(config.splitlines())
                if not ip:
                    with lock: results[dev] = {"ok": False, "error": "No IP configured"}
                    return
                with sem:
                    for attempt in range(PUSH_RETRIES + 1):
                        try:
                            res = self._push_config(ip, config, dry_run=dry_run,
                                                    open_only=open_session,
                                                    all_ifaces=all_ifaces,
                                                    all_device_names=all_device_names)
                            with lock: results[dev] = res
                            break
                        except subprocess.TimeoutExpired:
                            _nl = _n_lines.get(dev, '?')
                            if attempt < PUSH_RETRIES:
                                if VERBOSE: print(f"  [push] {dev} ({ip}): timeout ({_nl} lines, {PUSH_TIMEOUT}s), retrying (attempt {attempt+1})")
                                time.sleep(PUSH_RETRY_DELAY); continue
                            if VERBOSE: print(f"  [push] {dev} ({ip}): timeout after {PUSH_RETRIES+1} attempts ({_nl} lines)")
                            with lock: results[dev] = {"ok": False, "error": f"Push timed out — {_nl} config lines, {PUSH_TIMEOUT}s limit exceeded — verify config was applied manually"}
                            break
                        except RuntimeError as e:
                            if ("connection refused" in str(e).lower()
                                    or "ssh failed" in str(e).lower()) and attempt < PUSH_RETRIES:
                                if VERBOSE: print(f"  [push] {dev} ({ip}): {e}, retrying (attempt {attempt+1})")
                                time.sleep(PUSH_RETRY_DELAY); continue
                            if VERBOSE: print(f"  [push] {dev} ({ip}): error — {e}")
                            with lock: results[dev] = {"ok": False, "error": str(e)}
                            break
                        except NotImplementedError as e:
                            if VERBOSE: print(f"  [push] {dev} ({ip}): not implemented — {e}")
                            with lock: results[dev] = {"ok": False, "error": str(e)}
                            break
                        except Exception as e:
                            if VERBOSE: print(f"  [push] {dev} ({ip}): unexpected error — {e}")
                            with lock: results[dev] = {"ok": False, "error": str(e)[:120]}
                            break
            threads = [threading.Thread(target=run_push, args=(d, v), daemon=True)
                       for d, v in ip_map.items()]
            for t in threads: t.start()
            # Budget: each _push_config attempt blocks for stale-session cleanup
            # (_abort_stale_sessions thread join — up to TIMEOUT) THEN
            # _ssh_stdin communicate (up to TIMEOUT), so per-attempt cost is 2*TIMEOUT.
            # Using full TIMEOUT for cleanup: sluggish devices (e.g. after large push)
            # need more than 5s to SSH in and abort stale sessions.
            _abort_overhead = TIMEOUT
            join_budget = (PUSH_TIMEOUT + _abort_overhead) * (PUSH_RETRIES + 1) + PUSH_RETRY_DELAY * PUSH_RETRIES + 5
            for t in threads: t.join(timeout=join_budget)
            # Any thread that didn't finish gets a descriptive timeout error instead
            # of null, so the JS never falls through to the generic 'something went wrong'.
            with lock:
                for dev in results:
                    if results[dev] is None:
                        _nl = _n_lines.get(dev, '?')
                        results[dev] = {
                            "ok": False,
                            "error": f"Push timed out — {_nl} config lines, {PUSH_TIMEOUT}s limit exceeded — verify config was applied manually",
                        }
            self._json(200, results)

    # ── Transport: SSH ────────────────────────────────────────────────────────
    def _ssh_cmds(self, ip, *cmds):
        """Run EOS show commands via SSH — parallel connections when >1 command.
        Returns list of parsed JSON dicts, one per command."""
        results = [None] * len(cmds)
        errors  = [None] * len(cmds)  # per-slot exception for re-raise

        def fetch(i, cmd):
            eos_cmd  = f'{cmd} | json'
            base = _ssh_base()
            exec_cmd = [*base, *_jump_args(), f"{_cfg['ssh_user']}@{ip}", eos_cmd]
            if VERBOSE: print(f"  [show] {ip}: {cmd}", flush=True)
            stderr_mode = subprocess.PIPE if VERBOSE else subprocess.DEVNULL
            try:
                out = subprocess.check_output(exec_cmd, timeout=TIMEOUT,
                                              text=True, stderr=stderr_mode,
                                              env=_SSH_ENV)
                results[i] = json.loads(out)
                _ssh_auth["failures"] = 0       # successful SSH → clear auth-failure state
                _ssh_auth["ok"]  = True
                _ssh_auth["msg"] = ""
                if VERBOSE: print(f"  [show] {ip}: {cmd} → ok", flush=True)
            except subprocess.TimeoutExpired as e:
                if VERBOSE: print(f"  [show] {ip}: {cmd} → timeout", flush=True)
                errors[i] = e
            except subprocess.CalledProcessError as e:
                if VERBOSE:
                    err = (e.stderr or "").strip().splitlines()[-1] if e.stderr else ""
                    suffix = f"  [{err}]" if err else ""
                    print(f"  [show] {ip}: {cmd} → failed (exit {e.returncode}){suffix}", flush=True)
                # exit 255 = SSH itself failed (auth/connection), not an EOS command error.
                # arista-ssh-agent certs can expire while still appearing in ssh-add -l;
                # the cert is listed but EOS rejects it → SSH exits 255 before any command.
                if e.returncode == 255:
                    _ssh_auth["failures"] += 1
                    if _ssh_auth["failures"] >= _SSH_AUTH_THRESHOLD:
                        _ssh_auth["ok"]  = False
                        _ssh_auth["msg"] = "bus-home session expired — run: arista-ssh login"
                errors[i] = e
            except Exception as e:
                if VERBOSE: print(f"  [show] {ip}: {cmd} → error: {e}", flush=True)
                errors[i] = e

        # Run commands sequentially — one SSH connection at a time per device.
        # Opening multiple simultaneous connections to the same device hits
        # EOS ip ssh maximum-sessions and causes "Connection closed by UNKNOWN"
        # (exit 255). Device-level parallelism from _run_parallel provides the
        # speed; per-command parallelism within a device is not needed.
        for i, cmd in enumerate(cmds):
            fetch(i, cmd)
        # Return partial results alongside a cmd→error dict instead of raising.
        # Callers decide whether partial failures are acceptable (devstatus keeps
        # partial data; lldp re-raises because partial LLDP is unusable).
        cmd_errors = {cmds[i]: errors[i] for i in range(len(cmds)) if errors[i] is not None}
        return results, cmd_errors

    # ── Transport: eAPI ───────────────────────────────────────────────────────
    def _eapi_cmds(self, ip, *cmds):
        """Run EOS show commands via eAPI JSON-RPC. Returns list of parsed JSON dicts.
        All commands are sent in a single HTTPS request (more efficient than SSH)."""
        url     = f"{_cfg['eapi_proto']}://{ip}:{_cfg['eapi_port']}/command-api"
        payload = json.dumps({
            "jsonrpc": "2.0", "method": "runCmds",
            "params":  {"version": 1, "cmds": list(cmds), "format": "json"},
            "id":      1,
        }).encode()
        creds = base64.b64encode(f"{_cfg['eapi_user']}:{_cfg['eapi_pass']}".encode()).decode()
        req   = urllib.request.Request(url, data=payload, headers={
            "Content-Type":  "application/json",
            "Authorization": f"Basic {creds}",
        })
        with urllib.request.urlopen(req, timeout=TIMEOUT, context=_SSL_CTX) as r:
            resp = json.loads(r.read())
        if "error" in resp:
            raise RuntimeError(resp["error"].get("message", "eAPI error"))
        return resp["result"]  # list, one entry per command

    # ── Transport: RESTCONF ───────────────────────────────────────────────────
    def _rest_get(self, ip, path):
        """GET a RESTCONF path. Returns parsed dict (OpenConfig YANG JSON)."""
        url   = f"https://{ip}:{REST_PORT}/restconf/data/{path}"
        creds = base64.b64encode(f"{REST_USER}:{REST_PASS}".encode()).decode()
        req   = urllib.request.Request(url, headers={
            "Accept":        "application/yang-data+json",
            "Authorization": f"Basic {creds}",
        })
        with urllib.request.urlopen(req, timeout=TIMEOUT, context=_SSL_CTX) as r:
            return json.loads(r.read())

    # ── Transport: eAPI (text format — for config push) ───────────────────────
    def _eapi_push(self, ip, *cmds):
        """Run EOS commands via eAPI with format=text (for configure session).

        stopOnError=False causes EOS to continue executing remaining commands
        after a failure, embedding % error text in each command's output instead
        of aborting and returning a single top-level error.  _extract_eos_errors
        then finds ALL % lines across the full result set in one call.

        Returns list of raw text output strings, one per command.
        """
        url     = f"{_cfg['eapi_proto']}://{ip}:{_cfg['eapi_port']}/command-api"
        payload = json.dumps({
            "jsonrpc": "2.0", "method": "runCmds",
            "params":  {"version": 1, "cmds": list(cmds), "format": "text",
                        "stopOnError": False},
            "id":      1,
        }).encode()
        creds = base64.b64encode(f"{_cfg['eapi_user']}:{_cfg['eapi_pass']}".encode()).decode()
        req   = urllib.request.Request(url, data=payload, headers={
            "Content-Type":  "application/json",
            "Authorization": f"Basic {creds}",
        })
        with urllib.request.urlopen(req, timeout=TIMEOUT, context=_SSL_CTX) as r:
            resp = json.loads(r.read())
        if "error" in resp:
            raise RuntimeError(resp["error"].get("message", "eAPI error"))
        return [r.get("output", "") if isinstance(r, dict) else str(r)
                for r in resp["result"]]

    # ── Diagnostic SSH run for eAPI error enrichment ──────────────────────────
    def _diagnose_eapi_errors(self, ip, lines, eos_errs):
        """Open a throwaway SSH configure session to capture % reasons for eAPI errors.

        eAPI 'CLI command N of M cmd failed: could not run command' suppresses the
        specific % reason that EOS emits on a PTY (e.g. '% Virtual IP address is
        already configured').  This function opens a topoassist_<epoch> configure
        session via SSH, replays each failed command in its block context, captures
        all % lines from the PTY output, then aborts — nothing is ever committed.

        % line extraction is index-based (not prompt-based): consecutive % lines
        between non-% output lines form one group; groups are paired to failed
        commands in order.  This avoids EOS prompt-format sensitivity.

        Returns eos_errs with 'could not run command' replaced by the % reason(s).
        If SSH is unavailable or no % lines found, returns eos_errs unchanged.
        """
        try:
            # Collect deduplicated (block_cmd, failed_cmd) pairs in order
            seen  = set()
            pairs = []
            for err in eos_errs:
                m = _EAPI_FAILED_CMD_RE.search(err)
                if not m:
                    continue
                # Skip errors that already have a specific % reason from eAPI —
                # only diagnose those where EOS gave no detail ('could not run command').
                if 'could not run command' not in err.lower():
                    continue
                failed_cmd = m.group(1).strip()
                block_cmd  = ''
                for i, line in enumerate(lines):
                    if line.strip() == failed_cmd:
                        for j in range(i - 1, -1, -1):
                            if _BLOCK_CMD_RE.match(lines[j].strip()):
                                block_cmd = lines[j].strip()
                                break
                        break
                key = (block_cmd, failed_cmd)
                if key not in seen:
                    seen.add(key)
                    pairs.append(key)
            if not pairs:
                return eos_errs

            # Build the diagnostic configure session.
            # Use end + re-enter + abort (same pattern as real push) to ensure clean
            # teardown from any sub-mode depth.  The session is always aborted.
            session   = f"topoassist_{int(time.time())}"
            diag_cmds = [f"configure session {session}"]
            for block_cmd, failed_cmd in pairs:
                if block_cmd:
                    diag_cmds.append(block_cmd)
                diag_cmds.append(failed_cmd)
            diag_cmds.extend(["end", f"configure session {session}", "abort"])

            if VERBOSE:
                print(f"  [diag] {ip}: SSH diagnostic for {len(pairs)} error(s) — {session}", flush=True)
            out, _ = self._ssh_stdin(ip, "terminal length 0", *diag_cmds, force_tty=True)

            # Collect consecutive % groups from PTY output — index-aligned with pairs.
            # Each group (one or more consecutive % lines) corresponds to one failed
            # command.  Prompt format is irrelevant: non-% lines flush the current group.
            groups  = []
            current = []
            for line in out.splitlines():
                s = line.strip()
                if s.startswith('%'):
                    current.append(s)
                elif current:
                    groups.append('\n'.join(current))
                    current = []
            if current:
                groups.append('\n'.join(current))
            if not groups:
                return eos_errs

            # Map (block_cmd, failed_cmd) → reason by position
            reasons = {key: groups[i] for i, key in enumerate(pairs) if i < len(groups)}
            if not reasons:
                return eos_errs

            # Replace 'could not run command' with the specific % reason(s)
            result = list(eos_errs)
            for i, err in enumerate(result):
                m = _EAPI_FAILED_CMD_RE.search(err)
                if not m:
                    continue
                failed_cmd = m.group(1).strip()
                block_cmd  = ''
                for li, line in enumerate(lines):
                    if line.strip() == failed_cmd:
                        for j in range(li - 1, -1, -1):
                            if _BLOCK_CMD_RE.match(lines[j].strip()):
                                block_cmd = lines[j].strip()
                                break
                        break
                reason = reasons.get((block_cmd, failed_cmd))
                if reason:
                    indented = reason.replace('\n', '\n  ')
                    result[i] = re.sub(
                        r':\s*could not run command\s*$',
                        ':\n  ' + indented,
                        err, flags=re.IGNORECASE,
                    )
            return result
        except Exception:
            return eos_errs   # SSH unavailable or timed out — keep original errors

    # ── Unified text-output command helper ────────────────────────────────────
    def _text_cmd(self, ip, cmd):
        """Run a single show command and return its text output.

        Dispatches by _cfg['transport'] so callers (BGP/VRF orphan detection, ASN check)
        work identically in ssh and eapi mode without any per-caller branching.

        SSH:  subprocess via jump host (or direct) — same path as _ssh_cmds
              but without JSON parsing, for pipe commands (show X | section Y).
        eAPI: reuses _eapi_push (format=text) and returns result[0].
        """
        if VERBOSE:
            print(f"  [text-cmd/{_cfg['transport']}] {ip}: {cmd}", flush=True)
        if _cfg['transport'] == "eapi":
            result = self._eapi_push(ip, cmd)
            return result[0] if result else ""
        # SSH path
        base     = _ssh_base()
        exec_cmd = [*base, *_jump_args(), f"{_cfg['ssh_user']}@{ip}", cmd]
        return subprocess.check_output(exec_cmd, timeout=TIMEOUT, text=True,
                                       stderr=subprocess.DEVNULL, env=_SSH_ENV)

    # ── Transport: gNMI ───────────────────────────────────────────────────────
    def _gnmi_get(self, ip, *paths):
        """GET one or more gNMI paths. Returns list of raw pygnmi response dicts."""
        if not HAS_GNMI:
            raise RuntimeError("gNMI requires: pip install pygnmi")
        with gNMIclient(target=(ip, GNMI_PORT), username=GNMI_USER,
                        password=GNMI_PASS, insecure=True) as gc:
            return [gc.get(path=[p]) for p in paths]

    # ── SSH stdin helper ──────────────────────────────────────────────────────
    def _ssh_stdin(self, ip, *cmds, force_tty=False):
        """Send commands to device via SSH stdin pipe.
        Returns (stdout_text, stderr_text) as decoded strings.
        Raises subprocess.TimeoutExpired if the device doesn't respond within
        the effective timeout — caller is responsible for catching and handling.
        Read calls (≤5 cmds) use TIMEOUT; large configure-session pushes use
        PUSH_TIMEOUT so big configs don't time out mid-session.

        force_tty=True: allocates a PTY (-tt) so EOS assigns a named VTY instead
        of showing 'UnknownTty' in 'show users' and syslog.  PTY mode does NOT
        propagate stdin EOF to close the remote shell, so two explicit 'exit'
        commands are appended automatically: the first exits any configure-session
        context (leaving the session PENDING), the second closes the EOS exec
        shell.  Extra exits at exec level are harmless."""
        cmds_list = list(cmds)
        if force_tty:
            cmds_list += ["exit", "exit"]
        stdin_text = '\n'.join(cmds_list) + '\n'
        # Label for verbose logging: skip "terminal length 0" prefix, use first real cmd
        _label = next((c for c in cmds if c != "terminal length 0"), cmds[0])
        if VERBOSE: print(f"  [stdin] {ip}: {_label} ({len(cmds)} cmd(s))", flush=True)
        # Scale timeout for large pushes: read queries are small (≤5 cmds); configure
        # sessions can be 10k+ commands and need PUSH_TIMEOUT.
        _timeout = PUSH_TIMEOUT if len(cmds_list) > 5 else TIMEOUT
        base = _ssh_base(force_tty=force_tty)
        cmd = [*base, *_jump_args(), f"{_cfg['ssh_user']}@{ip}"]
        with subprocess.Popen(cmd,
                              stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                              stderr=subprocess.PIPE, env=_SSH_ENV) as proc:
            try:
                out, err = proc.communicate(stdin_text.encode(), timeout=_timeout)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.communicate()   # drain; __exit__ will close pipes + wait
                if VERBOSE: print(f"  [stdin] {ip}: {_label} → timeout", flush=True)
                raise           # let caller decide — push path retries, cleanup swallows
        out_text = _ANSI_RE.sub('', out.decode("utf-8", errors="replace"))
        err_text = err.decode("utf-8", errors="replace")
        if VERBOSE:
            _auth_errs = ("permission denied", "authentication failed", "no route to host",
                          "connection refused", "connection timed out")
            if not out_text.strip() and any(k in err_text.lower() for k in _auth_errs):
                print(f"  [stdin] {ip}: {_label} → failed: {_clean_ssh_err(err_text)[:160]}", flush=True)
            else:
                print(f"  [stdin] {ip}: {_label} → ok ({len(out_text.splitlines())} lines)", flush=True)
        return out_text, err_text

    # ── Stale session cleanup ─────────────────────────────────────────────────
    def _abort_stale_sessions(self, ip):
        """Abort all pending topoassist_* configure sessions on the device.
        EOS allows max 5 pending sessions; leftover sessions from aborted pushes
        fill this limit and block new ones. Returns list of aborted names."""
        if _cfg['transport'] not in ("ssh", "eapi"):
            return []
        # Get current session list
        if _cfg['transport'] == "ssh":
            raw, _ = self._ssh_stdin(ip, "terminal length 0", "show configuration sessions",
                                     force_tty=True)
        else:
            raw = self._eapi_push(ip, "show configuration sessions")[0]
        # Parse: name is first token, state second; match topoassist_* pending
        stale = []
        for line in raw.splitlines():
            parts = line.split()
            if (len(parts) >= 2 and parts[0].startswith("topoassist_")
                    and "pending" in line.lower()):
                stale.append(parts[0])
        if not stale:
            return []
        # Abort each: enter session then abort (abort only works at session root)
        abort_cmds = []
        for name in stale:
            abort_cmds += [f"configure session {name}", "abort"]
        if _cfg['transport'] == "ssh":
            self._ssh_stdin(ip, *abort_cmds, force_tty=True)
        else:
            self._eapi_push(ip, *abort_cmds)
        return stale

    # ── Config push via configure session ────────────────────────────────────
    def _push_config(self, ip, config_text, dry_run=False, open_only=False, all_ifaces=False, all_device_names=None):
        """Push config_text to device using a uniquely-named EOS configure session.

        Modes:
          open_only=True  — push config, get diff, leave session PENDING on EOS
                            (no commit/abort). Returns session_name so the caller
                            can commit or abort later via _finalize_session().
                            Use this for the two-phase confirm modal flow.
          dry_run=True    — push config, get diff, abort session (verify path).
          default         — push config, get diff, commit immediately.

        all_ifaces=True — before building core_cmds, query the device for __TA-tagged
                          interfaces not present in config_text and prepend cleanup
                          commands (default interface / no interface) so orphans are
                          removed in the same session. Best-effort — failures are
                          silently ignored. Only meaningful for full-device pushes.

        Session design:
          - Pre-cleanup: abort any stale pending topoassist_* sessions first so we
            never hit EOS's 5-session pending limit. Skipped on dry_run (session is
            aborted immediately so it cannot become stale).
          - Unique name (topoassist_<epoch>) so a committed session can never block
            re-entry with 'Cannot enter session (already completed)'.
          - 'end' exits to exec mode from any sub-mode; re-entering the session lands
            at session root where show/commit/abort/exit all work.
          - 'terminal length 0' (SSH) suppresses --More-- pagination."""
        lines = [l for l in config_text.strip().split('\n') if l.strip()]
        if not lines:
            raise RuntimeError("Config is empty — nothing to push")

        # Pre-cleanup stale sessions before every push type (real, open_only, dry_run verify).
        # Dry_run sessions are aborted immediately but prior crashed sessions can still linger.
        def _safe_abort():
            try:
                self._abort_stale_sessions(ip)
            except Exception as e:
                if VERBOSE: print(f"  [cleanup] {ip}: stale-session cleanup failed — {e}")
        _ct = threading.Thread(target=_safe_abort, daemon=True)
        _ct.start()
        _ct.join(timeout=TIMEOUT)

        # Run orphan detection and BGP-ASN-change detection concurrently when doing a
        # full push (all_ifaces=True) — both are independent EOS read queries.
        # _detect_orphans already parallelises its 5 inner checks; running _find_bgp_asn_change
        # concurrently with it eliminates the extra sequential round-trip that was visible
        # in the log as a separate 'include router bgp' query after the orphan queries.
        # Best-effort for orphan detection — failures must never block push.
        asn_changed    = None
        bgp_asn_cmds   = []
        _asn_extra     = {}
        _orphan_result = [None]
        _asn_result    = [[], None]

        def _run_detect_orphans():
            try:
                _orphan_result[0] = self._detect_orphans(ip, config_text=config_text,
                                                          all_device_names=all_device_names)
            except Exception:
                pass

        def _run_asn_check():
            try:
                _asn_result[0], _asn_result[1] = self._find_bgp_asn_change(ip, config_text)
            except Exception:
                pass

        if all_ifaces and not dry_run:
            _td = threading.Thread(target=_run_detect_orphans, daemon=True)
            _ta = threading.Thread(target=_run_asn_check,    daemon=True)
            _td.start(); _ta.start()
            _td.join(timeout=TIMEOUT * 3); _ta.join(timeout=TIMEOUT * 3)
        else:
            # Non-full push (cleanup batch, open-only): skip orphan detection, still check ASN.
            _run_asn_check()

        bgp_asn_cmds = _asn_result[0] or []
        asn_changed  = _asn_result[1]

        orphans = _orphan_result[0]
        if orphans and orphans.get('ok'):
            orphan_cmds = _orphans_to_cmds(orphans)
            if orphan_cmds:
                _asn_extra["orphans_cleaned"] = {
                    "interfaces": orphans.get("interfaces", []),
                    "bgp":        orphans.get("bgp", []),
                    "vlans":      orphans.get("vlans", []),
                    "vrfs":       orphans.get("vrfs", []),
                    "ospf":       orphans.get("ospf", []),
                }
                if len(orphan_cmds) > CLEANUP_BATCH_SIZE:
                    # Too many orphans to prepend — push in block-aware batches
                    # first, then the main push carries only the actual config.
                    _ob_batches = _batch_orphan_cmds(orphan_cmds, CLEANUP_BATCH_SIZE)
                    print(f"  [orphan-batch] {ip}: {len(orphan_cmds)} cmds → {len(_ob_batches)} batch(es) of ≤{CLEANUP_BATCH_SIZE}", flush=True)
                    for _bn, _batch in enumerate(_ob_batches, 1):
                        print(f"  [orphan-batch] {ip}: batch {_bn}/{len(_ob_batches)} ({len(_batch)} cmds)…", flush=True)
                        try:
                            self._push_config(ip, '\n'.join(_batch),
                                              dry_run=False, all_ifaces=False,
                                              all_device_names=None)
                            print(f"  [orphan-batch] {ip}: batch {_bn}/{len(_ob_batches)} done", flush=True)
                        except Exception as _be:
                            print(f"  [orphan-batch] {ip}: batch {_bn}/{len(_ob_batches)} failed — {_be}", flush=True)
                            break
                    # lines stays as the actual config only (no prepend)
                else:
                    lines = orphan_cmds + lines

        # Prepend 'no router bgp <old_asn>' when the ASN has changed. EOS cannot
        # change the AS number in-place — old block must be removed first.
        # Runs on all push modes (dry_run included) so the diff reflects the removal
        # and the client can warn the user before they confirm the push.
        if bgp_asn_cmds:
            lines = bgp_asn_cmds + lines

        session   = f"topoassist_{int(time.time())}"
        final_cmd = "abort" if dry_run else "commit"
        if asn_changed:
            _asn_extra["asn_changed"] = asn_changed

        # 'end' exits from any sub-mode depth to exec mode (session stays pending).
        # Re-entering puts us at session root so show/commit/abort all work correctly.
        #
        # open_only: omit commit/abort — EOS leaves the session PENDING.
        # The PTY shell is still closed by the 2× 'exit' _ssh_stdin appends,
        # but we stop at 'show session-config diffs' so the diff is fully
        # flushed before the shell exits.
        if open_only:
            core_cmds = (
                [f"configure session {session}"]
                + lines
                + ["end", f"configure session {session}", "show session-config diffs"]
            )
        else:
            core_cmds = (
                [f"configure session {session}"]
                + lines
                + ["end", f"configure session {session}", "show session-config diffs", final_cmd]
            )

        if _cfg['transport'] == "eapi":
            _IDEMPOTENCY_CMDS = ('default ip address virtual', 'default ipv6 address virtual')
            _pre_idempotency_warns = []
            try:
                results = list(self._eapi_push(ip, *core_cmds))
                # Pre-scan: when EOS embeds per-command errors in text output (rather than
                # a top-level error), pair each command with its output so the command name
                # is available for idempotency matching — _extract_eos_errors would only see
                # bare "% Invalid command" with no context in eAPI-format output.
                for i, (cmd, out) in enumerate(zip(core_cmds, results)):
                    if (any(c in cmd.strip() for c in _IDEMPOTENCY_CMDS)
                            and '% ' in out and 'invalid command' in out.lower()):
                        _pre_idempotency_warns.append(f"{cmd.strip()} → {out.strip()}")
                        results[i] = ''  # suppress so _extract_eos_errors skips it
            except RuntimeError as e:
                # eAPI returns a top-level JSON-RPC "error" for configure session
                # failures — _eapi_push raises RuntimeError with the message text.
                # "CLI command N of M 'cmd' failed" is in this path; enrich it.
                raw_msg = str(e)
                if _EAPI_FAILED_CMD_RE.search(raw_msg):
                    # Split multi-error message (stopOnError:False may list all failures
                    # in one top-level error string) into per-command entries so each
                    # gets its own block-context header and SSH diagnostic enrichment.
                    parts = re.split(r'(?=CLI command \d+ of \d+)', raw_msg)
                    parts = [p.strip() for p in parts if p.strip()]
                    if not parts:
                        parts = [raw_msg]
                    eos_errs = _annotate_eapi_errors(parts, lines)
                    eos_errs = self._diagnose_eapi_errors(ip, lines, eos_errs)
                    # GW SVI cleanup commands return 'invalid command' when the feature is
                    # not configured — expected harmless no-op. Demote to warnings.
                    # The "CLI command N of M 'cmd' failed" format includes the cmd name,
                    # so the substring match is reliable here (unlike bare % lines above).
                    _real_errs, _cleanup_notes = [], []
                    for err in eos_errs:
                        if (any(cmd in err for cmd in _IDEMPOTENCY_CMDS)
                                and 'invalid command' in err.lower()):
                            _cleanup_notes.append(err)
                        else:
                            _real_errs.append(err)
                    # _annotate_eapi_errors injects block-context lines (e.g. "interface Vlan100")
                    # before errors. When all actual errors are idempotency cleanup notes,
                    # these orphaned context lines remain in _real_errs but are not errors.
                    # Strip them so the "all idempotency" check is accurate.
                    _real_errs = [
                        e for e in _real_errs
                        if not (_BLOCK_CMD_RE.match(e.strip()) and not _EAPI_FAILED_CMD_RE.search(e))
                    ]
                    if _cleanup_notes and not _real_errs:
                        # All errors were idempotency cleanup — EOS committed the session
                        # (stopOnError:False runs commit regardless). Diff is unavailable
                        # because the error response doesn't carry the result array.
                        return {"ok": True, "diff": None,
                                "eos_warnings": _cleanup_notes, **_asn_extra}
                    if _cleanup_notes:
                        _asn_extra["eos_warnings"] = _cleanup_notes
                    return {"ok": False, "error": '\n'.join(_real_errs or eos_errs), **_asn_extra}
                raise
            except OSError as e:
                # Socket/read timeout — eAPI dispatched all commands including 'commit'
                # but the HTTP response didn't arrive within TIMEOUT. EOS may have
                # committed the session anyway (management-plane hiccup, process restart).
                # Verify by checking whether the named session is still present.
                _msg = str(e).lower()
                if not (isinstance(e, TimeoutError) or 'timed out' in _msg or 'time out' in _msg):
                    raise  # not a timeout — propagate as-is
                if not open_only and not dry_run:
                    time.sleep(2)
                    try:
                        _chk = self._eapi_push(ip, "show configuration sessions")[0]
                        if session not in _chk:
                            # Session absent → EOS committed and cleaned it up.
                            return {"ok": True, "diff": "", "late_response": True, **_asn_extra}
                        raise RuntimeError(
                            f"Push timed out — {len(lines)} config lines, session '{session}' still pending on device. "
                            "Try again.") from e
                    except RuntimeError:
                        raise
                    except Exception:
                        pass  # verification query itself failed
                raise RuntimeError(
                    f"Push timed out — {len(lines)} config lines, {PUSH_TIMEOUT}s limit — verify: show running-config | grep __TA") from e
            if open_only:
                diff = results[-1].strip() if results else ""  # last cmd is show diffs
            else:
                diff = results[-2].strip() if len(results) >= 2 else ""
            eos_errs, eos_warns = _extract_eos_errors('\n'.join(results))
            if _pre_idempotency_warns:
                eos_warns = eos_warns + _pre_idempotency_warns
            if eos_errs:
                eos_errs = _annotate_eapi_errors(eos_errs, lines)
                eos_errs = self._diagnose_eapi_errors(ip, lines, eos_errs)
                # Secondary filter: SSH-style eAPI output includes cmd name in the error
                # string (prompt echo before % line) — catch any that slipped past pre-scan.
                _real_errs, _cleanup_notes = [], []
                for err in eos_errs:
                    if (any(cmd in err for cmd in _IDEMPOTENCY_CMDS)
                            and 'invalid command' in err.lower()):
                        _cleanup_notes.append(err)
                    else:
                        _real_errs.append(err)
                eos_errs = _real_errs
                if _cleanup_notes:
                    eos_warns = eos_warns + _cleanup_notes
                if eos_errs:
                    _asn_extra["eos_errors"] = eos_errs
            if eos_warns:
                _asn_extra["eos_warnings"] = eos_warns
            if open_only:
                return {"ok": True, "diff": diff, "session_name": session, **_asn_extra}
            _eapi_action = "dry-run (aborted)" if dry_run else "committed"
            _eapi_dl = len([l for l in (diff or "").splitlines() if l.strip()])
            print(f"  [push] {ip}: session {session} {_eapi_action} — {_eapi_dl} diff line(s)", flush=True)
            return {"ok": True, "diff": diff, "dry_run": dry_run, **_asn_extra}

        if _cfg['transport'] == "ssh":
            output, err_text = self._ssh_stdin(ip, "terminal length 0", *core_cmds,
                                               force_tty=True)
            _auth_errs = ("permission denied", "authentication failed",
                          "no route to host", "connection refused",
                          "connection timed out", "host key verification failed")
            if not output.strip() and any(k in err_text.lower() for k in _auth_errs):
                raise RuntimeError(f"SSH failed: {_clean_ssh_err(err_text)[:200]}")
            if VERBOSE: print(f"  [push] {ip}: SSH connected")
            if "maximum number of pending sessions" in output.lower():
                raise RuntimeError(
                    "EOS pending session limit reached — Device Bridge will auto-clean "
                    "on next push; or manually run: configure session <name> / abort")
            diff                = _extract_session_diff(output)
            eos_errs, eos_warns = _extract_eos_errors(output)
            if eos_errs:
                _asn_extra["eos_errors"] = eos_errs
            if eos_warns:
                _asn_extra["eos_warnings"] = eos_warns
            if open_only:
                diff_lines = len([l for l in diff.splitlines() if l.strip()]) if diff else 0
                print(f"  [push] {ip}: session {session} open (pending) — {diff_lines} diff line(s)", flush=True)
                return {"ok": True, "diff": diff, "session_name": session, **_asn_extra}
            action = "dry-run (aborted)" if dry_run else "committed"
            diff_lines = len([l for l in diff.splitlines() if l.strip()]) if diff else 0
            print(f"  [push] {ip}: session {session} {action} — {diff_lines} diff line(s)", flush=True)
            return {"ok": True, "diff": diff, "dry_run": dry_run, **_asn_extra}

        raise NotImplementedError(
            f"Config push not supported for _cfg['transport']={_cfg['transport']!r} — use ssh or eapi")

    def _finalize_session(self, ip, session_name, action):
        """Commit or abort an existing named configure session on the device.

        Used as Phase 2 of the two-phase push modal: Phase 1 opens the session
        and gets the diff; Phase 2 calls this to commit or abort without
        re-pushing any config lines — a single short SSH round-trip.

        action: 'commit' or 'abort'
        Returns {"ok": True, "action": action} on success."""
        if action not in ("commit", "abort"):
            raise ValueError(f"Invalid finalize action: {action!r}")

        if _cfg['transport'] == "ssh":
            output, err_text = self._ssh_stdin(
                ip, "terminal length 0",
                f"configure session {session_name}", action,
                force_tty=True)
            _auth_errs = ("permission denied", "authentication failed",
                          "no route to host", "connection refused",
                          "connection timed out", "host key verification failed")
            if not output.strip() and any(k in err_text.lower() for k in _auth_errs):
                raise RuntimeError(f"SSH failed: {_clean_ssh_err(err_text)[:200]}")
            # EOS prints a warning if the session name is not found (timed out or never opened)
            out_l = output.lower()
            if "session not found" in out_l or "no pending session" in out_l:
                raise RuntimeError(
                    f"Configure session '{session_name}' not found — "
                    "it may have timed out on the device. Push again.")
            if VERBOSE: print(f"  [finalize] {ip}: session {session_name} {action}ed")
            return {"ok": True, "action": action}

        if _cfg['transport'] == "eapi":
            # Verify session still exists before committing: eAPI creates an empty session
            # for unknown names, so we'd silently commit nothing without this check.
            check = self._eapi_push(ip, "show configuration sessions")
            check_out = check[0] if check else ""
            if session_name not in check_out:
                raise RuntimeError(
                    f"Configure session '{session_name}' not found — "
                    "it may have timed out on the device. Push again.")
            try:
                self._eapi_push(ip, f"configure session {session_name}", action)
            except OSError as e:
                _msg = str(e).lower()
                if not (isinstance(e, TimeoutError) or 'timed out' in _msg or 'time out' in _msg):
                    raise
                if action == "commit":
                    time.sleep(2)
                    try:
                        _chk = self._eapi_push(ip, "show configuration sessions")[0]
                        if session_name not in _chk:
                            return {"ok": True, "action": action, "late_response": True}
                    except Exception:
                        pass
                raise RuntimeError(
                    f"Finalize timed out — verify: show configuration sessions") from e
            if VERBOSE: print(f"  [finalize] {ip}: session {session_name} {action}ed (eapi)")
            return {"ok": True, "action": action}

        raise NotImplementedError(
            f"Finalize not supported for _cfg['transport']={_cfg['transport']!r} — use ssh or eapi")

    # ── Dispatch: run EOS show commands via active _cfg['transport'] ─────────────────────
    def _run_cmds(self, ip, *cmds):
        # _ssh_cmds returns (results, cmd_errors); _eapi_cmds raises on failure
        # so wrap it to match the same tuple signature.
        if _cfg['transport'] == "ssh":  return self._ssh_cmds(ip, *cmds)
        if _cfg['transport'] == "eapi": return self._eapi_cmds(ip, *cmds), {}
        raise NotImplementedError(f"_run_cmds not supported for _cfg['transport']={_cfg['transport']!r}")

    # ── Per-device checks ─────────────────────────────────────────────────────
    def _check_lldp(self, ip):
        if _cfg['transport'] in ("ssh", "eapi"):
            (data,), cmd_errors = self._run_cmds(ip, "show lldp neighbors detail")
            if cmd_errors:
                raise list(cmd_errors.values())[0]   # partial LLDP is unusable — re-raise
            return {"ok": True, "neighbors": _normalize_lldp_neighbors(data.get("lldpNeighbors", {}))}

        if _cfg['transport'] == "rest":
            raw = self._rest_get(ip, "openconfig-lldp:lldp/interfaces")
            return {"ok": True, "neighbors": _oc_lldp_to_eos(raw)}

        if _cfg['transport'] == "gnmi":
            raw = _gnmi_val(self._gnmi_get(ip, "openconfig-lldp:lldp")[0])
            return {"ok": True, "neighbors": _oc_lldp_to_eos(raw)}

        raise RuntimeError(f"Unknown _cfg['transport']: {_cfg['transport']!r}")

    def _check_devstatus(self, ip):
        if _cfg['transport'] in ("ssh", "eapi"):
            (ver, ifs, ivlans, errs), cmd_errors = self._run_cmds(
                ip,
                "show version",
                "show interfaces status",
                "show vlan internal usage",
                "show interfaces counters errors",
            )
            result = _build_devstatus_ssh(ver, ifs, ivlans, errs)
            if cmd_errors:
                def _fmt(e):
                    if isinstance(e, subprocess.CalledProcessError):
                        return f"exit {e.returncode}"
                    if isinstance(e, subprocess.TimeoutExpired):
                        return "timeout"
                    return str(e)[:80]
                result["cmdErrors"] = {cmd: _fmt(exc) for cmd, exc in cmd_errors.items()}
            return result

        if _cfg['transport'] == "rest":
            plat_raw  = self._rest_get(ip, "openconfig-platform:components")
            iface_raw = self._rest_get(ip, "openconfig-interfaces:interfaces")
            return {
                "ok":              True,
                "version":         _oc_version(plat_raw),
                "platform":        _oc_platform(plat_raw),
                "interfaces":      _oc_iface_status(iface_raw),
                "interfaceErrors": {},
            }

        if _cfg['transport'] == "gnmi":
            plat_r, iface_r = self._gnmi_get(
                ip,
                "openconfig-platform:components",
                "openconfig-interfaces:interfaces",
            )
            return {
                "ok":              True,
                "version":         _oc_version(_gnmi_val(plat_r)),
                "platform":        _oc_platform(_gnmi_val(plat_r)),
                "interfaces":      _oc_iface_status(_gnmi_val(iface_r)),
                "interfaceErrors": {},
            }

        raise RuntimeError(f"Unknown _cfg['transport']: {_cfg['transport']!r}")

    # ── Orphan detection ──────────────────────────────────────────────────────
    def _detect_orphans(self, ip, config_text=None, all_device_names=None, expected_ports=None):
        """Unified orphan detection — used by both push cleanup and Cleanup UI.

        expected_ports: list of known-good interface names from the topology.
                        If None, falls back to parsing config_text interface stanzas.
        config_text:    Generated device config. Used for VLAN/VRF expected sets and
                        supplements expected_ports for the interface check.
        all_device_names: All topology device names (BGP orphan check).

        Returns:
          { ok, ta_total, matched,
            interfaces: [{name, description, linkStatus, protocol}],
            bgp:        [{neighbor, description, asn}],
            vlans:      [{vid, name}],
            vrfs:       [{name}],
            ospf:       [{context, iface}] }

        All checks are best-effort — failure returns empty list for that section.
        """
        # ── Interface orphans ──────────────────────────────────────────────────
        print(f"  [detect-orphans/eapi] {ip}: show interfaces description", flush=True)
        try:
            (raw,), _ = self._run_cmds(ip, "show interfaces description")
        except Exception:
            return {"ok": False, "error": "show interfaces description failed"}
        iface_descs = (raw or {}).get("interfaceDescriptions", {})

        expected_set = {_norm_iface(p) for p in (expected_ports or [])}
        if config_text:
            for line in config_text.splitlines():
                m = re.match(r'^interface\s+(\S+)', line, re.IGNORECASE)
                if m:
                    expected_set.add(_norm_iface(m.group(1)))

        ta_total      = 0
        orphan_ifaces = []
        for name, info in iface_descs.items():
            if _TA_ORPHAN_SKIP_RE.match(name):
                continue
            desc = info.get('description', '')
            if '__TA' not in desc:
                continue
            ta_total += 1
            entry = {
                'name':        name,
                'description': desc,
                'linkStatus':  info.get('lineProtocolStatus', info.get('interfaceStatus', '')),
                'protocol':    info.get('lineProtocolStatus', ''),
            }
            if _norm_iface(name) not in expected_set:
                orphan_ifaces.append(entry)

        orphan_iface_names = {_norm_iface(o['name']) for o in orphan_ifaces}
        matched = ta_total - len(orphan_ifaces)

        detection_errors = {}  # {category: error_str} for any category that failed to query

        # ── Phase 2: remaining checks in parallel ──────────────────────────────
        # All five are independent of each other; orphan_iface_names is already known
        # from phase 1 so OSPF workers can check it immediately without a barrier.
        _pdata = {}  # key → fetched data (None = skipped or error)
        _perrs = {}  # key → error string

        def _run_worker(key, fn, *args):
            try:
                _pdata[key], _perrs[key] = fn(*args)
            except Exception as e:
                _pdata[key] = None
                _perrs[key] = str(e)[:80]

        def _w_bgp():
            if not all_device_names:
                return None, None
            try:
                return self._text_cmd(ip, "show running-config | section router bgp"), None
            except Exception as e:
                return None, str(e)[:80]

        def _w_vlan():
            if not config_text:
                return None, None
            try:
                (vlan_raw,), _ = self._run_cmds(ip, "show vlan")
                return vlan_raw, None
            except Exception as e:
                return None, str(e)[:80]

        def _w_vrf():
            if not config_text:
                return None, None
            try:
                return self._text_cmd(ip, "show running-config | section vrf instance"), None
            except Exception as e:
                return None, str(e)[:80]

        def _w_ospf(kw):
            if not orphan_iface_names:
                return None, None
            try:
                return self._text_cmd(ip, f'show running-config | section router {kw}'), None
            except Exception as e:
                return None, str(e)[:80]

        _workers = [
            threading.Thread(target=_run_worker, args=('bgp',   _w_bgp)),
            threading.Thread(target=_run_worker, args=('vlan',  _w_vlan)),
            threading.Thread(target=_run_worker, args=('vrf',   _w_vrf)),
            threading.Thread(target=_run_worker, args=('ospf',  _w_ospf, 'ospf')),
            threading.Thread(target=_run_worker, args=('ospf3', _w_ospf, 'ospf3')),
        ]
        for _t in _workers: _t.start()
        for _t in _workers: _t.join()

        if _perrs.get('bgp'):   detection_errors['bgp']   = _perrs['bgp']
        if _perrs.get('vlan'):  detection_errors['vlans'] = _perrs['vlan']
        if _perrs.get('vrf'):   detection_errors['vrfs']  = _perrs['vrf']
        if _perrs.get('ospf'):  detection_errors['ospf']  = _perrs['ospf']

        bgp_text   = _pdata.get('bgp')
        vlan_raw   = _pdata.get('vlan')
        vrf_text   = _pdata.get('vrf')
        ospf_text  = _pdata.get('ospf')
        ospf3_text = _pdata.get('ospf3')

        # ── BGP neighbor orphans ───────────────────────────────────────────────
        # Global context only — splits before first 'vrf' sub-context line.
        bgp_orphans = []
        if bgp_text is not None and all_device_names:
            known_devs = {d.lower() for d in all_device_names}
            asn_m      = re.search(r'^router bgp\s+(\d+)', bgp_text, re.MULTILINE | re.IGNORECASE)
            asn        = asn_m.group(1) if asn_m else None
            global_bgp = re.split(r'\n\s+vrf\s+', bgp_text, maxsplit=1)[0]
            _NEIGH_DESC_RE = re.compile(
                r'^\s*neighbor\s+(\S+)\s+description\s+(.+?__TA\S*.*)', re.MULTILINE)
            _DEV_RE = re.compile(r'(?:Overlay to|To)\s+(\S+)', re.IGNORECASE)
            for m in _NEIGH_DESC_RE.finditer(global_bgp):
                neighbor = m.group(1)
                desc     = m.group(2).strip()
                dev_m    = _DEV_RE.search(desc)
                if dev_m and dev_m.group(1).lower() not in known_devs:
                    bgp_orphans.append({'neighbor': neighbor, 'description': desc, 'asn': asn})

        # ── VLAN orphans ───────────────────────────────────────────────────────
        vlan_orphans = []
        if vlan_raw is not None and config_text:
            expected_vlans = set()
            for line in config_text.split('\n'):
                vm = re.match(r'^vlan\s+(\d+)\s*$', line, re.IGNORECASE)
                if vm:
                    expected_vlans.add(int(vm.group(1)))
            for vid_str, vinfo in (vlan_raw or {}).get('vlans', {}).items():
                try:
                    vid = int(vid_str)
                except ValueError:
                    continue
                if vid in (4093, 4094):
                    continue
                if '__TA' in vinfo.get('name', '') and vid not in expected_vlans:
                    vlan_orphans.append({'vid': vid, 'name': vinfo.get('name', '')})

        # ── VRF orphans ────────────────────────────────────────────────────────
        vrf_orphans = []
        if vrf_text is not None and config_text:
            expected_vrfs = set()
            for line in config_text.split('\n'):
                vm = re.match(r'^vrf\s+instance\s+(\S+)', line, re.IGNORECASE)
                if vm:
                    expected_vrfs.add(vm.group(1).lower())
            _VRF_INST_RE    = re.compile(r'^vrf instance\s+(\S+)', re.MULTILINE | re.IGNORECASE)
            _VRF_DESC_TA_RE = re.compile(r'^\s+description\s+\S+\s+__TA', re.MULTILINE)
            for vm in _VRF_INST_RE.finditer(vrf_text):
                vrf_name = vm.group(1)
                next_m   = _VRF_INST_RE.search(vrf_text, vm.end())
                block    = vrf_text[vm.start(): next_m.start() if next_m else len(vrf_text)]
                if _VRF_DESC_TA_RE.search(block) and vrf_name.lower() not in expected_vrfs:
                    vrf_orphans.append({'name': vrf_name})

        # ── OSPF orphans ───────────────────────────────────────────────────────
        # Stale 'no passive-interface X' in router ospf/ospf3 for orphaned interfaces.
        # EOS configure sessions are additive — a fresh OSPF block does NOT remove
        # pre-existing 'no passive-interface' sub-commands; must negate them explicitly.
        ospf_orphans = []
        for _ospf_result, _ospf_kw in ((ospf_text, 'ospf'), (ospf3_text, 'ospf3')):
            if _ospf_result is None:
                continue
            _CTX_RE = re.compile(
                rf'^(router {_ospf_kw}\s+\d+(?:\s+vrf\s+\S+)?)', re.MULTILINE)
            _NO_PASS_RE = re.compile(r'^\s+no\s+passive-interface\s+(\S+)', re.MULTILINE)
            for ctx_m in _CTX_RE.finditer(_ospf_result):
                ctx_header = ctx_m.group(1)
                next_ctx   = _CTX_RE.search(_ospf_result, ctx_m.end())
                block      = _ospf_result[
                    ctx_m.start(): next_ctx.start() if next_ctx else len(_ospf_result)]
                for npm in _NO_PASS_RE.finditer(block):
                    if _norm_iface(npm.group(1)) in orphan_iface_names:
                        ospf_orphans.append({'context': ctx_header, 'iface': npm.group(1)})

        return {
            'ok':               True,
            'ta_total':         ta_total,
            'matched':          matched,
            'interfaces':       orphan_ifaces,
            'bgp':              bgp_orphans,
            'vlans':            vlan_orphans,
            'vrfs':             vrf_orphans,
            'ospf':             ospf_orphans,
            'detection_errors': detection_errors,
        }

    def _find_bgp_asn_change(self, ip, config_text):
        """Return (cmds, asn_info) where cmds=['no router bgp <old>'] and
        asn_info={"from": old, "to": new} when config_text targets a different
        AS than currently configured on the device, else ([], None).

        EOS does not allow changing the BGP AS number in-place — the old
        'router bgp <old_asn>' block must be removed before the new one is applied.
        Called during full-device push so the removal lands in the same configure
        session and is visible in the diff for user approval.
        Returns ([], None) on any query failure — best-effort.
        """
        m = re.search(r'^router bgp\s+(\d+)', config_text, re.MULTILINE | re.IGNORECASE)
        if not m:
            return [], None  # no BGP in config being pushed
        new_asn = int(m.group(1))

        # Use 'show running-config | include router bgp' (plain text via SSH) rather than
        # 'show ip bgp summary | json' — the JSON `vrfs.<vrf>.as` field returns 0 when BGP
        # has no established peers, making it unreliable for ASN detection.
        try:
            out = self._text_cmd(ip, "show running-config | include router bgp")
        except Exception:
            return [], None
        m2 = re.search(r'^router bgp\s+(\d+)', out, re.MULTILINE | re.IGNORECASE)
        if not m2:
            return [], None  # BGP not in running config
        old_asn = int(m2.group(1))
        if old_asn == new_asn:
            return [], None
        if VERBOSE:
            print(f"  [bgp-asn] {ip}: ASN change {old_asn} → {new_asn} — prepending no router bgp {old_asn}")
        return [f"no router bgp {old_asn}"], {"from": old_asn, "to": new_asn}

    # ── Parallel runner ───────────────────────────────────────────────────────
    def _run_parallel(self, ip_map, check_fn):
        results = {}
        lock    = threading.Lock()
        sem     = threading.Semaphore(MAX_WORKERS)

        def run(dev, ip):
            ip = (ip or "").strip()
            if not ip:
                with lock: results[dev] = {"ok": False, "error": "No IP configured"}
                return
            with sem:
                try:
                    # SSH call outside the lock — allows threads to run in parallel.
                    # Lock only protects the dict write.
                    result = check_fn(ip)
                    with lock: results[dev] = result
                except subprocess.TimeoutExpired:
                    with lock: results[dev] = {"ok": False, "error": f"Timeout — {ip} unreachable?"}
                except subprocess.CalledProcessError:
                    # If _ssh_auth has already flagged an auth failure (exit-255 threshold
                    # crossed by an earlier thread), surface that message so the JS status
                    # bar shows "N auth errors" instead of the generic SSH-failed text.
                    if not _ssh_auth["ok"] and _ssh_auth.get("msg"):
                        err_msg = _ssh_auth["msg"]
                    else:
                        err_msg = f"SSH failed — check admin access on {ip}"
                    with lock: results[dev] = {"ok": False, "error": err_msg}
                except json.JSONDecodeError:
                    with lock: results[dev] = {"ok": False, "error": "Device returned invalid JSON"}
                except FileNotFoundError:
                    with lock: results[dev] = {"ok": False, "error": "ssh not found — is OpenSSH installed?"}
                except Exception as e:
                    with lock: results[dev] = {"ok": False, "error": str(e)[:120]}

        threads = [threading.Thread(target=run, args=(d, i), daemon=True)
                   for d, i in ip_map.items()]
        for t in threads: t.start()
        for t in threads: t.join(timeout=TIMEOUT + 3)
        return results

    # ── Response helper ───────────────────────────────────────────────────────
    def _json(self, code, data):
        body = json.dumps(data).encode()
        try:
            self.send_response(code)
            self.send_header("Content-Type",   "application/json")
            self.send_header("Content-Length", str(len(body)))
            self._cors()
            self.end_headers()
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass  # client closed connection before we responded (SSH took too long)

    def log_message(self, fmt, *args):
        if VERBOSE:
            print(f"  [{self.client_address[0]}] {fmt % args}", flush=True)


if __name__ == "__main__":
    if "-h" in sys.argv or "--help" in sys.argv:
        print(f"""
  TopoAssist Device Bridge  v{VERSION}
  ─────────────────────────────────────
  Usage: python device_bridge.py [-b JUMP_HOST] [-t TIMEOUT] [-p PUSH_TIMEOUT] [-v] [-h]

  Options:
    -b JUMP_HOST  Jump host for SSH     default: bus-home
                  Use -b "" for direct SSH (no jump host)
    -t TIMEOUT    Per-device timeout    default: 15  (seconds)
                  Used for show/LLDP/devstatus queries. Keep small so
                  unreachable devices fail fast.
    -p TIMEOUT    Push timeout          default: max(t*4, 300)  (seconds)
                  Used for configure-session pushes (>5 cmds). Increase
                  for large configs (10k+ lines). Example: -p 600
    -v            Verbose — print SSH connect, session, retry, error, and timeout logs
    -h            Show this help and exit

  Transport and credentials are configured in the sidebar UI and applied
  live via POST /settings — no restart required.

  Legacy (override initial values before sidebar connects):
    -m ssh|eapi   Transport mode        default: eapi
    -u USER       SSH username          default: admin
    -eu USER      eAPI username         default: admin
    -ep PASS      eAPI password         default: (empty)
    --eapi-port N eAPI port             default: 443
    --eapi-http   Use HTTP instead of HTTPS

  Examples:
    python device_bridge.py -b jumphost -t 30 -v
    python device_bridge.py -b ""                    # direct SSH, no jump
    python device_bridge.py -t 30 -p 600             # large-config push headroom
""")
        sys.exit(0)

    server = HTTPServer(("127.0.0.1", PORT), BridgeHandler)
    print(f"\n  TopoAssist Device Bridge  v{VERSION}")
    print(f"  ─────────────────────────────────────")
    print(f"  Listening : http://localhost:{PORT}")
    print(f"  Timeout   : {TIMEOUT}s (queries: -t)  |  Push: {PUSH_TIMEOUT}s (-p)")
    print(f"  Verbose   : {'ON (SSH + session logs)' if VERBOSE else 'OFF (run with -v to enable)'}")
    print(f"  Endpoints : /health  /lldp  /devstatus  /pushconfig  /reconcile  /settings")
    print(f"  ─────────────────────────────────────")
    print(f"  Keep this terminal open while using")
    print(f"  Device Bridge in the sidebar.")
    print(f"  Ctrl+C to stop.")
    print()
    _print_transport_status()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Bridge stopped.")
        sys.exit(0)
