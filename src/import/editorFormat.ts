import { ComfyError, ErrorCodes } from "../errors.js";
import {
  addNode,
  createGraph,
  type Graph,
  type NodeId,
  type ParamValue,
  type SlotRef,
} from "../ir/index.js";
import type { NodeDefs } from "../defs/index.js";
import { declareDefaultOutputs } from "./apiFormat.js";

/**
 * Import ComfyUI editor/save-format workflow JSON (legacy schema version 0.4
 * and the versioned workflow v1 schema — they share the nodes/links shape)
 * into Graph IR.
 *
 * The editor format is structurally different from the API format: links are a
 * separate table, widget values are positional, and frontend built-ins
 * (Reroute, PrimitiveNode) are resolved at export time by Comfy itself — so
 * the importer resolves them the same way. Anything not understood is
 * preserved under `node.source = { format, raw }`; nothing is silently
 * dropped.
 */

export interface ImportDiagnostic {
  code: string;
  message: string;
  nodeId?: NodeId;
}

export interface EditorImportResult {
  graph: Graph;
  diagnostics: ImportDiagnostic[];
}

const FRONTEND_NOTE_TYPES = new Set(["Note", "MarkdownNote"]);
const MODE_MAP: Record<number, "active" | "muted" | "bypassed"> = {
  0: "active",
  2: "muted",
  4: "bypassed",
};

interface RawEditorNode {
  id: number | string;
  type: string;
  mode?: number;
  title?: string;
  inputs?: Array<{
    name?: string;
    type?: string;
    link?: number | null;
    widget?: { name?: string };
  }>;
  outputs?: Array<{ name?: string; type?: string; links?: (number | null)[] }>;
  widgets_values?: unknown;
  properties?: Record<string, unknown>;
}

interface RawLink {
  id: number;
  originId: string;
  originSlot: number;
  targetId: string;
  targetSlot: number;
}

export function isEditorFormat(json: unknown): boolean {
  return (
    json !== null &&
    typeof json === "object" &&
    !Array.isArray(json) &&
    Array.isArray((json as { nodes?: unknown }).nodes)
  );
}

export function importWorkflowJson(json: unknown, defs?: NodeDefs): EditorImportResult {
  if (!isEditorFormat(json)) {
    throw new ComfyError({
      code: ErrorCodes.InvalidGraph,
      message: "Editor-format import expects an object with a 'nodes' array",
    });
  }
  const doc = json as {
    nodes: RawEditorNode[];
    links?: unknown;
    version?: number | string;
    extra?: Record<string, unknown>;
  };

  const schemaVersion = doc.version === undefined ? "unknown" : String(doc.version);
  const formatName =
    schemaVersion === "0.4" ? "comfy-workflow-0.4" : `comfy-workflow-v${schemaVersion}`;
  const diagnostics: ImportDiagnostic[] = [];

  // Link table.
  const links = new Map<number, RawLink>();
  const linksByTarget = new Map<string, RawLink[]>();
  for (const raw of Array.isArray(doc.links) ? doc.links : []) {
    if (!Array.isArray(raw) || raw.length < 5) continue;
    const link: RawLink = {
      id: Number(raw[0]),
      originId: String(raw[1]),
      originSlot: Number(raw[2]),
      targetId: String(raw[3]),
      targetSlot: Number(raw[4]),
    };
    links.set(link.id, link);
    const list = linksByTarget.get(link.targetId) ?? [];
    list.push(link);
    linksByTarget.set(link.targetId, list);
  }

  const byId = new Map<string, RawEditorNode>();
  for (const node of doc.nodes) byId.set(String(node.id), node);

  const g = createGraph();
  const idMap = new Map<string, NodeId>();

  // First pass: create nodes (so refs can point anywhere).
  for (const raw of doc.nodes) {
    const srcId = String(raw.id);
    const type = raw.type;
    if (type === "Reroute" || type === "PrimitiveNode") continue; // resolved during wiring
    if (FRONTEND_NOTE_TYPES.has(type) && !(defs && type in defs)) continue; // documentation nodes

    const mode = raw.mode === undefined ? "active" : (MODE_MAP[raw.mode] ?? "active");
    if (raw.mode !== undefined && MODE_MAP[raw.mode] === undefined) {
      diagnostics.push({
        code: "W_UNKNOWN_MODE",
        message: `Node "${srcId}" (${type}) has unknown mode ${raw.mode}; treated as active`,
        nodeId: srcId,
      });
    }
    const def = defs?.[type];
    const unknownType = defs !== undefined && !def;
    const node = addNode(g, {
      id: srcId,
      type,
      mode,
      title: typeof raw.title === "string" ? raw.title : undefined,
      raw: unknownType || undefined,
      // Unknown types keep their entire raw entry for later decoding:
      source: unknownType
        ? { format: formatName, raw }
        : {
            format: formatName,
            raw:
              raw.widgets_values === undefined ? undefined : { widgets_values: raw.widgets_values },
          },
    });
    idMap.set(srcId, node);
  }

  // Widget decoding (positional) per defs.
  for (const raw of doc.nodes) {
    const srcId = String(raw.id);
    const mapped = idMap.get(srcId);
    if (!mapped) continue; // reroute/primitive/note
    const node = g.nodes[mapped];
    const def = defs?.[raw.type];
    if (!def) continue; // raw node: widget decode impossible without defs
    if (raw.widgets_values === undefined) continue;

    if (
      raw.widgets_values !== null &&
      typeof raw.widgets_values === "object" &&
      !Array.isArray(raw.widgets_values)
    ) {
      // Named widget map (workflow v1 style).
      for (const [k, v] of Object.entries(raw.widgets_values as Record<string, unknown>)) {
        node.params[k] = v as ParamValue;
      }
      continue;
    }
    const values = raw.widgets_values as unknown[];
    const widgetInputs = def.inputs.filter((i) => i.kind !== "connection" && !i.forceInput);
    let pos = 0;
    for (const input of widgetInputs) {
      if (pos >= values.length) break;
      let value = values[pos++];
      if (input.controlAfterGenerate && pos < values.length && typeof values[pos] === "string") {
        pos++; // frontend control dropdown ("fixed"/"increment"/"randomize"/"decrement")
      }
      if (input.kind === "int" && typeof value === "string" && /^-?\d+$/.test(value))
        value = BigInt(value);
      node.params[input.name] = value as ParamValue;
    }
    if (pos < values.length) {
      diagnostics.push({
        code: "W_EXTRA_WIDGET_VALUES",
        message: `Node "${srcId}" (${raw.type}) had ${values.length - pos} undecoded widget value(s); preserved in node.source`,
        nodeId: srcId,
      });
    }
  }

  // Resolve an origin (node, slot) to a SlotRef, tracing Reroutes and Primitives.
  const resolveOrigin = (originId: string, originSlot: number, depth = 0): SlotRef | null => {
    if (depth > 64) {
      diagnostics.push({
        code: "W_REROUTE_CHAIN_TOO_DEEP",
        message: `Reroute/Primitive chain from "${originId}" exceeded depth limit`,
      });
      return null;
    }
    const origin = byId.get(originId);
    if (!origin) {
      diagnostics.push({
        code: "W_DANGLING_LINK",
        message: `Link origin node "${originId}" does not exist`,
      });
      return null;
    }
    if (origin.type === "Reroute") {
      const incoming = (linksByTarget.get(originId) ?? []).find((l) => l.targetSlot === 0);
      if (!incoming) {
        diagnostics.push({
          code: "W_DANGLING_REROUTE",
          message: `Reroute "${originId}" has no input link`,
          nodeId: originId,
        });
        return null;
      }
      return resolveOrigin(incoming.originId, incoming.originSlot, depth + 1);
    }
    if (origin.type === "PrimitiveNode") {
      // Primitives are resolved to values by the consumer wiring pass; reaching
      // one through a socket link means it feeds a real socket — keep it as a
      // raw node.
      const mapped = ensurePrimitiveNode(origin, formatName);
      return { node: mapped, out: originSlot };
    }
    const mapped = idMap.get(originId);
    if (!mapped) return null;
    return { node: mapped, out: originSlot };
  };

  const primitiveValues = new Map<string, ParamValue>();
  const ensurePrimitiveNode = (origin: RawEditorNode, format: string): NodeId => {
    const srcId = String(origin.id);
    const existing = idMap.get(srcId);
    if (existing) return existing;
    const values = Array.isArray(origin.widgets_values) ? origin.widgets_values : [];
    primitiveValues.set(srcId, (values[0] ?? null) as ParamValue);
    const created = addNode(g, {
      id: srcId,
      type: "PrimitiveNode",
      raw: true,
      outputTypes: [],
      source: { format, raw: origin },
    });
    idMap.set(srcId, created);
    return created;
  };

  // Second pass: wire connections and primitive-fed widget values.
  for (const raw of doc.nodes) {
    const targetMapped = idMap.get(String(raw.id));
    if (!targetMapped) continue;
    const target = g.nodes[targetMapped];
    const incoming = linksByTarget.get(String(raw.id)) ?? [];

    for (const link of incoming) {
      const socket = raw.inputs?.[link.targetSlot];
      const inputName = socket?.name ?? `input_${link.targetSlot}`;
      const widgetName = socket?.widget?.name;
      const origin = byId.get(link.originId);

      if (widgetName && origin?.type === "PrimitiveNode") {
        // Widget-converted input fed by a PrimitiveNode → inline the value.
        const values = Array.isArray(origin.widgets_values) ? origin.widgets_values : [];
        target.params[widgetName] = (values[0] ?? null) as ParamValue;
        continue;
      }
      const resolved = resolveOrigin(link.originId, link.originSlot);
      if (resolved) target.inputs[inputName] = resolved;
    }
  }

  // Third pass: primitive nodes feeding sockets stay as raw nodes with their value.
  for (const [srcId, value] of primitiveValues) {
    const mapped = idMap.get(srcId);
    if (mapped && g.nodes[mapped]) g.nodes[mapped].params["value"] = value;
  }

  // Bypass mappings are NOT derived here. Inferring "output slot → the single
  // same-typed connected input" would merely move the prohibited type-match
  // heuristic from the compiler into the importer — Comfy's actual bypass
  // semantics are frontend/node-specific and this importer has no proof of
  // them. Bypassed nodes are imported WITHOUT bypassMap; consumers of their
  // outputs fail compilation with E_UNRESOLVED_BYPASS unless the user (or a
  // future importer with proven frontend semantics) supplies the mapping
  // explicitly. The original editor JSON remains in node.source for manual
  // rewiring.
  declareDefaultOutputs(g, defs);
  void formatNameCheck(formatName);
  return { graph: g, diagnostics };
}

function formatNameCheck(_f: string): void {
  /* format name is recorded per-node in source.format */
}
