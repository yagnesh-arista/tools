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
 */


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
      "leaf1:Et1":  { device: "leaf1",  name: "Et1",  details: { xcvr_: "SFP", et_speed_: "10g" } },
      "spine1:Et2": { device: "spine1", name: "Et2",  details: { xcvr_: "SFP", et_speed_: "10g" } }
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
      device: dev, name: port, details: { xcvr_speed_: "100g-4", xcvr_: "QSFP-DD" }
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
      nodes[`leaf1:Et14/${i}`] = { device: "leaf1",   name: `Et14/${i}`, details: { xcvr_speed_: "100g-4", xcvr_: "QSFP-DD" } };
      nodes[`server1:Et${i}`]  = { device: "server1", name: `Et${i}`,   details: { xcvr_speed_: "25g",    xcvr_: "SFP" } };
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
      nodes[`server1:Et${i}`]   = { device: "server1", name: `Et${i}`,   details: { xcvr_speed_: "25g",    xcvr_: "SFP" } };
      nodes[`spine1:Et48/${i}`] = { device: "spine1",  name: `Et48/${i}`, details: { xcvr_speed_: "100g-4", xcvr_: "QSFP-DD" } };
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
//   dest     = ixia_subnet ? "${ixia_subnet}.98/32" : "10.99.99.98/32"
//   last secondary: if ixia_mac + ixia_nh → ARP + route; else → placeholder comment

function test_generateSnakeStaticConfig() {
  const t = assert_;
  const results = [];

  const MAC  = '001c.7300.abcd';
  const IMAC = '0000.aaaa.bbbb';
  const INH  = '200.15.0.2';    // traffic port P2P IP on the TRAFFIC_OUT cable
  const ISUB = '10.99.99';      // ixia_subnet prefix → dest = 10.99.99.98/32
  const BASE = '200';

  // Helper: base prefs (bridge MAC set, no IXIA)
  const prefsBase = (extra) => Object.assign(
    { p2p_v4_first: BASE, bridge_mac: MAC, ixia_mac: '', ixia_nh: '', ixia_subnet: '' },
    extra || {}
  );
  // Full prefs (all IXIA fields set)
  const prefsFull = () => prefsBase({ ixia_mac: IMAC, ixia_nh: INH, ixia_subnet: ISUB });

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

  // ── T4: single pair, bridge MAC only, no IXIA ─────────────────────────────
  // VLAN 200 → oct2=2, oct3=0 → subnet 200.2.0.x, remoteIp=200.2.0.2
  (function() {
    const pairs = [{ primaryPort: 'Et2', secondaryPort: 'Et3', vlan: 200 }];
    const out = generateSnakeStaticConfig(pairs, prefsBase());
    const lines = out.split('\n');
    results.push(t("single pair — header line",
      lines[0], '! Snake VRF Chain - Static ARP + Routing'));
    results.push(t("single pair — pair comment",
      lines[2], '! Pair 1: Et2 <-> Et3 (VLAN 200, subnet 200.2.0.0/24)'));
    results.push(t("single pair — primary ARP",
      lines[3], 'arp vrf SNAKE_Et2 200.2.0.2 001c.7300.abcd arpa'));
    results.push(t("single pair — secondary ARP (same bridge MAC, same remoteIp)",
      lines[4], 'arp vrf SNAKE_Et3 200.2.0.2 001c.7300.abcd arpa'));
    results.push(t("single pair — primary route (default dest 10.99.99.98/32)",
      lines[5], 'ip route vrf SNAKE_Et2 10.99.99.98/32 200.2.0.2'));
    results.push(t("single pair — last secondary placeholder comment",
      lines[6], '! SNAKE_Et3: last secondary (TRAFFIC_OUT) - Traffic MAC/NH not configured'));
    results.push(t("single pair — trailing separator",
      lines[lines.length - 1], '!'));
  })();

  // ── T5: VLAN 1500 subnet formula ──────────────────────────────────────────
  // floor(1500/100)=15, 1500%100=0 → subnet 200.15.0.x, remoteIp=200.15.0.2
  (function() {
    const pairs = [{ primaryPort: 'Et2', secondaryPort: 'Et3', vlan: 1500 }];
    const out = generateSnakeStaticConfig(pairs, prefsBase());
    results.push(t("VLAN 1500 — subnet comment 200.15.0.0/24",
      out.includes('subnet 200.15.0.0/24'), true));
    results.push(t("VLAN 1500 — ARP target 200.15.0.2",
      out.includes('arp vrf SNAKE_Et2 200.15.0.2'), true));
    results.push(t("VLAN 1500 — route to 200.15.0.2",
      out.includes('ip route vrf SNAKE_Et2 10.99.99.98/32 200.15.0.2'), true));
  })();

  // ── T6: single pair, full IXIA config ─────────────────────────────────────
  // ixia_subnet='10.99.99' → dest='10.99.99.98/32'
  // ixia_nh='200.15.0.2', ixia_mac=IMAC → last secondary gets ARP + route
  (function() {
    const pairs = [{ primaryPort: 'Et2', secondaryPort: 'Et3', vlan: 200 }];
    const out = generateSnakeStaticConfig(pairs, prefsFull());
    results.push(t("full single — last secondary IXIA ARP",
      out.includes('arp vrf SNAKE_Et3 200.15.0.2 0000.aaaa.bbbb arpa'), true));
    results.push(t("full single — last secondary IXIA route",
      out.includes('ip route vrf SNAKE_Et3 10.99.99.98/32 200.15.0.2'), true));
    results.push(t("full single — no placeholder comment present",
      out.includes('Traffic MAC/NH not configured'), false));
    results.push(t("full single — dest derived from ixia_subnet",
      out.includes('10.99.99.98/32'), true));
  })();

  // ── T7: custom ixia_subnet → custom dest ──────────────────────────────────
  (function() {
    const pairs = [{ primaryPort: 'Et2', secondaryPort: 'Et3', vlan: 200 }];
    const prefs = prefsBase({ ixia_mac: IMAC, ixia_nh: '172.16.1.2', ixia_subnet: '172.16.1' });
    const out = generateSnakeStaticConfig(pairs, prefs);
    results.push(t("custom ixia_subnet — primary route dest 172.16.1.98/32",
      out.includes('ip route vrf SNAKE_Et2 172.16.1.98/32 200.2.0.2'), true));
    results.push(t("custom ixia_subnet — last secondary IXIA route with custom dest",
      out.includes('ip route vrf SNAKE_Et3 172.16.1.98/32 172.16.1.2'), true));
  })();

  // ── T8: two pairs — egress-vrf chain ──────────────────────────────────────
  // Pair 1: Et2<->Et3 VLAN 200 (200.2.0.x) → secondary egress-vrf SNAKE_Et4 200.4.0.2
  // Pair 2: Et4<->Et5 VLAN 400 (200.4.0.x) → last secondary: IXIA ARP + route
  (function() {
    const pairs = [
      { primaryPort: 'Et2', secondaryPort: 'Et3', vlan: 200 },
      { primaryPort: 'Et4', secondaryPort: 'Et5', vlan: 400 }
    ];
    const out = generateSnakeStaticConfig(pairs, prefsFull());
    results.push(t("2 pairs — pair 1 secondary egress-vrf to SNAKE_Et4",
      out.includes('ip route vrf SNAKE_Et3 10.99.99.98/32 egress-vrf SNAKE_Et4 200.4.0.2'), true));
    results.push(t("2 pairs — pair 2 primary ARP (VLAN 400 → 200.4.0.2)",
      out.includes('arp vrf SNAKE_Et4 200.4.0.2 001c.7300.abcd arpa'), true));
    results.push(t("2 pairs — pair 2 primary route",
      out.includes('ip route vrf SNAKE_Et4 10.99.99.98/32 200.4.0.2'), true));
    results.push(t("2 pairs — last secondary IXIA ARP",
      out.includes('arp vrf SNAKE_Et5 200.15.0.2 0000.aaaa.bbbb arpa'), true));
    results.push(t("2 pairs — last secondary IXIA route",
      out.includes('ip route vrf SNAKE_Et5 10.99.99.98/32 200.15.0.2'), true));
    results.push(t("2 pairs — no placeholder comment",
      out.includes('Traffic MAC/NH not configured'), false));
  })();

  // ── T9: three pairs — full egress-vrf chain ───────────────────────────────
  // Pair 1 Et2<->Et3 VLAN 200; Pair 2 Et4<->Et5 VLAN 400; Pair 3 Et6<->Et7 VLAN 600
  // Middle pair secondary routes: SNAKE_Et5 → egress-vrf SNAKE_Et6 200.6.0.2
  (function() {
    const pairs = [
      { primaryPort: 'Et2', secondaryPort: 'Et3', vlan: 200 },
      { primaryPort: 'Et4', secondaryPort: 'Et5', vlan: 400 },
      { primaryPort: 'Et6', secondaryPort: 'Et7', vlan: 600 }
    ];
    const out = generateSnakeStaticConfig(pairs, prefsFull());
    results.push(t("3 pairs — pair 1 secondary egress-vrf to Et4",
      out.includes('ip route vrf SNAKE_Et3 10.99.99.98/32 egress-vrf SNAKE_Et4 200.4.0.2'), true));
    results.push(t("3 pairs — pair 2 secondary egress-vrf to Et6",
      out.includes('ip route vrf SNAKE_Et5 10.99.99.98/32 egress-vrf SNAKE_Et6 200.6.0.2'), true));
    results.push(t("3 pairs — last secondary IXIA route",
      out.includes('ip route vrf SNAKE_Et7 10.99.99.98/32 200.15.0.2'), true));
    results.push(t("3 pairs — three pair-comment lines",
      (out.match(/! Pair \d+:/g) || []).length, 3));
  })();

  // ── T10: custom p2p_v4_first base ─────────────────────────────────────────
  (function() {
    const pairs = [{ primaryPort: 'Et2', secondaryPort: 'Et3', vlan: 200 }];
    const out = generateSnakeStaticConfig(pairs, prefsBase({ p2p_v4_first: '10' }));
    results.push(t("custom base — ARP uses 10.2.0.2",
      out.includes('arp vrf SNAKE_Et2 10.2.0.2'), true));
    results.push(t("custom base — route uses 10.2.0.2",
      out.includes('ip route vrf SNAKE_Et2 10.99.99.98/32 10.2.0.2'), true));
  })();

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
    { name: "getPhysicalPortParent",     fn: test_getPhysicalPortParent },
    { name: "compressPortList",          fn: test_compressPortList },
    { name: "_breakoutSides",            fn: test_breakoutSides },
    { name: "_buildCableGroupsForTest",       fn: test_buildCableGroupsForTest },
    { name: "generateSnakeStaticConfig",      fn: test_generateSnakeStaticConfig },
  ];

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
  SpreadsheetApp.getUi().alert(totalFail === 0 ? "All tests passed" : "Tests FAILED", alertMsg,
    SpreadsheetApp.getUi().ButtonSet.OK);
}
