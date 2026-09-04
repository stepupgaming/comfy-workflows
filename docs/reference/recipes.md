# Recipes reference

All live on `@stepupgaming/comfy-workflows` and `@stepupgaming/comfy-workflows/recipes`.

Guide: [Recipes](/code/recipes). Example: [Composition](/examples/composition).

## `textToImage(opts) → Graph`

Checkpoint → CLIP encodes → empty latent → KSampler → VAE decode → Save.

`TextToImageOptions`: `checkpoint`, `positivePrompt`, `seed` (required), plus optional `negativePrompt`, `width`, `height`, `batch`, `steps`, `cfg`, `sampler`, `scheduler`, `denoise`, `clipStopAtLayer`, `loras`, `filenamePrefix`.

Values may be `ParamRef` (checkpoint, prompts, seed, width/height/batch).

## `img2img(opts) → Graph`

LoadImage → VAE encode → KSampler(denoise, default 0.7) → decode → save.

`image` is `AssetRef` \| path string \| output ref.

## `inpaint(opts) → Graph`

LoadImage + LoadImageMask → VAEEncodeForInpaint → KSampler.

`maskChannel` default `"alpha"`. `growMaskBy` default `6`.

## `outpaint(opts) → Graph`

PadImageForOutpainting → VAEEncodeForInpaint → KSampler.

`left` / `top` / `right` / `bottom`, `feathering` default `20`.

## `withLora(graph, loras) → Graph`

`LoraSpec`: `{ lora_name, strength_model?, strength_clip? }`. Accepts one spec or an array. Preserves ParamRefs.

## `withControlNet(graph, opts) → Graph`

Inserts ControlNetLoader + ControlNetApplyAdvanced on the first KSampler.

## `hiresFix(graph, opts?) → Graph`

LatentUpscaleBy + KSamplerAdvanced before the VAEDecode that consumes the last sampler.

`scaleBy` default `1.5`. `denoise` default `0.5`.

## `upscale(graph, opts) → Graph`

Pixel upscale-model pass (see source for options).

## `explainGraph(graph) → string`

Human/agent-readable expansion.
