import {
  isParamRef,
  type Graph,
  type NodeInstance,
  type ParamValue,
  type TemplateParamDef,
} from "../ir/types.js";
import { topoSort } from "../ir/graph.js";
import type { NodeDefs } from "../defs/types.js";
import { isAbsolutePath, isModelFilename } from "./portability.js";

/**
 * Deterministic, inspectable parameter suggestions. Never mutates the graph.
 * No LLM — heuristics over node type + input name + value shape.
 */

export type SuggestionKind =
  | "checkpoint"
  | "model"
  | "prompt"
  | "negative"
  | "seed"
  | "width"
  | "height"
  | "steps"
  | "cfg"
  | "denoise"
  | "path";

export interface SuggestedParam {
  name: string;
  nodeId: string;
  input: string;
  current: string;
  kind: SuggestionKind;
  type: TemplateParamDef["type"];
  /** True when the current value is machine-local and should not become a default. */
  requiredSuggestion: boolean;
}

function displayValue(value: ParamValue): string {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null) return "null";
  if (Array.isArray(value)) return JSON.stringify(value);
  return String(value);
}

function typeFromValue(value: ParamValue): TemplateParamDef["type"] {
  if (typeof value === "bigint") return "int";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return Number.isInteger(value) ? "int" : "float";
  return "string";
}

function typeFromDefs(
  node: NodeInstance,
  input: string,
  value: ParamValue,
  defs?: NodeDefs,
): TemplateParamDef["type"] {
  const def = defs?.[node.type]?.inputs.find((i) => i.name === input);
  if (def?.kind === "int") return "int";
  if (def?.kind === "float") return "float";
  if (def?.kind === "boolean") return "boolean";
  if (def?.kind === "combo") return "combo";
  if (def?.kind === "string") return "string";
  return typeFromValue(value);
}

function uniqueName(base: string, taken: Set<string>): string {
  if (!taken.has(base)) {
    taken.add(base);
    return base;
  }
  let i = 2;
  while (taken.has(`${base}_${i}`)) i++;
  const name = `${base}_${i}`;
  taken.add(name);
  return name;
}

interface Pending {
  kind: SuggestionKind;
  nodeId: string;
  node: NodeInstance;
  input: string;
  value: ParamValue;
  preferred: string;
}

/**
 * Suggest likely public parameters. Already-parametrized inputs are skipped.
 * CLIPTextEncode `text` inputs: first (topo order) → prompt, second → negative,
 * unless the node title mentions "negative".
 */
export function suggestParams(graph: Graph, defs?: NodeDefs): SuggestedParam[] {
  const taken = new Set(Object.keys(graph.params ?? {}));
  const pending: Pending[] = [];
  const clipTexts: Pending[] = [];

  for (const nodeId of topoSort(graph)) {
    const node = graph.nodes[nodeId];
    if (!node) continue;
    for (const [input, value] of Object.entries(node.params)) {
      if (isParamRef(value)) continue;
      if (Array.isArray(value)) continue;

      const lower = input.toLowerCase();
      if (node.type === "CLIPTextEncode" && lower === "text" && typeof value === "string") {
        const title = (node.title ?? "").toLowerCase();
        clipTexts.push({
          kind: /negativ/.test(title) ? "negative" : "prompt",
          nodeId,
          node,
          input,
          value,
          preferred: /negativ/.test(title) ? "negative" : "prompt",
        });
        continue;
      }
      if (lower === "ckpt_name" || lower === "checkpoint") {
        pending.push({
          kind: "checkpoint",
          nodeId,
          node,
          input,
          value,
          preferred: "checkpoint",
        });
        continue;
      }
      if (
        /^(unet_name|vae_name|lora_name|control_net_name|controlnet_name|model_name|clip_name)$/i.test(
          input,
        ) &&
        typeof value === "string" &&
        isModelFilename(value)
      ) {
        pending.push({
          kind: "model",
          nodeId,
          node,
          input,
          value,
          preferred: lower.replace(/_name$/, "").replace(/_/g, "-"),
        });
        continue;
      }
      if (lower === "seed") {
        pending.push({ kind: "seed", nodeId, node, input, value, preferred: "seed" });
        continue;
      }
      if (lower === "width") {
        pending.push({ kind: "width", nodeId, node, input, value, preferred: "width" });
        continue;
      }
      if (lower === "height") {
        pending.push({ kind: "height", nodeId, node, input, value, preferred: "height" });
        continue;
      }
      if (lower === "steps") {
        pending.push({ kind: "steps", nodeId, node, input, value, preferred: "steps" });
        continue;
      }
      if (lower === "cfg") {
        pending.push({ kind: "cfg", nodeId, node, input, value, preferred: "cfg" });
        continue;
      }
      if (lower === "denoise") {
        pending.push({ kind: "denoise", nodeId, node, input, value, preferred: "denoise" });
        continue;
      }
      if (
        typeof value === "string" &&
        (isAbsolutePath(value) ||
          (/\.(png|jpe?g|webp|gif|mp4|webm|mov|mkv|wav|mp3)$/i.test(value) && /[\\/]/.test(value)))
      ) {
        const preferred = /^(image|video|audio|file|path|filename)$/i.test(input)
          ? `input-${input.toLowerCase()}`
          : input.replace(/_/g, "-").toLowerCase();
        pending.push({ kind: "path", nodeId, node, input, value, preferred });
      }
    }
  }

  // Assign prompt / negative among untitled CLIP encodes in topo order.
  let seenPrompt = false;
  for (const c of clipTexts) {
    if (c.kind === "negative") {
      pending.push(c);
      continue;
    }
    if (!seenPrompt) {
      c.kind = "prompt";
      c.preferred = "prompt";
      seenPrompt = true;
    } else {
      c.kind = "negative";
      c.preferred = "negative";
    }
    pending.push(c);
  }

  const out: SuggestedParam[] = [];
  for (const p of pending) {
    const name = uniqueName(p.preferred, taken);
    const requiredSuggestion =
      p.kind === "path" && typeof p.value === "string" && isAbsolutePath(p.value);
    out.push({
      name,
      nodeId: p.nodeId,
      input: p.input,
      current: displayValue(p.value),
      kind: p.kind,
      type: typeFromDefs(p.node, p.input, p.value, defs),
      requiredSuggestion,
    });
  }
  return out;
}
