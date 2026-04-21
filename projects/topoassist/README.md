# TopoAssist — Network Topology & Config Manager

A Google Apps Script sidebar for managing Arista EOS lab topologies directly in Google Sheets.  
Build topologies visually, generate EOS configs, audit cabling via LLDP, and push configs live — all from a spreadsheet.

---

## Installation

### Prerequisites
- A Google account with access to Google Sheets
- The sheet and Apps Script project must be in the same account

---

### Option A — clasp (recommended for developers)

**1. Clone the repo**
```bash
git clone https://github.com/yagnesh-arista/tools.git
cd tools/projects/topoassist
```

**2. Create a Google Sheet & Apps Script project**
1. Open [sheets.new](https://sheets.new) (or use an existing sheet)
2. Go to **Extensions → Apps Script**
3. Click **Project Settings** (gear icon) and copy your **Script ID**

**3. Install clasp & authenticate**
```bash
npm install -g @google/clasp
clasp login --no-localhost
```
Clasp prints a Google OAuth URL — open it in a browser, sign in with the Google account that owns the sheet, then paste the redirect URL back into the terminal. Use `--no-localhost` so the flow works on remote/SSH machines where localhost:8888 is not reachable.

**4. Point clasp at your script & push**

Edit `.clasp.json` in the `topoassist/` folder — replace the `scriptId` with yours:
```json
{"scriptId": "YOUR_SCRIPT_ID_HERE", "rootDir": "."}
```

Then push:
```bash
clasp push --force
```

**5. Run the initialiser**
1. In the Apps Script editor, select `onOpen` and click **Run** (grants permissions)
2. Return to your Google Sheet — a **TopoAssist** menu appears in the menu bar
3. Open **TopoAssist → Topology Manager → Open Visualizer** to launch the sidebar

---

### Option B — Manual (no tools required)

**1. Create a Google Sheet & Apps Script project**
1. Open [sheets.new](https://sheets.new)
2. Go to **Extensions → Apps Script**
3. Delete the default content in `Code.gs` (keep the file)

**2. Copy files from this repo**

For each file below: click the file on GitHub, copy the raw content, paste into the Apps Script editor.

| GitHub file | Apps Script type | Action |
|---|---|---|
| `Code.gs` | Script | Paste into the existing `Code.gs` |
| `Sidebar.html` | HTML | **+ Add file → HTML** → name it `Sidebar` |
| `Sidebar-js.html` | HTML | **+ Add file → HTML** → name it `Sidebar-js` |
| `Sidebar-css.html` | HTML | **+ Add file → HTML** → name it `Sidebar-css` |
| `SheetAssistPanel.html` | HTML | **+ Add file → HTML** → name it `SheetAssistPanel` |
| `UserGuide.html` | HTML | **+ Add file → HTML** → name it `UserGuide` |
| `Tests.gs` | Script | **+ Add file → Script** → name it `Tests` |

**3. Save & run the initialiser**
1. Press **Ctrl+S** (Cmd+S on Mac) to save all files
2. Select `onOpen` and click **Run** to grant permissions
3. Return to your Google Sheet — the **TopoAssist** menu will appear

---

## Device Bridge (optional — for live device checks)

The Device Bridge (`device_bridge.py`) is a lightweight local Python server that gives TopoAssist live SSH/eAPI/REST/gNMI access to lab devices — no cloud dependency.

**1. Get the script**

From the sidebar: open the **Device Bridge** modal (shield icon) → **Download Bridge**.

Or directly:
```bash
curl -O https://raw.githubusercontent.com/yagnesh-arista/tools/main/projects/topoassist/device_bridge.py
```

**2. Requirements**

Python 3.8+. No pip installs needed for SSH/eAPI/REST modes.  
For gNMI only:
```bash
pip install pygnmi
```

**3. Configure & run**

Edit the config block at the top of `device_bridge.py`:

| Variable | Default | Description |
|---|---|---|
| `METHOD` | `"ssh"` | Transport: `ssh`, `eapi`, `rest`, or `gnmi` |
| `JUMP_HOST` | `""` | SSH jump server hostname; `""` = direct |
| `SSH_USER` | `"admin"` | Device login username (passwordless SSH) |

```bash
python3 device_bridge.py
```

The bridge listens on `http://localhost:8765`. The Device Bridge modal shows a green dot when reachable.

---

## Features

- **Topology Visualizer** — live SVG canvas with drag, zoom, edit mode, group rectangles
- **Auto Config Generation** — EOS configs for P2P/GW/L2/MLAG/VXLAN/EVPN/BGP/OSPF
- **LLDP Audit** — verify physical cabling matches the topology sheet
- **Config Push** — send generated configs directly to devices via Device Bridge
- **Sheet View** — show/hide devices and columns without losing data
- **Checkpoints** — snapshot and restore sheet state
- **Cabling Reports** — export patch lists by device or by link
