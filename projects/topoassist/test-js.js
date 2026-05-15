#!/usr/bin/env node
// topoassist v260515.18 | 2026-05-15 17:50:48
// Node.js runner for Tests-client.html logic — no dependencies, no jsdom.
// SYNC: applyHint and lockFirst below must match Sidebar-js.html (see SYNC comments there).

// ── Minimal DOM element mock ──────────────────────────────────────────────
class MockEl {
  constructor({ value = '', disabled = false, classes = [], preLockVal } = {}) {
    this.value    = value;
    this.disabled = disabled;
    this._cls     = new Set(classes);
    this.dataset  = {};
    if (preLockVal !== undefined) this.dataset.preLockVal = preLockVal;
    this.classList = {
      contains: c => this._cls.has(c),
      add:      c => this._cls.add(c),
      remove:   c => this._cls.delete(c),
    };
  }
}
const makeInput = opts => new MockEl(opts);

// ── Functions under test (SYNC with Sidebar-js.html) ─────────────────────

function applyHint(el, inheritedVal) {
  if (!el) return;
  if (!el.value.trim() || el.classList.contains('gw-ov-wide-hint')) {
    el.value = inheritedVal;
    if (inheritedVal) el.classList.add('gw-ov-wide-hint'); else el.classList.remove('gw-ov-wide-hint');
  }
}

function lockFirst(el, wide, fallback, forceValue) {
  if (!el) return;
  if (wide) {
    if (!el.disabled) {
      const isHint = !el.value.trim() || el.classList.contains('gw-ov-wide-hint');
      el.dataset.preLockVal = isHint ? '' : el.value;
      el.disabled = true;
      if (forceValue || isHint) { el.classList.remove('gw-ov-wide-hint'); el.value = '1'; }
    } else if (forceValue && el.value !== '1') {
      el.classList.remove('gw-ov-wide-hint');
      el.value = '1';
    }
  } else {
    if (el.disabled) {
      const saved = el.dataset.preLockVal || '';
      delete el.dataset.preLockVal;
      el.disabled = false;
      if (saved) { el.value = saved; el.classList.remove('gw-ov-wide-hint'); }
      else { el.value = ''; applyHint(el, fallback); }
    } else {
      applyHint(el, fallback);
    }
  }
}

function g(f, inputMap) {
  const el = inputMap[f];
  if (!el) return '';
  if (el.disabled) return el.value.trim();
  if (el.classList.contains('gw-ov-wide-hint')) return '';
  return el.value.trim();
}

function computeGlb4firstForNonWide(wide4, savedFirst, firstElValue) {
  return wide4 ? (savedFirst || '') : (firstElValue || '');
}

// ── Test harness ──────────────────────────────────────────────────────────

const results = [];
function t(label, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  results.push({ label, pass, actual, expected });
}
function snap(el) {
  return { value: el.value, disabled: el.disabled, hasHint: el.classList.contains('gw-ov-wide-hint'), preLockVal: el.dataset.preLockVal };
}

// ── applyHint ─────────────────────────────────────────────────────────────

let el;
el = makeInput({ value: '' });
applyHint(el, '100');
t('applyHint: empty → value set + hint class',
  { value: el.value, hasHint: el.classList.contains('gw-ov-wide-hint') },
  { value: '100', hasHint: true });

el = makeInput({ value: '50', classes: ['gw-ov-wide-hint'] });
applyHint(el, '200');
t('applyHint: hint-class field → updated',
  { value: el.value, hasHint: el.classList.contains('gw-ov-wide-hint') },
  { value: '200', hasHint: true });

el = makeInput({ value: '42' });
applyHint(el, '100');
t('applyHint: explicit field → unchanged',
  { value: el.value, hasHint: el.classList.contains('gw-ov-wide-hint') },
  { value: '42', hasHint: false });

el = makeInput({ value: '', classes: ['gw-ov-wide-hint'] });
applyHint(el, '');
t('applyHint: empty inheritedVal → hint class removed',
  { value: el.value, hasHint: el.classList.contains('gw-ov-wide-hint') },
  { value: '', hasHint: false });

// ── lockFirst — wide=true ─────────────────────────────────────────────────

el = makeInput({ value: '' });
lockFirst(el, true, '100', false);
t('lockFirst wide: empty hint → \'1\', disabled',
  snap(el), { value: '1', disabled: true, hasHint: false, preLockVal: '' });

el = makeInput({ value: '50', classes: ['gw-ov-wide-hint'] });
lockFirst(el, true, '100', false);
t('lockFirst wide: hint-class → \'1\', disabled',
  { value: el.value, disabled: el.disabled, hasHint: el.classList.contains('gw-ov-wide-hint') },
  { value: '1', disabled: true, hasHint: false });

el = makeInput({ value: '200' });
lockFirst(el, true, '100', false);
t('lockFirst wide: explicit + forceValue=false → disabled, value preserved',
  { value: el.value, disabled: el.disabled, preLockVal: el.dataset.preLockVal },
  { value: '200', disabled: true, preLockVal: '200' });

el = makeInput({ value: '' });
lockFirst(el, true, '100', true);
t('lockFirst wide: hint + forceValue=true → \'1\', disabled',
  { value: el.value, disabled: el.disabled },
  { value: '1', disabled: true });

el = makeInput({ value: '200' });
lockFirst(el, true, '100', true);
t('lockFirst wide: explicit + forceValue=true → \'1\', disabled [original bug]',
  { value: el.value, disabled: el.disabled, preLockVal: el.dataset.preLockVal },
  { value: '1', disabled: true, preLockVal: '200' });

el = makeInput({ value: '200', disabled: true });
lockFirst(el, true, '100', true);
t('lockFirst wide: already-disabled + forceValue=true → force \'1\'',
  { value: el.value, disabled: el.disabled },
  { value: '1', disabled: true });

el = makeInput({ value: '200', disabled: true });
lockFirst(el, true, '100', false);
t('lockFirst wide: already-disabled + forceValue=false → no-op',
  { value: el.value, disabled: el.disabled },
  { value: '200', disabled: true });

// ── lockFirst — exit wide ─────────────────────────────────────────────────

el = makeInput({ value: '1', disabled: true, preLockVal: '200' });
lockFirst(el, false, '100', false);
t('lockFirst exit-wide: preLockVal=\'200\' → restored, enabled',
  snap(el), { value: '200', disabled: false, hasHint: false, preLockVal: undefined });

el = makeInput({ value: '1', disabled: true, preLockVal: '' });
lockFirst(el, false, '100', false);
t('lockFirst exit-wide: empty preLockVal → fallback hint',
  { value: el.value, disabled: el.disabled, hasHint: el.classList.contains('gw-ov-wide-hint') },
  { value: '100', disabled: false, hasHint: true });

el = makeInput({ value: '50', classes: ['gw-ov-wide-hint'] });
lockFirst(el, false, '100', false);
t('lockFirst exit-wide: non-disabled hint → applyHint with fallback',
  { value: el.value, disabled: el.disabled, hasHint: el.classList.contains('gw-ov-wide-hint') },
  { value: '100', disabled: false, hasHint: true });

// ── g() reader ────────────────────────────────────────────────────────────

el = makeInput({ value: '1', disabled: true });
t('g(): disabled → returns value', g('v4_first', { v4_first: el }), '1');

el = makeInput({ value: '100', classes: ['gw-ov-wide-hint'] });
t('g(): hint-class → returns \'\'', g('v4_first', { v4_first: el }), '');

el = makeInput({ value: '200' });
t('g(): explicit → returns value', g('v4_first', { v4_first: el }), '200');

t('g(): missing key → returns \'\'', g('v4_first', {}), '');

// ── glb4firstForNonWide ───────────────────────────────────────────────────

t('glb4firstForNonWide: wide + saved=\'100\' → \'100\'',
  computeGlb4firstForNonWide(true, '100', '1'), '100');

t('glb4firstForNonWide: wide + saved=null → \'\'',
  computeGlb4firstForNonWide(true, null, '1'), '');

t('glb4firstForNonWide: not wide → firstEl passthrough',
  computeGlb4firstForNonWide(false, null, '100'), '100');

t('glb4firstForNonWide: not wide + empty firstEl → \'\'',
  computeGlb4firstForNonWide(false, null, ''), '');

// ── Bridge auto-check: interval clamping ─────────────────────────────────
// SYNC: bounds match Sidebar-js.html onBridgeAutoCheckIntervalChange + _startBridgeAutoCheck
function clampBridgeInterval(raw) {
  return Math.max(5, Math.min(480, parseInt(raw, 10) || 30));
}

t('clampBridgeInterval: 30 → 30',   clampBridgeInterval(30),    30);
t('clampBridgeInterval: 3 → 5',     clampBridgeInterval(3),      5);
t('clampBridgeInterval: 600 → 480', clampBridgeInterval(600),  480);
t('clampBridgeInterval: 0 → 30',    clampBridgeInterval(0),     30);
t('clampBridgeInterval: NaN → 30',  clampBridgeInterval('abc'), 30);
t('clampBridgeInterval: 5 → 5',     clampBridgeInterval(5),      5);
t('clampBridgeInterval: 480 → 480', clampBridgeInterval(480),  480);

// ── L1 threshold clamping ─────────────────────────────────────────────────
// SYNC: matches onBridgeL1ThresholdChange in Sidebar-js.html
function clampL1Threshold(raw) {
  return Math.max(1, parseInt(raw, 10) || 1);
}

t('clampL1Threshold: 1 → 1',     clampL1Threshold(1),      1);
t('clampL1Threshold: 5 → 5',     clampL1Threshold(5),      5);
t('clampL1Threshold: 0 → 1',     clampL1Threshold(0),      1);
t('clampL1Threshold: -1 → 1',    clampL1Threshold(-1),     1);
t('clampL1Threshold: NaN → 1',   clampL1Threshold('abc'),  1);
t('clampL1Threshold: 100 → 100', clampL1Threshold(100),  100);

// ── _l1ErrDetail ──────────────────────────────────────────────────────────
// SYNC: matches _l1ErrDetail in Sidebar-js.html
function _l1ErrDetail(u, uErr, v, vErr) {
  const fmt = (id, e) => {
    if (!e) return '';
    let s = id + ': FCS ' + e.fcs;
    if (e.sym)   s += ' sym '   + e.sym;
    if (e.align) s += ' align ' + e.align;
    return s;
  };
  return [fmt(u, uErr), fmt(v, vErr)].filter(Boolean).join(' | ');
}

t('_l1ErrDetail: both sides',
  _l1ErrDetail('dev1:Et1', {fcs:3,sym:0,align:0}, 'dev2:Et1', {fcs:1,sym:2,align:0}),
  'dev1:Et1: FCS 3 | dev2:Et1: FCS 1 sym 2');

t('_l1ErrDetail: only u-side',
  _l1ErrDetail('dev1:Et1', {fcs:5,sym:0,align:1}, 'dev2:Et1', null),
  'dev1:Et1: FCS 5 align 1');

t('_l1ErrDetail: only v-side',
  _l1ErrDetail('dev1:Et1', null, 'dev2:Et1', {fcs:0,sym:3,align:0}),
  'dev2:Et1: FCS 0 sym 3');

t('_l1ErrDetail: fcs+sym+align',
  _l1ErrDetail('dev1:Et1', {fcs:1,sym:2,align:3}, 'dev2:Et1', null),
  'dev1:Et1: FCS 1 sym 2 align 3');

t('_l1ErrDetail: both null → empty',
  _l1ErrDetail('dev1:Et1', null, 'dev2:Et1', null),
  '');

// ── _getEvpnBundleGroups (pure extraction logic) ──────────────────────────
// SYNC: filter logic matches _getEvpnBundleGroups in Sidebar-js.html.
// addEvpnBundleRow / removeEvpnBundleRow / _renderEvpnBundleList are DOM-only — not tested here.
function _getEvpnBundleGroupsPure(values) {
  return values.map(v => (v || '').trim()).filter(v => v.length > 0);
}

t('_getEvpnBundleGroups: non-empty values pass through',
  _getEvpnBundleGroupsPure(['1-1000', '2000-2999']),
  ['1-1000', '2000-2999']);

t('_getEvpnBundleGroups: empty strings filtered',
  _getEvpnBundleGroupsPure(['1-1000', '', '  ', '2000-2999']),
  ['1-1000', '2000-2999']);

t('_getEvpnBundleGroups: all empty → []',
  _getEvpnBundleGroupsPure(['', '  ']),
  []);

t('_getEvpnBundleGroups: trims whitespace',
  _getEvpnBundleGroupsPure(['  1-100  ']),
  ['1-100']);

// ── setSplitBtnState — dataset.splitState behavior ───────────────────────
// SYNC: setSplitBtnState must match Sidebar-js.html.
// Tests focus on the dataset.splitState write — Chrome normalizes hex→rgb so
// we never compare style.background; dataset.splitState is the SSoT for state.
{
  function makeSplitEl(initState) {
    const el = {
      style: { background: '' },
      dataset: initState ? { splitState: initState } : {},
      _lbl: { innerText: '' },
      _btns: { copy: { disabled: false }, view: { disabled: false }, push: { disabled: false } },
      classList: {
        _s: new Set(),
        contains(c) { return this._s.has(c); },
        add(c)      { this._s.add(c); },
        remove(c)   { this._s.delete(c); },
      },
      querySelector(sel) {
        if (sel === '.split-label')  return this._lbl;
        if (sel === '.copy-action')  return this._btns.copy;
        if (sel === '.view-action')  return this._btns.view;
        if (sel === '.push-action')  return this._btns.push;
        return null;
      },
    };
    return el;
  }
  // SYNC: _SPLIT_STATE_BG and setSplitBtnState must match Sidebar-js.html
  const _SPLIT_STATE_BG = { ready: '#10b981', fetching: '#f59e0b', 'non-eos': '#64748b', error: '#ef4444' };
  function setSplitBtnState(splitId, labelText, state, actionsDisabled) {
    const wrapper = _mockDom[splitId];
    if (!wrapper) return;
    const label = wrapper.querySelector('.split-label');
    if (label) label.innerText = labelText;
    wrapper.style.background = _SPLIT_STATE_BG[state] || '#64748b';
    wrapper.dataset.splitState = state;
    const copyBtn = wrapper.querySelector('.copy-action');
    const viewBtn = wrapper.querySelector('.view-action');
    const pushBtn = wrapper.querySelector('.push-action');
    if (copyBtn) copyBtn.disabled = actionsDisabled;
    if (viewBtn) viewBtn.disabled = actionsDisabled;
    if (pushBtn) pushBtn.disabled = actionsDisabled;
  }
  let _mockDom = {};

  // state drives both dataset.splitState and style.background
  _mockDom = { splitDevice: makeSplitEl() };
  setSplitBtnState('splitDevice', 'lbl', 'ready', false);
  t('setSplitBtnState: ready → splitState=ready', _mockDom.splitDevice.dataset.splitState, 'ready');
  t('setSplitBtnState: ready → bg=#10b981', _mockDom.splitDevice.style.background, '#10b981');

  _mockDom = { splitDevice: makeSplitEl() };
  setSplitBtnState('splitDevice', 'lbl', 'fetching', true);
  t('setSplitBtnState: fetching → splitState=fetching', _mockDom.splitDevice.dataset.splitState, 'fetching');
  t('setSplitBtnState: fetching → bg=#f59e0b', _mockDom.splitDevice.style.background, '#f59e0b');

  // error path: previously ready → error overwrites splitState and sets red bg
  _mockDom = { splitDevice: makeSplitEl('ready') };
  setSplitBtnState('splitDevice', 'err', 'error', false);
  t('setSplitBtnState: error overwrites prior ready splitState', _mockDom.splitDevice.dataset.splitState, 'error');
  t('setSplitBtnState: error → bg=#ef4444', _mockDom.splitDevice.style.background, '#ef4444');

  // unknown splitId → no throw
  _mockDom = {};
  let threw = false;
  try { setSplitBtnState('splitDevice', 'lbl', 'ready', false); } catch(e) { threw = true; }
  t('setSplitBtnState: unknown id — no throw', threw, false);

  // buttons disabled when actionsDisabled=true
  _mockDom = { splitDevice: makeSplitEl() };
  setSplitBtnState('splitDevice', 'lbl', 'fetching', true);
  t('setSplitBtnState: actionsDisabled=true disables all buttons',
    [_mockDom.splitDevice._btns.copy.disabled, _mockDom.splitDevice._btns.view.disabled, _mockDom.splitDevice._btns.push.disabled],
    [true, true, true]);
}

// ── _expandTaCleanDisplay ─────────────────────────────────────────────────
// SYNC: _TA_CLEAN_MAP and _expandTaCleanDisplay must match Sidebar-js.html.
const _TA_CLEAN_MAP = {
  'ta-clean-et': ['default switchport trunk allowed vlan','no switchport trunk native vlan','default switchport access vlan','no channel-group','no ipv6 address'],
  'ta-clean-po': ['default switchport trunk allowed vlan','no switchport trunk native vlan','default switchport access vlan','no ipv6 address'],
  'ta-clean-vl': ['default ip address','default ip address virtual','default ip virtual-router address','default ipv6 address','default ipv6 address virtual','default ipv6 virtual-router address'],
};

function _expandTaCleanDisplay(text) {
  const lines = text.split('\n');
  const out = [];
  let pending = null;
  for (const line of lines) {
    const trimmed = line.trim();
    const marker = trimmed.split(/\s+/, 1)[0];
    if (_TA_CLEAN_MAP[marker] && trimmed.includes(' ')) {
      pending = _TA_CLEAN_MAP[marker];
    } else if (pending && /^interface\s/i.test(trimmed)) {
      out.push(line);
      for (const cmd of pending) out.push(' ' + cmd);
      pending = null;
    } else {
      pending = null;
      out.push(line);
    }
  }
  return out.join('\n');
}

t('_expandTaCleanDisplay: ta-clean-et expands into interface block',
  _expandTaCleanDisplay('ta-clean-et Et1/1\ninterface Et1/1\n switchport\n switchport mode trunk'),
  'interface Et1/1\n default switchport trunk allowed vlan\n no switchport trunk native vlan\n default switchport access vlan\n no channel-group\n no ipv6 address\n switchport\n switchport mode trunk');

t('_expandTaCleanDisplay: ta-clean-po expands (no channel-group)',
  _expandTaCleanDisplay('ta-clean-po Port-Channel10\ninterface Port-Channel10\n switchport'),
  'interface Port-Channel10\n default switchport trunk allowed vlan\n no switchport trunk native vlan\n default switchport access vlan\n no ipv6 address\n switchport');

t('_expandTaCleanDisplay: ta-clean-vl expands into vlan interface block',
  _expandTaCleanDisplay('ta-clean-vl Vlan100\ninterface Vlan100\n ip address virtual 10.1.1.1/24'),
  'interface Vlan100\n default ip address\n default ip address virtual\n default ip virtual-router address\n default ipv6 address\n default ipv6 address virtual\n default ipv6 virtual-router address\n ip address virtual 10.1.1.1/24');

t('_expandTaCleanDisplay: no markers — passthrough unchanged',
  _expandTaCleanDisplay('interface Et1/1\n switchport mode trunk'),
  'interface Et1/1\n switchport mode trunk');

t('_expandTaCleanDisplay: marker without space treated as plain line',
  _expandTaCleanDisplay('ta-clean-et\ninterface Et1/1\n switchport'),
  'ta-clean-et\ninterface Et1/1\n switchport');

t('_expandTaCleanDisplay: marker not followed by interface — marker dropped, next line kept',
  _expandTaCleanDisplay('ta-clean-et Et1/1\n description stray line\ninterface Et1/1'),
  ' description stray line\ninterface Et1/1');

t('_expandTaCleanDisplay: empty string passthrough',
  _expandTaCleanDisplay(''),
  '');

t('_expandTaCleanDisplay: multiple sequential interface blocks each expanded',
  _expandTaCleanDisplay('ta-clean-et Et1/1\ninterface Et1/1\n switchport\n!\nta-clean-et Et1/2\ninterface Et1/2\n switchport'),
  'interface Et1/1\n default switchport trunk allowed vlan\n no switchport trunk native vlan\n default switchport access vlan\n no channel-group\n no ipv6 address\n switchport\n!\ninterface Et1/2\n default switchport trunk allowed vlan\n no switchport trunk native vlan\n default switchport access vlan\n no channel-group\n no ipv6 address\n switchport');

// ── Report ────────────────────────────────────────────────────────────────

const pass = results.filter(r => r.pass).length;
const fail = results.filter(r => !r.pass).length;

results.forEach(r => {
  const sym = r.pass ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
  console.log(`${sym} ${r.label}`);
  if (!r.pass) {
    console.log(`    actual:   ${JSON.stringify(r.actual)}`);
    console.log(`    expected: ${JSON.stringify(r.expected)}`);
  }
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
