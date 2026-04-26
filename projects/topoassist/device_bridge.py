#!/usr/bin/env python3
# topoassist v260426.17 | 2026-04-26 11:55:41
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

Transport options (set METHOD below):
  ssh   — SSH via jump host or direct (default; stdlib only)
  eapi  — Arista eAPI JSON-RPC over HTTPS (stdlib only)
  rest  — RESTCONF over HTTPS, OpenConfig YANG (stdlib only; EOS 4.22+)
  gnmi  — gRPC/gNMI, OpenConfig YANG (requires: pip install pygnmi; EOS 4.22+)

Endpoints:
  GET  /health      → {"status":"ok","version":"260426.16","port":8765}
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
    tty = "-tt" if force_tty else "-T"
    if _SSHPASS_BIN:
        return [_SSHPASS_BIN, "-p", "", "ssh", tty,
                "-o", "StrictHostKeyChecking=no",
                "-o", "PasswordAuthentication=yes",
                "-o", "PubkeyAuthentication=no",
                "-o", "LogLevel=ERROR",
                "-o", "ConnectTimeout=8"]
    if _ASKPASS_SCRIPT:
        return ["ssh", tty,
                "-o", "StrictHostKeyChecking=no",
                "-o", "BatchMode=no",
                "-o", "PasswordAuthentication=yes",
                "-o", "PubkeyAuthentication=no",
                "-o", "NumberOfPasswordPrompts=1",
                "-o", "LogLevel=ERROR",
                "-o", "ConnectTimeout=8"]
    return ["ssh", tty,
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

VERSION           = "260426.16"
PORT              = 8765
# CLI flags (-u/-b/-t/-P) take priority; env vars are the fallback.
_b        = _arg("-b")
SSH_USER  = _arg("-u") or os.environ.get("BRIDGE_SSH_USER",  "admin")
JUMP_HOST = _b         if _b is not None else os.environ.get("BRIDGE_JUMP_HOST", "bus-home")
TIMEOUT   = int(_arg("-t") or os.environ.get("BRIDGE_TIMEOUT", "15"))
# PUSH_TIMEOUT: separate ceiling for large configure-session pushes.
# TIMEOUT (-t) is for read queries (show, lldp, etc.) and should stay small.
# Large configs (10k+ commands) can exceed TIMEOUT — set this independently.
# Default: max(TIMEOUT*4, 300) so it auto-scales with -t but never below 5 min.
PUSH_TIMEOUT = int(_arg("-P") or os.environ.get("BRIDGE_PUSH_TIMEOUT",
                                                 str(max(TIMEOUT * 4, 300))))
PUSH_RETRIES      = 2   # retries on connection refused / SSH failure (device warm-restart)
PUSH_RETRY_DELAY  = 4   # seconds between retries

# ── Active transport ───────────────────────────────────────────────────────────
METHOD = "ssh"      # ssh | eapi | rest | gnmi

# ── SSH config (METHOD = "ssh") ───────────────────────────────────────────────

# ── eAPI config (METHOD = "eapi") ─────────────────────────────────────────────
# Arista eAPI — JSON-RPC over HTTPS; returns same EOS JSON as SSH show | json
EAPI_USER = "admin"
EAPI_PASS = ""
EAPI_PORT = 443

# ── RESTCONF config (METHOD = "rest") ─────────────────────────────────────────
# OpenConfig YANG over HTTPS; EOS 4.22+; enable with: management api restconf
REST_USER = "admin"
REST_PASS = ""
REST_PORT = 443

# ── gNMI config (METHOD = "gnmi") ─────────────────────────────────────────────
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


def _build_devstatus_ssh(ver, ifs, ivlans):
    """Build devstatus response dict from raw _run_cmds results (any may be None on failure).

    Each argument corresponds to one SSH/eAPI command result:
      ver    — 'show version'              (None if command failed)
      ifs    — 'show interfaces status'    (None if command failed)
      ivlans — 'show vlan internal usage'  (None if command failed)

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
        "ok":          True,
        "hostname":    ver.get("hostname", ""),
        "version":     raw_ver,
        "platform":    ver.get("modelName", "").lstrip("DCS-"),
        "bridgeMac":   ver.get("systemMacAddress", ""),
        "interfaces":  {
            k: {"linkStatus": v.get("linkStatus", "")}
            for k, v in ifs.get("interfaceStatuses", {}).items()
        },
        "internalVlans": _parse_internal_vlans(ivlans),
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


# ── Section-level cleaners for idempotent push ────────────────────────────────

_SECTION_CLEANERS = [
    # Vxlan1 must be reset before re-applying: vxlan flood vtep is a list command —
    # pushing new flood entries does not remove stale ones from a prior device ID config.
    # 'default interface Vxlan1' resets all config to factory state in-place (cleaner than
    # 'no interface Vxlan1' which removes + re-creates the interface).
    (re.compile(r'^(interface Vxlan\d+)', re.IGNORECASE), 'default {}'),
]

# Management interfaces must never be defaulted — would kill SSH connectivity
_MGMT_IFACE_RE = re.compile(r'^interface\s+(?:Ma|Management)\d+', re.I)

# Interfaces excluded from #TA orphan cleanup — system/VTEP/MLAG-control, not per-link
_TA_ORPHAN_SKIP_RE = re.compile(
    r'^(?:Loopback|Management|Vxlan)\d|^Vlan409[34]$', re.IGNORECASE
)


def _prepend_section_cleaners(config_text):
    """Prepend section-level cleanup commands before each major EOS config section.

    Ensures idempotent push: existing config in each section is wiped before
    the new config is applied, preventing stale commands (old BGP neighbors,
    old interface IPs, old OSPF areas) from surviving topology changes.

    Rules:
      - Physical/LAG/Loopback/Vxlan/Vlan interfaces → default interface <name>
      - router bgp <ASN>   → no router bgp <ASN>
      - router ospf 1      → no router ospf 1
      - mlag configuration → no mlag configuration
      - Management interfaces: never touched (SSH safety)
      - Global/additive lines (hostname, ip routing, vrf, vlan, configure,
        write memory): passed through unchanged — they are idempotent.
      - Indented sub-commands (leading space): not matched — patterns require
        the section header to be unindented (at configure-session root level).
    """
    out = []
    for line in config_text.split('\n'):
        s = line.strip()
        if _MGMT_IFACE_RE.match(s):
            out.append(line)
            continue
        for pattern, fmt in _SECTION_CLEANERS:
            m = pattern.match(s)
            if m:
                grp = m.group(1) if m.lastindex else None
                out.append(fmt.format(grp) if grp else fmt)
                break
        out.append(line)
    return '\n'.join(out)


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
                      "port": PORT, "method": METHOD, "timeout": TIMEOUT}
            # Only check arista-ssh credentials for pure key-based auth.
            # Password-based modes (sshpass or SSH_ASKPASS shim) don't use
            # arista-ssh certs, so the check is irrelevant.
            if METHOD == "ssh":
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
                              "/pushconfig/finalize", "/reconcile"):
            self._json(404, {"error": "not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            body   = json.loads(self.rfile.read(length))
        except Exception:
            self._json(400, {"error": "invalid JSON body"})
            return
        ip_map       = body.get("ipMap", {})
        dry_run      = bool(body.get("dry_run", False))
        open_session = bool(body.get("open_session", False))
        all_ifaces   = bool(body.get("all_ifaces", False))
        # Auth pre-check: for key-based SSH, fail fast before spawning device threads.
        # Saves 30–120s of per-device SSH timeouts when arista-ssh cert has expired.
        if METHOD == "ssh" and not _SSHPASS_BIN and not _ASKPASS_SCRIPT:
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
            # ipMap values are {ip, ports:[...]} dicts
            results = {dev: None for dev in ip_map}
            lock    = threading.Lock()
            sem     = threading.Semaphore(MAX_WORKERS)
            def run_reconcile(dev, entry):
                ip             = (entry.get("ip") or "").strip()
                expected_ports = entry.get("ports", [])
                if not ip:
                    with lock: results[dev] = {"ok": False, "error": "No IP configured"}
                    return
                with sem:
                    try:
                        res = self._reconcile_device(ip, expected_ports)
                        with lock: results[dev] = res
                    except subprocess.TimeoutExpired:
                        with lock: results[dev] = {"ok": False, "error": f"Timeout — {ip} unreachable?"}
                    except Exception as e:
                        with lock: results[dev] = {"ok": False, "error": str(e)[:120]}
            threads = [threading.Thread(target=run_reconcile, args=(d, v), daemon=True)
                       for d, v in ip_map.items()]
            for t in threads: t.start()
            for t in threads: t.join(timeout=TIMEOUT + 5)
            with lock:
                for dev in results:
                    if results[dev] is None:
                        results[dev] = {"ok": False, "error": "Reconcile timed out"}
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
            results = {dev: None for dev in ip_map}
            lock    = threading.Lock()
            sem     = threading.Semaphore(MAX_WORKERS)
            def run_push(dev, entry):
                ip     = (entry.get("ip") or "").strip()
                config = entry.get("config", "")
                if not ip:
                    with lock: results[dev] = {"ok": False, "error": "No IP configured"}
                    return
                with sem:
                    for attempt in range(PUSH_RETRIES + 1):
                        try:
                            res = self._push_config(ip, config, dry_run=dry_run,
                                                    open_only=open_session,
                                                    all_ifaces=all_ifaces)
                            with lock: results[dev] = res
                            break
                        except subprocess.TimeoutExpired:
                            if attempt < PUSH_RETRIES:
                                if VERBOSE: print(f"  [push] {dev} ({ip}): timeout, retrying (attempt {attempt+1})")
                                time.sleep(PUSH_RETRY_DELAY); continue
                            if VERBOSE: print(f"  [push] {dev} ({ip}): timeout after {PUSH_RETRIES+1} attempts")
                            with lock: results[dev] = {"ok": False, "error": f"Timeout — {ip} unreachable?"}
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
                        results[dev] = {
                            "ok": False,
                            "error": "Push timed out — verify config was applied manually",
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
            exec_cmd = ([*base, "-J", JUMP_HOST, f"{SSH_USER}@{ip}", eos_cmd]
                        if JUMP_HOST else
                        [*base, f"{SSH_USER}@{ip}", eos_cmd])
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
        url     = f"https://{ip}:{EAPI_PORT}/command-api"
        payload = json.dumps({
            "jsonrpc": "2.0", "method": "runCmds",
            "params":  {"version": 1, "cmds": list(cmds), "format": "json"},
            "id":      1,
        }).encode()
        creds = base64.b64encode(f"{EAPI_USER}:{EAPI_PASS}".encode()).decode()
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
        Returns list of raw text output strings, one per command."""
        url     = f"https://{ip}:{EAPI_PORT}/command-api"
        payload = json.dumps({
            "jsonrpc": "2.0", "method": "runCmds",
            "params":  {"version": 1, "cmds": list(cmds), "format": "text"},
            "id":      1,
        }).encode()
        creds = base64.b64encode(f"{EAPI_USER}:{EAPI_PASS}".encode()).decode()
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
        cmd = ([*base, "-J", JUMP_HOST, f"{SSH_USER}@{ip}"]
               if JUMP_HOST else
               [*base, f"{SSH_USER}@{ip}"])
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
        if METHOD not in ("ssh", "eapi"):
            return []
        # Get current session list
        if METHOD == "ssh":
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
        if METHOD == "ssh":
            self._ssh_stdin(ip, *abort_cmds, force_tty=True)
        else:
            self._eapi_push(ip, *abort_cmds)
        return stale

    # ── Config push via configure session ────────────────────────────────────
    def _push_config(self, ip, config_text, dry_run=False, open_only=False, all_ifaces=False):
        """Push config_text to device using a uniquely-named EOS configure session.

        Modes:
          open_only=True  — push config, get diff, leave session PENDING on EOS
                            (no commit/abort). Returns session_name so the caller
                            can commit or abort later via _finalize_session().
                            Use this for the two-phase confirm modal flow.
          dry_run=True    — push config, get diff, abort session (verify path).
          default         — push config, get diff, commit immediately.

        all_ifaces=True — before building core_cmds, query the device for #TA-tagged
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
        cleaned = _prepend_section_cleaners(config_text)
        lines = [l for l in cleaned.strip().split('\n') if l.strip()]
        if not lines:
            raise RuntimeError("Config is empty — nothing to push")

        # Pre-cleanup stale sessions when committing or opening (both leave/left sessions
        # pending). Skip on dry_run — session is aborted immediately, can't become stale.
        if not dry_run:
            def _safe_abort():
                try:
                    self._abort_stale_sessions(ip)
                except Exception as e:
                    if VERBOSE: print(f"  [cleanup] {ip}: stale-session cleanup failed — {e}")
            _ct = threading.Thread(target=_safe_abort, daemon=True)
            _ct.start()
            _ct.join(timeout=TIMEOUT)

        # Prepend cleanup for orphan #TA interfaces not present in this push.
        # Best-effort — failures are silently ignored so a query error never blocks push.
        if all_ifaces and not dry_run:
            orphan_cmds = self._find_ta_orphans(ip, config_text)
            if orphan_cmds:
                lines = orphan_cmds + lines

        # Prepend 'no router bgp <old_asn>' when the ASN has changed. EOS cannot
        # change the AS number in-place — old block must be removed first.
        # Best-effort; runs on any push (not just all_ifaces) in case config_text
        # includes BGP from a port-specific push. Returns ([], None) when no BGP or no change.
        asn_changed = None
        if not dry_run:
            bgp_asn_cmds, asn_changed = self._find_bgp_asn_change(ip, config_text)
            if bgp_asn_cmds:
                lines = bgp_asn_cmds + lines

        session   = f"topoassist_{int(time.time())}"
        final_cmd = "abort" if dry_run else "commit"
        _asn_extra = {"asn_changed": asn_changed} if asn_changed else {}

        # 'end' exits from any sub-mode depth to exec mode (session stays pending).
        # Re-entering puts us at session root so show/commit/abort all work correctly.
        #
        # open_only: omit the final command entirely — SSH stdin closes naturally (EOF).
        # EOS leaves the session PENDING without any explicit exit/commit/abort.
        # Sending 'exit' as the final command can cause EOS to close the SSH stream
        # before the 'show session-config diffs' output is fully flushed, resulting
        # in an empty diff being captured.
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

        if METHOD == "eapi":
            results = self._eapi_push(ip, *core_cmds)
            if open_only:
                diff = results[-1].strip() if results else ""  # last cmd is show diffs
            else:
                diff = results[-2].strip() if len(results) >= 2 else ""
            if open_only:
                return {"ok": True, "diff": diff, "session_name": session, **_asn_extra}
            return {"ok": True, "diff": diff, "dry_run": dry_run, **_asn_extra}

        if METHOD == "ssh":
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
            diff = _extract_session_diff(output)
            if open_only:
                diff_lines = len([l for l in diff.splitlines() if l.strip()]) if diff else 0
                if VERBOSE: print(f"  [push] {ip}: session {session} open (pending) — {diff_lines} diff line(s)")
                return {"ok": True, "diff": diff, "session_name": session, **_asn_extra}
            action = "dry-run (aborted)" if dry_run else "committed"
            diff_lines = len([l for l in diff.splitlines() if l.strip()]) if diff else 0
            if VERBOSE: print(f"  [push] {ip}: session {session} {action} — {diff_lines} diff line(s)")
            return {"ok": True, "diff": diff, "dry_run": dry_run, **_asn_extra}

        raise NotImplementedError(
            f"Config push not supported for METHOD={METHOD!r} — use ssh or eapi")

    def _finalize_session(self, ip, session_name, action):
        """Commit or abort an existing named configure session on the device.

        Used as Phase 2 of the two-phase push modal: Phase 1 opens the session
        and gets the diff; Phase 2 calls this to commit or abort without
        re-pushing any config lines — a single short SSH round-trip.

        action: 'commit' or 'abort'
        Returns {"ok": True, "action": action} on success."""
        if action not in ("commit", "abort"):
            raise ValueError(f"Invalid finalize action: {action!r}")

        if METHOD == "ssh":
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

        if METHOD == "eapi":
            # Verify session still exists before committing: eAPI creates an empty session
            # for unknown names, so we'd silently commit nothing without this check.
            check = self._eapi_push(ip, "show configuration sessions")
            check_out = check[0] if check else ""
            if session_name not in check_out:
                raise RuntimeError(
                    f"Configure session '{session_name}' not found — "
                    "it may have timed out on the device. Push again.")
            self._eapi_push(ip, f"configure session {session_name}", action)
            if VERBOSE: print(f"  [finalize] {ip}: session {session_name} {action}ed (eapi)")
            return {"ok": True, "action": action}

        raise NotImplementedError(
            f"Finalize not supported for METHOD={METHOD!r} — use ssh or eapi")

    # ── Dispatch: run EOS show commands via active METHOD ─────────────────────
    def _run_cmds(self, ip, *cmds):
        # _ssh_cmds returns (results, cmd_errors); _eapi_cmds raises on failure
        # so wrap it to match the same tuple signature.
        if METHOD == "ssh":  return self._ssh_cmds(ip, *cmds)
        if METHOD == "eapi": return self._eapi_cmds(ip, *cmds), {}
        raise NotImplementedError(f"_run_cmds not supported for METHOD={METHOD!r}")

    # ── Per-device checks ─────────────────────────────────────────────────────
    def _check_lldp(self, ip):
        if METHOD in ("ssh", "eapi"):
            (data,), cmd_errors = self._run_cmds(ip, "show lldp neighbors detail")
            if cmd_errors:
                raise list(cmd_errors.values())[0]   # partial LLDP is unusable — re-raise
            return {"ok": True, "neighbors": _normalize_lldp_neighbors(data.get("lldpNeighbors", {}))}

        if METHOD == "rest":
            raw = self._rest_get(ip, "openconfig-lldp:lldp/interfaces")
            return {"ok": True, "neighbors": _oc_lldp_to_eos(raw)}

        if METHOD == "gnmi":
            raw = _gnmi_val(self._gnmi_get(ip, "openconfig-lldp:lldp")[0])
            return {"ok": True, "neighbors": _oc_lldp_to_eos(raw)}

        raise RuntimeError(f"Unknown METHOD: {METHOD!r}")

    def _check_devstatus(self, ip):
        if METHOD in ("ssh", "eapi"):
            (ver, ifs, ivlans), cmd_errors = self._run_cmds(
                ip, "show version", "show interfaces status", "show vlan internal usage"
            )
            result = _build_devstatus_ssh(ver, ifs, ivlans)
            if cmd_errors:
                def _fmt(e):
                    if isinstance(e, subprocess.CalledProcessError):
                        return f"exit {e.returncode}"
                    if isinstance(e, subprocess.TimeoutExpired):
                        return "timeout"
                    return str(e)[:80]
                result["cmdErrors"] = {cmd: _fmt(exc) for cmd, exc in cmd_errors.items()}
            return result

        if METHOD == "rest":
            plat_raw  = self._rest_get(ip, "openconfig-platform:components")
            iface_raw = self._rest_get(ip, "openconfig-interfaces:interfaces")
            return {
                "ok":         True,
                "version":    _oc_version(plat_raw),
                "platform":   _oc_platform(plat_raw),
                "interfaces": _oc_iface_status(iface_raw),
            }

        if METHOD == "gnmi":
            plat_r, iface_r = self._gnmi_get(
                ip,
                "openconfig-platform:components",
                "openconfig-interfaces:interfaces",
            )
            return {
                "ok":         True,
                "version":    _oc_version(_gnmi_val(plat_r)),
                "platform":   _oc_platform(_gnmi_val(plat_r)),
                "interfaces": _oc_iface_status(_gnmi_val(iface_r)),
            }

        raise RuntimeError(f"Unknown METHOD: {METHOD!r}")

    # ── Orphan detection ──────────────────────────────────────────────────────
    def _find_ta_orphans(self, ip, config_text):
        """Return EOS cleanup commands for #TA-tagged interfaces on the device
        that are NOT present in config_text.  Called before a full-device push
        so orphans are cleaned up in the same configure session.

        Physical/PO orphans → `default interface X`
        Sub-interface / SVI orphans → `no interface X`
        Skips: Loopback, Management, Vxlan, Vlan4093/4094 (system interfaces).
        Returns [] on any query failure — orphan cleanup is best-effort.
        """
        try:
            (raw,), _ = self._run_cmds(ip, "show interfaces description")
        except Exception:
            return []
        iface_descs = raw.get("interfaceDescriptions", {})

        # Collect abbreviated names of interfaces explicitly configured in config_text
        config_ifaces = set()
        for line in config_text.split('\n'):
            m = re.match(r'^interface\s+(\S+)', line, re.IGNORECASE)
            if m:
                config_ifaces.add(_norm_iface(m.group(1)))

        cleanup = []
        for name, info in iface_descs.items():
            if _TA_ORPHAN_SKIP_RE.match(name):
                continue
            if '#TA' not in info.get('description', ''):
                continue
            if _norm_iface(name) in config_ifaces:
                continue  # still in topology — not an orphan
            if '.' in name or re.match(r'^vlan\d+$', name, re.IGNORECASE):
                cleanup.append(f'no interface {name}')
            else:
                cleanup.append(f'default interface {name}')
        return cleanup

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

        try:
            (summary,), _ = self._run_cmds(ip, "show ip bgp summary")
        except Exception:
            return [], None
        # EOS nests AS under vrfs.<vrf>.as — not at the top level
        vrfs = summary.get("vrfs", {})
        old_asn = next((v.get("as") for v in vrfs.values() if v.get("as")), None)
        if not old_asn:
            return [], None  # BGP not configured on device yet
        old_asn = int(old_asn)
        if old_asn == new_asn:
            return [], None
        if VERBOSE:
            print(f"  [bgp-asn] {ip}: ASN change {old_asn} → {new_asn} — prepending no router bgp {old_asn}")
        return [f"no router bgp {old_asn}"], {"from": old_asn, "to": new_asn}

    # ── Reconcile ─────────────────────────────────────────────────────────────
    def _reconcile_device(self, ip, expected_ports):
        """SSH to device, find #TA-tagged interfaces not in expected_ports.

        Returns:
          { ok, ta_total, matched, orphans: [{name, description, linkStatus, protocol}] }

        Skips: Loopback*, Management*, Vxlan*, Vlan4093, Vlan4094
        (these are device-level, not per-link, and are never #TA-tagged by generateConfig).
        """
        _SKIP_RE = re.compile(
            r'^(?:Loopback|Management|Vxlan)\d|^Vlan409[34]$',
            re.IGNORECASE,
        )

        (raw,), _ = self._run_cmds(ip, "show interfaces description")
        lines = raw.get("interfaceDescriptions", {})
        # EOS returns a dict keyed by interface name
        ta_ifaces = []
        for name, info in lines.items():
            if _SKIP_RE.match(name):
                continue
            desc = info.get("description", "")
            if "#TA" not in desc:
                continue
            ta_ifaces.append({
                "name":        name,
                "description": desc,
                "linkStatus":  info.get("lineProtocolStatus", info.get("interfaceStatus", "")),
                "protocol":    info.get("lineProtocolStatus", ""),
            })

        # Normalise expected ports to abbreviated lowercase for comparison
        expected_set = {_norm_iface(p) for p in expected_ports}

        orphans = [
            iface for iface in ta_ifaces
            if _norm_iface(iface["name"]) not in expected_set
        ]

        return {
            "ok":       True,
            "ta_total": len(ta_ifaces),
            "matched":  len(ta_ifaces) - len(orphans),
            "orphans":  orphans,
        }

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
  Usage: python device_bridge.py [-u USER] [-b JUMP_HOST] [-t TIMEOUT] [-P PUSH_TIMEOUT] [-v] [-h]

  Options:
    -u USER       SSH username          default: admin
    -b JUMP_HOST  Jump host for SSH     default: bus-home
                  Use -b "" for direct SSH (no jump host)
    -t TIMEOUT    Per-device timeout    default: 15  (seconds)
                  Used for show/LLDP/devstatus queries. Keep small so
                  unreachable devices fail fast.
    -P TIMEOUT    Push timeout          default: max(t*4, 300)  (seconds)
                  Used for configure-session pushes (>5 cmds). Increase
                  for large configs (10k+ lines). Example: -P 600
    -v            Verbose — print SSH connect, session, retry, error, and timeout logs
    -h            Show this help and exit

  Examples:
    python device_bridge.py -u root -b jumphost -t 30 -v
    python device_bridge.py -u admin -b ""             # direct SSH, no jump
    python device_bridge.py -t 30 -P 600              # large-config push headroom
""")
        sys.exit(0)

    server    = HTTPServer(("127.0.0.1", PORT), BridgeHandler)
    jump_info = f"via {JUMP_HOST}" if JUMP_HOST else "direct"
    gnmi_note = "" if HAS_GNMI else " (pygnmi not installed)"
    print(f"\n  TopoAssist Device Bridge  v{VERSION}")
    print(f"  ─────────────────────────────────────")
    print(f"  Listening : http://localhost:{PORT}")
    print(f"  Transport : {METHOD.upper()}")
    if METHOD == "ssh":
        _auth_mode = ("empty-password (sshpass)"    if _SSHPASS_BIN    else
                      "empty-password (SSH_ASKPASS)" if _ASKPASS_SCRIPT else
                      "key-based (arista-ssh)")
        print(f"  SSH user  : {SSH_USER}  auth: {_auth_mode}")
        print(f"  Jump host : {JUMP_HOST or '(none — direct SSH)'}")
        print(f"  Mode      : {jump_info}")
    elif METHOD == "eapi":
        print(f"  eAPI user : {EAPI_USER}  port: {EAPI_PORT}")
    elif METHOD == "rest":
        print(f"  REST user : {REST_USER}  port: {REST_PORT}")
    elif METHOD == "gnmi":
        print(f"  gNMI user : {GNMI_USER}  port: {GNMI_PORT}{gnmi_note}")
    print(f"  Timeout   : {TIMEOUT}s (queries: -t)  |  Push: {PUSH_TIMEOUT}s (-P)")
    print(f"  Verbose   : {'ON (SSH + session logs)' if VERBOSE else 'OFF (run with -v to enable)'}")
    print(f"  Endpoints : /health  /lldp  /devstatus  /pushconfig  /reconcile")
    print(f"  Options   : -u USER  -b JUMP_HOST  -t TIMEOUT  -P PUSH_TIMEOUT  -v  (run -h for details)")
    print(f"  ─────────────────────────────────────")
    print(f"  Keep this terminal open while using")
    print(f"  Device Bridge in the sidebar.")
    print(f"  Ctrl+C to stop.\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Bridge stopped.")
        sys.exit(0)
