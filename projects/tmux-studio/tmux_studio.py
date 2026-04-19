#!/usr/bin/env python3
# tmux-studio v260420.1 | 2026-04-20 01:32:16 | git commit: 24977e6
Tmux Studio - Final Production Build
--------------------------------------------
Features:
1. Strict Structure Sync: Matches windows by Index, panes by Order.
2. Safe Save: Preserves offline items unless 'save -o' is used.
3. Destructive Restore: Recreates windows on name mismatch (with -o).
4. Auto-Reconnect: Detects dropped SSH sessions (shell vs ssh).
5. Layout Resilience: Forces Unzoom -> Tiled -> Layout application.
6. Checksum Logic: Ignores Pane IDs during layout comparison.
7. Safety: Blocks ambiguous "Restore" states if extras exist.
8. Transparency: Explicitly reports Merge vs Override mode after save.
"""

import argparse
import copy
import glob
import json
import os
import shutil
import subprocess
import sys
import time
import readline # Enables proper input handling (History/Arrows)
from datetime import datetime
from typing import Any, Dict, List, Set

# =============================================================================
# CONFIGURATION
# =============================================================================
DEFAULT_SSH_USER = "admin"
DEFAULT_JSON_FILENAME = "sessions.json"
STUDIO_DIR = os.path.join(os.path.expanduser("~"), ".tmux-studio")
CUSTOM_OVERRIDES: Dict[str, Dict[str, str]] = {}

TMUX_SEP = "\x1f"  # ASCII Unit Separator — safe in paths/commands unlike "|||"
SSH_PROCESS_NAMES = ["ssh", "sshpass", "mosh-client"]

class Colors:
    GREEN = "\033[92m"
    ORANGE = "\033[38;5;208m"
    RED = "\033[91m"
    DARK_RED = "\033[31m"
    BLUE = "\033[94m"
    CYAN = "\033[36m"
    YELLOW = "\033[33m"
    RESET = "\033[0m"

# =============================================================================
# STATUS MESSAGES (Direction-Aware)
# =============================================================================
# Category 1: Unchanged
STATUS_EXISTING = f"{Colors.BLUE}Matches Perfectly at JSON & TMUX (No Action){Colors.RESET}"

# Category 2: Save Mode (TMUX -> JSON)
SAVE_ADDED = f"{Colors.GREEN}Will be Added in JSON to match TMUX{Colors.RESET}"
SAVE_RENAMED = f"{Colors.ORANGE}Will be Renamed in JSON to match TMUX{Colors.RESET}"
SAVE_LAYOUT = f"{Colors.YELLOW}Will be a Layout change in JSON to match TMUX{Colors.RESET}"
SAVE_MISSING_KEEP = f"{Colors.ORANGE}Missing at TMUX (Will Keep in JSON){Colors.RESET}"
SAVE_MISSING_DELETE = f"{Colors.DARK_RED}Missing at TMUX (Will Delete from JSON){Colors.RESET}"

# Category 3: Restore Mode (JSON -> TMUX)
RESTORE_ADDED = f"{Colors.GREEN}Will be Added to TMUX from JSON{Colors.RESET}"
RESTORE_RENAMED = f"{Colors.ORANGE}Will be Renamed in TMUX to match JSON{Colors.RESET}"
RESTORE_LAYOUT = f"{Colors.YELLOW}Will be a Layout change in TMUX to match JSON{Colors.RESET}"
RESTORE_EXTRA_KEEP = f"{Colors.ORANGE}Missing at JSON (Will keep in TMUX){Colors.RESET}"
RESTORE_EXTRA_DELETE = f"{Colors.DARK_RED}Missing at JSON (Will Delete from TMUX){Colors.RESET}"

# =============================================================================
# JSON & BACKUP UTILITIES
# =============================================================================
def get_default_filepath() -> str:
    os.makedirs(STUDIO_DIR, exist_ok=True)
    return os.path.join(STUDIO_DIR, DEFAULT_JSON_FILENAME)

def normalize_loaded_data(data: Dict[str, Any]) -> Dict[str, Any]:
    """Ensures indices are strings to prevent type mismatch errors."""
    for session in data.get("sessions", []):
        for window in session.get("windows", []):
            window["window_index"] = str(window.get("window_index", "0"))
            for pane in window.get("panes", []):
                pane["pane_index"] = str(pane.get("pane_index", "0"))
    return data

def load_saved_layout(filepath: str) -> Dict[str, Any]:
    if os.path.exists(filepath):
        try:
            with open(filepath, "r") as f:
                data = json.load(f)
                if isinstance(data, dict) and "sessions" in data:
                    return normalize_loaded_data(data)
        except json.JSONDecodeError:
            print(f"{Colors.RED}FATAL: Error decoding JSON in {filepath}.{Colors.RESET}")
            print(f"{Colors.YELLOW}Please check the file or restore from a backup (.bak).{Colors.RESET}")
            sys.exit(1)
    return {"sessions": []}

def rotate_backups(filepath: str) -> None:
    if not os.path.exists(filepath):
        return
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_name = f"{filepath}.{timestamp}.bak"
    try:
        shutil.copy2(filepath, backup_name)
        print(f"Backup created: {backup_name}")
    except OSError as e:
        print(f"{Colors.YELLOW}Warning: Backup failed: {e}{Colors.RESET}")
    try:
        # Keep last 10 backups
        pattern = f"{filepath}.*.bak"
        backups = sorted(glob.glob(pattern))
        if len(backups) > 10:
            for b in backups[:-10]: os.remove(b)
    except OSError: pass

def write_json_to_disk(data: Dict[str, Any], filepath: str) -> None:
    try:
        with open(filepath, "w") as f:
            f.write(json.dumps(data, indent=2, sort_keys=True))
    except OSError as e:
        print(f"{Colors.RED}Failed to write file: {e}{Colors.RESET}")
        sys.exit(1)

# =============================================================================
# DATA LOOKUP & HELPERS
# =============================================================================
def get_layout_checksum(layout_str: str) -> str:
    """Extracts 'checksum,dimensions' from a layout string, ignoring pane IDs."""
    if not layout_str: return ""
    parts = layout_str.split(",")
    if len(parts) >= 2: return f"{parts[0]},{parts[1]}"
    return layout_str

def build_detailed_lookup(layout: Dict) -> Dict[str, Dict]:
    """
    Builds a flat map for deep content comparison.
    Key: Session|WindowIndex|PaneIndex
    """
    lookup = {}
    for s in layout.get("sessions", []):
        sname = s["session_name"]
        for w in s.get("windows", []):
            widx = str(w["window_index"])
            wname = w["window_name"]
            wlay = w.get("window_layout", "")
            wzoom = w.get("is_zoomed", False)
            for p in w.get("panes", []):
                pidx = str(p["pane_index"])
                ppath = p.get("pane_current_path", "")
                key = f"{sname}|{widx}|{pidx}"
                lookup[key] = {
                    "path": ppath,
                    "layout": wlay,
                    "zoomed": wzoom,
                    "window_name": wname,
                    "full_key_with_name": f"{sname}|{widx}|{wname}|{pidx}"
                }
    return lookup

# =============================================================================
# SAVE MERGE LOGIC (CRITICAL FOR SAFETY)
# =============================================================================
def merge_current_into_saved(saved: Dict, current: Dict) -> Dict:
    """
    Merges 'current' state into 'saved' state.
    Preserves windows/panes that exist in 'saved' but are missing in 'current' (Offline).
    """
    merged_sessions = {}
    # 1. Start with Saved data (to keep offline items)
    for s in saved.get("sessions", []):
        merged_sessions[s["session_name"]] = copy.deepcopy(s)
        w_map = {w["window_index"]: w for w in merged_sessions[s["session_name"]].get("windows", [])}
        merged_sessions[s["session_name"]]["windows_map"] = w_map

    # 2. Overlay Current data
    for s in current.get("sessions", []):
        s_name = s["session_name"]
        if s_name not in merged_sessions:
            merged_sessions[s_name] = s
            continue

        target_s = merged_sessions[s_name]
        target_w_map = target_s.get("windows_map", {})

        for w in s.get("windows", []):
            w_idx = w["window_index"]
            if w_idx not in target_w_map:
                target_w_map[w_idx] = w
            else:
                # Merge Panes: Keep current state, append missing offline panes
                saved_win = target_w_map[w_idx]
                merged_win = copy.deepcopy(w)
                current_pane_indices = {p["pane_index"] for p in w["panes"]}

                for saved_p in saved_win.get("panes", []):
                    if saved_p["pane_index"] not in current_pane_indices:
                        merged_win["panes"].append(saved_p)

                # If we restored offline panes, prefer the saved layout
                if len(merged_win["panes"]) > len(w["panes"]) and "window_layout" in saved_win:
                     merged_win["window_layout"] = saved_win["window_layout"]
                target_w_map[w_idx] = merged_win

        target_s["windows"] = list(target_w_map.values())
        if "windows_map" in target_s: del target_s["windows_map"]

    final_sessions = []
    for s in merged_sessions.values():
        if "windows_map" in s:
            s["windows"] = list(s["windows_map"].values())
            del s["windows_map"]
        s["windows"].sort(key=lambda x: int(x["window_index"]) if x["window_index"].isdigit() else 0)
        for w in s["windows"]:
            w["panes"].sort(key=lambda x: int(x["pane_index"]) if x["pane_index"].isdigit() else 0)
        final_sessions.append(s)

    # Return the merged dictionary
    return {"sessions": final_sessions}

# =============================================================================
# TMUX INTERFACE
# =============================================================================
def tmux_running() -> bool:
    try:
        subprocess.run(["tmux", "ls"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False

def get_tmux_layout() -> Dict[str, List[Dict[str, Any]]]:
    layout = {"sessions": []}
    fmt = (
        f"#{'{'}session_name{'}'}{TMUX_SEP}"
        f"#{'{'}window_index{'}'}{TMUX_SEP}"
        f"#{'{'}window_name{'}'}{TMUX_SEP}"
        f"#{'{'}window_layout{'}'}{TMUX_SEP}"
        f"#{'{'}window_active{'}'}{TMUX_SEP}"
        f"#{'{'}window_flags{'}'}{TMUX_SEP}"
        f"#{'{'}pane_index{'}'}{TMUX_SEP}"
        f"#{'{'}pane_current_path{'}'}{TMUX_SEP}"
        f"#{'{'}pane_active{'}'}{TMUX_SEP}"
        f"#{'{'}pane_current_command{'}'}"
    )
    try:
        result = subprocess.run(["tmux", "list-panes", "-a", "-F", fmt], capture_output=True, text=True, check=True)
        raw = result.stdout.strip()
    except subprocess.CalledProcessError:
        return layout

    if not raw: return layout

    sess_map = {}
    for line in raw.splitlines():
        parts = line.split(TMUX_SEP, 9)
        if len(parts) < 10: continue
        (s, widx, wname, wlay, wact, wflag, pidx, ppath, pact, pcmd) = parts

        if s not in sess_map: sess_map[s] = {"session_name": s, "windows": {}}
        wkey = str(widx)
        if wkey not in sess_map[s]["windows"]:
            sess_map[s]["windows"][wkey] = {
                "window_index": str(widx),
                "window_name": wname,
                "window_layout": wlay,
                "is_active": wact == "1",
                "is_zoomed": "Z" in wflag,
                "panes": []
            }
        sess_map[s]["windows"][wkey]["panes"].append({
            "pane_index": str(pidx),
            "pane_current_path": ppath,
            "pane_current_command": pcmd,
            "is_active": pact == "1"
        })

    for s in sess_map.values():
        w_list = list(s["windows"].values())
        w_list.sort(key=lambda x: int(x["window_index"]) if x["window_index"].isdigit() else 0)
        for w in w_list:
            w["panes"].sort(key=lambda x: int(x["pane_index"]) if x["pane_index"].isdigit() else 0)

            # Active Pane Normalization
            active_found = False
            for p in w["panes"]:
                if p["is_active"]:
                    if active_found: p["is_active"] = False
                    active_found = True

        layout["sessions"].append({"session_name": s["session_name"], "windows": w_list})
    layout["sessions"].sort(key=lambda x: x.get("session_name", ""))
    return layout

# =============================================================================
# COMPARISON REPORTING
# =============================================================================
def flatten_layout_items(layout: Dict[str, Any]) -> Dict[str, Dict[str, str]]:
    items = {}
    for session in layout.get("sessions", []):
        sname = session.get("session_name")
        for window in session.get("windows", []):
            wname = window.get("window_name")
            win_idx = str(window.get("window_index"))
            for pane in window.get("panes", []):
                pidx = str(pane.get("pane_index"))
                
                key = f"{sname}|{win_idx}|{pidx}"
                
                items[key] = {
                    "session": sname,
                    "window": wname,
                    "window_index": win_idx,
                    "pane": pidx
                }
    return items

def compare_flat_swp(saved: Dict, current: Dict, mode: str, overwrite: bool) -> Dict[str, int]:
    saved_items = flatten_layout_items(saved)
    curr_items = flatten_layout_items(current)
    saved_lookup = build_detailed_lookup(saved)
    curr_lookup = build_detailed_lookup(current)

    stats = {'added': 0, 'deleted': 0, 'renamed': 0, 'changed': 0, 'existing': 0, 'missing': 0, 'extras': 0}

    def sort_key(k):
        parts = k.split("|")
        return (parts[0], int(parts[1]) if parts[1].isdigit() else 0, int(parts[2]) if parts[2].isdigit() else 0)

    all_keys = sorted(list(set(saved_items.keys()) | set(curr_items.keys())), key=sort_key)
    prev_session, prev_win_idx = None, None

    print(f"\n{Colors.BLUE}=== Status Report ==={Colors.RESET}")

    for key in all_keys:
        s, win_idx, p = key.split("|")
        saved_entry = saved_items.get(key)
        curr_entry = curr_items.get(key)
        
        if saved_entry and curr_entry and saved_entry["window"] != curr_entry["window"]:
            display_w_name = f"{saved_entry['window']} -> {curr_entry['window']}"
        else:
            display_w_name = saved_entry["window"] if saved_entry else curr_entry["window"]

        if prev_session is not None and s != prev_session:
            print(f"\n{Colors.BLUE}{'='*40}{Colors.RESET}\n")
            prev_win_idx = None
        elif prev_win_idx is not None and win_idx != prev_win_idx:
            print(f"{Colors.BLUE}{'-'*20}{Colors.RESET}")

        status = ""
        lookup_id = f"{s}|{win_idx}|{p}"

        if key in saved_items and key in curr_items:
            # Explicit direction-aware strings for Rename and Layout Changes
            if saved_entry["window"] != curr_entry["window"]:
                status = SAVE_RENAMED if mode == "save" else RESTORE_RENAMED
                stats['renamed'] += 1
            else:
                s_obj = saved_lookup.get(lookup_id)
                c_obj = curr_lookup.get(lookup_id)
                has_change = False
                if s_obj and c_obj:
                    s_check = get_layout_checksum(s_obj["layout"])
                    c_check = get_layout_checksum(c_obj["layout"])
                    if s_check != c_check or s_obj["zoomed"] != c_obj["zoomed"]:
                        has_change = True

                if has_change:
                    status = SAVE_LAYOUT if mode == "save" else RESTORE_LAYOUT
                    stats['changed'] += 1
                else:
                    status = STATUS_EXISTING
                    stats['existing'] += 1

        elif key in saved_items and key not in curr_items:
            if mode == "save":
                if overwrite:
                    status = SAVE_MISSING_DELETE
                    stats['deleted'] += 1
                else:
                    status = SAVE_MISSING_KEEP
                    stats['missing'] += 1
            else:
                status = RESTORE_ADDED
                stats['added'] += 1
        elif key not in saved_items and key in curr_items:
            if mode == "save":
                status = SAVE_ADDED
                stats['added'] += 1
            else:
                if overwrite:
                    status = RESTORE_EXTRA_DELETE
                    stats['deleted'] += 1
                else:
                    status = RESTORE_EXTRA_KEEP
                    stats['extras'] += 1

        print(f"Session: {s} - Window: {display_w_name} (#{win_idx}) - Pane: {p} => {status}")
        prev_session, prev_win_idx = s, win_idx

    print("=======================\n")
    return stats

# =============================================================================
# HELPER: INTERACTIVE & SSH
# =============================================================================
def ask_confirmation(prompt: str) -> bool:
    while True:
        try:
            ans = input(f"{prompt} (y/n): ").strip().lower()
            if ans == 'y':
                return True
            elif ans == 'n':
                return False
            else:
                print(f"{Colors.YELLOW}Please enter 'y' or 'n'.{Colors.RESET}")
        except (EOFError, KeyboardInterrupt):
            return False

def get_ssh_cmd(window_name):
    if window_name in CUSTOM_OVERRIDES:
        c = CUSTOM_OVERRIDES[window_name]
        return f"ssh {c['user']}@{c['host']}"
    return f"ssh {DEFAULT_SSH_USER}@{window_name}"

def send_ssh(target, window_name):
    cmd = get_ssh_cmd(window_name)
    subprocess.run(["tmux", "send-keys", "-t", target, cmd, "C-m"])

# =============================================================================
# OPERATIONS: RESTORE
# =============================================================================
def restore_sessions_and_windows(saved_layout: Dict, overwrite: bool, enable_ssh: bool) -> Set[str]:
    current = get_tmux_layout()
    curr_sess_map = {s["session_name"]: s for s in current.get("sessions", [])}
    new_sessions = set()

    for sess in saved_layout.get("sessions", []):
        s_name = sess["session_name"]

        if s_name not in curr_sess_map:
            if not sess.get("windows"):
                print(f"{Colors.YELLOW}[Skip] Session '{s_name}' has no windows in JSON. Skipping.{Colors.RESET}")
                continue
            first_w = sess["windows"][0]
            target_idx = first_w["window_index"]
            subprocess.run(["tmux", "new-session", "-d", "-s", s_name, "-n", first_w["window_name"]])
            new_sessions.add(s_name)
            try:
                res = subprocess.run(["tmux", "list-windows", "-t", s_name, "-F", "#{window_index}"], capture_output=True, text=True, check=True)
                actual_idx = res.stdout.strip().splitlines()[0]
                if actual_idx != target_idx:
                    subprocess.run(["tmux", "move-window", "-s", f"{s_name}:{actual_idx}", "-t", f"{s_name}:{target_idx}"])
            except: pass

            print(f"Created Session: {s_name}")
            print(f"Created Window: {s_name}:{target_idx} ({first_w['window_name']})")
            if enable_ssh: send_ssh(f"{s_name}:{target_idx}", first_w["window_name"])

        try:
            res = subprocess.run(["tmux", "list-windows", "-t", s_name, "-F", f"#{{window_index}}{TMUX_SEP}#{{window_name}}"], capture_output=True, text=True, check=True)
            curr_wins = {}
            for line in res.stdout.strip().splitlines():
                p = line.split(TMUX_SEP, 1)
                if len(p)==2: curr_wins[p[0]] = p[1]
        except: curr_wins = {}

        for win in sess["windows"]:
            w_idx = str(win["window_index"])
            target_name = win["window_name"]
            if w_idx not in curr_wins:
                subprocess.run(["tmux", "new-window", "-d", "-t", f"{s_name}:{w_idx}", "-n", target_name])
                print(f"Created Window: {s_name}:{w_idx} ({target_name})")
                if enable_ssh: send_ssh(f"{s_name}:{w_idx}", target_name)
            elif overwrite:
                current_name = curr_wins[w_idx]
                if current_name != target_name:
                    print(f"[{s_name}:{w_idx}] Name Conflict ({current_name} -> {target_name}). Recreating...")
                    tmp_idx = str(900 + int(w_idx))
                    subprocess.run(["tmux", "move-window", "-s", f"{s_name}:{w_idx}", "-t", f"{s_name}:{tmp_idx}"], stderr=subprocess.DEVNULL)
                    subprocess.run(["tmux", "new-window", "-d", "-t", f"{s_name}:{w_idx}", "-n", target_name])
                    print(f"Created Replacement Window: {s_name}:{w_idx} ({target_name})")
                    if enable_ssh: send_ssh(f"{s_name}:{w_idx}", target_name)
                    subprocess.run(["tmux", "kill-window", "-t", f"{s_name}:{tmp_idx}"], stderr=subprocess.DEVNULL)
    return new_sessions

def sync_panes_structurally(saved_layout: Dict, overwrite: bool, new_sessions: Set[str], enable_ssh: bool):
    print("\n=== Syncing Structure (Panes) ===")
    for sess in saved_layout.get("sessions", []):
        s_name = sess["session_name"]
        for win in sess.get("windows", []):
            w_idx = str(win["window_index"])
            target = f"{s_name}:{w_idx}"
            saved_panes = win.get("panes", [])
            target_count = len(saved_panes)

            try:
                res = subprocess.run(["tmux", "list-panes", "-t", target, "-F", "#{pane_id}"], capture_output=True, text=True, check=True)
                actual_pane_ids = res.stdout.strip().splitlines()
            except Exception: continue

            if len(actual_pane_ids) < target_count:
                needed = target_count - len(actual_pane_ids)
                print(f"[{target}] Expanding: Adding {needed} panes...")
                for _ in range(needed):
                    subprocess.run(["tmux", "split-window", "-t", target, "-d"], stderr=subprocess.DEVNULL)
                    subprocess.run(["tmux", "select-layout", "-t", target, "tiled"], stderr=subprocess.DEVNULL)
                res = subprocess.run(["tmux", "list-panes", "-t", target, "-F", "#{pane_id}"], capture_output=True, text=True, check=True)
                actual_pane_ids = res.stdout.strip().splitlines()

            is_strict = overwrite or (s_name in new_sessions)
            if is_strict and len(actual_pane_ids) > target_count:
                print(f"[{target}] Shrinking: Removing {len(actual_pane_ids) - target_count} extra panes...")
                for pk in actual_pane_ids[target_count:]:
                    subprocess.run(["tmux", "kill-pane", "-t", pk])
                actual_pane_ids = actual_pane_ids[:target_count]

            if enable_ssh:
                for i in range(min(len(saved_panes), len(actual_pane_ids))):
                    p_id = actual_pane_ids[i]
                    try:
                        res = subprocess.run(["tmux", "display-message", "-p", "-t", p_id, "#{pane_current_command}"], capture_output=True, text=True, check=True)
                        p_cmd = res.stdout.strip().lower()
                    except Exception: p_cmd = ""
                    is_ssh = any(x in p_cmd for x in SSH_PROCESS_NAMES)
                    if not is_ssh:
                        w_host_name = win["window_name"]
                        print(f"[{Colors.ORANGE}Connect{Colors.RESET}] {target} Pane #{i+1} -> SSH {w_host_name}")
                        send_ssh(p_id, w_host_name)

            # FORCE UNZOOM AND APPLY LAYOUT
            subprocess.run(["tmux", "resize-pane", "-t", target, "-Z"], stderr=subprocess.DEVNULL)

            if "window_layout" in win:
                subprocess.run(["tmux", "select-layout", "-t", target, "tiled"], stderr=subprocess.DEVNULL)
                print(f"[{target}] Applying Layout...")
                subprocess.run(["tmux", "select-layout", "-t", target, win["window_layout"]], stderr=subprocess.DEVNULL)

                try:
                    res = subprocess.run(["tmux", "display-message", "-p", "-t", target, "#{window_layout}"], capture_output=True, text=True, check=True)
                    new_layout = res.stdout.strip()
                    if get_layout_checksum(new_layout) != get_layout_checksum(win["window_layout"]):
                        time.sleep(0.2)
                        subprocess.run(["tmux", "select-layout", "-t", target, win["window_layout"]], stderr=subprocess.DEVNULL)
                        res = subprocess.run(["tmux", "display-message", "-p", "-t", target, "#{window_layout}"], capture_output=True, text=True, check=True)
                        new_layout = res.stdout.strip()
                        if get_layout_checksum(new_layout) != get_layout_checksum(win["window_layout"]):
                            print(f"{Colors.YELLOW}[!] Layout mismatch persists. Terminal size differs from saved state.{Colors.RESET}")
                            print(f"{Colors.YELLOW}    Run 'save' to update file to current dimensions.{Colors.RESET}")
                except Exception: pass

            if win.get("is_zoomed"):
                subprocess.run(["tmux", "resize-pane", "-t", target, "-Z"], stderr=subprocess.DEVNULL)

            if actual_pane_ids:
                subprocess.run(["tmux", "select-pane", "-t", actual_pane_ids[-1]], stderr=subprocess.DEVNULL)

def cleanup_extras(saved_layout: Dict, protected_sessions: Set[str] = None):
    if protected_sessions is None:
        protected_sessions = set()
        
    saved_s_names = {s["session_name"] for s in saved_layout.get("sessions", [])}
    # Protect sessions that are in the JSON file but were skipped during this restore
    safe_sessions = saved_s_names.union(protected_sessions)
    
    current = get_tmux_layout()
    print("\n=== Cleaning Up Extras ===")
    for sess in current.get("sessions", []):
        s_name = sess["session_name"]
        
        # Kill the session ONLY if it's not in the JSON file at all
        if s_name not in safe_sessions:
            print(f"{Colors.DARK_RED}Deleting Extra Session: {s_name}{Colors.RESET}")
            subprocess.run(["tmux", "kill-session", "-t", s_name])
            continue
            
        # If we skipped this session during restore, don't clean up its windows
        if s_name not in saved_s_names:
            continue
            
        saved_s = next((s for s in saved_layout["sessions"] if s["session_name"] == s_name), None)
        if not saved_s: continue
        saved_win_indices = {str(w["window_index"]) for w in saved_s.get("windows", [])}
        for win in sess.get("windows", []):
            w_idx = str(win["window_index"])
            if w_idx not in saved_win_indices:
                print(f"{Colors.DARK_RED}Deleting Extra Window: {s_name}:{w_idx} ({win['window_name']}){Colors.RESET}")
                subprocess.run(["tmux", "kill-window", "-t", f"{s_name}:{w_idx}"])

# =============================================================================
# COMMANDS
# =============================================================================
def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd")
    sub.required = True

    p_save = sub.add_parser("save")
    p_save.add_argument("-o", "--override", action="store_true")
    p_save.add_argument("-f", "--file", default=get_default_filepath())

    p_rest = sub.add_parser("restore")
    p_rest.add_argument("-o", "--override", action="store_true")
    p_rest.add_argument("--ssh", action="store_true", help="Auto-SSH into restored panes without prompting")
    p_rest.add_argument("-f", "--file", default=get_default_filepath())

    p_manage = sub.add_parser("manage")
    p_manage.add_argument("-f", "--file", default=get_default_filepath())

    args = parser.parse_args()
    abs_path = os.path.abspath(args.file)

    try:
        if args.cmd == "save":
            if not tmux_running():
                print(f"{Colors.RED}No Tmux running{Colors.RESET}"); sys.exit(1)

            print(f"{Colors.BLUE}Reading tmux state...{Colors.RESET}")
            current = get_tmux_layout()
            saved = load_saved_layout(args.file)
            stats = compare_flat_swp(saved, current, mode="save", overwrite=args.override)

            allow_add = False
            allow_delete = False
            allow_update = False

            # Prompt 1: Add (Green)
            if stats['added'] > 0:
                if ask_confirmation(f'Proceed with saving the session/window/pane with "{SAVE_ADDED}" comment?'):
                    allow_add = True

            # Prompt 2: Delete (Red)
            if stats['deleted'] > 0:
                if ask_confirmation(f'Proceed with deleting the session/window/pane with "{SAVE_MISSING_DELETE}" comment?'):
                    allow_delete = True
                else:
                    args.override = False

            # Prompt 3: Changes (Yellow)
            if stats['changed'] > 0 or stats['renamed'] > 0:
                if stats['missing'] > 0 and not args.override:
                    print(f"{Colors.YELLOW}Warning: Detected changes AND items missing in Tmux.{Colors.RESET}")
                    print(f"Standard 'save' will update layouts but {Colors.ORANGE}KEEP{Colors.RESET} missing items in JSON.")
                    print(f"To delete them, run: {Colors.CYAN}tmux-studio save -o{Colors.RESET}")

                    if ask_confirmation(f'Proceed with saving ONLY changes (keeping missing items)?'):
                        allow_update = True
                else:
                    msg = SAVE_RENAMED if stats['renamed'] > 0 else SAVE_LAYOUT
                    if ask_confirmation(f'Proceed with saving the session/window/pane with "{msg}" comment?'):
                        allow_update = True

            if allow_add or allow_delete or allow_update:
                final_data = current if args.override else merge_current_into_saved(saved, current)
                rotate_backups(args.file)
                write_json_to_disk(final_data, args.file)
                print(f"{Colors.CYAN}Saved to: {abs_path}{Colors.RESET}")

                if not args.override:
                     print(f"{Colors.BLUE}[Mode] MERGE: Updated file while preserving offline items.{Colors.RESET}")
                else:
                     print(f"{Colors.BLUE}[Mode] OVERRIDE: Synced exact state (Deleted offline items).{Colors.RESET}")
            else:
                print(f"\n{Colors.GREEN}[INFO] No changes confirmed. Skipping save.{Colors.RESET}")

        elif args.cmd == "restore":
            if not os.path.exists(args.file):
                print(f"{Colors.RED}File not found: {args.file}{Colors.RESET}"); sys.exit(1)

            saved = load_saved_layout(args.file)
            
            # --- Interactive Session Selection ---
            original_saved_sessions = {s["session_name"] for s in saved.get("sessions", [])}
            
            if len(saved.get("sessions", [])) > 1:
                print(f"\n{Colors.BLUE}Available Sessions in '{args.file}':{Colors.RESET}")
                for i, sess in enumerate(saved["sessions"], 1):
                    print(f"  {Colors.CYAN}{i}.{Colors.RESET} {sess['session_name']}")
                
                while True:
                    try:
                        choice = input(f"\nSelect sessions to restore (0 for all, e.g., '1,3' or '2'): ").strip()
                        if not choice or choice == '0':
                            break  # Keep all sessions
                        
                        selected_indices = [int(x.strip()) for x in choice.split(',') if x.strip()]
                        valid_indices = range(1, len(saved["sessions"]) + 1)
                        
                        if all(idx in valid_indices for idx in selected_indices):
                            # Filter saved layout to ONLY include selected sessions
                            saved["sessions"] = [saved["sessions"][i-1] for i in selected_indices]
                            break
                        else:
                            print(f"{Colors.RED}Invalid selection. Use numbers between 1 and {len(saved['sessions'])}.{Colors.RESET}")
                    except ValueError:
                        print(f"{Colors.RED}Invalid format. Enter 0, or comma-separated numbers (e.g., 1,3).{Colors.RESET}")
            # ------------------------------------------

            print(f"{Colors.BLUE}Reading current tmux state...{Colors.RESET}")
            current = get_tmux_layout()

            saved_session_names = {s["session_name"] for s in saved.get("sessions", [])}
            extra_tmux_sessions = [s["session_name"] for s in current.get("sessions", []) if s["session_name"] not in saved_session_names]
            if extra_tmux_sessions:
                print(f"{Colors.YELLOW}[Info] Extra tmux sessions outside restore scope: {extra_tmux_sessions}{Colors.RESET}")

            # Filter 'current' so we only compare the sessions we selected to restore
            current["sessions"] = [s for s in current.get("sessions", []) if s["session_name"] in saved_session_names]

            stats = compare_flat_swp(saved, current, mode="restore", overwrite=args.override)

            perform_add = False
            perform_update = False
            enable_ssh = False
            do_override = args.override  # local flag; never mutate args.override

            # Strict Conflict Check
            if not do_override and stats['extras'] > 0 and stats['changed'] > 0:
                 print(f"\n{Colors.RED}Conflict: Changes detected alongside Extra items.{Colors.RESET}")
                 print(f"Please use {Colors.CYAN}tmux-studio restore -o{Colors.RESET} to clean extras and apply changes.")
                 sys.exit(0)

            # Prompt 1: Deletions (High Risk, requires -o)
            if do_override and stats['deleted'] > 0:
                if ask_confirmation(f'Proceed with deletion of the session/window/pane with "{RESTORE_EXTRA_DELETE}" comment?'):
                    perform_update = True
                else:
                    do_override = False

            # Prompt 2: Additions
            if stats['added'] > 0:
                if ask_confirmation(f'Proceed with restoring the session/window/pane with "{RESTORE_ADDED}" comment?'):
                    perform_add = True
                    perform_update = True
                else:
                    perform_add = False

            # Prompt 3: Changes
            if not (perform_add or do_override) and (stats['changed'] > 0 or stats['renamed'] > 0):
                msg = RESTORE_RENAMED if stats['renamed'] > 0 else RESTORE_LAYOUT
                if ask_confirmation(f'Proceed with updating the session/window/pane with "{msg}" comment?'):
                    perform_update = True
                    if stats['renamed'] > 0: do_override = True

            # SSH: flag bypasses prompt; otherwise ask only when adding/overriding
            if args.ssh:
                enable_ssh = True
            elif perform_add or (do_override and stats['renamed'] > 0):
                enable_ssh = ask_confirmation(f"Do you want the device to be logged in with {DEFAULT_SSH_USER}@<window_name>?")

            if not perform_add and not do_override and not perform_update:
                print("Nothing to do.")
                sys.exit(0)

            new_sessions = restore_sessions_and_windows(saved, do_override, enable_ssh)
            time.sleep(0.5)

            if perform_add or perform_update or do_override:
                sync_panes_structurally(saved, do_override, new_sessions, enable_ssh)

            if do_override:
                # Pass original_saved_sessions so we don't delete skipped JSON sessions
                cleanup_extras(saved, original_saved_sessions)

            print(f"\n{Colors.GREEN}Restore Complete.{Colors.RESET}")
            print(f"{Colors.CYAN}Restored from: {abs_path}{Colors.RESET}")

        # --- MANAGE BLOCK ---
        elif args.cmd == "manage":
            if not os.path.exists(args.file):
                print(f"{Colors.RED}File not found: {args.file}{Colors.RESET}"); sys.exit(1)

            while True:
                saved = load_saved_layout(args.file)
                if not saved.get("sessions"):
                    print(f"{Colors.YELLOW}No sessions found in {args.file}{Colors.RESET}")
                    sys.exit(0)

                print(f"\n{Colors.BLUE}=== Manage Saved Sessions ==={Colors.RESET}")
                for i, sess in enumerate(saved["sessions"], 1):
                    print(f"  {Colors.CYAN}{i}.{Colors.RESET} {sess['session_name']}")
                
                print(f"\n{Colors.ORANGE}Commands:{Colors.RESET}")
                print(f"  {Colors.GREEN}d <numbers>{Colors.RESET} : Delete sessions (e.g., 'd 1' or 'd 1,3')")
                print(f"  {Colors.GREEN}r <numbers>{Colors.RESET} : Reorder ALL sessions (e.g., 'r 2,1,3')")
                print(f"  {Colors.GREEN}q{Colors.RESET}            : Quit")
                
                choice = input(f"\nEnter command: ").strip().lower()
                
                if choice == 'q' or not choice:
                    break
                
                if choice.startswith('d'):
                    try:
                        nums = choice[1:].strip()
                        if not nums: raise ValueError
                        
                        selected_indices = list(dict.fromkeys(int(x.strip()) for x in nums.split(',') if x.strip()))
                        valid_indices = range(1, len(saved["sessions"]) + 1)

                        if all(idx in valid_indices for idx in selected_indices):
                            to_delete = [saved["sessions"][i-1]["session_name"] for i in selected_indices]
                            if ask_confirmation(f"Delete {to_delete} from JSON?"):
                                saved["sessions"] = [s for i, s in enumerate(saved["sessions"], 1) if i not in selected_indices]
                                rotate_backups(args.file)
                                write_json_to_disk(saved, args.file)
                                print(f"{Colors.GREEN}Successfully deleted!{Colors.RESET}")
                        else:
                            print(f"{Colors.RED}Invalid numbers. Please select from the list.{Colors.RESET}")
                    except ValueError:
                        print(f"{Colors.RED}Format error. Use: d 1,3{Colors.RESET}")
                
                elif choice.startswith('r'):
                    try:
                        nums = choice[1:].strip()
                        if not nums: raise ValueError
                        
                        selected_indices = [int(x.strip()) for x in nums.split(',') if x.strip()]
                        valid_indices = range(1, len(saved["sessions"]) + 1)
                        
                        if len(selected_indices) == len(saved["sessions"]) and set(selected_indices) == set(valid_indices):
                            saved["sessions"] = [saved["sessions"][i-1] for i in selected_indices]
                            rotate_backups(args.file)
                            write_json_to_disk(saved, args.file)
                            print(f"{Colors.GREEN}Successfully reordered!{Colors.RESET}")
                        else:
                            print(f"{Colors.RED}Error: You must provide ALL session numbers exactly once (e.g., if there are 3 sessions, type 'r 3,1,2').{Colors.RESET}")
                    except ValueError:
                        print(f"{Colors.RED}Format error. Use: r 2,1,3{Colors.RESET}")
        # ----------------------------------------

    except KeyboardInterrupt:
        print(f"\n{Colors.RED}Operation cancelled.{Colors.RESET}")
        sys.exit(1)

if __name__ == "__main__":
    main()
