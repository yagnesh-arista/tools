#!/bin/bash
# Auto-publish EOS_CLI_Tricks.md → public_html/eos-tricks.html on every edit
input=$(cat)
f=$(echo "$input" | jq -r '.tool_input.file_path // ""')
[ "$f" = "/home/yagnesh/claude/projects/eos-tricks/EOS_CLI_Tricks.md" ] || exit 0

python3 - <<'EOF'
import markdown, pathlib
src = pathlib.Path('/home/yagnesh/claude/projects/eos-tricks/EOS_CLI_Tricks.md').read_text()
body = markdown.markdown(src, extensions=['tables', 'fenced_code'])
html = '''<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  body { font-family: "JetBrains Mono", monospace, sans-serif; max-width: 960px; margin: 40px auto; padding: 0 20px; font-size: 13px; color: #1e293b; }
  h1 { font-size: 20px; border-bottom: 2px solid #334155; padding-bottom: 6px; }
  h2 { font-size: 16px; background: #f1f5f9; padding: 6px 10px; border-left: 4px solid #3b82f6; margin-top: 28px; }
  h3 { font-size: 14px; color: #334155; margin-top: 18px; margin-bottom: 4px; }
  pre { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; padding: 10px 14px; overflow-x: auto; }
  code { font-family: "JetBrains Mono", monospace; font-size: 12px; }
  table { border-collapse: collapse; width: 100%; margin: 10px 0; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 10px; text-align: left; font-size: 12px; }
  th { background: #f1f5f9; font-weight: 600; }
  hr { border: none; border-top: 1px solid #e2e8f0; margin: 20px 0; }
  p { margin: 6px 0; }
</style></head><body>''' + body + '</body></html>'
pathlib.Path('/home/yagnesh/public_html/eos-tricks.html').write_text(html)
EOF
