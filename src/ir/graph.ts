import { ComfyError, ErrorCodes } from "../errors.js";
import {
  compareIds,
  createGraph,
  type Graph,
  type GraphOutputDecl,
  type NodeId,
  type NodeInstance,
  type ParamValue,
  type SlotRef,
  sortedNodeIds,
} from "./types.js";

export interface AddNodeInit {
  type: string;
  params?: Record<string, ParamValue>;
  inputs?: Record<string, SlotRef | SlotRef[]>;
  mode?: NodeInstance["mode"];
  title?: string;
  raw?: true;
  outputTypes?: string[];
  outputNames?: string[];
  bypassMap?: Record<number, string>;
  source?: NodeInstance["source"];
  /** Force a specific id (must not collide). */
  id?: NodeId;
}

/** Allocate a fresh deterministic builder id ("n1", "n2", …) that is free in `g`. */
export function nextNodeId(g: Graph): NodeId {
  let i = 1;
  while (`n${i}` in g.nodes) i++;
  return `n${i}`;
}

export function addNode(g: Graph, init: AddNodeInit): NodeId {
  const id = init.id ?? nextNodeId(g);
  if (id in g.nodes) {
    throw new ComfyError({
      code: ErrorCodes.InvalidGraph,
      message: `Node id "${id}" already exists in graph`,
    });
  }
  const node: NodeInstance = {
    type: init.type,
    params: init.params ?? {},
    inputs: init.inputs ?? {},
  };
  if (init.mode !== undefined) node.mode = init.mode;
  if (init.title !== undefined) node.title = init.title;
  if (init.raw) node.raw = true;
  if (init.outputTypes !== undefined) node.outputTypes = init.outputTypes;
  if (init.outputNames !== undefined) node.outputNames = init.outputNames;
  if (init.bypassMap !== undefined) node.bypassMap = init.bypassMap;
  if (init.source !== undefined) node.source = init.source;
  g.nodes[id] = node;
  return id;
}

export function removeNode(g: Graph, id: NodeId, opts: { detach?: boolean } = {}): void {
  if (!(id in g.nodes)) return;
  delete g.nodes[id];
  if (opts.detach) {
    for (const nodeId of Object.keys(g.nodes)) {
      const node = g.nodes[nodeId];
      for (const [inputName, ref] of Object.entries(node.inputs)) {
        if (Array.isArray(ref)) {
          node.inputs[inputName] = ref.filter((r) => r.node !== id) as SlotRef[];
          if ((node.inputs[inputName] as SlotRef[]).length === 0) delete node.inputs[inputName];
        } else if (ref.node === id) {
          delete node.inputs[inputName];
        }
      }
    }
    g.outputs = g.outputs.filter((o) => o.node !== id);
  }
}

export function setParam(g: Graph, id: NodeId, name: string, value: ParamValue): void {
  const node = requireNode(g, id);
  node.params[name] = value;
}

export function connect(g: Graph, targetId: NodeId, inputName: string, ref: SlotRef): void {
  const node = requireNode(g, targetId);
  node.inputs[inputName] = ref;
}

export function connectList(g: Graph, targetId: NodeId, inputName: string, refs: SlotRef[]): void {
  const node = requireNode(g, targetId);
  node.inputs[inputName] = refs;
}

export function disconnect(g: Graph, targetId: NodeId, inputName: string): void {
  const node = requireNode(g, targetId);
  delete node.inputs[inputName];
}

export function declareOutput(g: Graph, decl: GraphOutputDecl): void {
  g.outputs.push(decl);
}

export function requireNode(g: Graph, id: NodeId): NodeInstance {
  const node = g.nodes[id];
  if (!node) {
    throw new ComfyError({
      code: ErrorCodes.InvalidGraph,
      message: `Unknown node id "${id}"`,
      nodeId: id,
    });
  }
  return node;
}

/** All (consumer, inputName, ref) edges pointing at `id`. */
export function consumersOf(
  g: Graph,
  id: NodeId,
): Array<{ consumer: NodeId; input: string; ref: SlotRef }> {
  const result: Array<{ consumer: NodeId; input: string; ref: SlotRef }> = [];
  for (const nodeId of sortedNodeIds(g)) {
    const node = g.nodes[nodeId];
    for (const inputName of Object.keys(node.inputs)) {
      const ref = node.inputs[inputName];
      if (Array.isArray(ref)) {
        for (const r of ref)
          if (r.node === id) result.push({ consumer: nodeId, input: inputName, ref: r });
      } else if (ref.node === id) {
        result.push({ consumer: nodeId, input: inputName, ref });
      }
    }
  }
  return result;
}

/**
 * Deterministic topological order (Kahn's algorithm; ready set is processed in
 * sorted-id order so the result is stable across runs). Throws E_CYCLE with
 * the offending path.
 */
export function topoSort(g: Graph): NodeId[] {
  const indegree = new Map<NodeId, number>();
  const adjacency = new Map<NodeId, NodeId[]>();
  for (const id of Object.keys(g.nodes)) {
    indegree.set(id, 0);
    adjacency.set(id, []);
  }
  for (const id of sortedNodeIds(g)) {
    const node = g.nodes[id];
    const deps = new Set<NodeId>();
    for (const ref of Object.values(node.inputs)) {
      if (Array.isArray(ref)) for (const r of ref) deps.add(r.node);
      else deps.add(ref.node);
    }
    for (const dep of deps) {
      if (!indegree.has(dep)) continue; // dangling refs are a validation error, not a topo error
      indegree.set(id, (indegree.get(id) ?? 0) + 1);
      adjacency.get(dep)?.push(id);
    }
  }
  const ready: NodeId[] = [...indegree.entries()]
    .filter(([, d]) => d === 0)
    .map(([id]) => id)
    .sort(compareIds);
  const order: NodeId[] = [];
  while (ready.length > 0) {
    const id = ready.shift() as NodeId;
    order.push(id);
    for (const next of adjacency.get(id) ?? []) {
      const d = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, d);
      if (d === 0) {
        ready.push(next);
        ready.sort(compareIds);
      }
    }
  }
  if (order.length !== Object.keys(g.nodes).length) {
    const remaining = Object.keys(g.nodes)
      .filter((id) => !order.includes(id))
      .sort(compareIds);
    throw new ComfyError({
      code: ErrorCodes.Cycle,
      message: `Graph contains a cycle involving: ${remaining.join(", ")}`,
      details: { cycleNodes: remaining },
    });
  }
  return order;
}

/** Nodes transitively required by `roots` (including the roots). */
export function reachableFrom(g: Graph, roots: Iterable<NodeId>): Set<NodeId> {
  const seen = new Set<NodeId>();
  const stack: NodeId[] = [...roots];
  while (stack.length > 0) {
    const id = stack.pop() as NodeId;
    if (seen.has(id) || !(id in g.nodes)) continue;
    seen.add(id);
    const node = g.nodes[id];
    for (const ref of Object.values(node.inputs)) {
      if (Array.isArray(ref)) for (const r of ref) stack.push(r.node);
      else stack.push(ref.node);
    }
  }
  return seen;
}

export function cloneGraph(g: Graph): Graph {
  const copy = createGraph(g.name);
  for (const id of sortedNodeIds(g)) {
    const node = g.nodes[id];
    copy.nodes[id] = {
      type: node.type,
      params: structuredCloneParams(node.params),
      inputs: structuredCloneInputs(node.inputs),
      ...(node.mode !== undefined ? { mode: node.mode } : {}),
      ...(node.title !== undefined ? { title: node.title } : {}),
      ...(node.raw ? { raw: true } : {}),
      ...(node.outputTypes ? { outputTypes: [...node.outputTypes] } : {}),
      ...(node.outputNames ? { outputNames: [...node.outputNames] } : {}),
      ...(node.bypassMap ? { bypassMap: { ...node.bypassMap } } : {}),
      ...(node.source ? { source: structuredClone(node.source) } : {}),
    };
  }
  copy.outputs = g.outputs.map((o) => ({ ...o }));
  if (g.params) copy.params = structuredClone(g.params);
  if (g.ports) copy.ports = g.ports.map((p) => ({ ...p }));
  return copy;
}

function structuredCloneParams(params: Record<string, ParamValue>): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = {};
  for (const [k, v] of Object.entries(params)) out[k] = cloneParam(v);
  return out;
}

function cloneParam(v: ParamValue): ParamValue {
  if (Array.isArray(v)) return v.map(cloneParam);
  return v; // scalars, bigint, AssetRef and frozen ParamRef are shared safely
}

function structuredCloneInputs(
  inputs: Record<string, SlotRef | SlotRef[]>,
): Record<string, SlotRef | SlotRef[]> {
  const out: Record<string, SlotRef | SlotRef[]> = {};
  for (const [k, v] of Object.entries(inputs))
    out[k] = Array.isArray(v) ? v.map((r) => ({ ...r })) : { ...v };
  return out;
}

/** Rename node ids according to `mapping`; rewrites all refs and outputs. */
export function renameNodes(g: Graph, mapping: Record<NodeId, NodeId>): void {
  const renamed: Record<NodeId, NodeInstance> = {};
  for (const [oldId, node] of Object.entries(g.nodes)) {
    renamed[mapping[oldId] ?? oldId] = node;
  }
  g.nodes = renamed;
  for (const node of Object.values(g.nodes)) {
    for (const [name, ref] of Object.entries(node.inputs)) {
      if (Array.isArray(ref)) {
        node.inputs[name] = ref.map((r) => ({ ...r, node: mapping[r.node] ?? r.node }));
      } else {
        node.inputs[name] = { ...ref, node: mapping[ref.node] ?? ref.node };
      }
    }
  }
  g.outputs = g.outputs.map((o) => ({ ...o, node: mapping[o.node] ?? o.node }));
}

export { createGraph };
