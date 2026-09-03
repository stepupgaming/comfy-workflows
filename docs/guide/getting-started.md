# Getting started

This page walks from a fresh clone to a compiled and executed workflow. The
[CLI](./cli) does the heavy lifting; TypeScript is the authoring surface.

## Prerequisites

- Node.js ≥ 22 and pnpm
- A reachable ComfyUI instance (the docs use `http://127.0.0.1:8188`)
- ComfyUI itself is **only ever an execution backend** — the SDK never edits
  its JSON by hand.

## Install

The package is not published to npm yet; depend on the repo directly:

```bash
git clone https://github.com/stepupgaming/comfy-sdk
cd comfy-sdk && pnpm install && pnpm build
```

Then, in your own project:

```bash
pnpm add file:/absolute/path/to/comfy-sdk
```

## Capture your environment

Every node class your ComfyUI exposes (including custom nodes) lives in
`/object_info`. Snapshot it once, then generate typed wrappers:

```bash
comfy snapshot --url http://127.0.0.1:8188 -o object_info.json
comfy codegen --from object_info.json -o src/nodes/gen
```

(Both accept `--url` directly if you prefer live defs.) From here on,
`g.add(...)` is type-checked against *your* environment. When you install or
update node packs, re-run codegen — the generated files are stamped with the
`objectInfoHash` they were built from.

## Author a workflow

```ts
import { workflow, type Graph } from "comfy-sdk";
import { loaders, conditioning, latent, sampling, image } from "comfy-sdk/nodes";

export function build(): Graph {
  const g = workflow("t2i");
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
    seed: 42n, // bigint — lossless, full 64-bit range
    steps: 24,
    cfg: 7,
    sampler_name: "dpmpp_2m",
    scheduler: "karras",
  });
  const dec = g.add(latent.VAEDecode, { samples: ks.LATENT, vae: ckpt.VAE });
  g.add(image.SaveImage, { images: dec.IMAGE, filename_prefix: "t2i" });
  return g.toGraph();
}
```

Wiring is positional underneath (slot identity is `{nodeId, outputIndex}`);
`.MODEL` / `.CLIP` / `.IMAGE` are generated convenience handles over indices.
See [Authoring workflows](./authoring) for the full builder API, and
[Recipes](/reference/recipes) for one-call alternatives.

## Compile, validate, run

```bash
comfy compile workflows/t2i/workflow.ts -o dist/t2i.api.json   # build artifact
comfy validate workflows/t2i/workflow.ts --url http://127.0.0.1:8188
comfy run workflows/t2i/workflow.ts --url http://127.0.0.1:8188 --out out/ --param seed=42
```

- `compile` emits deterministic API JSON — identical graphs produce
  byte-identical files. This JSON is an **output**; never edit it.
- `validate` never queues work: it fetches live `/object_info` (when `--url`
  is given) and checks the graph against that universe locally.
- `run` submits, streams progress, downloads artifacts into
  `out/<runId>/`, and writes `run.json` with the exact `/prompt` body —
  see [Runtime & execution](./runtime).

## Importing existing workflows

Existing graphs enter the same pipeline. All three editor/runtime formats are
detected automatically:

```bash
comfy import existing-workflow.json --ts workflows/foo/workflow.ts
```

- The primary output is `<name>.ir.json` — Graph IR, the semantic truth.
- `--ts` additionally emits an editable `workflow.ts`.
- Node ids, titles, and modes (muted/bypassed) are preserved; unknown custom
  nodes import as raw nodes with their original JSON attached, so imports
  never fail wholesale.
- Integers larger than 2^53 stay lossless (`{"$int": "..."}` on disk,
  `bigint` in memory).

## Where to go next

- [Authoring workflows](./authoring) — builder API, escape hatches, templates
- [Recipes](/reference/recipes) — `textToImage`, `hiresFix`, and friends
- [CLI](./cli) — the full command set
- [Errors](./errors) — the machine-readable taxonomy
