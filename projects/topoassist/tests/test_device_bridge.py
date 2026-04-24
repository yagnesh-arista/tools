# topoassist v260424.37 | 2026-04-24 14:11:13
"""
Unit tests for pure functions in device_bridge.py.

Run: cd ~/claude/projects/topoassist && pytest tests/ -v

Only pure functions are tested here — functions that take data in and return
data out with no network, filesystem, or GAS API dependencies.
"""

import device_bridge as db


# ── _extract_session_diff ──────────────────────────────────────────────────────

class TestExtractSessionDiff:
    def test_empty_string(self):
        assert db._extract_session_diff("") == ""

    def test_no_diff_header(self):
        output = "Arista#show session-config diffs\nArista#commit\n"
        assert db._extract_session_diff(output) == ""

    def test_basic_diff_stops_at_commit(self):
        output = (
            "--- system:/running-config\n"
            "+++ session:/topoassist-session-config\n"
            "interface Ethernet1\n"
            "+   description spine-link\n"
            "Arista(config-s-topoas)#commit\n"
        )
        result = db._extract_session_diff(output)
        assert result.startswith("--- system:/running-config")
        assert "+   description spine-link" in result
        assert "#commit" not in result

    def test_stops_at_abort(self):
        output = (
            "--- system:/running-config\n"
            "+++ session:/topoassist-session-config\n"
            "+   description foo\n"
            "Arista(config-s-topoas)#abort\n"
        )
        result = db._extract_session_diff(output)
        assert "+   description foo" in result
        assert "#abort" not in result

    def test_reversed_header_order(self):
        # EOS may emit +++ before --- on some versions
        output = (
            "+++ session:/topoassist-session-config\n"
            "--- system:/running-config\n"
            "+   description foo\n"
            "Arista#commit\n"
        )
        result = db._extract_session_diff(output)
        assert result.startswith("+++ session:/topoassist-session-config")
        assert "+   description foo" in result

    def test_trailing_whitespace_stripped(self):
        output = "--- system:/running-config   \n+   description foo   \nArista#commit\n"
        result = db._extract_session_diff(output)
        for line in result.split("\n"):
            assert line == line.rstrip()

    def test_empty_diff_no_changes(self):
        # Diff header present but no change lines before commit
        output = (
            "--- system:/running-config\n"
            "+++ session:/topoassist-session-config\n"
            "Arista(config-s-topoas)#commit\n"
        )
        result = db._extract_session_diff(output)
        # Should capture the headers but nothing after commit
        assert "running-config" in result
        assert "#commit" not in result


# ── _oc_lldp_to_eos ───────────────────────────────────────────────────────────

class TestOcLldpToEos:
    def _make_raw(self, iface_name, system_name, port_id, wrapper=True):
        iface = {
            "name": iface_name,
            "neighbors": {"neighbor": [{"state": {
                "system-name": system_name,
                "port-id": port_id,
            }}]},
        }
        inner = {"interfaces": {"interface": [iface]}}
        return {"openconfig-lldp:lldp": inner} if wrapper else inner

    def test_valid_response(self):
        raw = self._make_raw("Ethernet1", "Spine1", "Ethernet3")
        result = db._oc_lldp_to_eos(raw)
        assert "Ethernet1" in result
        nbr = result["Ethernet1"]["bridgeNeighborInfo"][0]
        assert nbr["systemName"] == "Spine1"
        assert nbr["neighborInterfaceInfo"]["interfaceId_v2"] == "Ethernet3"

    def test_no_wrapper_key(self):
        # Some EOS versions omit the openconfig-lldp:lldp wrapper
        raw = self._make_raw("Ethernet1", "Spine1", "Ethernet3", wrapper=False)
        result = db._oc_lldp_to_eos(raw)
        assert "Ethernet1" in result

    def test_empty_interfaces(self):
        raw = {"openconfig-lldp:lldp": {"interfaces": {"interface": []}}}
        assert db._oc_lldp_to_eos(raw) == {}

    def test_neighbor_missing_state(self):
        raw = {"openconfig-lldp:lldp": {"interfaces": {"interface": [{
            "name": "Ethernet1",
            "neighbors": {"neighbor": [{}]},
        }]}}}
        result = db._oc_lldp_to_eos(raw)
        nbr = result["Ethernet1"]["bridgeNeighborInfo"][0]
        assert nbr["systemName"] == ""
        assert nbr["neighborInterfaceInfo"]["interfaceId_v2"] == ""

    def test_interface_with_no_neighbors_skipped(self):
        raw = {"openconfig-lldp:lldp": {"interfaces": {"interface": [{
            "name": "Ethernet1",
            "neighbors": {"neighbor": []},
        }]}}}
        assert db._oc_lldp_to_eos(raw) == {}


# ── _normalize_lldp_neighbors ────────────────────────────────────────────────

class TestNormalizeLldpNeighbors:
    """EOS native JSON uses 'lldpNeighborInfo'; client expects 'bridgeNeighborInfo'.
    This helper is the normalization layer — any regression here means silent
    all-missing LLDP on device cards."""

    def _eos_iface(self, sys_name, iface_id):
        return {"lldpNeighborInfo": [{"systemName": sys_name,
                                      "neighborInterfaceInfo": {"interfaceId_v2": iface_id}}]}

    def test_renames_key(self):
        raw = {"Ethernet1": self._eos_iface("Spine1", "Ethernet3")}
        result = db._normalize_lldp_neighbors(raw)
        assert "bridgeNeighborInfo" in result["Ethernet1"]
        assert "lldpNeighborInfo" not in result["Ethernet1"]

    def test_neighbor_data_preserved(self):
        raw = {"Ethernet1": self._eos_iface("Spine1", "Ethernet3")}
        nbr = db._normalize_lldp_neighbors(raw)["Ethernet1"]["bridgeNeighborInfo"][0]
        assert nbr["systemName"] == "Spine1"
        assert nbr["neighborInterfaceInfo"]["interfaceId_v2"] == "Ethernet3"

    def test_multiple_interfaces(self):
        raw = {
            "Ethernet1": self._eos_iface("Spine1", "Ethernet3"),
            "Ethernet2": self._eos_iface("Spine2", "Ethernet4"),
        }
        result = db._normalize_lldp_neighbors(raw)
        assert "bridgeNeighborInfo" in result["Ethernet1"]
        assert "bridgeNeighborInfo" in result["Ethernet2"]

    def test_empty_neighbors(self):
        assert db._normalize_lldp_neighbors({}) == {}

    def test_iface_without_lldp_key_passthrough(self):
        # Interface present in EOS JSON but no LLDP info (e.g. Management port)
        raw = {"Management0": {"someOtherKey": []}}
        result = db._normalize_lldp_neighbors(raw)
        assert result["Management0"] == {"someOtherKey": []}


# ── _oc_version ───────────────────────────────────────────────────────────────

class TestOcVersion:
    def _make_raw(self, components):
        return {"openconfig-platform:components": {"component": components}}

    def test_single_component_with_version(self):
        raw = self._make_raw([{"state": {"software-version": "4.29.2F"}}])
        assert db._oc_version(raw) == "4.29.2F"

    def test_strips_build_suffix(self):
        raw = self._make_raw([{"state": {"software-version": "4.29.2F (engineering build)"}}])
        assert db._oc_version(raw) == "4.29.2F"

    def test_first_non_empty_version_returned(self):
        raw = self._make_raw([
            {"state": {"software-version": ""}},
            {"state": {"software-version": "4.28.1F"}},
        ])
        assert db._oc_version(raw) == "4.28.1F"

    def test_no_components(self):
        raw = self._make_raw([])
        assert db._oc_version(raw) == ""

    def test_no_software_version_key(self):
        raw = self._make_raw([{"state": {"type": "CHASSIS"}}])
        assert db._oc_version(raw) == ""


# ── _oc_platform ──────────────────────────────────────────────────────────────

class TestOcPlatform:
    def _make_raw(self, components):
        return {"openconfig-platform:components": {"component": components}}

    def test_chassis_component(self):
        raw = self._make_raw([{
            "state": {"type": "openconfig-platform-types:CHASSIS", "description": "DCS-7050TX-64"},
        }])
        assert db._oc_platform(raw) == "7050TX-64"

    def test_no_chassis_type(self):
        raw = self._make_raw([{
            "state": {"type": "openconfig-platform-types:LINECARD", "description": "DCS-7050TX-64"},
        }])
        assert db._oc_platform(raw) == ""

    def test_no_components(self):
        assert db._oc_platform(self._make_raw([])) == ""

    def test_description_without_dcs_prefix(self):
        raw = self._make_raw([{
            "state": {"type": "CHASSIS", "description": "7050TX-64"},
        }])
        # lstrip("DCS-") is byte-by-byte — if no prefix just returns as-is
        assert db._oc_platform(raw) == "7050TX-64"


# ── _oc_iface_status ──────────────────────────────────────────────────────────

class TestOcIfaceStatus:
    def _make_raw(self, ifaces):
        return {"openconfig-interfaces:interfaces": {"interface": ifaces}}

    def test_up_maps_to_connected(self):
        raw = self._make_raw([{"name": "Ethernet1", "state": {"oper-status": "UP"}}])
        assert db._oc_iface_status(raw)["Ethernet1"]["linkStatus"] == "connected"

    def test_down_maps_to_notconnect(self):
        raw = self._make_raw([{"name": "Ethernet1", "state": {"oper-status": "DOWN"}}])
        assert db._oc_iface_status(raw)["Ethernet1"]["linkStatus"] == "notconnect"

    def test_lower_layer_down(self):
        raw = self._make_raw([{"name": "Ethernet2", "state": {"oper-status": "LOWER_LAYER_DOWN"}}])
        assert db._oc_iface_status(raw)["Ethernet2"]["linkStatus"] == "notconnect"

    def test_dormant(self):
        raw = self._make_raw([{"name": "Ethernet3", "state": {"oper-status": "DORMANT"}}])
        assert db._oc_iface_status(raw)["Ethernet3"]["linkStatus"] == "notconnect"

    def test_unknown_status_defaults_to_notconnect(self):
        raw = self._make_raw([{"name": "Ethernet4", "state": {"oper-status": "TESTING"}}])
        assert db._oc_iface_status(raw)["Ethernet4"]["linkStatus"] == "notconnect"

    def test_multiple_interfaces(self):
        raw = self._make_raw([
            {"name": "Ethernet1", "state": {"oper-status": "UP"}},
            {"name": "Ethernet2", "state": {"oper-status": "DOWN"}},
        ])
        result = db._oc_iface_status(raw)
        assert result["Ethernet1"]["linkStatus"] == "connected"
        assert result["Ethernet2"]["linkStatus"] == "notconnect"

    def test_empty_interfaces(self):
        assert db._oc_iface_status(self._make_raw([])) == {}


# ── _gnmi_val ─────────────────────────────────────────────────────────────────

class TestGnmiVal:
    def test_valid_response(self):
        response = {"notification": [{"update": [{"val": {"key": "value"}}]}]}
        assert db._gnmi_val(response) == {"key": "value"}

    def test_empty_dict(self):
        assert db._gnmi_val({}) == {}

    def test_missing_notification_key(self):
        assert db._gnmi_val({"other": []}) == {}

    def test_empty_notification_list(self):
        assert db._gnmi_val({"notification": []}) == {}

    def test_none_input(self):
        assert db._gnmi_val(None) == {}

    def test_empty_update_list(self):
        assert db._gnmi_val({"notification": [{"update": []}]}) == {}


# ── _parse_internal_vlans ─────────────────────────────────────────────────────

class TestParseInternalVlans:
    def test_empty_dict(self):
        # No internalVlans key at all → empty list
        assert db._parse_internal_vlans({}) == []

    def test_vlans_key_present_but_empty(self):
        # EOS actual format: {"internalVlans": {}} → empty list
        assert db._parse_internal_vlans({"internalVlans": {}}) == []

    def test_single_vlan(self):
        # EOS maps VLAN id → interface name string
        assert db._parse_internal_vlans({"internalVlans": {"1025": "Ethernet1"}}) == [1025]

    def test_multiple_vlans_returned_sorted(self):
        # EOS JSON key order is not guaranteed — must come back sorted
        result = db._parse_internal_vlans({"internalVlans": {"1026": "Ethernet2", "1024": "Ethernet1", "1025": "Ethernet3"}})
        assert result == [1024, 1025, 1026]

    def test_string_keys_converted_to_int(self):
        # JSON keys are always strings; must be integers in the output
        result = db._parse_internal_vlans({"internalVlans": {"1025": "Ethernet1.100"}})
        assert result == [1025]
        assert all(isinstance(v, int) for v in result)

    def test_extra_top_level_keys_ignored(self):
        # EOS may return other keys alongside "internalVlans"
        result = db._parse_internal_vlans({
            "internalVlans": {"1025": "Ethernet1", "1026": "Ethernet2"},
            "maxInternalVlan": 4094,
        })
        assert result == [1025, 1026]

    def test_none_returns_empty(self):
        # SSH thread failure leaves result as None — must not crash
        assert db._parse_internal_vlans(None) == []


# ── _build_devstatus_ssh ───────────────────────────────────────────────────────

_VER = {
    "hostname": "spine1",
    "version": "4.32.1F",
    "modelName": "DCS-7050TX3-48C8",
    "systemMacAddress": "aa:bb:cc:dd:ee:ff",
}
_IFS = {
    "interfaceStatuses": {
        "Ethernet1": {"linkStatus": "connected"},
        "Ethernet2": {"linkStatus": "notconnect"},
    }
}
_IVLANS = {"internalVlans": {"1025": "Ethernet1", "1026": "Ethernet2"}}


class TestBuildDevstatusSsh:
    def _run(self, ver=_VER, ifs=_IFS, ivlans=_IVLANS):
        return db._build_devstatus_ssh(ver, ifs, ivlans)

    def test_happy_path(self):
        r = self._run()
        assert r["ok"] is True
        assert r["hostname"] == "spine1"
        assert r["version"] == "4.32.1F"
        assert r["platform"] == "7050TX3-48C8"   # DCS- prefix stripped
        assert r["bridgeMac"] == "aa:bb:cc:dd:ee:ff"
        assert r["interfaces"]["Ethernet1"] == {"linkStatus": "connected"}
        assert r["interfaces"]["Ethernet2"] == {"linkStatus": "notconnect"}
        assert r["internalVlans"] == [1025, 1026]

    def test_version_software_image_prefix_stripped(self):
        ver = dict(_VER, version="Software image version: 4.30.0F (engineering build)")
        r = self._run(ver=ver)
        assert r["version"] == "4.30.0F"

    def test_version_build_suffix_stripped(self):
        ver = dict(_VER, version="4.29.2F (release version)")
        r = self._run(ver=ver)
        assert r["version"] == "4.29.2F"

    # ── partial failure: show version fails ────────────────────────────────────

    def test_ver_none_still_returns_ok(self):
        # show version thread failed — version/platform/mac blank, rest intact
        r = self._run(ver=None)
        assert r["ok"] is True
        assert r["version"] == ""
        assert r["platform"] == ""
        assert r["hostname"] == ""
        assert r["bridgeMac"] == ""
        assert r["interfaces"]["Ethernet1"]["linkStatus"] == "connected"
        assert r["internalVlans"] == [1025, 1026]

    # ── partial failure: show interfaces status fails ──────────────────────────

    def test_ifs_none_still_returns_ok(self):
        # show interfaces status thread failed — interfaces empty, rest intact
        r = self._run(ifs=None)
        assert r["ok"] is True
        assert r["version"] == "4.32.1F"
        assert r["interfaces"] == {}
        assert r["internalVlans"] == [1025, 1026]

    # ── partial failure: show vlan internal usage fails ────────────────────────

    def test_ivlans_none_still_returns_ok(self):
        # show vlan internal usage thread failed — internalVlans empty, rest intact
        r = self._run(ivlans=None)
        assert r["ok"] is True
        assert r["version"] == "4.32.1F"
        assert r["interfaces"]["Ethernet1"]["linkStatus"] == "connected"
        assert r["internalVlans"] == []

    # ── all three fail ─────────────────────────────────────────────────────────

    def test_all_none_returns_ok_with_empty_data(self):
        # All three SSH threads failed — ok:True with all-empty fields
        r = self._run(ver=None, ifs=None, ivlans=None)
        assert r["ok"] is True
        assert r["version"] == ""
        assert r["interfaces"] == {}
        assert r["internalVlans"] == []


# ── _prepend_section_cleaners ──────────────────────────────────────────────────

class TestPrependSectionCleaners:
    """_SECTION_CLEANERS is empty — function is now a pass-through."""

    def _run(self, cfg):
        return db._prepend_section_cleaners(cfg)

    def test_passthrough_interface(self):
        cfg = "interface Ethernet1\n no shutdown"
        assert self._run(cfg) == cfg

    def test_passthrough_bgp(self):
        cfg = "router bgp 65001\n no bgp default ipv4-unicast"
        assert self._run(cfg) == cfg

    def test_passthrough_ospf(self):
        cfg = "router ospf 1\n router-id 1.1.1.1"
        assert self._run(cfg) == cfg

    def test_passthrough_mlag(self):
        cfg = "mlag configuration\n domain-id Leaf1"
        assert self._run(cfg) == cfg

    def test_passthrough_management_untouched(self):
        cfg = "interface Management0\n ip address 192.168.1.1/24"
        assert self._run(cfg) == cfg

    def test_passthrough_global_lines(self):
        cfg = "hostname Leaf1\nip routing\nipv6 unicast-routing"
        assert self._run(cfg) == cfg

    def test_passthrough_multiple_sections(self):
        cfg = "interface Ethernet1\n no shutdown\n!\nrouter bgp 65001\n redistribute connected"
        assert self._run(cfg) == cfg


# ── _norm_iface ───────────────────────────────────────────────────────────────

class TestNormIface:
    def test_ethernet_long_to_et(self):
        assert db._norm_iface("Ethernet25/1") == "et25/1"

    def test_ethernet_abbreviated_unchanged(self):
        assert db._norm_iface("Et25/1") == "et25/1"

    def test_port_channel_long_to_po(self):
        assert db._norm_iface("Port-Channel10") == "po10"

    def test_port_channel_abbreviated_unchanged(self):
        assert db._norm_iface("Po10") == "po10"

    def test_sub_interface_long(self):
        assert db._norm_iface("Ethernet25/1.100") == "et25/1.100"

    def test_sub_interface_abbreviated(self):
        assert db._norm_iface("Et25/1.100") == "et25/1.100"

    def test_vlan_passthrough(self):
        assert db._norm_iface("Vlan100") == "vlan100"

    def test_loopback_passthrough(self):
        assert db._norm_iface("Loopback0") == "loopback0"

    def test_case_insensitive(self):
        assert db._norm_iface("ETHERNET4/1") == "et4/1"
        assert db._norm_iface("port-channel5") == "po5"
