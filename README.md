# comfy-sdk

**Code-first ComfyUI workflow system.** Graph IR is the canonical semantic representation of a workflow. TypeScript (`workflow.ts`) is the canonical authoring representation. Comfy API JSON is a build artifact — generated, never hand-edited. ComfyUI is the execution backend.

```
existing Comfy workflows (editor v0.4 / workflow v1 / API JSON)
        │ comfy import
        ▼
   <name>.ir.json  ──────────────  Graph IR  ◄── semantic truth
        │ (optional comfy import --ts)   ▲
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
Recipes  →  Typed node SDK  →  Graph IR  →  Comfy compiler  →  Comfy runtime
```

## Quickstart

```ts
import { textToImage, hiresFix, instantiateTemplate } from "comfy-sdk";
import { createClient } from "comfy-sdk/runtime";

// One call → ~7 nodes. Returns a template graph.
const tpl = textToImage({
  checkpoint: "v1-5-pruned-emaonly.safetensors",
  positivePrompt: "a lighthouse at dusk, cinematic lighting",
  seed: 42n,
});

// Compose: latent upscale + second sampling pass (+2 nodes).
const withHires = hiresFix(tpl, { scaleBy: 1.5, denoise: 0.45 });

// Execute (JSON never hits disk; seeds are explicit and recorded).
const comfy = createClient({ url: "http://127.0.0.1:8188" });
const result = await comfy.run({ kind: "graph", graph: instantiateTemplate(withHires) });
console.log(result.artifacts); // [{ filename, savedPath, type }]
```

Authored form (checked by the type system — a `MODEL` output wired into a `CLIP` input is a compile error):

```ts
import { workflow, type Graph } from "comfy-sdk";
import { loaders, conditioning, latent, sampling } from "comfy-sdk/nodes";

export function build(): Graph {
  const g = workflow("mine");
  const ckpt = g.add(loaders.CheckpointLoaderSimple, {
    ckpt_name: "v1-5-pruned-emaonly.safetensors",
  });
  const pos = g.add(conditioning.CLIPTextEncode, { text: "prompt", clip: ckpt.CLIP });
  const lat = g.add(latent.EmptyLatentImage, { width: 1024, height: 576, batch_size: 1 });
  const ks = g.add(sampling.KSampler, {
    model: ckpt.MODEL,
    positive: pos.CONDITIONING,
    negative: pos.CONDITIONING,
    latent_image: lat.LATENT,
    seed: 42n,
    steps: 24,
    cfg: 7,
    sampler_name: "dpmpp_2m",
    scheduler: "karras",
  });
  g.output(ks.LATENT);
  return g;
}
```

## What's inside

| Layer                                   | What it gives you                                                                                                                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Recipes** (`comfy-sdk`)               | `textToImage`, `img2img`, `inpaint`, `outpaint`, `withLora`, `withControlNet`, `hiresFix`, `upscale`, `explainGraph` — high-level ops that expand into many nodes                    |
| **Typed node SDK** (`comfy-sdk/nodes`)  | Generated, fully typed wrappers for every node in your defs snapshot; `g.add(spec, params)` is type-checked end to end                                                               |
| **Graph IR** (`comfy-sdk/ir`)           | The canonical representation: plain JSON, index-canonical slot refs, `{"$int": "..."}` lossless integers, templates with param placeholders, `graphHash`                             |
| **Comfy compiler**                      | `compile(graph, defs)` → validated, deterministic API JSON (byte-identical for identical graphs)                                                                                     |
| **Comfy runtime** (`comfy-sdk/runtime`) | HTTP+WS execution: submit, progress events, artifact download, asset upload, node-error mapping back to IR ids, `runAll` sweeps with bounded concurrency, `run.json` replay metadata |

### Replayable runs

With `outDir` configured, every run writes a self-auditing directory:

```
out/<runId>/run.json     # params, graphHash, defsHash, the exact /prompt body, artifacts, warnings
out/<runId>/<files>      # downloaded artifacts
```

`run.json.compiledJson` is the exact lossless JSON submitted to `/prompt` (bigint literals intact, stored as a string — never re-parsed) — POST it again to reproduce the run byte-for-byte.

## CLI

```
comfy import    existing-workflow.json [--ts workflows/foo/workflow.ts]  # editor v0.4 / workflow v1 / API JSON → IR (+ TS); lossless for >2^53 ints
comfy snapshot  --url http://127.0.0.1:8188 -o fixtures/object_info.json  # capture the node universe
comfy lock      --url URL [-o comfy.lock.json]                            # comfy.lock.json: version + objectInfoHash + node packs
comfy codegen   --from fixtures/object_info.json -o src/nodes/gen          # typed wrappers + registry + catalog (NODES.md)
comfy compile   workflows/foo/workflow.ts -o dist/foo.api.json --pretty    # IR → API JSON (build artifact)
comfy validate  workflows/foo/workflow.ts [--url URL]                     # structured errors: codes, node, input, expected/got
comfy run       workflows/foo/workflow.ts --url URL --out out/ --param seed=42
comfy explain   workflows/foo/workflow.ts                                 # "what did hiresFix actually create?"
comfy catalog   [query]                                                   # grep-able node discovery
```

`compile`, `validate`, and `run` accept workflow.ts, `.ir.json` documents, **and Comfy workflow JSON directly** (editor v0.4 / workflow v1 / API format — imported on the fly, losslessly for >2^53 ints). `validate --url` NEVER executes: it fetches the live `/object_info` and validates locally against that universe (only `run` queues work). All three check `comfy.lock.json` (or `--lock <path>`) and report `E_LOCK_DRIFT` as a warning. `-o`, `-u`, `-d`, `-p` short flags work alongside the long forms. Every error prints machine-readable JSON (`{ "error": { "code": "E_TYPE_MISMATCH", "nodeId": "n5", "input": "clip", "expected": "CLIP", "got": "MODEL" } }`).

**Custom nodes**: `comfy codegen --url <instance> -o comfy-nodes` generates typed specs into `comfy-nodes/` (registry importing helpers from `"comfy-sdk"` — the documented module contract for external generation). `comfy import --ts workflows/foo/workflow.ts --registry comfy-nodes` routes those classes to the generated registry in the emitted TS; classes known to defs but absent from every registry are emitted as `rawNode(...)` so the file always loads and compiles.

## Design guarantees

- **Deterministic**: same graph + defs → byte-identical JSON (tested). Stable ids, sorted emit, no hidden randomness. Seeds are explicit and recorded in run metadata.
- **Lossless integers**: `bigint` in memory, `{"$int": "18446744073709551615"}` on disk (safe under `JSON.parse`), raw numeric literals only in the `/prompt` body — which is assembled by string concatenation so bigints never round-trip through JS numbers.
- **Slot identity is `{nodeId, outputIndex}`**: unnamed, duplicated, and renamed outputs all round-trip. Output names are metadata + handle sugar (`.MODEL`, `.slots[0]`).
- **Escape hatches**: `rawNode()` for nodes `/object_info` can't describe, `unsafe()` for type-system bypass, `E_UNRESOLVED_BYPASS` instead of guessed pass-through wiring.
- **Environment locking**: `comfy.lock.json` records the Comfy version, `/object_info` hash, and node-pack versions; drift is reported, never silently ignored.
- **Imports never fail wholesale**: unknown custom nodes import as raw nodes with their original JSON preserved in `node.source`.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full design document.

## Development

```bash
pnpm install
pnpm test          # vitest — unit + golden + round-trip + mocked runtime; no Comfy needed
pnpm typecheck
pnpm build         # tsdown → dist/
pnpm codegen:core  # regenerate src/nodes/gen from fixtures/object_info/core.json
```

Live integration tests run only when `COMFY_URL` points at a running ComfyUI instance (e.g. `COMFY_URL=http://127.0.0.1:8188 pnpm test`); they exercise `/object_info`, import/compile with live defs, server-side validation, `/prompt` submission, WS/history completion, artifact retrieval, and replay metadata. They build their workflows from whatever nodes the live instance exposes — no project-specific fixtures.

## Status / roadmap

v1 covers the full pipeline (import → IR → compile → runtime) with recipes for the core text/image domains. Follow-ups: editor-format export, full asset management, video recipes (AnimateDiff/SVD), MCP server.
