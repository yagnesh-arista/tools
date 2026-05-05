Print the TopoAssist UI element inventory (Section 26 of INSTRUCTIONS).

```bash
grep -A 120 "SECTION 26: UI ELEMENT INVENTORY" ~/claude/projects/topoassist/INSTRUCTIONS_topoassist.txt | sed '/^={5}/q'
```

After running, display the output directly to the user — no reformatting needed.
