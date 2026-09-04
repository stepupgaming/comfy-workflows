# Escape hatches

Two doors. Not the front entrance.

## `rawNode`

For a class your defs snapshot cannot describe (missing from `/object_info`, or `/object_info` is junk).

```ts
const n = g.rawNode(
  "SomeUnregisteredNode",
  { model: ckpt.MODEL, strength: 0.5 },
  { outputs: [{ name: "MODEL", type: "MODEL" }], id: "9" },
);
n.out(0);
```

Params are validated structurally only. Imports of unknown custom nodes produce exactly this, with original JSON on `node.source`.

**`rawNode` is not how you consume custom nodes.** Snapshot + codegen is. If the class appears in live `/object_info`, regenerate wrappers and `g.add(spec, …)`.

`rawNode` is also not remote code execution. The Python still lives in Comfy. You are only naming a class the type system does not know.

## `unsafe`

```ts
import { unsafe } from "@stepupgaming/comfy-workflows";
g.add(spec, { clip: unsafe(ckpt.MODEL) });
```

Widens any output to any input. Use it when a custom node lies about socket types. It does **not** turn off combo checks, range checks, cycle detection, or unbound-param errors.

## What they do not mean

| Phrase | Reality |
| ------ | ------- |
| "custom node" | Generate wrappers from `/object_info` |
| "skip validation" | There is no such flag |
| "the compiler will guess" | It will not. `E_UNRESOLVED_BYPASS` instead |

<<< @/examples-src/escape.ts
