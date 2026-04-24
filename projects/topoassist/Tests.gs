// TopoAssist v260424.30 | 2026-04-24 12:20:00
/**
 * TopoAssist — GAS Unit Test Harness
 *
 * Tests pure functions in Code.gs that have no GAS API dependencies.
 *
 * HOW TO RUN:
 *   1. Open Apps Script editor (Extensions → Apps Script)
 *   2. Select function: runAllTests
 *   3. Click Run
 *   4. View: alert popup (summary) + Execution Log (full detail)
 *
 * COVERED FUNCTIONS:
 *   canonicalizeInterface    — interface name normalization
 *   hasKey                   — case-insensitive Set lookup
 *   normalizePo              — Port-Channel number extraction
 *   isValidPort              — port string validation
 *   _parseSviVlans           — SVI VLAN subset selection from svi_vlan_ value
 *   getPhysicalPortParent    — strip breakout lane suffix from port name
 *   compressPortList         — sort and join port array as comma-separated string
 *   _breakoutSides           — determine QSFP vs SFP lane side of a cable group
 *   _buildCableGroupsForTest — cabling grouping logic: Scenario A/B/C + snake + non-Arista
 *   parseVlanWithNative      — split nv<N> native-VLAN token out of vlan_ field
 *   generateGlobalBlock      — ip routing/ipv6/multi-agent/VARP MAC global commands
 *   generateComplexL3Block   — GW type (anycast/VARP), vx1 exclusion, ANYCAST_GW description
 */

// APP_VERSION is declared in Code.gs — all .gs files share the same global scope in GAS


// ── Test assertion helper ──────────────────────────────────────────────────────

function assert_(label, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  return { label, pass, actual: JSON.stringify(actual), expected: JSON.stringify(expected) };
}


// ── canonicalizeInterface ──────────────────────────────────────────────────────

function test_canonicalizeInterface() {
  const t = assert_;
  return [
    t("null input → empty string",            canonicalizeInterface(null),              ""),
    t("empty string → empty string",          canonicalizeInterface(""),                ""),
    t("ethernet1 → Et1",                      canonicalizeInterface("ethernet1"),       "Et1"),
    t("Ethernet1 → Et1",                      canonicalizeInterface("Ethernet1"),       "Et1"),
    t("Ethernet1/1 → Et1/1",                  canonicalizeInterface("Ethernet1/1"),     "Et1/1"),
    t("Eth1 → Et1",                           canonicalizeInterface("Eth1"),            "Et1"),
    t("Et1 already canonical → Et1",          canonicalizeInterface("Et1"),             "Et1"),
    t("port-channel1 → Po1",                  canonicalizeInterface("port-channel1"),   "Po1"),
    t("portchannel1 → Po1",                   canonicalizeInterface("portchannel1"),    "Po1"),
    t("Po10 already canonical → Po10",        canonicalizeInterface("Po10"),            "Po10"),
    t("vlan100 → Vl100",                      canonicalizeInterface("vlan100"),         "Vl100"),
    t("loopback0 → Lo0",                      canonicalizeInterface("loopback0"),       "Lo0"),
    t("management1 → Ma1",                    canonicalizeInterface("management1"),     "Ma1"),
    t("Mgmt0 → Ma0",                          canonicalizeInterface("Mgmt0"),           "Ma0"),
    t("tunnel1 → Tu1",                        canonicalizeInterface("tunnel1"),         "Tu1"),
    t("vxlan1 → Vx1",                         canonicalizeInterface("vxlan1"),          "Vx1"),
    t("interface Ethernet1 strips keyword",   canonicalizeInterface("interface Ethernet1"), "Et1"),
    t("int Et1 strips keyword",               canonicalizeInterface("int Et1"),         "Et1"),
  ];
}


// ── hasKey ─────────────────────────────────────────────────────────────────────

function test_hasKey() {
  const t = assert_;
  const s = new Set(["leaf1", "spine1"]);
  return [
    t("exact lowercase match → true",         hasKey(s, "leaf1"),   true),
    t("case-insensitive Leaf1 → true",        hasKey(s, "Leaf1"),   true),
    t("case-insensitive SPINE1 → true",       hasKey(s, "SPINE1"),  true),
    t("not in set → false",                   hasKey(s, "border1"), false),
    t("empty set → false",                    hasKey(new Set(), "leaf1"), false),
    t("null set → false",                     hasKey(null, "leaf1"), false),
  ];
}


// ── normalizePo ────────────────────────────────────────────────────────────────

function test_normalizePo() {
  const t = assert_;
  return [
    t("Po10 already canonical → Po10",        normalizePo("Po10"),            "Po10"),
    t("port-channel 10 → Po10",               normalizePo("port-channel 10"), "Po10"),
    t("PO 10 → Po10",                         normalizePo("PO 10"),           "Po10"),
    t("po10 → Po10",                          normalizePo("po10"),            "Po10"),
    t("bare number 10 → Po10",                normalizePo("10"),              "Po10"),
    t("no digits → null",                     normalizePo("SomePort"),        null),
    t("empty string → null",                  normalizePo(""),                null),
    t("null → null",                          normalizePo(null),              null),
  ];
}


// ── isValidPort ────────────────────────────────────────────────────────────────

function test_isValidPort() {
  const t = assert_;
  return [
    t("Et1 → true",                           isValidPort("Et1"),             true),
    t("Po10 → true",                          isValidPort("Po10"),            true),
    t("empty string → false",                 isValidPort(""),                false),
    t("#N/A → false",                         isValidPort("#N/A"),            false),
    t("switchport → false",                   isValidPort("switchport"),      false),
    t("Access Switchport → false",            isValidPort("Access Switchport"), false),
    t("null → false",                         isValidPort(null),              false),
    t("undefined → false",                    isValidPort(undefined),         false),
  ];
}


// ── _parseSviVlans ─────────────────────────────────────────────────────────────

function test_parseSviVlans() {
  const t = assert_;
  return [
    t("all → returns all vlans",
      _parseSviVlans('all', ['10', '20']),          ['10', '20']),
    t("ALL uppercase → returns all vlans",
      _parseSviVlans('ALL', ['10', '20']),          ['10', '20']),
    t("blank → empty",
      _parseSviVlans('', ['10', '20']),             []),
    t("undefined → empty",
      _parseSviVlans(undefined, ['10', '20']),      []),
    t("single VLAN in list → returns match",
      _parseSviVlans('10', ['10', '20']),           ['10']),
    t("single VLAN not in list → empty",
      _parseSviVlans('30', ['10', '20']),           []),
    t("comma list → intersection",
      _parseSviVlans('10,20', ['10', '20', '30']), ['10', '20']),
    t("partial overlap",
      _parseSviVlans('10,30', ['10', '20']),        ['10']),
    t("number elements in vlans array",
      _parseSviVlans('10', [10, 20]),               [10]),
    t("all with number elements",
      _parseSviVlans('all', [10, 20]),              [10, 20]),
    t("whitespace in svi_vlan_ value",
      _parseSviVlans(' 10 , 20 ', ['10', '20']),   ['10', '20']),
    t("nv<N> token in svi_vlan_ → resolves to N, returns if in vlans array",
      _parseSviVlans('nv100', ['10', '20', '100']), ['100']),
    t("nv<N> token not in vlans array → empty",
      _parseSviVlans('nv100', ['10', '20']),        []),
    t("nv<N> mixed with regular VLANs",
      _parseSviVlans('10,nv100', ['10', '20', '100']), ['10', '100']),
    t("all includes native VLAN when caller passes it",
      _parseSviVlans('all', ['10', '20', '100']),  ['10', '20', '100']),
  ];
}


// ── _parseVrfList ──────────────────────────────────────────────────────────────

function test_parseVrfList() {
  const t = assert_;
  return [
    t("empty string → []",          _parseVrfList(''),            []),
    t("null → []",                  _parseVrfList(null),          []),
    t("single VRF → ['A']",         _parseVrfList('VRF_A'),       ['VRF_A']),
    t("comma list → array",         _parseVrfList('VRF_A,VRF_B'), ['VRF_A', 'VRF_B']),
    t("whitespace trimmed",         _parseVrfList('A , B , C'),   ['A', 'B', 'C']),
    t("trailing comma ignored",     _parseVrfList('A,B,'),        ['A', 'B']),
  ];
}

// ── _resolveVrfAtIndex ─────────────────────────────────────────────────────────

function test_resolveVrfAtIndex() {
  const t = assert_;
  return [
    t("empty list → null",                   _resolveVrfAtIndex([], 0),           null),
    t("single entry → always that VRF",      _resolveVrfAtIndex(['A'], 5),        'A'),
    t("multi: index 0",                      _resolveVrfAtIndex(['A','B'], 0),    'A'),
    t("multi: index 1",                      _resolveVrfAtIndex(['A','B'], 1),    'B'),
    t("multi: out-of-bounds → null",         _resolveVrfAtIndex(['A','B'], 2),    null),
  ];
}

// ── _auditVrfIssues ────────────────────────────────────────────────────────────

function test_auditVrfIssues() {
  const t = assert_;
  const DEV  = 'D1';
  const HDR  = ['vrf_D1', 'vlan_D1', 'svi_vlan_D1', 'sp_mode_D1'];
  const DEVS = [{ name: DEV, type: 'arista' }];

  // Build a single-row input and run the audit
  function run_(vrf, vlan, svi, mode) {
    return _auditVrfIssues([[vrf, vlan, svi, mode]], HDR, DEVS, 3);
  }

  return [
    // ─── early-return paths (no issue expected) ───────────────────────
    t("empty vrf → no issues",
      run_('', '10,20', '', 'l3-et-sub-int').length, 0),
    t("single VRF → no issues (all-VLAN path)",
      run_('RED', '10,20', '', 'l3-et-sub-int').length, 0),

    // ─── wrong mode → warn ────────────────────────────────────────────
    t("l2-et-access + multi-VRF → warn",
      run_('RED,BLUE', '10,20', '', 'l2-et-access')[0].sev, 'warn'),
    t("l2-po-access + multi-VRF → warn",
      run_('RED,BLUE', '10,20', '', 'l2-po-access')[0].sev, 'warn'),
    t("l3-et-int + multi-VRF → warn",
      run_('RED,BLUE', '10,20', '', 'l3-et-int')[0].sev, 'warn'),
    t("l3-po-int + multi-VRF → warn",
      run_('RED,BLUE', '10,20', '', 'l3-po-int')[0].sev, 'warn'),

    // ─── range in vlan_ → warn ────────────────────────────────────────
    t("pure range + multi-VRF → warn",
      run_('RED,BLUE', '10-20', '', 'l3-et-sub-int')[0].sev, 'warn'),
    t("pure range message contains 'range'",
      run_('RED,BLUE', '10-20', '', 'l3-et-sub-int')[0].msg.includes('range'), true),
    t("mixed range+list + multi-VRF → warn",
      run_('RED,BLUE', '10-20,25', '', 'l3-et-sub-int')[0].sev, 'warn'),
    t("mixed range+list message contains 'mixed'",
      run_('RED,BLUE', '10-20,25', '', 'l3-et-sub-int')[0].msg.includes('mixed'), true),

    // ─── sub-int ──────────────────────────────────────────────────────
    t("sub-int: VRF count matches VLAN count → no issues",
      run_('RED,BLUE', '10,20', '', 'l3-et-sub-int').length, 0),
    t("sub-int: VRF count > VLAN count → error",
      run_('RED,BLUE,GREEN', '10,20', '', 'l3-et-sub-int')[0].sev, 'error'),
    t("sub-int: nv<N> token excluded from VLAN count",
      run_('RED,BLUE', '10,20,nv100', '', 'l3-et-sub-int').length, 0),
    t("sub-int: l3-po-sub-int also matched",
      run_('RED,BLUE', '10,20', '', 'l3-po-sub-int').length, 0),

    // ─── trunk: no SVIs ───────────────────────────────────────────────
    t("trunk + empty svi_vlan + multi-VRF → warn",
      run_('RED,BLUE', '10,20', '', 'l2-et-trunk')[0].sev, 'warn'),
    t("l2-po-trunk also triggers trunk checks",
      run_('RED,BLUE', '10,20', '', 'l2-po-trunk')[0].sev, 'warn'),

    // ─── trunk: svi=all (and aliases) ─────────────────────────────────
    t("trunk svi=all: count match → no issues",
      run_('RED,BLUE', '10,20', 'all', 'l2-et-trunk').length, 0),
    t("trunk svi=yes: treated as all → no issues",
      run_('RED,BLUE', '10,20', 'yes', 'l2-et-trunk').length, 0),
    t("trunk svi=1: treated as all → no issues",
      run_('RED,BLUE', '10,20', '1', 'l2-et-trunk').length, 0),
    t("trunk svi=all: VRF count mismatch → error",
      run_('RED,BLUE,GREEN', '10,20', 'all', 'l2-et-trunk')[0].sev, 'error'),

    // ─── trunk: explicit svi_vlan list ────────────────────────────────
    t("trunk explicit svi_vlan: count match → no issues",
      run_('RED,BLUE', '10,20,30', '10,20', 'l2-et-trunk').length, 0),
    t("trunk explicit svi_vlan: VRF count mismatch → error",
      run_('RED,BLUE,GREEN', '10,20,30', '10,20', 'l2-et-trunk')[0].sev, 'error'),
  ];
}

// ── parseVlanWithNative ────────────────────────────────────────────────────────

function test_parseVlanWithNative() {
  const t = assert_;
  return [
    t("empty string → no native, no vlans",
      parseVlanWithNative(''),
      { native: null, vlans: '' }),
    t("null → no native, no vlans",
      parseVlanWithNative(null),
      { native: null, vlans: '' }),
    t("plain vlans, no native token",
      parseVlanWithNative('10,20,30'),
      { native: null, vlans: '10,20,30' }),
    t("native token only",
      parseVlanWithNative('nv100'),
      { native: '100', vlans: '' }),
    t("native token at start",
      parseVlanWithNative('nv100,10,20'),
      { native: '100', vlans: '10,20' }),
    t("native token at end",
      parseVlanWithNative('10,20,nv100'),
      { native: '100', vlans: '10,20' }),
    t("native token in middle",
      parseVlanWithNative('10,nv100,20'),
      { native: '100', vlans: '10,20' }),
    t("uppercase NV accepted",
      parseVlanWithNative('NV200,10'),
      { native: '200', vlans: '10' }),
    t("only first nv token used; second treated as invalid token (kept in rest)",
      parseVlanWithNative('nv10,nv20,30'),
      { native: '10', vlans: 'nv20,30' }),
    t("range token preserved alongside native",
      parseVlanWithNative('10-20,nv100'),
      { native: '100', vlans: '10-20' }),
    t("single VLAN no native",
      parseVlanWithNative('42'),
      { native: null, vlans: '42' }),
  ];
}


// ── getPhysicalPortParent ──────────────────────────────────────────────────────

function test_getPhysicalPortParent() {
  const t = assert_;
  // Normalizes the lane suffix to /1 so all breakout lanes of the same physical
  // transceiver collapse to a single lane-1 anchor (a valid EOS port name).
  // The aggX guard in buildCableGroups ensures this is only called for confirmed
  // QSFP-DD breakout ports (xcvr_speed_ matches Xg-N or Xt-N format).
  return [
    t("null → empty string",                              getPhysicalPortParent(null),       ""),
    t("empty string → empty string",                      getPhysicalPortParent(""),         ""),
    t("Et1 (no slash) → unchanged",                      getPhysicalPortParent("Et1"),      "Et1"),
    t("Et14/1 pizza-box lane 1 → unchanged",             getPhysicalPortParent("Et14/1"),   "Et14/1"),
    t("Et14/4 pizza-box lane 4 → Et14/1",                getPhysicalPortParent("Et14/4"),   "Et14/1"),
    t("Et5/22/1 modular lane 1 → unchanged",             getPhysicalPortParent("Et5/22/1"), "Et5/22/1"),
    t("Et5/22/3 modular lane 3 → Et5/22/1",             getPhysicalPortParent("Et5/22/3"), "Et5/22/1"),
    t("Et1/1/2 multi-level → Et1/1/1",                   getPhysicalPortParent("Et1/1/2"),  "Et1/1/1"),
    t("Et5/abc non-numeric last part → unchanged",       getPhysicalPortParent("Et5/abc"),  "Et5/abc"),
  ];
}


// ── compressPortList ───────────────────────────────────────────────────────────

function test_compressPortList() {
  const t = assert_;
  return [
    t("empty array → empty string",      compressPortList([]),                        ""),
    t("single port → that port",         compressPortList(["Et1"]),                   "Et1"),
    t("already sorted 3 ports",          compressPortList(["Et1", "Et2", "Et3"]),     "Et1, Et2, Et3"),
    t("unsorted → sorts numerically",    compressPortList(["Et3", "Et1", "Et2"]),     "Et1, Et2, Et3"),
    t("slash ports sorted numerically",  compressPortList(["Et14/4","Et14/2","Et14/1","Et14/3"]), "Et14/1, Et14/2, Et14/3, Et14/4"),
    t("mixed Arista port names",         compressPortList(["Et10", "Et2", "Et1"]),    "Et1, Et2, Et10"),
  ];
}


// ── _breakoutSides ─────────────────────────────────────────────────────────────

function test_breakoutSides() {
  const t = assert_;

  // Helper: build a minimal group object
  const grp = (speedA, speedB, links, isBreakoutA, isBreakoutB) => ({
    speedA, speedB, isBreakoutA, isBreakoutB,
    links: Array.from({ length: links }, (_, i) => ({ portA: `Et14/${i+1}`, portB: `Et${i+1}` }))
  });

  return [
    t("single link → both false",
      _breakoutSides(grp("10g", "10g", 1, false, false)),          { a: false, b: false }),

    t("Scenario A — both sides 100g-4, 4 links → both false (neither is Breakout label)",
      _breakoutSides(grp("100g-4", "100g-4", 4, true, true)),      { a: false, b: false }),

    t("Scenario C — A=100g-4 (QSFP), B=25g (SFP), 4 links → a=false, b=true",
      _breakoutSides(grp("100g-4", "25g", 4, true, false)),        { a: false, b: true }),

    t("Scenario C reversed — A=25g (SFP), B=100g-4 (QSFP), 4 links → a=true, b=false",
      _breakoutSides(grp("25g", "100g-4", 4, false, true)),        { a: true, b: false }),

    t("speed ratio fallback — A=100g, B=25g, 4 links",
      _breakoutSides(grp("100g", "25g", 4, false, false)),         { a: false, b: true }),

    t("slash fallback — A has slash, B doesn't → a=false (QSFP), b=true (SFP)",
      _breakoutSides(grp("", "", 4, true, false)),                  { a: false, b: true }),

    t("auto speed treated as empty → slash fallback",
      _breakoutSides(grp("auto", "auto", 4, true, false)),         { a: false, b: true }),

    // 1.6t-8 (OSFP-RHS / 1.6 Tbps, 8×200G) — old g-only regex missed this
    t("1.6t-8 QSFP aggregate (A), 200g SFP lanes (B), 8 links → a=false, b=true",
      _breakoutSides(grp("1.6t-8", "200g", 8, true, false)),       { a: false, b: true }),
    t("1.6t-8 QSFP aggregate (B), 200g SFP lanes (A), 8 links → a=true, b=false",
      _breakoutSides(grp("200g", "1.6t-8", 8, false, true)),       { a: true, b: false }),
    t("1.6t-8 both sides Scenario A → both false (neither is Breakout label)",
      _breakoutSides(grp("1.6t-8", "1.6t-8", 8, true, true)),     { a: false, b: false }),
  ];
}


// ── _buildCableGroupsForTest ───────────────────────────────────────────────────

function test_buildCableGroupsForTest() {
  const t = assert_;
  const results = [];

  // ── Scenario B: standard single cable ────────────────────────────────────────
  (function() {
    const links = [{ u: "leaf1:Et1", v: "spine1:Et2" }];
    const nodes = {
      "leaf1:Et1":  { device: "leaf1",  name: "Et1",  details: { xcvr_type_: "SFP", et_speed_: "10g" } },
      "spine1:Et2": { device: "spine1", name: "Et2",  details: { xcvr_type_: "SFP", et_speed_: "10g" } }
    };
    const devs = { leaf1: { type: "arista" }, spine1: { type: "arista" } };
    const g = _buildCableGroupsForTest(links, nodes, devs);
    const keys = Object.keys(g);
    results.push(t("Scenario B — 1 group created",            keys.length, 1));
    results.push(t("Scenario B — key is dev:port <-> dev:port", keys[0], "leaf1:Et1 <-> spine1:Et2"));
    results.push(t("Scenario B — isBreakoutA false",          g[keys[0]].isBreakoutA, false));
    results.push(t("Scenario B — isBreakoutB false",          g[keys[0]].isBreakoutB, false));
    results.push(t("Scenario B — 1 link in group",            g[keys[0]].links.length, 1));
    results.push(t("Scenario B — portA correct",              g[keys[0]].links[0].portA, "Et1"));
    results.push(t("Scenario B — portB correct",              g[keys[0]].links[0].portB, "Et2"));
  })();

  // ── Scenario A: breakout-to-breakout (both multi-lane transceivers) ───────────
  (function() {
    const makeNode = (dev, port) => ({
      device: dev, name: port, details: { xcvr_speed_: "100g-4", xcvr_type_: "QSFP-DD" }
    });
    const links = [1,2,3,4].map(i => ({ u: `leaf1:Et14/${i}`, v: `spine1:Et48/${i}` }));
    const nodes = {};
    [1,2,3,4].forEach(i => {
      nodes[`leaf1:Et14/${i}`]  = makeNode("leaf1",  `Et14/${i}`);
      nodes[`spine1:Et48/${i}`] = makeNode("spine1", `Et48/${i}`);
    });
    const devs = { leaf1: { type: "arista" }, spine1: { type: "arista" } };
    const g = _buildCableGroupsForTest(links, nodes, devs);
    const keys = Object.keys(g);
    results.push(t("Scenario A — collapsed into 1 group",     keys.length, 1));
    results.push(t("Scenario A — key uses phyPort on both",   keys[0], "leaf1:Et14/1 <-> spine1:Et48/1"));
    results.push(t("Scenario A — isBreakoutA true",           g[keys[0]].isBreakoutA, true));
    results.push(t("Scenario A — isBreakoutB true",           g[keys[0]].isBreakoutB, true));
    results.push(t("Scenario A — phyA is Et14/1",             g[keys[0]].phyA, "Et14/1"));
    results.push(t("Scenario A — phyB is Et48/1",             g[keys[0]].phyB, "Et48/1"));
    results.push(t("Scenario A — 4 links in group",           g[keys[0]].links.length, 4));
  })();

  // ── Scenario C: mixed breakout (QSFP-DD → N individual SFP ports) ────────────
  (function() {
    const links = [1,2,3,4].map(i => ({ u: `leaf1:Et14/${i}`, v: `server1:Et${i}` }));
    const nodes = {};
    [1,2,3,4].forEach(i => {
      nodes[`leaf1:Et14/${i}`] = { device: "leaf1",   name: `Et14/${i}`, details: { xcvr_speed_: "100g-4", xcvr_type_: "QSFP-DD" } };
      nodes[`server1:Et${i}`]  = { device: "server1", name: `Et${i}`,   details: { xcvr_speed_: "25g",    xcvr_type_: "SFP" } };
    });
    const devs = { leaf1: { type: "arista" }, server1: { type: "arista" } };
    const g = _buildCableGroupsForTest(links, nodes, devs);
    const keys = Object.keys(g);
    results.push(t("Scenario C — collapsed into 1 group",     keys.length, 1));
    results.push(t("Scenario C — key uses phyPortA, plain B", keys[0], "leaf1:Et14/1 <-> server1"));
    results.push(t("Scenario C — isBreakoutA true",           g[keys[0]].isBreakoutA, true));
    results.push(t("Scenario C — isBreakoutB false",          g[keys[0]].isBreakoutB, false));
    results.push(t("Scenario C — phyA is Et14/1",             g[keys[0]].phyA, "Et14/1"));
    results.push(t("Scenario C — 4 links in group",           g[keys[0]].links.length, 4));
  })();

  // ── Snake self-loop (same device both ends) ───────────────────────────────────
  (function() {
    const links = [{ u: "bkd566:Et14/4", v: "bkd566:Et48", type: "snake" }];
    const nodes = {
      "bkd566:Et14/4": { device: "bkd566", name: "Et14/4", details: { xcvr_speed_: "100g-4" } },
      "bkd566:Et48":   { device: "bkd566", name: "Et48",   details: {} }
    };
    const devs = { bkd566: { type: "arista" } };
    const g = _buildCableGroupsForTest(links, nodes, devs);
    const keys = Object.keys(g);
    results.push(t("Snake — 1 group created",                 keys.length, 1));
    results.push(t("Snake — key uses raw port names (no parent-stripping)",
      keys[0], "bkd566:Et14/4 <-> bkd566:Et48"));
    results.push(t("Snake — isBreakoutA false (self-loop suppressed)", g[keys[0]].isBreakoutA, false));
    results.push(t("Snake — isBreakoutB false (self-loop suppressed)", g[keys[0]].isBreakoutB, false));
    results.push(t("Snake — phyA is raw port Et14/4",         g[keys[0]].phyA, "Et14/4"));
    results.push(t("Snake — phyB is raw port Et48",           g[keys[0]].phyB, "Et48"));
    results.push(t("Snake — 1 link in group (Scenario B)",    g[keys[0]].links.length, 1));
  })();

  // ── Non-Arista device (card/port slash notation must not trigger breakout) ────
  (function() {
    const links = [{ u: "arista1:Et1", v: "ixia1:Et5/22" }];
    const nodes = {
      "arista1:Et1":  { device: "arista1", name: "Et1",    details: {} },
      "ixia1:Et5/22": { device: "ixia1",   name: "Et5/22", details: {} }
    };
    const devs = { arista1: { type: "arista" }, ixia1: { type: "non-arista" } };
    const g = _buildCableGroupsForTest(links, nodes, devs);
    const keys = Object.keys(g);
    results.push(t("Non-Arista — 1 group created",            keys.length, 1));
    results.push(t("Non-Arista — key preserves raw IXIA port name",
      keys[0], "arista1:Et1 <-> ixia1:Et5/22"));
    results.push(t("Non-Arista — isBreakoutB false (slash suppressed for non-Arista)",
      g[keys[0]].isBreakoutB, false));
  })();

  // ── Case 3: both ports have slash, only A has aggregate xcvr_speed_ ─────────
  // isBreakoutA=true, isBreakoutB=true, aggA truthy, aggB null → "DEV_A:phyA <-> DEV_B"
  (function() {
    const links = [1,2,3,4].map(i => ({ u: `leaf1:Et14/${i}`, v: `spine1:Et5/${i}` }));
    const nodes = {};
    [1,2,3,4].forEach(i => {
      nodes[`leaf1:Et14/${i}`] = { device: "leaf1",  name: `Et14/${i}`, details: { xcvr_speed_: "100g-4" } };
      nodes[`spine1:Et5/${i}`] = { device: "spine1", name: `Et5/${i}`,  details: { xcvr_speed_: "25g" } };
    });
    const devs = { leaf1: { type: "arista" }, spine1: { type: "arista" } };
    const g = _buildCableGroupsForTest(links, nodes, devs);
    const keys = Object.keys(g);
    results.push(t("Case 3 (both slash, only A agg) — 1 group", keys.length, 1));
    results.push(t("Case 3 — key uses phyA, plain devB",         keys[0], "leaf1:Et14/1 <-> spine1"));
    results.push(t("Case 3 — isBreakoutA true",                  g[keys[0]].isBreakoutA, true));
    results.push(t("Case 3 — isBreakoutB true",                  g[keys[0]].isBreakoutB, true));
    results.push(t("Case 3 — phyA is Et14/1",                    g[keys[0]].phyA, "Et14/1"));
    results.push(t("Case 3 — 4 links in group",                  g[keys[0]].links.length, 4));
  })();

  // ── Case 4: both ports have slash, only B has aggregate xcvr_speed_ ─────────
  // isBreakoutA=true, isBreakoutB=true, aggA null, aggB truthy → "DEV_A <-> DEV_B:phyB"
  (function() {
    const links = [1,2,3,4].map(i => ({ u: `leaf1:Et5/${i}`, v: `spine1:Et48/${i}` }));
    const nodes = {};
    [1,2,3,4].forEach(i => {
      nodes[`leaf1:Et5/${i}`]  = { device: "leaf1",  name: `Et5/${i}`,  details: { xcvr_speed_: "25g" } };
      nodes[`spine1:Et48/${i}`] = { device: "spine1", name: `Et48/${i}`, details: { xcvr_speed_: "100g-4" } };
    });
    const devs = { leaf1: { type: "arista" }, spine1: { type: "arista" } };
    const g = _buildCableGroupsForTest(links, nodes, devs);
    const keys = Object.keys(g);
    results.push(t("Case 4 (both slash, only B agg) — 1 group", keys.length, 1));
    results.push(t("Case 4 — key uses plain devA, phyB",         keys[0], "leaf1 <-> spine1:Et48/1"));
    results.push(t("Case 4 — isBreakoutA true",                  g[keys[0]].isBreakoutA, true));
    results.push(t("Case 4 — isBreakoutB true",                  g[keys[0]].isBreakoutB, true));
    results.push(t("Case 4 — phyB is Et48/1",                    g[keys[0]].phyB, "Et48/1"));
    results.push(t("Case 4 — 4 links in group",                  g[keys[0]].links.length, 4));
  })();

  // ── Scenario C reversed: B is QSFP aggregate, A ports are individual SFP ────
  // isBreakoutA=false (no slash), isBreakoutB=true (slash + aggB) → "DEV_A <-> DEV_B:phyB"
  (function() {
    const links = [1,2,3,4].map(i => ({ u: `server1:Et${i}`, v: `spine1:Et48/${i}` }));
    const nodes = {};
    [1,2,3,4].forEach(i => {
      nodes[`server1:Et${i}`]   = { device: "server1", name: `Et${i}`,   details: { xcvr_speed_: "25g",    xcvr_type_: "SFP" } };
      nodes[`spine1:Et48/${i}`] = { device: "spine1",  name: `Et48/${i}`, details: { xcvr_speed_: "100g-4", xcvr_type_: "QSFP-DD" } };
    });
    const devs = { server1: { type: "arista" }, spine1: { type: "arista" } };
    const g = _buildCableGroupsForTest(links, nodes, devs);
    const keys = Object.keys(g);
    results.push(t("Scenario C (B is QSFP) — 1 group",     keys.length, 1));
    results.push(t("Scenario C (B is QSFP) — key plain A, phyB", keys[0], "server1 <-> spine1:Et48/1"));
    results.push(t("Scenario C (B is QSFP) — isBreakoutA false", g[keys[0]].isBreakoutA, false));
    results.push(t("Scenario C (B is QSFP) — isBreakoutB true",  g[keys[0]].isBreakoutB, true));
    results.push(t("Scenario C (B is QSFP) — phyB is Et48/1",    g[keys[0]].phyB, "Et48/1"));
    results.push(t("Scenario C (B is QSFP) — 4 links in group",  g[keys[0]].links.length, 4));
  })();

  // ── 1.6t-8: OSFP-RHS 8-lane transceiver (old g-only regex missed this) ──────
  (function() {
    const links = [1,2,3,4,5,6,7,8].map(i => ({ u: `leaf1:Et14/${i}`, v: `server1:Et${i}` }));
    const nodes = {};
    [1,2,3,4,5,6,7,8].forEach(i => {
      nodes[`leaf1:Et14/${i}`] = { device: "leaf1",   name: `Et14/${i}`, details: { xcvr_speed_: "1.6t-8" } };
      nodes[`server1:Et${i}`]  = { device: "server1", name: `Et${i}`,   details: { xcvr_speed_: "200g" } };
    });
    const devs = { leaf1: { type: "arista" }, server1: { type: "arista" } };
    const g = _buildCableGroupsForTest(links, nodes, devs);
    const keys = Object.keys(g);
    results.push(t("1.6t-8 Scenario C — collapsed to 1 group",   keys.length, 1));
    results.push(t("1.6t-8 Scenario C — key uses phyPortA",       keys[0], "leaf1:Et14/1 <-> server1"));
    results.push(t("1.6t-8 Scenario C — isBreakoutA true",        g[keys[0]].isBreakoutA, true));
    results.push(t("1.6t-8 Scenario C — 8 links in group",        g[keys[0]].links.length, 8));
  })();

  // ── Modular chassis native SFP (2-level slash, no aggX) → Scenario B ───────────
  // Et{slot}/{port} with plain speed (no -N suffix) must NOT trigger breakout grouping.
  // Each link stays as its own Scenario B group with raw port names.
  (function() {
    const links = [
      { u: "leaf1:Et3/1", v: "server1:Et1" },
      { u: "leaf1:Et3/2", v: "server2:Et1" },
    ];
    const nodes = {
      "leaf1:Et3/1":   { device: "leaf1",   name: "Et3/1", details: { xcvr_speed_: "25g" } },
      "leaf1:Et3/2":   { device: "leaf1",   name: "Et3/2", details: { xcvr_speed_: "25g" } },
      "server1:Et1":   { device: "server1", name: "Et1",   details: { xcvr_speed_: "25g" } },
      "server2:Et1":   { device: "server2", name: "Et1",   details: { xcvr_speed_: "25g" } },
    };
    const devs = { leaf1: { type: "arista" }, server1: { type: "arista" }, server2: { type: "arista" } };
    const g = _buildCableGroupsForTest(links, nodes, devs);
    const keys = Object.keys(g);
    results.push(t("Chassis native SFP (2-level, no aggX) — 2 separate Scenario B groups", keys.length, 2));
    results.push(t("Chassis native SFP — key preserves raw slot/port notation",
      keys.includes("leaf1:Et3/1 <-> server1:Et1"), true));
    results.push(t("Chassis native SFP — isBreakoutA false (no aggX, no grouping)",
      g["leaf1:Et3/1 <-> server1:Et1"].isBreakoutA, false));
  })();

  // ── QSFP100 4x25G breakout: xcvr_speed_=25g (per-lane) + xcvr_type_=QSFP100 → IS breakout ──
  // Regression: !!aggA alone misses QSFP100 in 4x25G mode where xcvr_speed_ stores
  // the per-lane speed ("25g"), not the aggregate ("100g-4"). xcvr_type_ starts with QSFP
  // so isMultiLaneA=true and the 4 links group correctly.
  (function() {
    const links = [1,2,3,4].map(i => ({ u: `gd435:Et1/${i}`, v: `cal423:Et${i}` }));
    const nodes = {};
    [1,2,3,4].forEach(i => {
      nodes[`gd435:Et1/${i}`]  = { device: "gd435",  name: `Et1/${i}`, details: { xcvr_speed_: "25g", xcvr_type_: "QSFP100" } };
      nodes[`cal423:Et${i}`]   = { device: "cal423", name: `Et${i}`,   details: { xcvr_speed_: "25g", xcvr_type_: "SFP25"   } };
    });
    const devs = { gd435: { type: "arista" }, cal423: { type: "arista" } };
    const g = _buildCableGroupsForTest(links, nodes, devs);
    const keys = Object.keys(g);
    results.push(t("QSFP100 4x25G — grouped into 1 split cable",    keys.length, 1));
    results.push(t("QSFP100 4x25G — key uses Et1 as parent",        keys[0], "gd435:Et1 <-> cal423"));
    results.push(t("QSFP100 4x25G — isBreakoutA true",              g[keys[0]].isBreakoutA, true));
    results.push(t("QSFP100 4x25G — isBreakoutB false (SFP25)",     g[keys[0]].isBreakoutB, false));
    results.push(t("QSFP100 4x25G — 4 links in group",              g[keys[0]].links.length, 4));
  })();

  // ── QSFP100 4x25G breakout: xcvr_speed_ absent (blank sheet col) + xcvr_type_=QSFP100 ──
  // Real-world case: xcvr_speed_ column not filled in; xcvr_type_ alone must trigger grouping.
  (function() {
    const links = [1,2,3,4].map(i => ({ u: `gd435:Et1/${i}`, v: `cal423:Et${i}` }));
    const nodes = {};
    [1,2,3,4].forEach(i => {
      nodes[`gd435:Et1/${i}`]  = { device: "gd435",  name: `Et1/${i}`, details: { xcvr_type_: "QSFP100" } }; // xcvr_speed_ missing
      nodes[`cal423:Et${i}`]   = { device: "cal423", name: `Et${i}`,   details: { xcvr_type_: "SFP25"   } };
    });
    const devs = { gd435: { type: "arista" }, cal423: { type: "arista" } };
    const g = _buildCableGroupsForTest(links, nodes, devs);
    const keys = Object.keys(g);
    results.push(t("QSFP100 no xcvr_speed_ — grouped into 1 split cable", keys.length, 1));
    results.push(t("QSFP100 no xcvr_speed_ — isBreakoutA true",           g[keys[0]].isBreakoutA, true));
    results.push(t("QSFP100 no xcvr_speed_ — isBreakoutB false (SFP25)",  g[keys[0]].isBreakoutB, false));
    results.push(t("QSFP100 no xcvr_speed_ — 4 links in group",           g[keys[0]].links.length, 4));
  })();

  // ── Modular chassis QSFP breakout (3-level, aggX) → Et{slot}/{port}/1 anchor ──
  // Et5/22/1..4 with aggX xcvr_speed_ must collapse to Et5/22/1 (3-level anchor).
  (function() {
    const links = [1,2,3,4].map(i => ({ u: `leaf1:Et5/22/${i}`, v: `server1:Et${i}` }));
    const nodes = {};
    [1,2,3,4].forEach(i => {
      nodes[`leaf1:Et5/22/${i}`] = { device: "leaf1",   name: `Et5/22/${i}`, details: { xcvr_speed_: "100g-4", xcvr_type_: "QSFP-DD" } };
      nodes[`server1:Et${i}`]    = { device: "server1", name: `Et${i}`,      details: { xcvr_speed_: "25g",    xcvr_type_: "SFP" } };
    });
    const devs = { leaf1: { type: "arista" }, server1: { type: "arista" } };
    const g = _buildCableGroupsForTest(links, nodes, devs);
    const keys = Object.keys(g);
    results.push(t("Chassis QSFP 3-level — collapsed into 1 group",          keys.length, 1));
    results.push(t("Chassis QSFP 3-level — key uses Et5/22/1 anchor",        keys[0], "leaf1:Et5/22/1 <-> server1"));
    results.push(t("Chassis QSFP 3-level — isBreakoutA true",                g[keys[0]].isBreakoutA, true));
    results.push(t("Chassis QSFP 3-level — phyA normalized to Et5/22/1",     g[keys[0]].phyA, "Et5/22/1"));
    results.push(t("Chassis QSFP 3-level — 4 links in group",                g[keys[0]].links.length, 4));
  })();

  // ── Missing node (link.u or link.v not in nodesData) → skipped silently ──────
  (function() {
    const links = [{ u: "leaf1:Et1", v: "ghost1:Et99" }];
    const nodes = { "leaf1:Et1": { device: "leaf1", name: "Et1", details: {} } };
    const devs  = { leaf1: { type: "arista" } };
    const g = _buildCableGroupsForTest(links, nodes, devs);
    results.push(t("Missing node — link skipped, 0 groups", Object.keys(g).length, 0));
  })();

  return results;
}


// ── generateSnakeStaticConfig ──────────────────────────────────────────────────
//
// Tests the pure config-generation function for the L3 snake VRF chain.
// No GAS API dependencies — runs entirely server-side.
//
// Conventions used by the function:
//   subnet   = {p2p_v4_first}.{Math.floor(vlan/100)}.{vlan%100}  (VLAN 200 → 200.2.0.x)
//   remoteIp = subnet.2   (far-end ARP target, mapped to bridge MAC via static ARP)
//   fwdDest  = ep2_subnet ? "${ep2_subnet}.98/32" : "10.99.99.98/32"
//   revDest  = ep1_subnet ? "${ep1_subnet}.99/32" : "10.99.99.99/32"
//   PRIMARY routes: fwd always + rev terminal (ep1_nh) or rev chain (egress-vrf prev.secondary)
//   SECONDARY routes: fwd terminal (ep2_nh) or fwd chain (egress-vrf next.primary) + rev always

function test_generateSnakeStaticConfig() {
  const t = assert_;
  const results = [];

  const MAC   = '001c.7300.abcd';
  const E1MAC = '0000.1111.aaaa';  // EP1 MAC (indirect — traffic gen behind router)
  const E1NH  = '192.168.1.1';     // EP1 traffic gen port IP (reverse chain terminal NH)
  const E1SUB = '10.100.1';        // EP1 subnet prefix (revRoute = E1SUB.0/24)
  const E2MAC = '0000.aaaa.bbbb';  // EP2 MAC (indirect)
  const E2NH  = '200.15.0.2';      // EP2 traffic gen port IP (forward chain terminal NH)
  const E2SUB = '172.16.1';        // EP2 subnet prefix (fwdRoute = E2SUB.0/24)
  const BASE  = '200';

  // Helper: base prefs (bridge MAC set, no EP1/EP2 NH/MAC/subnet)
  const prefsBase = (extra) => Object.assign(
    { p2p_v4_first: BASE, bridge_mac: MAC,
      ep1_nh: '', ep1_mac: '', ep1_subnet: '',
      ep2_nh: '', ep2_mac: '', ep2_subnet: '' },
    extra || {}
  );
  // Full prefs: both EP1 and EP2 NH + MAC + subnet set (indirect endpoints, full routing)
  const prefsFull = () => prefsBase({
    ep1_nh: E1NH, ep1_mac: E1MAC, ep1_subnet: E1SUB,
    ep2_nh: E2NH, ep2_mac: E2MAC, ep2_subnet: E2SUB
  });

  // ── T1/T2: empty / null pairs → empty string ──────────────────────────────
  results.push(t("empty pairs → empty string",
    generateSnakeStaticConfig([], prefsBase()),   ""));
  results.push(t("null pairs → empty string",
    generateSnakeStaticConfig(null, prefsBase()), ""));

  // ── T3: bridge MAC missing → comment block only ───────────────────────────
  (function() {
    const pairs = [{ primaryPort: 'Et2', secondaryPort: 'Et3', vlan: 200 }];
    const out = generateSnakeStaticConfig(pairs, prefsBase({ bridge_mac: '' }));
    results.push(t("no bridge_mac — first comment line",
      out.split('\n')[0], '! Snake VRF Chain: Bridge MAC not configured'));
    results.push(t("no bridge_mac — second comment line",
      out.split('\n')[1], '! Set Bridge MAC in Auto Config settings to generate ARP + routing entries'));
    results.push(t("no bridge_mac — no ARP lines emitted",
      out.includes('arp vrf'), false));
  })();

  // ── T4: single pair, bridge MAC only, no subnets/NH ─────────────────────
  // No ep1_subnet/ep2_subnet → no static routes; ARP skeleton only
  (function() {
    const pairs = [{ primaryPort: 'Et2', secondaryPort: 'Et3', vlan: 200 }];
    const out = generateSnakeStaticConfig(pairs, prefsBase());
    const lines = out.split('\n');
    results.push(t("single pair — header mentions Bidirectional",
      lines[0].includes('Bidirectional'), true));
    results.push(t("single pair — no subnet comment",
      out.includes('ARP skeleton only'), true));
    results.push(t("single pair — pair comment",
      out.includes('! Pair 1: Et2 <-> Et3 (VLAN 200, subnet 200.2.0.0/24)'), true));
    results.push(t("single pair — primary ARP (bridge MAC)",
      out.includes('arp vrf SNAKE_Et2') && out.includes('200.2.0.2 001c.7300.abcd arpa'), true));
    results.push(t("single pair — secondary ARP (bridge MAC)",
      out.includes('arp vrf SNAKE_Et3') && out.includes('200.2.0.2 001c.7300.abcd arpa'), true));
    results.push(t("single pair — no static routes emitted",
      out.includes('ip route vrf'), false));
    results.push(t("single pair — trailing separator",
      lines[lines.length - 1], '!'));
  })();

  // ── T5: VLAN 1500 subnet formula ──────────────────────────────────────────
  // floor(1500/100)=15, 1500%100=0 → subnet 200.15.0.x, remoteIp=200.15.0.2
  // No ep subnets → ARP only, no routes
  (function() {
    const pairs = [{ primaryPort: 'Et2', secondaryPort: 'Et3', vlan: 1500 }];
    const out = generateSnakeStaticConfig(pairs, prefsBase());
    results.push(t("VLAN 1500 — subnet comment 200.15.0.0/24",
      out.includes('subnet 200.15.0.0/24'), true));
    results.push(t("VLAN 1500 — ARP target 200.15.0.2",
      out.includes('200.15.0.2 001c.7300.abcd arpa'), true));
    results.push(t("VLAN 1500 — no static routes (no subnets)",
      out.includes('ip route vrf'), false));
  })();

  // ── T6: single pair, full EP1+EP2 (indirect — both NH+MAC+subnet set) ────
  // Both endpoints have static ARP + /24 routes; no placeholder comments
  (function() {
    const pairs = [{ primaryPort: 'Et2', secondaryPort: 'Et3', vlan: 200 }];
    const out = generateSnakeStaticConfig(pairs, prefsFull());
    results.push(t("full single — EP2 static ARP at last secondary",
      out.includes(`arp vrf SNAKE_Et3 ${E2NH} ${E2MAC} arpa`), true));
    results.push(t("full single — EP2 forward /24 route at last secondary",
      out.includes(`ip route vrf SNAKE_Et3 ${E2SUB}.0/24 ${E2NH}`), true));
    results.push(t("full single — EP1 static ARP at first primary",
      out.includes(`arp vrf SNAKE_Et2 ${E1NH} ${E1MAC} arpa`), true));
    results.push(t("full single — EP1 reverse /24 route at first primary",
      out.includes(`ip route vrf SNAKE_Et2 ${E1SUB}.0/24 ${E1NH}`), true));
    results.push(t("full single — no NH placeholder comments",
      out.includes('NH not set'), false));
    results.push(t("full single — no /32 routes emitted",
      /ip route vrf SNAKE_\S+ \S+\/32/.test(out), false));
  })();

  // ── T7: custom ep2_subnet only → fwdRoute is /24, no reverse routes ──────
  (function() {
    const pairs = [{ primaryPort: 'Et2', secondaryPort: 'Et3', vlan: 200 }];
    const prefs = prefsBase({ ep2_mac: E2MAC, ep2_nh: '172.16.1.2', ep2_subnet: '172.16.1' });
    const out = generateSnakeStaticConfig(pairs, prefs);
    results.push(t("custom ep2_subnet — primary fwd uses /24 route",
      out.includes('ip route vrf SNAKE_Et2 172.16.1.0/24 200.2.0.2'), true));
    results.push(t("custom ep2_subnet — no /32 route emitted",
      out.includes('ip route vrf SNAKE_Et2 172.16.1.98/32'), false));
    results.push(t("custom ep2_subnet — EP2 terminal fwd /24 route",
      out.includes('ip route vrf SNAKE_Et3 172.16.1.0/24 172.16.1.2'), true));
    results.push(t("custom ep2_subnet — no reverse routes (no ep1_subnet)",
      out.includes('ip route vrf SNAKE_Et3 10.'), false));
  })();

  // ── T8: two pairs — forward egress-vrf chain + reverse egress-vrf ─────────
  // Pair 1: Et2<->Et3 VLAN 200 (200.2.0.x); Pair 2: Et4<->Et5 VLAN 400 (200.4.0.x)
  // Forward: SNAKE_Et3 → egress-vrf SNAKE_Et4 200.4.0.2
  // Reverse: SNAKE_Et4 → egress-vrf SNAKE_Et3 200.2.0.2
  (function() {
    const pairs = [
      { primaryPort: 'Et2', secondaryPort: 'Et3', vlan: 200 },
      { primaryPort: 'Et4', secondaryPort: 'Et5', vlan: 400 }
    ];
    const out = generateSnakeStaticConfig(pairs, prefsFull());
    results.push(t("2 pairs — pair 1 secondary fwd egress-vrf to SNAKE_Et4",
      out.includes(`ip route vrf SNAKE_Et3 ${E2SUB}.0/24 egress-vrf SNAKE_Et4 200.4.0.2`), true));
    results.push(t("2 pairs — pair 2 primary rev egress-vrf to SNAKE_Et3",
      out.includes(`ip route vrf SNAKE_Et4 ${E1SUB}.0/24 egress-vrf SNAKE_Et3 200.2.0.2`), true));
    results.push(t("2 pairs — pair 2 primary ARP (VLAN 400 → 200.4.0.2)",
      out.includes('200.4.0.2 001c.7300.abcd arpa'), true));
    results.push(t("2 pairs — pair 2 primary forward route",
      out.includes(`ip route vrf SNAKE_Et4 ${E2SUB}.0/24 200.4.0.2`), true));
    results.push(t("2 pairs — last secondary EP2 ARP",
      out.includes(`arp vrf SNAKE_Et5 ${E2NH} ${E2MAC} arpa`), true));
    results.push(t("2 pairs — last secondary EP2 forward route",
      out.includes(`ip route vrf SNAKE_Et5 ${E2SUB}.0/24 ${E2NH}`), true));
    results.push(t("2 pairs — no placeholder comments",
      out.includes('NH not set'), false));
  })();

  // ── T9: three pairs — full bidirectional egress-vrf chain ─────────────────
  // Pair 1 Et2<->Et3 VLAN 200; Pair 2 Et4<->Et5 VLAN 400; Pair 3 Et6<->Et7 VLAN 600
  // Forward: Et3→egress Et4, Et5→egress Et6; Reverse: Et4→egress Et3, Et6→egress Et5
  (function() {
    const pairs = [
      { primaryPort: 'Et2', secondaryPort: 'Et3', vlan: 200 },
      { primaryPort: 'Et4', secondaryPort: 'Et5', vlan: 400 },
      { primaryPort: 'Et6', secondaryPort: 'Et7', vlan: 600 }
    ];
    const out = generateSnakeStaticConfig(pairs, prefsFull());
    results.push(t("3 pairs — pair 1 secondary fwd egress-vrf to Et4",
      out.includes(`ip route vrf SNAKE_Et3 ${E2SUB}.0/24 egress-vrf SNAKE_Et4 200.4.0.2`), true));
    results.push(t("3 pairs — pair 2 secondary fwd egress-vrf to Et6",
      out.includes(`ip route vrf SNAKE_Et5 ${E2SUB}.0/24 egress-vrf SNAKE_Et6 200.6.0.2`), true));
    results.push(t("3 pairs — pair 2 primary rev egress-vrf to Et3",
      out.includes(`ip route vrf SNAKE_Et4 ${E1SUB}.0/24 egress-vrf SNAKE_Et3 200.2.0.2`), true));
    results.push(t("3 pairs — pair 3 primary rev egress-vrf to Et5",
      out.includes(`ip route vrf SNAKE_Et6 ${E1SUB}.0/24 egress-vrf SNAKE_Et5 200.4.0.2`), true));
    results.push(t("3 pairs — last secondary EP2 forward route",
      out.includes(`ip route vrf SNAKE_Et7 ${E2SUB}.0/24 ${E2NH}`), true));
    results.push(t("3 pairs — three pair-comment lines",
      (out.match(/! Pair \d+:/g) || []).length, 3));
  })();

  // ── T10: custom p2p_v4_first base ─────────────────────────────────────────
  // No subnets → ARP only; base octet changes the NH in ARP entries
  (function() {
    const pairs = [{ primaryPort: 'Et2', secondaryPort: 'Et3', vlan: 200 }];
    const out = generateSnakeStaticConfig(pairs, prefsBase({ p2p_v4_first: '10' }));
    results.push(t("custom base — ARP uses 10.2.0.2",
      out.includes('10.2.0.2 001c.7300.abcd arpa'), true));
    results.push(t("custom base — no static routes (no subnets)",
      out.includes('ip route vrf'), false));
  })();

  // ── T_indirect: EP1 indirect (NH+MAC+subnet set), EP2 not configured ──────
  // Reverse routes emitted; no forward routes (no ep2_subnet)
  (function() {
    const pairs = [{ primaryPort: 'Et2', secondaryPort: 'Et3', vlan: 200 }];
    const prefs = prefsBase({ ep1_nh: E1NH, ep1_mac: E1MAC, ep1_subnet: E1SUB });
    const out = generateSnakeStaticConfig(pairs, prefs);
    results.push(t("T_indirect — EP1 static ARP emitted",
      out.includes(`arp vrf SNAKE_Et2 ${E1NH} ${E1MAC} arpa`), true));
    results.push(t("T_indirect — EP1 reverse /24 route at first primary",
      out.includes(`ip route vrf SNAKE_Et2 ${E1SUB}.0/24 ${E1NH}`), true));
    results.push(t("T_indirect — secondary reverse /24 route emitted",
      out.includes(`ip route vrf SNAKE_Et3 ${E1SUB}.0/24 200.2.0.2`), true));
    results.push(t("T_indirect — no forward routes (no ep2_subnet)",
      out.includes('ip route vrf SNAKE_Et2 ') && !out.includes(`ip route vrf SNAKE_Et3 172.`), true));
    results.push(t("T_indirect — no EP2 placeholder (no fwdRoute)",
      out.includes('! SNAKE_Et3: EP2 NH not set'), false));
  })();

  // ── T_ep1_subnet: custom ep1_subnet → revRoute is /24, no forward routes ──
  (function() {
    const pairs = [{ primaryPort: 'Et2', secondaryPort: 'Et3', vlan: 200 }];
    const prefs = prefsBase({ ep1_nh: E1NH, ep1_subnet: '10.100.1' });
    const out = generateSnakeStaticConfig(pairs, prefs);
    results.push(t("custom ep1_subnet — primary rev uses /24 route",
      out.includes(`ip route vrf SNAKE_Et2 10.100.1.0/24 ${E1NH}`), true));
    results.push(t("custom ep1_subnet — no /32 route on primary",
      out.includes(`ip route vrf SNAKE_Et2 10.100.1.99/32`), false));
    results.push(t("custom ep1_subnet — secondary rev uses /24 route",
      out.includes('ip route vrf SNAKE_Et3 10.100.1.0/24 200.2.0.2'), true));
    results.push(t("custom ep1_subnet — no forward routes (no ep2_subnet)",
      out.includes('ip route vrf SNAKE_Et2 10.99.'), false));
  })();

  // ── T_subnet_routes: both subnets set → /24 routes only, no /32 ──────────
  // Pair 1: Et2<->Et3 VLAN 200; Pair 2: Et4<->Et5 VLAN 400
  (function() {
    const pairs = [
      { primaryPort: 'Et2', secondaryPort: 'Et3', vlan: 200 },
      { primaryPort: 'Et4', secondaryPort: 'Et5', vlan: 400 }
    ];
    const out = generateSnakeStaticConfig(pairs, prefsFull());
    // Middle SNAKE_Et3: fwd chain /24, rev /24 — no /32
    results.push(t("T_subnet — Et3 fwd chain /24",
      out.includes(`ip route vrf SNAKE_Et3 ${E2SUB}.0/24 egress-vrf SNAKE_Et4 200.4.0.2`), true));
    results.push(t("T_subnet — Et3 no fwd /32",
      out.includes(`ip route vrf SNAKE_Et3 ${E2SUB}.98/32`), false));
    results.push(t("T_subnet — Et3 rev /24",
      out.includes(`ip route vrf SNAKE_Et3 ${E1SUB}.0/24 200.2.0.2`), true));
    results.push(t("T_subnet — Et3 no rev /32",
      out.includes(`ip route vrf SNAKE_Et3 ${E1SUB}.99/32`), false));
    // Middle SNAKE_Et4: fwd /24, rev chain /24 — no /32
    results.push(t("T_subnet — Et4 fwd /24",
      out.includes(`ip route vrf SNAKE_Et4 ${E2SUB}.0/24 200.4.0.2`), true));
    results.push(t("T_subnet — Et4 rev chain /24",
      out.includes(`ip route vrf SNAKE_Et4 ${E1SUB}.0/24 egress-vrf SNAKE_Et3 200.2.0.2`), true));
    // Terminals: EP1 at Et2 (rev /24), EP2 at Et5 (fwd /24)
    results.push(t("T_subnet — Et2 EP1 rev /24",
      out.includes(`ip route vrf SNAKE_Et2 ${E1SUB}.0/24 ${E1NH}`), true));
    results.push(t("T_subnet — Et5 EP2 fwd /24",
      out.includes(`ip route vrf SNAKE_Et5 ${E2SUB}.0/24 ${E2NH}`), true));
  })();

  // ── T_no_nh: subnets set but no NH → placeholder comments, no crash ───────
  // Interior routes use bridge-MAC NH; only terminals need NH (placeholder if missing)
  (function() {
    const pairs = [
      { primaryPort: 'Et2', secondaryPort: 'Et3', vlan: 200 },
      { primaryPort: 'Et4', secondaryPort: 'Et5', vlan: 400 }
    ];
    const out = generateSnakeStaticConfig(pairs, prefsBase({ ep1_subnet: E1SUB, ep2_subnet: E2SUB }));
    results.push(t("T_no_nh — result is non-empty string",
      out.length > 0, true));
    results.push(t("T_no_nh — EP1 placeholder at first primary",
      out.includes('! SNAKE_Et2: EP1 NH not set'), true));
    results.push(t("T_no_nh — EP2 placeholder at last secondary",
      out.includes('! SNAKE_Et5: EP2 NH not set'), true));
    results.push(t("T_no_nh — bridge ARP still emitted",
      out.includes('arp vrf SNAKE_Et2') && out.includes('arp vrf SNAKE_Et4'), true));
    results.push(t("T_no_nh — interior forward route uses bridge-MAC NH",
      out.includes(`ip route vrf SNAKE_Et2 ${E2SUB}.0/24 200.2.0.2`), true));
  })();

  return results;
}


// ── generateSnakeTtlPbrConfig ──────────────────────────────────────────────────

function test_generateSnakeTtlPbrConfig() {
  const t = assert_;
  const results = [];

  const pairs1 = [{ primaryPort: 'Ethernet1', secondaryPort: 'Ethernet2', vlan: 100 }];
  const pairs2 = [
    { primaryPort: 'Ethernet1', secondaryPort: 'Ethernet2', vlan: 100 },
    { primaryPort: 'Ethernet3', secondaryPort: 'Ethernet4', vlan: 200 }
  ];

  // Empty / null → empty string
  results.push(t("generateSnakeTtlPbrConfig — empty pairs → ''", generateSnakeTtlPbrConfig([]), ""));
  results.push(t("generateSnakeTtlPbrConfig — null → ''",        generateSnakeTtlPbrConfig(null), ""));

  // ACL and route-map header always present
  const single = generateSnakeTtlPbrConfig(pairs1);
  results.push(t("generateSnakeTtlPbrConfig — ACL present",
    single.includes('ip access-list SNAKE_TTL_MATCH'), true));
  results.push(t("generateSnakeTtlPbrConfig — permit ip any any",
    single.includes('10 permit ip any any'), true));
  results.push(t("generateSnakeTtlPbrConfig — route-map present",
    single.includes('route-map SNAKE_SET_TTL permit 10'), true));
  results.push(t("generateSnakeTtlPbrConfig — set ip ttl 64",
    single.includes('set ip ttl 64'), true));

  // Interface stanzas for each port
  results.push(t("generateSnakeTtlPbrConfig — primary interface",
    single.includes('interface Ethernet1'), true));
  results.push(t("generateSnakeTtlPbrConfig — secondary interface",
    single.includes('interface Ethernet2'), true));
  results.push(t("generateSnakeTtlPbrConfig — ip policy on primary",
    single.includes('ip policy route-map SNAKE_SET_TTL'), true));

  // Two pairs — all four interfaces present
  const multi = generateSnakeTtlPbrConfig(pairs2);
  results.push(t("generateSnakeTtlPbrConfig — Et3 present for pair 2",
    multi.includes('interface Ethernet3'), true));
  results.push(t("generateSnakeTtlPbrConfig — Et4 present for pair 2",
    multi.includes('interface Ethernet4'), true));

  return results;
}

// ── generateSnakeTtlTrafficPolicyConfig ────────────────────────────────────────

function test_generateSnakeTtlTrafficPolicyConfig() {
  const t = assert_;
  const results = [];

  const pairs1 = [{ primaryPort: 'Ethernet1', secondaryPort: 'Ethernet2', vlan: 100 }];
  const pairs2 = [
    { primaryPort: 'Ethernet1', secondaryPort: 'Ethernet2', vlan: 100 },
    { primaryPort: 'Ethernet3', secondaryPort: 'Ethernet4', vlan: 200 }
  ];

  // Empty / null → empty string
  results.push(t("generateSnakeTtlTrafficPolicyConfig — empty pairs → ''", generateSnakeTtlTrafficPolicyConfig([]), ""));
  results.push(t("generateSnakeTtlTrafficPolicyConfig — null → ''",        generateSnakeTtlTrafficPolicyConfig(null), ""));

  // traffic-policies block present
  const single = generateSnakeTtlTrafficPolicyConfig(pairs1);
  results.push(t("generateSnakeTtlTrafficPolicyConfig — traffic-policies block",
    single.includes('traffic-policies'), true));
  results.push(t("generateSnakeTtlTrafficPolicyConfig — policy name",
    single.includes('traffic-policy SNAKE_TTL_POLICY'), true));
  results.push(t("generateSnakeTtlTrafficPolicyConfig — match clause",
    single.includes('match SNAKE_ALL ipv4'), true));
  results.push(t("generateSnakeTtlTrafficPolicyConfig — set ip ttl 64",
    single.includes('set ip ttl 64'), true));

  // Interface stanzas — input + output per port
  results.push(t("generateSnakeTtlTrafficPolicyConfig — primary interface",
    single.includes('interface Ethernet1'), true));
  results.push(t("generateSnakeTtlTrafficPolicyConfig — secondary interface",
    single.includes('interface Ethernet2'), true));
  results.push(t("generateSnakeTtlTrafficPolicyConfig — traffic-policy input",
    single.includes('traffic-policy input SNAKE_TTL_POLICY'), true));
  results.push(t("generateSnakeTtlTrafficPolicyConfig — traffic-policy output",
    single.includes('traffic-policy output SNAKE_TTL_POLICY'), true));

  // Two pairs — all four interfaces present
  const multi = generateSnakeTtlTrafficPolicyConfig(pairs2);
  results.push(t("generateSnakeTtlTrafficPolicyConfig — Et3 present for pair 2",
    multi.includes('interface Ethernet3'), true));
  results.push(t("generateSnakeTtlTrafficPolicyConfig — Et4 present for pair 2",
    multi.includes('interface Ethernet4'), true));

  return results;
}

// ── findAttrKey ────────────────────────────────────────────────────────────────

function test_findAttrKey() {
  const t = assert_;
  const results = [];
  const keys = ['int_', 'xcvr_', 'xcvr_speed_', 'et_speed_', 'svi_vlan_', 'vlan_'];

  // Basic exact-prefix matches
  results.push(t("findAttrKey — int_ match",               findAttrKey("int_leaf1",       keys), "int_"));
  results.push(t("findAttrKey — vlan_ match",              findAttrKey("vlan_leaf1",      keys), "vlan_"));
  results.push(t("findAttrKey — et_speed_ match",          findAttrKey("et_speed_leaf1",  keys), "et_speed_"));

  // Longest-match: xcvr_speed_ must win over xcvr_ (the P1 bug case)
  results.push(t("findAttrKey — xcvr_speed_ wins over xcvr_",  findAttrKey("xcvr_speed_leaf1", keys), "xcvr_speed_"));
  results.push(t("findAttrKey — xcvr_ resolves when alone",    findAttrKey("xcvr_leaf1",       keys), "xcvr_"));

  // Longest-match: svi_vlan_ must win over vlan_
  results.push(t("findAttrKey — svi_vlan_ wins over vlan_",    findAttrKey("svi_vlan_leaf1",   keys), "svi_vlan_"));

  // Fallback: header has underscore but no schema key matches
  results.push(t("findAttrKey — fallback extracts prefix",  findAttrKey("custom_col_leaf1", keys), "custom_col_"));

  // Edge cases
  results.push(t("findAttrKey — empty header → ''",         findAttrKey("",              keys), ""));
  results.push(t("findAttrKey — no underscore → ''",        findAttrKey("nounderscore",  keys), ""));

  return results;
}


// ── deviceMetadata / buildMetadataMap ──────────────────────────────────────────

function test_deviceMetadata() {
  const t = assert_;
  const results = [];

  // JSON round-trip — mimics saveDeviceMetadata → getDeviceMetadata cycle
  const meta = { leaf1: { model: "7050CX3-32S", rack: "R14" }, spine1: { model: "", rack: "" } };
  const roundTrip = JSON.parse(JSON.stringify(meta));
  results.push(t("deviceMetadata — model survives round-trip",           roundTrip.leaf1.model,  "7050CX3-32S"));
  results.push(t("deviceMetadata — rack survives round-trip",            roundTrip.leaf1.rack,   "R14"));
  results.push(t("deviceMetadata — empty model survives round-trip",     roundTrip.spine1.model, ""));
  results.push(t("deviceMetadata — unknown device is undefined",         roundTrip["missing"],   undefined));

  // Null-prop fallback — mimics: prop ? JSON.parse(prop) : {}
  const nullFallback = (null ? JSON.parse(null) : {});
  results.push(t("deviceMetadata — null prop returns empty object",      nullFallback,           {}));

  // buildMetadataMap filter: only include devices with at least model or rack set
  const devices = [
    { name: "leaf1",  model: "7050CX3-32S", rack: "R14" },
    { name: "spine1", model: "",             rack: ""    },
    { name: "leaf2",  model: "7020R",        rack: ""    },
  ];
  const builtMap = {};
  devices.forEach(d => {
    const model = (d.model || '').trim();
    const rack  = (d.rack  || '').trim();
    if (model || rack) builtMap[d.name] = { model, rack };
  });
  results.push(t("deviceMetadata — buildMetadataMap includes device with model+rack", builtMap["leaf1"],  { model: "7050CX3-32S", rack: "R14" }));
  results.push(t("deviceMetadata — buildMetadataMap includes device with model only", builtMap["leaf2"],  { model: "7020R", rack: "" }));
  results.push(t("deviceMetadata — buildMetadataMap omits device with no model/rack", builtMap["spine1"], undefined));

  return results;
}


// ── generateGlobalBlock tests ─────────────────────────────────────────────────

function test_generateGlobalBlock() {
  const t = assert_;
  const results = [];

  // Base settings — P2P IPv4 only, no IPv6
  const baseSettings = { int_ipv4: true, int_ipv6: false, int_ipv6_unnum: false, gw_ipv6: false };

  // 1. Non-EVPN device: no multi-agent, no VARP MAC
  {
    const out = generateGlobalBlock(false, baseSettings, false);
    results.push(t("generateGlobalBlock — non-EVPN: no multi-agent line",      !out.includes("multi-agent"), true));
    results.push(t("generateGlobalBlock — non-EVPN: has ip routing",           out.includes("ip routing"),   true));
    results.push(t("generateGlobalBlock — no IPv6: no ipv6 unicast-routing",   !out.includes("ipv6 unicast-routing"), true));
  }

  // 2. EVPN device: multi-agent present
  {
    const out = generateGlobalBlock(true, baseSettings, false);
    results.push(t("generateGlobalBlock — EVPN device: has multi-agent line",  out.includes("multi-agent"), true));
  }

  // 3. gw_ipv6=true: IPv6 commands present
  {
    const s6 = Object.assign({}, baseSettings, { gw_ipv6: true });
    const out = generateGlobalBlock(false, s6, false);
    results.push(t("generateGlobalBlock — gw_ipv6: has ipv6 unicast-routing",  out.includes("ipv6 unicast-routing"), true));
    results.push(t("generateGlobalBlock — gw_ipv6: has ip routing ipv6",       out.includes("ip routing ipv6"), true));
  }

  // 4. VARP standalone (gw_l3_type=varp, mlagIsActive=false): virtual-router MAC present
  {
    const sVarp = Object.assign({}, baseSettings, { gw_l3_type: 'varp', varp_mac: '001c.7300.0099' });
    const out = generateGlobalBlock(false, sVarp, false);
    results.push(t("generateGlobalBlock — VARP standalone: has virtual-router mac", out.includes("ip virtual-router mac-address 001c.7300.0099"), true));
  }

  // 5. VARP MLAG (mlagIsActive=true): virtual-router MAC must NOT appear (MLAG block handles it)
  {
    const sVarp = Object.assign({}, baseSettings, { gw_l3_type: 'varp', varp_mac: '001c.7300.0099' });
    const out = generateGlobalBlock(false, sVarp, true);
    results.push(t("generateGlobalBlock — VARP MLAG: no virtual-router mac (MLAG owns it)", !out.includes("ip virtual-router mac-address"), true));
  }

  // 6. Anycast GW (gw_l3_type=anycast): no virtual-router MAC regardless of MLAG
  {
    const sAny = Object.assign({}, baseSettings, { gw_l3_type: 'anycast' });
    const out = generateGlobalBlock(false, sAny, false);
    results.push(t("generateGlobalBlock — anycast: no virtual-router mac", !out.includes("ip virtual-router mac-address"), true));
  }

  return results;
}

// ── generateComplexL3Block GW type tests ──────────────────────────────────────

function test_generateComplexL3BlockGwType() {
  const t = assert_;
  const results = [];

  // Minimal d object for a trunk GW SVI
  const makeD = (overrides) => Object.assign({
    sp_mode_: 'l2-trunk', vlan_: '10', svi_vlan_: 'yes',
    ip_type_: 'gw', vrf_: '', isMlag: false, sheetIndex: 1,
    isSnakePrimary: false, isSnakeSecondary: false,
    ixiaRole: null, snakeFirstPrimary: null, snakeLastSecondary: null
  }, overrides);

  const cfg = { gw_v4_first: '10.0', gw_v4_last: '1', gw_v4_mask: '/24',
                gw_v6_first: '10', gw_v6_last: '1', gw_v6_mask: '/64',
                p2p_v4_first: '192', p2p_v4_last: '1', p2p_v4_mask: '/30',
                p2p_v6_first: '192', p2p_v6_mask: '/64' };

  // 1. EVPN anycast (default): ip address virtual
  {
    const s = { gw_ipv4: true, gw_ipv6: false, evpn_ipv4: true, evpn_ipv6: false,
                gw_l3_type: 'anycast', ospf_ipv4: false, ospf_ipv6: false,
                int_ipv4: true, int_ipv6: false, int_ipv6_unnum: false };
    const out = generateComplexL3Block('Et1', makeD(), cfg, s, null);
    results.push(t("generateComplexL3Block — EVPN anycast: ip address virtual",  out.includes("ip address virtual"), true));
    results.push(t("generateComplexL3Block — EVPN anycast: no ip virtual-router address", !out.includes("ip virtual-router address"), true));
    results.push(t("generateComplexL3Block — EVPN anycast: description ANYCAST_GW_10",    out.includes("description ANYCAST_GW_10"), true));
  }

  // 2. EVPN VARP: ip address (physical, sheetIndex-offset) + ip virtual-router address (gwLast)
  // sheetIndex=1, gw_v4_last='1' → physical suffix = 1+1 = 2, virtual suffix = 1 (must differ)
  {
    const s = { gw_ipv4: true, gw_ipv6: false, evpn_ipv4: true, evpn_ipv6: false,
                gw_l3_type: 'varp', ospf_ipv4: false, ospf_ipv6: false,
                int_ipv4: true, int_ipv6: false, int_ipv6_unnum: false };
    const out = generateComplexL3Block('Et1', makeD(), cfg, s, null);
    results.push(t("generateComplexL3Block — VARP: ip address present",              out.includes("ip address 10.0"),           true));
    results.push(t("generateComplexL3Block — VARP: ip virtual-router address",       out.includes("ip virtual-router address"),  true));
    results.push(t("generateComplexL3Block — VARP: no ip address virtual",           !out.includes("ip address virtual"),        true));
    // Physical IP must use gwLast+sheetIndex (=2); virtual-router must use gwLast (=1) — they must differ
    results.push(t("generateComplexL3Block — VARP: physical IP has sheetIndex suffix (.2)", out.includes("ip address 10.0.0.10.2/24"), true));
    results.push(t("generateComplexL3Block — VARP: virtual-router IP is gwLast (.1)",       out.includes("ip virtual-router address 10.0.0.10.1"), true));
  }

  // 3. Non-EVPN: legacy ip address
  {
    const s = { gw_ipv4: true, gw_ipv6: false, evpn_ipv4: false, evpn_ipv6: false,
                gw_l3_type: 'anycast', ospf_ipv4: false, ospf_ipv6: false,
                int_ipv4: true, int_ipv6: false, int_ipv6_unnum: false };
    const out = generateComplexL3Block('Et1', makeD(), cfg, s, null);
    results.push(t("generateComplexL3Block — non-EVPN: plain ip address",         out.includes("ip address 10.0"),        true));
    results.push(t("generateComplexL3Block — non-EVPN: no ip address virtual",    !out.includes("ip address virtual"),    true));
    results.push(t("generateComplexL3Block — non-EVPN: no description ANYCAST",   !out.includes("description ANYCAST"),   true));
  }

  // 4. VRF set: description includes VRF
  {
    const s = { gw_ipv4: true, gw_ipv6: false, evpn_ipv4: true, evpn_ipv6: false,
                gw_l3_type: 'anycast', ospf_ipv4: false, ospf_ipv6: false,
                int_ipv4: true, int_ipv6: false, int_ipv6_unnum: false };
    const out = generateComplexL3Block('Et1', makeD({ vrf_: 'VRF_A' }), cfg, s, null);
    results.push(t("generateComplexL3Block — VRF set: description ANYCAST_GW_VRF_A_10", out.includes("description ANYCAST_GW_VRF_A_10"), true));
  }

  // 5. vx1VlanSet exclusion: VLAN in set → SVI skipped
  {
    const s = { gw_ipv4: true, gw_ipv6: false, evpn_ipv4: false, evpn_ipv6: false,
                gw_l3_type: 'anycast', ospf_ipv4: false, ospf_ipv6: false,
                int_ipv4: true, int_ipv6: false, int_ipv6_unnum: false };
    const vx1Set = new Set([10]);
    const out = generateComplexL3Block('Et1', makeD(), cfg, s, vx1Set);
    results.push(t("generateComplexL3Block — vx1VlanSet: VLAN excluded, no interface block", !out.includes("interface Vlan10"), true));
  }

  return results;
}

function test_compressVniLines() {
  const t = assert_;
  const results = [];

  // Helper: join result lines for easy comparison
  const run = (vlans, base) => _compressVniLines(new Set(vlans), base).join('\n');

  // Single VLAN → no range
  t(results, "single vlan",
    run([10], 10000),
    " vxlan vlan 10 vni 10010");

  // Fully consecutive → one range line
  t(results, "consecutive 1-4000",
    run([1,2,3,4,5], 10000),
    " vxlan vlan 1-5 vni 10001-10005");

  // Two disjoint runs
  t(results, "two runs",
    run([10,11,12, 20,21], 10000),
    " vxlan vlan 10-12 vni 10010-10012\n vxlan vlan 20-21 vni 10020-10021");

  // Non-consecutive singles
  t(results, "non-consecutive singles",
    run([10, 20, 30], 10000),
    " vxlan vlan 10 vni 10010\n vxlan vlan 20 vni 10020\n vxlan vlan 30 vni 10030");

  // Out-of-order input → sorted output
  t(results, "unsorted input",
    run([30, 10, 20], 10000),
    " vxlan vlan 10 vni 10010\n vxlan vlan 20 vni 10020\n vxlan vlan 30 vni 10030");

  // Values outside 1-4094 filtered out
  t(results, "out-of-range filtered",
    run([0, 5, 4095], 10000),
    " vxlan vlan 5 vni 10005");

  // Custom vniBase
  t(results, "custom vniBase 20000",
    run([100, 101], 20000),
    " vxlan vlan 100-101 vni 20100-20101");

  // Empty input → empty output
  t(results, "empty vlans",
    run([], 10000),
    "");

  return results;
}

// ── Runner ─────────────────────────────────────────────────────────────────────

function runAllTests() {
  const suites = [
    { name: "canonicalizeInterface",     fn: test_canonicalizeInterface },
    { name: "hasKey",                    fn: test_hasKey },
    { name: "normalizePo",               fn: test_normalizePo },
    { name: "isValidPort",               fn: test_isValidPort },
    { name: "_parseSviVlans",            fn: test_parseSviVlans },
    { name: "_parseVrfList",             fn: test_parseVrfList },
    { name: "_resolveVrfAtIndex",        fn: test_resolveVrfAtIndex },
    { name: "_auditVrfIssues",           fn: test_auditVrfIssues },
    { name: "parseVlanWithNative",       fn: test_parseVlanWithNative },
    { name: "getPhysicalPortParent",     fn: test_getPhysicalPortParent },
    { name: "compressPortList",          fn: test_compressPortList },
    { name: "_breakoutSides",            fn: test_breakoutSides },
    { name: "_buildCableGroupsForTest",       fn: test_buildCableGroupsForTest },
    { name: "generateSnakeStaticConfig",      fn: test_generateSnakeStaticConfig },
    { name: "generateSnakeTtlPbrConfig",          fn: test_generateSnakeTtlPbrConfig },
    { name: "generateSnakeTtlTrafficPolicyConfig", fn: test_generateSnakeTtlTrafficPolicyConfig },
    { name: "findAttrKey",                    fn: test_findAttrKey },
    { name: "deviceMetadata",                 fn: test_deviceMetadata },
    { name: "generateGlobalBlock",            fn: test_generateGlobalBlock },
    { name: "generateComplexL3Block (GW)",    fn: test_generateComplexL3BlockGwType },
    { name: "_compressVniLines",              fn: test_compressVniLines },
  ];

  Logger.log(`TopoAssist Tests v${APP_VERSION}`);

  let totalPass = 0;
  let totalFail = 0;
  const failLines = [];

  for (const suite of suites) {
    const results = suite.fn();
    let suitePass = 0;
    let suiteFail = 0;

    for (const r of results) {
      if (r.pass) {
        suitePass++;
        totalPass++;
        Logger.log(`  PASS  ${suite.name} — ${r.label}`);
      } else {
        suiteFail++;
        totalFail++;
        const msg = `  FAIL  ${suite.name} — ${r.label}\n         got: ${r.actual}\n        want: ${r.expected}`;
        Logger.log(msg);
        failLines.push(msg);
      }
    }

    Logger.log(`${suite.name}: ${suitePass} passed, ${suiteFail} failed\n`);
  }

  // Alert: summary + failed tests
  let alertMsg = `${totalPass} passed, ${totalFail} failed`;
  if (failLines.length > 0) {
    alertMsg += "\n\nFailed:\n" + failLines.join("\n\n");
  }
  SpreadsheetApp.getUi().alert(
    `${totalFail === 0 ? "All tests passed" : "Tests FAILED"} (v${APP_VERSION})`,
    alertMsg, SpreadsheetApp.getUi().ButtonSet.OK);
}

