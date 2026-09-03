# Example: text → image

This is `examples/t2i/workflow.ts` from the repository — the canonical
authoring form, node by node: checkpoint → LoRA → prompt encodes → empty
latent → KSampler → VAE decode → SaveImage.

```ts
import { workflow, type Graph } from "comfy-sdk";
import { loaders, conditioning, latent, sampling, image } from "comfy-sdk/nodes";

export function build(): Graph {
  const g = workflow("t2i-example");

  const ckpt = g.add(loaders.CheckpointLoaderSimple, {
    ckpt_name: "v1-5-pruned-emaonly.safetensors",
  });
  const lora = g.add(loaders.LoraLoader, {
    model: ckpt.MODEL,
    clip: ckpt.CLIP,
    lora_name: "detail_tweaker.safetensors",
    strength_model: 0.8,
    strength_clip: 0.8,
  });
  const positive = g.add(conditioning.CLIPTextEncode, {
    text: "a lighthouse at dusk, cinematic lighting, dramatic sky",
    clip: lora.CLIP,
  });
  const negative = g.add(conditioning.CLIPTextEncode, {
    text: "blurry, low quality",
    clip: lora.CLIP,
  });
  const lat = g.add(latent.EmptyLatentImage, { width: 1024, height: 576, batch_size: 1 });
  const sampled = g.add(sampling.KSampler, {
    model: lora.MODEL,
    positive: positive.CONDITIONING,
    negative: negative.CONDITIONING,
    latent_image: lat.LATENT,
    seed: 156680208700286, // > 2^53 — kept lossless end to end
    steps: 24,
    cfg: 7,
    sampler_name: "dpmpp_2m",
    scheduler: "karras",
    denoise: 1,
  });
  const decoded = g.add(latent.VAEDecode, { samples: sampled.LATENT, vae: ckpt.VAE });
  g.add(image.SaveImage, { images: decoded.IMAGE, filename_prefix: "t2i-example" });

  return g.toGraph();
}
```

Points of interest:

- **Handles are sugar over positional slots.** `.MODEL`, `.CLIP`, `.LATENT`,
  `.IMAGE` resolve to `{nodeId, outputIndex}` — the canonical identity.
- **The seed is a plain literal** in source but survives as `bigint` in
  memory and a raw 64-bit literal in the compiled `/prompt` body.
- **The builder returns a `Graph`**, the IR document. `compile` turns it into
  API JSON; `comfy.run` compiles in-memory and never writes the artifact.

Run it without touching the Comfy UI:

```bash
comfy run examples/t2i/workflow.ts --url http://127.0.0.1:8188 --out out/
```

Artifacts land in `out/<runId>/` beside `run.json`, which carries the exact
submitted body for byte-for-byte replay.

The same graph via the recipe layer collapses to a single call — see
[textToImage](/reference/recipes#texttoimage). Use recipes for speed, the
builder for full control; both compile through the same IR.
