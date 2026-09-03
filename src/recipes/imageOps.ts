import { GraphBuilder } from "../builder/builder.js";
import type { Graph } from "../ir/index.js";
import { loaders, conditioning, latent, sampling, image } from "../nodes/gen/registry.js";
import { imageParam, type ImageInput } from "./common.js";
import { applyLoras } from "./transform.js";
import type { LoraSpec } from "./transform.js";

/** img2img — LoadImage → VAE Encode → KSampler(denoise) → decode → save. */
export function img2img(opts: {
  checkpoint: string;
  image: ImageInput;
  positivePrompt: string;
  negativePrompt?: string;
  denoise?: number;
  steps?: number;
  cfg?: number;
  sampler?: string;
  scheduler?: string;
  seed: bigint | number;
  loras?: LoraSpec[];
  filenamePrefix?: string;
}): Graph {
  const g = new GraphBuilder("img2img");
  const ckpt = g.add(loaders.CheckpointLoaderSimple, { ckpt_name: opts.checkpoint });
  const loaded = g.add(image.LoadImage, { image: imageParam(opts.image) });
  const positive = g.add(conditioning.CLIPTextEncode, {
    text: opts.positivePrompt,
    clip: ckpt.CLIP,
  });
  const negative = g.add(conditioning.CLIPTextEncode, {
    text: opts.negativePrompt ?? "",
    clip: ckpt.CLIP,
  });
  const encoded = g.add(latent.VAEEncode, { pixels: loaded.IMAGE, vae: ckpt.VAE });
  const sampled = g.add(sampling.KSampler, {
    model: ckpt.MODEL,
    positive: positive.CONDITIONING,
    negative: negative.CONDITIONING,
    latent_image: encoded.LATENT,
    seed: opts.seed,
    steps: opts.steps ?? 20,
    cfg: opts.cfg ?? 8,
    sampler_name: opts.sampler ?? "euler",
    scheduler: opts.scheduler ?? "normal",
    denoise: opts.denoise ?? 0.7,
  });
  const decoded = g.add(latent.VAEDecode, { samples: sampled.LATENT, vae: ckpt.VAE });
  g.add(image.SaveImage, {
    images: decoded.IMAGE,
    filename_prefix: opts.filenamePrefix ?? "cwf-img2img",
  });
  const graph = g.toGraph();
  if (opts.loras?.length) applyLoras(graph, opts.loras);
  return graph;
}

/** inpaint — LoadImage + LoadImageMask → VAE Encode (for Inpainting) → KSampler. */
export function inpaint(opts: {
  checkpoint: string;
  image: ImageInput;
  mask: ImageInput;
  maskChannel?: "alpha" | "red" | "green" | "blue";
  positivePrompt: string;
  negativePrompt?: string;
  growMaskBy?: number;
  steps?: number;
  cfg?: number;
  sampler?: string;
  scheduler?: string;
  seed: bigint | number;
  denoise?: number;
  filenamePrefix?: string;
}): Graph {
  const g = new GraphBuilder("inpaint");
  const ckpt = g.add(loaders.CheckpointLoaderSimple, { ckpt_name: opts.checkpoint });
  const loaded = g.add(image.LoadImage, { image: imageParam(opts.image) });
  const mask = g.add(mask_category.LoadImageMask, {
    mask: imageParam(opts.mask),
    channel: opts.maskChannel ?? "alpha",
  });
  const encoded = g.add(latent.VAEEncodeForInpaint, {
    pixels: loaded.IMAGE,
    vae: ckpt.VAE,
    mask: mask.MASK,
    grow_mask_by: opts.growMaskBy ?? 6,
  });
  const positive = g.add(conditioning.CLIPTextEncode, {
    text: opts.positivePrompt,
    clip: ckpt.CLIP,
  });
  const negative = g.add(conditioning.CLIPTextEncode, {
    text: opts.negativePrompt ?? "",
    clip: ckpt.CLIP,
  });
  const sampled = g.add(sampling.KSampler, {
    model: ckpt.MODEL,
    positive: positive.CONDITIONING,
    negative: negative.CONDITIONING,
    latent_image: encoded.LATENT,
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
    filename_prefix: opts.filenamePrefix ?? "cwf-inpaint",
  });
  return g.toGraph();
}

/** outpaint — Pad Image for Outpainting → VAE Encode (for Inpainting) → KSampler. */
export function outpaint(opts: {
  checkpoint: string;
  image: ImageInput;
  left?: number;
  top?: number;
  right?: number;
  bottom?: number;
  feathering?: number;
  positivePrompt: string;
  negativePrompt?: string;
  steps?: number;
  cfg?: number;
  sampler?: string;
  scheduler?: string;
  seed: bigint | number;
  filenamePrefix?: string;
}): Graph {
  const g = new GraphBuilder("outpaint");
  const ckpt = g.add(loaders.CheckpointLoaderSimple, { ckpt_name: opts.checkpoint });
  const loaded = g.add(image.LoadImage, { image: imageParam(opts.image) });
  const padded = g.add(image_category.PadImageForOutpainting, {
    image: loaded.IMAGE,
    left: opts.left ?? 0,
    top: opts.top ?? 0,
    right: opts.right ?? 0,
    bottom: opts.bottom ?? 0,
    feathering: opts.feathering ?? 20,
  });
  const encoded = g.add(latent.VAEEncodeForInpaint, {
    pixels: padded.IMAGE,
    vae: ckpt.VAE,
    mask: padded.MASK,
    grow_mask_by: 6,
  });
  const positive = g.add(conditioning.CLIPTextEncode, {
    text: opts.positivePrompt,
    clip: ckpt.CLIP,
  });
  const negative = g.add(conditioning.CLIPTextEncode, {
    text: opts.negativePrompt ?? "",
    clip: ckpt.CLIP,
  });
  const sampled = g.add(sampling.KSampler, {
    model: ckpt.MODEL,
    positive: positive.CONDITIONING,
    negative: negative.CONDITIONING,
    latent_image: encoded.LATENT,
    seed: opts.seed,
    steps: opts.steps ?? 20,
    cfg: opts.cfg ?? 8,
    sampler_name: opts.sampler ?? "euler",
    scheduler: opts.scheduler ?? "normal",
    denoise: 1,
  });
  const decoded = g.add(latent.VAEDecode, { samples: sampled.LATENT, vae: ckpt.VAE });
  g.add(image.SaveImage, {
    images: decoded.IMAGE,
    filename_prefix: opts.filenamePrefix ?? "cwf-outpaint",
  });
  return g.toGraph();
}

import * as mask_category from "../nodes/gen/mask.js";
import * as image_category from "../nodes/gen/image.js";
