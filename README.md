# Comfy Workflows

**Code-first, typed, composable workflows for ComfyUI.**

Author workflows in TypeScript, share them as npm packages, compile deterministically, run on any ComfyUI instance. Graph IR is the canonical semantic representation; Comfy API JSON is a build artifact — generated, never hand-edited; ComfyUI is the execution backend.

> Unofficial project. Not affiliated with or endorsed by Comfy Org.

Official Comfy SDKs focus on API execution. Comfy Workflows focuses on workflow authoring, import, Graph IR, deterministic compilation, composition, packaging, and distribution.

```
existing Comfy workflows (editor v0.4 / workflow v1 / API JSON)
        │ cwf import
        ▼
   <name>.ir.json  ──────────────  Graph IR  ◄── semantic truth
        │ (optional cwf import --ts)   ▲
        ▼                                │ evaluate
   workflows/<name>/workflow.ts  ────────┘   (edit / combine / refactor / recipes)
        │
        ▼ compile   (defs snapshot + comfy.lock.json)
   Comfy API JSON  (build artifact — or never hits disk: comfy.run(template))
        ▼
   ComfyUI (local or remote, execution only)
```

Agent hierarchy — work at the highest level that works, drop down when needed:

```
Workflow packages  →  Recipes  →  Typed node SDK  →  Graph IR  →  Compiler  →  Runtime
```

## Install

```sh
npm install @stepupgaming/comfy-workflows
# or: pnpm add @stepupgaming/comfy-workflows
```

## Author

```ts
import { textToImage, hiresFix, instantiateTemplate, createClient } from "@stepupgaming/comfy-workflows";

// One call → ~7 nodes. Returns a template graph.
const tpl = textToImage({
  checkpoint: "v1-5-pruned-emaonly.safetensors",
  positivePrompt: "a lighthouse at dusk, cinematic lighting",
  seed: 42n,
});

// Compose: latent upscale + second sampling pass (+2 nodes).
const withHires = hiresFix(tpl, { scaleBy: 1.5, denoise: 0.45 });

// Execute (JSON never hits disk; seeds are explicit and recorded).
const client = createClient({ url: "http://127.0.0.1:8188" });
const result = await client.run({ kind: "graph", graph: instantiateTemplate(withHires) });
console.log(result.artifacts); // [{ filename, savedPath, type }]
```

## Install a workflow, run it

```sh
pnpm add @stepupgaming/comfy-workflow-t2i
cwf inspect @stepupgaming/comfy-workflow-t2i --url http://127.0.0.1:8188
cwf run @stepupgaming/comfy-workflow-t2i --url http://127.0.0.1:8188 \
  --param checkpoint=v1-5-pruned-emaonly.safetensors \
  --param prompt="a lighthouse at dusk" --param seed=42
```

`inspect` reads the package's manifest + IR as pure data — package JavaScript is never executed. With `--url` it additionally reports which required node classes the live instance has (✓) or lacks (✗).

## What's inside

| Layer                                                        | What it gives you                                                                                                                                                                   |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Workflow packages** (`…/wfpack`, `cwf pack/inspect`)       | Versioned `comfy.workflow.json` manifest + canonical `workflow.ir.json`: installable, inspectable-without-execution, composable workflow distribution over npm                        |
| **Recipes** (`@stepupgaming/comfy-workflows/recipes`)        | `textToImage`, `img2img`, `inpaint`, `outpaint`, `withLora`, `withControlNet`, `hiresFix`, `upscale`, `explainGraph` — high-level ops that expand into many nodes                     |
| **Typed node SDK** (`…/nodes`)                               | Generated, fully typed wrappers for every node in your defs snapshot; `g.add(spec, params)` is type-checked end to end                                                              |
| **Graph IR** (`…/ir`)                                        | The canonical representation: plain JSON, index-canonical slot refs, `{"$int": "..."}` lossless integers, templates with param placeholders, `graphHash`                            |
| **Compiler** (`compile(graph, defs)`)                        | Validated, deterministic API JSON (byte-identical for identical graphs)                                                                                                             |
| **Runtime** (`…/runtime`, root `createClient`)                | HTTP+WS execution: submit, progress events, artifact download, asset upload, node-error mapping back to IR ids, `runAll` sweeps with bounded concurrency, `run.json` replay metadata |

### Replayable runs

With `outDir` configured, every run writes a self-auditing directory:

```
out/<runId>/run.json     # params, graphHash, defsHash, the exact /prompt body, artifacts, warnings
out/<runId>/<files>      # downloaded artifacts
```

`run.json.compiledJson` is the exact lossless JSON submitted to `/prompt` (bigint literals intact, stored as a string — never re-parsed) — POST it again to reproduce the run byte-for-byte.

## CLI

```
cwf init      my-workflow --from workflow.json                          # existing Comfy JSON → standalone npm package
cwf suggest   .                                                         # deterministic parameter suggestions (no mutation)
cwf expose    checkpoint --node 4 --input ckpt_name                     # promote a widget to a package parameter
cwf import    existing-workflow.json [--ts workflows/foo/workflow.ts]  # editor v0.4 / workflow v1 / API JSON → IR (+ TS); lossless for >2^53 ints
cwf snapshot  --url http://127.0.0.1:8188 -o fixtures/object_info.json  # capture the node universe
cwf lock      --url URL [-o comfy.lock.json]                            # comfy.lock.json: version + objectInfoHash + node packs
cwf codegen   --from fixtures/object_info.json -o src/nodes/gen          # typed wrappers + registry + catalog (NODES.md)
cwf compile   workflows/foo/workflow.ts -o dist/foo.api.json --pretty    # IR → API JSON (build artifact)
cwf validate  workflows/foo/workflow.ts [--url URL]                     # structured errors: codes, node, input, expected/got
cwf run       workflows/foo/workflow.ts --url URL --out out/ --param seed=42
cwf run       <installed-package> --url URL --param k=v ...             # run a workflow package by name (no JS executed)
cwf pack      [dir]                                                     # validate a workflow package before publishing
cwf inspect   <package-or-path> [--url URL] [--json]                    # metadata + live node availability, without running JS
cwf explain   workflows/foo/workflow.ts                                 # "what did hiresFix actually create?"
cwf catalog   [query]                                                   # grep-able node discovery
```

The happy path from an existing ComfyUI workflow is `cwf init my-workflow --from workflow.json` → `cwf pack` → `npm publish`. Tutorial: https://stepupgaming.github.io/comfy-workflows/guide/convert-workflow

`compile`, `validate`, and `run` accept workflow.ts, `.ir.json` documents, **and Comfy workflow JSON directly** (editor v0.4 / workflow v1 / API format — imported on the fly, losslessly for >2^53 ints). `validate --url` NEVER executes: it fetches the live `/object_info` and validates locally against that universe (only `run` queues work). All three check `comfy.lock.json` (or `--lock <path>`) and report `E_LOCK_DRIFT` as a warning. `-o`, `-u`, `-d`, `-p` short flags work alongside the long forms. Every error prints machine-readable JSON (`{ "error": { "code": "E_TYPE_MISMATCH", "nodeId": "n5", "input": "clip", "expected": "CLIP", "got": "MODEL" } }`).

**Custom nodes**: `cwf codegen --url <instance> -o comfy-nodes` generates typed specs into `comfy-nodes/` (registry importing helpers from `"@stepupgaming/comfy-workflows"` — the documented module contract for external generation). `cwf import --ts workflows/foo/workflow.ts --registry comfy-nodes` routes those classes to the generated registry in the emitted TS; classes known to defs but absent from every registry are emitted as `rawNode(...)` so the file always loads and compiles.

## Design guarantees

- **Deterministic**: same graph + defs → byte-identical JSON (tested). Stable ids, sorted emit, no hidden randomness. Seeds are explicit and recorded in run metadata.
- **Lossless integers**: `bigint` in memory, `{"$int": "18446744073709551615"}` on disk (safe under `JSON.parse`), raw numeric literals only in the `/prompt` body — which is assembled by string concatenation so bigints never round-trip through JS numbers.
- **Slot identity is `{nodeId, outputIndex}`**: unnamed, duplicated, and renamed outputs all round-trip. Output names are metadata + handle sugar (`.MODEL`, `.slots[0]`).
- **Escape hatches**: `rawNode()` for nodes `/object_info` can't describe, `unsafe()` for type-system bypass, `E_UNRESOLVED_BYPASS` instead of guessed pass-through wiring.
- **Environment locking**: `comfy.lock.json` records the Comfy version, `/object_info` hash, and node-pack versions; drift is reported, never silently ignored.
- **Imports never fail wholesale**: unknown custom nodes import as raw nodes with their original JSON preserved in `node.source`.
- **Packages never execute on inspect**: manifest + IR are pure data; `cwf inspect`/`cwf run <pkg>` never import package JavaScript (regression-tested with a fixture whose entry throws on import).

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full design document. Docs: https://stepupgaming.github.io/comfy-workflows/

## Migrating from comfy-sdk

v0.1 was published as `comfy-sdk` (never to npm). The rename is breaking but mechanical:

- package: `comfy-sdk` → `@stepupgaming/comfy-workflows`
- imports: `comfy-sdk`, `comfy-sdk/nodes`, `comfy-sdk/runtime`, `comfy-sdk/ir` → `@stepupgaming/comfy-workflows`, `…/nodes`, `…/runtime`, `…/ir` (plus new `…/recipes`, `…/wfpack`)
- CLI: `comfy` → `cwf` (or `comfy-workflows`); old `comfy-sdk…` import specifiers in existing workflow.ts files still resolve via the CLI's compatibility aliases
- repo: `stepupgaming/comfy-sdk` → `stepupgaming/comfy-workflows`

## Development

```bash
pnpm install
pnpm test          # vitest — unit + golden + round-trip + mocked runtime; no Comfy needed
pnpm typecheck
pnpm build         # tsdown → dist/
pnpm codegen:core  # regenerate src/nodes/gen from fixtures/object_info/core.json
pnpm build:packages  # repo-only: regenerate first-party package IR + manifests (not the public authoring path)
```

Live integration tests run only when `COMFY_URL` points at a running ComfyUI instance (e.g. `COMFY_URL=http://127.0.0.1:8188 pnpm test`); they exercise `/object_info`, import/compile with live defs, server-side validation, `/prompt` submission, WS/history completion, artifact retrieval, and replay metadata. They build their workflows from whatever nodes the live instance exposes — no project-specific fixtures.

## Status / roadmap

Core pipeline (import → IR → compile → runtime) plus the npm workflow-package layer (spec, CLI, two first-party packages) are in place. Follow-ups: editor-format export, full asset management, video recipes, MCP server.

## License

MIT. See [LICENSE](./LICENSE).
