Print the TopoAssist UI element inventory (Section 26 of INSTRUCTIONS).

```bash
grep -A 120 "SECTION 26: UI ELEMENT INVENTORY" ~/claude/projects/topoassist/INSTRUCTIONS_topoassist.txt | sed '/^={5}/q'
```

Copy the exact stdout from the bash result above and output it verbatim in a fenced code block.
