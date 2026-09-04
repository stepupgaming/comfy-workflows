import {
  instantiateTemplate,
  workflow,
  type Graph,
} from "@stepupgaming/comfy-workflows";
import { conditioning, image, latent, loaders, sampling } from "@stepupgaming/comfy-workflows/nodes";

export function buildTemplate(): Graph {
  const g = workflow("docs-t2i-template");
  const checkpoint = g.param("checkpoint", {
    type: "combo",
    description: "Checkpoint filename on the Comfy server.",
  });
  const prompt = g.param("prompt", {
    type: "string",
    description: "Positive prompt.",
  });
  const seed = g.param("seed", {
    type: "int",
    default: 42n,
    description: "Sampling seed. Use bigint for the full 64-bit range.",
  });
  const steps = g.param("steps", { type: "int", default: 20 });

  const ckpt = g.add(loaders.CheckpointLoaderSimple, { ckpt_name: checkpoint });
  const positive = g.add(conditioning.CLIPTextEncode, { text: prompt, clip: ckpt.CLIP });
  const negative = g.add(conditioning.CLIPTextEncode, { text: "", clip: ckpt.CLIP });
  const empty = g.add(latent.EmptyLatentImage, { width: 512, height: 512, batch_size: 1 });
  const sampled = g.add(sampling.KSampler, {
    model: ckpt.MODEL,
    positive: positive.CONDITIONING,
    negative: negative.CONDITIONING,
    latent_image: empty.LATENT,
    seed,
    steps,
    cfg: 7,
    sampler_name: "euler",
    scheduler: "normal",
    denoise: 1,
  });
  const decoded = g.add(latent.VAEDecode, { samples: sampled.LATENT, vae: ckpt.VAE });
  g.add(image.SaveImage, { images: decoded.IMAGE, filename_prefix: "docs-template" });
  g.output(decoded.IMAGE, { name: "image" });
  return g.toGraph();
}

export function bind(params: { checkpoint: string; prompt: string; seed?: bigint; steps?: number }): Graph {
  return instantiateTemplate(buildTemplate(), {
    params: {
      checkpoint: params.checkpoint,
      prompt: params.prompt,
      ...(params.seed !== undefined ? { seed: params.seed } : {}),
      ...(params.steps !== undefined ? { steps: params.steps } : {}),
    },
  });
}
