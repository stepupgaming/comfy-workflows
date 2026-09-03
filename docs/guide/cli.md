# CLI

The `cwf` CLI mirrors the SDK layer-for-layer (`comfy-workflows` is an alias for the same binary). Every command prints JSON on stdout for machine consumption and human text for everything else; **every error is machine-readable JSON on stderr** (see [Errors](./errors)).

## Commands

### `cwf import`

```
cwf import <workflow.json> [--out foo.ir.json] [--ts dir/workflow.ts] [--from defs.json]
```

Imports an existing workflow — editor v0.4, workflow v1, or API format, detected automatically — into Graph IR. The `.ir.json` is the semantic truth; `--ts` additionally emits an editable `workflow.ts`. Unknown custom nodes become raw nodes with their original JSON preserved; ids, titles, and modes survive. Integers beyond 2^53 stay lossless.

Route classes to a custom generated registry with `--registry <dir>`; classes known to defs but absent from every registry emit as `rawNode(...)` so the file always loads.

### `cwf snapshot`

```
cwf snapshot --url URL -o object_info.json
```

Captures the node universe (`/object_info`) — the input to `codegen`.

### `cwf lock`

```
cwf lock --url URL [-o comfy.lock.json]
```

Records the environment: ComfyUI version, `/object_info` hash, node packs. `compile`, `validate`, and `run` check it and emit `E_LOCK_DRIFT` warnings on drift — drift is reported, never silently ignored.

### `cwf codegen`

```
cwf codegen [--url URL | --from snapshot.json] -o src/nodes/gen [--exact-combos]
```

Generates typed node wrappers, the registry, defs/identifiers/catalog snapshots, and `NODES.md`, all stamped with the source `objectInfoHash`. Point `-o` at your own project directory to generate an external registry (the documented module contract for custom-node SDKs).

### `cwf compile`

```
cwf compile <workflow.ts | graph.ir.json> [-o out.api.json] [--defs defs.json] [--lock comfy.lock.json] [--pretty]
```

Graph → validated, deterministic Comfy API JSON. Identical graphs produce byte-identical files. The output is a build artifact — never hand-edited.

### `cwf validate`

```
cwf validate <file> [--url URL] [--defs defs.json] [--lock comfy.lock.json]
```

Checks a workflow against a defs universe **without queueing any work — it never executes**. With `--url`, it validates against the live `/object_info`.

### `cwf init`

```
cwf init [name] --from <workflow.json> [--out dir] [--git] [--json] [--defs defs.json]
```

Turn an existing ComfyUI workflow JSON (editor v0.4, workflow v1, or API/prompt) into a complete standalone npm package: `package.json`, `comfy.workflow.json`, `workflow.ir.json`, `workflow.ts`, README, `.gitignore`. Semantics are preserved; nothing is rewritten. Prints portability warnings (checkpoints, absolute paths) and does not guess bypasses. `--git` runs `git init` in the new directory. `--json` emits the same report for agents. See [Convert a ComfyUI workflow into a package](./convert-workflow).

### `cwf suggest`

```
cwf suggest [dir] [--json]
```

Deterministic parameter suggestions (checkpoint, prompts, seed, size, steps, cfg, denoise, paths). Never mutates files.

### `cwf expose`

```
cwf expose <param-name> --node <node-id> --input <input-name> [--required] [--description ...] [--default ...]
```

Promote a concrete widget input to a package parameter. Updates IR, manifest, and `workflow.ts` together after validation. Machine-local paths never become portable defaults.

### `cwf run`

```
cwf run <file | package> --url URL [--param k=v ...] [--out outdir] [--defs defs.json] [--lock comfy.lock.json]
```

Compiles (if needed), submits, streams progress, and downloads artifacts into `out/<runId>/` alongside `run.json` replay metadata. The input may be a workflow file **or an installed workflow package name** — packages resolve through their manifest/IR directly and their JavaScript is never executed:

```
cwf run @stepupgaming/comfy-workflow-t2i --url http://127.0.0.1:8188 --param seed=42 ...
```

### `cwf pack`

```
cwf pack [dir] [--json]
```

Validates a workflow package before publication: package metadata, manifest schema, entry resolution, IR parsing, parameter/output coherence, node-class agreement, embedded machine-local paths, and the no-JS-execution property. Exits non-zero on any error. See [Workflow packages](./packages#authoring-a-workflow-package).

### `cwf inspect`

```
cwf inspect <package-or-path> [--url URL] [--json]
```

Prints a package's identity, parameters, outputs, and requirements — from manifest + IR, without running its code. With `--url`, additionally compares required node classes against the live instance (✓ available / ✗ missing). `--json` emits the report machine-readably. See [Workflow packages](./packages#inspecting-compatibility).

### `cwf explain`

```
cwf explain <file | workflow.ts>
```

Prints what a workflow expands into — node list, wiring, recipe expansions. The observability surface for "what did this actually create?"

### `cwf catalog`

```
cwf catalog [query] [--from catalog.json]
```

Grep-able node discovery over the generated catalog.

## Shared semantics

- `compile`, `validate`, and `run` accept `workflow.ts`, `.ir.json` documents, **and Comfy workflow JSON directly** (imported on the fly).
- Short flags work alongside long forms: `-o` (out), `-u` (url), `-d` (defs), `-p` (param), `-t` (ts), `-f` (from).
- Defs resolution order is: `--defs` flag → live `/object_info` via `--url` → bundled core defs (with an `E_LIVE_DEFS_UNAVAILABLE` warning when a live fetch was requested but failed).
- `--param seed=42` binds template params; repeatable.
