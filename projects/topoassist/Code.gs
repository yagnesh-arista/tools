// TopoAssist v260426.29 | 2026-04-26 12:28:21
/**
 * -------------------
 * CONFIGURATION CONSTANTS
 * -------------------
 */
const APP_VERSION = "260426.29";  // bump on every release; keep in sync with Sidebar-js.html

// 1. Try to get saved name. 2. Default to "PortMapping"
var SHEET_DATA = (() => {
  const custom = PropertiesService.getScriptProperties().getProperty('TARGET_SHEET_NAME');
  if (custom && custom !== "PortMapping") console.warn('[Config] Using custom sheet name:', custom);
  return custom || "PortMapping";
})();

/**
* -------------------
* MENU & TRIGGERS
* -------------------
*/
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('TopoAssist')
    // 1. Core Visualizer
    .addItem('Show Topology', 'showTopologyWindow')
    .addSeparator()
    // 2. Sheet View Controls (Submenu)
    .addSubMenu(SpreadsheetApp.getUi().createMenu('Sheet View')
      .addItem('Show All', 'viewShowAll')
      .addSeparator()
      .addItem('L1: Interface', 'viewCabling')
      .addItem('L1: Transceiver', 'viewTransceiver')
      .addItem('L1: Speed', 'viewSpeed')
      .addSeparator()
      .addItem('L1.5: Port Channel', 'viewPo')
      .addSeparator()
      .addItem('L2/L3: Mode', 'viewMode')
      .addItem('L2/L3: Vlan', 'viewVlan')
      .addItem('L2/L3: SVI', 'viewSvi')
      .addItem('L2/L3: IP', 'viewIpTypeL2L3')
      .addSeparator()
      .addItem('Custom View...', 'showSheetAssistPanel'))
    .addSeparator()
    // 3. Sheet Data & Schema Management (Submenu)
    .addSubMenu(SpreadsheetApp.getUi().createMenu('Sheet Manager')
      .addItem('Manage Column & Formatting', 'showDeviceDataUi')
      .addItem('Change Sheet Name', 'promptRenameSheet')
      .addSeparator()
      .addItem('Create Sheet Checkpoint', 'createTopologySnapshot')
      .addItem('Restore Sheet Checkpoint', 'showRestoreWizard')
      .addSeparator()
      .addItem('New Project — Reset All Data', 'showNewProjectDialog'))
    .addSeparator()
    // 4. Device & Config Management
    .addItem('Device Manager', 'showDeviceManagerUi')
    .addSeparator()
    // 5. Help
    .addItem('User Guide', 'openUserGuide')
    .addToUi();

}

// Installable onOpen handler — auto-opens Sheet View panel if a column filter is active.
// Simple onOpen() cannot call showModelessDialog() (AuthMode.LIMITED); this runs with full auth.
// Wired up by ensureOnOpenTrigger(), called from showTopologyWindow() / showSheetAssistPanel().
function onOpenInstallable() {
  try {
    const prefs   = getViewPreferences();
    const allKeys = getSchemaConfig().map(function(s) { return s.key; });
    if (prefs.length < allKeys.length) {
      showSheetAssistPanel();
    }
  } catch (e) {}
}

// Installs the onOpen installable trigger if not already present.
function ensureOnOpenTrigger() {
  const ss = SpreadsheetApp.getActive();
  const already = ScriptApp.getProjectTriggers().some(function(t) {
    return t.getHandlerFunction() === 'onOpenInstallable' &&
           t.getTriggerSourceId() === ss.getId() &&
           t.getEventType() === ScriptApp.EventType.ON_OPEN;
  });
  if (!already) {
    ScriptApp.newTrigger('onOpenInstallable').forSpreadsheet(ss).onOpen().create();
  }
}

/**
 * UI Prompt to safely rename the working sheet and update global settings.
 */
function promptRenameSheet() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. Get Current Name
  const currentName = SHEET_DATA;

  const result = ui.prompt(
    'Change Sheet Name',
    `Current Name: "${currentName}"\n\nEnter the new name for the data sheet:`,
    ui.ButtonSet.OK_CANCEL
  );

  if (result.getSelectedButton() !== ui.Button.OK) return;

  const newName = result.getResponseText().trim();
  if (!newName) {
    ui.alert("Name cannot be empty.");
    return;
  }
  if (newName === currentName) return; // No change

  // 2. Safety Checks
  if (ss.getSheetByName(newName)) {
    ui.alert(`✗ Error: A sheet named "${newName}" already exists.\nPlease choose a unique name.`);
    return;
  }

  const actualSheet = ss.getSheetByName(currentName);
  if (!actualSheet) {
    // Edge case: Config thinks name is 'X', but sheet 'X' is missing.
    // Ask user if they want to treat the NEW name as the target (and create it later).
    const confirm = ui.alert(
      "Sheet Not Found",
      `The sheet "${currentName}" does not exist. Do you want to set "${newName}" as the new target anyway? (You will need to create it or run Device Manager)`,
      ui.ButtonSet.YES_NO
    );
    if (confirm === ui.Button.YES) {
      PropertiesService.getScriptProperties().setProperty('TARGET_SHEET_NAME', newName);
      ui.alert(`✓ Settings Updated.\nThe tool will now look for "${newName}".`);
    }
    return;
  }

  // 3. Execute Rename
  try {
    actualSheet.setName(newName); // Rename the tab
    PropertiesService.getScriptProperties().setProperty('TARGET_SHEET_NAME', newName); // Save setting

    // Update global var for this execution context (though script usually restarts on new action)
    SHEET_DATA = newName;

    ui.alert(`✓ Success!\n\nSheet renamed from "${currentName}" to "${newName}".\nThe tool is updated.`);
  } catch (e) {
    ui.alert("Error renaming sheet: " + e.message);
  }
}

/**
* Helper function to include external HTML files (CSS/JS)
*/
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
* -------------------
* COLUMN VISIBILITY TOOLS
* -------------------
*/

function viewShowAll() {
  saveSheetViewHidden([]);
  // Reset all row-level filters to "show all" defaults so no rows stay hidden
  saveSheetViewIpFilter(['p2p', 'gw', 'blank']);
  saveSheetViewIntModeFilter([]);
  saveSheetViewSviFilter(['active', 'blank']);
  applyCustomView(getSchemaConfig().map(function(s) { return s.key; }));
  refreshSheetRowVisibility();
}

function viewCabling() {
  applyCustomView(['int']);
  showSheetAssistPanel();
}

function viewTransceiver() {
  applyCustomView(['int', 'xcvr_type']);
  showSheetAssistPanel();
}

function viewSpeed() {
  applyCustomView(['int', 'xcvr_type', 'et_speed', 'xcvr_speed']);
  showSheetAssistPanel();
}

function viewPo() {
  applyCustomView(['int', 'po']);
  showSheetAssistPanel();
}

function viewMode() {
  applyCustomView(['int', 'po', 'sp_mode']);
  showSheetAssistPanel();
}

function viewVlan() {
  applyCustomView(['int', 'po', 'sp_mode', 'vlan']);
  showSheetAssistPanel();
}

function viewSvi() {
  applyCustomView(['int', 'po', 'sp_mode', 'vlan', 'svi_vlan']);
  showSheetAssistPanel();
}

function viewIpTypeL2L3() {
  applyCustomView(['int', 'po', 'sp_mode', 'vlan', 'svi_vlan', 'ip_type']);
  showSheetAssistPanel();
}


/**
 * Called by the Sidebar to check if data has changed.
 * Returns a simple timestamp string.
 */
function getDataVersion() {
  return PropertiesService.getScriptProperties().getProperty('DATA_VERSION') || "0";
}

function showCustomViewUi() {
  const template = HtmlService.createTemplateFromFile('Sidebar');
  template.initialMode = 'view_custom';

  // Pass settings (reusing existing helper to prevent errors, though not used here)
  const settings = getUiSettings();
  template.defaultWidth = settings.width;
  template.defaultDevGap = settings.devGap;
  template.defaultOffset = settings.offset;
  template.defaultTop = settings.top;
  template.defaultRefresh = settings.refresh;
  template.defaultAuto = settings.auto;

  const html = template.evaluate().setWidth(500).setHeight(600).setTitle('Sheet Custom View Managers');
  SpreadsheetApp.getUi().showModelessDialog(html, 'Sheet Custom View Managers');
}

// ─────────────────────────────────────────────────────────────────
// SHEET ASSISTANT PANEL
// ─────────────────────────────────────────────────────────────────

function showSheetAssistUi() {
  const html = HtmlService.createHtmlOutputFromFile('SheetAssistPanel')
    .setWidth(360)
    .setHeight(580);
  SpreadsheetApp.getUi().showModelessDialog(html, 'Sheet Assistant');
}

// ─────────────────────────────────────────────────────────────────
// SHEET DEVICE VISIBILITY PANEL
// ─────────────────────────────────────────────────────────────────

function showSheetAssistPanel() {
  try { ensureOnChangeTrigger(); } catch (e) {}
  try { ensureOnOpenTrigger();  } catch (e) {}
  const html = HtmlService.createHtmlOutputFromFile('SheetAssistPanel')
    .setWidth(540)
    .setHeight(590);
  SpreadsheetApp.getUi().showModelessDialog(html, 'Sheet View');
}

function getSheetVlanSummary() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_DATA);
    if (!sheet) return [];
    const lastCol = sheet.getLastColumn();
    const lastRow = sheet.getLastRow();
    if (lastRow < 3 || lastCol < 2) return [];

    const headers = sheet.getRange(2, 1, 1, lastCol).getValues()[0];
    const devVlanCol = {};   // device name → vlan_ col index (0-based)
    const devSviCol  = {};   // device name → svi_vlan_ col index (0-based)
    const devIntCol  = {};   // device name → int_ col index (0-based)
    headers.forEach(function(h, i) {
      const s = String(h);
      if      (s.startsWith('vlan_'))     devVlanCol[s.slice(5)] = i;
      else if (s.startsWith('svi_vlan_')) devSviCol[s.slice(9)]  = i;
      else if (s.startsWith('int_'))      devIntCol[s.slice(4)]  = i;
    });

    const dataRowCount = lastRow - 2;
    if (dataRowCount <= 0) return [];
    const allData = sheet.getRange(3, 1, dataRowCount, lastCol).getValues();

    const vlanInfo = {}; // vid → { hasSvi, hasVtep, trunkCount, rowCount, devices: Set }
    Object.keys(devVlanCol).forEach(function(devName) {
      const vCol   = devVlanCol[devName];
      const sviCol = devSviCol.hasOwnProperty(devName) ? devSviCol[devName] : -1;
      const intCol = devIntCol.hasOwnProperty(devName) ? devIntCol[devName] : -1;
      allData.forEach(function(row) {
        const vlanRaw = String(row[vCol] || '').trim();
        if (!vlanRaw) return;
        const parsed  = parseVlanWithNative(vlanRaw);
        const sviRaw  = sviCol >= 0 ? String(row[sviCol] || '').trim().toLowerCase() : '';
        const intRaw  = intCol >= 0 ? String(row[intCol] || '').trim() : '';
        const isVx1   = intRaw && canonicalizeInterface(intRaw) === 'Vx1';

        // Allowed (trunk) VLANs
        if (parsed.vlans) {
          parsed.vlans.split(',').forEach(function(v) {
            v = v.trim();
            if (!v || isNaN(parseInt(v, 10))) return;
            if (!vlanInfo[v]) vlanInfo[v] = { hasSvi: false, hasVtep: false, trunkCount: 0, rowCount: 0, devices: new Set() };
            vlanInfo[v].trunkCount++;
            vlanInfo[v].rowCount++;
            vlanInfo[v].devices.add(devName);
            if (isVx1) vlanInfo[v].hasVtep = true;
            if (sviRaw === 'all') {
              vlanInfo[v].hasSvi = true;
            } else if (sviRaw) {
              sviRaw.split(',').forEach(function(tok) {
                tok = tok.trim();
                const m = tok.match(/^nv(\d+)$/i);
                if ((m ? m[1] : tok) === v) vlanInfo[v].hasSvi = true;
              });
            }
          });
        }
        // Native VLAN
        if (parsed.native) {
          const n = parsed.native;
          if (!vlanInfo[n]) vlanInfo[n] = { hasSvi: false, hasVtep: false, trunkCount: 0, rowCount: 0, devices: new Set() };
          vlanInfo[n].rowCount++;
          vlanInfo[n].devices.add(devName);
          if (isVx1) vlanInfo[n].hasVtep = true;
          if (sviRaw) {
            sviRaw.split(',').forEach(function(tok) {
              tok = tok.trim();
              const m = tok.match(/^nv(\d+)$/i);
              if ((m ? m[1] : tok) === n) vlanInfo[n].hasSvi = true;
            });
          }
        }
      });
    });

    return Object.keys(vlanInfo)
      .sort(function(a, b) { return parseInt(a, 10) - parseInt(b, 10); })
      .map(function(vid) {
        const info = vlanInfo[vid];
        return { vid: vid, hasSvi: info.hasSvi, hasVtep: info.hasVtep,
                 trunkCount: info.trunkCount, rowCount: info.rowCount,
                 nativeOnly: info.trunkCount === 0, devices: Array.from(info.devices) };
      });
  } catch (e) { return []; }
}

// Navigate to the Nth occurrence of vid across all devices' vlan_ columns.
// Navigates to the int_ column of the matching row (always visible even if vlan_ is hidden).
// Returns { total, idx } so the client can show "row X / N".
function navigateToVlanOccurrence(vid, occIdx) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_DATA);
    if (!sheet) return { total: 0, idx: 0 };
    const lastCol = sheet.getLastColumn();
    const lastRow = sheet.getLastRow();
    if (lastRow < 3) return { total: 0, idx: 0 };

    const headers = sheet.getRange(2, 1, 1, lastCol).getValues()[0];
    const devVlanCol = {};
    const devIntCol  = {};
    headers.forEach(function(h, i) {
      const s = String(h);
      if      (s.startsWith('vlan_')) devVlanCol[s.slice(5)] = i;
      else if (s.startsWith('int_'))  devIntCol[s.slice(4)]  = i;
    });

    const dataRowCount = lastRow - 2;
    const allData = sheet.getRange(3, 1, dataRowCount, lastCol).getValues();

    const occurrences = [];
    allData.forEach(function(row, rowI) {
      Object.keys(devVlanCol).forEach(function(devName) {
        const cellVal = String(row[devVlanCol[devName]] || '').trim();
        if (!cellVal) return;
        const parsed = parseVlanWithNative(cellVal);
        const tokens = [];
        if (parsed.vlans) parsed.vlans.split(',').forEach(function(t) { t = t.trim(); if (t) tokens.push(t); });
        if (parsed.native) tokens.push(parsed.native);
        if (tokens.indexOf(vid) === -1) return;
        const navCol = devIntCol.hasOwnProperty(devName) ? devIntCol[devName] + 1 : 1;
        occurrences.push({ row: rowI + 3, col: navCol, device: devName }); // 1-based
      });
    });

    if (!occurrences.length) return { total: 0, idx: 0, device: '' };
    const safeIdx = ((occIdx % occurrences.length) + occurrences.length) % occurrences.length;
    const target = occurrences[safeIdx];
    ss.setActiveSheet(sheet);
    sheet.setActiveRange(sheet.getRange(target.row, target.col));
    return { total: occurrences.length, idx: safeIdx, device: target.device };
  } catch (e) { return { total: 0, idx: 0 }; }
}

function getSheetDeviceList() {
  const devices = getExistingDevices();
  const sheetHidden = getSheetViewHidden();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_DATA);
  if (!sheet) return devices.map(function(d) {
    return { name: d.name, isVisible: !sheetHidden.includes(d.name), isArista: d.type !== 'non-arista', hostname: d.hostname || "" };
  });
  return devices.map(function(d) {
    return { name: d.name, isVisible: !sheetHidden.includes(d.name), isArista: d.type !== 'non-arista', hostname: d.hostname || "" };
  });
}

function toggleSheetDevice(deviceName, hidden) {
  const hiddenList = getSheetViewHidden();
  if (hidden) {
    if (!hiddenList.includes(deviceName)) hiddenList.push(deviceName);
  } else {
    const idx = hiddenList.indexOf(deviceName);
    if (idx > -1) hiddenList.splice(idx, 1);
  }
  saveSheetViewHidden(hiddenList);
  // Full reset via applyCustomView — same path as column toggle — ensures device columns
  // are shown/hidden respecting the current column type view (not stale mode strings).
  applyCustomView(getViewPreferences());
  refreshSheetRowVisibility();
  return { success: true };
}

function showAllSheetDevices() {
  saveSheetViewHidden([]);
  applyCustomView(getViewPreferences());
  refreshSheetRowVisibility();
  return getSheetDeviceList();
}

function hideAllSheetDevices() {
  const allNames = getExistingDevices().map(function(d) { return d.name; });
  saveSheetViewHidden(allNames);
  applyCustomView(getViewPreferences());
  refreshSheetRowVisibility();
  return getSheetDeviceList();
}

function batchToggleSheetDevices(names, hidden) {
  let hiddenList = getSheetViewHidden();
  names.forEach(function(name) {
    if (hidden) {
      if (!hiddenList.includes(name)) hiddenList.push(name);
    } else {
      const idx = hiddenList.indexOf(name);
      if (idx > -1) hiddenList.splice(idx, 1);
    }
  });
  saveSheetViewHidden(hiddenList);
  applyCustomView(getViewPreferences());
  refreshSheetRowVisibility();
  return getSheetDeviceList();
}

// ─────────────────────────────────────────────────────────────────
// SHEET ROW VISIBILITY (dummy column + row hide/show)
// ─────────────────────────────────────────────────────────────────

const DUMMY_VIS_HEADER = '_sys_';

function ensureDummyColumn(sheet) {
  // _sys_ column stays visible at all times — eliminates all "can't hide last column" errors.
  // Device columns start at col 2+; setColumnVisibility already skips col 1.
  const exists = sheet.getLastColumn() >= 1 && String(sheet.getRange(2, 1).getValue()) === DUMMY_VIS_HEADER;
  if (!exists) {
    sheet.insertColumnBefore(1);
    const hdrCell = sheet.getRange(2, 1);
    hdrCell.setValue(DUMMY_VIS_HEADER);
    hdrCell.setNote('Managed by TopoAssist — do not edit.\nThis column tracks row visibility and is required for the hide/show feature to work correctly.');
    sheet.getRange(1, 1).setValue('↕');
    sheet.setColumnWidth(1, 36);
  }
  // Always apply gray styling so the column is visually marked as reserved
  const numRows = Math.max(sheet.getLastRow(), 3);
  sheet.getRange(1, 1, numRows, 1).setBackground('#e2e8f0');
  return 1;
}

function refreshSheetRowVisibility() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_DATA);
  if (!sheet) return;
  const lastRow = sheet.getLastRow();
  if (lastRow < 3) return;

  // Ensure _sys_ is at col 1 FIRST — may insert a column, shifting others
  const visColIdx = ensureDummyColumn(sheet);
  const lastCol = sheet.getLastColumn(); // re-read after possible insert
  if (lastCol < 2) return; // need at least _sys_ + one device column

  const hiddenDevs = new Set(getSheetViewHidden());
  const headers = sheet.getRange(2, 1, 1, lastCol).getValues()[0]; // re-read after insert

  // Build device → column index maps for int_, ip_type_, sp_mode_, svi_vlan_, po_, vlan_ (visible devices only)
  // Single pass over headers.
  const ipFilter      = getSheetViewIpFilter();      // [] = all shown
  const intModeFilter = getSheetViewIntModeFilter();  // [] = all shown
  const sviFilter     = getSheetViewSviFilter();      // [] = all shown
  const devIntCol    = {}; // lowercased device name → int_ col index
  const devIpTypeCol = {}; // lowercased device name → ip_type_ col index
  const devSpModeCol = {}; // lowercased device name → sp_mode_ col index
  const devSviCol    = {}; // lowercased device name → svi_vlan_ col index
  const devPoCol     = {}; // lowercased device name → po_ col index
  const devVlanCol   = {}; // lowercased device name → vlan_ col index
  const visIntCols   = [];
  headers.forEach(function(h, i) {
    if (i + 1 === visColIdx) return; // skip _sys_
    const s = String(h);
    if (s.startsWith('int_')) {
      const dev = s.slice(4);
      if (!hasKey(hiddenDevs, dev)) { devIntCol[dev.toLowerCase()] = i; visIntCols.push(i); }
    } else if (s.startsWith('ip_type_')) {
      const dev = s.slice(8);
      if (!hasKey(hiddenDevs, dev)) devIpTypeCol[dev.toLowerCase()] = i;
    } else if (s.startsWith('sp_mode_')) {
      const dev = s.slice(8);
      if (!hasKey(hiddenDevs, dev)) devSpModeCol[dev.toLowerCase()] = i;
    } else if (s.startsWith('svi_vlan_')) {
      const dev = s.slice(9);
      if (!hasKey(hiddenDevs, dev)) devSviCol[dev.toLowerCase()] = i;
    } else if (s.startsWith('po_')) {
      const dev = s.slice(3);
      if (!hasKey(hiddenDevs, dev)) devPoCol[dev.toLowerCase()] = i;
    } else if (s.startsWith('vlan_')) {
      const dev = s.slice(5);
      if (!hasKey(hiddenDevs, dev)) devVlanCol[dev.toLowerCase()] = i;
    }
  });

  const dataRowCount = lastRow - 2;
  const allData = sheet.getRange(3, 1, dataRowCount, lastCol).getValues(); // re-read after insert
  const toShow = [], toHide = [];

  allData.forEach((row, ri) => {
    let active = visIntCols.length > 0 && visIntCols.some(ci => {
      const v = row[ci];
      return v !== null && v !== undefined && String(v).trim() !== '';
    });
    // AND: ip_type filter — check ip_type_ for devices active on this row via any L2/L3 column
    // (int + po + sp_mode + vlan + svi_vlan). Using only int_ would miss L2-only rows where
    // po_ or vlan_ is set but int_ is blank.
    if (active && ipFilter.length > 0) {
      active = Object.keys(devIntCol).some(function(dev) {
        const isL2L3Active = (
          String(row[devIntCol[dev]] || '').trim() ||
          (devPoCol[dev]     !== undefined && String(row[devPoCol[dev]]     || '').trim()) ||
          (devSpModeCol[dev] !== undefined && String(row[devSpModeCol[dev]] || '').trim()) ||
          (devVlanCol[dev]   !== undefined && String(row[devVlanCol[dev]]   || '').trim()) ||
          (devSviCol[dev]    !== undefined && String(row[devSviCol[dev]]    || '').trim())
        );
        if (!isL2L3Active) return false;
        const ipTypeCol = devIpTypeCol[dev];
        if (ipTypeCol === undefined) return ipFilter.includes('blank');
        const ipRaw = String(row[ipTypeCol] || '').toLowerCase().trim();
        const ipVal = (ipRaw === 'p2p' || ipRaw === 'gw') ? ipRaw : 'blank';
        return ipFilter.includes(ipVal);
      });
    }
    // AND: int_mode filter — check sp_mode_ only for devices active on this row
    if (active && intModeFilter.length > 0) {
      active = Object.keys(devIntCol).some(function(dev) {
        const intVal = String(row[devIntCol[dev]] || '').trim();
        if (!intVal) return false;
        const spModeCol = devSpModeCol[dev];
        if (spModeCol === undefined) return true; // no sp_mode_ column → always passes
        const sp = String(row[spModeCol] || '').toLowerCase().trim();
        if (!sp) return true; // blank sp_mode_ always passes filter
        return intModeFilter.includes(sp);
      });
    }
    // AND: svi filter — check svi_vlan_ only for devices active on this row
    if (active && sviFilter.length > 0) {
      active = Object.keys(devIntCol).some(function(dev) {
        const intVal = String(row[devIntCol[dev]] || '').trim();
        if (!intVal) return false;
        const sviCol = devSviCol[dev];
        if (sviCol === undefined) return sviFilter.includes('blank');
        const sviVal = String(row[sviCol] || '').toLowerCase().trim();
        return sviFilter.includes(sviVal ? 'active' : 'blank');
      });
    }
    (active ? toShow : toHide).push(ri + 3);
  });

  _batchRowOp(sheet, toShow, false);
  _batchRowOp(sheet, toHide, true);
}

function _batchRowOp(sheet, rowNums, hide) {
  if (!rowNums.length) return;
  rowNums.sort((a, b) => a - b);
  let start = rowNums[0], count = 1;
  for (let i = 1; i < rowNums.length; i++) {
    if (rowNums[i] === rowNums[i - 1] + 1) {
      count++;
    } else {
      hide ? sheet.hideRows(start, count) : sheet.showRows(start, count);
      start = rowNums[i]; count = 1;
    }
  }
  hide ? sheet.hideRows(start, count) : sheet.showRows(start, count);
}

/**
* Global Network Feature Flags
*/
function getNetworkSettings() {
  const props = PropertiesService.getDocumentProperties();

  // ── Legacy migration (one-shot on first read) ───────────────────────────
  // NET_UNDERLAY='bgp'/'ospf'/'bgp+ospf' → BGP_IPV4 / OSPF_IPV4
  // NET_VXLAN='true'                      → VXLAN_IPV4
  // NET_EVPN='true'                       → EVPN_IPV4
  const legacyUnderlay = props.getProperty('NET_UNDERLAY') ||
                         (props.getProperty('NET_BGP') === 'true' ? 'bgp' : 'none');
  const legacyVxlan = props.getProperty('NET_VXLAN') === 'true';
  const legacyEvpn  = props.getProperty('NET_EVPN')  === 'true';

  // Helper: read stored bool, fall back to default if key not yet written
  const get = (key, fallback) => {
    const v = props.getProperty(key);
    return v !== null ? v === 'true' : fallback;
  };
  // Helper: read stored string, fall back to default if key not yet written
  const getString = (key, fallback) => {
    const v = props.getProperty(key);
    return v !== null ? v : fallback;
  };

  // ── Interface ────────────────────────────────────────────────────────────
  const int_ipv4      = get('INT_IPV4',      true);   // default true = legacy P2P always had IPv4
  const int_ipv6      = get('INT_IPV6',      true);   // default true = backward compat
  const int_ipv6_unnum= get('INT_IPV6_UNNUM',false);

  // ── GW (gateway interfaces: SVI, sub-int, L3 routed) ────────────────────
  // gw_ipv4 defaults true (GW always had IPv4 historically)
  // gw_ipv6 defaults to int_ipv6 so existing projects that had IPv6 P2P keep IPv6 GW
  const gw_ipv4 = get('GW_IPV4', true);
  const gw_ipv6 = get('GW_IPV6', int_ipv6);

  // ── BGP ──────────────────────────────────────────────────────────────────
  const hadBgp        = legacyUnderlay.includes('bgp');
  const bgp_ipv4      = get('BGP_IPV4',      hadBgp);
  const bgp_ipv6      = get('BGP_IPV6',      false);
  const bgp_ipv6_unnum= get('BGP_IPV6_UNNUM',false);
  const bgp_rfc5549   = get('BGP_RFC5549',   false);

  // ── OSPF ─────────────────────────────────────────────────────────────────
  const hadOspf        = legacyUnderlay.includes('ospf');
  const ospf_ipv4      = get('OSPF_IPV4',      hadOspf);
  const ospf_ipv6      = get('OSPF_IPV6',      false);
  const ospf_ipv6_unnum= get('OSPF_IPV6_UNNUM',false);

  // ── VXLAN ────────────────────────────────────────────────────────────────
  const vxlan_ipv4 = get('VXLAN_IPV4', legacyVxlan);
  const vxlan_ipv6 = get('VXLAN_IPV6', false);

  // ── EVPN ─────────────────────────────────────────────────────────────────
  const evpn_ipv4 = get('EVPN_IPV4', legacyEvpn);
  const evpn_ipv6 = get('EVPN_IPV6', false);

  // ── EVPN Service Model + L3 GW Type ─────────────────────────────────────
  // evpn_service: 'per-vlan' (default) | 'vlan-aware-bundle'
  // gw_l3_type:   'anycast' (default, ip address virtual) | 'varp' (ip virtual-router address)
  // varp_mac:     MAC address for ip virtual-router mac-address (VARP standalone only)
  const evpn_service = getString('EVPN_SERVICE', 'per-vlan');
  const gw_l3_type   = getString('GW_L3_TYPE',   'anycast');
  const varp_mac     = getString('VARP_MAC',      '001c.7300.0099');

  // ── Derived scalar for legacy callers ────────────────────────────────────
  const hasBgp  = bgp_ipv4 || bgp_ipv6 || bgp_ipv6_unnum || bgp_rfc5549;
  const hasOspf = ospf_ipv4 || ospf_ipv6 || ospf_ipv6_unnum;
  const underlay = (hasBgp && hasOspf) ? 'bgp+ospf' : hasBgp ? 'bgp' : hasOspf ? 'ospf' : 'none';

  return {
    // Interface (P2P)
    int_ipv4, int_ipv6, int_ipv6_unnum,
    // Gateway
    gw_ipv4, gw_ipv6,
    // BGP
    bgp_ipv4, bgp_ipv6, bgp_ipv6_unnum, bgp_rfc5549,
    // OSPF
    ospf_ipv4, ospf_ipv6, ospf_ipv6_unnum,
    // VXLAN
    vxlan_ipv4, vxlan_ipv6,
    // EVPN
    evpn_ipv4, evpn_ipv6,
    // EVPN service model + L3 GW type
    evpn_service, gw_l3_type, varp_mac,
    // Legacy derived (used by old call sites)
    underlay,
    vxlan: String(vxlan_ipv4 || vxlan_ipv6),
    evpn:  String(evpn_ipv4  || evpn_ipv6),
    // UI gating: VARP radio enabled when EVPN or MLAG is active
    hasMlag: Object.keys(getDeviceMlagPeers()).length > 0
  };
}

function saveNetworkSettings(settings) {
  const props = PropertiesService.getDocumentProperties();
  const b = (v) => v ? 'true' : 'false';
  props.setProperties({
    'INT_IPV4':       b(settings.int_ipv4 !== false),  // default true if omitted
    'INT_IPV6':       b(settings.int_ipv6),
    'INT_IPV6_UNNUM': b(settings.int_ipv6_unnum),
    'GW_IPV4':        b(settings.gw_ipv4 !== false),   // default true if omitted
    'GW_IPV6':        b(settings.gw_ipv6),
    'BGP_IPV4':       b(settings.bgp_ipv4),
    'BGP_IPV6':       b(settings.bgp_ipv6),
    'BGP_IPV6_UNNUM': b(settings.bgp_ipv6_unnum),
    'BGP_RFC5549':    b(settings.bgp_rfc5549),
    'OSPF_IPV4':      b(settings.ospf_ipv4),
    'OSPF_IPV6':      b(settings.ospf_ipv6),
    'OSPF_IPV6_UNNUM':b(settings.ospf_ipv6_unnum),
    'VXLAN_IPV4':     b(settings.vxlan_ipv4),
    'VXLAN_IPV6':     b(settings.vxlan_ipv6),
    'EVPN_IPV4':      b(settings.evpn_ipv4),
    'EVPN_IPV6':      b(settings.evpn_ipv6),
    'EVPN_SERVICE':   settings.evpn_service   || 'per-vlan',
    'GW_L3_TYPE':     settings.gw_l3_type     || 'anycast',
    'VARP_MAC':       settings.varp_mac        || '001c.7300.0099'
  });
  return { success: true };
}
/**
* -------------------
* UI LAUNCHERS
* -------------------
*/
function showTopologyWindow() {
  try { ensureOnChangeTrigger(); } catch (e) {}
  try { ensureOnOpenTrigger();  } catch (e) {}
  const template = HtmlService.createTemplateFromFile('Sidebar');
  template.initialMode = 'topology';
  const settings = getUiSettings(); // Use the helper

  template.defaultWidth = settings.width;
  template.defaultDevGap = settings.devGap;
  template.defaultOffset = settings.offset;
  template.defaultTop = settings.top;
  template.defaultRefresh = settings.refresh;
  template.defaultAuto = settings.auto;

  const html = template.evaluate().setWidth(1600).setHeight(900).setTitle(`Live Network Topology v${APP_VERSION}`);
  SpreadsheetApp.getUi().showModelessDialog(html, 'Network Topology');
}

function showDeviceManagerUi() {
  const template = HtmlService.createTemplateFromFile('Sidebar');
  template.initialMode = 'manager';
  const settings = getUiSettings(); // Use the helper

  template.defaultWidth = settings.width;
  template.defaultDevGap = settings.devGap;
  template.defaultOffset = settings.offset;
  template.defaultTop = settings.top;
  template.defaultRefresh = settings.refresh;
  template.defaultAuto = settings.auto;

  const html = template.evaluate().setWidth(1000).setHeight(1000).setTitle('Device Manager');
  SpreadsheetApp.getUi().showModelessDialog(html, 'Device Manager');
}

function showDeviceDataUi() {
  const template = HtmlService.createTemplateFromFile('Sidebar');
  template.initialMode = 'schema';

  // Use the unified settings helper instead of hardcoded strings
  const settings = getUiSettings();

  template.defaultWidth = settings.width;
  template.defaultDevGap = settings.devGap;
  template.defaultOffset = settings.offset;
  template.defaultTop = settings.top;
  template.defaultRefresh = settings.refresh;
  template.defaultAuto = settings.auto;

  const html = template.evaluate()
    .setWidth(700)
    .setHeight(800)
    .setTitle('Manage Column & Formatting');

  SpreadsheetApp.getUi().showModelessDialog(html, 'Manage Column & Formatting');
}

function openUserGuide() {
  const htmlOutput = HtmlService.createTemplateFromFile('UserGuide').evaluate()
    .setWidth(900)
    .setHeight(850);

  SpreadsheetApp.getUi().showModalDialog(htmlOutput, 'User Documentation');
}

/**
* -------------------
* SCHEMA STORAGE (ARRAY BASED FOR ORDERING)
* -------------------
*/
// Defines the exact Default Order & Options
const DEFAULT_SCHEMA_ARRAY = [
  { key: 'int', label: 'Interface', options: [] },
  { key: 'po', label: 'Port-Channel', options: [] },
  { key: 'sp_mode', label: 'Mode', options: ['l2-et-access', 'l2-et-trunk', 'l2-po-access', 'l2-po-trunk', 'l3-et-int', 'l3-et-sub-int', 'l3-po-int', 'l3-po-sub-int'] },
  { key: 'vlan', label: 'VLANs', options: [] },
  { key: 'svi_vlan', label: 'SVI VLANs', options: [] },  // free-text: 'all' or VLAN IDs e.g. '10' or '10,20'
  { key: 'ip_type', label: 'IP Type', options: ['p2p', 'gw'] },
  { key: 'vrf', label: 'VRF', options: [] },
  { key: 'et_speed', label: 'Et Speed', options: ['auto', '1g', '10g', '25g', '40g-4', '50g-1', '50g-2', '100g-1', '100g-2', '100g-4', '200g-1', '200g-2', '200g-4', '400g-2', '400g-4', '400g-8', '800g-4', '800g-8', '1.6t-8', 'sfp-1000baset'] },
  { key: 'xcvr_speed', label: 'Xcvr Speed', options: ['auto', '1g', '10g', '25g', '40g-4', '50g-1', '50g-2', '100g-1', '100g-2', '100g-4', '200g-1', '200g-2', '200g-4', '400g-2', '400g-4', '400g-8', '800g-4', '800g-8', '1.6t-8', 'sfp-1000baset'] },
  { key: 'encoding', label: 'FEC', options: ['fire-code', 'reed-solomon'] },
  { key: 'xcvr_type', label: 'Xcvr Type', options: [] },
  { key: 'snake_int', label: 'Snake Port', options: [] },
  { key: 'desc', label: 'Description', options: [] },
  { key: 'sd', label: 'SD', options: [] },
  { key: 'dp-pp-mp', label: 'DP-PP-MP', options: [] }
];

/**
* [UPDATED] Robust Schema Getter
*/
function getSchemaConfig() {
  try {
    const props = PropertiesService.getDocumentProperties();
    const json = props.getProperty('SCHEMA_CONFIG_ARRAY');
    if (json && json.trim() !== "") {
      try {
        const parsed = JSON.parse(json);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) { console.warn("△ Schema JSON corrupted. Reverting to default schema.", e); }
    }
  } catch (e) { console.error("Error accessing document properties:", e); }
  return DEFAULT_SCHEMA_ARRAY;
}

function saveSchemaConfig(newArray) {
  // Server-side prefix collision guard: reject schema where one key is a prefix of another.
  // Such pairs cause silent data loss in rebuildSheet (xcvr_ is a prefix of xcvr_speed_, etc.).
  const keys = newArray.map(i => i.key + "_");
  for (let i = 0; i < keys.length; i++) {
    for (let j = 0; j < keys.length; j++) {
      if (i !== j && keys[j].startsWith(keys[i])) {
        return { error: `Schema key "${newArray[i].key}" is a prefix of "${newArray[j].key}". ` +
                        `This causes silent data loss during sync. Rename one of them.` };
      }
    }
  }
  PropertiesService.getDocumentProperties().setProperty('SCHEMA_CONFIG_ARRAY', JSON.stringify(newArray));
  return { success: true };
}

function resetSchemaToDefaults() {
  PropertiesService.getDocumentProperties().deleteProperty('SCHEMA_CONFIG_ARRAY');
  return getSchemaConfig();
}


/**
* -------------------
* UPDATED HELPERS
* -------------------
*/
function getAttributeSchema() {
  const schemaArray = getSchemaConfig();
  let keys = [];
  let rules = {};

  if (!schemaArray || !Array.isArray(schemaArray)) {
    console.error("[SCHEMA] Failed to retrieve schemaArray. Using empty defaults.");
    return { keys: [], rules: {} };
  }

  schemaArray.forEach(item => {
    let key = item.key + '_';
    keys.push(key);
    if (item.options && item.options.length > 0) {
      const cleanOptions = item.options.filter(opt => String(opt).trim() !== "");
      if (cleanOptions.length > 0) {
        rules[key] = SpreadsheetApp.newDataValidation()
          .requireValueInList(cleanOptions)
          .setAllowInvalid(true)
          .build();
      }
    }
  });
  return { keys: keys, rules: rules };
}

function getDropdowns() { // Removed unused 'ss'
  const schemaArray = getSchemaConfig();
  const options = {};
  schemaArray.forEach(item => {
    if (item.options && item.options.length > 0) {
      options[item.key] = item.options;
    }
  });
  return options;
}

function getLegends() { // Removed unused 'ss'
  const schemaArray = getSchemaConfig();
  const legends = { gw: [], p2p: [], l2: [] };

  const categorize = (list, type) => {
    if (!list) return;
    list.forEach(opt => {
      let s = String(opt).toLowerCase();
      if (type === 'ip_type') {
        if (s.includes('gw')) legends.gw.push(opt);
        if (s.includes('p2p') || s.includes('l3')) legends.p2p.push(opt);
      }
      if (type === 'sp_mode') {
        if (s.includes('access') || s.includes('trunk') || s.includes('l2')) legends.l2.push(opt);
      }
    });
  };

  schemaArray.forEach(item => {
    if (item.key === 'ip_type') categorize(item.options, 'ip_type');
    if (item.key === 'sp_mode') categorize(item.options, 'sp_mode');
  });
  return legends;
}

/**
* -------------------
* SYNC LOGIC (Fixed: Formatting + Orphan Safety)
* -------------------
*/
/**
* Returns orphaned attribute keys (in sheet but not in schema) with a hasData flag.
* Used by client to show a confirm() before sync — safer than server-side ui.alert()
* which is invisible behind the sidebar loading overlay.
* optionalTargetSchema: pass the schema array being applied (null = current saved schema).
*/
function getOrphanedColumnsInfo(optionalTargetSchema) {
  const mappingSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_DATA);
  if (!mappingSheet) return [];

  const schemaArray = optionalTargetSchema || getSchemaConfig();
  const targetKeys = schemaArray.map(function(item) { return item.key + '_'; });
  const devices = getExistingDevices();

  // Build the complete set of expected row-2 headers from schema × devices.
  // Any column NOT in this set is an orphan — regardless of its header format.
  const deviceNames = devices.map(function(d) { return d.name; });
  const expectedHeaders = new Set([DUMMY_VIS_HEADER]);
  deviceNames.forEach(function(name) {
    targetKeys.forEach(function(k) { expectedHeaders.add(k + name); });
  });

  const lastRow = mappingSheet.getLastRow();
  const lastCol = mappingSheet.getLastColumn();
  if (lastCol < 1) return [];

  const row2 = mappingSheet.getRange(2, 1, 1, lastCol).getValues()[0];
  const dataValues = lastRow >= 3
    ? mappingSheet.getRange(3, 1, lastRow - 2, lastCol).getValues()
    : [];

  const orphans = [];
  for (let c = 0; c < lastCol; c++) {
    const header = String(row2[c]).trim();
    if (expectedHeaders.has(header)) continue;

    let hasData = false;
    for (let r = 0; r < dataValues.length && !hasData; r++) {
      if (dataValues[r][c] !== '' && dataValues[r][c] !== null && dataValues[r][c] !== undefined) {
        hasData = true;
      }
    }

    // Display key: strip device-name suffix if present, else show raw header.
    // If no current device matched, this column belongs to a removed device —
    // mark it so the dialog can show it as always-deleted (can't be kept).
    let displayKey = header;
    let removedDevice = true;
    for (let di = 0; di < deviceNames.length; di++) {
      if (header.endsWith(deviceNames[di])) {
        displayKey = header.slice(0, header.length - deviceNames[di].length);
        removedDevice = false;
        break;
      }
    }
    orphans.push({ key: displayKey || '(blank)', hasData: hasData, removedDevice: removedDevice });
  }
  return orphans;
}

function syncSchemaPreservingOrder(optionalForcedSchema, applyFormatting, deleteOrphans) {
  // deleteOrphans: undefined/null = prompt via ui.alert (menu/dialog context)
  //                true  = delete orphaned columns (sidebar flow — user confirmed)
  //                false = schema is already clean, skip orphan handling
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const mappingSheet = ss.getSheetByName(SHEET_DATA);

  if (!mappingSheet) return;

  // Always guarantee _sys_ is at col A before any other work — even if rebuild
  // is skipped (no devices) or fails partway through.
  ensureDummyColumn(mappingSheet);

  safeCachePut(CacheService.getUserCache(), 'SYNC_STATUS', '🔍 Analyzing schema...', 60);

  // 1. Get the Target Keys
  const schemaArray = optionalForcedSchema || getSchemaConfig();
  let targetKeys = schemaArray.map(item => item.key + "_");

  // 2. Identify "Orphaned" Columns — server-side detection (schema is source of truth)
  const currentDevices = getExistingDevices();
  const orphanedCols = _getOrphanAttrKeys(mappingSheet, targetKeys, currentDevices.map(d => d.name));

  if (orphanedCols.length > 0) {
    let shouldDelete;
    if (deleteOrphans === true) {
      shouldDelete = true;
    } else if (deleteOrphans === false) {
      shouldDelete = false;
    } else {
      // Fallback: ui.alert for menu-triggered calls (not via google.script.run sidebar)
      const msg = `Found ${orphanedCols.length} custom attribute(s) (e.g. ${orphanedCols[0]}) that are NOT in the Schema.\n\n` +
        `Do you want to DELETE them?\n\n` +
        `• YES = Delete columns\n` +
        `• NO / CLOSE = Keep columns`;
      const response = ui.alert('Sync Schema: Orphaned Columns', msg, ui.ButtonSet.YES_NO);
      shouldDelete = (response === ui.Button.YES);
    }

    if (shouldDelete) {
      ss.toast(`Deleting ${orphanedCols.length} columns...`, "Sync Info", 3);
    } else {
      targetKeys = [...targetKeys, ...orphanedCols];
      ss.toast(`Preserving ${orphanedCols.length} custom columns.`, "Sync Info", 3);
    }
  }

  // 3. Verify Devices
  if (currentDevices.length === 0) {
    ui.alert("Schema Saved", "No devices found.", ui.ButtonSet.OK);
    return;
  }

  // 4. Trigger Rebuild with Formatting Flag
  // If applyFormatting is undefined (e.g. called from a script), default to true
  if (applyFormatting === undefined) applyFormatting = true;

  rebuildSheet(currentDevices, targetKeys, applyFormatting);
}

/**
* -------------------
* DEVICE MANAGER LOGIC (FIXED)
* -------------------
*/
function saveDeviceConfiguration(finalDeviceList) {
  if (!finalDeviceList || finalDeviceList.length === 0) return { error: "Device list cannot be empty." };

  // Validate all device names at the boundary before touching the sheet
  for (const dev of finalDeviceList) {
    if (!dev.name || !/^[a-zA-Z0-9_\-]{1,64}$/.test(dev.name)) {
      return { error: `Invalid device name: "${dev.name}". Use alphanumeric, hyphens, or underscores (max 64 chars).` };
    }
  }
  try {
    const currentList = getExistingDevices();
    let isDifferent = (finalDeviceList.length !== currentList.length);

    if (!isDifferent) {
      isDifferent = finalDeviceList.some((newDev, index) => {
        const oldDev = currentList[index];
        return (newDev.name.toLowerCase() !== oldDev.name.toLowerCase() || newDev.type !== oldDev.type);
      });
    }

    if (!isDifferent) return { success: true, noChanges: true };

    // FIX: Always preserve orphans during device reorder
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const mappingSheet = ss.getSheetByName(SHEET_DATA);
    const schemaArray = getSchemaConfig();
    let targetKeys = schemaArray.map(item => item.key + "_");

    if (mappingSheet) {
      const orphanedCols = _getOrphanAttrKeys(mappingSheet, targetKeys, currentList.map(d => d.name));

      // During Device Reorder, we ALWAYS Keep orphans.
      // We don't ask, because the user is focused on Devices, not Schema.
      if (orphanedCols.length > 0) {
        targetKeys = [...targetKeys, ...orphanedCols];
      }
    }

    rebuildSheet(finalDeviceList, targetKeys);
    return { success: true };
  } catch (e) { return { error: e.toString() }; }
}

function auditSchemaVsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_DATA);
  if (!sheet) return { error: "Sheet not found" };

  const lastCol = sheet.getLastColumn();
  const lastRow = sheet.getLastRow();

  if (lastRow < 2 || lastCol < 1) {
    return { extra: [], missing: [], conflicts: [], error: "Sheet is empty." };
  }

  const data = sheet.getDataRange().getValues();
  const headers = data[1].map(h => String(h).trim());

  const devices = getExistingDevices();
  const schema = getSchemaConfig();

  // 1. Build Expected Headers List
  let expectedHeaders = [];

  devices.forEach(d => {
    if (d.type === 'non-arista') {
      expectedHeaders.push('int_' + d.name);
    } else {
      schema.forEach(s => { expectedHeaders.push(s.key + '_' + d.name); });
    }
  });

  const actualHeaders = headers.filter(h => h !== "" && h !== DUMMY_VIS_HEADER);
  const missing = expectedHeaders.filter(h => !actualHeaders.includes(h));
  const extra = actualHeaders.filter(h => !expectedHeaders.includes(h));

  // 2. Per-VLAN VRF audit (pure helper — testable in Tests.gs)
  const aristaDevices = devices.filter(function(dv) { return dv.type !== 'non-arista'; });
  const vrfIssues = _auditVrfIssues(data.slice(2), headers, aristaDevices, 3);

  // RETURN EMPTY CONFLICTS (Logic moved to Client-Side runValidation)
  return {
    extra: extra,
    missing: missing,
    conflicts: [], // <--- Force Empty
    vrfIssues: vrfIssues,
    totalActual: actualHeaders.length,
    totalExpected: expectedHeaders.length
  };
}

function parseAndExpandDevices(inputStr) {
  const rawItems = inputStr.split(',').map(s => s.trim()).filter(s => s !== "");
  let expanded = [];
  const MAX_ITEMS = 50;

  for (const item of rawItems) {
    if (expanded.length >= MAX_ITEMS) break;
    const rangeMatch = item.match(/^(.*)\[(\d+)-(\d+)\](.*)$/);

    if (rangeMatch) {
      const prefix = rangeMatch[1];
      const startStr = rangeMatch[2];
      const endStr = rangeMatch[3];
      let start = parseInt(startStr);
      let end = parseInt(endStr);
      const suffix = rangeMatch[4];

      if (!isNaN(start) && !isNaN(end)) {
        if (start > end) { [start, end] = [end, start]; }

        if ((end - start) > 50) {
          console.warn("Range too large: " + item);
          continue;
        }

        const shouldPad = startStr.startsWith("0");
        const padLen = startStr.length;

        for (let i = start; i <= end; i++) {
          let numPart = String(i);
          if (shouldPad) numPart = numPart.padStart(padLen, "0");
          expanded.push(prefix + numPart + suffix);
        }
      } else {
        expanded.push(item);
      }
    } else {
      expanded.push(item);
    }
  }
  return [...new Set(expanded)];
}

/* ==================================================
 REBUILD ENGINE (FIXED: MERGE ALWAYS, COLOR OPTIONAL, TEXT FORMATTING)
 ================================================== */

/**
 * Returns the most specific (longest) schema key that is a prefix of `header`.
 * Falls back to extracting the underscore-bounded prefix from the header itself.
 *
 * Longest-match is required because schema keys can share a prefix
 * (e.g. if "a_" and "a_b_" both exist). Last-match or first-match both
 * produce silent data loss when the schema contains such pairs.
 *
 * @param {string}        header     Column header, e.g. "xcvr_speed_leaf1"
 * @param {Array<string>} schemaKeys Schema keys with trailing _, e.g. ["xcvr_type_","xcvr_speed_"]
 * @returns {string} Matched schema key, extracted prefix, or "" if no underscore in header
 */
function findAttrKey(header, schemaKeys) {
  let attrKey = "";
  schemaKeys.forEach(k => { if (header.startsWith(k) && k.length > attrKey.length) attrKey = k; });
  if (!attrKey && header.includes("_")) attrKey = header.substring(0, header.lastIndexOf("_") + 1);
  return attrKey;
}


/**
 * Rebuilds the PortMapping sheet from scratch using current device/schema config.
 * Backs up existing data, writes new structure, restores values, applies formatting.
 * @param {Array|null} forcedOrderList - Device order to use; null = detect from sheet
 * @param {Array|null} forcedSchemaList - Schema attribute keys; null = use saved schema
 * @param {boolean} applyFormatting - Whether to apply color formatting (default true)
 * @throws {Error} If backup read fails or no devices are found
 */
function rebuildSheet(forcedOrderList, forcedSchemaList, applyFormatting) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let mappingSheet = ss.getSheetByName(SHEET_DATA);
  if (!mappingSheet) mappingSheet = ss.insertSheet(SHEET_DATA);

  const startTime = new Date().getTime();
  if (applyFormatting === undefined) applyFormatting = true;

  // --- STAGE 1: BACKUP & READ ---
  let backupValues = null;
  let backupFormulas = null;
  const lastR = mappingSheet.getLastRow();
  const lastC = mappingSheet.getLastColumn();

  if (lastR > 0 && lastC > 0) {
    const range = mappingSheet.getRange(1, 1, lastR, lastC);
    backupValues = range.getValues();
    backupFormulas = range.getFormulas();
    if (!backupValues || backupValues.length === 0) {
      throw new Error("Backup failed: Could not read sheet data before rebuild.");
    }
  }

  SpreadsheetApp.flush();

  const syncCache = CacheService.getUserCache();

  try {
    safeCachePut(syncCache, 'SYNC_STATUS', '📋 Phase 1/4: Reading sheet data...', 60);
    ss.toast("Phase 1: Analyzing structure...", "Syncing", 1);
    const schemaObj = getAttributeSchema();
    const globalAttributes = forcedSchemaList ? forcedSchemaList : schemaObj.keys;

    let memory = {};
    let detectedDevicesList = [];

    // READ DATA INTO MEMORY
    if (backupValues && backupValues.length > 1 && backupValues[0].length > 0) {
      const r1 = backupValues[0];
      const r2 = backupValues[1];
      let currentDev = null;
      let registeredNonArista = getNonAristaList();

      // Build hostname→devName reverse map so Row 1 can store hostnames
      // without breaking backup keying (which must use short device names).
      const hostnameToDevName = {};
      const savedHostnames = getDeviceHostnames();
      Object.entries(savedHostnames).forEach(([devName, hn]) => { hostnameToDevName[hn] = devName; });
      if (forcedOrderList) {
        forcedOrderList.forEach(d => { if (d.hostname && d.hostname.trim()) hostnameToDevName[d.hostname.trim()] = d.name; });
      }

      // Pre-build column counts per device (avoids O(n²) forEach inside the loop)
      const deviceColCounts = {};
      for (let c = 0; c < r2.length; c++) {
        const h = String(r2[c]).trim();
        if (!h) continue;
        const lastUnderscore = h.lastIndexOf("_");
        if (lastUnderscore !== -1) {
          const dev = h.substring(lastUnderscore + 1);
          deviceColCounts[dev] = (deviceColCounts[dev] || 0) + 1;
        }
      }

      for (let c = 0; c < r1.length; c++) {
        if (r1[c]) {
          const r1Val = String(r1[c]).trim();
          if (r1Val === "") continue;
          // Normalize: if Row 1 stores a hostname, map back to the short device name
          currentDev = hostnameToDevName[r1Val] || r1Val;
          if (!detectedDevicesList.some(d => d.name === currentDev)) {
            const colCount = deviceColCounts[currentDev] || 0;

            let type = (registeredNonArista.includes(currentDev) || colCount === 1) ? 'non-arista' : 'full';
            detectedDevicesList.push({ name: currentDev, type: type });
          }
        }
        if (currentDev) {
          if (!memory[currentDev]) memory[currentDev] = {};
          let header = String(r2[c]).trim();
          const attrKey = findAttrKey(header, schemaObj.keys);

          if (attrKey) {
            for (let rowIdx = 2; rowIdx < backupValues.length; rowIdx++) {
              if (!memory[currentDev][rowIdx - 2]) memory[currentDev][rowIdx - 2] = {};
              let val = backupValues[rowIdx][c];
              memory[currentDev][rowIdx - 2][attrKey] = val;
            }
          }
        }
      }
    }

    const devicesToProcess = forcedOrderList || detectedDevicesList;
    if (!devicesToProcess || devicesToProcess.length === 0) {
      if (!forcedOrderList) throw new Error("No devices found. Aborting.");
    }

    // PREPARE NEW DATA STRUCTURE
    let outRow1 = [], outRow2 = [], bodyData = [];
    let validationQueue = [];
    let currentColumnCursor = 1;

    let maxDataRows = 0;
    Object.values(memory).forEach(rows => {
      let len = Object.keys(rows).length;
      if (len > maxDataRows) maxDataRows = len;
    });

    devicesToProcess.forEach((devObj, i) => {
      const devName = devObj.name;
      const isNonArista = devObj.type === 'non-arista';
      const suffix = devName;

      const devAttributes = isNonArista ? ['int_'] : globalAttributes;

      outRow1.push(devObj.hostname || devName);
      for (let k = 1; k < devAttributes.length; k++) outRow1.push("");

      devAttributes.forEach((attr, aIdx) => {
        outRow2.push(attr + suffix);
        if (!isNonArista && schemaObj.rules && schemaObj.rules[attr]) {
          validationQueue.push({ col: currentColumnCursor + aIdx, rule: schemaObj.rules[attr] });
        }
      });
      currentColumnCursor += devAttributes.length;
    });

    for (let r = 0; r < maxDataRows; r++) {
      let row = [];
      devicesToProcess.forEach(devObj => {
        const isNonArista = devObj.type === 'non-arista';

        const attrs = isNonArista ? ['int_'] : globalAttributes;
        attrs.forEach(attr => {
          let val = (memory[devObj.name] && memory[devObj.name][r]) ? memory[devObj.name][r][attr] : "";
          row.push(val || "");
        });
      });
      bodyData.push(row);
    }

    // --- SAFETY CHECK: DATA INTEGRITY (FIXED) ---
    // 1. Headers must always exist (Row 1 = Device Names, Row 2 = Attributes)
    if (!outRow1 || outRow1.length === 0 || !outRow2 || outRow2.length === 0) {
      throw new Error("Internal Error: Generated headers are empty. Aborting.");
    }

    // 2. Data Loss Protection
    // We only block if the sheet HAD data rows (backup > 2) but the new version has ZERO.
    // This allows creating the first device columns on a blank sheet.
    if (backupValues && backupValues.length > 2 && (!bodyData || bodyData.length === 0)) {
      console.error("rebuildSheet: Safety Block Triggered. Source had rows, New has 0.");
      throw new Error("Internal Error: Generated data is empty. Operation cancelled to protect your data.");
    }

    // --- PRE-WRITE OCCUPANCY DIFF ---
    // Compare non-empty cell counts per attrKey before (raw backupValues) vs after (bodyData).
    // Pre-counts are derived from the raw sheet data — independent of memory keying bugs.
    // If any schema column that had data would become empty → throw before touching the sheet.
    if (backupValues && backupValues.length > 2) {
      const r2raw = backupValues[1];
      const preNonEmpty = {};
      for (let c = 0; c < r2raw.length; c++) {
        const key = findAttrKey(String(r2raw[c]).trim(), schemaObj.keys);
        if (!key) continue;
        for (let r = 2; r < backupValues.length; r++) {
          const v = backupValues[r][c];
          if (v !== "" && v !== null && v !== undefined) preNonEmpty[key] = (preNonEmpty[key] || 0) + 1;
        }
      }
      const postNonEmpty = {};
      let cur = 0;
      devicesToProcess.forEach(devObj => {
        const attrs = devObj.type === 'non-arista' ? ['int_'] : globalAttributes;
        attrs.forEach(attr => {
          bodyData.forEach(row => {
            if (row[cur] !== "" && row[cur] !== null && row[cur] !== undefined)
              postNonEmpty[attr] = (postNonEmpty[attr] || 0) + 1;
          });
          cur++;
        });
      });
      const wiped = globalAttributes.filter(
        k => (preNonEmpty[k] || 0) > 0 && (postNonEmpty[k] || 0) === 0
      );
      if (wiped.length > 0) {
        throw new Error(
          `Safety block: column(s) [${wiped.map(k => k.replace(/_$/, '')).join(', ')}] had data ` +
          `before sync but would be empty after. Aborting to protect your data.`
        );
      }
    }

    // --- STAGE 2: COMMIT DATA (ALWAYS RUNS) ---
    safeCachePut(syncCache, 'SYNC_STATUS', '✏️ Phase 2/4: Writing to sheet...', 60);
    if (mappingSheet.getFilter()) mappingSheet.getFilter().remove();
    mappingSheet.setFrozenRows(2);

    const finalColCount = outRow1.length;
    const finalRowCount = Math.max(bodyData.length + 5, 5);

    let currentMaxC = mappingSheet.getMaxColumns();
    if (currentMaxC < finalColCount) mappingSheet.insertColumnsAfter(currentMaxC, finalColCount - currentMaxC);

    let currentMaxR = mappingSheet.getMaxRows();
    if (currentMaxR < finalRowCount) mappingSheet.insertRowsAfter(currentMaxR, finalRowCount - currentMaxR);

    // Clear Old Data & Formats (clearNote prevents ghost note on shifted columns after _sys_ re-insert)
    mappingSheet.getRange(1, 1, mappingSheet.getMaxRows(), mappingSheet.getMaxColumns())
      .clearContent()
      .clearFormat()
      .clearNote()
      .setDataValidation(null)
      .setBackground(null);

    // Write Headers Immediately
    mappingSheet.getRange(1, 1, 1, outRow1.length).setValues([outRow1]);
    mappingSheet.getRange(2, 1, 1, outRow2.length).setValues([outRow2]);

    if (bodyData.length > 0) {
      const dataRange = mappingSheet.getRange(3, 1, bodyData.length, bodyData[0].length);
      dataRange.setNumberFormat("@");
      dataRange.setValues(bodyData);
    }

    // --- STAGE 3: VALIDATION (ALWAYS RUNS) ---
    const dataRowSpan = finalRowCount - 2;
    if (dataRowSpan > 0) {
      validationQueue.forEach(v => {
        try { mappingSheet.getRange(3, v.col, dataRowSpan, 1).setDataValidation(v.rule); } catch (e) { console.warn(`setDataValidation failed at col ${v.col}:`, e.message); }
      });
    }

    // --- STAGE 4: STRUCTURAL FORMATTING (ALWAYS RUNS) ---
    safeCachePut(syncCache, 'SYNC_STATUS', '🎨 Phase 3/4: Applying formatting...', 60);
    ss.toast("Applying structure...", "Formatting", 1);

    mappingSheet.getRange(1, 1, finalRowCount, finalColCount)
      .setFontFamily("Consolas").setFontSize(10).setVerticalAlignment("top").setHorizontalAlignment("center");

    mappingSheet.getRange(1, 1, 2, finalColCount)
      .setFontWeight("bold").setBorder(true, true, true, true, true, true);

    let colorCursor = 0;
    let row1Colors = [];

    devicesToProcess.forEach((devObj, i) => {
      const isNonArista = devObj.type === 'non-arista';
      const devAttributes = isNonArista ? ['int_'] : globalAttributes;

      if (devAttributes.length > 1) {
        try { mappingSheet.getRange(1, colorCursor + 1, 1, devAttributes.length).merge(); } catch (e) { console.warn(`merge failed at col ${colorCursor + 1}:`, e.message); }
      }

      let hue = (200 + (i * 137.5)) % 360;
      let color = applyFormatting ? hslToHex(hue, 85, 88) : "#ffffff";

      for (let k = 0; k < devAttributes.length; k++) row1Colors.push(color);
      colorCursor += devAttributes.length;
    });

    SpreadsheetApp.flush();
    // Adaptive column widths — derived from row 2 header length (Consolas 10px ≈ 7px/char + 16px padding)
    outRow2.forEach((hdr, idx) => {
      const width = Math.max(80, Math.ceil(hdr.length * 7) + 16);
      mappingSheet.setColumnWidth(idx + 1, width);
    });

    // --- STAGE 5: COLOR APPLICATION (CONDITIONAL) ---
    if (applyFormatting) {
      ss.toast("Applying colors...", "Formatting", 1);
      if (row1Colors.length > 0) mappingSheet.getRange(1, 1, 1, row1Colors.length).setBackgrounds([row1Colors]);
      mappingSheet.getRange(2, 1, 1, outRow2.length).setBackground("#f1f5f9");
      applyGlobalFormatting();
    }

    // Re-apply column visibility + recreate _sys_ after full sheet rebuild.
    // Order matters: refreshSheetRowVisibility() calls ensureDummyColumn() first,
    // inserting _sys_ at col 1 and shifting device columns to col 2+.
    // applyCustomView() then reads the correct layout (col A = _sys_, cols B+ = devices).
    safeCachePut(syncCache, 'SYNC_STATUS', '👁️ Phase 4/4: Restoring column view...', 60);
    try {
      refreshSheetRowVisibility();
      applyCustomView(getViewPreferences());
    } catch (visErr) {
      console.warn('Post-rebuild visibility restore failed:', visErr.message);
    }

    safeCachePut(syncCache, 'SYNC_STATUS', '✅ Sync complete', 60);
    ss.toast(`Update Successful (${((new Date().getTime() - startTime) / 1000).toFixed(2)}s)`, "Success", 3);

  } catch (err) {
    // [LOGGING] Log the full error object to the console
    console.error("rebuildSheet Failed:", err);

    if (backupValues && backupValues.length > 0) {
      try {
        ss.toast("Error detected. Rolling back...", "Safety", 10);
        let reqRows = backupValues.length;
        let reqCols = backupValues[0].length;
        if (mappingSheet.getMaxRows() < reqRows) mappingSheet.insertRowsAfter(mappingSheet.getMaxRows(), reqRows - mappingSheet.getMaxRows());
        if (mappingSheet.getMaxColumns() < reqCols) mappingSheet.insertColumnsAfter(mappingSheet.getMaxColumns(), reqCols - mappingSheet.getMaxColumns());
        let restoreData = backupValues;
        if (backupFormulas && backupFormulas.length > 0) {
          restoreData = backupValues.map((row, r) => {
            return row.map((val, c) => {
              const f = (backupFormulas[r] && backupFormulas[r][c]);
              return (f && f !== "") ? f : val;
            });
          });
        }
        mappingSheet.getRange(1, 1, reqRows, reqCols).setValues(restoreData);
      } catch (rollErr) {
        console.error("Rollback failed:", rollErr);
      }
    }
    SpreadsheetApp.getUi().alert("✗ Update Failed", "Error: " + err.message, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

/**
* ========================================================================
* 🎨 GLOBAL VISUAL FORMATTING ENGINE (UPDATED: Light Colors + PO Support)
* ========================================================================
*/

// 1. CONFIGURATION: Define Colors & Rules
// Shared speed-tier color table — applied to both et_speed_ and xcvr_speed_ columns.
// et_speed_ = EOS interface speed; xcvr_speed_ = transceiver module speed.
// Previously keyed as 'speed' (dead — no schema column starts with "speed_").
const _SPEED_COLOR_RULES = [
  { text: '1.6t', bg: '#e0e7ff' },
  { text: '800g', bg: '#fae8ff' },
  { text: '400g', bg: '#f3e8ff' },
  { text: '200g', bg: '#dbeafe' },
  { text: '100g', bg: '#dcfce7' },
  { text: '50g', bg: '#ccfbf1' },
  { text: '40g', bg: '#fef9c3' },
  { text: '25g', bg: '#e0f2fe' },
  { text: '10g', bg: '#f1f5f9' },
  { text: '1g', bg: '#f8fafc' }
];

const FORMAT_CONFIG = {
  colors: {
    orphan: "#ffffff", // White for unconnected (cleaner look)
    textMuted: "#1e293b"
  },
  // Rules for specific columns (Key = Header Prefix)
  rules: {
    'et_speed':   _SPEED_COLOR_RULES,
    'xcvr_speed': _SPEED_COLOR_RULES,
    'xcvr_type': [
      { text: 'OSFP', bg: '#fae8ff' },
      { text: 'QSFP-DD', bg: '#f3e8ff' },
      { text: 'QSFP56', bg: '#dbeafe' },
      { text: 'QSFP28', bg: '#dcfce7' },
      { text: 'QSFP100', bg: '#dcfce7' },
      { text: 'DSFP', bg: '#dcfce7' },
      { text: 'QSFP+', bg: '#fef9c3' },
      { text: 'SFP28', bg: '#e0f2fe' },
      { text: 'SFP25', bg: '#e0f2fe' },
      { text: 'SFP+', bg: '#f1f5f9' },
      { text: 'SFP', bg: '#f8fafc' },
      { text: 'BASE-T', bg: '#ffedd5' }
    ],
    'sp_mode': [
      { text: 'l2-et-access', bg: '#f0fdf4', color: '#15803d', type: 'exact' },
      { text: 'l2-po-access', bg: '#bbf7d0', color: '#14532d', type: 'exact' },
      { text: 'l2-et-trunk', bg: '#fff7ed', color: '#c2410c', type: 'exact' },
      { text: 'l2-po-trunk', bg: '#fed7aa', color: '#7c2d12', type: 'exact' },
      { text: 'l3-et-int', bg: '#f0f9ff', color: '#0369a1', type: 'exact' },
      { text: 'l3-po-int', bg: '#bae6fd', color: '#0c4a6e', type: 'exact' },
      { text: 'l3-et-sub-int', bg: '#faf5ff', color: '#7e22ce', type: 'exact' },
      { text: 'l3-po-sub-int', bg: '#e9d5ff', color: '#581c87', type: 'exact' }
    ],
    'ip_type': [
      { text: 'p2p', bg: '#f3f4f6' },
      { text: 'gw', bg: '#fff1f2' }
    ]
  }
};

// 2. MAIN FUNCTION
function applyGlobalFormatting() {
  applyVisualFormatting();
}

/**
 * ------------------------------------------------------------------------
 * 🎨 GLOBAL VISUAL FORMATTING ENGINE
 * ------------------------------------------------------------------------
 */
function applyVisualFormatting(optionalSheet) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = optionalSheet || ss.getSheetByName(SHEET_DATA);
    if (!sheet) {
      console.warn("applyVisualFormatting: Sheet not found");
      return;
    }

    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastRow < 3) return;

    // Read Data
    const headers = sheet.getRange(2, 1, 1, lastCol).getValues()[0].map(String);
    const dataRange = sheet.getRange(3, 1, lastRow - 2, lastCol);
    const data = dataRange.getValues();

    // Calculate Topology & Colors
    // Apply the same explicit MLAG peer override used in getDeviceConfig() so that
    // MLAG cell borders in the sheet reflect declared pairs, not just the PO heuristic.
    const fullData = sheet.getDataRange().getValues();
    const topo = calculateGlobalTopology(fullData, headers);
    const explicitMlagPeers = getDeviceMlagPeers();
    if (Object.keys(explicitMlagPeers).length > 0) {
      topo.mlagPeerMap = explicitMlagPeers;
      topo.peerLinkPorts = new Set();
      const processedPairs = new Set();
      Object.entries(explicitMlagPeers).forEach(([devA, devB]) => {
        const pairKey = [devA, devB].sort().join('|');
        if (processedPairs.has(pairKey)) return;
        processedPairs.add(pairKey);
        topo.globalLinkMap.forEach((val, key) => {
          if (key.startsWith(devA + ':') && val.dev === devB) topo.peerLinkPorts.add(key);
          if (key.startsWith(devB + ':') && val.dev === devA) topo.peerLinkPorts.add(key);
        });
      });
      topo.mlagConfigPorts = new Set();
      Object.entries(explicitMlagPeers).forEach(([devA, devB]) => {
        if (!topo.poMap) return;
        Object.entries(topo.poMap).forEach(([poName, devConnections]) => {
          if (devConnections[devA] && devConnections[devB]) {
            topo.mlagConfigPorts.add(devA + ':' + poName);
            topo.mlagConfigPorts.add(devB + ':' + poName);
          }
        });
      });
    }
    const result = calculateConnectionBackgrounds(data, headers, lastCol, topo);

    // 1. Apply Background Colors
    dataRange.setBackgrounds(result.matrix);

    // 2. Clear Previous Borders (Reset)
    dataRange.setBorder(null, null, null, null, null, null);

    // 3. Apply Black Borders to MLAG Cells
    if (result.mlagRanges.length > 0) {
      const mlagList = sheet.getRangeList(result.mlagRanges);
      if (mlagList) {
        // top, left, bottom, right, vertical, horizontal, color, style
        mlagList.setBorder(true, true, true, true, null, null, "black", SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
      }
    }

    // 4. Apply Conditional Rules (Text Colors/Dimming)
    const rules = buildConditionalRules(sheet, headers, lastRow);
    sheet.setConditionalFormatRules(rules);

    // 5. Standard Fonts
    dataRange.setFontFamily("Consolas").setFontSize(10).setVerticalAlignment("middle").setHorizontalAlignment("center");

  } catch (e) {
    console.error("Error in applyVisualFormatting:", e);
  }
}

// ------------------------------------------------------------------------
// 🧠 LOGIC ENGINE
// ------------------------------------------------------------------------

function calculateConnectionBackgrounds(data, headers, totalCols, topo) {
  const deviceMap = {};

  // Helper to convert (row, col) to A1 Notation for Borders
  const getA1 = (r, c) => {
    const letter = columnToLetter(c);
    return `${letter}${r}`;
  };

  const mlagRanges = []; // Store cells that need borders

  headers.forEach((h, i) => {
    if (h.startsWith("int_")) {
      const dev = h.substring(4);
      if (!deviceMap[dev]) deviceMap[dev] = {};
      deviceMap[dev].intIdx = i;
    } else if (h.startsWith("po_")) {
      const dev = h.substring(3);
      if (!deviceMap[dev]) deviceMap[dev] = {};
      deviceMap[dev].poIdx = i;
    }
  });

  const matrix = data.map(() => new Array(totalCols).fill("#ffffff"));

  for (let r = 0; r < data.length; r++) {
    const row = data[r];
    const absRow = r + 3; // Data starts at Row 3 in Sheet
    const deviceColorKeys = {};

    Object.keys(deviceMap).forEach(dev => {
      const idxs = deviceMap[dev];
      const intVal = idxs.intIdx !== undefined ? String(row[idxs.intIdx] || "").trim() : "";
      const poVal = idxs.poIdx !== undefined ? String(row[idxs.poIdx] || "").trim() : "";
      const cleanPo = poVal.replace(/^port-?channel\s*/i, "Po").replace(/^Po\s*/i, "Po");

      if (cleanPo && cleanPo.toLowerCase() !== "po") deviceColorKeys[dev] = `${dev}:${cleanPo}`;
      else if (intVal) deviceColorKeys[dev] = `${dev}:${intVal}`;
    });

    const colorPairs = (colType) => {
      const activeItems = [];
      const sortedDevs = Object.keys(deviceMap).sort((a, b) => deviceMap[a][colType] - deviceMap[b][colType]);

      sortedDevs.forEach(dev => {
        const colIdx = deviceMap[dev][colType];
        if (colIdx !== undefined && String(row[colIdx] || "").trim()) {
          activeItems.push({ colIdx: colIdx, colorKey: deviceColorKeys[dev] || `${dev}:unknown` });
        }
      });

      for (let i = 0; i < activeItems.length - 1; i += 2) {
        const item1 = activeItems[i];
        const item2 = activeItems[i + 1];
        const id1 = item1.colorKey.split(':')[1] || "";
        const id2 = item2.colorKey.split(':')[1] || "";

        let key = "", type = 'physical';

        // Check if both sides are Port-Channels
        if (id1.toLowerCase().startsWith("po") && id2.toLowerCase().startsWith("po")) {
          const num1 = parseInt(id1.replace(/\D/g, ''), 10) || 0;
          const num2 = parseInt(id2.replace(/\D/g, ''), 10) || 0;
          key = `Global:po${Math.min(num1, num2)}`;

          const k1 = item1.colorKey.toLowerCase();
          const k2 = item2.colorKey.toLowerCase();

          // --- ALIGNED MLAG LOGIC ---
          // 1. Peer Link (Highest Priority)
          const isPL = topo && (hasKey(topo.peerLinkPorts, k1) || hasKey(topo.peerLinkPorts, k2));

          // 2. MLAG Check
          // We strictly trust the Topology Engine.
          // If 'mlagConfigPorts' contains this port, it effectively means:
          // a) Count >= 4 (Strict Check enforced in calculateGlobalTopology)
          // b) It spans across two distinct devices (MLAG Pair Logic)
          const isMlag = topo && (hasKey(topo.mlagConfigPorts, k1) || hasKey(topo.mlagConfigPorts, k2));

          if (isPL) type = 'peer_link';
          else if (isMlag) {
            type = 'mlag_po';
            // Store coordinates for Black Border
            mlagRanges.push(getA1(absRow, item1.colIdx + 1));
            mlagRanges.push(getA1(absRow, item2.colIdx + 1));
          }
          else if (id1.toLowerCase().startsWith("po")) type = 'regular_po';

        } else {
          const rawKey = (item1.colorKey < item2.colorKey) ? `${item1.colorKey}<=>${item2.colorKey}` : `${item2.colorKey}<=>${item1.colorKey}`;
          key = `Phys:${rawKey}`;
          type = 'physical';
        }

        const color = generateLightPastelColor(key, type);
        matrix[r][item1.colIdx] = color;
        matrix[r][item2.colIdx] = color;
      }

      // Handle Orphans
      if (activeItems.length % 2 !== 0) {
        matrix[r][activeItems[activeItems.length - 1].colIdx] = FORMAT_CONFIG.colors.orphan;
      }
    };

    colorPairs('intIdx');
    colorPairs('poIdx');
  }

  return { matrix: matrix, mlagRanges: mlagRanges };
}

function buildConditionalRules(sheet, headers, lastRow) {
  const rules = [];
  const getColIdx = (name) => headers.indexOf(name) + 1;
  const getColLet = (idx) => columnToLetter(idx);

  // Shared schema keys — used for safe device-column detection in N1
  const SCHEMA_KEYS = ['int','po','sp_mode','vlan','svi_vlan','ip_type','vrf',
                       'et_speed','xcvr_speed','encoding','xcvr_type','snake_int',
                       'desc','sd','dp-pp-mp'];

  // Rule priority (high → low within Section A):
  //   1. AUDIT RED   — value present in a field that is N/A for current mode (conflict)
  //   2. MISSING AMBER — sp_mode_ empty when int_ is filled (required field absent)
  //   3. INACTIVE GRAY  — int_ empty → whole device row not yet active
  //   4. N/A GRAY    — field not applicable for current mode (cell is empty)
  //   5. QUALITY WARNINGS — xcvr speed mismatch / breakout hint
  //   6. MEMBER PORT — text dim + italic

  const deviceNames = new Set(headers.filter(h => h.startsWith('int_')).map(h => h.substring(4)));

  deviceNames.forEach(dev => {
    const intIdx       = getColIdx('int_'       + dev);
    const poIdx        = getColIdx('po_'        + dev);
    const modeIdx      = getColIdx('sp_mode_'   + dev);
    const sviIdx       = getColIdx('svi_vlan_'  + dev);
    const vlanIdx      = getColIdx('vlan_'      + dev);
    const ipIdx        = getColIdx('ip_type_'   + dev);
    const vrfIdx       = getColIdx('vrf_'       + dev);
    const etSpeedIdx   = getColIdx('et_speed_'  + dev);
    const xcvrSpeedIdx = getColIdx('xcvr_speed_'+ dev);
    const xcvrTypeIdx  = getColIdx('xcvr_type_' + dev);
    const encodingIdx  = getColIdx('encoding_'  + dev);

    if (intIdx <= 0 || modeIdx <= 0) return;

    const iC  = getColLet(intIdx);
    const mC  = getColLet(modeIdx);

    // ── 1. AUDIT RED: value in a field that is N/A for current mode ──────────
    // All formulas also guard on int_<>""  so inactive rows stay gray (rule 3).

    // A1 — po_ filled but mode is ET (Po not used for ET modes)
    if (poIdx > 0) {
      rules.push(SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied(`=AND($${iC}3<>"",$${getColLet(poIdx)}3<>""` +
          `,REGEXMATCH($${mC}3,"^l[23]-et"))`)
        .setBackground("#fca5a5").setFontColor("#991b1b")
        .setRanges([sheet.getRange(3, poIdx, lastRow - 2, 1)]).build());
    }

    // A2 — svi_vlan_ filled but mode is l3 (SVI only valid for L2)
    if (sviIdx > 0) {
      rules.push(SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied(`=AND($${iC}3<>"",$${getColLet(sviIdx)}3<>""` +
          `,REGEXMATCH($${mC}3,"^l3"))`)
        .setBackground("#fca5a5").setFontColor("#991b1b")
        .setRanges([sheet.getRange(3, sviIdx, lastRow - 2, 1)]).build());
    }

    // A3 — ip_type_ filled but mode is L2 without SVI
    if (ipIdx > 0 && sviIdx > 0) {
      rules.push(SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied(`=AND($${iC}3<>"",$${getColLet(ipIdx)}3<>""` +
          `,REGEXMATCH($${mC}3,"^l2"),$${getColLet(sviIdx)}3="")`)
        .setBackground("#fca5a5").setFontColor("#991b1b")
        .setRanges([sheet.getRange(3, ipIdx, lastRow - 2, 1)]).build());
    }

    // A4 — vlan_ has 2+ VLANs (range or comma-list) but mode is pure L3 non-sub-int
    //      Single VLAN is allowed on l3-et/l3-po (e.g. for sub-int reference); only flag multi-VLAN.
    if (vlanIdx > 0) {
      rules.push(SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied(`=AND($${iC}3<>"",$${getColLet(vlanIdx)}3<>""` +
          `,REGEXMATCH($${getColLet(vlanIdx)}3,"[,\\-]")` +
          `,REGEXMATCH($${mC}3,"^l3"),NOT(REGEXMATCH($${mC}3,"sub-int")))`)
        .setBackground("#fca5a5").setFontColor("#991b1b")
        .setRanges([sheet.getRange(3, vlanIdx, lastRow - 2, 1)]).build());
    }

    // A5 — vrf_ filled but mode is L2 without SVI
    if (vrfIdx > 0 && sviIdx > 0) {
      rules.push(SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied(`=AND($${iC}3<>"",$${getColLet(vrfIdx)}3<>""` +
          `,REGEXMATCH($${mC}3,"^l2"),$${getColLet(sviIdx)}3="")`)
        .setBackground("#fca5a5").setFontColor("#991b1b")
        .setRanges([sheet.getRange(3, vrfIdx, lastRow - 2, 1)]).build());
    }

    // A6 — xcvr_speed_ filled but xcvr_type_ missing (incomplete transceiver spec)
    if (xcvrSpeedIdx > 0 && xcvrTypeIdx > 0) {
      rules.push(SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied(`=AND($${iC}3<>"",$${getColLet(xcvrSpeedIdx)}3<>""` +
          `,$${getColLet(xcvrTypeIdx)}3="")`)
        .setBackground("#fca5a5").setFontColor("#991b1b")
        .setRanges([sheet.getRange(3, xcvrSpeedIdx, lastRow - 2, 1)]).build());
    }

    // ── 2. MISSING AMBER: required field empty when int_ is filled ────────────

    // A7 — sp_mode_ empty but int_ is filled (mode is required)
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(`=AND($${iC}3<>"",$${mC}3="")`)
      .setBackground("#fef3c7").setFontColor("#92400e")
      .setRanges([sheet.getRange(3, modeIdx, lastRow - 2, 1)]).build());

    // A8 — vlan_ empty but mode is l3-et or l3-po (vlan_ required for IP derivation)
    if (vlanIdx > 0) {
      rules.push(SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied(`=AND($${iC}3<>"",$${getColLet(vlanIdx)}3=""` +
          `,REGEXMATCH($${mC}3,"^l3-(et|po)"))`)
        .setBackground("#fef3c7").setFontColor("#92400e")
        .setRanges([sheet.getRange(3, vlanIdx, lastRow - 2, 1)]).build());
    }

    // ── 3. INACTIVE GRAY: int_ empty → whole device row not yet active ────────
    // Applied to ALL columns belonging to this device as a single multi-range rule.
    const suffix = '_' + dev;
    const allDevRanges = headers.reduce((acc, h, i) => {
      if (h.endsWith(suffix) && SCHEMA_KEYS.includes(h.slice(0, -(suffix.length)))) {
        acc.push(sheet.getRange(3, i + 1, lastRow - 2, 1));
      }
      return acc;
    }, []);
    if (allDevRanges.length > 0) {
      rules.push(SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied(`=$${iC}3=""`)
        .setBackground("#f1f5f9").setFontColor("#cbd5e1")
        .setRanges(allDevRanges).build());
    }

    // ── 4. N/A GRAY: field not applicable for current mode (cell may be empty) ─

    // N/A-1 — svi_vlan_ gray for L3 (SVI only valid for L2)
    if (sviIdx > 0) {
      rules.push(SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied(`=REGEXMATCH($${mC}3,"^l3")`)
        .setBackground("#e2e8f0").setFontColor("#cbd5e1")
        .setRanges([sheet.getRange(3, sviIdx, lastRow - 2, 1)]).build());
    }

    // N/A-2 — po_ gray for ET modes
    if (poIdx > 0) {
      rules.push(SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied(`=REGEXMATCH($${mC}3,"^l2-et|^l3-et")`)
        .setBackground("#e2e8f0").setFontColor("#cbd5e1")
        .setRanges([sheet.getRange(3, poIdx, lastRow - 2, 1)]).build());
    }

    // N/A-3 — ip_type_ gray for L2 without SVI
    if (ipIdx > 0 && sviIdx > 0) {
      rules.push(SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied(`=AND(REGEXMATCH($${mC}3,"^l2"),$${getColLet(sviIdx)}3="")`)
        .setBackground("#e2e8f0").setFontColor("#cbd5e1")
        .setRanges([sheet.getRange(3, ipIdx, lastRow - 2, 1)]).build());
    }

    // N/A-4 — REMOVED: vlan_ is needed for all l3 modes (IP derivation on l3-et/l3-po,
    //         dot1q tag on sub-int). A4 (RED) still catches 2+ VLANs on pure l3.

    // N/A-5 — transceiver columns gray for Po modes (no physical transceiver on Po)
    const xcvrNaFormula = `=REGEXMATCH($${mC}3,"^l[23]-po")`;
    [[etSpeedIdx],[xcvrSpeedIdx],[xcvrTypeIdx],[encodingIdx]]
      .forEach(([idx]) => {
        if (idx > 0) {
          rules.push(SpreadsheetApp.newConditionalFormatRule()
            .whenFormulaSatisfied(xcvrNaFormula)
            .setBackground("#e2e8f0").setFontColor("#cbd5e1")
            .setRanges([sheet.getRange(3, idx, lastRow - 2, 1)]).build());
        }
      });

    // N/A-6 — vrf_ gray for L2 without SVI
    if (vrfIdx > 0 && sviIdx > 0) {
      rules.push(SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied(`=AND(REGEXMATCH($${mC}3,"^l2"),$${getColLet(sviIdx)}3="")`)
        .setBackground("#e2e8f0").setFontColor("#cbd5e1")
        .setRanges([sheet.getRange(3, vrfIdx, lastRow - 2, 1)]).build());
    }

    // ── 5. QUALITY WARNINGS ───────────────────────────────────────────────────

    // W1 — xcvr_speed_ amber when et_speed == xcvr_speed (both filled — possible breakout mismatch)
    if (etSpeedIdx > 0 && xcvrSpeedIdx > 0) {
      const etC = getColLet(etSpeedIdx);
      const xsC = getColLet(xcvrSpeedIdx);
      rules.push(SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied(`=AND($${etC}3<>"",$${xsC}3<>"",$${etC}3=$${xsC}3)`)
        .setBackground("#fef08a")
        .setRanges([sheet.getRange(3, xcvrSpeedIdx, lastRow - 2, 1)]).build());
    }

    // W2 — xcvr_speed_ pale-orange when empty + xcvr_type implies different speed (fill for breakout)
    if (etSpeedIdx > 0 && xcvrSpeedIdx > 0 && xcvrTypeIdx > 0) {
      const etC = getColLet(etSpeedIdx);
      const xsC = getColLet(xcvrSpeedIdx);
      const xtC = getColLet(xcvrTypeIdx);
      const formula = [
        `=AND($${xsC}3="",$${xtC}3<>"",$${etC}3<>"",`,
        `OR(`,
        `AND(REGEXMATCH($${xtC}3,"QSFP28|QSFP100|DSFP"),NOT(REGEXMATCH($${etC}3,"^100g"))),`,
        `AND(REGEXMATCH($${xtC}3,"QSFP56"),NOT(REGEXMATCH($${etC}3,"^200g"))),`,
        `AND(REGEXMATCH($${xtC}3,"QSFP-DD"),NOT(REGEXMATCH($${etC}3,"^400g|^800g"))),`,
        `AND(REGEXMATCH($${xtC}3,"OSFP"),NOT(REGEXMATCH($${etC}3,"^400g|^800g"))),`,
        `AND(REGEXMATCH($${xtC}3,"QSFP\\+"),NOT(REGEXMATCH($${etC}3,"^40g"))),`,
        `AND(REGEXMATCH($${xtC}3,"SFP28|SFP25"),NOT(REGEXMATCH($${etC}3,"^25g"))),`,
        `AND(REGEXMATCH($${xtC}3,"SFP\\+"),NOT(REGEXMATCH($${etC}3,"^10g|^1g")))`,
        `))`
      ].join('');
      rules.push(SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied(formula)
        .setBackground("#fed7aa")
        .setRanges([sheet.getRange(3, xcvrSpeedIdx, lastRow - 2, 1)]).build());
    }

    // ── 6. MEMBER PORT: text dim + italic (Et in int_ AND Po is set) ─────────
    if (poIdx > 0) {
      rules.push(SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied(
          `=AND(REGEXMATCH($${iC}3,"^Et"),$${getColLet(poIdx)}3<>"")`
        )
        .setFontColor(FORMAT_CONFIG.colors.textMuted).setItalic(true)
        .setRanges([sheet.getRange(3, intIdx, lastRow - 2, 1)]).build());
    }

  });

  // B. STANDARD ATTRIBUTE COLORS (lowest priority — speed tiers, xcvr types, mode, ip_type)
  headers.forEach((h, i) => {
    const colIdx = i + 1;
    const range = sheet.getRange(3, colIdx, lastRow - 2, 1);
    const configKey = Object.keys(FORMAT_CONFIG.rules).find(k => h.startsWith(k + "_"));

    if (configKey) {
      FORMAT_CONFIG.rules[configKey].forEach(rule => {
        let builder = SpreadsheetApp.newConditionalFormatRule().setRanges([range]);
        if (rule.type === 'exact') builder.whenTextEqualTo(rule.text);
        else builder.whenTextContains(rule.text);
        if (rule.bg) builder.setBackground(rule.bg);
        if (rule.color) builder.setFontColor(rule.color);
        rules.push(builder.build());
      });
    }
  });

  return rules;
}

// ------------------------------------------------------------------------
// 🔧 UTILITIES
// ------------------------------------------------------------------------

/* 2. COLOR GENERATOR (With distinct Visual Styles) */
function generateLightPastelColor(str, type) {
  let h;
  let num = 0;

  // HUE CALCULATION (Identity)
  if (type !== 'physical') {
    // Port-Channels: Use Golden Angle on the Number (Po10 -> 10)
    const match = str.match(/\d+/);
    num = match ? parseInt(match[0], 10) : 0;
    h = Math.floor((num * 137.508) % 360);

    // Shift Regular PO hue to distinguish it from MLAG PO of the same number
    if (type === 'regular_po') {
      h = (h + 180) % 360;
    }

  } else {
    // Physical Links: Jenkins Hash
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash += str.charCodeAt(i); hash += (hash << 10); hash ^= (hash >> 6);
    }
    hash += (hash << 3); hash ^= (hash >> 11); hash += (hash << 15);
    h = Math.abs(hash % 360);
  }

  // STYLE PARAMETERS (S=Saturation, L=Lightness)
  let s, l;
  switch (type) {
    case 'peer_link':
      // Dark Slate Gray (Infrastructure)
      s = 10; l = 60;
      break;

    case 'mlag_po':
      // Vibrant (To stand out inside the Black Border)
      s = 90; l = 80;
      break;

    case 'regular_po':
    case 'physical':
    default:
      // Unified Intensity (Clean Pastel)
      // Matches intensity for both Physical and Regular POs
      s = 70; l = 85;
      break;
  }
  return hslToHex(h, s, l);
}

function hslToHex(h, s, l) {
  l /= 100;
  const a = s * Math.min(l, 1 - l) / 100;
  const f = n => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function columnToLetter(column) {
  let temp, letter = '';
  while (column > 0) {
    temp = (column - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    column = (column - temp - 1) / 26;
  }
  return letter;
}

function hasKey(setObj, lowerKey) {
  if (!setObj) return false;
  // 1. Try Direct Match
  if (setObj.has(lowerKey)) return true;
  // 2. Try Case-Insensitive Match
  for (let k of setObj) {
    if (String(k).toLowerCase() === String(lowerKey).toLowerCase()) return true;
  }
  return false;
}

/**
* -------------------
* CUSTOM VIEW HELPERS (Saved Preferences Model)
* -------------------
*/


function getViewPreferences() {
  // Key migrations: old key → new key (add an entry whenever a schema key is renamed)
  const KEY_MIGRATIONS = { 'svi': 'svi_vlan' };

  try {
    const prop = PropertiesService.getUserProperties().getProperty('CUSTOM_VIEW_PREFS');
    if (prop) {
      const prefs = JSON.parse(prop);
      const migrated = prefs.map(function(k) { return KEY_MIGRATIONS[k] || k; });
      // Persist if anything changed so future calls are already clean
      const changed = migrated.some(function(k, i) { return k !== prefs[i]; });
      if (changed) PropertiesService.getUserProperties().setProperty('CUSTOM_VIEW_PREFS', JSON.stringify(migrated));
      return migrated;
    }
  } catch (e) { /* malformed JSON — fall through to default */ }

  // Fallback: If first time (no prefs), return ALL keys so checkboxes default to checked
  const schema = getSchemaConfig();
  return schema.map(s => s.key);
}

// 2. Apply & Save Preferences
function applyCustomView(selectedKeys) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_DATA);
  if (!sheet) return;

  const lastCol = sheet.getLastColumn();
  if (lastCol < 2) return;

  // A. Save the preference for next time
  PropertiesService.getUserProperties().setProperty('CUSTOM_VIEW_PREFS', JSON.stringify(selectedKeys));

  // B. Compute target visibility for every column (type filter + device filter combined)
  const prefixes = selectedKeys.map(k => k + '_');
  const headers = sheet.getRange(2, 1, 1, lastCol).getValues()[0];
  if (!headers || headers.length === 0) return;

  const hiddenDevs = getSheetViewHidden();
  const target = headers.map(function(h, i) {
    if (i === 0) return true;                                                          // col A (_sys_) always visible
    const hdr = String(h);
    if (!prefixes.some(function(p) { return hdr.startsWith(p); })) return false;      // wrong column type
    if (hiddenDevs.some(function(d) { return hdr.endsWith('_' + d); })) return false; // device is hidden
    return true;
  });

  // C. Apply in batched consecutive runs — no blanket showColumns reset avoids the flash
  let runStart = -1, runVisible = null, runLen = 0;
  function flushRun() {
    if (runStart < 0 || runLen === 0) return;
    if (runVisible) sheet.showColumns(runStart, runLen);
    else            sheet.hideColumns(runStart, runLen);
    runStart = -1; runLen = 0;
  }
  for (let i = 0; i < target.length; i++) {
    const v = target[i];
    if (runLen > 0 && v === runVisible) {
      runLen++;
    } else {
      flushRun();
      runStart = i + 1;
      runVisible = v;
      runLen = 1;
    }
  }
  flushRun();
}

/**
* Lightweight Update: Updates only the Data Validation (Dropdowns)
* without clearing or rewriting the sheet.
*/
function updateSheetDropdownsOnly() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_DATA);
  if (!sheet) return;

  const schemaObj = getAttributeSchema();
  const headers = sheet.getRange(2, 1, 1, sheet.getLastColumn()).getValues()[0];
  const lastRow = Math.max(sheet.getLastRow(), 100);
  const rowSpan = lastRow - 2;

  ss.toast("Updating dropdown rules...", "Quick Sync", 2);

  headers.forEach((header, index) => {
    // Find the attribute key (e.g. 'sp_mode_' from 'sp_mode_Leaf1')
    // We look for any key in our schema that matches the start of the header
    for (let key in schemaObj.rules) {
      if (header.startsWith(key)) {
        const col = index + 1;
        try {
          // Apply the new validation rule to the existing column
          sheet.getRange(3, col, rowSpan, 1).setDataValidation(schemaObj.rules[key]);
        } catch (e) {
          console.warn(`Could not update validation for col ${col}`);
        }
        break;
      }
    }
  });

  ss.toast("Dropdowns Updated", "Success", 2);
}

/**
 * Returns unique attribute keys for columns in the sheet that are NOT
 * accounted for by the schema × devices layout.
 *
 * Uses header-based detection: computes the full set of expected row-2
 * headers (schema key + device name for every combination), then flags
 * every actual column whose header is outside that set.
 *
 * For each orphan header the device-name suffix is stripped (longest
 * match wins) to recover the attribute key, so callers can add it back
 * to targetKeys to preserve the column during a rebuild.
 *
 * @param {Sheet}          mappingSheet  The PortMapping sheet object.
 * @param {Array<string>}  targetKeys    Schema keys with trailing _, e.g. ["hostname_","type_"].
 * @param {Array<string>}  deviceNames   Device names as plain strings, e.g. ["leaf1","spine1"].
 * @returns {Array<string>} Unique orphan attribute keys.
 */
function _getOrphanAttrKeys(mappingSheet, targetKeys, deviceNames) {
  const lastCol = mappingSheet.getLastColumn();
  if (lastCol < 1) return [];

  // Build the exact set of expected row-2 headers
  const expectedHeaders = new Set([DUMMY_VIS_HEADER]);
  deviceNames.forEach(function(d) {
    targetKeys.forEach(function(k) { expectedHeaders.add(k + d); });
  });

  const row2 = mappingSheet.getRange(2, 1, 1, lastCol).getValues()[0];
  const orphanKeys = new Set();

  for (let c = 0; c < lastCol; c++) {
    const header = String(row2[c]).trim();
    if (!header || expectedHeaders.has(header)) continue;

    // Strip device-name suffix (longest match wins) to recover the attr key.
    // If no current device name matches, the column belongs to a removed device —
    // skip it here (rebuildSheet can't preserve per-device data for missing devices).
    let key = null;
    let matchLen = 0;
    for (let di = 0; di < deviceNames.length; di++) {
      const d = deviceNames[di];
      if (d.length > matchLen && header.endsWith(d)) {
        key = header.slice(0, header.length - d.length);
        matchLen = d.length;
      }
    }
    if (key) orphanKeys.add(key);
  }

  return Array.from(orphanKeys);
}

/** @deprecated Use _getOrphanAttrKeys() instead. Left for reference only. */
function getExistingAttributes(sheet) {
  const lastCol = sheet.getLastColumn();
  if (lastCol < 1) return [];

  const row1 = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const row2 = sheet.getRange(2, 1, 1, lastCol).getValues()[0];
  let attributesFound = new Set();
  let currentDev = null;

  for (let c = 0; c < lastCol; c++) {
    if (row1[c]) currentDev = String(row1[c]).trim();
    let header = String(row2[c]).trim();
    if (currentDev && header.endsWith(currentDev)) {
      let attr = header.substring(0, header.length - currentDev.length);
      if (attr) attributesFound.add(attr);
    }
  }
  return Array.from(attributesFound);
}

/**
* Handles Device Manager Save (Rename + Reorder)
*/
function processDeviceBatch(renames, finalOrderList, hostnamesMap) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_DATA);
  if (!sheet) return { error: "Sheet not found" };

  // 1. EXECUTE RENAMES FIRST (Modify headers in place)
  if (renames && renames.length > 0) {
    const lastCol = sheet.getLastColumn();
    const range = sheet.getRange(1, 1, 2, lastCol);
    const values = range.getValues();
    let row1 = values[0];
    let row2 = values[1];
    let changed = false;

    const renameMap = {};
    renames.forEach(r => renameMap[r.old] = r.new);

    // Update Row 1 (Device Names)
    row1.forEach((val, i) => {
      if (renameMap[val]) {
        row1[i] = renameMap[val];
        changed = true;
      }
    });

    // Update Row 2 (Headers)
    row2.forEach((h, i) => {
      let str = String(h);
      renames.forEach(r => {
        if (str.endsWith("_" + r.old)) {
          let prefix = str.substring(0, str.length - r.old.length);
          row2[i] = prefix + r.new;
          changed = true;
        }
      });
    });

    if (changed) {
      range.setValues([row1, row2]);
      SpreadsheetApp.flush(); // Commit changes before reordering
    }
  }

  // 2. EXECUTE REORDER
  // Pass the full list to rebuildSheet to physically move columns
  if (finalOrderList && finalOrderList.length > 0) {
    rebuildSheet(finalOrderList, null);
  }

  // Save hostnames BEFORE bumping DATA_VERSION so any poller-triggered getTopologyData
  // that fires immediately after the version bump sees the correct hostname values.
  if (hostnamesMap && typeof hostnamesMap === 'object') {
    PropertiesService.getDocumentProperties().setProperty('DEVICE_HOSTNAMES', JSON.stringify(hostnamesMap));
  }

  PropertiesService.getScriptProperties().setProperty('DATA_VERSION', new Date().getTime().toString());

  return { success: true };
}

/**
* -------------------
* CONFIGURATION GENERATOR (TOPOLOGY-BASED MLAG & PRIORITY PEER-LINK)
* -------------------
*/

function normalizePo(val) {
  if (!val) return null;
  let s = String(val).trim();

  // Extract digits (ignores spaces, case, and hyphens)
  const numMatch = s.match(/\d+/);

  if (numMatch) {
    // Strictly return "Po" + Number
    return "Po" + numMatch[0];
  }

  return null;
}

/** Wraps CacheService.put() — logs a warning if the cache is full rather than crashing. */
function safeCachePut(cache, key, value, ttl) {
  try { cache.put(key, value, ttl); } catch (e) { console.warn('[Cache] put failed for key "' + key + '":', e.message); }
}

/**
 * Builds global topology maps (MLAG, peer-links, connections) from sheet data.
 * @param {Array<Array>} data - Full sheet values (row 0 = row1 header, row 1 = row2 header, row 2+ = data)
 * @param {Array<string>} headers - Flattened row-2 header strings
 * @returns {{mlagConfigPorts: Object, peerLinkPorts: Object, debugLogs: Array, mlagPeerMap: Object, globalLinkMap: Object, poMap: Object}}
 */
/* REPLACE IN Code.gs */
function calculateGlobalTopology(data, headers) {
  const debugLogs = [];
  const log = (msg) => { console.log(msg); debugLogs.push(msg); };

  // --- 1. MAPPING HEADERS ---
  const allIntCols = {};
  const allPoCols = {};
  const allSnakeIntCols = {};

  headers.forEach((h, i) => {
    // Preserve case for Device Names from headers
    if (h.startsWith("int_")) allIntCols[h.substring(4)] = i;
    if (h.startsWith("po_")) allPoCols[h.substring(3)] = i;
    if (h.startsWith("snake_int_")) allSnakeIntCols[h.substring(10)] = i;
  });

  const poMap = {};
  const globalLinkMap = new Map();

  // --- 2. SCAN DATA (OPTIMIZED) ---
  // Pre-calculate valid ports per row to avoid O(N^2) cleaning overhead
  for (let r = 2; r < data.length; r++) {
    const row = data[r];
    const rowNodes = [];

    // Step A: Extract and Clean all valid ports on this row (Linear Scan)
    for (const [devName, colIdx] of Object.entries(allIntCols)) {
      const rawPort = row[colIdx];
      if (!isValidPort(rawPort)) continue;

      const cleanPort = canonicalizeInterface(rawPort); // Run logic ONCE per cell

      // Get Port-Channel if present
      const poIdx = allPoCols[devName];
      const poVal = (poIdx !== undefined) ? normalizePo(String(row[poIdx]).trim()) : null;

      rowNodes.push({
        dev: devName,
        port: cleanPort,
        po: poVal
      });
    }
    // Also collect snake_int_ ports (same-device self-loop pairs)
    for (const [devName, snakeColIdx] of Object.entries(allSnakeIntCols)) {
      const snakeRaw = row[snakeColIdx];
      if (!isValidPort(snakeRaw)) continue;
      const intColIdx = allIntCols[devName];
      if (intColIdx === undefined) continue;
      if (!isValidPort(row[intColIdx])) continue; // primary must also be present
      rowNodes.push({ dev: devName, port: canonicalizeInterface(snakeRaw), po: null, isSnakeSecondary: true });
    }

    // Step B: Connect the gathered nodes (Strict Pairs)
    // We iterate by 2 to enforce physical cabling logic: A<->B, C<->D
    for (let i = 0; i < rowNodes.length - 1; i += 2) {
      const nodeA = rowNodes[i];
      const nodeB = rowNodes[i + 1];

      if (nodeA.dev === nodeB.dev) {
        // Self-loop (snake test): guard — skip if either port is already a regular peer link
        const existingA = globalLinkMap.get(nodeA.dev + ":" + nodeA.port);
        const existingB = globalLinkMap.get(nodeB.dev + ":" + nodeB.port);
        if (existingA && !existingA.isSelfLoop) continue;
        if (existingB && !existingB.isSelfLoop) continue;
        globalLinkMap.set(nodeA.dev + ":" + nodeA.port, { dev: nodeB.dev, port: nodeB.port, isSelfLoop: true });
        globalLinkMap.set(nodeB.dev + ":" + nodeB.port, { dev: nodeA.dev, port: nodeA.port, isSelfLoop: true });
      } else {
        // Register global link lookups (used for config descriptions & BGP neighbor discovery)
        globalLinkMap.set(nodeA.dev + ":" + nodeA.port, { dev: nodeB.dev, port: nodeB.port });
        globalLinkMap.set(nodeB.dev + ":" + nodeB.port, { dev: nodeA.dev, port: nodeA.port });
      }
    }

    // Step C: PO Grouping for MLAG (Must scan all nodes to find splitters)
    // We do this separately because MLAG logically groups multiple physical pairs
    for (let i = 0; i < rowNodes.length; i++) {
      const src = rowNodes[i];
      if (src.po) {
        if (!poMap[src.po]) poMap[src.po] = {};
        if (!poMap[src.po][src.dev]) poMap[src.po][src.dev] = new Set();

        // Add all others on this row as logical neighbors for MLAG calculation
        for (let k = 0; k < rowNodes.length; k++) {
          if (i === k) continue;
          poMap[src.po][src.dev].add(rowNodes[k].dev);
        }
      }
    }
  }

  // MLAG pair/port detection has been removed from this function.
  // All MLAG is determined exclusively by explicit DEVICE_MLAG_PEERS declarations.
  // The caller (getDeviceConfig / applyVisualFormatting) applies the override after
  // calling this function. poMap is kept — the override uses it to identify shared
  // PO bundles between declared peer devices.
  return { mlagConfigPorts: new Set(), peerLinkPorts: new Set(), debugLogs, mlagPeerMap: {}, globalLinkMap, poMap };
}

/**
 * Main server entry point for topology fetch. Reads sheet, runs cleanup, builds topology, generates configs.
 * @param {boolean} forceSync - Skip cache and rebuild from scratch
 * @param {boolean} isColorEnabled - Whether to apply conditional color formatting
 * @returns {Object} Topology payload or {error: string}
 */
function getTopologyData(forceSync, isColorEnabled) {
  const cache = CacheService.getUserCache();
  const scriptProps = PropertiesService.getScriptProperties();

  // PHASE 1: SANITIZE
  safeCachePut(cache, 'TOPOLOGY_STATUS', '🔹 Phase 1/6: Sanitizing data...', 200);

  try {
    const targetSheetName = SHEET_DATA;

    // TOPOLOGY CACHE CHECK
    // Skip on forceSync (schema sync / manual refresh). When DATA_VERSION is unchanged,
    // return the cached payload immediately — avoids 2 sheet reads and 2 topology
    // calculations (one in runFullSheetCleanup, one below) on every background fetch.
    if (!forceSync) {
      const currentVersion = scriptProps.getProperty('DATA_VERSION');
      if (currentVersion) {
        const cached = cache.get('TOPO_' + currentVersion);
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            parsed.fromCache = true;
            return parsed;
          } catch (e) {
            console.warn("Topology cache parse failed, recomputing.");
          }
        }
      }
    }

    // Auto-Cleanup — skipVersionBump=true so the poller doesn't see a version change
    // mid-computation and spawn a concurrent second execution. We bump the version
    // ourselves below, only after the topology cache is fully written.
    let cleanupMadeChanges = false;
    try { cleanupMadeChanges = runFullSheetCleanup(true); } catch (e) { console.warn("Auto-cleanup warning:", e); }
    safeCachePut(cache, 'TOPOLOGY_STATUS', cleanupMadeChanges ? '🔹 Phase 1/6: Data sanitized ✓' : '🔹 Phase 1/6: Data clean ✓', 200);

    // PHASE 2: VISUAL STYLES
    safeCachePut(cache, 'TOPOLOGY_STATUS', '🔹 Phase 2/6: Applying visual styles...', 200);
    if (isColorEnabled || forceSync) {
      try { applyGlobalFormatting(); } catch (e) { console.error("Auto-Coloring failed: " + e.message); }
    }

    // Read Data
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(targetSheetName);
    if (!sheet) return { error: "Sheet '" + targetSheetName + "' not found!" };

    const data = sheet.getDataRange().getValues();
    // Allow running with just headers (2 rows) to show an empty map instead of an error
    if (data.length < 2) return { error: "Sheet '" + targetSheetName + "' is empty." };

    const rowHeaders = data[1];
    const firstDataRow = data[2];

    // PHASE 3: TOPOLOGY CALCULATION
    safeCachePut(cache, 'TOPOLOGY_STATUS', '🔹 Phase 3/6: Calculating topology...', 200);

    const dropdowns = getDropdowns();
    const legends = getLegends();
    const allDevices = getExistingDevices();
    // Sheet column visibility does not affect topology — all devices always appear
    const rawDevices = allDevices;

    const globalIpPrefs = getIpPreferences();
    const globalNetSettings = getNetworkSettings();
    const topo = calculateGlobalTopology(data, rowHeaders);

    const devices = [];
    let aristaCounter = 0;
    rawDevices.forEach((d, i) => {
      const colIndex = rowHeaders.indexOf("int_" + d.name);
      if (colIndex !== -1) {
        let sheetIndex = "-";
        if (d.type === 'full') { aristaCounter++; sheetIndex = aristaCounter; }
        devices.push({
          name: d.name, type: d.type, sheetIndex: sheetIndex, visualIndex: i + 1,
          colIndex: colIndex, attrs: getColumnIndices(rowHeaders, d.name),
          labels: d.labels || [], hostname: d.hostname || "", role: d.role || "", mlagPeer: d.mlagPeer || ""
        });
      }
    });

    const devicePorts = {};
    devices.forEach(d => devicePorts[d.name] = {});
    const links = [];
    const portFrequency = {};
    const dataRows = data.slice(2);
    const totalLinks = dataRows.length;

    safeCachePut(cache, 'TOPOLOGY_STATUS', `🔹 Phase 3/6: Topology calculated — ${devices.length} devices, ${totalLinks} rows`, 200);

    // PHASE 4: DISCOVERY & LINKING
    // Global Aggregators
    const globalPoGroups = {};
    const registerPoMember = (devName, poName, peerName, remotePo) => {
      const key = devName + ":" + poName;
      if (!globalPoGroups[key]) {
        globalPoGroups[key] = { peerDevs: [], peerDev: peerName, peerPo: null, isPeerLink: false };
      }
      if (peerName && !globalPoGroups[key].peerDevs.includes(peerName)) {
        globalPoGroups[key].peerDevs.push(peerName);
      }
      if (remotePo) {
        globalPoGroups[key].peerPo = remotePo;
      }
    };

    const allCollectedNodes = [];
    const vtepVlansByDevice = {}; // deviceName → Set<VLAN int>, for DevView Vx1 summary row

    dataRows.forEach((row, rowIndex) => {
      // Update status periodically
      if (rowIndex % 50 === 0) {
        safeCachePut(cache, 'TOPOLOGY_STATUS', `🔹 Phase 4/6: Mapping ${rowIndex}/${totalLinks} connections...`, 200);
      }

      const nodesOnRow = [];

      devices.forEach(device => {
        if (device.colIndex < row.length) {
          const portName = row[device.colIndex];

          if (isValidPort(portName)) {
            const pName = canonicalizeInterface(portName);

            // Vx1 is a logical VTEP port — not a physical cable, never part of cabling topology.
            // Skipping here prevents it from entering processRowLinks, forming links, landing in
            // allNodesData, or triggering audit checks (IP type blank, missing SVI IP, etc.).
            if (pName === "Vx1") {
              // Collect AP VLANs from this row so DevView can show a Vx1 summary row.
              const _vx1Raw = extractDetails(row, device.attrs).vlan_ || "";
              const { vlans: _vx1Vlans } = parseVlanWithNative(_vx1Raw);
              if (_vx1Vlans) {
                if (!vtepVlansByDevice[device.name]) vtepVlansByDevice[device.name] = new Set();
                // expandVlanString handles ranges like "1-4000" → {1,2,...,4000}
                // parseInt alone would only capture the first number (parseInt("1-4000")=1)
                expandVlanString(_vx1Vlans).forEach(v => vtepVlansByDevice[device.name].add(v));
              }
              return; // forEach — return skips this device entry
            }

            const uniqueId = device.name + ":" + pName;
            portFrequency[uniqueId] = (portFrequency[uniqueId] || 0) + 1;

            const details = extractDetails(row, device.attrs);
            details.sheetIndex = device.sheetIndex;

            // 2. Category Logic
            details.category = determineCategory(details, legends);

            // 3. Snake primary flag — set if this port is the primary end of a self-loop
            const selfLoopEntry = topo.globalLinkMap ? topo.globalLinkMap.get(device.name + ":" + pName) : null;
            if (selfLoopEntry && selfLoopEntry.isSelfLoop) details.isSnakePrimary = true;

            // 3. MLAG / PeerLink Flags
            // We calculate these for topology accuracy, but we don't force-change the IP type
            const poVal = normalizePo(details.po_);
            if (poVal) {
              if (hasKey(topo.mlagConfigPorts, device.name + ":" + poVal)) details.isMlag = true;
              if (hasKey(topo.peerLinkPorts, device.name + ":" + poVal)) {
                details.isPeerLink = true;
                details.isMlag = false;
              }
            } else {
              if (hasKey(topo.peerLinkPorts, device.name + ":" + pName)) details.isPeerLink = true;
            }

            nodesOnRow.push({
              devObj: device, deviceName: device.name, pName: pName, port: pName,
              details: details, rowId: rowIndex
            });
          }
        }
      });

      // PEER LINKING (Visual Pairs)
      for (let i = 0; i < nodesOnRow.length - 1; i += 2) {
        let nodeA = nodesOnRow[i];
        let nodeB = nodesOnRow[i + 1];
        nodeA.details.peerDev = nodeB.devObj.name;
        nodeA.details.peerPort = nodeB.pName;
        nodeB.details.peerDev = nodeA.devObj.name;
        nodeB.details.peerPort = nodeA.pName;
      }

      // PO REGISTRATION (Updated Logic: Handles Orphans correctly)
      nodesOnRow.forEach((node, i) => {
        const poVal = normalizePo(node.details.po_);
        if (poVal) {
          const peerName = node.details.peerDev || null;
          let remotePo = null;
          // Peek sibling for Remote PO logic (Neighbors on same row)
          if (i % 2 === 0 && i + 1 < nodesOnRow.length) remotePo = normalizePo(nodesOnRow[i + 1].details.po_);
          else if (i % 2 !== 0) remotePo = normalizePo(nodesOnRow[i - 1].details.po_);

          registerPoMember(node.deviceName, poVal, peerName, remotePo);
        }
      });

      if (nodesOnRow.length > 0) processRowLinks(nodesOnRow, rowIndex, links, devicePorts);
      nodesOnRow.forEach(n => allCollectedNodes.push(n));
    });

    // SNAKE SELF-LOOP LINKS: Build frontend link entries and mark ports connected
    {
      const seenSnake = new Set();
      topo.globalLinkMap && topo.globalLinkMap.forEach((val, key) => {
        if (!val.isSelfLoop) return;
        const linkKey = [key, val.dev + ":" + val.port].sort().join("|");
        if (seenSnake.has(linkKey)) return;
        seenSnake.add(linkKey);
        const [devA, portA] = key.split(":");
        links.push({ id: "snake-" + linkKey, u: key, v: val.dev + ":" + val.port, type: 'snake' });
        [{ dev: devA, port: portA }, { dev: val.dev, port: val.port }].forEach(({ dev, port }) => {
          if (devicePorts[dev]) {
            if (!devicePorts[dev][port]) devicePorts[dev][port] = { name: port, connected: true, order: 9999, details: {} };
            else devicePorts[dev][port].connected = true;
          }
        });
      });

      // Add snake secondary ports to allCollectedNodes for config generation
      const snakeIntHeaders = {};
      rowHeaders.forEach((h, i) => { if (String(h).startsWith("snake_int_")) snakeIntHeaders[h.substring(10)] = i; });
      dataRows.forEach(row => {
        for (const [devName, snakeColIdx] of Object.entries(snakeIntHeaders)) {
          const snakeRaw = row[snakeColIdx];
          if (!isValidPort(snakeRaw)) continue;
          const device = devices.find(d => d.name === devName);
          if (!device) continue;
          const snakePort = canonicalizeInterface(snakeRaw);
          const details = extractDetails(row, device.attrs);
          details.sheetIndex = device.sheetIndex;
          details.category = determineCategory(details, legends);
          details.isSnakeSecondary = true;
          allCollectedNodes.push({
            devObj: device, deviceName: devName, pName: snakePort, port: snakePort,
            details: details, rowId: -1
          });
        }
      });
    }

    // PHASE 5: CONFIG GENERATION
    const totalNodes = allCollectedNodes.length;
    safeCachePut(cache, 'TOPOLOGY_STATUS', `🔹 Phase 5/6: Generating configs (0/${totalNodes} ports)...`, 200);

    const deviceSeenPos = {};
    devices.forEach(d => deviceSeenPos[d.name] = new Set());

    allCollectedNodes.forEach((node, nodeIndex) => {
      if (nodeIndex % 25 === 0 && nodeIndex > 0) {
        safeCachePut(cache, 'TOPOLOGY_STATUS', `🔹 Phase 5/6: Generating configs (${nodeIndex}/${totalNodes} ports)...`, 200);
      }
      // 1. Inject Aggregated Group Data
      const poVal = normalizePo(node.details.po_);
      if (poVal) {
        const key = node.deviceName + ":" + poVal;
        if (globalPoGroups[key]) {
          node.details.poGroup = globalPoGroups[key];
          if (!node.details.poGroup.peerPo) node.details.poGroup.peerPo = node.details.peerPort;
          if (node.details.isPeerLink) node.details.poGroup.isPeerLink = true;
        }
      }

      // 2. RESTORED: Full Config Generation (Fixes Tooltips)
      if (node.devObj.type === 'full') {
        node.details.config = generateConfig(
          node.pName,
          node.details,
          globalIpPrefs,
          deviceSeenPos[node.deviceName],
          globalNetSettings
        );
      } else {
        node.details.config = "Non-Arista Device";
      }
      node.details.configSource = "Auto";

      if (devicePorts[node.deviceName][node.port]) {
        devicePorts[node.deviceName][node.port].details = node.details;
      }
    });

    // Finalize Node List
    const nodes = devices.map(d => {
      let primaryMode = "";
      if (firstDataRow && d.attrs.sp_mode !== undefined && d.attrs.sp_mode !== -1 && d.attrs.sp_mode < firstDataRow.length) {
        primaryMode = String(firstDataRow[d.attrs.sp_mode]).toLowerCase();
      }
      return {
        id: d.name, type: d.type, mode: primaryMode, sheetIndex: d.sheetIndex,
        visualIndex: d.visualIndex, ports: Object.values(devicePorts[d.name]),
        labels: d.labels || [], hostname: d.hostname || "", role: d.role || "", mlagPeer: d.mlagPeer || "",
        vtepVlans: vtepVlansByDevice[d.name] ? compressVlanRanges(vtepVlansByDevice[d.name]) : ""
      };
    });

    // Final Sanitization (Deep Clean)
    // We strip circular references to ensure successful JSON serialization
    nodes.forEach(node => {
      if (node.ports) {
        node.ports.forEach(port => {
          if (port.details) {
            // Break reference using spread
            const cleanDetails = { ...port.details };
            // Delete complex objects causing circular errors
            if (cleanDetails.poGroup) delete cleanDetails.poGroup;
            if (cleanDetails.configSource) delete cleanDetails.configSource;
            port.details = cleanDetails;
          }
        });
      }
    });

    // PHASE 6: CACHE & DONE
    safeCachePut(cache, 'TOPOLOGY_STATUS', `🔹 Phase 6/6: Caching result (${nodes.length} nodes, ${links.length} links)...`, 200);

    // Bump version if cleanup silently modified data (skipVersionBump suppressed it earlier).
    // Always done regardless of forceSync so verify fetches also update the version.
    if (cleanupMadeChanges) {
      scriptProps.setProperty('DATA_VERSION', new Date().getTime().toString());
    }

    // CACHE ACCURACY GUARD: snapshot the version immediately after any cleanup bump.
    // GAS execution takes 2-6s; a user paste can bump DATA_VERSION during that window.
    // If DATA_VERSION at cache-store time is newer than versionAfterCleanup, the
    // computed data is accurate for versionAfterCleanup — NOT for the paste version.
    // Cache under versionAfterCleanup so the client's next poll sees serverVersion >
    // localDataVersion and triggers a fresh, correct fetch.
    const versionAfterCleanup = scriptProps.getProperty('DATA_VERSION');

    const snakeTrafficHasIn = allCollectedNodes.some(n => (n.details.desc_ || '').trim() === 'TRAFFIC_SNAKE_EP1_L3');
    const snakeTrafficHasOut = allCollectedNodes.some(n => (n.details.desc_ || '').trim() === 'TRAFFIC_SNAKE_EP2_L3');

    const versionAtCacheTime = scriptProps.getProperty('DATA_VERSION');
    const versionToUse = (versionAtCacheTime !== versionAfterCleanup) ? versionAfterCleanup : versionAtCacheTime;

    const result = {
      nodes: nodes,
      links: links,
      dropdowns: dropdowns,
      deviceNames: devices.map(d => d.name).sort(),
      schema: getSchemaConfig(),
      portFrequency: portFrequency,
      logs: topo.debugLogs,
      version: versionToUse,
      snakeTrafficFlags: { hasIn: snakeTrafficHasIn, hasOut: snakeTrafficHasOut }
    };

    // Always store result in GAS cache (including forceSync/verify fetches) so the
    // next background fetch gets a warm cache hit instead of recomputing.
    if (versionToUse) {
      try {
        safeCachePut(cache, 'TOPO_' + versionToUse, JSON.stringify(result), 600);
      } catch (e) {
        console.warn("Topology cache store skipped (payload too large):", e.message);
      }
    }

    return result;

  } catch (e) {
    console.error(e.stack);
    return { error: "Server Error: " + e.message };
  }
}

/**
* -------------------
* GLOBAL CONFIGURATION MANAGER
* -------------------
*/

// 1. Storage Key
const GLOBAL_CONFIG_KEY = "GLOBAL_DEVICE_CONFIG_TEMPLATE";

// 2. Getter
function getGlobalConfig() {
  const props = PropertiesService.getDocumentProperties();
  return props.getProperty(GLOBAL_CONFIG_KEY) || "! No global config defined.\n! Use the menu to add default commands (NTP, AAA, etc).";
}

// 3. Setter (Called from UI)
function saveGlobalConfig(text) {
  const props = PropertiesService.getDocumentProperties();
  props.setProperty(GLOBAL_CONFIG_KEY, text);
  return { success: true };
}

/**
 * LLDP Verification — queries each device via eAPI and returns raw LLDP neighbor data.
 * @param {Object} ipMap  {deviceName: ipAddress}
 * @param {string} protocol  'https' (default) or 'http'
 * @returns {Object} {deviceName: {ok, neighbors} | {ok:false, error}}
 */
function checkLldpNeighbors(ipMap, protocol) {
  protocol = (protocol === 'http') ? 'http' : 'https';
  const results = {};
  for (const devName in ipMap) {
    const ip = (ipMap[devName] || '').trim();
    if (!ip) { results[devName] = { ok: false, error: 'No IP configured' }; continue; }
    try {
      const resp = UrlFetchApp.fetch(protocol + '://' + ip + '/command-api', {
        method: 'post',
        contentType: 'application/json',
        headers: { 'Authorization': 'Basic ' + Utilities.base64Encode('admin:') },
        payload: JSON.stringify({
          jsonrpc: '2.0', method: 'runCmds', id: 'ta-lldp',
          params: { version: 1, cmds: ['show lldp neighbors detail'], format: 'json' }
        }),
        muteHttpExceptions: true,
        validateHttpsCertificates: false,
        followRedirects: false
      });
      const code = resp.getResponseCode();
      if (code === 200) {
        const body = JSON.parse(resp.getContentText());
        if (body.error) {
          results[devName] = { ok: false, error: 'eAPI: ' + (body.error.message || JSON.stringify(body.error)) };
        } else {
          results[devName] = { ok: true, neighbors: body.result[0].lldpNeighbors || {} };
        }
      } else if (code === 401) {
        results[devName] = { ok: false, error: 'Auth failed (HTTP 401) — check credentials' };
      } else {
        results[devName] = { ok: false, error: 'HTTP ' + code };
      }
    } catch (e) {
      results[devName] = { ok: false, error: e.message.substring(0, 100) };
    }
  }
  return results;
}

/**
* Unified IP Defaults (Master Source of Truth)
*/
function getIpPreferences() {
  const userProps = PropertiesService.getUserProperties();
  const defaults = {
    p2p_v4_first: '200', p2p_v4_mask: '/24',
    p2p_v6_first: '200', p2p_v6_mask: '/64',
    gw_v4_first: '100', gw_v4_last: '1', gw_v4_mask: '/24',
    gw_v6_first: '100', gw_v6_last: '1', gw_v6_mask: '/64',
    lo_base: '0',
    mlag_peer_base: '1',
    vni_base: '10000',
    bgp_asn_base: '65000',
    bridge_mac: '',
    ep1_nh: '',
    ep1_mac: '',
    ep1_subnet: '',
    ep2_nh: '',
    ep2_mac: '',
    ep2_subnet: ''
  };

  const prefs = {};
  Object.keys(defaults).forEach(key => {
    prefs[key] = userProps.getProperty(key) || defaults[key];
  });
  return prefs;
}

function saveIpPreferences(prefs) {
  const userProps = PropertiesService.getUserProperties();
  userProps.setProperties(prefs);
  return { success: true };
}

const NOTEBOOK_LM_QUESTIONS_DEFAULT =
  '1. Are all transceiver types (xcvr) compatible with their port speeds?\n' +
  '2. Do speeds on both sides of each cable match or are they compatible (accounting for breakout)?\n' +
  '3. Are breakout cables consistent — does the QSFP/OSFP side match the lane count on the SFP side?\n' +
  '4. Are any xcvr_type fields missing where a speed is set?\n' +
  '5. Are there any obvious mismatches or risks in the cabling?';

function getNotebookLMQuestions() {
  const saved = PropertiesService.getUserProperties().getProperty('notebooklm_questions');
  return { questions: saved !== null ? saved : NOTEBOOK_LM_QUESTIONS_DEFAULT };
}

function saveNotebookLMQuestions(text) {
  PropertiesService.getUserProperties().setProperty('notebooklm_questions', text);
  return { success: true };
}

/**
* HELPER: Called by Frontend to peek at current progress
*/
function getProgressStatus() {
  return CacheService.getUserCache().get('TOPOLOGY_STATUS') || "Waiting for server...";
}

function getSyncStatus() {
  return CacheService.getUserCache().get('SYNC_STATUS') || '';
}

/**
* BATCH UPDATE: Handles edits from the Sidebar UI.
* FIX: Sanitizes dependent fields using Case-Insensitive lookup against Future State.
*/
function updateMultipleInterfaces(payloads) {
  const lock = LockService.getDocumentLock();
  let lockAcquired = false;

  try {
    lockAcquired = lock.tryLock(30000);
    if (!lockAcquired) return { error: "Server busy." };
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_DATA);
    const fullRange = sheet.getDataRange();
    const data = fullRange.getValues();

    if (data.length < 2) return { error: "Sheet data too short." };

    // [FIX] Fetch the dynamic SVI value ("all") ONCE from Schema
    const activeSviValue = 'all';

    const headers = data[1].map(h => String(h).trim());
    const headerMap = new Map();
    headers.forEach((h, i) => headerMap.set(h, i));
    const fieldMap = getFieldMap();

    // ... (Keep existing Map/Index building logic) ...
    const intColIndices = {};
    headers.forEach((h, i) => { if (h.startsWith('int_')) intColIndices[h.substring(4)] = i; });

    const portLookup = new Map();
    for (let r = 2; r < data.length; r++) {
      for (const [devName, colIdx] of Object.entries(intColIndices)) {
        const val = data[r][colIdx];
        if (val && String(val).trim() !== "") {
          const key = devName + ":" + canonicalizeInterface(val);
          portLookup.set(key, r);
        }
      }
    }

    const errors = [];
    let hasChanges = false;

    payloads.forEach(payload => {
      const key = payload.deviceName + ":" + canonicalizeInterface(payload.portName);
      const rowIndex = portLookup.get(key);
      if (rowIndex === undefined) { errors.push(`Port '${payload.portName}' not found.`); return; }

      const originalRowData = data[rowIndex];
      const futureRowData = [...originalRowData];

      // 1. Apply Updates
      for (const [k, v] of Object.entries(payload.updates)) {
        const colPrefix = fieldMap[k] || (k + "_");
        const targetColName = colPrefix + payload.deviceName;
        if (headerMap.has(targetColName)) {
          futureRowData[headerMap.get(targetColName)] = v;
        }
      }

      // 2. SANITIZE (Using Dynamic SVI Value)
      const criticalFields = ["svi_vlan", "ip_type"];
      criticalFields.forEach(field => {
        const colName = field + "_" + payload.deviceName;
        let colIndex = -1;
        if (headerMap.has(colName)) colIndex = headerMap.get(colName);
        else colIndex = headers.findIndex(h => h.toLowerCase() === colName.toLowerCase());

        if (colIndex !== -1) {
          const currentValue = futureRowData[colIndex];
          // Pass 'activeSviValue' here
          const result = validateAndCleanData(headers[colIndex], currentValue, futureRowData, headers, activeSviValue);
          if (!result.valid) futureRowData[colIndex] = result.newValue;
        }
      });

      // 3. Commit
      for (let c = 0; c < futureRowData.length; c++) {
        if (String(futureRowData[c]) !== String(originalRowData[c])) {
          data[rowIndex][c] = futureRowData[c];
          hasChanges = true;
        }
      }
    });

    if (hasChanges) {
      const formulas = fullRange.getFormulas();
      for (let r = 0; r < data.length; r++) {
        for (let c = 0; c < data[r].length; c++) {
          if (formulas[r][c] !== "") data[r][c] = formulas[r][c];
        }
      }
      fullRange.setValues(data);
      SpreadsheetApp.flush();
    }

    if (errors.length > 0) return { success: true, warning: errors.join(", ") };
    return { success: true };

  } catch (e) { return { error: e.toString() }; }
  finally { if (lockAcquired) lock.releaseLock(); }
}

/**
* Unified UI Property Helper
*/
function getUiSettings() {
  const userProps = PropertiesService.getUserProperties();
  return {
    width: userProps.getProperty('width') || '260',
    devGap: userProps.getProperty('devGap') || '100',
    offset: userProps.getProperty('offset') || '30',
    top: userProps.getProperty('top') || '40',
    refresh: userProps.getProperty('refresh') || '60',
    auto: userProps.getProperty('auto') || 'false'
  };
}

/* --- ADD TO Code.gs --- */

/**
 * 1. VISIBILITY STORAGE HELPER
 * Gets list of hidden devices from Script Properties.
 */
function getHiddenDevices() {
  const prop = PropertiesService.getScriptProperties().getProperty('TOPOLOGY_HIDDEN_DEVICES');
  // Return empty list if property doesn't exist
  return prop ? JSON.parse(prop) : [];
}

/**
 * 1. VISIBILITY SAVER (Updated to bump Version)
 */
function saveDeviceVisibility(hiddenList) {
  const props = PropertiesService.getScriptProperties();
  // Device Manager permanent visibility — shared via ScriptProperties (TOPOLOGY_HIDDEN_DEVICES).
  // Does NOT bump DATA_VERSION; Device Manager callers call fetchData(true) explicitly.
  props.setProperty('TOPOLOGY_HIDDEN_DEVICES', JSON.stringify(hiddenList));
  return { success: true };
}

// ── Sheet View temporary device visibility (per-user, independent of Device Manager) ──
// Stored in UserProperties so it never overwrites Device Manager's TOPOLOGY_HIDDEN_DEVICES.
function getSheetViewHidden() {
  const v = PropertiesService.getUserProperties().getProperty('SHEET_VIEW_HIDDEN');
  return v ? JSON.parse(v) : [];
}
function saveSheetViewHidden(list) {
  PropertiesService.getUserProperties().setProperty('SHEET_VIEW_HIDDEN', JSON.stringify(list));
}

// ── Sheet View ip_type filter ──
function getSheetViewIpFilter() {
  const v = PropertiesService.getUserProperties().getProperty('SHEET_VIEW_IP_FILTER');
  return v ? JSON.parse(v) : ['p2p', 'gw', 'blank'];
}
function saveSheetViewIpFilter(filters) {
  PropertiesService.getUserProperties().setProperty('SHEET_VIEW_IP_FILTER', JSON.stringify(filters));
}
function applySheetIpFilter(filters) {
  saveSheetViewIpFilter(filters);
  refreshSheetRowVisibility();
}

// ── Sheet View int_mode (sp_mode_) filter ──
// Groups: 'l2' matches l2-*, 'l3' matches l3-*, 'et' matches *-et-*, 'po' matches *-po-*.
// Default all 4 active. OR within group, AND with other filters.
function getSheetViewIntModeFilter() {
  const v = PropertiesService.getUserProperties().getProperty('SHEET_VIEW_INT_MODE_FILTER');
  if (!v) return []; // [] = skip filter, show all rows (legacy default 'l2/l3/et/po' was group-keys, not full sp_mode values)
  const parsed = JSON.parse(v);
  // Migrate legacy group-key format (['l2','l3','et','po']) — treat as "show all"
  const FULL_MODES = ['l2-et-access','l2-et-trunk','l2-po-access','l2-po-trunk','l3-et-int','l3-et-sub-int','l3-po-int','l3-po-sub-int'];
  if (parsed.length > 0 && !parsed.some(function(v) { return FULL_MODES.indexOf(v) !== -1; })) return [];
  return parsed;
}
function saveSheetViewIntModeFilter(filters) {
  PropertiesService.getUserProperties().setProperty('SHEET_VIEW_INT_MODE_FILTER', JSON.stringify(filters));
}
function applySheetIntModeFilter(filters) {
  saveSheetViewIntModeFilter(filters);
  refreshSheetRowVisibility();
}

// ── Sheet View svi filter ──
// Values: 'active' (svi_vlan_ has any value), 'blank' (svi_vlan_ empty). Default both active.
function getSheetViewSviFilter() {
  // Key migrations: old val → new val (matches the UI filter item values)
  const SVI_FILTER_MIGRATIONS = { 'yes': 'active' };
  const v = PropertiesService.getUserProperties().getProperty('SHEET_VIEW_SVI_FILTER');
  if (!v) return ['active', 'blank'];
  try {
    const filters = JSON.parse(v);
    if (!Array.isArray(filters)) return ['active', 'blank'];
    const migrated = filters.map(function(f) { return SVI_FILTER_MIGRATIONS[f] || f; });
    const changed = migrated.some(function(f, i) { return f !== filters[i]; });
    if (changed) PropertiesService.getUserProperties().setProperty('SHEET_VIEW_SVI_FILTER', JSON.stringify(migrated));
    return migrated;
  } catch (e) { return ['active', 'blank']; }
}
function saveSheetViewSviFilter(filters) {
  PropertiesService.getUserProperties().setProperty('SHEET_VIEW_SVI_FILTER', JSON.stringify(filters));
}
function applySheetSviFilter(filters) {
  saveSheetViewSviFilter(filters);
  refreshSheetRowVisibility();
}

function getDeviceLabels() {
  const prop = PropertiesService.getScriptProperties().getProperty('DEVICE_LABELS');
  return prop ? JSON.parse(prop) : {};
}

function saveDeviceLabels(labelsMap) {
  const props = PropertiesService.getScriptProperties();
  props.setProperty('DEVICE_LABELS', JSON.stringify(labelsMap));
  props.setProperty('DATA_VERSION', new Date().getTime().toString());
  return { success: true };
}

function getDeviceMetadata() {
  const prop = PropertiesService.getDocumentProperties().getProperty('DEVICE_METADATA');
  return prop ? JSON.parse(prop) : {};
}

function saveDeviceMetadata(metaMap) {
  PropertiesService.getDocumentProperties().setProperty('DEVICE_METADATA', JSON.stringify(metaMap));
  return { success: true };
}

function getDeviceHostnames() {
  const prop = PropertiesService.getDocumentProperties().getProperty('DEVICE_HOSTNAMES');
  return prop ? JSON.parse(prop) : {};
}

function saveDeviceHostnames(hostnamesMap) {
  PropertiesService.getDocumentProperties().setProperty('DEVICE_HOSTNAMES', JSON.stringify(hostnamesMap));
  return { success: true };
}

function getDeviceRoles() {
  const prop = PropertiesService.getDocumentProperties().getProperty('DEVICE_ROLES');
  return prop ? JSON.parse(prop) : {};
}

function saveDeviceRoles(rolesMap, manualNonArista) {
  PropertiesService.getDocumentProperties().setProperty('DEVICE_ROLES', JSON.stringify(rolesMap));
  // Auto-sync NON_ARISTA_DEVICES: two sources of non-Arista devices:
  // 1. Role-based: IXIA/SPIRENT roles are always non-Arista (auto-derived from rolesMap).
  // 2. Manual: explicitly toggled via Device Manager Non-EOS button (passed as manualNonArista param).
  // Both are merged; role-based entries win over manual for IXIA/SPIRENT (deduplicated).
  const nonAristaRoles = new Set(['IXIA', 'SPIRENT']);
  const roleBasedNonArista = Object.entries(rolesMap)
    .filter(([, r]) => nonAristaRoles.has((r || '').toUpperCase()))
    .map(([name]) => name);
  // Manually toggled non-EOS devices (not IXIA/SPIRENT — those are already covered by role-based path).
  const validManual = (manualNonArista || []).filter(name => !nonAristaRoles.has((rolesMap[name] || '').toUpperCase()));
  saveNonAristaList([...new Set([...validManual, ...roleBasedNonArista])]);
  return { success: true };
}

function getDeviceMlagPeers() {
  const prop = PropertiesService.getDocumentProperties().getProperty('DEVICE_MLAG_PEERS');
  return prop ? JSON.parse(prop) : {};
}

function saveDeviceMlagPeers(peersMap) {
  // Enforce bidirectionality: A→B automatically implies B→A.
  // User only needs to set one side; the server normalizes the pair.
  const normalized = {};
  Object.entries(peersMap).forEach(([dev, peer]) => {
    if (peer) {
      normalized[dev] = peer;
      normalized[peer] = dev;
    }
  });
  PropertiesService.getDocumentProperties().setProperty('DEVICE_MLAG_PEERS', JSON.stringify(normalized));
  return { success: true };
}

// ── Device ID Snapshot — detect column-order shifts ───────────────────────────

function getDeviceIdSnapshot() {
  var raw = PropertiesService.getDocumentProperties().getProperty('DEVICE_ID_SNAPSHOT');
  return raw ? JSON.parse(raw) : null;
}

function saveDeviceIdSnapshot() {
  var devices = getExistingDevices() || [];
  var snap = {};
  devices.forEach(function(d) { if (d.sheetIndex !== '-') snap[d.name] = d.sheetIndex; });
  PropertiesService.getDocumentProperties()
    .setProperty('DEVICE_ID_SNAPSHOT', JSON.stringify(snap));
  return snap;
}

function checkDeviceIdShift() {
  var snap = getDeviceIdSnapshot();
  if (!snap) return { shifted: [], isFirstRun: true };
  var devices = getExistingDevices() || [];
  var shifted = [];
  devices.forEach(function(d) {
    if (d.sheetIndex === '-') return;
    if (snap[d.name] !== undefined && snap[d.name] !== d.sheetIndex)
      shifted.push({ name: d.name, oldId: snap[d.name], newId: d.sheetIndex });
  });
  return { shifted: shifted, isFirstRun: false };
}

/* --- MODIFY EXISTING FUNCTION IN Code.gs --- */

/**
 * UPDATED getExistingDevices
 * Now returns an 'isVisible' property for every device.
 */
function getExistingDevices() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_DATA);
  if (!sheet) return [];

  const lastCol = sheet.getLastColumn();
  if (lastCol < 1) return [];

  const r1 = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const r2 = sheet.getRange(2, 1, 1, lastCol).getValues()[0];
  let registeredNonArista = getNonAristaList();

  // 🟢 READ HIDDEN LIST
  const hiddenDevices = getHiddenDevices();
  const deviceLabels = getDeviceLabels();
  const deviceHostnames = getDeviceHostnames();
  const deviceRoles = getDeviceRoles();
  const deviceMlagPeers = getDeviceMlagPeers();
  const deviceMetadata = getDeviceMetadata();

  let devices = [];
  let processed = new Set();
  let visualCounter = 0;
  let aristaCounter = 0;

  for (let c = 0; c < r2.length; c++) {
    let header = String(r2[c]);
    if (!header.startsWith("int_")) continue;

    // Row 1 is non-empty only at the first column of each device group.
    // Skipping columns where Row 1 is empty prevents multi-word keys like
    // "int_speed_gd435" from being mistaken for device "speed_gd435".
    if (!r1[c] || String(r1[c]).trim() === "") continue;

    let devName = header.substring(4);
    if (devName && !processed.has(devName)) {
      processed.add(devName);
      visualCounter++;

      let colCount = 0;
      r2.forEach(h => { if (String(h).endsWith(devName)) colCount++; });
      let isNonArista = (registeredNonArista.includes(devName) || colCount === 1);

      let sheetIndex = "-";
      if (!isNonArista) {
        aristaCounter++;
        sheetIndex = aristaCounter;
      }

      devices.push({
        name: devName,
        type: isNonArista ? 'non-arista' : 'full',
        sheetIndex: sheetIndex,
        visualIndex: visualCounter,
        // 🟢 CALCULATE VISIBILITY (True if NOT in hidden list)
        isVisible: !hiddenDevices.includes(devName),
        labels: deviceLabels[devName] || [],
        hostname: deviceHostnames[devName] || "",
        role: deviceRoles[devName] || "",
        mlagPeer: deviceMlagPeers[devName] || "",
        model: (deviceMetadata[devName] || {}).model || "",
        rack: (deviceMetadata[devName] || {}).rack || ""
      });
    }
  }
  return devices;
}

/**
 * Dynamic Field Map Generator.
 * Prevents "missing column" bugs when you add new fields to the Schema.
 */
function getFieldMap() {
  const schema = getSchemaConfig();
  const map = { 'desc': 'desc_' }; // Keep description as a base
  schema.forEach(item => {
    map[item.key] = item.key + "_";
  });
  return map;
}

/**
* UI helper
* */

function savePreferences(width, devGap, offset, top, refresh, auto) {
  try {
    PropertiesService.getUserProperties().setProperties({
      'width': String(width),
      'devGap': String(devGap),
      'offset': String(offset),
      'top': String(top),
      'refresh': String(refresh),
      'auto': String(auto)
    });
    console.log("✓ Preferences saved for user: " + width + "px width");
    return "Saved"; // Return a value so the sidebar knows it worked
  } catch (e) {
    console.error("✗ Error saving preferences: " + e.toString());
    return "Error: " + e.toString();
  }
}

// DUPLICATED in Sidebar-js.html — last synced: 2026-04-20
function canonicalizeInterface(name) {
  if (!name) return "";

  let s = String(name).trim().replace(/^(interface\s+|int\s+)/i, "");

  s = s.replace(/^ethernet/i, "Et")
    .replace(/^eth/i, "Et")
    .replace(/^port-channel/i, "Po")
    .replace(/^portchannel/i, "Po")
    .replace(/^vlan/i, "Vl")
    .replace(/^vxlan/i, "Vx")
    .replace(/^loopback/i, "Lo")
    .replace(/^(management|mgmt|ma)/i, "Ma")
    .replace(/^tunnel/i, "Tu");

  // Matches Et1, Et1/1, Et1.10, Twe1, Hu1, Te1, Gi1, Fa1, etc.
  let match = s.match(/^((?:Twe|Hu|Te|Gi|Fa|Et|Po|Vx|Vl|Lo|Ma|Tu)\d+[\d\/.]*)/i);

  return match ? match[1] : s;
}

function getColumnIndices(headers, devName) {
  const indices = {};
  const map = getFieldMap();
  for (let [k, prefix] of Object.entries(map)) {
    indices[k] = headers.indexOf(prefix + devName);
  }
  return indices;
}

function isValidPort(p) {
  if (p === null || p === undefined) return false;
  const s = String(p).trim();
  // Allow numbers and strings, reject empty, N/A, and "switchport" keywords
  return s !== "" && s !== "#N/A" && !s.toLowerCase().includes("switchport");
}

function extractDetails(row, attrs) {
  const details = {};
  const map = getFieldMap();
  for (let [k, idx] of Object.entries(attrs)) {
    if (idx !== -1) details[map[k]] = (idx < row.length) ? String(row[idx]) : "";
  }
  return details;
}

function processRowLinks(nodes, rowIndex, linksArray, devicePortsMap) {
  // Helper to safely add port data
  const add = (dev, port, connected, rId, d) => {
    if (!devicePortsMap[dev]) return;
    if (!devicePortsMap[dev][port]) {
      devicePortsMap[dev][port] = { name: port, connected: connected, order: rId, details: d };
    } else {
      const p = devicePortsMap[dev][port];
      if (connected) p.connected = true;
      if (rId < p.order) p.order = rId;
    }
  };

  // 1. PROCESS PAIRS
  for (let i = 0; i < nodes.length - 1; i += 2) {
    const s = nodes[i], t = nodes[i + 1];

    if (devicePortsMap[s.deviceName] && devicePortsMap[t.deviceName]) {

      // --- NEW: ADVANCED LINK CLASSIFICATION ---
      let linkType = 'std'; // Default Physical Link

      const isNonEosS = s.devObj.type === 'non-arista';
      const isNonEosT = t.devObj.type === 'non-arista';
      const hasPoS = normalizePo(s.details.po_) !== null;
      const hasPoT = normalizePo(t.details.po_) !== null;

      // 1. Peer Link (Highest Priority)
      if (s.details.isPeerLink && t.details.isPeerLink) {
        linkType = 'peer';
      }
      // 2. MLAG Member
      else if (s.details.isMlag || t.details.isMlag) {
        linkType = 'mlag';
      }
      // 3. Non-EOS Connection (To Server/Patch Panel)
      else if (isNonEosS || isNonEosT) {
        linkType = 'non_eos';
      }
      // 4. Regular Port-Channel (LACP)
      else if (hasPoS && hasPoT) {
        linkType = 'regular_po';
      }
      // -----------------------------------------

      linksArray.push({
        id: `link-${rowIndex}-${i}`,
        u: `${s.deviceName}:${s.port}`,
        v: `${t.deviceName}:${t.port}`,
        type: linkType // <--- Sending classification to frontend
      });

      add(s.deviceName, s.port, true, s.rowId, s.details);
      add(t.deviceName, t.port, true, t.rowId, t.details);
    }
  }

  // 2. PROCESS ORPHAN
  // Vx1 is a logical port (VTEP); it is never "disconnected" even when unpaired.
  if (nodes.length % 2 !== 0) {
    const last = nodes[nodes.length - 1];
    if (devicePortsMap[last.deviceName] && canonicalizeInterface(last.port) !== "Vx1") {
      add(last.deviceName, last.port, false, last.rowId, last.details);
    }
  }
}

function determineCategory(details, legends) {
  const ipType = (details.ip_type_ || "").toLowerCase();
  const spMode = (details.sp_mode_ || "").toLowerCase();
  if (legends.gw && legends.gw.some(l => ipType.includes(l))) return "GW";
  if (legends.p2p && legends.p2p.some(l => ipType.includes(l))) return "P2P";
  if (!ipType) { if ((legends.l2 && legends.l2.some(l => spMode === l)) || spMode.includes("access") || spMode.includes("trunk")) return "L2"; }
  return "NA";
}

// 7. Operations wrappers
function deleteInterface(dev, port) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { error: "Busy" };
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_DATA);
    const data = sheet.getDataRange().getValues();
    const headers = data[1];
    const intColIdx = headers.indexOf("int_" + dev);
    if (intColIdx === -1) return { error: "Dev not found" };

    let rowIndex = -1;
    for (let i = 2; i < data.length; i++) {
      if (canonicalizeInterface(data[i][intColIdx]) === canonicalizeInterface(port)) { rowIndex = i; break; }
    }

    if (rowIndex !== -1) {
      headers.forEach((h, c) => {
        if (String(h).endsWith(dev)) sheet.getRange(rowIndex + 1, c + 1).clearContent();
      });
    }
    return { success: true };
  } catch (e) { return { error: e.message }; }
  finally { lock.releaseLock(); }
}

function addLinkPair(devA, portA, devB, portB, attrsA, attrsB) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { error: "Busy" };
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_DATA);
    const allValues = sheet.getDataRange().getValues();
    const headers = allValues[1];
    const fieldMap = getFieldMap();

    const colA = headers.indexOf("int_" + devA);
    const colB = headers.indexOf("int_" + devB);

    // Duplicate check: scan data rows (index 2+) for the same port pair.
    // colA/colB naturally handle the swapped-A/B case: if the user adds the
    // link in reverse order (devB first), the column indices swap too.
    if (colA !== -1 && colB !== -1) {
      for (let r = 2; r < allValues.length; r++) {
        const row = allValues[r];
        const vA = (row[colA] || "").toString().trim();
        const vB = (row[colB] || "").toString().trim();
        if (vA === portA && vB === portB) {
          return { error: "Link already exists: " + devA + ":" + portA + " ↔ " + devB + ":" + portB };
        }
      }
    }

    const nextRow = sheet.getLastRow() + 1;
    const findC = (dev, attrKey) => {
      const prefix = fieldMap[attrKey] || (attrKey + "_");
      return headers.indexOf(prefix + dev);
    };

    const setVal = (r, c, v) => { if (c !== -1) sheet.getRange(r, c + 1).setValue(v); };

    setVal(nextRow, colA, portA);
    setVal(nextRow, colB, portB);

    Object.entries(attrsA).forEach(([k, v]) => setVal(nextRow, findC(devA, k), v));
    Object.entries(attrsB).forEach(([k, v]) => setVal(nextRow, findC(devB, k), v));

    return { success: true };
  } catch (e) { return { error: e.message }; }
  finally { lock.releaseLock(); }
}

function addSnakePair(dev, portA, portB, attrs) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { error: "Busy" };
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_DATA);
    const allValues = sheet.getDataRange().getValues();
    const headers = allValues[1];
    const fieldMap = getFieldMap();

    const intColIdx = headers.indexOf("int_" + dev);
    if (intColIdx === -1) return { error: "Device " + dev + " not found in sheet headers" };

    // snake_int_ column is part of the schema (DEFAULT_SCHEMA_ARRAY) and always pre-created
    const snakeColIdx = headers.indexOf("snake_int_" + dev);
    if (snakeColIdx === -1) return { error: "snake_int_" + dev + " column not found — re-add device to rebuild schema columns" };

    // Duplicate check: snake cable is undirected — portA↔portB == portB↔portA
    for (let r = 2; r < allValues.length; r++) {
      const row = allValues[r];
      const vInt  = (row[intColIdx]   || "").toString().trim();
      const vSnake = (row[snakeColIdx] || "").toString().trim();
      if ((vInt === portA && vSnake === portB) || (vInt === portB && vSnake === portA)) {
        return { error: "Snake link already exists: " + dev + ":" + portA + " ↔ " + dev + ":" + portB };
      }
    }

    const nextRow = sheet.getLastRow() + 1;
    const setVal = (r, c, v) => { if (c >= 0) sheet.getRange(r, c + 1).setValue(v); };
    setVal(nextRow, intColIdx, portA);
    setVal(nextRow, snakeColIdx, portB);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      const prefix = fieldMap[k] || (k + "_");
      setVal(nextRow, headers.indexOf(prefix + dev), v);
    });

    return { success: true };
  } catch (e) { return { error: e.message }; }
  finally { lock.releaseLock(); }
}

function connectExistingToNew(devA, portA, attrsA, devB, portB, attrsB) {
  const del = deleteInterface(devA, portA);
  if (del.error) return del;
  if (devA === devB) return addSnakePair(devA, portA, portB, attrsA);
  return addLinkPair(devA, portA, devB, portB, attrsA, attrsB);
}

/**
* -------------------
* PROPERTIES HELPERS (Persistent Memory)
* -------------------
*/
function getNonAristaList() {
  const props = PropertiesService.getDocumentProperties();
  const raw = props.getProperty('NON_ARISTA_DEVICES');
  return raw ? JSON.parse(raw) : [];
}

function saveNonAristaList(namesArray) {
  const props = PropertiesService.getDocumentProperties();
  const unique = [...new Set(namesArray)];
  props.setProperty('NON_ARISTA_DEVICES', JSON.stringify(unique));
}


/**
* -------------------
* SHARED VALIDATION LOGIC (Dynamic SVI)
* -------------------
*/
function validateAndCleanData(header, value, rowData, headers, activeSviValue) {
  const valStr = String(value || "").trim();
  // Default to 'all' if dynamic value wasn't passed, for safety
  const targetSvi = (activeSviValue || 'all').toLowerCase();

  if (valStr === "") return { valid: true, newValue: "", warning: null };

  const headerParts = header.split('_');
  const devName = headerParts.length > 1 ? headerParts[headerParts.length - 1] : "";

  const getSiblingVal = (keyPrefix) => {
    const target = (keyPrefix + devName).toLowerCase();
    const colIdx = headers.findIndex(h => h.toLowerCase() === target);
    return (colIdx !== -1) ? String(rowData[colIdx] || "").trim().toLowerCase() : null;
  };

  const mode = getSiblingVal("sp_mode_");
  const svi = getSiblingVal("svi_vlan_");

  // Rules 1, 2, 3 removed — audit flags L3+SVI, L2+ip_type_, ET+Po; user may want to rollback

  // --- RULE 4: VLAN format (numbers, ranges, comma-separated lists, or nv<N> native token) ---
  if (header.toLowerCase().startsWith("vlan_")) {
    if (!/^((nv\d+|\d+(-\d+)?)(,(nv\d+|\d+(-\d+)?))*)?$/.test(valStr)) {
      return {
        valid: false,
        newValue: "",
        warning: "Invalid VLAN format. Use: 10, 10,20, 10-20, or nv100 for native VLAN"
      };
    }
  }

  // --- RULE 6: Po format auto-correction ---
  if (header.toLowerCase().startsWith("po_")) {
    const normalized = normalizePo(valStr);
    if (normalized && normalized !== valStr) {
      return { valid: true, newValue: normalized, warning: null };
    }
  }

  return { valid: true, newValue: valStr, warning: null };
}

/**
 * MASTER CLEANUP FUNCTION
 * 1. Standardizes Port Names (Ethernet1 -> Et1)
 * 2. Standardizes SVI VLANs Values (true/1/y/yes -> all)
 * 3. Removes Invalid L3 Mode on MLAG ports
 * 4. Cleans up invalid L2/L3 configs
 * * RETURNS: Boolean (true if changes were made, false if clean)
 */
function runFullSheetCleanup(skipVersionBump) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_DATA);
  if (!sheet) return false;

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 3) return false;

  // 1. Read Data
  const fullRange = sheet.getDataRange();
  const allValues = fullRange.getValues();
  const headers = allValues[1].map(h => String(h).trim());
  const bodyValues = allValues.slice(2);

  // 2. Pre-Calculate Topology
  const topo = calculateGlobalTopology(allValues, headers);

  let changeCount = 0;
  const devices = getExistingDevices();

  // 3. Iterate & Sanitize
  for (let r = 0; r < bodyValues.length; r++) {
    const row = bodyValues[r];
    devices.forEach(dev => {
      const getIdx = (prefix) => headers.findIndex(h => h.toLowerCase() === (prefix + dev.name).toLowerCase());
      const intIdx = getIdx("int_");
      const modeIdx = getIdx("sp_mode_");
      const sviIdx = getIdx("svi_vlan_");
      const ipIdx = getIdx("ip_type_");
      const poIdx = getIdx("po_");

      // A. NAME NORMALIZATION
      if (intIdx !== -1) {
        const rawName = String(row[intIdx] || "");
        if (rawName) {
          const cleanName = canonicalizeInterface(rawName);
          if (cleanName !== rawName) {
            row[intIdx] = cleanName;
            changeCount++;
          }
        }
      }

      // B. SVI_VLAN STANDARDIZATION (migrate legacy 'yes'/'active'/aliases → 'all')
      if (sviIdx !== -1) {
        const rawSvi = String(row[sviIdx] || "").trim().toLowerCase();
        const originalVal = String(row[sviIdx] || "");
        if (['true', '1', 'y', 'yes', 'active'].includes(rawSvi)) {
          if (originalVal !== 'all') {
            row[sviIdx] = 'all';
            changeCount++;
          }
        }
      }

      if (modeIdx === -1) return;

      const modeVal = String(row[modeIdx] || "").trim().toLowerCase();
      const rawPoVal = (poIdx !== -1) ? String(row[poIdx] || "").trim() : "";
      const poVal = rawPoVal ? normalizePo(rawPoVal) : null;

      // Po FORMAT NORMALIZATION (e.g. port-channel10 → Po10)
      if (poIdx !== -1 && rawPoVal && poVal && poVal !== rawPoVal) {
        row[poIdx] = poVal;
        changeCount++;
      }

      // C. MLAG + L3 CONFLICT — removed: audit (Check B) flags this; user may need to rollback
      // D. L3 MODE CLEANUP — removed: audit (Check C) flags L3+SVI; user may need to rollback
      // E. L2 MODE CLEANUP — removed: audit (Check I) flags stale ip_type_ on L2+no SVI; user may want to rollback
      // F. ET MODE: CLEAR STALE PO VALUE — removed: audit (Check H) flags stale PO; user may want to rollback ET→PO


    });
  }

  // 4. Commit Changes (LOOP PREVENTION)
  if (changeCount > 0) {
    const writeRange = sheet.getRange(3, 1, bodyValues.length, lastCol);
    writeRange.setValues(bodyValues);

    // [CRITICAL] Only update version if actual changes happened.
    // This stops infinite refresh loops.
    // skipVersionBump: caller (e.g. getTopologyData) will bump the version itself
    // after storing the cache, so the poller never sees a mid-computation version change.
    if (!skipVersionBump) {
      PropertiesService.getScriptProperties().setProperty('DATA_VERSION', new Date().getTime().toString());
    }

    if (typeof ss.toast === 'function') {
      ss.toast(`Auto-Sanitized ${changeCount} cells.`, "Data Cleaned");
    }
    return true;
  }

  return false;
}

/**
 * TRIGGER: MANUAL EDITS
 * Handles data validation, auto-cleaning of dependent fields, and versioning.
 * Wrapped in LockService to prevent race conditions during bulk edits.
 */
function onEdit(e) {
  // 1. Transactional Lock: Wait up to 10 seconds for other edits to finish
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(10000)) return;

  try {
    const sheet = e.source.getActiveSheet();
    if (sheet.getName() !== SHEET_DATA) return;

    const range = e.range;
    const startRow = range.getRow();
    const startCol = range.getColumn();

    // Guard: column A is reserved for _sys_ row-visibility column — revert any user edit
    if (startCol === 1) {
      if (startRow === 2) {
        // Row 2 holds the _sys_ header — restore it so ensureDummyColumn doesn't insert a duplicate column
        range.setValue(DUMMY_VIS_HEADER);
      } else {
        range.clearContent();
      }
      e.source.toast('Column A is reserved for TopoAssist row visibility markers and cannot be edited.', '⚠ Protected Column', 5);
      return;
    }

    if (startRow < 3) return; // Skip Header rows

    const numRows = range.getNumRows();
    const numCols = range.getNumColumns();

    // 2. Fetch Context: Get headers and full row data for the edited range
    const lastCol = sheet.getLastColumn();
    const headers = sheet.getRange(2, 1, 1, lastCol).getValues()[0].map(h => String(h).trim());
    const dataRange = sheet.getRange(startRow, 1, numRows, lastCol);
    const allRowValues = dataRange.getValues();

    const SVI_YES = 'all';
    let hasChanges = false;
    const bgUpdates = []; // Collect cell background changes from mode edits

    // 3. Process every cell in the edited range (Handles single edits and bulk pastes)
    for (let r = 0; r < numRows; r++) {
      const rowData = allRowValues[r]; // Reference to allRowValues[r] — mutations here update the array

      for (let c = 0; c < numCols; c++) {
        const absCol = startCol + c;
        const header = String(headers[absCol - 1] || "");
        const cellValue = rowData[absCol - 1];
        const valStr = String(cellValue || "").trim();

        // --- PHASE 0: Strict Type Validation (Port-Channels only) ---
        // int_ accepts any non-empty value on edit — unsupported types are flagged in Audit mode only.
        if (valStr !== "") {
          if (header.toLowerCase().startsWith("po_")) {
            const isValidPo = /^(Po|Port-?Channel)\d+/i.test(valStr);
            if (!isValidPo) e.source.toast("△ Invalid Port-Channel format. Use Po100, etc.", "Format Warning");
          }
        }

        // --- PHASE A: Standard Validation ---
        const result = validateAndCleanData(header, cellValue, rowData, headers, SVI_YES);
        if (!result.valid) {
          if (r === 0 && c === 0) e.source.toast("△ " + result.warning, "Invalid Input");
          rowData[absCol - 1] = result.newValue;
          hasChanges = true;
        }

        // --- PHASE B: Contextual Auto-Cleaning ---
        if (!header.includes("_")) continue;

        const devName = header.substring(header.indexOf("_") + 1);
        const getIdx = (prefix) => {
          const key = (prefix + devName).toLowerCase();
          return headers.findIndex(h => h.toLowerCase() === key) + 1;
        };

        const modeIdx = getIdx("sp_mode_");
        const sviIdx = getIdx("svi_vlan_");
        const ipIdx = getIdx("ip_type_");
        let modeVal = (modeIdx > 0) ? String(rowData[modeIdx - 1] || "").trim().toLowerCase() : "";

        // === USER EDITED: MODE COLUMN ===
        if (header.toLowerCase().startsWith("sp_mode_")) {
          // Auto-clears for ET/L3/L2 removed — audit flags these; user may want to rollback

          // Immediate cell backgrounds: po_ grey for Et modes; svi_vlan_ grey for l3 only
          const poColNum = getIdx("po_");
          const isEtMode = /^l[23]-et/.test(modeVal);
          if (poColNum > 0) bgUpdates.push({ row: startRow + r, col: poColNum, bg: isEtMode ? "#e2e8f0" : null });
          if (sviIdx > 0) bgUpdates.push({ row: startRow + r, col: sviIdx, bg: modeVal.startsWith("l3") ? "#e2e8f0" : null });
        }

        // === USER EDITED: SVI COLUMN — auto-clear of ip_type_ removed; audit (Check I) flags it ===
      }
    }

    // 4. Single batch write — only if auto-cleaning changed something
    if (hasChanges) dataRange.setValues(allRowValues);

    // 4b. Apply cell background updates from mode column edits (immediate greying)
    bgUpdates.forEach(u => { if (u.col > 0) sheet.getRange(u.row, u.col).setBackground(u.bg); });

    // 5. Always bump version — user made an edit, sidebar must refresh
    PropertiesService.getScriptProperties().setProperty('DATA_VERSION', new Date().getTime().toString());

  } catch (err) {
    console.error("onEdit Error: " + err.toString());
  } finally {
    // 5. CRITICAL: Always release the lock so other users/scripts can edit
    lock.releaseLock();
  }
}

// Structural-change guard: re-insert _sys_ column if the user deletes col A.
// This is an INSTALLABLE trigger handler — ensureOnChangeTrigger() wires it up.
function onStructuralChange(e) {
  if (e.changeType !== 'REMOVE_COLUMN') return;
  const ss = e.source;
  const sheet = ss.getActiveSheet();
  if (sheet.getName() !== SHEET_DATA) return;
  const sysGone = sheet.getLastColumn() < 1 || String(sheet.getRange(2, 1).getValue()) !== DUMMY_VIS_HEADER;
  ensureDummyColumn(sheet);
  if (sysGone) {
    ss.toast('Column A (_sys_) was deleted and has been automatically restored. Do not delete this column — TopoAssist needs it to track row visibility.', '⚠ Column Restored', 8);
  }
}

// Installs the onChange installable trigger if it isn't already present.
// Called from onOpen() — safe to fail silently when auth is limited.
function ensureOnChangeTrigger() {
  const ss = SpreadsheetApp.getActive();
  const already = ScriptApp.getProjectTriggers().some(function(t) {
    return t.getHandlerFunction() === 'onStructuralChange' &&
           t.getTriggerSourceId() === ss.getId() &&
           t.getEventType() === ScriptApp.EventType.ON_CHANGE;
  });
  if (!already) {
    ScriptApp.newTrigger('onStructuralChange').forSpreadsheet(ss).onChange().create();
  }
}

/**
* -------------------
* CONFIGURATION HELPERS
* -------------------
*/

// 1. INPUT PARSER: Converts raw strings/ranges into a clean Set of integers
function expandVlanString(str) {
  const result = new Set();
  if (!str) return result;

  // Split by comma, newline, or space to handle any format
  const parts = String(str).split(/[\n,\s]+/);

  parts.forEach(p => {
    p = p.trim();
    if (!p) return;

    if (p.includes("-") && !p.toLowerCase().includes("nan")) {
      // Handle Range: "10-95"
      const rangeParts = p.split("-");
      const start = parseInt(rangeParts[0], 10);
      const end = parseInt(rangeParts[1], 10);

      // Strict check: Start and End must be valid numbers
      if (!isNaN(start) && !isNaN(end) && start <= end) {
        for (let i = start; i <= end; i++) result.add(i);
      }
    } else {
      // Handle Single Number: "10"
      const num = parseInt(p, 10);
      if (!isNaN(num)) result.add(num);
    }
  });
  return result;
}

// Parses a vlan_ field value that may contain an 'nv<N>' native-VLAN token.
// DUPLICATED in Sidebar-js.html — last synced: 2026-04-20
// Returns { native: string|null, vlans: string } where:
//   native = the native VLAN number as a string (e.g. "100"), or null if absent
//   vlans  = the remaining VLAN string with the nv token removed (e.g. "10,20")
// Only the first nv<N> token is used; subsequent ones are treated as regular tokens.
function parseVlanWithNative(str) {
  var s = String(str || '').trim();
  if (!s) return { native: null, vlans: '' };
  var native = null;
  var rest = [];
  s.split(',').forEach(function(p) {
    var t = p.trim();
    var m = t.match(/^nv(\d+)$/i);
    if (m && !native) {
      native = m[1];
    } else if (t) {
      rest.push(t);
    }
  });
  return { native: native, vlans: rest.join(',') };
}

// 2. OUTPUT GENERATOR: Compresses numbers back into ranges (10,11,12 -> 10-12)
// *** UPDATED TO BE BULLETPROOF AGAINST NaN ***
function compressVlanRanges(numberSet) {
  if (!numberSet || numberSet.size === 0) return "";

  // SAFETY STEP: Convert everything to Numbers and remove NaN/Junk
  // This fixes the "NaN-NaN" and "19-95" string issues
  const cleanNumbers = Array.from(numberSet)
    .map(n => Number(n))    // Force convert to Number
    .filter(n => !isNaN(n))  // Remove NaNs
    .sort((a, b) => a - b);  // Sort numerically

  if (cleanNumbers.length === 0) return "";

  const ranges = [];
  let start = cleanNumbers[0];
  let prev = cleanNumbers[0];

  for (let i = 1; i < cleanNumbers.length; i++) {
    if (cleanNumbers[i] !== prev + 1) {
      // Gap detected, finalize the previous range
      ranges.push(start === prev ? String(start) : `${start}-${prev}`);
      start = cleanNumbers[i];
    }
    prev = cleanNumbers[i];
  }

  // Add the final range
  ranges.push(start === prev ? String(start) : `${start}-${prev}`);

  return ranges.join(",");
}

/**
 * Returns the subset of vlans that should get SVIs, based on svi_vlan_ value.
 * svi_vlan_ = 'all' → all vlans (including native VLAN if present in vlans array)
 * svi_vlan_ = '10' or '10,20' → only those VLAN IDs that exist in vlans
 * svi_vlan_ = 'nv100' → VLAN 100 (native VLAN shorthand), if 100 is in vlans
 * svi_vlan_ = '' / undefined → [] (no SVIs)
 * vlans: Array of VLAN IDs (numbers or numeric strings) — caller must include native VLAN if desired.
 * Returns an array of the same element type as vlans.
 */
function _parseSviVlans(sviVlanVal, vlans) {
  const v = String(sviVlanVal || "").trim().toLowerCase();
  if (!v) return [];
  const arr = Array.isArray(vlans) ? vlans : Array.from(vlans);
  if (v === 'all') return arr;
  const requested = new Set(
    String(sviVlanVal).split(',').map(function(s) {
      s = s.trim();
      const nv = s.match(/^nv(\d+)$/i);  // nv<N> → VLAN N
      return nv ? parseInt(nv[1], 10) : parseInt(s, 10);
    }).filter(function(n) { return !isNaN(n); })
  );
  return arr.filter(x => requested.has(parseInt(x, 10)));
}

/**
 * Parses vrf_ into an ordered array.
 * Single value  → ['VRF_A']        (legacy, same VRF for all VLANs)
 * Comma list    → ['VRF_A','VRF_B'] (per-VLAN mapping, positional)
 * Empty/null    → []
 */
function _parseVrfList(vrfVal) {
  if (!vrfVal) return [];
  return String(vrfVal).split(',').map(function(s) { return s.trim(); }).filter(Boolean);
}

/**
 * Resolves the effective VRF for a given VLAN index from a vrfList.
 * vrfList=[]        → null (no VRF assigned via sheet)
 * vrfList=['A']     → 'A' (single, applies to all)
 * vrfList=['A','B'] → vrfList[idx] or null if out of bounds
 */
function _resolveVrfAtIndex(vrfList, idx) {
  if (!vrfList || vrfList.length === 0) return null;
  if (vrfList.length === 1) return vrfList[0];
  return vrfList[idx] || null;
}

/**
 * Pure helper — scan sheet data rows for per-VLAN VRF issues.
 * Extracted from auditSchemaVsSheet() so it can be unit-tested.
 *
 * @param {Array[]} rows         — data rows to check (sheet data starting after the header, i.e. data.slice(2))
 * @param {string[]} headers     — flat header row (data[1] mapped to strings)
 * @param {Array}    aristaDevices — [{name, type}] already filtered to non-'non-arista'
 * @param {number}   [rowOffset] — sheet row number of the first element in rows (default 3)
 * @returns {{sev:string, msg:string}[]}
 */
function _auditVrfIssues(rows, headers, aristaDevices, rowOffset) {
  const offset = (rowOffset !== undefined) ? rowOffset : 3;
  const issues = [];

  rows.forEach(function(rowData, i) {
    const rowNum = offset + i;
    aristaDevices.forEach(function(dv) {
      const devName = dv.name;
      const getCol = function(key) {
        const idx = headers.indexOf(key + '_' + devName);
        return idx >= 0 ? String(rowData[idx] || '').trim() : '';
      };

      const vrfRaw  = getCol('vrf');
      const vlanRaw = getCol('vlan');
      const sviRaw  = getCol('svi_vlan');
      const mode    = getCol('sp_mode').toLowerCase();
      if (!vrfRaw) return;

      const vrfList = _parseVrfList(vrfRaw);
      if (vrfList.length <= 1) return; // single VRF always valid

      const label = 'Row ' + rowNum + ' / ' + devName;
      const isSubInt   = mode.includes('-sub-int');
      const isTrunk    = mode === 'l2-et-trunk' || mode === 'l2-po-trunk';
      const isAccess   = mode === 'l2-et-access' || mode === 'l2-po-access';
      const isL3Routed = mode === 'l3-et-int' || mode === 'l3-po-int';

      // Wrong mode — multi-VRF has no effect
      if (isAccess || isL3Routed) {
        issues.push({ sev: 'warn', msg: label + ': multi-VRF has no effect on ' + mode + ' (only sub-int and l2-trunk SVIs use per-VLAN VRF)' });
        return;
      }

      // Range in vlan_ — positional mapping is ambiguous
      const hasRange = vlanRaw.includes('-');
      const hasList  = vlanRaw.includes(',');
      if (hasRange) {
        const detail = hasList ? 'mixed range+list (e.g. 10-20,25)' : 'range (e.g. 10-20)';
        issues.push({ sev: 'warn', msg: label + ': expand VLAN ' + detail + ' before using per-VLAN VRF — positional mapping is ambiguous with ranges' });
        return;
      }

      if (isSubInt) {
        // nv<N> tokens don't generate sub-interfaces — exclude them from the count
        const pvSub = parseVlanWithNative(vlanRaw);
        const vlanList = String(pvSub.vlans || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean);
        if (vrfList.length !== vlanList.length) {
          issues.push({ sev: 'error', msg: label + ': sub-int VRF count (' + vrfList.length + ') must match VLAN count (' + vlanList.length + ') — got vlan=' + vlanRaw + ', vrf=' + vrfRaw });
        }
      } else if (isTrunk) {
        const sviNorm  = sviRaw.toLowerCase();
        const sviIsAll = sviNorm === 'all' || sviNorm === 'yes' || sviNorm === '1' || sviNorm === 'true';

        if (!sviRaw) {
          issues.push({ sev: 'warn', msg: label + ': multi-VRF on trunk but svi_vlan is empty — no SVIs will be created, VRF list has no effect' });
        } else if (sviIsAll) {
          const pv = parseVlanWithNative(vlanRaw);
          const expanded = Array.from(expandVlanString(String(pv.vlans || '')));
          if (pv.native) expanded.push(String(pv.native));
          if (vrfList.length !== expanded.length) {
            issues.push({ sev: 'error', msg: label + ': trunk SVI VRF count (' + vrfList.length + ') must match VLAN count (' + expanded.length + ') when svi_vlan=all — got vlan=' + vlanRaw + ', vrf=' + vrfRaw });
          }
        } else {
          const sviList = sviRaw.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
          if (vrfList.length !== sviList.length) {
            issues.push({ sev: 'error', msg: label + ': trunk SVI VRF count (' + vrfList.length + ') must match svi_vlan count (' + sviList.length + ') — got svi_vlan=' + sviRaw + ', vrf=' + vrfRaw });
          }
        }
      }
    });
  });

  return issues;
}

/* REPLACE IN Code.gs */
function getDeviceConfig(deviceName) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_DATA);
    if (!sheet) return { error: "Sheet '" + SHEET_DATA + "' not found" };

    const data = sheet.getDataRange().getValues();
    const headers = data[1];
    const rows = data.slice(2);

    const targetColIndex = headers.indexOf("int_" + deviceName);
    if (targetColIndex === -1) return { error: "Device '" + deviceName + "' not found" };

    // 1. Calculate Topology (Single Source of Truth)
    const topo = calculateGlobalTopology(data, headers);

    // 1a. Apply explicit MLAG peer declarations (overrides topology heuristic).
    // Only MLAG pair declaration is replaced — peer-link port is still found from
    // globalLinkMap (direct link between the two declared peers).
    const explicitMlagPeers = getDeviceMlagPeers();
    if (Object.keys(explicitMlagPeers).length > 0) {
      // Replace mlagPeerMap entirely with explicit declarations.
      topo.mlagPeerMap = explicitMlagPeers;

      // Rebuild peerLinkPorts: for each explicit pair, find the direct link
      // between the two devices in globalLinkMap and tag those ports.
      topo.peerLinkPorts = new Set();
      const processedPairs = new Set();
      Object.entries(explicitMlagPeers).forEach(([devA, devB]) => {
        const pairKey = [devA, devB].sort().join('|');
        if (processedPairs.has(pairKey)) return;
        processedPairs.add(pairKey);
        topo.globalLinkMap.forEach((val, key) => {
          if (key.startsWith(devA + ':') && val.dev === devB) topo.peerLinkPorts.add(key);
          if (key.startsWith(devB + ':') && val.dev === devA) topo.peerLinkPorts.add(key);
        });
      });

      // Rebuild mlagConfigPorts: for each explicit pair, find shared PO bundles
      // (both devices appear as keys in the same poMap entry — same PO toward a common upstream).
      topo.mlagConfigPorts = new Set();
      Object.entries(explicitMlagPeers).forEach(([devA, devB]) => {
        if (!topo.poMap) return;
        Object.entries(topo.poMap).forEach(([poName, devConnections]) => {
          if (devConnections[devA] && devConnections[devB]) {
            topo.mlagConfigPorts.add(devA + ':' + poName);
            topo.mlagConfigPorts.add(devB + ':' + poName);
          }
        });
      });
    }

    const indices = getColumnIndices(headers, deviceName);
    const ipPrefs = getIpPreferences() || {};
    const settings = getNetworkSettings();

    // FEATURE FLAGS (derived from per-family settings flags)
    const isBgp  = settings.bgp_ipv4 || settings.bgp_ipv6 || settings.bgp_ipv6_unnum || settings.bgp_rfc5549;
    const isOspf = settings.ospf_ipv4 || settings.ospf_ipv6 || settings.ospf_ipv6_unnum;

    const allDevices = getExistingDevices() || [];
    const targetDeviceObj = allDevices.find(d => d.name === deviceName);
    const deviceSheetIndex = targetDeviceObj ? targetDeviceObj.sheetIndex : 1;

    // Device role gates VXLAN/EVPN generation.
    // Only LEAF/SPINE get VXLAN+EVPN. All other roles (HARNESS, unset, etc.) get BGP underlay only.
    const deviceRole = ((targetDeviceObj && targetDeviceObj.role) || '').toUpperCase();
    const isEvpnDevice = deviceRole === 'LEAF' || deviceRole === 'SPINE';
    const isVxlanDevice = deviceRole === 'LEAF' || deviceRole === 'SPINE';
    const isVxlan = (settings.vxlan_ipv4 || settings.vxlan_ipv6) && isVxlanDevice;
    const isEvpn  = (settings.evpn_ipv4  || settings.evpn_ipv6)  && isEvpnDevice;

    // Build peer-role map for BGP generation (used to skip OVERLAY sessions toward HARNESS peers)
    const peerRoles = {};
    allDevices.forEach(d => { peerRoles[d.name] = (d.role || '').toUpperCase(); });

    // 2. Detect MLAG State
    const mlagState = detectMlagState(deviceName, deviceSheetIndex, rows, indices, targetColIndex, topo, allDevices, isVxlan, settings, deviceRole === 'LEAF');
    const devData = collectDeviceData(rows, headers, targetColIndex, deviceName, topo.mlagPeerMap);
    // Pre-compute VTEP leaves for static flood list (only computed when VXLAN is enabled)
    const vtepNames = isVxlan ? computeVtepNames(allDevices, rows, headers, topo) : new Set();

    // --- 3. AGGREGATE PORT-CHANNEL NEIGHBORS ---
    const poRemoteMlagMap = {};
    const tempPoNeighborSets = {};

    rows.forEach(row => {
      const portName = row[targetColIndex];
      if (isValidPort(portName)) {
        const pName = canonicalizeInterface(portName);
        const details = extractDetails(row, indices);
        const poVal = normalizePo(details.po_);

        const peerEntry = topo.globalLinkMap.get(deviceName + ":" + pName);
        if (poVal && peerEntry) {
          const neighbor = peerEntry.dev;
          if (!tempPoNeighborSets[poVal]) tempPoNeighborSets[poVal] = new Set();
          tempPoNeighborSets[poVal].add(neighbor);

          const neighborPartner = topo.mlagPeerMap[neighbor];
          if (neighborPartner) {
            tempPoNeighborSets[poVal].add(neighborPartner);
          }
        }
      }
    });

    Object.keys(tempPoNeighborSets).forEach(po => {
      const neighbors = Array.from(tempPoNeighborSets[po]).sort();
      if (neighbors.length >= 2) {
        poRemoteMlagMap[po] = neighbors.join(" & ");
      } else if (neighbors.length === 1) {
        poRemoteMlagMap[po] = neighbors[0];
      }
    });

    const configMap = {};
    const eosHostname = (targetDeviceObj && targetDeviceObj.hostname) ? targetDeviceObj.hostname : deviceName;

    // [SECTION 000] GLOBAL
    configMap["000_GLOBAL"] = {
      full: `hostname ${eosHostname}\n!\n` + generateGlobalBlock(isEvpnDevice, settings, mlagState.isActive, deviceRole === 'LEAF'),
      blockStatus: mlagState.isActive ? "MLAG Active" : "Standalone"
    };

    // [SECTION 001] SYSTEM
    const sysBlock = generateSystemBlocks(deviceSheetIndex, Array.from(devData.vrfs), Array.from(devData.allVlans), settings, ipPrefs);
    configMap["001_SYSTEM"] = {
      full: "!--- SYSTEM CONFIG ---\n" + sysBlock + "\n!--------------------",
      blockStatus: "System"
    };

    // [SECTION 055] VXLAN CONFIGURATION
    if (isVxlan) {
      // Condition 1: Must have P2P links (to be part of the fabric)
      if (devData.hasP2p) {
        // Condition 2: Must have Gateway VLANs (SVIs) to be a VTEP
        if (devData.gwVlans.size > 0) {
          // -> IT IS A LEAF (VTEP)
          let peerIdForVxlan = mlagState.isActive ? mlagState.peerId : deviceSheetIndex;
          configMap["055_VXLAN"] = {
            full: generateVxlanBlock(
              mlagState.isActive,
              deviceSheetIndex,
              peerIdForVxlan,
              devData.gwVlans,
              allDevices,
              deviceName,
              topo,
              data,
              headers,
              isEvpn,
              parseInt(ipPrefs.vni_base) || 10000,
              vtepNames,
              settings,
              ipPrefs
            ),
            blockStatus: "VXLAN Active"
          };
        } else {
          // -> Role is LEAF/SPINE but no GW VLANs configured — behaves as underlay router
          configMap["055_VXLAN"] = {
            full: `! VXLAN Skipped: ${deviceRole} has no Gateway VLANs configured (no Vx1/SVI rows)\n!`,
            blockStatus: "Skipped (No GW VLANs)"
          };
        }
      } else {
        // -> NO P2P LINKS (L2 Switch)
        configMap["055_VXLAN"] = {
          full: "! VXLAN Skipped: No P2P interfaces configured\n!",
          blockStatus: "Skipped (No Uplinks)"
        };
      }
    } else if (!isVxlanDevice) {
      // -> ROLE NOT LEAF/SPINE
      configMap["055_VXLAN"] = {
        full: "! VXLAN Skipped: No LEAF/SPINE role configured\n!",
        blockStatus: "Disabled (No Role)"
      };
    } else {
      // -> ROLE IS LEAF/SPINE BUT VXLAN DISABLED IN TECH SETTINGS
      configMap["055_VXLAN"] = {
        full: "! VXLAN Skipped: Feature Disabled in Tech Settings\n!",
        blockStatus: "Disabled"
      };
    }

    // --- INTERFACE GENERATION ---
    const deviceSeenPos = new Set();

    // AP VLAN GW: pre-collect ALL vx1 rows (one per VRF/VLAN group) before main loop.
    // Each row may have different vlan_ and vrf_. deviceSeenPos is pre-marked so the
    // main loop skips all Vx1 rows — only vlan_ and svi_vlan_ fields are used.
    const vx1Entries = [];
    rows.forEach(row => {
      if (isValidPort(row[targetColIndex]) && canonicalizeInterface(row[targetColIndex]) === "Vx1") {
        const d = extractDetails(row, indices);
        d.sheetIndex = deviceSheetIndex;
        vx1Entries.push(d);
      }
    });
    // vx1VlanSet: VLANs claimed by Vx1 rows — excluded from front-panel SVI generation
    // (vx1 takes precedence when the same VLAN appears on both vx1 and a front-panel port)
    const vx1VlanSet = new Set();
    if (vx1Entries.length > 0) {
      deviceSeenPos.add("Vx1");
      const cfg2 = ipPrefs || getIpPreferences();
      const isEvpnActive = settings && (settings.evpn_ipv4 || settings.evpn_ipv6);
      const gwType = (settings && settings.gw_l3_type) || 'anycast';
      const gwHasIpv6vx1 = !settings || settings.gw_ipv6;
      const sviLines = [];
      vx1Entries.forEach(d => {
        const _pvAp = parseVlanWithNative(d.vlan_);
        const apVlans = expandVlanString(String(_pvAp.vlans || ""));
        if (_pvAp.native) apVlans.add(parseInt(_pvAp.native));
        const apSviVlans = _parseSviVlans(d.svi_vlan_, Array.from(apVlans));
        const apVrfList = _parseVrfList(d.vrf_);
        if (apSviVlans.length > 0) {
          apSviVlans.forEach((v, i) => {
            vx1VlanSet.add(parseInt(v));
            const oct2 = Math.floor(v / 100);
            const oct3 = v % 100;
            const effectiveVrf = _resolveVrfAtIndex(apVrfList, i);
            const desc = effectiveVrf ? `ANYCAST_GW_${effectiveVrf}_${v}` : `ANYCAST_GW_${v}`;
            // GW command: anycast (ip address virtual) vs VARP (ip address + ip virtual-router address)
            const useAnycast = isEvpnActive && gwType !== 'varp';
            // VARP needs a unique physical IP before ip virtual-router address.
            // Use gwLast + deviceSheetIndex (same pattern as MLAG path) to ensure physical ≠ virtual.
            const vx1PhySuffixV4 = parseInt(cfg2.gw_v4_last) + deviceSheetIndex;
            const vx1PhySuffixV6 = parseInt(cfg2.gw_v6_last) + deviceSheetIndex;
            const gwCmdV4 = useAnycast
              ? ` ip address virtual ${cfg2.gw_v4_first}.${oct2}.${oct3}.${cfg2.gw_v4_last}${cfg2.gw_v4_mask}`
              : ` ip address ${cfg2.gw_v4_first}.${oct2}.${oct3}.${vx1PhySuffixV4}${cfg2.gw_v4_mask}\n ip virtual-router address ${cfg2.gw_v4_first}.${oct2}.${oct3}.${cfg2.gw_v4_last}`;
            const gwCmdV6 = gwHasIpv6vx1
              ? (useAnycast
                  ? ` ipv6 address virtual ${cfg2.gw_v6_first}:${oct2}:${oct3}::${cfg2.gw_v6_last}${cfg2.gw_v6_mask}`
                  : ` ipv6 address ${cfg2.gw_v6_first}:${oct2}:${oct3}::${vx1PhySuffixV6}${cfg2.gw_v6_mask}\n ipv6 virtual-router address ${cfg2.gw_v6_first}:${oct2}:${oct3}::${cfg2.gw_v6_last}`)
              : null;
            sviLines.push([
              "!",
              `interface Vlan${v}`,
              effectiveVrf ? ` vrf ${effectiveVrf}` : null,
              ` description ${desc} #TA`,
              gwCmdV4,
              useAnycast && gwHasIpv6vx1 ? ` default ipv6 address virtual` : null,
              !useAnycast && gwHasIpv6vx1 ? ` no ipv6 address` : null,
              gwCmdV6,
            ].filter(Boolean).join("\n"));
          });
        }
      });
      if (sviLines.length > 0) {
        configMap["050_Vx1"] = { full: sviLines.join("\n"), blockStatus: "AP VLAN SVI" };
      }
    }

    // --- PRE-COMPUTE SNAKE PAIRS (needed before main loop for TRAFFIC_IN/OUT VRF assignment) ---
    const snakeIntColIdx = headers.indexOf("snake_int_" + deviceName);
    const snakePairsForStatic = [];
    if (snakeIntColIdx !== -1) {
      rows.forEach(row => {
        const primaryRaw = row[targetColIndex];
        const secondaryRaw = row[snakeIntColIdx];
        if (!isValidPort(primaryRaw) || !isValidPort(secondaryRaw)) return;
        const det = extractDetails(row, indices);
        if (!(det.ip_type_ || "").toLowerCase().includes("p2p")) return;
        const vlans = Array.from(expandVlanString(String(det.vlan_ || "")));
        const vlan = vlans.length > 0 ? parseInt(vlans[0]) : 0;
        if (!vlan) return;
        snakePairsForStatic.push({
          primaryPort: canonicalizeInterface(primaryRaw),
          secondaryPort: canonicalizeInterface(secondaryRaw),
          vlan: vlan
        });
      });
      snakePairsForStatic.sort((a, b) => {
        const numA = parseInt((/(\d+)/.exec(a.primaryPort) || [0, 0])[1]);
        const numB = parseInt((/(\d+)/.exec(b.primaryPort) || [0, 0])[1]);
        return numA - numB;
      });
    }
    const snakeFirstPrimary = snakePairsForStatic.length > 0 ? snakePairsForStatic[0].primaryPort : '';
    const snakeLastSecondary = snakePairsForStatic.length > 0 ? snakePairsForStatic[snakePairsForStatic.length - 1].secondaryPort : '';
    let foundEP1 = false, foundEP2 = false;

    rows.forEach(row => {
      const portName = row[targetColIndex];
      if (isValidPort(portName)) {
        const pName = canonicalizeInterface(portName);
        if (deviceSeenPos.has(pName)) return;
        deviceSeenPos.add(pName);

        const details = extractDetails(row, indices);
        details.sheetIndex = deviceSheetIndex;

        // EP1/EP2 detection via description field
        const desc = (details.desc_ || '').trim();
        if (desc === 'TRAFFIC_SNAKE_EP1_L3' && snakeFirstPrimary) {
          details.ixiaRole = 'in';
          details.snakeFirstPrimary = snakeFirstPrimary;
          foundEP1 = true;
        } else if (desc === 'TRAFFIC_SNAKE_EP2_L3' && snakeLastSecondary) {
          details.ixiaRole = 'out';
          details.snakeLastSecondary = snakeLastSecondary;
          foundEP2 = true;
        }
        const poVal = normalizePo(details.po_);

        const linkInfo = topo.globalLinkMap.get(deviceName + ":" + pName);
        if (linkInfo) {
          details.peerDev = linkInfo.dev;
          details.peerPort = linkInfo.port;
          if (linkInfo.isSelfLoop) details.isSnakePrimary = true;
        }

        if (poVal && poRemoteMlagMap[poVal]) {
          details.remoteMlagPair = poRemoteMlagMap[poVal];
        }

        // [CRITICAL] Use Title Case Keys (e.g. "Leaf1:Po10") to match Topology Engine
        if (poVal) {
          const poKey = deviceName + ":" + poVal;
          if (hasKey(topo.mlagConfigPorts, poKey)) details.isMlag = true;
          if (hasKey(topo.peerLinkPorts, poKey)) details.isPeerLink = true;
        } else {
          const pKey = deviceName + ":" + pName;
          if (hasKey(topo.peerLinkPorts, pKey)) details.isPeerLink = true;
        }

        {
          const cfg = generateConfig(pName, details, ipPrefs, deviceSeenPos, settings, vx1VlanSet);
          if (pName.startsWith("Po")) {
            configMap["060_" + pName] = { full: cfg, blockStatus: "Logical" };
          } else {
            configMap["050_" + pName] = { full: cfg, blockStatus: "Physical" };
          }
        }
      }
    });

    // [SNAKE SECONDARY] Generate interface config for snake secondary ports
    // (Secondary ports live in snake_int_ column — not iterated by the main rows loop)
    // snakeIntColIdx and snakePairsForStatic are pre-computed above the main rows loop
    if (snakeIntColIdx !== -1) {
      rows.forEach(row => {
        const primaryRaw = row[targetColIndex];
        const secondaryRaw = row[snakeIntColIdx];
        if (!isValidPort(primaryRaw) || !isValidPort(secondaryRaw)) return;
        const secondaryPort = canonicalizeInterface(secondaryRaw);
        if (deviceSeenPos.has(secondaryPort)) return;
        deviceSeenPos.add(secondaryPort);
        const det = extractDetails(row, indices);
        det.sheetIndex = deviceSheetIndex;
        det.isSnakeSecondary = true;
        det.isSnakePrimary = false;
        // Peer info: secondary's peer is the primary on the same device
        const snakeLinkEntry = topo.globalLinkMap.get(deviceName + ":" + secondaryPort);
        if (snakeLinkEntry) { det.peerDev = snakeLinkEntry.dev; det.peerPort = snakeLinkEntry.port; }
        const cfg2 = generateConfig(secondaryPort, det, ipPrefs, deviceSeenPos, settings, vx1VlanSet);
        configMap["050_" + secondaryPort] = { full: cfg2, blockStatus: "Physical (Snake Secondary)" };
      });
    }

    // [SECTION 080] SNAKE VRF CHAIN (static ARP + egress-vrf routes)
    // snakePairsForStatic already sorted and computed above
    if (snakePairsForStatic.length > 0) {
      const missing = [];
      if (!ipPrefs.bridge_mac) missing.push('Bridge MAC');
      if (!foundEP1) missing.push('TRAFFIC_SNAKE_EP1_L3 desc');
      if (!foundEP2) missing.push('TRAFFIC_SNAKE_EP2_L3 desc');
      const nhWarn = (!ipPrefs.ep1_nh || !ipPrefs.ep2_nh)
        ? ' [EP1/EP2 NH not set — direct-connect assumed; fill in if not directly connected]' : '';
      configMap["080_SNAKE"] = {
        full: generateSnakeStaticConfig(snakePairsForStatic, ipPrefs),
        blockStatus: missing.length
          ? `Snake VRF Chain (${missing.join(', ')} missing)`
          : `Snake VRF Chain${nhWarn}`
      };
      // [SECTION 081] SNAKE TTL — PBR
      configMap["081_SNAKE_PBR"] = {
        full: generateSnakeTtlPbrConfig(snakePairsForStatic),
        blockStatus: "Snake TTL Reset (PBR)"
      };
      // [SECTION 082] SNAKE TTL — Traffic Policy
      configMap["082_SNAKE_TRAFFIC_POLICY"] = {
        full: generateSnakeTtlTrafficPolicyConfig(snakePairsForStatic),
        blockStatus: "Snake TTL Reset (Traffic Policy)"
      };
    }

    // [SECTION 070] MLAG
    if (mlagState.isActive) {
      configMap["070_MLAG"] = { full: mlagState.mlagConfigBlock, blockStatus: "MLAG Active" };
    } else {
      configMap["070_MLAG"] = {
        full: "! MLAG Skipped: No MLAG role configured (Standalone Mode)\n!",
        blockStatus: "Skipped (Standalone)"
      };
    }

    // [SECTION 090] OSPF v2 UNDERLAY
    if (settings.ospf_ipv4) {
      const hasP2pForOspf = Object.values(mlagState.bgpNeighbors).some(
        p => p.peerParams && p.peerParams.some(pp => !pp.isMlag)
      );
      if (hasP2pForOspf) {
        configMap["090_OSPF_UNDERLAY"] = {
          full: generateOSPF(deviceSheetIndex, mlagState.bgpNeighbors, ipPrefs),
          blockStatus: "OSPFv2 Underlay"
        };
      } else {
        configMap["090_OSPF_UNDERLAY"] = {
          full: "! OSPFv2 Underlay Skipped: No P2P interfaces configured\n!",
          blockStatus: "Skipped"
        };
      }
    } else {
      configMap["090_OSPF_UNDERLAY"] = {
        full: "! OSPFv2 Underlay Skipped: Feature Disabled in Tech Settings\n!",
        blockStatus: "Disabled"
      };
    }

    // [SECTION 091] OSPF v3 UNDERLAY
    if (settings.ospf_ipv6) {
      const hasP2pForOspf3 = Object.values(mlagState.bgpNeighbors).some(
        p => p.peerParams && p.peerParams.some(pp => !pp.isMlag)
      );
      if (hasP2pForOspf3) {
        configMap["091_OSPF3_UNDERLAY"] = {
          full: generateOSPFv3(deviceSheetIndex, mlagState.bgpNeighbors, ipPrefs),
          blockStatus: "OSPFv3 Underlay"
        };
      } else {
        configMap["091_OSPF3_UNDERLAY"] = {
          full: "! OSPFv3 Underlay Skipped: No P2P interfaces configured\n!",
          blockStatus: "Skipped"
        };
      }
    }

    // [SECTION 100] BGP UNDERLAY / BGP EVPN OVERLAY
    if (isBgp) {
      // Full BGP underlay (+ EVPN overlay if enabled)
      const bgpKey = isEvpn ? "100_BGP_EVPN" : "100_BGP_UNDERLAY";
      if (Object.keys(mlagState.bgpNeighbors).length > 0) {
        configMap[bgpKey] = {
          full: generateBGP(deviceSheetIndex, deviceName, mlagState.bgpNeighbors, devData.gwVlans, isEvpn, deviceRole, peerRoles, settings, ipPrefs),
          blockStatus: isEvpn ? "Routing + Overlay" : "Routing (Underlay Only)"
        };
      } else {
        configMap[bgpKey] = {
          full: isEvpn
            ? "! BGP EVPN Skipped: No P2P interfaces configured\n!"
            : "! BGP Underlay Skipped: No P2P interfaces configured\n!",
          blockStatus: "Skipped"
        };
      }
    } else if (isOspf && isEvpn) {
      // OSPF underlay + BGP EVPN overlay only
      if (Object.keys(mlagState.bgpNeighbors).length > 0) {
        configMap["100_BGP_EVPN"] = {
          full: generateBGPEvpnOverlay(deviceSheetIndex, deviceName, mlagState.bgpNeighbors, devData.gwVlans, peerRoles, settings, ipPrefs),
          blockStatus: "BGP EVPN Overlay (over OSPF)"
        };
      } else {
        configMap["100_BGP_EVPN"] = {
          full: "! BGP EVPN Overlay Skipped: No P2P interfaces configured\n!",
          blockStatus: "Skipped"
        };
      }
    } else {
      configMap["100_BGP_UNDERLAY"] = {
        full: "! BGP Underlay Skipped: Feature Disabled in Tech Settings\n!",
        blockStatus: "Disabled"
      };
    }

    // This ensures that after the interface/BGP commands,
    // the switch remains in config mode and saves the state.
    configMap["999_EOF"] = {
      full: "configure\nwrite memory",
      blockStatus: "EOF"
    };

    return { config: configMap };

  } catch (e) {
    return { error: "Config Engine Error: " + e.message };
  }
}

function generateSystemBlocks(deviceId, vrfs, vlans, netSettings, ipPrefs) {
  // Safety: Ensure inputs are Arrays
  const safeVrfs = Array.isArray(vrfs) ? vrfs : [];
  const safeVlans = Array.isArray(vlans) ? vlans : [];
  // P2P IPv6 → gates Lo0 IPv6 address and IPv6 router-id (used by underlay protocols)
  const hasP2pIpv6 = !netSettings || netSettings.int_ipv6 || netSettings.int_ipv6_unnum;
  // Any IPv6 (P2P or GW) → gates VRF ipv6 unicast-routing
  const hasAnyIpv6 = hasP2pIpv6 || !!(netSettings && netSettings.gw_ipv6);

  let lines = [];

  // System IDs
  const loBase = parseInt(ipPrefs && ipPrefs.lo_base) || 0;
  const loId = deviceId + loBase;
  lines.push(`! System IDs (Derived from ID: ${deviceId}${loBase ? ` + base ${loBase}` : ''})`);
  lines.push(`interface Loopback0`);
  lines.push(` ip address ${loId}.${loId}.${loId}.${loId}/32`);
  if (hasP2pIpv6) {
    lines.push(` no ipv6 address`);
    lines.push(` ipv6 address ${loId}:${loId}:${loId}::${loId}/128`);
  }
  lines.push(`!`);
  lines.push(`router general`);
  lines.push(` router-id ipv4 ${loId}.${loId}.${loId}.${loId}`);
  if (hasP2pIpv6) {
    lines.push(` router-id ipv6 ${loId}:${loId}:${loId}::${loId}`);
  }
  lines.push(`!`);

  // VRFs
  if (safeVrfs.length > 0) {
    // Filter undefined/null inside the array
    safeVrfs.filter(v => v).forEach(v => {
      lines.push(`vrf instance ${v}`);
      lines.push(`ip routing vrf ${v}`);
      if (hasAnyIpv6 && !v.startsWith('SNAKE_')) lines.push(`ipv6 unicast-routing vrf ${v}`);
      lines.push(`!`);
    });
  } else {
    lines.push(`! No VRFs found`);
  }
  lines.push(`!`);

  // VLANs
  lines.push(`! VLAN Configuration`);
  lines.push(`default vlan 1-4094`);
  lines.push(`!`);

  if (safeVlans.length > 0) {
    // Filter valid numbers
    const validVlans = safeVlans.filter(v => !isNaN(v) && v > 0);
    if (validVlans.length > 0) {
      // Sort and compact
      validVlans.sort((a, b) => a - b);
      let ranges = [];
      let start = validVlans[0];
      let prev = start;
      for (let i = 1; i < validVlans.length; i++) {
        if (validVlans[i] !== prev + 1) {
          ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
          start = validVlans[i];
        }
        prev = validVlans[i];
      }
      ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
      lines.push(`vlan ${ranges.join(",")}`);
    }
  }
  lines.push(`!`);

  return lines.join("\n");
}

/**
* Generates configuration for an interface.
* REFACTORED: Implements strict 9-rule description logic.
*/
function generateConfig(portName, d, ipPrefs, seenPos, netSettings, vx1VlanSet) {
  // vx1VlanSet is optional — callers inside getDeviceConfig pass the real Set;
  // callers from getTopologyData (config tooltips) pass nothing, so default to empty.
  vx1VlanSet = vx1VlanSet || new Set();
  const isSubInt = String(portName).includes(".");
  const poVal = normalizePo(d.po_) || ""; // Local Port-Channel Name (e.g. Po10)
  const hasPo = (poVal !== "");
  const mode = String(d.sp_mode_ || "").toLowerCase();

  let cfg = "interface " + portName + "\n";

  // ==========================================
  // 1. PHYSICAL INTERFACE CONFIG
  // ==========================================
  if (!isSubInt && !portName.toLowerCase().startsWith("po")) {
    if (d.et_speed_) cfg += " speed " + d.et_speed_ + "\n";
    if (d.encoding_ && portName.startsWith("Et")) cfg += " error-correction encoding " + d.encoding_ + "\n";

    // --- DESCRIPTION LOGIC (PHYSICAL) ---
    // Rule 1: Manual Override
    if (d.desc_ && d.desc_.trim() !== "") {
      cfg += " description " + d.desc_.replace(/"/g, '') + " #TA\n";
    }
    else if (d.peerDev && d.peerPort) {
      let desc = "";

      // Rule 4, 6, 8: Child of Po (Regular OR MLAG OR PeerLink)
      // Format: -> Leaf2-Et1-Po10 (PeerDev-PeerPort-LocalPo)
      if (hasPo) {
        desc = `${d.peerDev}-${d.peerPort}-${poVal}`;
      }
      // Rule 3: Physical Peer Link (Standalone)
      // Format: -> Leaf2-Et1-MLAG-PEER-LINK
      else if (d.isPeerLink) {
        desc = `${d.peerDev}-${d.peerPort}-MLAG-PEER-LINK`;
      }
      // Rule 2: Regular Physical
      // Format: -> Leaf2-Et1
      else {
        desc = `${d.peerDev}-${d.peerPort}`;
      }

      cfg += ` description -> ${desc} #TA\n`;
    }
    // Rule 10: No desc, no peer — mark ownership only
    else {
      cfg += " description #TA\n";
    }

    // Physical Member Config
    if (hasPo) {
      const poNum = poVal.replace(/\D/g, '');
      cfg += " channel-group " + poNum + " mode active\n";
    }
    // REMOVED: 'else if (d.isPeerLink)' check here.
    // Trunk groups belong on the logical interface (Po) or will be handled
    // by generateAttributesBlock if this is a standalone interface.
  }

  // ==========================================
  // 2. PORT-CHANNEL INTERFACE CONFIG
  // ==========================================
  if (hasPo) {
    if (!seenPos || !seenPos.has(poVal)) {
      if (seenPos) seenPos.add(poVal);

      // [GUARD] STRICT ARISTA LOGIC: MLAG + ANY L3 MODE IS INVALID
      if (d.isMlag && mode.startsWith("l3")) {
        return `!\ninterface ${poVal}\n !! ERROR: INVALID CONFIGURATION !!\n !! MLAG member '${portName}' cannot use L3 mode '${mode}'.\n !! Action: Change mode to L2 (switchport).\n!\n`;
      }

      cfg += "!\ninterface " + poVal + "\n";

      // --- DESCRIPTION LOGIC (PORT-CHANNEL) ---
      // Rule 1: Manual Override (Implicit for POs too)
      if (d.desc_ && d.desc_.trim() !== "") {
        cfg += " description " + d.desc_ + " #TA\n";
      }
      else if (d.poGroup) {
        let finalDesc = "";

        // Calculate Neighbor String (Rule 5 & 7)
        // Rule 5: "Leaf2" | Rule 7: "Leaf2 & Leaf3"
        let neighbors = "";
        if (d.poGroup.peerDevs && d.poGroup.peerDevs.length > 0) {
          const unique = [...new Set(d.poGroup.peerDevs)];
          neighbors = unique.sort().join(" & ");
        } else if (d.poGroup.peerDev) {
          neighbors = d.poGroup.peerDev;
        }

        // Get Remote PO Name (e.g. Po10)
        const remotePo = d.poGroup.peerPo || "Po??";

        // Rule 9: MLAG Peer Link
        // Format: -> Leaf2-Po10-MLAG-PEER-LINK
        if (d.poGroup.isPeerLink) {
          finalDesc = `${neighbors}-${remotePo}-MLAG-PEER-LINK`;
        }
        // Rule 5 & 7: Regular or MLAG PO
        // Format: -> Leaf2-Po10 OR Leaf2 & Leaf3-Po10
        else {
          finalDesc = `${neighbors}-${remotePo}`;
        }

        if (finalDesc) cfg += ` description -> ${finalDesc} #TA\n`;
      } else if (d.remoteMlagPair) {
        cfg += ` description -> ${d.remoteMlagPair} #TA\n`;
      } else {
        // Rule 11: No group info — mark ownership only
        cfg += " description #TA\n";
      }

      if (d.isMlag) {
        const poNum = poVal.replace(/\D/g, '');
        cfg += " mlag " + poNum + "\n";
      }

      // REMOVED: Duplicate 'switchport trunk group' logic.
      // It is now exclusively handled below by generateAttributesBlock(d)

      cfg += generateAttributesBlock(d);
      cfg += generateComplexL3Block(poVal, d, ipPrefs, netSettings, vx1VlanSet);
    }
  } else {
    // Virtual interfaces (Loopback, Vlan, etc)
    if (!hasPo && !portName.startsWith("Po")) {
      cfg += generateAttributesBlock(d);
      cfg += generateComplexL3Block(portName, d, ipPrefs, netSettings, vx1VlanSet);
    }
  }

  return cfg;
}

/**
* Generates Attribute Block (Switchport, VLANs, Trunk Groups)
* Acts as the SINGLE SOURCE OF TRUTH for trunk group configuration.
*/
function generateAttributesBlock(d) {
  let block = "";
  let sp_mode = String(d.sp_mode_ || "").trim().toLowerCase();

  // Robustly identify Peer Link (Check both Item and Group)
  const isPeerLink = d.isPeerLink === true || (d.poGroup && d.poGroup.isPeerLink === true);

  // 1. Base Layer 2/3 State & Reset VLANs
  if (sp_mode.startsWith("l2")) {
    block += " switchport\n";
    block += " default switchport trunk allowed vlan\n";
    block += " no switchport trunk native vlan\n";
    block += " default switchport access vlan\n";
  } else if (sp_mode.startsWith("l3")) {
    block += " no switchport\n";
  }

  // 2. MLAG PEER-LINK SPECIFIC (High Priority)
  // This centralizes the logic so we don't duplicate "switchport trunk group" commands.
  if (isPeerLink) {
    block += " switchport mode trunk\n";
    block += " switchport trunk group MLAG_PEER\n"; // Correct Text
    return block; // Exit early (Peer links don't need standard trunk/access logic)
  }

  // 3. Standard Mode Configuration
  if (sp_mode.includes("access")) {
    block += " switchport mode access\n";
    const _pvAccess = parseVlanWithNative(d.vlan_);
    if (_pvAccess.vlans) block += ` switchport access vlan ${_pvAccess.vlans}\n`;
  }
  else if (sp_mode.includes("trunk")) {
    block += " switchport mode trunk\n";
    const _pv = parseVlanWithNative(d.vlan_);
    if (_pv.native) block += ` switchport trunk native vlan ${_pv.native}\n`;
    if (_pv.vlans) block += ` switchport trunk allowed vlan ${_pv.vlans}\n`;
  }

  return block;
}

function generateComplexL3Block(portName, d, ipPrefs, netSettings, vx1VlanSet) {
  if (!d.sp_mode_ || !d.vlan_) return "";

  const mode = String(d.sp_mode_).toLowerCase();

  // [GUARD] MLAG + ANY L3 MODE IS INVALID ON ARISTA EOS
  if (d.isMlag && mode.startsWith("l3")) {
    return ` !! IP CONFIG SUPPRESSED: MLAG + L3 IS INVALID ON ARISTA EOS !!\n !! Interface '${portName}' mode '${mode}' cannot coexist with MLAG.\n`;
  }

  // Use provided prefs or fetch defaults
  const cfg = ipPrefs || getIpPreferences();

  // PARSING: Filter for valid numbers only (strip nv<N> token)
  const _pvL3 = parseVlanWithNative(d.vlan_);
  let vlans = String(_pvL3.vlans || "").split(",")
    .map(s => s.trim())
    .filter(s => s !== "" && !isNaN(parseInt(s)));
  // vlansForSvi includes native VLAN so it can receive an SVI too
  const vlansForSvi = _pvL3.native ? vlans.concat([_pvL3.native]) : vlans;

  // ERROR HANDLING
  if (vlans.length === 0) {
    return " ! ERROR: VLAN ID missing or invalid\n";
  }

  const sheetIndex = parseInt(d.sheetIndex) || 1;
  const gwLastV4 = parseInt(cfg.gw_v4_last);
  const gwLastV6 = parseInt(cfg.gw_v6_last);

  // P2P IPv6 mode — fully decoupled from GW
  const p2pHasIpv4       = !netSettings || netSettings.int_ipv4 !== false;   // default true (legacy)
  const p2pUseIpv6Unnum  = !!(netSettings && netSettings.int_ipv6_unnum);
  const p2pUseIpv6Explicit = !p2pUseIpv6Unnum && (!netSettings || netSettings.int_ipv6);

  // GW IPv6 — independent of P2P; null netSettings = backward-compat (explicit)
  const gwHasIpv4 = !netSettings || netSettings.gw_ipv4 !== false;           // default true (legacy)
  const gwHasIpv6 = !netSettings || netSettings.gw_ipv6;                     // explicit flag

  // EVPN GW type — drives ip address virtual vs ip virtual-router address for GW SVIs
  const isEvpnActive  = !!(netSettings && (netSettings.evpn_ipv4 || netSettings.evpn_ipv6));
  const gwL3Type      = (netSettings && netSettings.gw_l3_type) || 'anycast';
  const useAnycastGW  = gwL3Type !== 'varp';   // ip address virtual — works with or without EVPN
  const useVarpGW     = gwL3Type === 'varp';   // ip virtual-router address — works with or without EVPN

  // OSPF flags — suppressed for snake ports (cannot form OSPF adjacency with yourself)
  const addOspfV4 = !!(netSettings && netSettings.ospf_ipv4) && !d.isSnakePrimary && !d.isSnakeSecondary;
  const addOspfV6 = !!(netSettings && netSettings.ospf_ipv6) && !d.isSnakePrimary && !d.isSnakeSecondary;

  // Helper to build the IP config lines.
  // resolvedVrf: per-VLAN VRF override (string or null). When provided, replaces d.vrf_.
  // Omit (undefined) to fall back to d.vrf_ (legacy single-VRF behaviour).
  const getIpBlock = (v, resolvedVrf) => {
    let val = parseInt(v);
    if (isNaN(val)) return "";

    let lines = [];

    // --- VRF assignment priority: IXIA role > snake > per-VLAN resolvedVrf > sheet vrf_ ---
    if (d.ixiaRole === 'in' && d.snakeFirstPrimary) {
      lines.push(` vrf SNAKE_${d.snakeFirstPrimary}`);
    } else if (d.ixiaRole === 'out' && d.snakeLastSecondary) {
      lines.push(` vrf SNAKE_${d.snakeLastSecondary}`);
    } else if (d.isSnakePrimary || d.isSnakeSecondary) {
      lines.push(` vrf SNAKE_${portName}`);
    } else {
      const effectiveVrf = resolvedVrf !== undefined ? resolvedVrf : d.vrf_;
      if (effectiveVrf) lines.push(` vrf ${effectiveVrf}`);
    }

    let ipType = (d.ip_type_ || "").toLowerCase();

    // Calculate 2nd and 3rd octets based on VLAN ID
    let oct2 = Math.floor(val / 100);
    let oct3 = val % 100;

    // A. P2P LINKS
    if (ipType.includes("p2p")) {
      if (d.isSnakePrimary || d.isSnakeSecondary) {
        // VRF chain snake: each port in its own SNAKE_{portName} VRF, .1/24 as host IP.
        // Unique VLAN (audit-enforced) → unique oct2.oct3 subnet per pair.
        // Static ARP maps .2 to bridge-mac; egress-vrf chains ports across loopback cables.
        if (p2pHasIpv4) {
          lines.push(` ip address ${cfg.p2p_v4_first}.${oct2}.${oct3}.1/24`);
        }
        if (p2pUseIpv6Unnum) {
          lines.push(` ipv6 enable`); // unnumbered IPv6 — link-local only (EOS has no 'ipv6 unnumbered' CLI)
        } else if (p2pUseIpv6Explicit) {
          lines.push(` no ipv6 address`);
          lines.push(` ipv6 address ${cfg.p2p_v6_first}:${oct2}:${oct3}::1/64`);
        }
      } else {
        // Regular P2P: last octet = device sheetIndex, configured mask
        if (p2pHasIpv4) {
          lines.push(` ip address ${cfg.p2p_v4_first}.${oct2}.${oct3}.${sheetIndex}${cfg.p2p_v4_mask}`);
        }
        if (p2pUseIpv6Unnum) {
          lines.push(` ipv6 enable`); // unnumbered IPv6 — link-local only (EOS has no 'ipv6 unnumbered' CLI)
        } else if (p2pUseIpv6Explicit) {
          lines.push(` no ipv6 address`);
          lines.push(` ipv6 address ${cfg.p2p_v6_first}:${oct2}:${oct3}::${sheetIndex}${cfg.p2p_v6_mask}`);
        }
      }
    }
    // B. GATEWAY (SVI/Sub-Int/L3-routed)
    // GW type is driven by EVPN settings: anycast (ip address virtual) or VARP (ip virtual-router address)
    else if (ipType.includes("gw")) {
      // Description: ANYCAST_GW_<vrf>_<vlan> when EVPN active and VRF set, else ANYCAST_GW_<vlan>
      if (isEvpnActive) {
        const vrf4Desc = resolvedVrf !== undefined ? resolvedVrf : d.vrf_;
        const gwDesc = vrf4Desc ? `ANYCAST_GW_${vrf4Desc}_${val}` : `ANYCAST_GW_${val}`;
        lines.push(` description ${gwDesc} #TA`);
      }

      if (d.isMlag) {
        if (useAnycastGW) {
          // EVPN anycast: single shared virtual IP — same on all VTEPs, no physical IP needed
          if (gwHasIpv4) lines.push(` ip address virtual ${cfg.gw_v4_first}.${oct2}.${oct3}.${cfg.gw_v4_last}${cfg.gw_v4_mask}`);
          if (gwHasIpv6) { lines.push(` default ipv6 address virtual`); lines.push(` ipv6 address virtual ${cfg.gw_v6_first}:${oct2}:${oct3}::${cfg.gw_v6_last}${cfg.gw_v6_mask}`); }
        } else {
          // MLAG VARP (or no EVPN): per-device physical IP + shared virtual-router address
          // phySuffix = gwLast + sheetIndex guarantees unique-per-peer and ≠ virtual IP
          const phySuffixV4 = gwLastV4 + sheetIndex;
          const phySuffixV6 = gwLastV6 + sheetIndex;
          if (gwHasIpv4) lines.push(` ip address ${cfg.gw_v4_first}.${oct2}.${oct3}.${phySuffixV4}${cfg.gw_v4_mask}`);
          if (gwHasIpv6) { lines.push(` no ipv6 address`); lines.push(` ipv6 address ${cfg.gw_v6_first}:${oct2}:${oct3}::${phySuffixV6}${cfg.gw_v6_mask}`); }
          if (gwHasIpv4) lines.push(` ip virtual-router address ${cfg.gw_v4_first}.${oct2}.${oct3}.${cfg.gw_v4_last}`);
          if (gwHasIpv6) lines.push(` ipv6 virtual-router address ${cfg.gw_v6_first}:${oct2}:${oct3}::${cfg.gw_v6_last}`);
        }
      } else {
        if (useAnycastGW) {
          // Standalone EVPN anycast: ip address virtual (shared across all VTEPs)
          if (gwHasIpv4) lines.push(` ip address virtual ${cfg.gw_v4_first}.${oct2}.${oct3}.${cfg.gw_v4_last}${cfg.gw_v4_mask}`);
          if (gwHasIpv6) { lines.push(` default ipv6 address virtual`); lines.push(` ipv6 address virtual ${cfg.gw_v6_first}:${oct2}:${oct3}::${cfg.gw_v6_last}${cfg.gw_v6_mask}`); }
        } else if (useVarpGW) {
          // Standalone VARP: unique physical IP (gwLast + sheetIndex) + shared virtual-router address.
          // Physical MUST differ from virtual — mirrors MLAG VARP pattern.
          // ip virtual-router mac-address is in the global block (generateGlobalBlock).
          const phySuffixV4 = gwLastV4 + sheetIndex;
          const phySuffixV6 = gwLastV6 + sheetIndex;
          if (gwHasIpv4) lines.push(` ip address ${cfg.gw_v4_first}.${oct2}.${oct3}.${phySuffixV4}${cfg.gw_v4_mask}`);
          if (gwHasIpv6) { lines.push(` no ipv6 address`); lines.push(` ipv6 address ${cfg.gw_v6_first}:${oct2}:${oct3}::${phySuffixV6}${cfg.gw_v6_mask}`); }
          if (gwHasIpv4) lines.push(` ip virtual-router address ${cfg.gw_v4_first}.${oct2}.${oct3}.${cfg.gw_v4_last}`);
          if (gwHasIpv6) lines.push(` ipv6 virtual-router address ${cfg.gw_v6_first}:${oct2}:${oct3}::${cfg.gw_v6_last}`);
        } else {
          // Non-EVPN standalone: legacy behavior (plain ip address)
          if (gwHasIpv4) lines.push(` ip address ${cfg.gw_v4_first}.${oct2}.${oct3}.${cfg.gw_v4_last}${cfg.gw_v4_mask}`);
          if (gwHasIpv6) { lines.push(` no ipv6 address`); lines.push(` ipv6 address ${cfg.gw_v6_first}:${oct2}:${oct3}::${cfg.gw_v6_last}${cfg.gw_v6_mask}`); }
        }
      }
    }

    return lines.join("\n");
  };

  let block = "";

  // Pre-parse per-VLAN VRF list once for this row
  const _vrfList = _parseVrfList(d.vrf_);

  // 1. SVI (Vlan Interface)
  const sviVlans = _parseSviVlans(d.svi_vlan_, vlansForSvi);
  if (mode.startsWith("l2-") && sviVlans.length > 0 && !d.isSnakePrimary && !d.isSnakeSecondary) {
    sviVlans.forEach((v, i) => {
      // vx1 takes precedence: skip SVIs already generated by the Vx1 block
      if (vx1VlanSet && vx1VlanSet.has(parseInt(v))) return;
      block += "!\ninterface Vlan" + v + "\n description #TA\n" + getIpBlock(v, _resolveVrfAtIndex(_vrfList, i)) + "\n";
      if (addOspfV4) {
        block += " ip ospf network point-to-point\n";
        block += " ip ospf area 0.0.0.0\n";
        block += " ip ospf neighbor bfd\n";
      }
      if (addOspfV6) {
        block += " ipv6 ospf 1 area 0.0.0.0\n";
      }
    });
  }
  // 2. Sub-Interfaces (Router on a Stick)
  else if (mode.includes("-sub-int")) {
    const subDesc = (d.peerDev && d.peerPort) ? `-> ${d.peerDev}-${d.peerPort} #TA` : '#TA';
    vlans.forEach((v, i) => {
      block += "!\ninterface " + portName + "." + v + "\n encapsulation dot1q vlan " + v + "\n description " + subDesc + "\n" + getIpBlock(v, _resolveVrfAtIndex(_vrfList, i)) + "\n";
      if (addOspfV4) {
        block += " ip ospf network point-to-point\n";
        block += " ip ospf area 0.0.0.0\n";
        block += " ip ospf neighbor bfd\n";
      }
      if (addOspfV6) {
        block += " ipv6 ospf 1 area 0.0.0.0\n";
      }
    });
  }
  // 3. L3 Routed Interfaces (No Sub-Int)
  else if (mode === "l3-et-int" || mode === "l3-po-int") {
    if (vlans.length > 0) block += getIpBlock(vlans[0]) + "\n";
    if (addOspfV4) {
      block += " ip ospf network point-to-point\n";
      block += " ip ospf area 0.0.0.0\n";
      block += " ip ospf neighbor bfd\n";
    }
    if (addOspfV6) {
      block += " ipv6 ospf 1 area 0.0.0.0\n";
    }
  }

  return block;
}

function collectDeviceData(rows, headers, targetColIndex, deviceName, mlagPeerMap) {
  const allVlans = new Set(); // For System Config (Create VLAN)
  const gwVlans = new Set(); // For VXLAN/EVPN (Map VNI)
  const vrfs = new Set();
  let p2pCount = 0;

  const myMlagPeer = mlagPeerMap ? mlagPeerMap[deviceName] : null;
  let peerIndices = null;
  let peerIntIdx = -1;

  // Indices for Local Device
  const indices = getColumnIndices(headers, deviceName);

  // Indices for Peer Device (to capture shared GW VLANs)
  if (myMlagPeer) {
    peerIndices = getColumnIndices(headers, myMlagPeer);
    peerIntIdx = headers.indexOf("int_" + myMlagPeer);
  }

  const analyzeRow = (row, idxObj) => {
    const details = extractDetails(row, idxObj);
    const ipType = (details.ip_type_ || "").toLowerCase();

    // 1. Collect VRFs
    if (details.vrf_) vrfs.add(details.vrf_);

    // 2. Count P2P Interfaces (Routing)
    if (ipType.includes("p2p")) {
      p2pCount++;
    }

    // 3. Collect VLANs
    if (details.vlan_) {
      const rowVlans = expandVlanString(String(details.vlan_));
      rowVlans.forEach(v => {
        // Always add to "All VLANs" (so they exist in config)
        allVlans.add(v);

        // Only add to "GW VLANs" if ip_type is Gateway
        if (ipType.includes("gw")) {
          gwVlans.add(v);
        }
      });
    }

    // Native VLAN encoded as nv<N> token inside vlan_ — add to 'all' just in case
    const _nv = parseVlanWithNative(details.vlan_).native;
    if (_nv) allVlans.add(parseInt(_nv));
  };

  rows.forEach(row => {
    const rawPort = row[targetColIndex];
    if (isValidPort(rawPort)) {
      analyzeRow(row, indices);
      // Vx1 rows declare AP VLANs — always add to gwVlans for VNI mapping,
      // regardless of ip_type_ (which is not used for vx1 rows).
      if (canonicalizeInterface(rawPort) === "Vx1") {
        const details = extractDetails(row, indices);
        if (details.vlan_) {
          expandVlanString(String(details.vlan_)).forEach(v => gwVlans.add(v));
        }
      }
    }
    // Analyze Peer (If MLAG, their GW VLANs are my GW VLANs)
    if (myMlagPeer && isValidPort(row[peerIntIdx])) {
      analyzeRow(row, peerIndices);
      // Mirror the Vx1 explicit handling for the MLAG peer — ip_type_ is not used for
      // AP VLAN rows, so analyzeRow alone won't add them to gwVlans.
      if (canonicalizeInterface(row[peerIntIdx]) === "Vx1") {
        const peerDetails = extractDetails(row, peerIndices);
        if (peerDetails.vlan_) {
          expandVlanString(String(peerDetails.vlan_)).forEach(v => gwVlans.add(v));
        }
      }
    }
  });

  // Add SNAKE_* VRFs only when cabling is complete (both primary + secondary valid).
  // Matches the gate used in snakePairsForStatic — no VRF emitted for uncabled ports.
  const snakeIntColIdx = headers.indexOf("snake_int_" + deviceName);
  if (snakeIntColIdx !== -1) {
    rows.forEach(row => {
      const primaryRaw = row[targetColIndex];
      const secondaryRaw = row[snakeIntColIdx];
      if (!isValidPort(primaryRaw) || !isValidPort(secondaryRaw)) return;
      const det = extractDetails(row, indices);
      if (!(det.ip_type_ || "").toLowerCase().includes("p2p")) return;
      vrfs.add("SNAKE_" + canonicalizeInterface(primaryRaw));
      vrfs.add("SNAKE_" + canonicalizeInterface(secondaryRaw));
    });
  }

  return { allVlans, gwVlans, vrfs, hasP2p: (p2pCount > 0) };
}

/**
 * Generates bidirectional static ARP + egress-vrf route chain for L3 snake test.
 *
 * Forward chain (TRAFFIC_SNAKE_EP1_L3 → EP2): fwdDest routed through each pair
 *   via the bridge-MAC trick on loopback cables; terminates at ep2_nh in last secondary VRF.
 * Reverse chain (TRAFFIC_SNAKE_EP2_L3 → EP1): revDest routed backwards through
 *   the same VRFs in reverse order; terminates at ep1_nh in first primary VRF.
 *
 * bridge_mac is required (static ARP for all interior VRF hops).
 * ep1_nh / ep2_nh are soft — comment placeholders emitted if missing (direct-connect assumed).
 * ep1_mac / ep2_mac are optional — only emit static ARP at terminals if set (indirect case).
 *
 * @param {Array}  snakePairs — [{primaryPort, secondaryPort, vlan}] sorted ascending by primary Et#
 * @param {Object} ipPrefs    — from getIpPreferences()
 */
function generateSnakeStaticConfig(snakePairs, ipPrefs) {
  if (!snakePairs || snakePairs.length === 0) return "";

  const base      = ipPrefs.p2p_v4_first || '200';
  const bridgeMac = ipPrefs.bridge_mac   || '';
  const ep1Nh     = ipPrefs.ep1_nh       || '';
  const ep1Mac    = ipPrefs.ep1_mac      || '';
  const ep2Nh     = ipPrefs.ep2_nh       || '';
  const ep2Mac    = ipPrefs.ep2_mac      || '';
  // Routes emitted only when subnets are configured.
  // Each field accepts comma-separated CIDRs or legacy 3-octet prefixes ("10.99.99" → "10.99.99.0/24").
  const _toRoutes = v => {
    if (!v) return [];
    return String(v).split(',').map(s => s.trim()).filter(Boolean)
      .map(s => s.includes('/') ? s : `${s}.0/24`);
  };
  const fwdRoutes = _toRoutes(ipPrefs.ep2_subnet); // EP2 subnets → forward direction (EP1→EP2)
  const revRoutes = _toRoutes(ipPrefs.ep1_subnet); // EP1 subnets → reverse direction (EP2→EP1)

  if (!bridgeMac) {
    return [
      "! Snake VRF Chain: Bridge MAC not configured",
      "! Set Bridge MAC in Auto Config settings to generate ARP + routing entries",
      "!"
    ].join("\n");
  }

  const lines = ['! Snake VRF Chain — Bidirectional Static ARP + Routing'];
  if (fwdRoutes.length) lines.push(`! Forward: ${fwdRoutes.join(', ')}  (EP1 → chain → EP2)`);
  if (revRoutes.length) lines.push(`! Reverse: ${revRoutes.join(', ')}  (EP2 → chain → EP1)`);
  if (!fwdRoutes.length && !revRoutes.length) lines.push('! No EP subnets configured — ARP skeleton only (configure ep1_subnet/ep2_subnet to enable routing)');

  snakePairs.forEach((pair, idx) => {
    const { primaryPort, secondaryPort, vlan } = pair;
    const oct2     = Math.floor(vlan / 100);
    const oct3     = vlan % 100;
    const subnet   = `${base}.${oct2}.${oct3}`;
    const remoteIp = `${subnet}.2`;
    const isFirst  = idx === 0;
    const isLast   = idx === snakePairs.length - 1;

    lines.push(`!`);
    lines.push(`! Pair ${idx + 1}: ${primaryPort} <-> ${secondaryPort} (VLAN ${vlan}, subnet ${subnet}.0/24)`);

    // Static ARP — bridge-mac trick, used by both forward and reverse chains
    lines.push(`arp vrf SNAKE_${primaryPort}   ${remoteIp} ${bridgeMac} arpa`);
    lines.push(`arp vrf SNAKE_${secondaryPort} ${remoteIp} ${bridgeMac} arpa`);

    // ── PRIMARY port routes ──────────────────────────────────────────────────
    // Forward: exits primary → loopback cable → secondary (one route per ep2 subnet)
    fwdRoutes.forEach(r => lines.push(`ip route vrf SNAKE_${primaryPort} ${r} ${remoteIp}`));

    // Reverse terminal (first pair): exit to EP1 traffic gen
    if (isFirst && revRoutes.length) {
      if (ep1Mac && ep1Nh) lines.push(`arp vrf SNAKE_${primaryPort} ${ep1Nh} ${ep1Mac} arpa`);
      if (ep1Nh) {
        revRoutes.forEach(r => lines.push(`ip route vrf SNAKE_${primaryPort} ${r} ${ep1Nh}`));
      } else {
        lines.push(`! SNAKE_${primaryPort}: EP1 NH not set — fill in if EP1 not directly connected`);
      }
    }
    // Reverse chain (idx > 0): jump backward to previous secondary VRF
    if (!isFirst && revRoutes.length) {
      const prev       = snakePairs[idx - 1];
      const prevOct2   = Math.floor(prev.vlan / 100);
      const prevOct3   = prev.vlan % 100;
      const prevRemote = `${base}.${prevOct2}.${prevOct3}.2`;
      revRoutes.forEach(r => lines.push(`ip route vrf SNAKE_${primaryPort} ${r} egress-vrf SNAKE_${prev.secondaryPort} ${prevRemote}`));
    }

    // ── SECONDARY port routes ────────────────────────────────────────────────
    // Forward terminal (last pair): exit to EP2 traffic gen
    if (isLast && fwdRoutes.length) {
      if (ep2Mac && ep2Nh) lines.push(`arp vrf SNAKE_${secondaryPort} ${ep2Nh} ${ep2Mac} arpa`);
      if (ep2Nh) {
        fwdRoutes.forEach(r => lines.push(`ip route vrf SNAKE_${secondaryPort} ${r} ${ep2Nh}`));
      } else {
        lines.push(`! SNAKE_${secondaryPort}: EP2 NH not set — fill in if EP2 not directly connected`);
      }
    }
    // Forward chain: jump forward to next primary VRF
    if (!isLast && fwdRoutes.length) {
      const next       = snakePairs[idx + 1];
      const nextOct2   = Math.floor(next.vlan / 100);
      const nextOct3   = next.vlan % 100;
      const nextRemote = `${base}.${nextOct2}.${nextOct3}.2`;
      fwdRoutes.forEach(r => lines.push(`ip route vrf SNAKE_${secondaryPort} ${r} egress-vrf SNAKE_${next.primaryPort} ${nextRemote}`));
    }
    // Reverse: exits secondary → loopback cable → primary (one route per ep1 subnet)
    revRoutes.forEach(r => lines.push(`ip route vrf SNAKE_${secondaryPort} ${r} ${remoteIp}`));
  });

  lines.push(`!`);
  return lines.join('\n');
}

/**
 * Generates PBR (Policy-Based Routing) TTL reset config for all snake interfaces.
 * Outputs:
 *   - ip access-list SNAKE_TTL_MATCH (permit all IPv4)
 *   - route-map SNAKE_SET_TTL permit 10 (match ACL, set ip ttl 64)
 *   - interface stanzas with `ip policy route-map SNAKE_SET_TTL` per snake port
 *
 * @param {Array} snakePairs — [{primaryPort, secondaryPort, vlan}]
 */
function generateSnakeTtlPbrConfig(snakePairs) {
  if (!snakePairs || snakePairs.length === 0) return '';

  const lines = [
    '! Snake TTL Reset — Policy-Based Routing',
    'ip access-list SNAKE_TTL_MATCH',
    '   10 permit ip any any',
    '!',
    'route-map SNAKE_SET_TTL permit 10',
    '   match ip address access-list SNAKE_TTL_MATCH',
    '   set ip ttl 64',
    '!'
  ];

  snakePairs.forEach(({ primaryPort, secondaryPort }) => {
    lines.push(`interface ${primaryPort}`);
    lines.push(`   ip policy route-map SNAKE_SET_TTL`);
    lines.push('!');
    lines.push(`interface ${secondaryPort}`);
    lines.push(`   ip policy route-map SNAKE_SET_TTL`);
    lines.push('!');
  });

  return lines.join('\n');
}

/**
 * Generates Traffic Policy TTL reset config for all snake interfaces.
 * Outputs:
 *   - traffic-policies block with SNAKE_TTL_POLICY (set ip ttl 64 on all IPv4)
 *   - interface stanzas applying the policy input + output per snake port
 *
 * @param {Array} snakePairs — [{primaryPort, secondaryPort, vlan}]
 */
function generateSnakeTtlTrafficPolicyConfig(snakePairs) {
  if (!snakePairs || snakePairs.length === 0) return '';

  const lines = [
    '! Snake TTL Reset — Traffic Policy',
    'traffic-policies',
    '   traffic-policy SNAKE_TTL_POLICY',
    '      match SNAKE_ALL ipv4',
    '         actions',
    '            set ip ttl 64',
    '         !',
    '      !',
    '   !',
    '!'
  ];

  snakePairs.forEach(({ primaryPort, secondaryPort }) => {
    lines.push(`interface ${primaryPort}`);
    lines.push(`   traffic-policy input SNAKE_TTL_POLICY`);
    lines.push(`   traffic-policy output SNAKE_TTL_POLICY`);
    lines.push('!');
    lines.push(`interface ${secondaryPort}`);
    lines.push(`   traffic-policy input SNAKE_TTL_POLICY`);
    lines.push(`   traffic-policy output SNAKE_TTL_POLICY`);
    lines.push('!');
  });

  return lines.join('\n');
}

/**
 * Returns a Set of device names that are VTEP leaves.
 * A device is a VTEP leaf iff it has P2P uplinks (part of the fabric) AND
 * has at least one GW/AP VLAN (has something to bridge over VXLAN).
 * Used by generateVxlanBlock() to restrict the static flood list to leaves only.
 */
function computeVtepNames(allDevices, rows, headers, topo) {
  const vtepNames = new Set();
  allDevices.forEach(d => {
    if (d.type === 'non-arista') return;
    const role = (d.role || '').toUpperCase();
    // Only LEAFs are VTEPs (participate in VXLAN data-plane / flood list).
    // SPINEs are underlay routers only — adding them to the flood list is incorrect.
    if (role === 'LEAF') {
      vtepNames.add(d.name);
    }
    // All other roles (SPINE, HARNESS, unset, etc.): never a VTEP
  });
  return vtepNames;
}

function processP2pNeighbor(bgpNeighbors, peerObj, details, pName, ipPrefs, rowIndex) {
  const mode = (String(details.sp_mode_ || "")).toLowerCase();
  const _pv = parseVlanWithNative(details.vlan_);
  const vlans = Array.from(expandVlanString(String(_pv.vlans || "")));
  const vlansForSvi = _pv.native ? vlans.concat([_pv.native]) : vlans;
  const l3IntNames = [];
  const poVal = normalizePo(details.po_);

  // Determine Interface Names
  if (mode.includes("l3-po-sub-int") && poVal) vlans.forEach(v => l3IntNames.push(`${poVal}.${v}`));
  else if (mode.includes("l3-et-sub-int")) vlans.forEach(v => l3IntNames.push(`${pName}.${v}`));
  else if (mode.includes("l3-po-int") && poVal) l3IntNames.push(poVal);
  else if (mode.includes("l3-et-int")) l3IntNames.push(pName);
  else if (mode.startsWith("l2-")) _parseSviVlans(details.svi_vlan_, vlansForSvi).forEach(v => l3IntNames.push(`Vlan${v}`));

  // Calculate IPs
  let val = 0;
  if (vlans.length > 0) val = parseInt(vlans[0]);
  else if (_pv.native) val = parseInt(_pv.native);
  if (!val || isNaN(val)) val = rowIndex + 1;

  let oct2 = Math.floor(val / 100);
  let oct3 = val % 100;

  const peerId = peerObj.sheetIndex;
  const baseV4 = ipPrefs.p2p_v4_first || "200";
  const peerIpV4 = `${baseV4}.${oct2}.${oct3}.${peerId}`;
  const baseV6 = ipPrefs.p2p_v6_first || "200";
  const peerIpV6 = `${baseV6}:${oct2}:${oct3}::${peerId}`;

  if (!bgpNeighbors[peerObj.name]) {
    const peerLoBase = parseInt(ipPrefs && ipPrefs.lo_base) || 0;
    const peerLoId = peerId + peerLoBase;
    bgpNeighbors[peerObj.name] = {
      id: peerObj.sheetIndex,
      loopbackV4: `${peerLoId}.${peerLoId}.${peerLoId}.${peerLoId}`,
      loopbackV6: `${peerLoId}:${peerLoId}:${peerLoId}::${peerLoId}`,
      peerParams: []
    };
  }

  l3IntNames.forEach(l3Name => {
    bgpNeighbors[peerObj.name].peerParams.push({
      interface: l3Name,
      peerIpV4: peerIpV4,
      peerIpV6: peerIpV6,
      vrf: details.vrf_,
      description: `To ${peerObj.name} (${pName})`
    });
  });
}

function generateGlobalBlock(isEvpnDevice, netSettings, mlagIsActive, isLeaf) {
  let globalCfgText = getGlobalConfig() || "";
  let mandatory = ["!"];
  // multi-agent model is required for EVPN; skip on pure-underlay devices (e.g. HARNESS)
  if (isEvpnDevice) {
    mandatory.push("service routing protocols model multi-agent");
  }
  mandatory.push("ip routing");
  if (!netSettings || netSettings.int_ipv6 || netSettings.int_ipv6_unnum || netSettings.gw_ipv6) {
    mandatory.push("ip routing ipv6 interfaces");
    mandatory.push("ipv6 unicast-routing");
  }
  // Only LEAF devices acting as EVPN gateways need ip virtual-router mac-address.
  // Standalone (non-MLAG) path: requires LEAF role + EVPN enabled + GW configured.
  // MLAG path handled in generateMlagConfig() — same LEAF guard there.
  if (netSettings && !mlagIsActive && isLeaf &&
      (netSettings.evpn_ipv4 || netSettings.evpn_ipv6) &&
      (netSettings.gw_ipv4 || netSettings.gw_ipv6)) {
    mandatory.push(`ip virtual-router mac-address ${netSettings.varp_mac || '001c.7300.0099'}`);
  }
  mandatory.push("!");
  return globalCfgText + "\n" + mandatory.join("\n");
}

/**
* REFACTORED HELPER: Detects MLAG & Neighbors using Topology Engine
*/
function detectMlagState(deviceName, deviceSheetIndex, rows, indices, targetColIndex, topo, allDevices, isVxlan, settings, isLeaf) {
  const state = {
    isActive: false,
    peerId: null,
    peerName: "",
    mlagConfigBlock: "",
    bgpNeighbors: {}
  };

  const ipPrefs = getIpPreferences();

  // 1. MLAG PARTNER DETECTION
  const myPeerName = topo.mlagPeerMap ? topo.mlagPeerMap[deviceName] : null;

  if (myPeerName) {
    const peerObj = allDevices.find(d => d.name === myPeerName);
    if (peerObj) {
      state.isActive = true;
      state.peerName = myPeerName;
      state.peerId = peerObj.sheetIndex;

      // IMPROVED: Strict search for the Peer Link Interface
      let peerLinkPort = null;
      for (const key of topo.peerLinkPorts) {
        if (key.startsWith(deviceName + ":")) {
          peerLinkPort = key.split(":")[1];
          break;
        }
      }

      // Error handling if topo fails to find the physical link
      if (!peerLinkPort) {
        state.mlagConfigBlock = "!! ERROR: No Physical Peer-Link detected in Topology !!";
      } else {
        const mlagData = generateMlagConfig(deviceSheetIndex, peerObj, peerLinkPort, state.bgpNeighbors, isVxlan, settings, ipPrefs, isLeaf);
        state.mlagConfigBlock = mlagData.mlagConfigBlock;
      }
    }
  }

  // 2. NEIGHBOR DETECTION
  rows.forEach((row, rIdx) => {
    const localPort = row[targetColIndex];
    if (!isValidPort(localPort)) return;

    const pName = canonicalizeInterface(localPort); // "Et1"

    // [FIX] Lookup Key: "Leaf1:Et1"
    const myKey = deviceName + ":" + pName;
    const linkEntry = topo.globalLinkMap ? topo.globalLinkMap.get(myKey) : null;

    if (linkEntry) {
      if (linkEntry.isSelfLoop) return; // Snake self-loop — no routing neighbors generated

      const neighborObj = allDevices.find(d => d.name === linkEntry.dev);

      if (neighborObj && neighborObj.type === 'full') {
        const details = extractDetails(row, indices);
        const ipType = (String(details.ip_type_ || "")).toLowerCase();

        if (ipType.includes("p2p") && linkEntry.dev !== myPeerName) {
          processP2pNeighbor(state.bgpNeighbors, neighborObj, details, pName, ipPrefs, rIdx);
        }
      }
    }
  });

  return state;
}

/**
* Helper: Generates MLAG Global Config, SVIs, and BGP Peering
* Updates the bgpNeighbors object by reference.
*/
function generateMlagConfig(localId, partnerObj, peerLinkName, bgpNeighbors, isVxlan, settings, ipPrefs, isLeaf) {
  const isOspf = !!(settings && settings.ospf_ipv4);
  const hasMlagIpv6 = !settings || settings.int_ipv6 || settings.int_ipv6_unnum;
  const partnerId = partnerObj.sheetIndex;
  const partnerName = partnerObj.name;

  const isLower = (localId < partnerId);
  const mlagBase = parseInt(ipPrefs && ipPrefs.mlag_peer_base) || 1;
  const localIpBit = isLower ? mlagBase : mlagBase + 1;
  const peerIpBit = isLower ? mlagBase + 1 : mlagBase;
  const priority = isLower ? 10 : 20;

  const lowerId = Math.min(localId, partnerId);
  const higherId = Math.max(localId, partnerId);

  const mlagLines = [];

  mlagLines.push("! MLAG Infrastructure");
  mlagLines.push("no spanning-tree vlan 4093-4094");
  // MLAG LEAF acting as gateway — same LEAF+GW guard as standalone path (EVPN not required; MLAG is sufficient).
  if (settings && isLeaf && (settings.gw_ipv4 || settings.gw_ipv6)) {
    mlagLines.push(`ip virtual-router mac-address ${settings.varp_mac || '001c.7300.0099'}`);
  }
  mlagLines.push("!");

  // FIXED: Changed 'description' to 'name' for VLAN context
  mlagLines.push("vlan 4093");
  mlagLines.push(" name MLAG_L3_UNDERLAY_PEERING");
  mlagLines.push(" trunk group MLAG_PEER");
  mlagLines.push("!");
  mlagLines.push("vlan 4094");
  mlagLines.push(" name MLAG_CONTROL_PLANE");
  mlagLines.push(" trunk group MLAG_PEER");
  mlagLines.push("!");

  mlagLines.push("interface Vlan4094");
  mlagLines.push(" description MLAG_CONTROL_PLANE");
  mlagLines.push(" no autostate");
  mlagLines.push(` ip address 169.254.0.${localIpBit}/31`);
  mlagLines.push(" no shutdown");
  mlagLines.push("!");
  mlagLines.push("interface Vlan4093");
  mlagLines.push(" description MLAG_L3_PEERING");
  mlagLines.push(" no autostate");
  mlagLines.push(` ip address 169.254.1.${localIpBit}/31`);
  if (hasMlagIpv6) mlagLines.push(` ipv6 address 169:254:1::${localIpBit}/127`);
  if (isOspf) {
    mlagLines.push(" ip ospf network point-to-point");
    mlagLines.push(" ip ospf area 0.0.0.0");
  }
  mlagLines.push(" no shutdown");
  mlagLines.push("!");

  mlagLines.push("mlag configuration");
  mlagLines.push(` domain-id MLAG_DOMAIN_${lowerId}-${higherId}`);
  mlagLines.push(` local-interface Vlan4094`);
  mlagLines.push(` peer-address 169.254.0.${peerIpBit}`);
  mlagLines.push(` peer-link ${peerLinkName}`);
  mlagLines.push(` primary-priority ${priority}`);

  // REMOVED: vxlan virtual-router encapsulation command per request

  // FIXED: Syntax changed to 'reload-delay non-mlag' (removed 'mode')
  mlagLines.push(" reload-delay mlag 300");
  mlagLines.push(" reload-delay non-mlag 330");
  mlagLines.push("!");

  if (!bgpNeighbors[partnerName]) {
    const mlagLoBase = parseInt(ipPrefs && ipPrefs.lo_base) || 0;
    const mlagLoId = partnerId + mlagLoBase;
    bgpNeighbors[partnerName] = {
      id: partnerId,
      loopbackV4: `${mlagLoId}.${mlagLoId}.${mlagLoId}.${mlagLoId}`,
      loopbackV6: `${mlagLoId}:${mlagLoId}:${mlagLoId}::${mlagLoId}`,
      peerParams: []
    };
  }
  const mlagPeerParam = {
    peerIpV4: `169.254.1.${peerIpBit}`,
    interface: "Vlan4093",
    description: `MLAG_L3_UNDERLAY_TO_${partnerName}`,
    isMlag: true
  };
  if (hasMlagIpv6) mlagPeerParam.peerIpV6 = `169:254:1::${peerIpBit}`;
  bgpNeighbors[partnerName].peerParams.push(mlagPeerParam);

  return { mlagConfigBlock: mlagLines.join("\n") };
}

/* REPLACE IN Code.gs */
/**
 * Generates BGP configuration for Arista EOS.
 * FIX:
 * 1. Strict naming convention (UNDERLAY_VRF_...).
 * 2. Applies 'next-hop address-family ipv6 originate' correctly.
 * 3. Prevents _V4_P2P_IP groups from appearing in IPv6 families (Global & VRF).
 */
function generateBGP(deviceSheetIndex, deviceName, bgpNeighbors, gwVlans, isEvpnEnabled, deviceRole, peerRoles, settings, ipPrefs) {
  // Helper: returns true if a peer should participate in EVPN overlay sessions.
  // Only LEAF/SPINE peers get OVERLAY peer groups. All others (HARNESS, unset, etc.) get underlay only.
  const peerRoles_ = peerRoles || {};
  const s = settings || {};
  const isPeerEvpn = (peerName) => {
    const pr = (peerRoles_[peerName] || '').toUpperCase();
    return pr === 'LEAF' || pr === 'SPINE';
  };
  if (!bgpNeighbors) return "! No BGP Neighbors";

  const asnBase = parseInt((ipPrefs || {}).bgp_asn_base) || 65000;
  const localAsn = asnBase + deviceSheetIndex;
  const configLines = [];

  // --- 1. DATA PRE-PROCESSING ---
  const globalPeers = {};
  const vrfPeers = {};
  const allPeerGroups = [];

  Object.keys(bgpNeighbors).forEach(peerName => {
    const peerData = bgpNeighbors[peerName];
    if (!peerData || !peerData.peerParams) return;

    peerData.peerParams.forEach(p => {
      // Context & Naming
      const rawVrf = (p.vrf && p.vrf.trim() !== "") ? p.vrf : "DEFAULT";
      const isVrf = (rawVrf !== "DEFAULT");

      const vrfStr = rawVrf.toUpperCase();
      const peerStr = peerName.toUpperCase();
      const mlagStr = p.isMlag ? "_MLAG" : "";

      const baseName = `UNDERLAY_VRF_${vrfStr}_${peerStr}`;

      const pgV4 = `${baseName}_V4_P2P_IP${mlagStr}`;
      const pgV6 = `${baseName}_V6_P2P_IP${mlagStr}`;
      const pgV6Int = `${baseName}_V6_INT_UN${mlagStr}`;

      const pgOvV4 = `OVERLAY_${peerStr}_V4_LO_IP`;
      const pgOvV6 = `OVERLAY_${peerStr}_V6_LO_IP`;

      const pgEntry = {
        name: peerName,
        asn: asnBase + peerData.id,
        pgV4: pgV4,
        pgV6: pgV6,
        pgV6Int: pgV6Int,
        pgOvV4: pgOvV4,
        pgOvV6: pgOvV6,
        params: p,
        isVrf: isVrf,
        vrfName: isVrf ? p.vrf : null,
        loopbackV4: peerData.loopbackV4,
        peerId: peerData.id
      };

      if (isVrf) {
        if (!vrfPeers[p.vrf]) vrfPeers[p.vrf] = [];
        vrfPeers[p.vrf].push(pgEntry);
      } else {
        if (!globalPeers[peerName]) globalPeers[peerName] = [];
        globalPeers[peerName].push(pgEntry);
      }
      allPeerGroups.push(pgEntry);
    });
  });

  // --- 2. GLOBAL ROUTER CONFIGURATION ---
  configLines.push(`router bgp ${localAsn}`);
  configLines.push(` no bgp default ipv4-unicast`);
  configLines.push(` bgp log-neighbor-changes`);
  configLines.push(` maximum-paths 64 ecmp 64`);
  configLines.push(` distance bgp 20 200 200`);
  configLines.push(` graceful-restart restart-time 300`);
  configLines.push(` graceful-restart`);
  configLines.push(` redistribute connected`);

  // --- 3. DEFINE ALL PEER GROUPS ---
  const definedGroups = new Set();

  allPeerGroups.forEach(pg => {
    const define = (gName, isOverlay = false) => {
      if (definedGroups.has(gName)) return;
      definedGroups.add(gName);

      configLines.push(` neighbor ${gName} peer group`);
      configLines.push(` neighbor ${gName} remote-as ${pg.asn}`);
      configLines.push(` neighbor ${gName} bfd`);

      if (isOverlay) {
        configLines.push(` neighbor ${gName} update-source Loopback0`);
        configLines.push(` neighbor ${gName} ebgp-multihop 3`);
        configLines.push(` neighbor ${gName} next-hop-unchanged`);
      } else {
        configLines.push(` neighbor ${gName} next-hop-self`);
      }
      configLines.push(` neighbor ${gName} send-community standard extended`);
      configLines.push(` neighbor ${gName} maximum-routes 0`); // 0 = unlimited (EOS default is 12000)
    };

    // Gate peer groups on IP family flags. MLAG peers bypass bgp_ipv4/bgp_ipv6 gates
    // because the MLAG link always has both IPv4 and IPv6 addresses configured.
    if (pg.params.peerIpV4 && (s.bgp_ipv4 || pg.params.isMlag)) define(pg.pgV4);
    if (pg.params.peerIpV6 && (s.bgp_ipv6 || pg.params.isMlag)) define(pg.pgV6);
    if (pg.params.interface && s.bgp_rfc5549) define(pg.pgV6Int);

    if (isEvpnEnabled && !pg.isVrf && !pg.params.isMlag && isPeerEvpn(pg.name)) {
      if (s.evpn_ipv4 !== false) define(pg.pgOvV4, true);
      if (s.evpn_ipv6) define(pg.pgOvV6, true);
    }
  });

  // --- 4. CONFIGURE GLOBAL NEIGHBORS ---
  Object.keys(globalPeers).forEach(key => {
    globalPeers[key].forEach(item => {
      const p = item.params;
      const descSuffix = `To ${item.name} via ${p.interface} #TA`;

      if (p.peerIpV4 && (s.bgp_ipv4 || p.isMlag)) {
        configLines.push(` neighbor ${p.peerIpV4} peer group ${item.pgV4}`);
        configLines.push(` neighbor ${p.peerIpV4} description ${descSuffix} (IPv4)`);
      }
      if (p.peerIpV6 && (s.bgp_ipv6 || p.isMlag)) {
        configLines.push(` neighbor ${p.peerIpV6} peer group ${item.pgV6}`);
        configLines.push(` neighbor ${p.peerIpV6} description ${descSuffix} (IPv6)`);
      }
      if (p.interface && s.bgp_rfc5549) {
        configLines.push(` neighbor interface ${p.interface} peer-group ${item.pgV6Int}`);
      }

      if (isEvpnEnabled && !p.isMlag && isPeerEvpn(item.name)) {
        if (item.loopbackV4 && s.evpn_ipv4 !== false) {
          configLines.push(` neighbor ${item.loopbackV4} peer group ${item.pgOvV4}`);
          configLines.push(` neighbor ${item.loopbackV4} description Overlay to ${item.name} #TA`);
        }
        if (s.evpn_ipv6) {
          const pid = item.peerId;
          const bgpLoBase = parseInt(ipPrefs && ipPrefs.lo_base) || 0;
          const pidLoId = pid + bgpLoBase;
          const v6Loop = item.loopbackV6 || `${pidLoId}:${pidLoId}:${pidLoId}::${pidLoId}`;
          configLines.push(` neighbor ${v6Loop} peer group ${item.pgOvV6}`);
          configLines.push(` neighbor ${v6Loop} description Overlay to ${item.name} (v6) #TA`);
        }
      }
    });
  });

  // --- 5. GLOBAL ADDRESS FAMILIES ---
  configLines.push(` !`);
  configLines.push(` address-family ipv4`);
  definedGroups.forEach(gName => {
    // A. Activate Groups in DEFAULT VRF
    if (gName.includes("_VRF_DEFAULT_")) {
      configLines.push(`  neighbor ${gName} activate`);

      // B. Apply Next-Hop Fix (for Unnumbered AND IPv6 P2P)
      if (gName.includes("_V6_INT_UN") || gName.includes("_V6_P2P_IP")) {
        configLines.push(`  neighbor ${gName} next-hop address-family ipv6 originate`);
      }
    }
  });

  configLines.push(` !`);
  configLines.push(` address-family ipv6`);
  definedGroups.forEach(gName => {
    // A. Activate Groups in DEFAULT VRF
    if (gName.includes("_VRF_DEFAULT_")) {
      // B. EXCLUSION RULE: Do NOT activate IPv4 P2P groups in IPv6 Family
      if (!gName.includes("_V4_P2P_IP")) {
        configLines.push(`  neighbor ${gName} activate`);
      }
    }
  });

  if (isEvpnEnabled) {
    configLines.push(` !`);
    configLines.push(` address-family evpn`);
    definedGroups.forEach(gName => {
      if (gName.startsWith("OVERLAY_")) {
        configLines.push(`  neighbor ${gName} activate`);
      }
    });
    if (gwVlans && gwVlans.size > 0) {
      if (s.evpn_service === 'vlan-aware-bundle') {
        // Single bundle for all VLANs — RT must be identical on every VTEP, so use asnBase:1
        const vlanList = Array.from(gwVlans).sort((a, b) => a - b).join(",");
        configLines.push(`  vlan-aware-bundle EVPN_VLAN_AWARE_BUNDLE`);
        configLines.push(`   vlan ${vlanList}`);
        configLines.push(`   rd auto`);
        configLines.push(`   route-target both ${asnBase}:1`);
        configLines.push(`   redistribute learned`);
      } else {
        // Per-VLAN (default): separate EVPN instance per VLAN
        Array.from(gwVlans).sort((a, b) => a - b).forEach(v => {
          configLines.push(`  vlan ${v}`);
          configLines.push(`   rd auto`);
          configLines.push(`   route-target both ${v}:${v}`);
          configLines.push(`   redistribute learned`);
        });
      }
    }
  }

  // --- 6. VRF CONFIGURATION ---
  Object.keys(vrfPeers).sort().forEach(vrfName => {
    configLines.push(` !`);
    configLines.push(` vrf ${vrfName}`);
    configLines.push(`  redistribute connected`);

    const activeVrfGroups = new Set();

    // A. Apply Neighbors
    vrfPeers[vrfName].forEach(item => {
      const p = item.params;
      const descSuffix = `To ${item.name} via ${p.interface} #TA`;

      if (p.peerIpV4 && (s.bgp_ipv4 || p.isMlag)) {
        configLines.push(`  neighbor ${p.peerIpV4} peer group ${item.pgV4}`);
        configLines.push(`  neighbor ${p.peerIpV4} description ${descSuffix}`);
        activeVrfGroups.add(item.pgV4);
      }
      if (p.peerIpV6 && (s.bgp_ipv6 || p.isMlag)) {
        configLines.push(`  neighbor ${p.peerIpV6} peer group ${item.pgV6}`);
        configLines.push(`  neighbor ${p.peerIpV6} description ${descSuffix}`);
        activeVrfGroups.add(item.pgV6);
      }
      if (p.interface && s.bgp_rfc5549) {
        configLines.push(`  neighbor interface ${p.interface} peer-group ${item.pgV6Int}`);
        activeVrfGroups.add(item.pgV6Int);
      }
    });

    // B. VRF Address Family IPv4
    configLines.push(`  !`);
    configLines.push(`  address-family ipv4`);
    activeVrfGroups.forEach(gName => {
      configLines.push(`   neighbor ${gName} activate`);

      // FIX: IPv6 Next-Hop for IPv4 (Unnumbered + IPv6 P2P)
      if (gName.includes("_V6_INT_UN") || gName.includes("_V6_P2P_IP")) {
        configLines.push(`   neighbor ${gName} next-hop address-family ipv6 originate`);
      }
    });

    // C. VRF Address Family IPv6
    configLines.push(`  !`);
    configLines.push(`  address-family ipv6`);
    activeVrfGroups.forEach(gName => {
      // FIX: EXCLUSION RULE - Do NOT activate IPv4 P2P groups in IPv6 Family
      if (!gName.includes("_V4_P2P_IP")) {
        configLines.push(`   neighbor ${gName} activate`);
      }
    });
  });

  return configLines.join("\n");
}

/**
 * Generates OSPF underlay configuration (area 0, single-area leaf-spine).
 * Per-interface OSPF commands (point-to-point, area, bfd) are added by
 * generateComplexL3Block() when netSettings.ospf_ipv4 is true.
 */
function generateOSPF(deviceSheetIndex, bgpNeighbors, ipPrefs) {
  const loBase = parseInt(ipPrefs && ipPrefs.lo_base) || 0;
  const loId = deviceSheetIndex + loBase;
  const routerId = `${loId}.${loId}.${loId}.${loId}`;

  // Group non-MLAG P2P interfaces by VRF ("DEFAULT" = default VRF)
  const vrfIntfMap = {};
  let hasMlagPeer = false;
  Object.values(bgpNeighbors).forEach(peerData => {
    if (!peerData || !peerData.peerParams) return;
    peerData.peerParams.forEach(p => {
      if (p.isMlag) { hasMlagPeer = true; return; }
      if (!p.interface) return;
      const vrf = (p.vrf && p.vrf.trim() !== "") ? p.vrf : "DEFAULT";
      if (!vrfIntfMap[vrf]) vrfIntfMap[vrf] = new Set();
      vrfIntfMap[vrf].add(p.interface);
    });
  });
  if (hasMlagPeer) {
    if (!vrfIntfMap["DEFAULT"]) vrfIntfMap["DEFAULT"] = new Set();
    vrfIntfMap["DEFAULT"].add("Vlan4093");
  }

  const buildBlock = (header, intfs) => {
    const lines = [header, ` router-id ${routerId}`, " passive-interface default"];
    intfs.forEach(intf => lines.push(` no passive-interface ${intf}`));
    lines.push(" bfd default", " max-lsa 12000", "!");
    return lines.join("\n");
  };

  const parts = [];
  if (vrfIntfMap["DEFAULT"]) {
    parts.push(buildBlock("router ospf 1", vrfIntfMap["DEFAULT"]));
  }
  Object.keys(vrfIntfMap).filter(v => v !== "DEFAULT").sort().forEach(vrf => {
    parts.push(buildBlock(`router ospf 1 vrf ${vrf}`, vrfIntfMap[vrf]));
  });

  return parts.join("\n");
}

/**
 * Generates OSPFv3 (IPv6) underlay configuration (area 0, single-area leaf-spine).
 * Mirrors generateOSPF() but uses `router ospf3 1`. Per-interface commands
 * (`ipv6 ospf 1 area 0.0.0.0`) are added by generateComplexL3Block() when ospf_ipv6=true.
 */
function generateOSPFv3(deviceSheetIndex, bgpNeighbors, ipPrefs) {
  const loBase = parseInt(ipPrefs && ipPrefs.lo_base) || 0;
  const loId = deviceSheetIndex + loBase;
  const routerId = `${loId}.${loId}.${loId}.${loId}`;

  // Group non-MLAG P2P interfaces by VRF
  const vrfIntfMap = {};
  let hasMlagPeer = false;
  Object.values(bgpNeighbors).forEach(peerData => {
    if (!peerData || !peerData.peerParams) return;
    peerData.peerParams.forEach(p => {
      if (p.isMlag) { hasMlagPeer = true; return; }
      if (!p.interface) return;
      const vrf = (p.vrf && p.vrf.trim() !== "") ? p.vrf : "DEFAULT";
      if (!vrfIntfMap[vrf]) vrfIntfMap[vrf] = new Set();
      vrfIntfMap[vrf].add(p.interface);
    });
  });
  if (hasMlagPeer) {
    if (!vrfIntfMap["DEFAULT"]) vrfIntfMap["DEFAULT"] = new Set();
    vrfIntfMap["DEFAULT"].add("Vlan4093");
  }

  const buildBlock = (header, intfs) => {
    const lines = [header, ` router-id ${routerId}`, " passive-interface default"];
    intfs.forEach(intf => lines.push(` no passive-interface ${intf}`));
    lines.push(" bfd default", " max-lsa 12000", "!");
    return lines.join("\n");
  };

  const parts = [];
  if (vrfIntfMap["DEFAULT"]) {
    parts.push(buildBlock("router ospf3 1", vrfIntfMap["DEFAULT"]));
  }
  Object.keys(vrfIntfMap).filter(v => v !== "DEFAULT").sort().forEach(vrf => {
    parts.push(buildBlock(`router ospf3 1 vrf ${vrf}`, vrfIntfMap[vrf]));
  });

  return parts.join("\n");
}

/**
 * Generates a BGP EVPN overlay-only block for use when OSPF is the underlay.
 * No P2P underlay sessions — only loopback-to-loopback overlay peers + EVPN AF.
 */
function generateBGPEvpnOverlay(deviceSheetIndex, deviceName, bgpNeighbors, gwVlans, peerRoles, settings, ipPrefs) {
  const asnBase = parseInt((ipPrefs || {}).bgp_asn_base) || 65000;
  const localAsn = asnBase + deviceSheetIndex;
  const lines = [];
  const peerRoles_ = peerRoles || {};
  const s = settings || {};
  const isPeerEvpn = (peerName) => {
    const pr = (peerRoles_[peerName] || '').toUpperCase();
    return pr === 'LEAF' || pr === 'SPINE';
  };

  lines.push(`router bgp ${localAsn}`);
  lines.push(" no bgp default ipv4-unicast");
  lines.push(" bgp log-neighbor-changes");
  lines.push(" maximum-paths 64 ecmp 64");
  lines.push(" graceful-restart");

  const definedGroups = new Set();

  // Define overlay peer groups (loopback-to-loopback) — skip non-EVPN peers (e.g. HARNESS)
  const useEvpnV4 = s.evpn_ipv4 !== false; // default true for backward compat
  const useEvpnV6 = !!s.evpn_ipv6;
  Object.keys(bgpNeighbors).forEach(peerName => {
    const peerData = bgpNeighbors[peerName];
    if (!peerData) return;
    if (!isPeerEvpn(peerName)) return;
    const isMlagOnly = peerData.peerParams && peerData.peerParams.every(p => p.isMlag);
    if (isMlagOnly) return;
    const peerAsn = asnBase + peerData.id;
    const pid = peerData.id;

    if (useEvpnV4) {
      const pgOvV4 = `OVERLAY_${peerName.toUpperCase()}_V4_LO_IP`;
      if (!definedGroups.has(pgOvV4)) {
        definedGroups.add(pgOvV4);
        lines.push(` neighbor ${pgOvV4} peer group`);
        lines.push(` neighbor ${pgOvV4} remote-as ${peerAsn}`);
        lines.push(` neighbor ${pgOvV4} update-source Loopback0`);
        lines.push(` neighbor ${pgOvV4} ebgp-multihop 3`);
        lines.push(` neighbor ${pgOvV4} send-community extended`);
        lines.push(` neighbor ${pgOvV4} maximum-routes 0`); // 0 = unlimited (EOS default is 12000)
      }
      if (peerData.loopbackV4) {
        lines.push(` neighbor ${peerData.loopbackV4} peer group ${pgOvV4}`);
        lines.push(` neighbor ${peerData.loopbackV4} description Overlay to ${peerName} #TA`);
      }
    }

    if (useEvpnV6) {
      const pgOvV6 = `OVERLAY_${peerName.toUpperCase()}_V6_LO_IP`;
      if (!definedGroups.has(pgOvV6)) {
        definedGroups.add(pgOvV6);
        lines.push(` neighbor ${pgOvV6} peer group`);
        lines.push(` neighbor ${pgOvV6} remote-as ${peerAsn}`);
        lines.push(` neighbor ${pgOvV6} update-source Loopback0`);
        lines.push(` neighbor ${pgOvV6} ebgp-multihop 3`);
        lines.push(` neighbor ${pgOvV6} next-hop-unchanged`);
        lines.push(` neighbor ${pgOvV6} send-community standard extended`);
        lines.push(` neighbor ${pgOvV6} maximum-routes 0`); // 0 = unlimited (EOS default is 12000)
      }
      const evpnLoBase = parseInt(ipPrefs && ipPrefs.lo_base) || 0;
      const pidLoId = pid + evpnLoBase;
      const v6Loop = peerData.loopbackV6 || `${pidLoId}:${pidLoId}:${pidLoId}::${pidLoId}`;
      lines.push(` neighbor ${v6Loop} peer group ${pgOvV6}`);
      lines.push(` neighbor ${v6Loop} description Overlay to ${peerName} (v6) #TA`);
    }
  });

  // EVPN address family
  lines.push(" !");
  lines.push(" address-family evpn");
  definedGroups.forEach(gName => lines.push(`  neighbor ${gName} activate`));

  if (gwVlans && gwVlans.size > 0) {
    if (s.evpn_service === 'vlan-aware-bundle') {
      // Single bundle for all VLANs — RT must be identical on every VTEP, so use asnBase:1
      const vlanList = Array.from(gwVlans).sort((a, b) => a - b).join(",");
      lines.push(`  vlan-aware-bundle EVPN_VLAN_AWARE_BUNDLE`);
      lines.push(`   vlan ${vlanList}`);
      lines.push(`   rd auto`);
      lines.push(`   route-target both ${asnBase}:1`);
      lines.push(`   redistribute learned`);
    } else {
      // Per-VLAN (default)
      Array.from(gwVlans).sort((a, b) => a - b).forEach(v => {
        lines.push(`  vlan ${v}`);
        lines.push(`   rd auto`);
        lines.push(`   route-target both ${v}:${v}`);
        lines.push(`   redistribute learned`);
      });
    }
  }

  lines.push("!");
  return lines.join("\n");
}

/**
 * Compress a VLAN set into a single "vxlan vlan … vni …" line with comma-separated ranges.
 * e.g. VLANs {10,11,12,20} → [" vxlan vlan 10-12,20 vni 10010-10012,10020"]
 * Returns a 1-element array (or empty array when vlansIterable is empty).
 * Pure function — exported for unit testing.
 */
function _compressVniLines(vlansIterable, vniBase) {
  const base = parseInt(vniBase) || 10000;
  const sorted = Array.from(vlansIterable)
    .map(v => parseInt(v))
    .filter(v => v >= 1 && v <= 4094)
    .sort((a, b) => a - b);
  if (sorted.length === 0) return [];
  const vlanParts = [];
  const vniParts = [];
  let i = 0;
  while (i < sorted.length) {
    const start = sorted[i];
    let end = start;
    while (i + 1 < sorted.length && sorted[i + 1] === end + 1) { i++; end = sorted[i]; }
    if (start === end) {
      vlanParts.push(`${start}`);
      vniParts.push(`${base + start}`);
    } else {
      vlanParts.push(`${start}-${end}`);
      vniParts.push(`${base + start}-${base + end}`);
    }
    i++;
  }
  return [` vxlan vlan ${vlanParts.join(',')} vni ${vniParts.join(',')}`];
}

/**
* Generates VXLAN Data Plane Config
* - Calculates VTEP IP (Loopback1 for MLAG, Loopback0 for Standalone)
* - Maps VNIs
* - [FIX] Flood List is ONLY generated if EVPN is DISABLED.
* - [FIX] Flood List ONLY includes Leaf VTEPs (GW + P2P), ignoring Spines.
*/
function generateVxlanBlock(isMlag, myId, peerId, gwVlans, allDevices, currentDeviceName, topo, sheetData, headers, isEvpnEnabled, vniBase, vtepNames, settings, ipPrefs) {
  const lines = [];
  lines.push("!");
  const s = settings || {};
  const addVtepIpv6 = s.vxlan_ipv6;  // gated on explicit VXLAN IPv6 flag only
  const loBase = parseInt(ipPrefs && ipPrefs.lo_base) || 0;

  // 1. Calculate My VTEP IP (IPv4 + IPv6)
  let myVtepIpV4 = "";
  let myVtepIpV6 = "";

  if (isMlag) {
    // Split Source IP — unique Lo1 per device (control plane/BGP), shared Lo10 (data plane VTEP)
    const myLoId   = (parseInt(myId)   || 0) + loBase;
    const peerLoId = (parseInt(peerId) || 0) + loBase;
    const low  = Math.min(myLoId, peerLoId);
    const high = Math.max(myLoId, peerLoId);

    // Lo1: unique per device (x.x.x.x)
    const myUniqIpV4 = `${myLoId}.${myLoId}.${myLoId}.${myLoId}`;
    const myUniqIpV6 = `${myLoId}:${myLoId}:${myLoId}::${myLoId}`;

    // Lo10: shared on both peers (x.x.y.y where x=min device id, y=max device id)
    myVtepIpV4 = `${low}.${low}.${high}.${high}`;
    myVtepIpV6 = `${low}:${low}:${high}::${high}`;

    lines.push("interface Loopback1");
    lines.push(" description VTEP_UNIQUE");
    lines.push(` ip address ${myUniqIpV4}/32`);
    if (addVtepIpv6) { lines.push(` no ipv6 address`); lines.push(` ipv6 address ${myUniqIpV6}/128`); }
    lines.push("!");

    lines.push("interface Loopback10");
    lines.push(" description VTEP_MLAG_SHARED");
    lines.push(` ip address ${myVtepIpV4}/32`);
    if (addVtepIpv6) { lines.push(` no ipv6 address`); lines.push(` ipv6 address ${myVtepIpV6}/128`); }
    lines.push("!");

    lines.push("interface Vxlan1");
    lines.push(" vxlan source-interface Loopback1");
    lines.push(" vxlan mlag source-interface Loopback10");
    lines.push(" vxlan virtual-router encapsulation mac-address mlag-system-id");

  } else {
    // Standalone Logic
    const myLoId = (parseInt(myId) || 0) + loBase;
    myVtepIpV4 = `${myLoId}.${myLoId}.${myLoId}.${myLoId}`;
    myVtepIpV6 = `${myLoId}:${myLoId}:${myLoId}::${myLoId}`;

    lines.push("interface Vxlan1");
    lines.push(" vxlan source-interface Loopback0");
  }

  lines.push(" vxlan udp-port 4789");

  // 2. VNI Mapping — consecutive VLANs collapsed into range lines via _compressVniLines()
  const resolvedVniBase = parseInt(vniBase) || 10000;
  if (gwVlans && gwVlans.size > 0) {
    _compressVniLines(gwVlans, resolvedVniBase).forEach(l => lines.push(l));
  }

  // 3. STATIC FLOOD LIST (IPv6 Support)
  if (!isEvpnEnabled) {
    const floodIps = new Set();

    allDevices.forEach(d => {
      if (d.name === currentDeviceName || d.type === 'non-arista') return;
      if (isMlag && parseInt(d.sheetIndex) === parseInt(peerId)) return;
      // Only include VTEP leaves (hasP2p && gwVlans.size > 0). Spines are underlay-only
      // and have no Vxlan1 interface — they must never appear in the flood list.
      if (vtepNames && vtepNames.size > 0 && !vtepNames.has(d.name)) return;

      let remoteVtepIp = "";
      const remotePeerName = topo.mlagPeerMap[d.name];

      if (remotePeerName) {
        // Shared IP Logic
        const remotePeerObj = allDevices.find(dev => dev.name === remotePeerName);
        if (remotePeerObj) {
          const id1 = parseInt(d.sheetIndex) + loBase;
          const id2 = parseInt(remotePeerObj.sheetIndex) + loBase;
          const low = Math.min(id1, id2);
          const high = Math.max(id1, id2);

          // Using IPv4 for Flood List (Standard Practice)
          remoteVtepIp = `${low}.${low}.${high}.${high}`;
        }
      } else {
        const remoteLoId = parseInt(d.sheetIndex) + loBase;
        remoteVtepIp = `${remoteLoId}.${remoteLoId}.${remoteLoId}.${remoteLoId}`;
      }

      if (remoteVtepIp && remoteVtepIp !== myVtepIpV4) {
        floodIps.add(remoteVtepIp);
      }
    });

    if (floodIps.size > 0) {
      const sortedList = Array.from(floodIps).sort((a, b) => {
        // Numeric sort for IPs (simple first octet check)
        return parseInt(a) - parseInt(b);
      });
      lines.push(` vxlan flood vtep ${sortedList.join(" ")}`);
    }
  }

  lines.push("!");
  return lines.join("\n");
}

/**
 * Creates a static snapshot of the current data and generated configurations.
 */
function createTopologySnapshot() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sourceSheet = ss.getSheetByName(SHEET_DATA);

  if (!sourceSheet) {
    SpreadsheetApp.getUi().alert("Error: Source sheet not found.");
    return;
  }

  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt('Create Sheet Checkpoint', 'Enter a name for this checkpoint (e.g., Stable_MLAG_Lab):', ui.ButtonSet.OK_CANCEL);

  if (response.getSelectedButton() !== ui.Button.OK) return;

  // Sanitize: replace whitespace with underscore, strip chars illegal in sheet names
  const safeName = response.getResponseText()
    .replace(/\s+/g, '_')
    .replace(/[\/\\:*?"<>|'\[\]]/g, '')
    .slice(0, 40) || 'checkpoint';
  const snapshotName = "SNAP_" + new Date().getTime() + "_" + safeName;

  try {
    // 1. Create the Snapshot Sheet
    const snapSheet = sourceSheet.copyTo(ss).setName(snapshotName);

    // 2. Convert all formulas to static values to preserve the "moment in time"
    const fullRange = snapSheet.getDataRange();
    fullRange.setValues(fullRange.getValues());

    // 3. Add metadata header
    snapSheet.insertRowsBefore(1, 2);
    snapSheet.getRange("A1").setValue("SNAPSHOT METADATA").setFontWeight("bold");
    snapSheet.getRange("A2").setValue("Created: " + new Date().toLocaleString() + " | Source: " + SHEET_DATA);
    snapSheet.setTabColor("orange");

    ss.toast("Snapshot created: " + snapshotName, "Success");

  } catch (e) {
    ui.alert("Snapshot Failed: " + e.message);
  }
}

/**
 * Lists all available snapshot tabs (those starting with SNAP_)
 */
function getSnapshotList() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheets()
    .filter(s => s.getName().startsWith("SNAP_"))
    .map(s => {
      const name  = s.getName();
      const parts = name.split('_');
      const ts    = parseInt(parts[1], 10);
      const label = parts.slice(2).join('_') || name;
      const dateStr = isNaN(ts) ? '' : new Date(ts).toLocaleString();
      return { name, label, dateStr };
    })
    .reverse();
}

/**
 * Computes a diff summary between the live sheet and a named snapshot.
 * Snapshot structure: rows 1-2 = metadata, row 3 = device names, row 4 = int_ headers, rows 5+ = data.
 */
function getSnapshotDiff(snapshotName) {
  const ss        = SpreadsheetApp.getActiveSpreadsheet();
  const liveSheet = ss.getSheetByName(SHEET_DATA);
  const snapSheet = ss.getSheetByName(snapshotName);
  if (!liveSheet || !snapSheet) throw new Error("Sheet missing.");

  const liveLastRow = liveSheet.getLastRow();
  const liveLastCol = liveSheet.getLastColumn();
  const snapLastRow = snapSheet.getLastRow();
  const snapLastCol = snapSheet.getLastColumn();

  if (snapLastRow < 4) throw new Error("Snapshot appears empty or corrupted.");

  const liveHeaders = liveLastRow >= 2
    ? liveSheet.getRange(2, 1, 1, liveLastCol).getValues()[0]
    : [];

  // Snapshot row 4 = original row 2 (int_ headers), after 2 metadata rows + row 1 device names
  const snapHeaders = snapSheet.getRange(4, 1, 1, snapLastCol).getValues()[0];

  const liveDevices = new Set(
    liveHeaders.filter(h => String(h).startsWith('int_')).map(h => String(h).slice(4))
  );
  const snapDevices = new Set(
    snapHeaders.filter(h => String(h).startsWith('int_')).map(h => String(h).slice(4))
  );

  const devicesAdded   = [...snapDevices].filter(d => !liveDevices.has(d));
  const devicesRemoved = [...liveDevices].filter(d => !snapDevices.has(d));

  // Data rows: live rows 3+ ; snapshot rows 5+
  const liveDataRows = Math.max(0, liveLastRow - 2);
  const snapDataRows = Math.max(0, snapLastRow - 4);

  let changedCells = 0;
  const overlapRows = Math.min(liveDataRows, snapDataRows);
  const overlapCols = Math.min(liveLastCol, snapLastCol);

  if (overlapRows > 0 && overlapCols > 0) {
    const liveData = liveSheet.getRange(3, 1, overlapRows, overlapCols).getValues();
    const snapData = snapSheet.getRange(5, 1, overlapRows, overlapCols).getValues();
    for (let r = 0; r < overlapRows; r++) {
      for (let c = 0; c < overlapCols; c++) {
        if (String(liveData[r][c]) !== String(snapData[r][c])) changedCells++;
      }
    }
  }

  return { devicesAdded, devicesRemoved, liveDataRows, snapDataRows,
           changedCells, rowDelta: snapDataRows - liveDataRows };
}

/**
 * Restores data from a snapshot tab back to the live target sheet.
 */
function restoreFromSnapshot(snapshotName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const liveSheet = ss.getSheetByName(SHEET_DATA);
  const snapSheet = ss.getSheetByName(snapshotName);

  if (!liveSheet || !snapSheet) throw new Error("Sheet missing.");

  // Snapshots have 2 extra metadata rows at the top.
  // We grab data starting from Row 3 (the original Row 1).
  const lastRow = snapSheet.getLastRow();
  const lastCol = snapSheet.getLastColumn();

  if (lastRow < 3) throw new Error("Snapshot appears empty.");

  const snapData = snapSheet.getRange(3, 1, lastRow - 2, lastCol).getValues();

  // Validate snapshot before touching live sheet
  if (!snapData || snapData.length === 0) throw new Error("Snapshot data is empty — restore aborted.");

  // Back up live sheet so we can rollback if the restore write fails
  const liveLastRow = liveSheet.getLastRow();
  const liveLastCol = liveSheet.getLastColumn();
  let liveBackup = null;
  if (liveLastRow > 0 && liveLastCol > 0) {
    liveBackup = liveSheet.getRange(1, 1, liveLastRow, liveLastCol).getValues();
  }

  try {
    liveSheet.clear();
    liveSheet.getRange(1, 1, snapData.length, lastCol).setValues(snapData);
    // Re-apply standard formatting (optional but recommended)
    syncSchemaPreservingOrder();
    return { success: true };
  } catch (e) {
    // Rollback: restore live backup if clear/write failed
    if (liveBackup) {
      try {
        liveSheet.clear();
        liveSheet.getRange(1, 1, liveBackup.length, liveBackup[0].length).setValues(liveBackup);
      } catch (rollbackErr) {
        console.error("restoreFromSnapshot rollback failed:", rollbackErr);
      }
    }
    throw new Error("Restore failed: " + e.message + (liveBackup ? " — original data has been restored." : " — WARNING: original data may be lost."));
  }
}

/**
 * UI Launcher for the Restore Wizard (with diff preview and human-readable dates).
 */
function showRestoreWizard() {
  const html = HtmlService.createTemplate(`
    <html>
      <head>
        <style>
          body{font-family:'JetBrains Mono',monospace;padding:15px;background:#f8fafc;font-size:12px;color:#1e293b;box-sizing:border-box}
          *{box-sizing:border-box}
          .title{font-weight:bold;margin-bottom:10px;font-size:13px}
          select{width:100%;padding:7px 8px;border-radius:4px;border:1px solid #cbd5e1;margin-bottom:10px;font-family:'JetBrains Mono',monospace;font-size:12px;background:#fff}
          .warning{font-size:11px;color:#b91c1c;background:#fee2e2;padding:10px;border-radius:4px;margin-bottom:10px}
          .btn-restore{background:#3b82f6;color:#fff;border:none;padding:9px 14px;border-radius:4px;cursor:pointer;font-weight:bold;width:100%;font-family:'JetBrains Mono',monospace;font-size:12px}
          .btn-restore:hover:not(:disabled){background:#2563eb}
          .btn-restore:disabled{background:#94a3b8;cursor:not-allowed}
          #diffPanel{display:none;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:4px;padding:10px;margin-bottom:10px;font-size:11px}
          #diffPanel.show{display:block}
          .diff-loading{color:#64748b;font-style:italic;text-align:center;padding:6px 0}
          .diff-row{display:flex;justify-content:space-between;margin-bottom:3px}
          .diff-label{color:#475569}
          .diff-value{font-weight:bold}
          .pos{color:#16a34a}.neg{color:#dc2626}.neu{color:#64748b}
          .diff-sub{margin-top:6px;border-top:1px solid #e2e8f0;padding-top:6px;font-size:10px}
          .diff-sub-lbl{color:#475569;margin-bottom:2px}
          .diff-sub-val{color:#0f172a;font-weight:bold;word-break:break-all}
          #statusMsg{text-align:center;padding-top:10px;color:#475569;font-size:11px;min-height:18px}
        </style>
      </head>
      <body>
        <div class="title">Restore Sheet Checkpoint</div>
        <? if (snapshots.length === 0) { ?>
          <div class="warning">No checkpoints found. Use <b>Create Sheet Checkpoint</b> first.</div>
        <? } else { ?>
        <select id="snapSelect" onchange="loadDiff()">
          <option value="">— Select a checkpoint —</option>
          <? snapshots.forEach(function(snap){ ?>
            <option value="<?= snap.name ?>"><?= snap.label ?> — <?= snap.dateStr ?></option>
          <? }); ?>
        </select>
        <div id="diffPanel">
          <div id="diffContent"><div class="diff-loading">Loading diff...</div></div>
        </div>
        <div class="warning">△ <b>Warning:</b> Restoring will overwrite ALL data in "<?= targetSheet ?>". This cannot be undone.</div>
        <button class="btn-restore" id="btnRestore" onclick="runRestore()" disabled>Restore Checkpoint</button>
        <div id="statusMsg"></div>
        <script>
          function loadDiff(){
            var val=document.getElementById('snapSelect').value;
            var panel=document.getElementById('diffPanel');
            var btn=document.getElementById('btnRestore');
            btn.disabled=true;
            if(!val){panel.classList.remove('show');return;}
            panel.classList.add('show');
            document.getElementById('diffContent').innerHTML='<div class="diff-loading">Loading diff...</div>';
            google.script.run
              .withSuccessHandler(function(d){
                var rd=d.rowDelta,rs=rd>0?'pos':rd<0?'neg':'neu',sg=rd>0?'+':'';
                var h='<div class="diff-row"><span class="diff-label">Live rows \u2192 Snapshot:</span>'
                  +'<span class="diff-value neu">'+d.liveDataRows+' \u2192 '+d.snapDataRows+'</span></div>'
                  +'<div class="diff-row"><span class="diff-label">Row delta:</span>'
                  +'<span class="diff-value '+rs+'">'+sg+rd+'</span></div>'
                  +'<div class="diff-row"><span class="diff-label">Changed cells:</span>'
                  +'<span class="diff-value '+(d.changedCells>0?'neg':'pos')+'">'+d.changedCells+'</span></div>';
                if(d.devicesAdded.length)
                  h+='<div class="diff-sub"><div class="diff-sub-lbl">Devices restored (not in live):</div>'
                    +'<div class="diff-sub-val">'+d.devicesAdded.join(', ')+'</div></div>';
                if(d.devicesRemoved.length)
                  h+='<div class="diff-sub"><div class="diff-sub-lbl">Devices removed (not in snapshot):</div>'
                    +'<div class="diff-sub-val">'+d.devicesRemoved.join(', ')+'</div></div>';
                document.getElementById('diffContent').innerHTML=h;
                document.getElementById('btnRestore').disabled=false;
              })
              .withFailureHandler(function(err){
                document.getElementById('diffContent').innerHTML='<div style="color:#b91c1c">Error: '+err.message+'</div>';
              })
              .getSnapshotDiff(val);
          }
          function runRestore(){
            var val=document.getElementById('snapSelect').value;
            if(!val)return;
            var btn=document.getElementById('btnRestore');
            btn.disabled=true;
            document.getElementById('snapSelect').disabled=true;
            document.getElementById('statusMsg').innerText='Restoring... Please wait.';
            google.script.run
              .withSuccessHandler(function(){google.script.host.close();})
              .withFailureHandler(function(err){
                document.getElementById('statusMsg').innerHTML='<span style="color:#b91c1c">Restore failed: '+err.message+'</span>';
                btn.disabled=false;
                document.getElementById('snapSelect').disabled=false;
              })
              .restoreFromSnapshot(val);
          }
        </script>
        <? } ?>
      </body>
    </html>
  `);

  html.snapshots = getSnapshotList();
  html.targetSheet = SHEET_DATA;
  SpreadsheetApp.getUi().showModalDialog(
    html.evaluate().setWidth(420).setHeight(430),
    'Restore Sheet Checkpoint'
  );
}

/**
 * Shows a modal dialog to reset the sheet to a clean new-project state.
 */
function showNewProjectDialog() {
  const html = HtmlService.createTemplate(`
    <html>
      <head>
        <style>
          body{font-family:'JetBrains Mono',monospace;padding:16px;background:#f8fafc;font-size:12px;color:#1e293b;box-sizing:border-box}
          *{box-sizing:border-box}
          .title{font-weight:bold;margin-bottom:10px;font-size:13px;color:#0f172a}
          .warning-box{background:#fef2f2;border:1px solid #fca5a5;border-radius:6px;padding:12px;margin-bottom:14px}
          .warning-title{font-weight:bold;color:#b91c1c;font-size:12px;margin-bottom:6px}
          .warning-text{color:#7f1d1d;font-size:11px;line-height:1.5}
          .check-row{display:flex;align-items:center;gap:8px;margin-bottom:10px;font-size:12px;color:#334155}
          .check-row input[type=checkbox]{width:14px;height:14px;cursor:pointer}
          .device-row{margin-bottom:14px}
          .device-label{font-size:11px;color:#64748b;margin-bottom:4px}
          input[type=text]{width:100%;padding:7px 8px;border-radius:4px;border:1px solid #cbd5e1;font-family:'JetBrains Mono',monospace;font-size:12px;background:#fff;color:#0f172a}
          input[type=text]:disabled{background:#f1f5f9;color:#94a3b8}
          .actions{display:flex;gap:8px;justify-content:flex-end}
          .btn-cancel{background:#f1f5f9;color:#475569;border:1px solid #cbd5e1;padding:8px 14px;border-radius:4px;cursor:pointer;font-family:'JetBrains Mono',monospace;font-size:12px}
          .btn-cancel:hover{background:#e2e8f0}
          .btn-reset{background:#dc2626;color:#fff;border:none;padding:8px 14px;border-radius:4px;cursor:pointer;font-weight:bold;font-family:'JetBrains Mono',monospace;font-size:12px}
          .btn-reset:hover:not(:disabled){background:#b91c1c}
          .btn-reset:disabled{background:#94a3b8;cursor:not-allowed}
          #statusMsg{text-align:center;padding-top:10px;color:#64748b;font-size:11px;min-height:16px}
        </style>
      </head>
      <body>
        <div class="title">New Project — Reset All Data</div>
        <div class="warning-box">
          <div class="warning-title">⚠ Warning: This action cannot be undone</div>
          <div class="warning-text">All port data, cabling, and configuration in the <b><?= targetSheet ?></b> sheet will be permanently erased. Consider creating a <b>Sheet Checkpoint</b> before proceeding.</div>
        </div>
        <div class="check-row">
          <input type="checkbox" id="chkKeepDevice" checked onchange="toggleDeviceInput()">
          <label for="chkKeepDevice">Keep one device as starting point</label>
        </div>
        <div class="device-row" id="deviceRow">
          <div class="device-label">Starting device name:</div>
          <input type="text" id="deviceName" value="Spine1" placeholder="e.g. Spine1">
        </div>
        <div class="actions">
          <button class="btn-cancel" onclick="google.script.host.close()">Cancel</button>
          <button class="btn-reset" id="btnReset" onclick="runReset()">Reset &amp; Start New Project</button>
        </div>
        <div id="statusMsg"></div>
        <script>
          function toggleDeviceInput() {
            var keep = document.getElementById('chkKeepDevice').checked;
            document.getElementById('deviceRow').style.display = keep ? 'block' : 'none';
          }
          function runReset() {
            var keep = document.getElementById('chkKeepDevice').checked;
            var name = keep ? (document.getElementById('deviceName').value || 'Spine1').trim() : '';
            if (!name && keep) { document.getElementById('deviceName').focus(); return; }
            document.getElementById('btnReset').disabled = true;
            document.getElementById('btnReset').innerText = 'Resetting...';
            document.getElementById('statusMsg').innerText = 'Please wait...';
            google.script.run
              .withSuccessHandler(function(){ google.script.host.close(); })
              .withFailureHandler(function(err){
                document.getElementById('statusMsg').innerHTML = '<span style="color:#dc2626">Error: ' + err.message + '</span>';
                document.getElementById('btnReset').disabled = false;
                document.getElementById('btnReset').innerText = 'Reset & Start New Project';
              })
              .resetToNewProject(keep, name);
          }
        </script>
      </body>
    </html>
  `);
  html.targetSheet = SHEET_DATA;
  SpreadsheetApp.getUi().showModalDialog(
    html.evaluate().setWidth(400).setHeight(330),
    'New Project — Reset All Data'
  );
}

/**
 * Clears the working sheet and optionally rebuilds it with a single seed device.
 * @param {boolean} keepDevice - If true, rebuild with one device.
 * @param {string}  deviceName - Name for the seed device (ignored when keepDevice=false).
 */
function resetToNewProject(keepDevice, deviceName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_DATA);
  if (!sheet) throw new Error('Working sheet "' + SHEET_DATA + '" not found.');

  // Validate before clearing — if rebuild will fail, don't touch the sheet
  if (keepDevice && deviceName) {
    const trimmed = deviceName.trim();
    if (!trimmed || !/^[a-zA-Z0-9_\-]{1,64}$/.test(trimmed)) {
      throw new Error('Invalid device name: "' + deviceName + '". Use alphanumeric, hyphens, or underscores (max 64 chars).');
    }
    deviceName = trimmed;
  }

  // Back up live data before clearing so we can rollback if rebuild fails
  const lastR = sheet.getLastRow();
  const lastC = sheet.getLastColumn();
  let backup = null;
  if (lastR > 0 && lastC > 0) {
    backup = sheet.getRange(1, 1, lastR, lastC).getValues();
  }

  try {
    sheet.clear();
    if (keepDevice && deviceName) {
      rebuildSheet([{ name: deviceName, type: 'full' }], null, false);
    }
  } catch (e) {
    if (backup) {
      try {
        sheet.clear();
        sheet.getRange(1, 1, backup.length, backup[0].length).setValues(backup);
      } catch (rollbackErr) {
        console.error("resetToNewProject rollback failed:", rollbackErr);
      }
    }
    throw new Error("Reset failed: " + e.message + (backup ? " — original data has been restored." : " — WARNING: original data may be lost."));
  }
}


/**
 * Server-side equivalent of client-side formatConfigText().
 * Sorts config map keys numerically and joins .full values with EOS section separator.
 */
function formatConfigMap(configMap) {
  if (!configMap) return "";
  const keys = Object.keys(configMap).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const parts = [];
  keys.forEach(k => { if (configMap[k] && configMap[k].full) parts.push(configMap[k].full); });
  return parts.join('\n!\n');
}

/**
 * Creates or overwrites the "Configs" sheet tab with formatted device configs.
 * Col A = device name headers, Col B = config lines. Tab color: indigo (#6366f1).
 */
function writeConfigsToSheet(configs) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = "Configs";
  let sheet = ss.getSheetByName(sheetName);
  if (sheet) { sheet.clear(); } else { sheet = ss.insertSheet(sheetName); }
  sheet.setTabColor("#6366f1");
  if (!configs.length) return sheetName;

  const rows = [];
  configs.forEach(cfg => {
    rows.push(["! === " + cfg.name + " ===", ""]);
    (cfg.text || "").split('\n').forEach(line => rows.push(["", line]));
    rows.push(["", ""]);
  });

  const range = sheet.getRange(1, 1, rows.length, 2);
  range.setValues(rows);
  range.setFontFamily("Consolas").setFontSize(10).setHorizontalAlignment("left").setVerticalAlignment("middle");

  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] && rows[i][0].startsWith("! ===")) {
      sheet.getRange(i + 1, 1, 1, 2)
        .setFontWeight("bold").setBackground("#1e1b4b").setFontColor("#e0e7ff");
    }
  }
  sheet.setColumnWidth(1, 220);
  sheet.setColumnWidth(2, 600);
  return sheetName;
}

/**
 * Generates EOS configs for all visible Arista devices and writes to "Configs" sheet.
 * Calls getDeviceConfig() per device (sequential). Returns { configs, sheetName } or { error }.
 */
function getAllDeviceConfigs() {
  try {
    const aristaVisible = (getExistingDevices() || []).filter(d => d.type === 'full' && d.isVisible);
    if (!aristaVisible.length) return { error: "No visible Arista devices found." };

    const configs = aristaVisible.map(dev => {
      const result = getDeviceConfig(dev.name);
      return {
        name: dev.name,
        text: (result && result.config) ? formatConfigMap(result.config) : "!! ERROR: Config generation failed."
      };
    });

    const sheetName = writeConfigsToSheet(configs);
    return { configs, sheetName };
  } catch (e) {
    return { error: e.message };
  }
}

// Not used by the script but used in IXIA TAB of Gsheet, hence needed
function SHEETNAME(dummy_cell) {
  return SpreadsheetApp.getActiveSheet().getName();
}

// ─────────────────────────────────────────────────────────────────
// SHEET ASSISTANT PANEL — GAS HELPERS
// ─────────────────────────────────────────────────────────────────

/**
 * Combined init call: returns device list + schema dropdown options in one round-trip.
 */
function getSheetAssistData() {
  return { devices: getSheetDeviceList(), opts: getSchemaOptions() };
}

/**
 * Returns attribute options (non-empty only) keyed by schema attribute key.
 * e.g. { sp_mode: [...], speed: [...], encoding: [...] }
 */
function getSchemaOptions() {
  const schema = getSchemaConfig();
  const opts = {};
  schema.forEach(function(item) {
    if (item.options && item.options.length > 0) opts[item.key] = item.options;
  });
  return opts;
}

/**
 * Returns all data rows (row 3+) that have at least one non-empty int_ cell.
 * Each entry: { rowNum, pairs: [{dev, port}, ...] }
 */
function getConnectionRows() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_DATA);
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 3 || lastCol < 1) return [];

  const headers = sheet.getRange(2, 1, 1, lastCol).getValues()[0];
  const dataRows = sheet.getRange(3, 1, lastRow - 2, lastCol).getValues();

  const intCols = [];
  headers.forEach(function(h, i) {
    if (String(h).startsWith('int_')) intCols.push({ col: i, dev: String(h).substring(4) });
  });

  const result = [];
  dataRows.forEach(function(row, ri) {
    const pairs = [];
    intCols.forEach(function(ic) {
      const port = row[ic.col];
      if (port !== null && port !== undefined && String(port).trim() !== '') {
        pairs.push({ dev: ic.dev, port: String(port).trim() });
      }
    });
    if (pairs.length > 0) result.push({ rowNum: ri + 3, pairs: pairs });
  });
  return result;
}

/**
 * Stamps attrsMap values onto every device present in each specified row.
 * Only overwrites columns that exist; skips blank attr values.
 */
function bulkUpdateRows(rowNumbers, attrsMap) {
  if (!rowNumbers || rowNumbers.length === 0) return { success: true, updated: 0 };
  if (!attrsMap || Object.keys(attrsMap).length === 0) return { success: true, updated: 0 };

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { error: 'Busy' };
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_DATA);
    if (!sheet) return { error: 'Sheet not found' };

    const lastCol = sheet.getLastColumn();
    const headers = sheet.getRange(2, 1, 1, lastCol).getValues()[0];
    const fieldMap = getFieldMap();

    const intCols = [];
    headers.forEach(function(h, i) {
      if (String(h).startsWith('int_')) intCols.push({ col: i, dev: String(h).substring(4) });
    });

    // Pre-resolve which (attrKey -> colOffset per device) to avoid redundant indexOf per row
    const attrEntries = Object.entries(attrsMap).filter(function([k, v]) {
      return v !== null && v !== undefined && String(v).trim() !== '';
    });

    let updated = 0;
    rowNumbers.forEach(function(rowNum) {
      const rowData = sheet.getRange(rowNum, 1, 1, lastCol).getValues()[0];
      // Collect all writes for this row, then apply in one batch via setValues on individual cells
      const writes = []; // [{col1idx, value}, ...]
      intCols.forEach(function(ic) {
        const port = rowData[ic.col];
        if (port === null || port === undefined || String(port).trim() === '') return;
        attrEntries.forEach(function(entry) {
          const attrKey = entry[0], attrVal = entry[1];
          const prefix = fieldMap[attrKey] || (attrKey + '_');
          const colIdx = headers.indexOf(prefix + ic.dev);
          if (colIdx !== -1) writes.push({ col: colIdx + 1, val: attrVal });
        });
      });
      // Apply writes: batch consecutive columns as single range where possible
      writes.sort(function(a, b) { return a.col - b.col; });
      writes.forEach(function(w) { sheet.getRange(rowNum, w.col).setValue(w.val); });
      if (writes.length > 0) updated++;
    });
    return { success: true, updated: updated };
  } catch (e) {
    return { error: e.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Per-device port summary: total ports present, connected (≥2 devices in row), orphan (1 device only).
 */
function getDevicePortSummary() {
  const devices = getSheetDeviceList();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_DATA);
  const empty = devices.map(function(d) { return { name: d.name, hostname: d.hostname, total: 0, connected: 0, orphan: 0 }; });
  if (!sheet || devices.length === 0) return empty;

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 3 || lastCol < 1) return empty;

  const headers = sheet.getRange(2, 1, 1, lastCol).getValues()[0];
  const dataRows = sheet.getRange(3, 1, lastRow - 2, lastCol).getValues();

  const intColMap = {};
  headers.forEach(function(h, i) {
    if (String(h).startsWith('int_')) intColMap[String(h).substring(4)] = i;
  });

  const counts = {};
  devices.forEach(function(d) { counts[d.name] = { total: 0, connected: 0, orphan: 0 }; });

  dataRows.forEach(function(row) {
    const present = [];
    devices.forEach(function(d) {
      const ci = intColMap[d.name];
      if (ci !== undefined) {
        const v = row[ci];
        if (v !== null && v !== undefined && String(v).trim() !== '') present.push(d.name);
      }
    });
    const isConn = present.length >= 2;
    present.forEach(function(devName) {
      counts[devName].total++;
      if (isConn) counts[devName].connected++;
      else counts[devName].orphan++;
    });
  });

  return devices.map(function(d) {
    const c = counts[d.name] || { total: 0, connected: 0, orphan: 0 };
    return { name: d.name, hostname: d.hostname, total: c.total, connected: c.connected, orphan: c.orphan };
  });
}

/**
 * Finds rows where devA and/or devB have a non-empty interface.
 * Activates the first result row in the sheet. Returns [{rowNum, portA, portB}].
 */
function searchConnectionRows(devA, devB) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_DATA);
  if (!sheet) return [];

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 3 || lastCol < 1) return [];

  const headers = sheet.getRange(2, 1, 1, lastCol).getValues()[0];
  const colA = devA ? headers.indexOf('int_' + devA) : -1;
  const colB = devB ? headers.indexOf('int_' + devB) : -1;

  if (devA && colA === -1) return [];
  if (devB && colB === -1) return [];

  // For extra attrs (speed/mode/vlan), use whichever device is specified as reference
  const refDev = devA || devB;
  const speedCol = refDev ? headers.indexOf('et_speed_' + refDev) : -1;
  const modeCol  = refDev ? headers.indexOf('sp_mode_' + refDev) : -1;
  const vlanCol  = refDev ? headers.indexOf('vlan_'    + refDev) : -1;

  const dataRows = sheet.getRange(3, 1, lastRow - 2, lastCol).getValues();
  const results = [];

  dataRows.forEach(function(row, ri) {
    const portA = colA !== -1 ? String(row[colA] || '').trim() : '';
    const portB = colB !== -1 ? String(row[colB] || '').trim() : '';
    const matchA = !devA || portA !== '';
    const matchB = !devB || portB !== '';
    if (matchA && matchB && (portA !== '' || portB !== '')) {
      results.push({
        rowNum: ri + 3,
        portA:  portA,
        portB:  portB,
        speed:  speedCol !== -1 ? String(row[speedCol] || '').trim() : '',
        mode:   modeCol  !== -1 ? String(row[modeCol]  || '').trim() : '',
        vlan:   vlanCol  !== -1 ? String(row[vlanCol]  || '').trim() : ''
      });
    }
  });

  if (results.length > 0) sheet.getRange(results[0].rowNum, 1).activate();
  return results;
}

/**
 * Activates a specific row in the sheet (used by FIND tab results click).
 */
function activateRow(rowNum) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_DATA);
  if (sheet) sheet.getRange(rowNum, 1).activate();
}


// ─────────────────────────────────────────────────────────────────
// CABLING HELPERS — server-side copies for unit testing
// DUPLICATED from Sidebar-js.html (intentional — Tests.gs is server-side and cannot
// call client-side JS). Keep in sync with Sidebar-js.html. Last synced: 2026-04-19
// ─────────────────────────────────────────────────────────────────

/**
 * DUPLICATED in Sidebar-js.html. Normalizes a breakout port to its lane-1 anchor.
 * Only called for confirmed QSFP-DD breakout ports (aggX guard in buildCableGroups).
 * Et14/4 → Et14/1, Et5/22/3 → Et5/22/1, Et14/1 → Et14/1, Et5 → Et5.
 * Last synced: 2026-04-19
 */
function getPhysicalPortParent(portName) {
  if (!portName) return "";
  var parts = portName.split('/');
  if (parts.length > 1) {
    var last = parts[parts.length - 1];
    if (!isNaN(parseInt(last))) {
      parts[parts.length - 1] = '1';
      return parts.join('/');
    }
  }
  return portName;
}

/**
 * DUPLICATED in Sidebar-js.html. Joins a sorted port array as a comma-separated list.
 * ["Et1", "Et3", "Et2"] → "Et1, Et2, Et3"
 */
function compressPortList(portArray) {
  if (portArray.length === 0) return "";
  if (portArray.length === 1) return portArray[0];
  portArray.sort(function(a, b) { return a.localeCompare(b, undefined, { numeric: true }); });
  return portArray.join(", ");
}

/**
 * DUPLICATED in Sidebar-js.html. Determines which side of a cable group is the SFP lane
 * (breakout) side vs the QSFP aggregate side.
 * Returns { a: bool, b: bool } — true means "this side shows individual lane ports".
 * QSFP aggregate side → bo=false; SFP lane side → bo=true.
 */
function _breakoutSides(g) {
  var count = g.links.length;
  if (count <= 1) return { a: false, b: false };
  var sA = (g.speedA || "").trim().toLowerCase() === 'auto' ? '' : (g.speedA || "").trim();
  var sB = (g.speedB || "").trim().toLowerCase() === 'auto' ? '' : (g.speedB || "").trim();
  var lA = sA.match(/^(\d+(?:\.\d+)?)[gt]-(\d+)$/i);
  var lB = sB.match(/^(\d+(?:\.\d+)?)[gt]-(\d+)$/i);
  if (lA && !lB && parseInt(lA[2]) === count) return { a: false, b: true };
  if (lB && !lA && parseInt(lB[2]) === count) return { a: true, b: false };
  var _gbps = function(s) { var m = s.match(/^(\d+(?:\.\d+)?)(g|t)/i); return m ? Math.round(parseFloat(m[1]) * (/t/i.test(m[2]) ? 1000 : 1)) : 0; };
  var sAn = _gbps(sA);
  var sBn = _gbps(sB);
  if (sAn > 0 && sBn > 0 && sAn !== sBn) {
    if (sAn * count === sBn) return { a: true, b: false };
    if (sBn * count === sAn) return { a: false, b: true };
  }
  if (g.isBreakoutA && !g.isBreakoutB) return { a: false, b: true };
  if (g.isBreakoutB && !g.isBreakoutA) return { a: true, b: false };
  return { a: false, b: false };
}

/**
 * Testable mirror of buildCableGroups() from Sidebar-js.html.
 * Accepts data as parameters instead of reading client-side globals, so Tests.gs can call it.
 * DUPLICATED in Sidebar-js.html (as buildCableGroups) — last synced: 2026-04-20
 *
 * @param {Array}  links       [{u:"dev:port", v:"dev:port", type:"snake"|undefined}, ...]
 * @param {Object} nodesData   {"dev:port": {device, name, details:{xcvr_speed_,xcvr_type_,et_speed_}}}
 * @param {Object} devicesData {"dev": {type:"arista"|"non-arista"}}
 * @returns {Object} cableGroups map — same shape as buildCableGroups() returns
 */
function _buildCableGroupsForTest(links, nodesData, devicesData) {
  var cableGroups = {};
  links.forEach(function(link) {
    var nodeA = nodesData[link.u];
    var nodeB = nodesData[link.v];
    if (!nodeA || !nodeB) return;

    var cmp = nodeA.device.localeCompare(nodeB.device, undefined, { numeric: true, sensitivity: 'base' });
    var first  = (cmp <= 0) ? nodeA : nodeB;
    var second = (cmp <= 0) ? nodeB : nodeA;

    var isSelfLoop      = nodeA.device === nodeB.device;
    var devAIsNonArista = ((devicesData[first.device]  || {}).type === 'non-arista');
    var devBIsNonArista = ((devicesData[second.device] || {}).type === 'non-arista');

    var speedA_raw = (first.details.xcvr_speed_  || first.details.et_speed_  || "").trim();
    var speedB_raw = (second.details.xcvr_speed_ || second.details.et_speed_ || "").trim();
    if (speedA_raw.toLowerCase() === 'auto') speedA_raw = '';
    if (speedB_raw.toLowerCase() === 'auto') speedB_raw = '';

    // Breakout detection: port has slash AND is a multi-lane transceiver.
    // Two signals for multi-lane:
    //   1. xcvr_speed_ in aggregate format (e.g. "100g-4") — explicit lane count
    //   2. xcvr_type_ starts with QSFP/OSFP — multi-lane capable (e.g. QSFP100 in 4x25G mode
    //      stores xcvr_speed_="25g" per lane, not aggregate)
    // Chassis native SFP ports (e.g. Et3/1 SFP25) have slash but xcvr_type_="SFP25" (no QSFP
    // prefix) and no aggregate speed — correctly excluded.
    var aggA = speedA_raw.match(/^(\d+(?:\.\d+)?)[gt]-(\d+)$/i);
    var aggB = speedB_raw.match(/^(\d+(?:\.\d+)?)[gt]-(\d+)$/i);
    var xcvrA = (first.details.xcvr_type_  || "").trim();
    var xcvrB = (second.details.xcvr_type_ || "").trim();
    var isMultiLaneA = !!aggA || /^[OQ]SFP/i.test(xcvrA);
    var isMultiLaneB = !!aggB || /^[OQ]SFP/i.test(xcvrB);

    var isBreakoutA = !isSelfLoop && !devAIsNonArista && first.name.includes('/') && isMultiLaneA;
    var isBreakoutB = !isSelfLoop && !devBIsNonArista && second.name.includes('/') && isMultiLaneB;
    var phyPortA    = (devAIsNonArista || !isBreakoutA) ? first.name  : getPhysicalPortParent(first.name);
    var phyPortB    = (devBIsNonArista || !isBreakoutB) ? second.name : getPhysicalPortParent(second.name);

    var groupKey;
    if      (isBreakoutA && !isBreakoutB && aggA)          groupKey = first.device + ':' + phyPortA + ' <-> ' + second.device;
    else if (isBreakoutB && !isBreakoutA && aggB)          groupKey = first.device + ' <-> ' + second.device + ':' + phyPortB;
    else if (isBreakoutA && isBreakoutB && aggA && !aggB)  groupKey = first.device + ':' + phyPortA + ' <-> ' + second.device;
    else if (isBreakoutA && isBreakoutB && aggB && !aggA)  groupKey = first.device + ' <-> ' + second.device + ':' + phyPortB;
    else if (isBreakoutA && isBreakoutB && aggA && aggB)   groupKey = first.device + ':' + phyPortA + ' <-> ' + second.device + ':' + phyPortB;
    else                                                   groupKey = first.device + ':' + first.name + ' <-> ' + second.device + ':' + second.name;

    if (!cableGroups[groupKey]) {
      cableGroups[groupKey] = {
        devA: first.device,  phyA: phyPortA,
        devB: second.device, phyB: phyPortB,
        isBreakoutA: isBreakoutA, isBreakoutB: isBreakoutB,
        links: [],
        speedA: first.details.xcvr_speed_  || first.details.et_speed_  || "",
        speedB: second.details.xcvr_speed_ || second.details.et_speed_ || "",
        xcvrA:  first.details.xcvr_type_  || "",
        xcvrB:  second.details.xcvr_type_ || ""
      };
    }
    cableGroups[groupKey].links.push({ portA: first.name, portB: second.name });
  });
  return cableGroups;
}