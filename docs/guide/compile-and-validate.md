# Compile & validate

Compilation is the layer that turns the canonical IR into the Comfy API JSON
build artifact. It is pure: `compile(graph, defs)` has no I/O, no hidden
randomness, and produces byte-identical output for identical graphs.

## Determinism

- Node ids are stable; emission order is sorted; inputs follow def order.
- The same graph against the same defs snapshot yields **byte-identical**
  JSON — asserted by golden tests.
- Seeds are explicit values, never ambient randomness, and are recorded in
  run metadata.

## What validation checks

Before any JSON is emitted (or submitted), the compiler walks the graph and
reports the first failures as structured errors — see
[Errors](./errors) for the taxonomy:

- unknown node type (`E_UNKNOWN_NODE_TYPE`)
- missing required inputs (`E_MISSING_INPUT`)
- connection type mismatches (`E_TYPE_MISMATCH`)
- combo values outside the allowed set (`E_BAD_COMBO`, with `allowed`)
- numeric params outside declared ranges (`E_RANGE`)
- undeclared or conflicting inputs (`E_UNKNOWN_INPUT`, `E_INVALID_INPUT`)
- cycles, with the path (`E_CYCLE`)
- muted nodes with consumers (`E_MUTED_CONSUMED`)
- malformed or dangling IR (`E_INVALID_GRAPH`, `E_INVALID_PARAM`)
- template placeholders/ports never bound (`E_UNBOUND_PARAM`, `E_UNBOUND_PORT`)
- `AssetRef`s that reached compilation without staging (`E_ASSET_UNSTAGED`)

`validate` performs exactly these checks and **never executes** — queueing
work on ComfyUI is exclusive to `run`.

## Combos and warnings

Static combo params (a fixed enum in the defs) fail hard on an unknown
value. File-backed combos (model/checkpoint/LoRA lists that ComfyUI fills
from disk) can't be verified locally, so an unknown-but-plausible value
produces a **warning** rather than an error — the server remains
authoritative and its rejection is normalized into the same structured shape.

## Bypass lowering is conservative

A bypassed node is lowered only when an explicit `bypassMap` says where each
output passes through (`g.setBypassMap`). Without one, compilation fails with
`E_UNRESOLVED_BYPASS` — the SDK never guesses wiring by type-matching. This
keeps imported workflows semantically honest: if the original graph relied on
implicit pass-through, you decide the mapping explicitly.

Muted nodes are similar: consuming a muted node is an error; pruning the dead
subgraph is an explicit choice, not an automatic rewrite.

## Lockfile drift

When `comfy.lock.json` is present, the defs hash recorded in it is compared
against the defs in use. A mismatch produces an `E_LOCK_DRIFT` **warning** on
stderr — visible, structured, never silent — while compilation continues.

## CLI

```bash
comfy compile workflows/foo/workflow.ts -o dist/foo.api.json --pretty
comfy validate workflows/foo/workflow.ts --url http://127.0.0.1:8188
```

Both accept `workflow.ts`, `.ir.json`, and Comfy workflow JSON directly (the
latter imports on the fly). See [CLI](./cli) for flags.
