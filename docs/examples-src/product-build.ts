/**
 * Build-time authoring. A non-Node runtime later binds {$param} values in the
 * generated IR / compiled prompt. It does not reimplement the compiler.
 */
import { serializeGraph, workflow } from "@stepupgaming/comfy-workflows";
import { conditioning, image, latent, loaders, sampling } from "@stepupgaming/comfy-workflows/nodes";

export function buildTemplate() {
  const g = workflow("product-demo");
  const prompt = g.param("prompt", { type: "string" });
  const seed = g.param("seed", { type: "int", default: 42n });
  const ckpt = g.add(loaders.CheckpointLoaderSimple, {
    ckpt_name: "v1-5-pruned-emaonly.safetensors",
  });
  const positive = g.add(conditioning.CLIPTextEncode, { text: prompt, clip: ckpt.CLIP });
  const negative = g.add(conditioning.CLIPTextEncode, { text: "", clip: ckpt.CLIP });
  const empty = g.add(latent.EmptyLatentImage, { width: 512, height: 512, batch_size: 1 });
  const sampled = g.add(sampling.KSampler, {
    model: ckpt.MODEL,
    positive: positive.CONDITIONING,
    negative: negative.CONDITIONING,
    latent_image: empty.LATENT,
    seed,
    steps: 8,
    cfg: 7,
    sampler_name: "euler",
    scheduler: "normal",
    denoise: 1,
  });
  const decoded = g.add(latent.VAEDecode, { samples: sampled.LATENT, vae: ckpt.VAE });
  g.add(image.SaveImage, { images: decoded.IMAGE, filename_prefix: "product" });
  return g.toGraph();
}

export function emitArtifacts(): { ir: string } {
  return { ir: serializeGraph(buildTemplate(), { pretty: true }) };
}
