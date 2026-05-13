#!/bin/bash
# settings v260513.1 | 2026-05-13 10:44:42
# Auto-publish UserGuide.html → public_html/topoassist-guide.html on every edit
input=$(cat)
f=$(echo "$input" | jq -r '.tool_input.file_path // ""')
[ "$f" = "/home/yagnesh/claude/projects/topoassist/UserGuide.html" ] || exit 0

cp /home/yagnesh/claude/projects/topoassist/UserGuide.html \
   /home/yagnesh/public_html/topoassist-guide.html && \
echo '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"[PUBLISH] UserGuide deployed → https://usercontent.infra.corp.arista.io/~yagnesh/topoassist-guide.html"}}'
