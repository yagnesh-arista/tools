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
  return [
    t("null → empty string",              getPhysicalPortParent(null),      ""),
    t("empty string → empty string",      getPhysicalPortParent(""),        ""),
    t("Et1 (no slash) → Et1",            getPhysicalPortParent("Et1"),     "Et1"),
    t("Et14/4 → Et14",                   getPhysicalPortParent("Et14/4"),  "Et14"),
    t("Et14/1 → Et14",                   getPhysicalPortParent("Et14/1"),  "Et14"),
    t("Et48/1 → Et48",                   getPhysicalPortParent("Et48/1"),  "Et48"),
    t("Et1/1/2 (multi-level) → Et1/1",  getPhysicalPortParent("Et1/1/2"), "Et1/1"),
    // Note: Et5/22 as a modular-chassis port (line card 5, port 22) never reaches
    // getPhysicalPortParent in practice — aggX guard prevents it (xcvr_speed_ would be
    // non-aggregate "25g" etc). Modular breakout lanes are 3-level: Et5/22/1 → Et5/22.
    t("Et5/22/1 modular breakout lane → Et5/22",   getPhysicalPortParent("Et5/22/1"), "Et5/22"),
    t("Et5/abc non-numeric last part → unchanged", getPhysicalPortParent("Et5/abc"), "Et5/abc"),
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
    results.push(t("Scenario A — key uses phyPort on both",   keys[0], "leaf1:Et14 <-> spine1:Et48"));
    results.push(t("Scenario A — isBreakoutA true",           g[keys[0]].isBreakoutA, true));
    results.push(t("Scenario A — isBreakoutB true",           g[keys[0]].isBreakoutB, true));
    results.push(t("Scenario A — phyA is Et14",               g[keys[0]].phyA, "Et14"));
    results.push(t("Scenario A — phyB is Et48",               g[keys[0]].phyB, "Et48"));
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
    results.push(t("Scenario C — key uses phyPortA, plain B", keys[0], "leaf1:Et14 <-> server1"));
    results.push(t("Scenario C — isBreakoutA true",           g[keys[0]].isBreakoutA, true));
    results.push(t("Scenario C — isBreakoutB false",          g[keys[0]].isBreakoutB, false));
    results.push(t("Scenario C — phyA is Et14",               g[keys[0]].phyA, "Et14"));
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
    results.push(t("Case 3 — key uses phyA, plain devB",         keys[0], "leaf1:Et14 <-> spine1"));
    results.push(t("Case 3 — isBreakoutA true",                  g[keys[0]].isBreakoutA, true));
    results.push(t("Case 3 — isBreakoutB true",                  g[keys[0]].isBreakoutB, true));
    results.push(t("Case 3 — phyA is Et14",                      g[keys[0]].phyA, "Et14"));
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
    results.push(t("Case 4 — key uses plain devA, phyB",         keys[0], "leaf1 <-> spine1:Et48"));
    results.push(t("Case 4 — isBreakoutA true",                  g[keys[0]].isBreakoutA, true));
    results.push(t("Case 4 — isBreakoutB true",                  g[keys[0]].isBreakoutB, true));
    results.push(t("Case 4 — phyB is Et48",                      g[keys[0]].phyB, "Et48"));
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
    results.push(t("Scenario C (B is QSFP) — key plain A, phyB", keys[0], "server1 <-> spine1:Et48"));
    results.push(t("Scenario C (B is QSFP) — isBreakoutA false", g[keys[0]].isBreakoutA, false));
    results.push(t("Scenario C (B is QSFP) — isBreakoutB true",  g[keys[0]].isBreakoutB, true));
    results.push(t("Scenario C (B is QSFP) — phyB is Et48",      g[keys[0]].phyB, "Et48"));
    results.push(t("Scenario C (B is QSFP) — 4 links in group",  g[keys[0]].links.length, 4));
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
    { name: "_buildCableGroupsForTest",  fn: test_buildCableGroupsForTest },
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
