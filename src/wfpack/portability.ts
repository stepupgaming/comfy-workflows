import {
  AssetRef,
  isAssetRef,
  isParamRef,
  type Graph,
  type NodeInstance,
  type ParamValue,
} from "../ir/types.js";

/**
 * Portability analysis for packaged workflows.
 *
 * Findings are warnings for the author — they never rewrite the graph.
 * Absolute machine-local paths additionally fail `cwf pack` (E_PACK_LOCAL_PATH).
 */

export type PortabilityKind =
  "checkpoint" | "model" | "input-path" | "output-path" | "absolute-path";

export interface PortabilityFinding {
  kind: PortabilityKind;
  nodeId: string;
  nodeType: string;
  input: string;
  value: string;
}

const ABS_PATH = /^(?:[A-Za-z]:[\\/]|\\\\|\/)/;

const MODEL_EXT = /\.(safetensors|ckpt|pt|pth|bin|gguf|sft)$/i;
const MEDIA_EXT = /\.(png|jpe?g|webp|gif|bmp|tiff?|mp4|webm|mov|mkv|avi|wav|mp3|flac|ogg|m4a)$/i;

const CHECKPOINT_INPUT = /^(ckpt_name|checkpoint)$/i;
const MODEL_INPUT =
  /^(unet_name|vae_name|lora_name|control_net_name|controlnet_name|model_name|clip_name|clip_vision_name|style_model_name|gligen_name)$/i;
const OUTPUT_INPUT = /^(output_dir|output_path|directory|dir|filename_prefix)$/i;
const INPUT_PATH_INPUT = /^(image|video|audio|file|filename|path|input|input_path)$/i;

export function isAbsolutePath(value: string): boolean {
  return ABS_PATH.test(value);
}

export function isModelFilename(value: string): boolean {
  return MODEL_EXT.test(value);
}

function isMediaPath(value: string): boolean {
  return MEDIA_EXT.test(value);
}

function looksLikePath(value: string): boolean {
  return isAbsolutePath(value) || /[\\/]/.test(value) || isMediaPath(value);
}

function stringLeaves(value: ParamValue, out: string[]): void {
  if (isParamRef(value)) return;
  if (isAssetRef(value) || value instanceof AssetRef) {
    out.push(value.path);
    return;
  }
  if (typeof value === "string") {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) stringLeaves(v, out);
  }
}

function classify(input: string, value: string): PortabilityKind | undefined {
  if (isAbsolutePath(value)) {
    if (OUTPUT_INPUT.test(input)) return "output-path";
    if (INPUT_PATH_INPUT.test(input) || isMediaPath(value)) return "input-path";
    return "absolute-path";
  }
  if (CHECKPOINT_INPUT.test(input) && isModelFilename(value)) return "checkpoint";
  if (MODEL_INPUT.test(input) && isModelFilename(value)) return "model";
  if (isModelFilename(value) && /ckpt|checkpoint|lora|unet|vae|control/i.test(input)) {
    return CHECKPOINT_INPUT.test(input) ? "checkpoint" : "model";
  }
  if (
    (INPUT_PATH_INPUT.test(input) || isMediaPath(value)) &&
    looksLikePath(value) &&
    !isModelFilename(value)
  ) {
    return "input-path";
  }
  if (OUTPUT_INPUT.test(input) && looksLikePath(value) && input !== "filename_prefix") {
    return "output-path";
  }
  // filename_prefix is a SaveImage stem, not a filesystem path, unless absolute
  // (already handled above).
  return undefined;
}

function visitNode(nodeId: string, node: NodeInstance, out: PortabilityFinding[]): void {
  for (const [input, value] of Object.entries(node.params)) {
    if (isParamRef(value)) continue;
    const leaves: string[] = [];
    stringLeaves(value, leaves);
    for (const leaf of leaves) {
      const kind = classify(input, leaf);
      if (kind === undefined) continue;
      out.push({ kind, nodeId, nodeType: node.type, input, value: leaf });
    }
  }
}

/** Analyze a graph for values that make a package machine-specific. Never mutates. */
export function analyzePortability(graph: Graph): PortabilityFinding[] {
  const findings: PortabilityFinding[] = [];
  for (const [nodeId, node] of Object.entries(graph.nodes)) visitNode(nodeId, node, findings);
  findings.sort((a, b) => {
    if (a.nodeId !== b.nodeId) return a.nodeId < b.nodeId ? -1 : 1;
    if (a.input !== b.input) return a.input < b.input ? -1 : 1;
    return a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0;
  });
  return findings;
}

/** Absolute Windows/POSIX/UNC paths embedded in widget values or AssetRefs. */
export function findLocalPathFindings(graph: Graph): PortabilityFinding[] {
  return analyzePortability(graph)
    .filter(
      (f) => f.kind === "absolute-path" || f.kind === "input-path" || f.kind === "output-path",
    )
    .filter((f) => isAbsolutePath(f.value));
}

/** Back-compat string list used by older pack checks. */
export function findEmbeddedLocalPaths(graph: Graph): string[] {
  return [...new Set(findLocalPathFindings(graph).map((f) => `${f.nodeType}: ${f.value}`))].sort();
}

/** Suggested `cwf expose` name for a path finding (does not guarantee uniqueness). */
export function exposeNameForPath(input: string): string {
  const lower = input.replace(/_/g, "-").toLowerCase();
  if (/^(image|video|audio|file|path|filename)$/i.test(input)) return `input-${lower}`;
  if (/^(output_dir|output_path|directory|dir)$/i.test(input)) return "output-dir";
  return lower;
}
