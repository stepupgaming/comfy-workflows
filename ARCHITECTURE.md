# comfy-sdk — Architecture

This document is the design record: what each layer owns, what invariants it
enforces, and why the non-obvious decisions were made.

## The core idea

ComfyUI is treated as a **backend compiler target**. You depend on its runtime,
execution engine, model loaders, and custom-node ecosystem — but you do not
program in its node editor. The SDK's TypeScript/Graph IR layer replaces the
editor as the authoring environment:

```
Recipes             ← domain operations (textToImage, hiresFix, …)
   │
Typed node SDK      ← g.add(KSampler, { model, seed: 42n, … })  [rawNode/unsafe escape hatches]
   │
Graph IR            ← canonical semantic truth (plain JSON, diffable, agent-emittable)
   │  validate (types, combos, ranges, cycles, bypass)
Comfy compiler      ← pure (graph, defs) → API JSON, byte-deterministic
   │
Comfy runtime       ← HTTP + WS execution, artifacts, asset staging
   │
ComfyUI             ← execution only
```

Canonicality is a three-way split:

- **Graph IR** — canonical _semantic_ representation (the `.ir.json` file).
- **TypeScript** — canonical _authoring_ representation for workflows people
  and agents edit (the `workflow.ts` file).
- **Comfy API JSON** — never canonical. It's a build artifact, like a `.wasm`.

## Source formats and import

Comfy has several JSON shapes; the importer handles each explicitly:

| Format                                 | Detect                        | Notes                                                             |
| -------------------------------------- | ----------------------------- | ----------------------------------------------------------------- |
| Editor/save (legacy, `"version": 0.4`) | `nodes` array + `links`       | links table, positional `widgets_values`                          |
| Workflow v1 (versioned schema)         | `nodes` array, `version >= 1` | same structural path, named widget maps supported                 |
| API/prompt format                      | id → `{class_type, inputs}`   | connections are `["<id>", <slotIndex>]` — already index-canonical |

Import fidelity rules:

- **Ids preserved verbatim** — diffs against the source are meaningful, and
  Comfy-side node errors map back to the same ids.
- **Positional widget decoding requires defs** (`widgets_values` order comes
  from `/object_info`, including the extra `control_after_generate` dropdown
  value after seed widgets). `comfy import --from <defs>` or `--url` gives
  full fidelity; without defs, unknown nodes still round-trip as raw nodes.
- **Frontend built-ins are resolved the way Comfy resolves them at export**:
  `Reroute` chains are traced; `PrimitiveNode` values are inlined into the
  widget inputs they feed.
- **Modes preserved**: `0=active`, `2=muted`, `4=bypassed`.
- **Nothing is silently dropped**: unknown metadata lands in
  `node.source = { format, raw }` — not interpreted, never lost.

## Graph IR invariants

1. **Plain tagged JSON.** Persisted IR survives ordinary `JSON.parse`:
   integers that JS can't represent exactly are written as
   `{"seed": {"$int": "18446744073709551615"}}`. In memory they are `bigint`.
   `{"$int"}` is a reserved tag (documented; do not use it as a literal key).
2. **Slot identity is `{nodeId, outputIndex}`.** Output names are metadata and
   generated handle sugar only. Unnamed, duplicated, renamed, and arbitrary
   custom-node outputs all remain representable (`out(i)` positional access).
   This is also why import fidelity is easy: both API JSON and editor links
   are index-based natively.
3. **Deterministic ordering everywhere**: node ids sort numeric-aware
   (`n2 < n10`), compiled output sorts ids and emits inputs in def order.
   `compile(graph) === compile(graph)` byte-for-byte, enforced by test.
4. **Templates are data.** A template is just a Graph whose params hold
   `{$param: "name"}` placeholders plus a `params` def table (and optional
   `ports` for unbound inputs). `instantiateTemplate` substitutes, binds, and
   renumbers deterministically — so recipes are values you can serialize,
   diff, and compose. Transforms (`withLora`, `hiresFix`, …) operate on
   parametrized graphs; placeholders survive composition.
5. **AssetRef is a first-class param value** (`{"$asset": "path"}` on disk).
   The runtime stages it (upload) and rewrites to the server filename before
   submission. Full asset management is deferred; the seam is not.

## Compilation

`compile(graph, defs?)` = **conservative bypass lowering → validation →
deterministic emit**. Pure function; the result is `{object, json, hash,
warnings}` or structured `errors`.

**Bypass lowering never guesses.** A bypassed node's pass-through semantics
live in the Comfy frontend and are node-specific — "exactly one same-typed
input" is NOT treated as proof. Resolution requires an explicit mapping:

1. an explicit `bypassMap` on the node (output index → input name), set
   directly (`g.setBypassMap`) or derived by the importer — the editor-format
   importer records `bypassMap` when a bypassed node's output type matches
   exactly one connected input, making the derivation visible and inspectable
   in the IR rather than silently invented at compile time.

Without a mapping → `E_UNRESOLVED_BYPASS`, always. Muted nodes with
consumers → `E_MUTED_CONSUMED`.

**Validation** produces machine-readable errors (`code`, `nodeId`, `input`,
`expected`, `got`, `allowed`, `hint`). Notable policy: combo values are
validated against defs, but _file-backed_ combos (anything file-like — model
names, images) that aren't in the snapshot degrade to **warnings**, because
only the server knows its actual files; static enums (samplers, schedulers)
remain hard errors. The server's own `/prompt` validation is authoritative at
submit time.

**Emit**: nodes in canonical id order, inputs in def order, `_meta.title`
from the node title (or display name) — then `serializeComfyJson`, which
writes bigints as raw numeric literals. This is the only place big integers
become untagged.

## Lossless integer pipeline

```
API JSON text   →  parseJsonLossless (custom parser: >2^53 integers → bigint)
                →  IR (bigint)       →  IR file ({ "$int": "…" } — JSON.parse-safe)
                →  compile           →  serializeComfyJson (raw literal)
                →  POST /prompt body ← assembled by STRING CONCATENATION
```

The submission envelope is never built by `JSON.stringify({prompt: <parsed>})`
— parsing the prompt back into JS would silently destroy >2^53 integers.
The runtime POSTs the compiled JSON string verbatim inside the envelope.

## Codegen

`comfy codegen` turns `/object_info` (live or snapshot) into:

- per-category wrapper modules (`defineNode(...)` spec objects using the
  `conn/int/float/str/bool/combo` helpers, whose literal-preserving generics
  give exact connection types and required/optional params),
- a registry (`specs: Record<classType, NodeSpec>` + top-level named exports),
- the normalized defs snapshot (`defs.json`, stamped with the objectInfoHash),
- `catalog.json` + `NODES.md` for grep-able node discovery.

Generated code is **committed** — reviewable diffs, builds without a server.
Regenerate with `comfy codegen --url <instance>` when custom nodes change.

Combo typing: wrappers type combos as `string` by default (portable across
servers — file lists differ per machine) with compile-time validation against
defs; `--exact-combos` emits literal tuples for typed unions when you want
strict, per-server literals.

Type-safety mechanism note: the helpers use **overloads** (not generic
inference) for the `required` flag — inferring a literal from an optional
property is unreliable under contextual typing, while overload resolution is
deterministic. `defineNode` keeps `inputs` and `outputs` as direct inference
sites so per-output literal types survive into handle accessors
(`.MODEL`, `.slots[0]`).

## Runtime

`createClient({url, headers?, defs?, fetchImpl?, wsFactory?})`. Injection
seams keep the client testable without a Comfy instance (tests use an
in-process mock server that asserts the exact wire body). Defs are optional
at both client and call level (`runOpts.defs` overrides); local defs give
early structured errors before any network call, while **server-side
validation stays authoritative** — the server's `/prompt` response is the
final word on whether a graph can execute.

`run()` pipeline: stage assets → compile (with defs when provided) → POST
`/prompt` (body string verbatim) → WS `/ws?clientId` typed events →
`/history/{id}` → `/view` downloads → `<outDir>/<runId>/` artifacts +
`run.json`. WS failure degrades to polling `/history`.

`run.json` is the replay record: params, `graphHash`, `defsHash`,
`compiledJson` (the exact wire body as a string — never JSON.parse'd back, so

> 2^53 integers stay byte-perfect; re-POST it to reproduce the run), the
> artifact list, and warnings. `runAll()` executes sweeps with a
> bounded-concurrency worker pool. `validate()` never executes: it fetches the
> live `/object_info`, parses it into defs, and validates locally against that
> universe — only `run()` may queue work. Client `headers` (auth) are sent on
> every HTTP request including `/history` and `/view`; native WebSocket cannot
> carry custom auth headers, so authenticated WS connections require a custom
> `wsFactory` (without one, the client falls back to authenticated `/history`
> polling).

Environment locking: `comfy lock` captures the universe (version,
objectInfoHash, node packs) and `compile`/`validate`/`run` compare the defs
(or the live instance) against `comfy.lock.json`, reporting `E_LOCK_DRIFT` as
a warning — a mismatch informs, it never silently blocks.

## Versioning & compatibility

- The IR document version (`irVersion: 1`) and the lock format
  (`comfy-lock` v1) are explicit and versioned.
- `/object_info` is the machine contract of a Comfy instance; the parser
  normalizes defensively (custom nodes vary widely) and the socket-type
  registry (all node output types + a base set) disambiguates combo specs
  from socket specs — the same heuristic the ComfyUI frontend uses.
- Node >= 22 (native `WebSocket`), ESM, TypeScript strict.
