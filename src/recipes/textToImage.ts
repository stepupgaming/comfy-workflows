import { GraphBuilder } from "../builder/builder.js";
import type { Graph } from "../ir/index.js";
import type { ParamRef } from "../ir/types.js";
import { applyLoras, type LoraSpec } from "./transform.js";
import { loaders, conditioning, latent, sampling, image } from "../nodes/gen/registry.js";

/**
 * textToImage — the baseline recipe: checkpoint → prompt encodes → empty
 * latent → KSampler → VAE decode → Save. One call, ~7 nodes.
 *
 * Returns a TEMPLATE graph: prompts/seed/dimensions may be `g.param()`
 * placeholders; instantiate at run time with concrete values. Seeds are
 * explicit by design — reproducibility is the default, not an option.
 */

export interface TextToImageOptions {
  checkpoint: string;
  positivePrompt: string | ParamRef;
  negativePrompt?: string | ParamRef;
  width?: number;
  height?: number;
  batch?: number;
  steps?: number;
  cfg?: number;
  sampler?: string;
  scheduler?: string;
  denoise?: number;
  seed: bigint | number | ParamRef;
  /** Negative CLIP layer (SD1.x: -1; SDXL: -2). */
  clipStopAtLayer?: number;
  loras?: LoraSpec[];
  filenamePrefix?: string;
}

export function textToImage(opts: TextToImageOptions): Graph {
  const g = new GraphBuilder("textToImage");
  // ParamRef options must be declared so instantiate() knows their defaults/types.
  if (typeof opts.seed === "object" && "$param" in opts.seed)
    g.param(opts.seed.$param, { type: "int" });
  if (typeof opts.positivePrompt === "object")
    g.param(opts.positivePrompt.$param, { type: "string" });
  if (opts.negativePrompt !== undefined && typeof opts.negativePrompt === "object") {
    g.param(opts.negativePrompt.$param, { type: "string", default: "" });
  }
  const ckpt = g.add(loaders.CheckpointLoaderSimple, { ckpt_name: opts.checkpoint });
  const clip =
    opts.clipStopAtLayer !== undefined
      ? g.add(conditioning.CLIPSetLastLayer, {
          stop_at_clip_layer: opts.clipStopAtLayer,
          clip: ckpt.CLIP,
        }).CLIP
      : ckpt.CLIP;
  const positive = g.add(conditioning.CLIPTextEncode, { text: opts.positivePrompt, clip });
  const negative = g.add(conditioning.CLIPTextEncode, { text: opts.negativePrompt ?? "", clip });
  const latentImg = g.add(latent.EmptyLatentImage, {
    width: opts.width ?? 512,
    height: opts.height ?? 512,
    batch_size: opts.batch ?? 1,
  });
  const sampled = g.add(sampling.KSampler, {
    model: ckpt.MODEL,
    positive: positive.CONDITIONING,
    negative: negative.CONDITIONING,
    latent_image: latentImg.LATENT,
    seed: opts.seed,
    steps: opts.steps ?? 20,
    cfg: opts.cfg ?? 8,
    sampler_name: opts.sampler ?? "euler",
    scheduler: opts.scheduler ?? "normal",
    denoise: opts.denoise ?? 1,
  });
  const decoded = g.add(latent.VAEDecode, { samples: sampled.LATENT, vae: ckpt.VAE });
  g.add(image.SaveImage, {
    images: decoded.IMAGE,
    filename_prefix: opts.filenamePrefix ?? "comfy-sdk",
  });
  const graph = g.toGraph();
  if (opts.loras?.length) applyLoras(graph, opts.loras);
  return graph;
}
