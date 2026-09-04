# Slots and connections

Identity:

```
{ nodeId, outputIndex }
```

`.MODEL` / `.IMAGE` / `.slots[0]` / `.out(0)` are views of that pair.

Why index and not name: custom nodes duplicate names, leave them blank, or rename them. Editor links and API JSON are already index-based. Import stays lossless.

Type mismatch diagnostics use the **socket type string** from defs (`MODEL`, `CLIP`, `IMAGE`, …), not the handle name.

[Connections guide](/code/connections)
