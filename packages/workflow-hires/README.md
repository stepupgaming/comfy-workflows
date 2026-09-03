# @stepupgaming/comfy-workflow-hires

High-resolution text-to-image Comfy workflow as an installable package:
base sample → latent upscale → second-pass refine → decode → save.

> Unofficial project. Not affiliated with or endorsed by Comfy Org.

## Install

```sh
pnpm add @stepupgaming/comfy-workflow-hires
```

## Inspect (no code runs)

```sh
cwf inspect @stepupgaming/comfy-workflow-hires
cwf inspect @stepupgaming/comfy-workflow-hires --url http://127.0.0.1:8188
```

## Run

```sh
cwf run @stepupgaming/comfy-workflow-hires --url http://127.0.0.1:8188 \
  --param checkpoint=v1-5-pruned-emaonly.safetensors \
  --param prompt="a lighthouse at dusk" \
  --param seed=1234
```

## Use from TypeScript

```ts
import { hiresTextToImage } from "@stepupgaming/comfy-workflow-hires";

const graph = hiresTextToImage({ checkpoint: "...", prompt: "...", seed: 1 });
```

## Contents

- `comfy.workflow.json` — versioned manifest (parameters, outputs, requirements)
- `workflow.ir.json` — canonical template Graph IR (t2i composed with hires-fix)
- `dist/` — typed convenience wrapper (optional; inspection never runs it)
