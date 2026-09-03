# CLI

The CLI mirrors the SDK layer-for-layer. Every command prints JSON on stdout
for machine consumption and human text for everything else; **every error is
machine-readable JSON on stderr** (see [Errors](./errors)).

## Commands

### `comfy import`

```
comfy import <workflow.json> [--out foo.ir.json] [--ts dir/workflow.ts] [--from defs.json]
```

Imports an existing workflow — editor v0.4, workflow v1, or API format,
detected automatically — into Graph IR. The `.ir.json` is the semantic truth;
`--ts` additionally emits an editable `workflow.ts`. Unknown custom nodes
become raw nodes with their original JSON preserved; ids, titles, and modes
survive. Integers beyond 2^53 stay lossless.

Route classes to a custom generated registry with `--registry <dir>`; classes
known to defs but absent from every registry emit as `rawNode(...)` so the
file always loads.

### `comfy snapshot`

```
comfy snapshot --url URL -o object_info.json
```

Captures the node universe (`/object_info`) — the input to `codegen`.

### `comfy lock`

```
comfy lock --url URL [-o comfy.lock.json]
```

Records the environment: ComfyUI version, `/object_info` hash, node packs.
`compile`, `validate`, and `run` check it and emit `E_LOCK_DRIFT` warnings on
drift — drift is reported, never silently ignored.

### `comfy codegen`

```
comfy codegen [--url URL | --from snapshot.json] -o src/nodes/gen [--exact-combos]
```

Generates typed node wrappers, the registry, defs/identifiers/catalog
snapshots, and `NODES.md`, all stamped with the source `objectInfoHash`.
Point `-o` at your own project directory to generate an external registry
(the documented module contract for custom-node SDKs).

### `comfy compile`

```
comfy compile <workflow.ts | graph.ir.json> [-o out.api.json] [--defs defs.json] [--lock comfy.lock.json] [--pretty]
```

Graph → validated, deterministic Comfy API JSON. Identical graphs produce
byte-identical files. The output is a build artifact — never hand-edited.

### `comfy validate`

```
comfy validate <file> [--url URL] [--defs defs.json] [--lock comfy.lock.json]
```

Checks a workflow against a defs universe **without queueing any work — it
never executes**. With `--url`, it validates against the live `/object_info`.

### `comfy run`

```
comfy run <file> --url URL [--param k=v ...] [--out outdir] [--defs defs.json] [--lock comfy.lock.json]
```

Compiles (if needed), submits, streams progress, and downloads artifacts into
`out/<runId>/` alongside `run.json` replay metadata.

### `comfy explain`

```
comfy explain <file | workflow.ts>
```

Prints what a workflow expands into — node list, wiring, recipe expansions.
The observability surface for "what did this actually create?"

### `comfy catalog`

```
comfy catalog [query] [--from catalog.json]
```

Grep-able node discovery over the generated catalog.

## Shared semantics

- `compile`, `validate`, and `run` accept `workflow.ts`, `.ir.json`
  documents, **and Comfy workflow JSON directly** (imported on the fly).
- Short flags work alongside long forms: `-o` (out), `-u` (url), `-d`
  (defs), `-p` (param), `-t` (ts), `-f` (from).
- Defs resolution order is: `--defs` flag → live `/object_info` via `--url` →
  bundled core defs (with an `E_LIVE_DEFS_UNAVAILABLE` warning when a live
  fetch was requested but failed).
- `--param seed=42` binds template params; repeatable.
