---
title: Convert a ComfyUI workflow into a package
layout: doc
---

# Convert a ComfyUI workflow into a package

You already have a working `workflow.json`. You do not need to learn Graph IR first.

This page turns that file into a standalone npm package you can inspect, run, and publish. The commands below use the same public CLI a third-party author would use — no repository checkout, no internal build scripts.

The fixture in this tutorial is [`fixtures/workflows/t2i.api.json`](https://github.com/stepupgaming/comfy-workflows/blob/main/fixtures/workflows/t2i.api.json) from the Comfy Workflows repo. Any editor v0.4, workflow v1, or API/prompt JSON works the same way.

## 1. Install Comfy Workflows

```sh
pnpm add @stepupgaming/comfy-workflows
```

That gives you the `cwf` CLI (`comfy-workflows` is the same binary).

## 2. Create the package

```sh
cwf init packaged-demo --from workflow.json
cd packaged-demo
```

`cwf init` imports the JSON with the same importer as `cwf import`, then writes a complete package directory:

```
packaged-demo/
  package.json
  comfy.workflow.json
  workflow.ir.json
  workflow.ts
  README.md
  .gitignore
```

`workflow.ir.json` is the canonical payload. `workflow.ts` is an editable convenience. Inspecting or running the package never executes that TypeScript (or any other package JavaScript).

The npm name is taken from the argument you passed (`packaged-demo`). Scoped names work too:

```sh
cwf init @alice/portrait --from workflow.json
```

Comfy Workflows will not put you in `@stepupgaming` unless you type that scope yourself.

## 3. Read the generated files

- **package.json** — name `0.1.0`, MIT scaffolding license, keywords, `comfyWorkflow` pointer. Change the license if the source workflow is not yours to relicense.
- **comfy.workflow.json** — identity, parameters, outputs, required node classes (derived from the IR).
- **workflow.ir.json** — Graph IR. Node ids, titles, modes, and lossless integers from the source are preserved.
- **workflow.ts** — typed authoring file. Custom nodes the bundled registry does not know become `rawNode(...)`.
- **README.md** — install, inspect, and run instructions generated from the manifest.

## 4. Review portability warnings

`cwf init` never rewrites workflow behavior. It does tell you about values that make the package machine-specific:

```
Created package: ./packaged-demo

Portability warnings:
  checkpoint:
    node 4 / ckpt_name
    value: v1-5-pruned-emaonly.safetensors
```

Absolute Windows or Unix paths are also flagged. They are **not** rewritten. A package that still embeds `C:\Users\Alice\Videos\input.mp4` will fail `cwf pack` with `E_PACK_LOCAL_PATH` and a command to expose that input.

`--json` emits the same report for agents.

## 5. Expose useful parameters

Suggestions are deterministic heuristics (checkpoint, prompts, seed, size, steps, cfg, denoise, paths). They never mutate the graph:

```sh
cwf suggest .
```

```
Suggested parameters

checkpoint
  4.ckpt_name
  current: "v1-5-pruned-emaonly.safetensors"

prompt
  6.text
  current: "masterful photograph of a lighthouse at dusk"

seed
  3.seed
  current: "156680208700286"
```

Promote the ones you want, one at a time:

```sh
cwf expose checkpoint --node 4 --input ckpt_name --required
cwf expose prompt --node 6 --input text
cwf expose seed --node 3 --input seed
```

`--required` drops the old literal so consumers must pass a value. Without it, the original value becomes the default — except machine-local paths, which never become portable defaults.

Each `expose` updates the IR, the manifest, and `workflow.ts` together. If anything fails, the package is left as it was.

## 6. Validate

```sh
cwf pack
```

`pack` is the publication gate: schema, IR, parameter/output coherence, node-class agreement, and embedded local paths. Warnings (empty `nodePacks`, missing keywords) do not fail the command. Errors do.

## 7. Test locally

```sh
cwf inspect .
cwf inspect . --url http://127.0.0.1:8188
cwf run . --url http://127.0.0.1:8188 \
  --param checkpoint=v1-5-pruned-emaonly.safetensors \
  --param prompt="a lighthouse at dusk" \
  --param seed=42
```

`inspect` and `run` read the manifest and IR as data. If the live instance is missing a checkpoint, inspect still reports node-class compatibility; a real image needs a model the server actually has.

## 8. Optional: make it a git repo

`cwf init` writes `.gitignore` and README next-steps. It does **not** create a GitHub repository.

```sh
cwf init packaged-demo --from workflow.json --git   # git init only, if you asked
git add .
git commit -m "Initial workflow package"
# gh repo create …   # optional — npm is the package transport
```

## 9. Publish

```sh
cwf pack
npm publish
```

You use your own npm account. There is no Comfy Workflows registry.

Verify redistribution rights before you publish. Importing a workflow does not grant rights to the workflow, the models it names, or any custom nodes it needs.

## 10. Consumers install it

```sh
pnpm add packaged-demo
cwf inspect packaged-demo --url http://127.0.0.1:8188
cwf run packaged-demo --url http://127.0.0.1:8188 \
  --param checkpoint=... \
  --param prompt="..." \
  --param seed=42
```

Typed wrappers are optional. Anyone can inspect and run from the JSON alone.

## Realistic example (this repo's fixture)

Using [`t2i.api.json`](https://github.com/stepupgaming/comfy-workflows/blob/main/fixtures/workflows/t2i.api.json):

```sh
pnpm add @stepupgaming/comfy-workflows

cwf init packaged-demo --from t2i.api.json
cd packaged-demo

cwf suggest .
cwf expose checkpoint --node 4 --input ckpt_name --required
cwf expose prompt --node 6 --input text
cwf pack

# optional
cwf inspect .
# cwf run . --url http://127.0.0.1:8188 --param checkpoint=... --param prompt="..."
```

That is the whole happy path:

```
cwf init my-workflow --from workflow.json
cd my-workflow
cwf pack
npm publish
```

Graph IR, templates, and recipes remain available when you want them. They are not a prerequisite for packaging a workflow you already have.
