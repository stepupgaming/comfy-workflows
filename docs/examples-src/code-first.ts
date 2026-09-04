/**
 * Code-first quickstart graph. Edit this file; do not hand-edit compiled JSON.
 */
import { compile, workflow, type Graph } from "@stepupgaming/comfy-workflows";
import { conditioning, image, latent, loaders, sampling } from "@stepupgaming/comfy-workflows/nodes";

export function build(): Graph {
  const g = workflow("docs-t2i");

  const ckpt = g.add(loaders.CheckpointLoaderSimple, {
    ckpt_name: "v1-5-pruned-emaonly.safetensors",
  });
  const positive = g.add(conditioning.CLIPTextEncode, {
    text: "a red cube on a table, still camera",
    clip: ckpt.CLIP,
  });
  const negative = g.add(conditioning.CLIPTextEncode, {
    text: "blurry, text, watermark",
    clip: ckpt.CLIP,
  });
  const empty = g.add(latent.EmptyLatentImage, {
    width: 512,
    height: 512,
    batch_size: 1,
  });
  const sampled = g.add(sampling.KSampler, {
    model: ckpt.MODEL,
    positive: positive.CONDITIONING,
    negative: negative.CONDITIONING,
    latent_image: empty.LATENT,
    seed: 42n,
    steps: 8,
    cfg: 7,
    sampler_name: "euler",
    scheduler: "normal",
    denoise: 1,
  });
  const decoded = g.add(latent.VAEDecode, {
    samples: sampled.LATENT,
    vae: ckpt.VAE,
  });
  g.add(image.SaveImage, {
    images: decoded.IMAGE,
    filename_prefix: "docs-t2i",
  });
  g.output(decoded.IMAGE, { name: "image" });
  return g.toGraph();
}

export function compiledJson(): string {
  const result = compile(build());
  if (!result.ok) {
    throw new Error(result.errors.map((e) => `${e.code}: ${e.message}`).join("\n"));
  }
  return result.json;
}
