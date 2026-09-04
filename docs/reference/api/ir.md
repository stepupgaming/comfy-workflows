# IR API

`@stepupgaming/comfy-workflows/ir` (also re-exported from the root).

| Symbol | Purpose |
| ------ | ------- |
| `Graph`, `NodeInstance`, `SlotRef`, `ParamRef` | Types |
| `createGraph` / `addNode` / `connect` | Imperative IR (prefer the builder) |
| `serializeGraph` / `parseGraph` | Tagged IR JSON |
| `instantiateTemplate` | Bind params/ports, renumber |
| `graphHash` / `canonicalIrString` | Content address |
| `slot(node, out)` | Build a SlotRef |
| `parseIrJson` / `serializeIrJson` | Tagged values |
| `serializeComfyJson` | Wire JSON with raw bigint literals |

Most apps should not build IR by mutating `nodes` dicts. Use `workflow()`.

[Graph IR](/concepts/graph-ir)
