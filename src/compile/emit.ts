import { serializeComfyJson, type ComfyApiObject } from "../json.js";
import { compareIds, sortedNodeIds, type Graph, type NodeInstance } from "../ir/index.js";
import type { NodeDefs } from "../defs/index.js";
import type { DefInput } from "../defs/types.js";

/**
 * Emit the ComfyUI API-format ("prompt") object from a validated, lowered
 * graph. Deterministic by construction:
 *  - nodes emitted in canonical id order (numeric-aware),
 *  - inputs emitted in def order (required then optional, honoring
 *    input_order), raw nodes in sorted key order,
 *  - bigints stay bigints until serializeComfyJson writes them as raw literals.
 */
export function emitApiObject(g: Graph, defs?: NodeDefs): ComfyApiObject {
  const out: ComfyApiObject = {};
  for (const id of sortedNodeIds(g)) {
    const node = g.nodes[id];
    const def = node.raw ? undefined : defs?.[node.type];
    const inputs: Record<string, unknown> = {};

    if (def) {
      for (const input of def.inputs) {
        emitDefInput(node, input, inputs);
      }
    } else {
      for (const name of Object.keys(node.params).sort()) {
        const v = node.params[name];
        if (v === undefined) continue;
        inputs[name] = v;
      }
      for (const name of Object.keys(node.inputs).sort()) {
        inputs[name] = refToWire(node.inputs[name]);
      }
    }

    const title = node.title ?? def?.displayName ?? node.type;
    out[id] = { class_type: node.type, inputs, _meta: { title } };
  }
  return out;
}

function emitDefInput(node: NodeInstance, input: DefInput, inputs: Record<string, unknown>): void {
  const { name } = input;
  if (input.kind === "connection") {
    const ref = node.inputs[name];
    if (ref !== undefined) inputs[name] = refToWire(ref);
    return;
  }
  // Widget-kind (or forceInput) input: prefer a real connection, then the
  // param, then the def default.
  const connection = node.inputs[name];
  if (connection !== undefined) {
    inputs[name] = refToWire(connection);
    return;
  }
  if (name in node.params) {
    const v = node.params[name];
    if (v !== undefined) inputs[name] = v;
    return;
  }
  if (input.default !== undefined) {
    inputs[name] = input.default;
  }
}

function refToWire(
  ref: { node: string; out: number } | Array<{ node: string; out: number }>,
): unknown {
  if (Array.isArray(ref)) return ref.map((r) => [r.node, r.out]);
  return [ref.node, ref.out];
}

/** Emit + serialize in one step. `pretty` is for file artifacts; the wire form is compact. */
export function emitApiJson(g: Graph, defs: NodeDefs | undefined, pretty?: boolean): string {
  return serializeComfyJson(emitApiObject(g, defs), pretty ? 2 : undefined);
}

/** Canonical comparator helper re-exported for tests and tools. */
export { compareIds };
