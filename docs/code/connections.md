# Connections and outputs

Slot identity is:

```ts
{ node: NodeId, out: number }
```

Output **name** is convenience. Output **index** is identity. Unnamed, duplicated, and renamed outputs all round-trip because the compiler never keys on the name.

## Handles

Generated specs expose named handles:

```ts
ckpt.MODEL   // first MODEL-typed output
ckpt.CLIP
ckpt.VAE
```

Positional forms always work:

```ts
ks.slots[0]
ks.out(0)
```

Custom nodes with duplicate output names, empty names, or "weird" `/object_info` still compile if you use index.

## Type mismatch

Wiring a `MODEL` into a `CLIP` input fails in the type checker when both specs are generated. At compile time the same mistake is `E_TYPE_MISMATCH` with `expected` / `got` / `nodeId` / `input`.

```json
{ "error": { "code": "E_TYPE_MISMATCH", "nodeId": "n5", "input": "clip", "expected": "CLIP", "got": "MODEL" } }
```

## `unsafe`

```ts
import { unsafe } from "@stepupgaming/comfy-workflows";
g.add(someSpec, { clip: unsafe(ckpt.MODEL) });
```

That is a deliberate type-system bypass. It does not disable validation of everything else. [Escape hatches](/code/escape-hatches).

## Graph outputs vs node outputs

`g.output(handle, { name })` declares what the **runtime** should return as artifacts. Node output handles are how you wire the graph. Do not confuse the two.

## List-valued inputs

Some nodes take arrays of connections. Pass an array of handles. IR stores `SlotRef[]`.
