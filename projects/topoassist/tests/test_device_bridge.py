# topoassist v260504.40 | 2026-05-04 18:44:56
"""
Unit tests for pure functions in device_bridge.py.

Run: cd ~/claude/projects/topoassist && pytest tests/ -v

Only pure functions are tested here — functions that take data in and return
data out with no network, filesystem, or GAS API dependencies.
"""

import device_bridge as db


# ── _extract_eos_errors ────────────────────────────────────────────────────────

class TestExtractEosErrors:
    # Helper: extract only errors (first element of the returned tuple)
    @staticmethod
    def _errs(text):
        errors, _ = db._extract_eos_errors(text)
        return errors

    @staticmethod
    def _warns(text):
        _, warnings = db._extract_eos_errors(text)
        return warnings

    def test_empty_string(self):
        errors, warns = db._extract_eos_errors("")
        assert errors == [] and warns == []

    def test_no_percent_lines(self):
        output = "Arista(config-s-topoas)#router bgp 65001\nArista(config-s-topoas)#commit\n"
        assert self._errs(output) == []

    def test_single_rejection_before_diff(self):
        output = (
            "Arista(config-s-1)#router bgp 1\n"
            "% BGP is already running with AS number 65002\n"
            "--- system:/running-config\n"
            "+++ session:/topoassist-session-config\n"
            "Arista(config-s-1)#commit\n"
        )
        assert self._errs(output) == ["router bgp 1 \u2192 % BGP is already running with AS number 65002"]

    def test_multiple_rejections(self):
        output = (
            "% Invalid input (at token 2: 'bgp')\n"
            "% BGP is already running with AS number 65002\n"
            "--- system:/running-config\n"
        )
        result = self._errs(output)
        assert len(result) == 2
        assert "% Invalid input (at token 2: 'bgp')" in result
        assert "% BGP is already running with AS number 65002" in result

    def test_percent_after_diff_header_ignored(self):
        output = (
            "--- system:/running-config\n"
            "+++ session:/topoassist-session-config\n"
            "% This would be unusual but must not be captured\n"
        )
        assert self._errs(output) == []

    def test_stops_at_plus_plus_plus_header(self):
        output = (
            "% BGP is already running with AS number 65002\n"
            "+++ session:/topoassist-session-config\n"
            "% Should not be captured\n"
        )
        assert self._errs(output) == ["% BGP is already running with AS number 65002"]

    def test_eapi_joined_results(self):
        output = (
            "output of session open\n"
            "% BGP is already running with AS number 65002\n"
            "\n"
            "--- system:/running-config\n"
            "+++ session:/topoassist-session-config\n"
        )
        assert self._errs(output) == ["% BGP is already running with AS number 65002"]

    def test_no_errors_clean_push(self):
        output = (
            "Arista(config-s-topoas)#interface Ethernet1\n"
            "Arista(config-s-topoas-if-Et1)#description spine\n"
            "--- system:/running-config\n"
            "+++ session:/topoassist-session-config\n"
            "interface Ethernet1\n"
            "+   description spine\n"
            "Arista(config-s-topoas)#commit\n"
        )
        assert self._errs(output) == []

    def test_stops_at_exec_mode_prompt(self):
        output = (
            "% BGP is already running with AS number 65002\n"
            "Arista#\n"
            "% Should not be captured (re-entry phase)\n"
            "--- system:/running-config\n"
        )
        assert self._errs(output) == ["% BGP is already running with AS number 65002"]

    def test_exec_mode_prompt_with_config_context_not_a_stop(self):
        output = (
            "Arista(config-s-topoas-mst)#router bgp 65002\n"
            "% BGP is already running with AS number 65002\n"
            "Arista#\n"
            "% Should not be captured\n"
        )
        assert self._errs(output) == ["router bgp 65002 \u2192 % BGP is already running with AS number 65002"]

    def test_spanning_tree_submode_scenario(self):
        output = (
            "Arista(config-s-topoas)#spanning-tree mst configuration\n"
            "Arista(config-s-topoas-mst)#instance 2 vlan 2001-4001\n"
            "Arista(config-s-topoas-mst)#end\n"
            "Arista#\n"
            "Arista#configure session topoassist_1234\n"
            "Arista(config-s-topoas)#show session-config diffs\n"
            "--- system:/running-config\n"
            "+++ session:/topoassist-session-config\n"
            "spanning-tree mst configuration\n"
            "-   instance 2 vlan 2001-4000\n"
            "+   instance 2 vlan 2001-4001\n"
        )
        assert self._errs(output) == []

    def test_invalid_input_in_session_submode(self):
        output = (
            "DUT(config-s-topoas-if-Et4.4019)#channel-group 4003 mode active\n"
            "% Invalid input\n"
            "DUT(config-s-topoas-if-Et4.4019)#\n"
            "DUT(config-s-topoas)#end\n"
            "DUT#\n"
            "--- system:/running-config\n"
        )
        assert self._errs(output) == ["channel-group 4003 mode active \u2192 % Invalid input"]

    def test_timestamped_prompt_submode_not_a_stop_exec_is(self):
        output = (
            "DUT.02:03:38(config-s-topoas-if-Et4.4019)#channel-group 4003 mode active\n"
            "% Invalid input\n"
            "DUT.02:03:43(config-s-topoas-if-Et4.4019)#\n"
            "DUT.02:03:50#\n"
            "% Should not be captured\n"
        )
        assert self._errs(output) == ["channel-group 4003 mode active \u2192 % Invalid input"]

    # ── warnings (! lines) ──────────────────────────────────────────────────────

    def test_bang_warning_no_errors(self):
        # ! line = informational note, command was accepted — captured as warning, not error
        output = (
            "DUT(config-s-topoas-if-Et22)#speed 25g\n"
            "! Transceiver for interface Et22/1 is not present. Cannot verify compatibility of speed and duplex settings.\n"
            "--- system:/running-config\n"
        )
        assert self._errs(output) == []
        assert self._warns(output) == [
            "speed 25g \u2192 ! Transceiver for interface Et22/1 is not present. Cannot verify compatibility of speed and duplex settings."
        ]

    def test_bang_and_percent_together(self):
        # Both ! (warning) and % (error) in same session — each goes to its own list
        output = (
            "DUT(config-s-topoas-if-Et22)#speed 25g\n"
            "! Transceiver for interface Et22/1 is not present.\n"
            "DUT(config-s-topoas)#router bgp 1\n"
            "% BGP is already running with AS number 65002\n"
            "--- system:/running-config\n"
        )
        assert self._errs(output) == ["router bgp 1 \u2192 % BGP is already running with AS number 65002"]
        assert self._warns(output) == ["speed 25g \u2192 ! Transceiver for interface Et22/1 is not present."]

    def test_bare_bang_not_captured(self):
        # Bare '!' (EOS config comment separator) must NOT be captured as a warning
        output = (
            "DUT(config-s-topoas)#interface Ethernet1\n"
            "!\n"
            "--- system:/running-config\n"
        )
        assert self._warns(output) == []

    def test_bang_after_diff_header_ignored(self):
        output = (
            "--- system:/running-config\n"
            "! This is inside diff output — must not be captured\n"
        )
        assert self._warns(output) == []


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


# ── _push_config: idempotency reclassification (eAPI RuntimeError path) ────────

from unittest import mock


def _make_push_handler():
    """Bare BridgeHandler with no real __init__ — all network methods mocked."""
    h = object.__new__(db.BridgeHandler)
    h._abort_stale_sessions = mock.Mock()
    h._find_bgp_asn_change = mock.Mock(return_value=([], None))
    h._diagnose_eapi_errors = mock.Mock(side_effect=lambda ip, lines, errs: errs)
    db._cfg['transport'] = 'eapi'
    return h


class TestPushConfigIdempotencyFilter:
    """GW SVI cleanup commands ('default ip address virtual' / 'default ipv6 address
    virtual') return 'invalid command' when the feature isn't configured — harmless
    no-ops. _push_config must demote them to eos_warnings and return ok=True.

    The real error path is the eAPI RuntimeError path: EOS returns a top-level
    JSON-RPC error with 'CLI command N of M <cmd> failed: invalid command', which
    includes the command name — the substring match is reliable there.
    """

    def test_only_idempotency_errors_returns_ok_true(self):
        h = _make_push_handler()
        raw_msg = (
            "CLI command 558 of 854 ' default ip address virtual' failed: invalid command\n"
            "CLI command 561 of 854 ' default ipv6 address virtual' failed: invalid command"
        )
        h._eapi_push = mock.Mock(side_effect=RuntimeError(raw_msg))
        config = "interface Vlan100\n description GW __TA\n default ip address virtual\n default ipv6 address virtual"

        result = h._push_config("192.168.1.1", config)

        assert result.get("ok") is True
        assert result.get("diff") is None  # diff unavailable from error path
        warns = result.get("eos_warnings", [])
        assert any("default ip address virtual" in w for w in warns)
        assert "eos_errors" not in result

    def test_mixed_errors_real_errors_preserved_idempotency_demoted(self):
        h = _make_push_handler()
        raw_msg = (
            "CLI command 1 of 5 ' default ip address virtual' failed: invalid command\n"
            "CLI command 2 of 5 ' router bgp 1' failed: BGP already running with AS 65002"
        )
        h._eapi_push = mock.Mock(side_effect=RuntimeError(raw_msg))
        config = "default ip address virtual\n router bgp 1"

        result = h._push_config("192.168.1.1", config)

        assert result.get("ok") is False
        assert "BGP" in result.get("error", "")
        warns = result.get("eos_warnings", [])
        assert any("default ip address virtual" in w for w in warns)

    def test_ipv6_virtual_only_returns_ok_true(self):
        h = _make_push_handler()
        raw_msg = "CLI command 3 of 10 ' default ipv6 address virtual' failed: invalid command"
        h._eapi_push = mock.Mock(side_effect=RuntimeError(raw_msg))
        config = "interface Vlan200\n default ipv6 address virtual\n ipv6 address virtual 2001:db8::1/64"

        result = h._push_config("192.168.1.1", config)

        assert result.get("ok") is True
        warns = result.get("eos_warnings", [])
        assert any("default ipv6 address virtual" in w for w in warns)

    def test_non_idempotency_runtime_error_returns_ok_false(self):
        h = _make_push_handler()
        raw_msg = "CLI command 1 of 3 ' router bgp 1' failed: BGP already running with AS 65002"
        h._eapi_push = mock.Mock(side_effect=RuntimeError(raw_msg))
        config = "router bgp 1\n neighbor 10.0.0.1 remote-as 65001"

        result = h._push_config("192.168.1.1", config)

        assert result.get("ok") is False
        assert "BGP" in result.get("error", "")
        assert "eos_warnings" not in result

    def test_success_path_per_cmd_idempotency_suppressed(self):
        # When EOS embeds the error in per-command output (stopOnError=False, no top-level
        # error), the pre-scan pairs command with output to identify the idempotency error.
        h = _make_push_handler()
        # Simulate: 4-command session — configure session, idempotency cmd, show diffs, commit
        h._eapi_push = mock.Mock(return_value=[
            "",                                    # configure session <name>
            "% Invalid command\n",                 # default ip address virtual → no-op
            "--- diffs ---\n+ ip address 10.0.0.1/24",  # show session-config diffs
            "",                                    # commit
        ])
        # core_cmds will include these in the middle; use open_only=False, dry_run=False
        # The handler builds core_cmds internally — config must be minimal (1 line)
        config = "default ip address virtual"

        result = h._push_config("192.168.1.1", config)

        assert result.get("ok") is True
        warns = result.get("eos_warnings", [])
        assert any("default ip address virtual" in w for w in warns)
        assert "eos_errors" not in result


# ── _push_config: eAPI timeout recovery (late_response) ─────────────────────────

class TestPushConfigTimeoutRecovery:
    """When the eAPI push read times out, _push_config verifies whether EOS
    committed the session. Session absent → ok=True + late_response=True.
    Session still present → RuntimeError. Non-timeout OSError → reraise."""

    def test_timeout_session_absent_returns_late_response(self):
        h = _make_push_handler()
        with mock.patch('device_bridge.time') as mock_time:
            mock_time.sleep = mock.Mock()
            mock_time.time = mock.Mock(return_value=1_000_000)
            h._eapi_push = mock.Mock(side_effect=[
                TimeoutError("timed out"),          # push call
                ["active sessions:\n"],             # verify: session name absent
            ])
            result = h._push_config("192.168.1.1", "interface Ethernet1\n description test __TA")

        assert result.get("ok") is True
        assert result.get("late_response") is True
        assert result.get("diff") == ""

    def test_timeout_session_still_present_raises(self):
        h = _make_push_handler()
        with mock.patch('device_bridge.time') as mock_time:
            mock_time.sleep = mock.Mock()
            mock_time.time = mock.Mock(return_value=1_000_000)
            expected_session = "topoassist_1000000"
            h._eapi_push = mock.Mock(side_effect=[
                TimeoutError("timed out"),
                [f"{expected_session} pending"],    # session still present
            ])
            import pytest
            with pytest.raises(RuntimeError, match="still pending"):
                h._push_config("192.168.1.1", "interface Ethernet1\n description test __TA")

    def test_urlerror_timeout_treated_as_timeout(self):
        import urllib.error
        h = _make_push_handler()
        with mock.patch('device_bridge.time') as mock_time:
            mock_time.sleep = mock.Mock()
            mock_time.time = mock.Mock(return_value=1_000_000)
            h._eapi_push = mock.Mock(side_effect=[
                urllib.error.URLError("timed out"),  # wraps socket.timeout; str has 'timed out'
                ["other sessions only"],
            ])
            result = h._push_config("192.168.1.1", "interface Ethernet1\n description test __TA")

        assert result.get("ok") is True
        assert result.get("late_response") is True

    def test_non_timeout_oserror_reraises(self):
        h = _make_push_handler()
        h._eapi_push = mock.Mock(side_effect=OSError("Connection refused"))
        import pytest
        with pytest.raises(OSError, match="Connection refused"):
            h._push_config("192.168.1.1", "interface Ethernet1\n description test __TA")

    def test_dry_run_timeout_raises_without_verify(self):
        # dry_run=True — session aborted immediately; no commit to verify
        h = _make_push_handler()
        h._eapi_push = mock.Mock(side_effect=TimeoutError("timed out"))
        import pytest
        with pytest.raises(RuntimeError, match="timed out"):
            h._push_config("192.168.1.1", "interface Ethernet1\n description test __TA",
                           dry_run=True)


# ── _finalize_session: eAPI timeout recovery ─────────────────────────────────────

class TestFinalizeSessionTimeoutRecovery:
    """Timeout during _finalize_session commit: check if session is absent → late_response.
    Timeout during abort: nothing to verify, just raise. Non-commit action after timeout: raise."""

    def test_timeout_commit_session_absent_returns_late_response(self):
        h = object.__new__(db.BridgeHandler)
        db._cfg['transport'] = 'eapi'
        with mock.patch('device_bridge.time') as mock_time:
            mock_time.sleep = mock.Mock()
            h._eapi_push = mock.Mock(side_effect=[
                ["topoassist_123 pending"],    # show configuration sessions (session exists check)
                TimeoutError("timed out"),     # commit call
                ["active sessions:\n"],        # verify: session absent → committed
            ])
            result = h._finalize_session("192.168.1.1", "topoassist_123", "commit")

        assert result.get("ok") is True
        assert result.get("late_response") is True
        assert result.get("action") == "commit"

    def test_timeout_abort_raises(self):
        h = object.__new__(db.BridgeHandler)
        db._cfg['transport'] = 'eapi'
        with mock.patch('device_bridge.time') as mock_time:
            mock_time.sleep = mock.Mock()
            h._eapi_push = mock.Mock(side_effect=[
                ["topoassist_123 pending"],    # session exists check
                TimeoutError("timed out"),     # abort call — no verify logic for abort
            ])
            import pytest
            with pytest.raises(RuntimeError, match="Finalize timed out"):
                h._finalize_session("192.168.1.1", "topoassist_123", "abort")


# ── VERSION sync ───────────────────────────────────────────────────────────────

class TestVersionSync:
    """device_bridge.py VERSION must match the embedded template in Sidebar-js.html."""

    def test_version_matches_embedded_template(self):
        import re, pathlib
        sidebar = pathlib.Path(__file__).parent.parent / 'Sidebar-js.html'
        text = sidebar.read_text()
        m = re.search(r'^VERSION\s*=\s*"([^"]+)"', text, re.MULTILINE)
        assert m, "Could not find VERSION = \"...\" in Sidebar-js.html embedded template"
        assert db.VERSION == m.group(1), (
            f"VERSION mismatch: device_bridge.py={db.VERSION!r}, "
            f"Sidebar-js.html template={m.group(1)!r}"
        )
