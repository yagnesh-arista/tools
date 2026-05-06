#!/bin/bash
# tmux.conf v260506.3 | 2026-05-06 17:04:54
# tmux_ai_spend.sh — AI spend widget for tmux status bar
# Called by status-right: #(~/.tmux/tmux_ai_spend.sh '#{session_name}')
# Refreshes cache on every tmux tick (every 60s via status-interval),
# independent of bash PROMPT_COMMAND — so it stays current during claude sessions.

SESSION="$1"
CACHE="$HOME/.cache/ai-spend.json"
KEY_FILE="$HOME/.ai-proxy-api-key"
API_URL="https://ai-proxy.infra.corp.arista.io/key/info"

# Only show in sessions that have a pane actively running claude
tmux list-panes -s -t "$SESSION" -F "#{pane_current_command}" 2>/dev/null \
    | grep -qx claude || exit 0

# Refresh cache if missing or stale (>60s) — async, non-blocking
if [[ ! -f "$CACHE" ]] || \
   (( $(date +%s) - $(stat -c %Y "$CACHE" 2>/dev/null || echo 0) > 60 )); then
    TMP="${CACHE}.tmp.$$"
    ( ( curl -sf --max-time 5 \
            -H "Authorization: Bearer $(cat "$KEY_FILE" 2>/dev/null)" \
            "$API_URL" 2>/dev/null \
          | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps({'spend':d['info']['spend'],'max_budget':d['info']['max_budget']}))" \
          > "$TMP" && mv "$TMP" "$CACHE" || rm -f "$TMP"
      ) &>/dev/null & ) 2>/dev/null
fi

# Display cached value (next tick picks up async refresh result)
[[ -f "$CACHE" ]] || exit 0

python3 <<'PYEOF' 2>/dev/null
import json, sys, os
try:
    d = json.load(open(os.path.expanduser('~/.cache/ai-spend.json')))
    s, m = d['spend'], d['max_budget']
    if not m: sys.exit()
    p = int(s / m * 100)
    c = 'green' if p < 41 else 'colour214' if p < 71 else 'colour203' if p < 91 else 'colour160'
    # Sonnet 4.6: $3/M input, $15/M output, ~80/20 split → ~$5.4/M avg
    tok = s / 5.4
    tok_str = f'~{tok:.1f}M' if tok >= 1 else f'~{tok*1000:.0f}K'
    print(f'#[fg=colour172]▌◆ #[fg={c}]${s:.2f}#[fg=colour245]/{int(m)} {tok_str}#[fg=colour172]▐#[fg=default]')
except:
    pass
PYEOF
