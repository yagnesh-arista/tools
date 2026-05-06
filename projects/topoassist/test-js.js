#!/usr/bin/env node
// topoassist v260506.60 | 2026-05-06 17:27:34
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
