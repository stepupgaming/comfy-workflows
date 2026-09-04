# Recipes

Recipes expand into many nodes. They return template graphs. Placeholders survive `withLora` / `hiresFix`, so you bind once at the end.

<<< @/examples-src/recipes.ts

## Built-in recipes

| Recipe | What it builds |
| ------ | -------------- |
| `textToImage` | Checkpoint → CLIP encodes → empty latent → KSampler → VAE decode → Save |
| `img2img` | LoadImage → VAE encode → KSampler(denoise) → decode → save |
| `inpaint` | Image + mask → VAE encode for inpaint → KSampler |
| `outpaint` | Pad for outpainting → encode for inpaint → KSampler |
| `withLora` | Insert `LoraLoader` between model/clip sources and consumers |
| `withControlNet` | ControlNet loader + apply on the first sampler |
| `hiresFix` | Latent upscale + second `KSamplerAdvanced` before VAE decode |
| `upscale` | Pixel upscale model pass |
| `explainGraph` (from `/recipes`) | Text expansion of nodes / params / wiring |

Signatures: [Recipe reference](/reference/recipes).

## `LoraSpec`

```ts
{ lora_name: string, strength_model?: number, strength_clip?: number }
```

There is no `name` / `strength` shorthand on the public type.

## Seeds

`textToImage` requires `seed`. Reproducibility is the default, not an opt-in.

## When not to use a recipe

Video graphs, speech graphs, anything whose nodes are not in the bundled core snapshot. Author those with generated specs. Recipes here are SD-image shaped on purpose.
