/**
 * examples/t2i/workflow.ts — a authored text→image workflow.
 *
 * TypeScript is the canonical authoring representation. Compile with:
 *   cwf compile examples/t2i/workflow.ts -o dist/t2i.api.json
 * or run directly (JSON never hits disk):
 *   cwf run examples/t2i/workflow.ts --url http://127.0.0.1:8188 --out out/
 */
import { workflow, type Graph } from "@stepupgaming/comfy-workflows";
import { loaders, conditioning, latent, sampling, image } from "@stepupgaming/comfy-workflows/nodes";

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
    seed: 156680208700286,
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
