import { addNode, connect, type Graph, type NodeId } from "../ir/index.js";
import { findSamplers, sortedOfType } from "./common.js";

/**
 * Graph transforms shared by recipes. These operate on parametrized template
 * graphs (ParamRef placeholders survive), so composition stays lazy until
 * `instantiateTemplate`.
 */

/**
 * Insert LoRA loaders between the graph's model/clip sources and their
 * consumers. Sequential calls chain naturally: loader N takes whatever the
 * consumers pointed at after loader N-1 was wired.
 */
export function applyLoras(g: Graph, loras: LoraSpec[]): void {
  for (const lora of loras) {
    const id = addNode(g, {
      type: "LoraLoader",
      params: {
        lora_name: lora.lora_name,
        strength_model: lora.strength_model ?? 1,
        strength_clip: lora.strength_clip ?? 1,
      },
      inputs: {},
      raw: true,
      outputTypes: ["MODEL", "CLIP"],
    });
    for (const sampler of findSamplers(g)) {
      const current = g.nodes[sampler].inputs["model"];
      if (current !== undefined && !Array.isArray(current)) {
        g.nodes[id].inputs["model"] = current;
        connect(g, sampler, "model", { node: id, out: 0 });
      }
    }
    for (const encode of sortedOfType(g, "CLIPTextEncode")) {
      const current = g.nodes[encode].inputs["clip"];
      if (current !== undefined && !Array.isArray(current)) {
        g.nodes[id].inputs["clip"] = current;
        connect(g, encode, "clip", { node: id, out: 1 });
      }
    }
  }
}

export interface LoraSpec {
  lora_name: string;
  strength_model?: number;
  strength_clip?: number;
}
