# Code-first workflows

Need Node.js ≥ 22. Bundled `@stepupgaming/comfy-workflows/nodes` covers core SD1.x classes. Custom nodes need codegen from the target Comfy.

## Steps

```sh
pnpm add @stepupgaming/comfy-workflows
cwf snapshot --url http://127.0.0.1:8188 -o object_info.json
cwf lock --url http://127.0.0.1:8188
cwf codegen --from object_info.json -o src/nodes/gen
```

Author `workflow.ts` or package `ir.build.ts`:

```ts
import { workflow } from "@stepupgaming/comfy-workflows";
import { conditioning, image, latent, loaders, sampling } from "@stepupgaming/comfy-workflows/nodes";

const g = workflow("t2i");
const ckpt = g.add(loaders.CheckpointLoaderSimple, {
  ckpt_name: "v1-5-pruned-emaonly.safetensors",
});
const pos = g.add(conditioning.CLIPTextEncode, { text: "a red cube", clip: ckpt.CLIP });
const lat = g.add(latent.EmptyLatentImage, { width: 512, height: 512, batch_size: 1 });
const ks = g.add(sampling.KSampler, {
  model: ckpt.MODEL,
  positive: pos.CONDITIONING,
  negative: pos.CONDITIONING,
  latent_image: lat.LATENT,
  seed: 42n,
  steps: 20,
  cfg: 7,
  sampler_name: "euler",
  scheduler: "normal",
  denoise: 1,
});
const dec = g.add(latent.VAEDecode, { samples: ks.LATENT, vae: ckpt.VAE });
g.add(image.SaveImage, { images: dec.IMAGE, filename_prefix: "t2i" });
```

After codegen, import from `./src/nodes/gen/registry.ts` so custom classes type-check.

```sh
cwf compile workflow.ts -o dist/prompt.json
cwf validate workflow.ts --url http://127.0.0.1:8188
cwf run workflow.ts --url http://127.0.0.1:8188 --out out/
```

- `compile` writes deterministic API JSON. Do not edit that file.
- `validate` never queues.
- `run` never installs Python.

Handles (`.MODEL`, `.CLIP`) wrap `{nodeId, outputIndex}`. Index is identity. Names are sugar.

Recipes (`textToImage`, `withLora`, `hiresFix`, …) return template graphs and preserve `ParamRef`. Prefer a recipe when it matches; drop to `g.add` when it does not.

Optional topology (a branch that adds nodes) belongs in TypeScript, often as a second graph or package, not as a runtime `if` in Python.

Deeper: `_links.md` (`quickstart`, `build-a-graph`, `composition`).
