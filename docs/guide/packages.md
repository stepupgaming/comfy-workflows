---
title: Workflow packages
layout: doc
---

# Workflow packages

A workflow package is an npm package whose canonical payload is Graph IR. It lets you distribute a Comfy workflow the way you distribute code: versioned, installable, inspectable, composable.

A package contains:

```
package.json            # name, version, keywords, "comfyWorkflow" pointer
comfy.workflow.json     # versioned manifest: params, outputs, requirements
workflow.ir.json        # canonical template Graph IR
dist/                   # optional typed wrapper (convenience only)
README.md
```

The manifest and IR are **pure data**. Inspecting or running a package never executes its JavaScript — the CLI reads the JSON directly. The `dist/` wrapper exists so TypeScript users get typed functions; it is never needed to discover, inspect, or run the workflow.

npm is the transport and versioning layer. Comfy Workflows defines the workflow model — there is no custom registry, account system, or store.

## Installing a package

```sh
pnpm add @stepupgaming/comfy-workflow-t2i
```

Workflow packages are discoverable through npm keywords (`comfy-workflow`, `comfyui`, `comfy-workflows`) and declare a stable pointer in their `package.json`:

```json
"comfyWorkflow": "./comfy.workflow.json"
```

Any scope works — first-party, personal, or unscoped. The package identity is npm's job; the workflow contract is Comfy Workflows' job.

## Inspecting compatibility

```sh
cwf inspect @stepupgaming/comfy-workflow-t2i
cwf inspect @stepupgaming/comfy-workflow-t2i --url http://127.0.0.1:8188
cwf inspect ./packages/workflow-t2i --json
```

Without `--url`, `inspect` prints the workflow's identity, parameters (required vs optional), declared outputs, required node classes, and model requirements — all from manifest + IR, no code executed.

With `--url`, it additionally compares the required node classes against the live instance's `/object_info`:

```
  requires:
    ✓ CLIPTextEncode
    ✓ CheckpointLoaderSimple
    ✗ KSampler
  live http://127.0.0.1:8188: MISSING KSampler
```

`--json` emits the same report machine-readably for agents.

::: warning Security note
A malicious package could ship JavaScript that throws — or worse — on import. `cwf inspect` and `cwf run <package>` never import it: they resolve the manifest and IR as data files. This is regression-tested with a fixture package whose entry throws immediately on execution.
:::

## Running a package

```sh
cwf run @stepupgaming/comfy-workflow-t2i --url http://127.0.0.1:8188 \
  --param checkpoint=v1-5-pruned-emaonly.safetensors \
  --param prompt="a lighthouse at dusk" --param seed=42
```

The CLI resolves the package's manifest → IR, binds `--param` values to the template, compiles, and runs — the same pipeline as `cwf run workflow.ts`. Checkpoint and model choices stay parameters, never baked-in local filenames.

## Composing packaged workflows

Packages remain software components, not opaque downloads. Import the typed wrapper and compose it with any recipe or transform:

```ts
import { textToImage } from "@stepupgaming/comfy-workflow-t2i";
import { hiresFix } from "@stepupgaming/comfy-workflows";

const graph = hiresFix(textToImage({ checkpoint: "...", prompt: "...", seed: 1 }), {
  denoise: 0.5,
});
```

Template placeholders survive composition (it stays lazy until instantiation), so this yields one valid Graph IR → deterministic compile → Comfy execution.

## Authoring a workflow package

The public path starts from a workflow you already have:

```sh
cwf init my-workflow --from workflow.json
cd my-workflow
cwf suggest .
cwf expose checkpoint --node … --input ckpt_name --required
cwf pack
npm publish
```

That is the whole authoring workflow. `cwf init` writes a standalone package — `package.json`, `comfy.workflow.json`, `workflow.ir.json`, `workflow.ts`, README, `.gitignore` — using the same importer and package format as everything else. No repository checkout and no internal build scripts.

See [Convert a ComfyUI workflow into a package](/guide/convert-workflow) for the end-to-end tutorial.

If you prefer to author in TypeScript from scratch:

1. Build a template graph — parameters via `g.param()` or recipe `ParamRef` options. No machine-local paths; checkpoint names are parameters.
2. Declare outputs with `g.output(handle, { name })`.
3. Run `cwf init` on compiled/exported JSON, or write `workflow.ir.json` + `comfy.workflow.json` yourself with parameters and `nodeClasses` **derived from the IR**.
4. Validate before publishing:

```sh
cwf pack ./my-package
```

`pack` checks package metadata, manifest schema, entry resolution, IR parsing, parameter/output coherence, node-class agreement (missing *or stale* entries fail), embedded machine-local paths, and the no-JS-execution property. It exits non-zero on any error and supports `--json` for CI. Absolute paths fail with `E_PACK_LOCAL_PATH` and a suggested `cwf expose … --required`.

5. Publish to npm normally. If the wrapper imports core APIs, declare a `peerDependency` on `@stepupgaming/comfy-workflows` — parsing the manifest/IR itself must never require the SDK.

See the [manifest reference](/reference/workflow-manifest) for the full `comfy.workflow.json` contract. First-party packages in this repo (`workflow-t2i`, `workflow-hires`) are maintained with a repository-only helper under `scripts/` — that is not the public authoring path.

## First-party packages

| Package | Workflow | Nodes |
| ------- | -------- | ----- |
| `@stepupgaming/comfy-workflow-t2i` | Baseline text-to-image: checkpoint → encodes → KSampler → decode → save | Checkpoint, CLIP, sampler, latent, VAE, save |
| `@stepupgaming/comfy-workflow-hires` | T2I composed with a latent hires-fix second pass at build time | T2I set plus latent upscale and second sampler |

Both pass `cwf pack`, install cleanly from their tarballs, and compile deterministically. Actual image generation needs a checkpoint on the server (passed as the `checkpoint` parameter); where no compatible checkpoint exists, compilation plus compatibility inspection are the acceptance bar.
