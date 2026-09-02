import { addNode, type Graph, type NodeId, type ParamValue, type SlotRef } from "../ir/index.js";
import { AssetRef } from "../ir/types.js";
import { unsafeRef, type NodeOutput } from "../builder/types.js";
import type { GraphBuilder } from "../builder/builder.js";

/**
 * Shared recipe helpers.
 *
 * Recipes build with the typed builder + generated registry specs. The few
 * dynamic pieces (image/mask sources that may be a path, a server filename,
 * or an external node output) go through `resolveImageInput`, which creates a
 * LoadImage node when given a file and connects directly when given a ref.
 */

/** Image/mask sources accepted by image-conditioned recipes. */
export type ImageInput = SlotRef | AssetRef | string;

/**
 * Normalize an image input for a combo-typed param: strings pass through
 * (server-side filenames), AssetRefs stage at run time, external SlotRefs
 * become never-branded refs assignable to the combo param.
 */
export function imageParam(image: ImageInput): string | AssetRef | NodeOutput<never> {
  if (image instanceof AssetRef || typeof image === "string") return image;
  return unsafeRef(image.node, image.out);
}

/** Create a LoadImage (or LoadImageMask) node for a path/filename input, on a plain Graph. */
export function addImageLoader(
  g: Graph,
  filename: string | AssetRef,
  kind: "image" | "mask" = "image",
): NodeId {
  const type = kind === "mask" ? "LoadImageMask" : "LoadImage";
  const params: Record<string, ParamValue> = {};
  if (kind === "mask") {
    params["mask"] = filename instanceof AssetRef ? filename : filename;
    params["channel"] = "alpha";
  } else {
    params["image"] = filename instanceof AssetRef ? filename : filename;
  }
  return addNode(g, { type, params, raw: true, outputTypes: outputTypesOf(type) });
}

/** Output type tables for dynamically-added nodes (identity stays index-based). */
const OUTPUTS: Record<string, string[]> = {
  LoadImage: ["IMAGE", "MASK"],
  LoadImageMask: ["MASK"],
  LoraLoader: ["MODEL", "CLIP"],
  ControlNetLoader: ["CONTROL_NET"],
  ControlNetApplyAdvanced: ["CONDITIONING", "CONDITIONING"],
  LatentUpscaleBy: ["LATENT"],
  ImageUpscaleWithModel: ["IMAGE"],
  ImageScale: ["IMAGE"],
  UpscaleModelLoader: ["UPSCALE_MODEL"],
  KSampler: ["LATENT"],
  KSamplerAdvanced: ["LATENT"],
  SaveImage: [],
};

export function outputTypesOf(type: string): string[] {
  return OUTPUTS[type] ?? [];
}

/** Add a dynamically-typed node to a plain graph (escape-hatch level). */
export function addRaw(
  g: Graph,
  type: string,
  params: Record<string, ParamValue>,
  inputs: Record<string, SlotRef | SlotRef[]> = {},
): NodeId {
  return addNode(g, { type, params, inputs, raw: true, outputTypes: outputTypesOf(type) });
}

export function findNodesOfType(g: Graph, type: string): NodeId[] {
  return Object.keys(g.nodes)
    .sort()
    .filter((id) => g.nodes[id].type === type);
}

export function sortedOfType(g: Graph, type: string): NodeId[] {
  return findNodesOfType(g, type);
}

export function findSamplers(g: Graph): NodeId[] {
  return [...findNodesOfType(g, "KSampler"), ...findNodesOfType(g, "KSamplerAdvanced")];
}

/** Rewire `consumer.inputName` through a new node placed before it. */
export function insertBefore(
  g: Graph,
  consumer: NodeId,
  inputName: string,
  newNode: {
    type: string;
    params: Record<string, ParamValue>;
    inputs: Record<string, SlotRef | SlotRef[]>;
    output: number;
    takesInputAt: string;
  },
): NodeId {
  const old = g.nodes[consumer].inputs[inputName];
  const id = addNode(g, {
    type: newNode.type,
    params: newNode.params,
    inputs: newNode.inputs,
    raw: true,
    outputTypes: outputTypesOf(newNode.type),
  });
  if (old !== undefined && !Array.isArray(old)) g.nodes[id].inputs[newNode.takesInputAt] = old;
  g.nodes[consumer].inputs[inputName] = { node: id, out: newNode.output };
  return id;
}

/** Type re-export for recipe option signatures. */
export type { GraphBuilder };
