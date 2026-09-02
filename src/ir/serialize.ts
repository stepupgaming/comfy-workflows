import { ComfyError, ErrorCodes } from "../errors.js";
import { parseIrJson, serializeIrJson, type IrValue } from "../json.js";
import {
  AssetRef,
  createGraph,
  type Graph,
  type NodeInstance,
  type ParamValue,
  type SlotRef,
} from "./types.js";

/** Convert in-memory-only wrappers (AssetRef) into their tagged JSON form. */
function toTagged(value: ParamValue): IrValue {
  if (value instanceof AssetRef) {
    const tagged: Record<string, IrValue> = { $asset: value.path };
    if (value.kind !== "image") tagged["kind"] = value.kind;
    if (value.name !== undefined) tagged["name"] = value.name;
    return tagged;
  }
  if (Array.isArray(value)) return value.map(toTagged);
  return value as IrValue; // scalars, bigint, ParamRef (plain frozen object)
}

function fromTagged(value: IrValue): ParamValue {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const keys = Object.keys(value);
    if (
      keys.includes("$asset") &&
      typeof (value as Record<string, unknown>)["$asset"] === "string"
    ) {
      const v = value as Record<string, IrValue>;
      const kind = v["kind"] === "mask" ? "mask" : "image";
      const name = typeof v["name"] === "string" ? v["name"] : undefined;
      return new AssetRef(v["$asset"] as string, kind, name);
    }
  }
  if (Array.isArray(value)) return value.map(fromTagged);
  return value as ParamValue;
}

export function serializeGraph(g: Graph, opts: { pretty?: boolean } = {}): string {
  return serializeIrJson(graphToTagged(g), opts.pretty ? 2 : undefined);
}

export function graphToTagged(g: Graph): Record<string, IrValue> {
  const out: Record<string, IrValue> = { irVersion: 1 };
  if (g.name !== undefined) out["name"] = g.name;
  const nodes: Record<string, IrValue> = {};
  for (const id of Object.keys(g.nodes)) {
    const n = g.nodes[id];
    const entry: Record<string, IrValue> = { type: n.type };
    entry["params"] = Object.fromEntries(
      Object.entries(n.params).map(([k, v]) => [k, toTagged(v)]),
    );
    entry["inputs"] = Object.fromEntries(
      Object.entries(n.inputs).map(([k, v]) => [
        k,
        Array.isArray(v)
          ? v.map((r) => ({ node: r.node, out: r.out }))
          : { node: v.node, out: v.out },
      ]),
    );
    if (n.mode !== undefined && n.mode !== "active") entry["mode"] = n.mode;
    if (n.title !== undefined) entry["title"] = n.title;
    if (n.raw) entry["raw"] = 1;
    if (n.outputTypes) entry["outputTypes"] = n.outputTypes;
    if (n.outputNames) entry["outputNames"] = n.outputNames;
    if (n.bypassMap) entry["bypassMap"] = Object.fromEntries(Object.entries(n.bypassMap));
    if (n.source) entry["source"] = n.source as unknown as IrValue;
    nodes[id] = entry;
  }
  out["nodes"] = nodes;
  out["outputs"] = g.outputs.map((o) => {
    const decl: Record<string, IrValue> = { node: o.node, out: o.out };
    if (o.name !== undefined) decl["name"] = o.name;
    return decl;
  });
  if (g.params) out["params"] = g.params as unknown as IrValue;
  if (g.ports) out["ports"] = g.ports as unknown as IrValue;
  return out;
}

/** Parse an IR document (as written by `serializeGraph`). Throws E_INVALID_GRAPH on malformed input. */
export function parseGraph(text: string): Graph {
  let value: IrValue;
  try {
    value = parseIrJson(text);
  } catch (e) {
    throw new ComfyError({
      code: ErrorCodes.InvalidGraph,
      message: `IR document is not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
  return graphFromValue(value);
}

export function graphFromValue(value: unknown): Graph {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw malformed("IR document must be an object");
  }
  const obj = value as Record<string, unknown>;
  if (obj["irVersion"] !== 1) {
    throw malformed(`Unsupported IR version ${JSON.stringify(obj["irVersion"])} (expected 1)`);
  }
  const g = createGraph(typeof obj["name"] === "string" ? obj["name"] : undefined);
  const nodes = obj["nodes"];
  if (nodes === null || typeof nodes !== "object" || Array.isArray(nodes)) {
    throw malformed('"nodes" must be an object keyed by node id');
  }
  for (const [id, rawNode] of Object.entries(nodes as Record<string, unknown>)) {
    if (rawNode === null || typeof rawNode !== "object" || Array.isArray(rawNode)) {
      throw malformed(`Node "${id}" must be an object`);
    }
    const n = rawNode as Record<string, unknown>;
    if (typeof n["type"] !== "string") throw malformed(`Node "${id}" is missing "type"`);
    const params: Record<string, ParamValue> = {};
    if (n["params"] !== undefined) {
      if (typeof n["params"] !== "object" || n["params"] === null || Array.isArray(n["params"])) {
        throw malformed(`Node "${id}" params must be an object`);
      }
      for (const [k, v] of Object.entries(n["params"])) params[k] = fromTagged(v as IrValue);
    }
    const inputs: Record<string, SlotRef | SlotRef[]> = {};
    if (n["inputs"] !== undefined) {
      if (typeof n["inputs"] !== "object" || n["inputs"] === null || Array.isArray(n["inputs"])) {
        throw malformed(`Node "${id}" inputs must be an object`);
      }
      for (const [k, v] of Object.entries(n["inputs"])) inputs[k] = parseSlotRefValue(id, k, v);
    }
    const node: NodeInstance = {
      type: n["type"],
      params,
      inputs,
    };
    if (n["mode"] === "bypassed" || n["mode"] === "muted") node.mode = n["mode"];
    if (typeof n["title"] === "string") node.title = n["title"];
    if (n["raw"] === 1 || n["raw"] === true) node.raw = true;
    if (Array.isArray(n["outputTypes"])) node.outputTypes = n["outputTypes"].map(String);
    if (Array.isArray(n["outputNames"])) node.outputNames = n["outputNames"].map(String);
    if (
      n["bypassMap"] !== null &&
      typeof n["bypassMap"] === "object" &&
      !Array.isArray(n["bypassMap"])
    ) {
      node.bypassMap = Object.fromEntries(
        Object.entries(n["bypassMap"] as Record<string, unknown>).map(([k, v]) => [
          Number(k),
          String(v),
        ]),
      ) as Record<number, string>;
    }
    if (n["source"] !== null && typeof n["source"] === "object" && !Array.isArray(n["source"])) {
      node.source = n["source"] as { format: string; raw: unknown };
    }
    g.nodes[id] = node;
  }
  if (Array.isArray(obj["outputs"])) {
    for (const o of obj["outputs"]) {
      if (o === null || typeof o !== "object" || Array.isArray(o))
        throw malformed("Output declaration must be an object");
      const decl = o as Record<string, unknown>;
      if (typeof decl["node"] !== "string" || typeof decl["out"] !== "number") {
        throw malformed('Output declaration requires "node" (string) and "out" (number)');
      }
      g.outputs.push({
        node: decl["node"],
        out: decl["out"],
        ...(typeof decl["name"] === "string" ? { name: decl["name"] } : {}),
      });
    }
  }
  if (
    obj["params"] !== null &&
    typeof obj["params"] === "object" &&
    !Array.isArray(obj["params"])
  ) {
    const params: Graph["params"] = {};
    for (const [name, def] of Object.entries(obj["params"] as Record<string, unknown>)) {
      if (def === null || typeof def !== "object") continue;
      const d = def as Record<string, unknown>;
      params[name] = {
        name,
        type: (d["type"] as "int" | "float" | "string" | "boolean" | "combo") ?? "string",
        ...(d["default"] !== undefined ? { default: fromTagged(d["default"] as IrValue) } : {}),
        ...(Array.isArray(d["options"]) ? { options: d["options"] as (string | number)[] } : {}),
        ...(typeof d["description"] === "string" ? { description: d["description"] } : {}),
      };
    }
    g.params = params;
  }
  if (Array.isArray(obj["ports"])) {
    g.ports = (obj["ports"] as Record<string, unknown>[]).map((p) => ({
      name: String(p["name"]),
      node: String(p["node"]),
      input: String(p["input"]),
      ...(p["type"] !== undefined ? { type: String(p["type"]) } : {}),
    }));
  }
  return g;
}

function parseSlotRefValue(nodeId: string, inputName: string, v: unknown): SlotRef | SlotRef[] {
  const one = (r: unknown): SlotRef => {
    if (r === null || typeof r !== "object" || Array.isArray(r)) {
      throw malformed(`Node "${nodeId}" input "${inputName}": slot ref must be an object`);
    }
    const ref = r as Record<string, unknown>;
    if (typeof ref["node"] !== "string" || typeof ref["out"] !== "number") {
      throw malformed(
        `Node "${nodeId}" input "${inputName}": slot ref requires "node" (string) and "out" (number)`,
      );
    }
    return { node: ref["node"], out: ref["out"] };
  };
  if (Array.isArray(v)) return v.map(one);
  return one(v);
}

function malformed(message: string): ComfyError {
  return new ComfyError({ code: ErrorCodes.InvalidGraph, message });
}
