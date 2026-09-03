# @stepupgaming/comfy-workflow-t2i

Text-to-image Comfy workflow as an installable package.

> Unofficial project. Not affiliated with or endorsed by Comfy Org.

## Install

```sh
pnpm add @stepupgaming/comfy-workflow-t2i
```

## Inspect (no code runs)

```sh
cwf inspect @stepupgaming/comfy-workflow-t2i
cwf inspect @stepupgaming/comfy-workflow-t2i --url http://127.0.0.1:8188
```

## Run

```sh
cwf run @stepupgaming/comfy-workflow-t2i --url http://127.0.0.1:8188 \
  --param checkpoint=v1-5-pruned-emaonly.safetensors \
  --param prompt="a lighthouse at dusk" \
  --param seed=1234
```

## Use from TypeScript

```ts
import { textToImage } from "@stepupgaming/comfy-workflow-t2i";
import { hiresFix } from "@stepupgaming/comfy-workflows/recipes";

const graph = hiresFix(textToImage({ checkpoint: "...", prompt: "...", seed: 1 }));
```

## Contents

- `comfy.workflow.json` — versioned manifest (parameters, outputs, requirements)
- `workflow.ir.json` — canonical template Graph IR
- `dist/` — typed convenience wrapper (optional; inspection never runs it)
