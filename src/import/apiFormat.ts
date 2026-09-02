import { ComfyError, ErrorCodes } from "../errors.js";
import type { Graph, NodeId, ParamValue, SlotRef } from "../ir/index.js";
import { addNode, createGraph } from "../ir/index.js";
import type { NodeDefs } from "../defs/index.js";

/**
 * Import ComfyUI API-format ("prompt") JSON into Graph IR.
 *
 * The API format is the simpler of the two: `{ "<nodeId>": { class_type,
 * inputs, _meta } }` where widget values are inline and connections are
 * `["<nodeId>", <outputIndex>]` — already index-canonical. Node ids are
 * preserved verbatim so server-side errors map back to the original workflow.
 */
export function importApiJson(obj: unknown, defs?: NodeDefs): Graph {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    throw new ComfyError({
      code: ErrorCodes.InvalidGraph,
      message: "API-format import expects a JSON object keyed by node id",
    });
  }
  const entries = obj as Record<string, unknown>;
  const g = createGraph();

  const isConnection = (v: unknown): v is [string, number] =>
    Array.isArray(v) &&
    v.length === 2 &&
    typeof v[0] === "string" &&
    typeof v[1] === "number" &&
    v[0] in entries;

  for (const id of Object.keys(entries)) {
    const entry = entries[id];
    if (entry === null || typeof entry !== "object") {
      throw new ComfyError({
        code: ErrorCodes.InvalidGraph,
        message: `API-format node "${id}" must be an object`,
        nodeId: id,
      });
    }
    const e = entry as { class_type?: unknown; inputs?: unknown; _meta?: { title?: unknown } };
    if (typeof e.class_type !== "string") {
      throw new ComfyError({
        code: ErrorCodes.InvalidGraph,
        message: `API-format node "${id}" is missing "class_type"`,
        nodeId: id,
      });
    }
    const params: Record<string, ParamValue> = {};
    const inputs: Record<string, SlotRef | SlotRef[]> = {};
    if (e.inputs !== null && typeof e.inputs === "object") {
      for (const [name, value] of Object.entries(e.inputs as Record<string, unknown>)) {
        if (isConnection(value)) {
          inputs[name] = { node: value[0], out: value[1] };
        } else if (Array.isArray(value) && value.length > 0 && value.every(isConnection)) {
          inputs[name] = value.map((v) => ({ node: v[0], out: v[1] }));
        } else if (Array.isArray(value)) {
          // Mixed list (connections + literals, e.g. Impact packs) — keep as param
          // payload; structural validation will flag genuine problems.
          params[name] = value as ParamValue;
        } else if (value !== null && typeof value === "object") {
          // Widget maps / dicts (some custom nodes) — preserved verbatim.
          params[name] = value as ParamValue;
        } else {
          params[name] = value as ParamValue;
        }
      }
    }
    const unknownType = defs !== undefined && !(e.class_type in defs);
    addNode(g, {
      id,
      type: e.class_type,
      params,
      inputs,
      title: typeof e._meta?.title === "string" ? e._meta.title : undefined,
      raw: unknownType || undefined,
      source: undefined,
    });
  }

  declareDefaultOutputs(g, defs);
  return g;
}

/**
 * Declare graph outputs for runtime artifact selection: terminal nodes (no
 * consumers) — typically SaveImage/PreviewImage and any custom output node.
 */
export function declareDefaultOutputs(g: Graph, defs?: NodeDefs): void {
  const consumed = new Set<NodeId>();
  for (const node of Object.values(g.nodes)) {
    for (const ref of Object.values(node.inputs)) {
      if (Array.isArray(ref)) for (const r of ref) consumed.add(r.node);
      else consumed.add(ref.node);
    }
  }
  for (const id of Object.keys(g.nodes)) {
    if (consumed.has(id)) continue;
    const node = g.nodes[id];
    const def = defs?.[node.type];
    if (def && !def.outputNode && def.outputs.length === 0) continue;
    g.outputs.push({ node: id, out: 0 });
  }
}
