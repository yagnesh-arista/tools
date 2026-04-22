#!/usr/bin/env python3
# topoassist v260422.28 | 2026-04-22 13:32:00
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
  GET  /health      → {"status":"ok","version":"260422.1","port":8765}
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

def _ssh_base():
    """Return the base SSH command list.
    sshpass (Linux): supplies empty password via wrapper binary.
    SSH_ASKPASS shim (macOS/no sshpass): SSH_ASKPASS env supplies empty password.
    Fallback: key-based auth via BatchMode=yes."""
    if _SSHPASS_BIN:
        return [_SSHPASS_BIN, "-p", "", "ssh",
                "-o", "StrictHostKeyChecking=no",
                "-o", "PasswordAuthentication=yes",
                "-o", "PubkeyAuthentication=no",
                "-o", "ConnectTimeout=8"]
    if _ASKPASS_SCRIPT:
        return ["ssh",
                "-o", "StrictHostKeyChecking=no",
                "-o", "BatchMode=no",
                "-o", "PasswordAuthentication=yes",
                "-o", "PubkeyAuthentication=no",
                "-o", "NumberOfPasswordPrompts=1",
                "-o", "ConnectTimeout=8"]
    return ["ssh",
            "-o", "StrictHostKeyChecking=no",
            "-o", "BatchMode=yes",
            "-o", "ConnectTimeout=8"]

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

VERSION           = "260422.17"
PORT              = 8765
# CLI flags (-u/-b/-t) take priority; env vars are the fallback.
_b        = _arg("-b")
SSH_USER  = _arg("-u") or os.environ.get("BRIDGE_SSH_USER",  "admin")
JUMP_HOST = _b         if _b is not None else os.environ.get("BRIDGE_JUMP_HOST", "bus-home")
TIMEOUT   = int(_arg("-t") or os.environ.get("BRIDGE_TIMEOUT", "15"))
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
      - Returns '' for an empty diff (no changes staged)."""
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
            # EOS echoes the committed/aborted command as "Prompt#commit" or
            # "Prompt#abort" — the '#' is part of the shell prompt, so this
            # is safe even if diff lines contain the words 'commit' or 'abort'.
            if '#commit' in s or '#abort' in s:
                break
            diff.append(s)
    return '\n'.join(diff).strip()


# ── Section-level cleaners for idempotent push ────────────────────────────────

_SECTION_CLEANERS = [
    # Physical interfaces (Ethernet1, Et4/1, breakouts) — Management excluded below
    (re.compile(r'^interface\s+((?:Ethernet|Et)\S+)$', re.I),   'default interface {0}'),
    # Port-Channel interfaces
    (re.compile(r'^interface\s+((?:Port-Channel|Po)\d+\S*)$', re.I), 'default interface {0}'),
    # Loopback interfaces (Loopback0 = router-id, Loopback1 = VTEP)
    (re.compile(r'^interface\s+(Loopback\d+)$', re.I),          'default interface {0}'),
    # VXLAN data-plane interface
    (re.compile(r'^interface\s+(Vxlan\d+)$', re.I),             'default interface {0}'),
    # SVI interfaces — cleans stale IPs when VLANs/subnets change
    (re.compile(r'^interface\s+(Vlan\d+)$', re.I),              'default interface {0}'),
    # BGP — removes stale neighbors/networks from previous topology state
    (re.compile(r'^router\s+bgp\s+(\d+)$', re.I),              'no router bgp {0}'),
    # OSPF
    (re.compile(r'^router\s+ospf\s+\d+$', re.I),               'no router ospf 1'),
    # MLAG
    (re.compile(r'^mlag\s+configuration$', re.I),               'no mlag configuration'),
]

# Management interfaces must never be defaulted — would kill SSH connectivity
_MGMT_IFACE_RE = re.compile(r'^interface\s+(?:Ma|Management)\d+', re.I)


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
            if METHOD == "ssh" and not _SSHPASS_BIN and not _ASKPASS_SCRIPT:
                auth = _check_ssh_agent()
                if auth["ok"]:
                    _ssh_auth["failures"] = 0
                    _ssh_auth["ok"]  = True
                    _ssh_auth["msg"] = ""
                health["auth"] = auth
            self._json(200, health)
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self):
        if self.path not in ("/lldp", "/devstatus", "/pushconfig"):
            self._json(404, {"error": "not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            body   = json.loads(self.rfile.read(length))
        except Exception:
            self._json(400, {"error": "invalid JSON body"})
            return
        ip_map   = body.get("ipMap", {})
        dry_run  = bool(body.get("dry_run", False))
        if self.path == "/lldp":
            self._json(200, self._run_parallel(ip_map, self._check_lldp))
        elif self.path == "/devstatus":
            self._json(200, self._run_parallel(ip_map, self._check_devstatus))
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
                            res = self._push_config(ip, config, dry_run=dry_run)
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
            # (_abort_stale_sessions thread join — up to min(5,TIMEOUT)=5s) THEN
            # _ssh_stdin communicate (up to TIMEOUT=15s), so per-attempt cost is
            # TIMEOUT + min(5, TIMEOUT), not just TIMEOUT.
            _abort_overhead = min(5, TIMEOUT)
            join_budget = (TIMEOUT + _abort_overhead) * (PUSH_RETRIES + 1) + PUSH_RETRY_DELAY * PUSH_RETRIES + 5
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

        if len(cmds) == 1:
            fetch(0, cmds[0])
        else:
            threads = [threading.Thread(target=fetch, args=(i, cmd))
                       for i, cmd in enumerate(cmds)]
            for t in threads: t.start()
            for t in threads: t.join(timeout=TIMEOUT)
        # Re-raise the first per-slot exception so _run_parallel sees the right
        # type (TimeoutExpired → "unreachable", CalledProcessError → "SSH failed").
        for exc in errors:
            if exc is not None:
                raise exc
        return results

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
    def _ssh_stdin(self, ip, *cmds):
        """Send commands to device via SSH stdin pipe.
        Returns (stdout_text, stderr_text) as decoded strings.
        Raises subprocess.TimeoutExpired if the device doesn't respond within
        TIMEOUT — caller is responsible for catching and handling."""
        stdin_text = '\n'.join(cmds) + '\n'
        # Label for verbose logging: skip "terminal length 0" prefix, use first real cmd
        _label = next((c for c in cmds if c != "terminal length 0"), cmds[0])
        if VERBOSE: print(f"  [stdin] {ip}: {_label} ({len(cmds)} cmd(s))", flush=True)
        base = _ssh_base()
        cmd = ([*base, "-J", JUMP_HOST, f"{SSH_USER}@{ip}"]
               if JUMP_HOST else
               [*base, f"{SSH_USER}@{ip}"])
        with subprocess.Popen(cmd,
                              stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                              stderr=subprocess.PIPE, env=_SSH_ENV) as proc:
            try:
                out, err = proc.communicate(stdin_text.encode(), timeout=TIMEOUT)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.communicate()   # drain; __exit__ will close pipes + wait
                if VERBOSE: print(f"  [stdin] {ip}: {_label} → timeout", flush=True)
                raise           # let caller decide — push path retries, cleanup swallows
        out_text = out.decode("utf-8", errors="replace")
        err_text = err.decode("utf-8", errors="replace")
        if VERBOSE:
            _auth_errs = ("permission denied", "authentication failed", "no route to host",
                          "connection refused", "connection timed out")
            if not out_text.strip() and any(k in err_text.lower() for k in _auth_errs):
                print(f"  [stdin] {ip}: {_label} → failed: {err_text.strip()[:80]}", flush=True)
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
            raw, _ = self._ssh_stdin(ip, "terminal length 0", "show configuration sessions")
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
            self._ssh_stdin(ip, *abort_cmds)
        else:
            self._eapi_push(ip, *abort_cmds)
        return stale

    # ── Config push via configure session ────────────────────────────────────
    def _push_config(self, ip, config_text, dry_run=False):
        """Push config_text to device using a uniquely-named EOS configure session.
        dry_run=True: aborts instead of committing — returns diff without applying.
        Returns {"ok": True, "diff": "<session diff text>", "dry_run": bool} on success.

        Session design:
          - Pre-cleanup: abort any stale pending topoassist_* sessions first so we
            never hit EOS's 5-session pending limit.
          - Unique name (topoassist_<epoch>) so a committed session can never block
            re-entry with 'Cannot enter session (already completed)'.
          - 'end' exits to exec mode from any sub-mode; re-entering the session lands
            at session root where show/commit/abort work. ('top' was tried but does not
            reliably navigate to session root — sessions accumulated as pending.)
          - 'terminal length 0' (SSH) suppresses --More-- pagination."""
        cleaned = _prepend_section_cleaners(config_text)
        lines = [l for l in cleaned.strip().split('\n') if l.strip()]
        if not lines:
            raise RuntimeError("Config is empty — nothing to push")

        # Pre-cleanup stale sessions only on commit pushes — dry_run always
        # aborts the session so it cannot leave a pending stale session behind.
        # Skipping on dry_run removes an entire SSH round-trip from the preview path.
        if not dry_run:
            def _safe_abort():
                try:
                    self._abort_stale_sessions(ip)
                except Exception as e:
                    if VERBOSE: print(f"  [cleanup] {ip}: stale-session cleanup failed — {e}")
            _ct = threading.Thread(target=_safe_abort, daemon=True)
            _ct.start()
            _ct.join(timeout=min(5, TIMEOUT))

        session   = f"topoassist_{int(time.time())}"
        final_cmd = "abort" if dry_run else "commit"

        # 'end' exits from any sub-mode depth to exec mode (session stays pending).
        # Re-entering puts us at session root so show/commit/abort all work correctly.
        core_cmds = (
            [f"configure session {session}"]
            + lines
            + ["end", f"configure session {session}", "show session-config diffs", final_cmd]
        )

        if METHOD == "eapi":
            results = self._eapi_push(ip, *core_cmds)
            diff = results[-2].strip() if len(results) >= 2 else ""
            return {"ok": True, "diff": diff, "dry_run": dry_run}

        if METHOD == "ssh":
            output, err_text = self._ssh_stdin(ip, "terminal length 0", *core_cmds)
            _auth_errs = ("permission denied", "authentication failed",
                          "no route to host", "connection refused",
                          "connection timed out", "host key verification failed")
            if not output.strip() and any(k in err_text.lower() for k in _auth_errs):
                raise RuntimeError(f"SSH failed: {err_text.strip()[:120]}")
            if VERBOSE: print(f"  [push] {ip}: SSH connected")
            if "maximum number of pending sessions" in output.lower():
                raise RuntimeError(
                    "EOS pending session limit reached — Device Bridge will auto-clean "
                    "on next push; or manually run: configure session <name> / abort")
            diff = _extract_session_diff(output)
            action = "dry-run (aborted)" if dry_run else "committed"
            diff_lines = len([l for l in diff.splitlines() if l.strip()]) if diff else 0
            if VERBOSE: print(f"  [push] {ip}: session {session} {action} — {diff_lines} diff line(s)")
            return {"ok": True, "diff": diff, "dry_run": dry_run}

        raise NotImplementedError(
            f"Config push not supported for METHOD={METHOD!r} — use ssh or eapi")

    # ── Dispatch: run EOS show commands via active METHOD ─────────────────────
    def _run_cmds(self, ip, *cmds):
        if METHOD == "ssh":  return self._ssh_cmds(ip, *cmds)
        if METHOD == "eapi": return self._eapi_cmds(ip, *cmds)
        raise NotImplementedError(f"_run_cmds not supported for METHOD={METHOD!r}")

    # ── Per-device checks ─────────────────────────────────────────────────────
    def _check_lldp(self, ip):
        if METHOD in ("ssh", "eapi"):
            data = self._run_cmds(ip, "show lldp neighbors detail")[0]
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
            ver, ifs, ivlans = self._run_cmds(
                ip, "show version", "show interfaces status", "show vlan internal usage"
            )
            return _build_devstatus_ssh(ver, ifs, ivlans)

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
                    with lock: results[dev] = {"ok": False, "error": f"SSH failed — check admin access on {ip}"}
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
  Usage: python device_bridge.py [-u USER] [-b JUMP_HOST] [-t TIMEOUT] [-v] [-h]

  Options:
    -u USER       SSH username          default: admin
    -b JUMP_HOST  Jump host for SSH     default: bus-home
                  Use -b "" for direct SSH (no jump host)
    -t TIMEOUT    Per-device timeout    default: 15  (seconds)
    -v            Verbose — print SSH connect, session, retry, error, and timeout logs
    -h            Show this help and exit

  Examples:
    python device_bridge.py -u root -b jumphost -t 30 -v
    python device_bridge.py -u admin -b ""             # direct SSH, no jump
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
    print(f"  Timeout   : {TIMEOUT}s per device")
    print(f"  Verbose   : {'ON (SSH + session logs)' if VERBOSE else 'OFF (run with -v to enable)'}")
    print(f"  Endpoints : /health  /lldp  /devstatus")
    print(f"  Options   : -u USER  -b JUMP_HOST  -t TIMEOUT  -v  (run -h for details)")
    print(f"  ─────────────────────────────────────")
    print(f"  Keep this terminal open while using")
    print(f"  Device Bridge in the sidebar.")
    print(f"  Ctrl+C to stop.\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Bridge stopped.")
        sys.exit(0)
