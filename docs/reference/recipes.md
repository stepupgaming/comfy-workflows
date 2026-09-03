# Recipes

Recipes are high-level operations that expand into full node graphs. They
return template graphs — `ParamRef` placeholders survive every composition, so
`hiresFix(withLora(tpl, …))` stays lazy until `instantiateTemplate`. All live
in the root `comfy-sdk` entry point.

## textToImage

The baseline recipe: checkpoint → prompt encodes → empty latent → KSampler →
VAE decode → Save. One call, one graph. Returns a TEMPLATE graph:
prompts/seed/dimensions may be `g.param()` placeholders; instantiate at run
time with concrete values. Seeds are explicit by design — reproducibility is
the default, not an option.

```ts
function textToImage(opts: TextToImageOptions): Graph
```

`TextToImageOptions`: `checkpoint`, `positivePrompt` (string or `ParamRef`),
`seed` (bigint/number/`ParamRef`), plus optional `negativePrompt`, `width`,
`height`, `batch`, `steps`, `cfg`, `sampler`, `scheduler`, `denoise`,
`clipStopAtLayer` (negative CLIP layer — SD1.x: `-1`, SDXL: `-2`), `loras`,
`filenamePrefix`.

## img2img

LoadImage → VAE Encode → KSampler(denoise) → decode → save.

```ts
function img2img(opts: {
  checkpoint: string;
  image: ImageInput;
  positivePrompt: string;
  negativePrompt?: string;
  denoise?: number; // default 0.7
  steps?: number; cfg?: number; sampler?: string; scheduler?: string;
  seed: bigint | number;
  loras?: LoraSpec[];
  filenamePrefix?: string;
}): Graph
```

`image` is a local path (`AssetRef` — staged automatically by the runtime),
an external output ref, or a node id.

## inpaint

LoadImage + LoadImageMask → VAE Encode (for Inpainting) → KSampler.

```ts
function inpaint(opts: {
  checkpoint: string;
  image: ImageInput;
  mask: ImageInput;
  maskChannel?: "alpha" | "red" | "green" | "blue"; // default "alpha"
  positivePrompt: string;
  negativePrompt?: string;
  growMaskBy?: number; // default 6
  steps?: number; cfg?: number; sampler?: string; scheduler?: string;
  seed: bigint | number;
  denoise?: number;
  filenamePrefix?: string;
}): Graph
```

## outpaint

Pad Image for Outpainting → VAE Encode (for Inpainting) → KSampler.

```ts
function outpaint(opts: {
  checkpoint: string;
  image: ImageInput;
  left?: number; top?: number; right?: number; bottom?: number;
  feathering?: number; // default 20
  positivePrompt: string;
  negativePrompt?: string;
  steps?: number; cfg?: number; sampler?: string; scheduler?: string;
  seed: bigint | number;
  filenamePrefix?: string;
}): Graph
```

## Composable transforms

These operate on parametrized template graphs (placeholders survive), so
composition stays lazy.

### withLora

```ts
function withLora(base: Graph, loras: LoraSpec | LoraSpec[]): Graph
```

Stacks LoRA loaders between the graph's model/clip sources and their
consumers. `LoraSpec`: `{ lora_name, strength_model?, strength_clip? }`.

### applyLoras

```ts
function applyLoras(g: Graph, loras: LoraSpec[]): void
```

The in-place core of `withLora`. Sequential calls chain naturally: loader N
takes whatever the consumers pointed at after loader N−1 was wired.

### withControlNet

Inserts a ControlNet application on the (first) sampler's conditioning.

```ts
function withControlNet(base: Graph, opts: {
  control_net_name: string;
  image: ImageInput;
  strength?: number;      // default 1
  startPercent?: number;  // default 0
  endPercent?: number;    // default 1
}): Graph
```

### hiresFix

Inserts LatentUpscaleBy + a second KSamplerAdvanced pass between the sampler
and its VAEDecode. `denoise` controls how much the second pass re-samples
(0.35–0.55 is the usual range).

```ts
function hiresFix(base: Graph, opts?: {
  scaleBy?: number;       // default 1.5
  denoise?: number;       // default 0.5
  upscaleMethod?: string; // default "bilinear"
  noiseSeed?: bigint | number;
}): Graph
```

### upscale

Appends a model-based image upscale (and optional exact resize) after the
final VAEDecode, saving to a new output.

```ts
function upscale(base: Graph, opts: {
  model_name: string;
  resizeTo?: { width: number; height: number };
  filenamePrefix?: string;
}): Graph
```

## explainGraph

```ts
function explainGraph(g: Graph): string
```

Human/agent-readable expansion of a template or graph: nodes, params,
connections, template params/ports/outputs. The observability surface for
agents — "what did hiresFix actually create?"
