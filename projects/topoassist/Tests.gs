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
 *   canonicalizeInterface  — interface name normalization
 *   hasKey                 — case-insensitive Set lookup
 *   normalizePo            — Port-Channel number extraction
 *   isValidPort            — port string validation
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


// ── Runner ─────────────────────────────────────────────────────────────────────

function runAllTests() {
  const suites = [
    { name: "canonicalizeInterface", fn: test_canonicalizeInterface },
    { name: "hasKey",                fn: test_hasKey },
    { name: "normalizePo",           fn: test_normalizePo },
    { name: "isValidPort",           fn: test_isValidPort },
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
