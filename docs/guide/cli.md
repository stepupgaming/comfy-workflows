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
cwf init [name] --from <workflow.json> [--out dir] [--git] [--json] [--defs defs.json] [--url URL]
```

Turn an existing ComfyUI workflow JSON (editor v0.4, workflow v1, or API/prompt) into a complete standalone npm package: `package.json`, `comfy.workflow.json`, `workflow.ir.json`, `workflow.ts`, README, `.gitignore`. Semantics are preserved; nothing is rewritten. Prints portability warnings (checkpoints, absolute paths) and does not guess bypasses. `--url` optionally discovers Comfy Registry node-pack metadata (never installs). `--git` runs `git init` in the new directory. `--json` emits the same report for agents. See [Convert a ComfyUI workflow into a package](./convert-workflow).

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
cwf pack [dir] [--json] [--publish]
```

Validates a workflow package before publication: package metadata, manifest schema, entry resolution, IR parsing, parameter/output coherence, node-class agreement, embedded machine-local paths, and the no-JS-execution property. Exits non-zero on any error. Unresolved classes stay warnings — absence from the bundled core snapshot is not proof they are custom. `--publish` still fails contradictory/invalid pack metadata. See [Workflow packages](./packages#authoring-a-workflow-package).

### `cwf inspect`

```
cwf inspect <package-or-path> [--url URL] [--json]
```

Prints a package's identity, parameters, outputs, and requirements — from manifest + IR, without running its code. With `--url`, additionally compares required node classes against the live instance (✓ available / ✗ missing) and reports declared node packs (installed / missing / version unknown). `--json` emits the report machine-readably, including a `dependencies` object. Inspect never installs anything. See [Custom-node dependencies](./custom-nodes) and [Workflow packages](./packages#inspecting-compatibility).

### `cwf resolve-nodes`

```
cwf resolve-nodes <package-or-path> [--url URL] [--write] [--json]
```

Maps missing (or all non-core) node classes to Comfy Registry packs after verifying pack-version definitions. The single-class Registry lookup is a hint only. Without `--write` this is read-only. With `--write` it merges **verified** `requires.nodePacks` into `comfy.workflow.json` (specVersion 2). Ambiguous **verified** ownership exits non-zero with `E_NODE_PACK_AMBIGUOUS`; unknown classes report `E_NODE_PACK_UNKNOWN`. No LLM, no guess-from-repo-name, no ranked false-positive installs.

### `cwf node-pack`

```
cwf node-pack add <registry-id> --provides FooNode,BarNode [--dir pkg] [--name ...] [--version ...]
cwf node-pack map <class> <registry-id> [--dir pkg]
```

Manually declare pack metadata when the registry cannot identify an owner. Entries are `source: "manual"` and still have to pass manifest validation. They are not auto-installed by `cwf setup`.

### `cwf setup`

```
cwf setup <package-or-path> --comfy <Comfy-install-path> [--url URL] [--yes] [--dry-run] [--json]
```

Prepares a **local** Comfy installation for a workflow. Prints the exact registered packs **and versions** that will be installed (executable Python), asks `Continue? [y/N]` (default No), then delegates to ComfyUI-Manager `cm-cli.py install <id>@<exact>`. Uses the target Comfy Python (`python_embeded` on portable Windows). `--yes` approves the **verified** plan; it does not relax source policy, choose ambiguous providers, or install unsatisfied ranges. `--dry-run` prints the plan and installs nothing. Remote `--url` without `--comfy` plans but does not apply. See [Custom-node dependencies](./custom-nodes).

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
