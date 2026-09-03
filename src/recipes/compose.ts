import type { Graph, NodeId } from "../ir/index.js";
import { AssetRef } from "../ir/types.js";
import { insertBefore, findNodesOfType, addRaw, findSamplers, type ImageInput } from "./common.js";
import type { LoraSpec } from "./transform.js";
import { applyLoras } from "./transform.js";

/**
 * Composable transforms over template graphs: LoRA stacking, ControlNet,
 * hires-fix. All preserve ParamRef placeholders — composition stays lazy.
 */

/** Stack LoRA loaders between the graph's model/clip sources and consumers. */
export function withLora(base: Graph, loras: LoraSpec | LoraSpec[]): Graph {
  const list = Array.isArray(loras) ? loras : [loras];
  applyLoras(base, list);
  return base;
}

/** Insert a ControlNet application on the (first) sampler's conditioning. */
export function withControlNet(
  base: Graph,
  opts: {
    control_net_name: string;
    image: ImageInput;
    strength?: number;
    startPercent?: number;
    endPercent?: number;
  },
): Graph {
  const samplers = findSamplers(base);
  if (samplers.length === 0) throw new Error("withControlNet: base graph has no KSampler");
  const sampler = samplers[0];

  const loader = addRaw(base, "ControlNetLoader", { control_net_name: opts.control_net_name });
  const apply = addRaw(
    base,
    "ControlNetApplyAdvanced",
    {
      strength: opts.strength ?? 1,
      start_percent: opts.startPercent ?? 0,
      end_percent: opts.endPercent ?? 1,
    },
    { control_net: { node: loader, out: 0 } },
  );
  // Positive passes through apply (output 0), negative through apply (output 1).
  const pos = base.nodes[sampler].inputs["positive"];
  const neg = base.nodes[sampler].inputs["negative"];
  if (pos !== undefined && !Array.isArray(pos)) base.nodes[apply].inputs["positive"] = pos;
  if (neg !== undefined && !Array.isArray(neg)) base.nodes[apply].inputs["negative"] = neg;
  base.nodes[sampler].inputs["positive"] = { node: apply, out: 0 };
  base.nodes[sampler].inputs["negative"] = { node: apply, out: 1 };

  // Control image: loader node for files, direct ref for external outputs.
  const img = opts.image;
  if (img instanceof AssetRef || typeof img === "string") {
    const imageNode = addRaw(base, "LoadImage", { image: img });
    base.nodes[apply].inputs["image"] = { node: imageNode, out: 0 };
  } else {
    base.nodes[apply].inputs["image"] = { node: img.node, out: img.out };
  }
  return base;
}

/**
 * hiresFix — insert LatentUpscaleBy + a second KSamplerAdvanced pass between
 * the sampler and its VAEDecode. `denoise` controls how much the second pass
 * re-samples (0.35–0.55 is the usual range).
 */
export function hiresFix(
  base: Graph,
  opts: {
    scaleBy?: number;
    denoise?: number;
    upscaleMethod?: string;
    noiseSeed?: bigint | number;
  } = {},
): Graph {
  const samplers = findSamplers(base);
  if (samplers.length === 0) throw new Error("hiresFix: base graph has no KSampler");
  const sampler = samplers[samplers.length - 1];

  const decode = findNodesOfType(base, "VAEDecode").find((id) => {
    const ref = base.nodes[id].inputs["samples"];
    return ref !== undefined && !Array.isArray(ref) && ref.node === sampler;
  });
  if (decode === undefined) throw new Error("hiresFix: no VAEDecode consumes the base sampler");

  const steps = Number(base.nodes[sampler].params["steps"] ?? 20);
  const denoise2 = opts.denoise ?? 0.5;
  const startAtStep = Math.max(0, Math.round(steps * (1 - denoise2)));

  const upscale = insertBefore(base, decode, "samples", {
    type: "LatentUpscaleBy",
    params: { upscale_method: opts.upscaleMethod ?? "bilinear", scale_by: opts.scaleBy ?? 1.5 },
    inputs: {},
    output: 0,
    takesInputAt: "samples",
  });

  const model = base.nodes[sampler].inputs["model"];
  const positive = base.nodes[sampler].inputs["positive"];
  const negative = base.nodes[sampler].inputs["negative"];
  const second = insertBefore(base, decode, "samples", {
    type: "KSamplerAdvanced",
    params: {
      add_noise: "enable",
      noise_seed: opts.noiseSeed ?? 0,
      steps,
      cfg: Number(base.nodes[sampler].params["cfg"] ?? 8),
      sampler_name: String(base.nodes[sampler].params["sampler_name"] ?? "euler"),
      scheduler: String(base.nodes[sampler].params["scheduler"] ?? "normal"),
      start_at_step: startAtStep,
      end_at_step: steps,
      return_with_leftover_noise: "disable",
    },
    inputs: {
      latent_image: { node: upscale, out: 0 },
      ...(model !== undefined && !Array.isArray(model) ? { model } : {}),
      ...(positive !== undefined && !Array.isArray(positive) ? { positive } : {}),
      ...(negative !== undefined && !Array.isArray(negative) ? { negative } : {}),
    },
    output: 0,
    takesInputAt: "latent_image",
  });
  void second;
  return base;
}

/**
 * upscale — append a model-based image upscale (and optional exact resize)
 * after the final VAEDecode, saving to a new output.
 */
export function upscale(
  base: Graph,
  opts: {
    model_name: string;
    resizeTo?: { width: number; height: number };
    filenamePrefix?: string;
  },
): Graph {
  const decodes = findNodesOfType(base, "VAEDecode");
  if (decodes.length === 0) throw new Error("upscale: base graph has no VAEDecode");
  const decode = decodes[decodes.length - 1];

  const loader = addRaw(base, "UpscaleModelLoader", { model_name: opts.model_name });
  const upscaled = addRaw(
    base,
    "ImageUpscaleWithModel",
    {},
    { upscale_model: { node: loader, out: 0 } },
  );
  base.nodes[upscaled].inputs["image"] = { node: decode, out: 0 };

  let finalOut: NodeId = upscaled;
  let finalSlot = 0;
  if (opts.resizeTo) {
    const scale = addRaw(base, "ImageScale", {
      upscale_method: "lanczos",
      width: opts.resizeTo.width,
      height: opts.resizeTo.height,
      crop: "disabled",
    });
    base.nodes[scale].inputs["image"] = { node: upscaled, out: 0 };
    finalOut = scale;
  }
  const save = addRaw(base, "SaveImage", {
    filename_prefix: opts.filenamePrefix ?? "cwf-upscale",
  });
  base.nodes[save].inputs["images"] = { node: finalOut, out: finalSlot };
  return base;
}
