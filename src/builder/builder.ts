import {
  addNode as irAddNode,
  declareOutput,
  nextNodeId,
  type Graph,
  type NodeId,
  type NodeInstance,
  type NodeMode,
  type ParamValue,
  type SlotRef,
  type TemplateParamDef,
  type TemplatePort,
} from "../ir/index.js";
import { AssetRef, isParamRef, paramRef, type ParamRef } from "../ir/types.js";
import {
  isNodeOutput,
  type NodeHandle,
  type NodeOutput,
  type NodeParamsOf,
  type NodeSpec,
  type OutputEntry,
  type RawHandle,
} from "./types.js";

/**
 * The authoring layer. `workflow()` returns a builder that produces a Graph
 * (or, when params/ports are declared, a template Graph carrying ParamRef
 * placeholders).
 *
 * Agents normally work at the recipe level; this is the level below — typed
 * per-node, composable, and deterministic.
 */
export class GraphBuilder {
  readonly graph: Graph;
  private portList: TemplatePort[] = [];

  constructor(name?: string) {
    this.graph = { irVersion: 1, nodes: {}, outputs: [] };
    if (name !== undefined) this.graph.name = name;
  }

  /** Declare a template parameter; returns a placeholder usable in any param slot. */
  param(name: string, def: Omit<TemplateParamDef, "name"> = { type: "string" }): ParamRef {
    if (!this.graph.params) this.graph.params = {};
    if (name in this.graph.params) {
      throw new Error(`Template param "${name}" is already declared`);
    }
    this.graph.params[name] = { name, ...def };
    return paramRef(name);
  }

  /** Declare a template input port: an unbound connection input, bound at instantiate. */
  port(name: string, nodeId: NodeId, input: string, type?: string): void {
    this.portList.push(
      type !== undefined ? { name, node: nodeId, input, type } : { name, node: nodeId, input },
    );
    this.graph.ports = this.portList;
  }

  /**
   * Add a typed node. `params` is fully type-checked against the spec:
   * connection inputs take typed NodeOutput refs, widgets take literals,
   * combos accept AssetRef, and everything accepts template placeholders.
   * `opts.id` preserves a specific node id (imported workflows).
   */
  add<S extends NodeSpec>(
    spec: S,
    params: NodeParamsOf<S>,
    opts: { id?: NodeId } = {},
  ): NodeHandle<S> {
    const id = irAddNode(this.graph, { type: spec.classType, id: opts.id });
    applyParams(this.graph, id, params as Record<string, unknown>);
    return makeHandle<S>(id, spec.outputs);
  }

  /**
   * Escape hatch: add a node whose runtime behavior /object_info does not
   * adequately describe (or that is missing from defs entirely). Params are
   * validated structurally only. Values may be literals, NodeOutput refs, or
   * arrays of either.
   */
  rawNode(
    classType: string,
    values: Record<string, unknown>,
    opts: { outputs?: OutputEntry[]; title?: string; id?: NodeId; mode?: NodeMode } = {},
  ): RawHandle {
    const id = irAddNode(this.graph, {
      type: classType,
      raw: true,
      outputTypes: opts.outputs?.map((o) => o.type),
      outputNames: opts.outputs?.map((o) => o.name).filter((n): n is string => n !== undefined),
      title: opts.title,
      id: opts.id,
      mode: opts.mode,
    });
    applyParams(this.graph, id, values);
    return makeRawHandle(id, opts.outputs ?? []);
  }

  /** Escape hatch: wire any output ref into any input by name. */
  connectInput(
    target: NodeId | { id: NodeId },
    inputName: string,
    ref: NodeOutput | NodeOutput[],
  ): void {
    const id = typeof target === "string" ? target : target.id;
    const refs: SlotRef | SlotRef[] = Array.isArray(ref)
      ? ref.map((r) => ({ node: r.node, out: r.out }))
      : { node: ref.node, out: ref.out };
    this.graph.nodes[id].inputs[inputName] = refs;
  }

  /** Escape hatch: set a raw param value directly. */
  setParamRaw(target: NodeId | { id: NodeId }, name: string, value: ParamValue): void {
    const id = typeof target === "string" ? target : target.id;
    this.graph.nodes[id].params[name] = value;
  }

  setMode(target: NodeId | { id: NodeId }, mode: NodeMode): void {
    const id = typeof target === "string" ? target : target.id;
    this.graph.nodes[id].mode = mode;
  }

  setTitle(target: NodeId | { id: NodeId }, title: string): void {
    const id = typeof target === "string" ? target : target.id;
    this.graph.nodes[id].title = title;
  }

  setBypassMap(target: NodeId | { id: NodeId }, map: Record<number, string>): void {
    const id = typeof target === "string" ? target : target.id;
    this.graph.nodes[id].bypassMap = map;
  }

  /** Declare a graph output: what the runtime should fetch/return from a run. */
  output(ref: NodeOutput | NodeOutput[], decl: { name?: string } = {}): void {
    if (Array.isArray(ref)) {
      // List outputs are declared by their first element for artifact selection.
      declareOutput(this.graph, {
        node: ref[0].node,
        out: ref[0].out,
        ...(decl.name ? { name: decl.name } : {}),
      });
      return;
    }
    declareOutput(this.graph, {
      node: ref.node,
      out: ref.out,
      ...(decl.name ? { name: decl.name } : {}),
    });
  }

  /** Finalize and return the Graph (also a template when params/ports exist). */
  toGraph(): Graph {
    return this.graph;
  }

  /** Human/agent-readable description of what this builder expands into. */
  explain(): string {
    const lines: string[] = [];
    if (this.graph.name) lines.push(`workflow: ${this.graph.name}`);
    const ids = Object.keys(this.graph.nodes);
    lines.push(`nodes (${ids.length}):`);
    for (const id of ids) {
      const n = this.graph.nodes[id];
      const parts: string[] = [];
      for (const [k, v] of Object.entries(n.params)) parts.push(`${k}=${describeParam(v)}`);
      for (const [k, v] of Object.entries(n.inputs)) {
        if (Array.isArray(v)) parts.push(`${k}=[${v.map((r) => `${r.node}:${r.out}`).join(", ")}]`);
        else parts.push(`${k}=${v.node}:${v.out}`);
      }
      const mode = n.mode && n.mode !== "active" ? ` [${n.mode}]` : "";
      lines.push(`  ${id}: ${n.type}${mode}${parts.length ? " { " + parts.join(", ") + " }" : ""}`);
    }
    if (this.graph.params && Object.keys(this.graph.params).length > 0) {
      lines.push(`params: ${Object.keys(this.graph.params).join(", ")}`);
    }
    if (this.portList.length > 0) {
      lines.push(
        `ports: ${this.portList.map((p) => `${p.name} -> ${p.node}.${p.input}`).join(", ")}`,
      );
    }
    if (this.graph.outputs.length > 0) {
      lines.push(`outputs: ${this.graph.outputs.map((o) => `${o.node}:${o.out}`).join(", ")}`);
    }
    return lines.join("\n");
  }
}

export function workflow(name?: string): GraphBuilder {
  return new GraphBuilder(name);
}

/* ------------------------------------------------------------------ */

function applyParams(g: Graph, id: NodeId, params: Record<string, unknown>): void {
  const node = g.nodes[id];
  for (const [name, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (isNodeOutput(value)) {
      node.inputs[name] = { node: value.node, out: value.out };
    } else if (Array.isArray(value) && value.length > 0 && isNodeOutput(value[0])) {
      node.inputs[name] = (value as NodeOutput[]).map((r) => ({ node: r.node, out: r.out }));
    } else {
      node.params[name] = value as ParamValue;
    }
  }
}

function makeOut(id: NodeId, i: number): NodeOutput {
  return Object.freeze({ __outType: "", node: id, out: i }) as NodeOutput;
}

/** Raw outputs get a `never` brand: assignable to any typed input, by design. */
function makeRawOut(id: NodeId, i: number): NodeOutput<never> {
  return Object.freeze({ __outType: "" as never, node: id, out: i });
}

export function makeHandle<S extends NodeSpec>(id: NodeId, outputs: S["outputs"]): NodeHandle<S> {
  const slots = outputs.map((_, i) => makeOut(id, i));
  const handle: Record<string, unknown> = {
    id,
    out: (i: number) => slots[i] ?? makeOut(id, i),
    slots,
  };
  const seen = new Set<string>();
  outputs.forEach((entry, i) => {
    const key = sanitizeIdentifier(entry.name ?? entry.type);
    if (key && !seen.has(key)) {
      seen.add(key);
      handle[key] = slots[i];
    }
  });
  return handle as unknown as NodeHandle<S>;
}

function makeRawHandle(id: NodeId, entries: ReadonlyArray<OutputEntry>): RawHandle {
  const slots: NodeOutput[] = [];
  for (let i = 0; i < entries.length; i++) slots.push(makeRawOut(id, i));
  const record: Record<string, unknown> = {
    id,
    out: (i: number) => slots[i] ?? makeRawOut(id, i),
    slots,
  };
  const seen = new Set<string>();
  entries.forEach((entry, i) => {
    const key = sanitizeIdentifier(entry.name ?? entry.type);
    if (key && !seen.has(key)) {
      seen.add(key);
      record[key] = slots[i];
    }
  });
  const handle = {
    ...record,
    byName(name: string): NodeOutput | undefined {
      return record[sanitizeIdentifier(name)] as NodeOutput | undefined;
    },
  };
  return handle as unknown as RawHandle;
}

export function sanitizeIdentifier(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9_$]/g, "_");
  if (/^[0-9]/.test(cleaned)) return `_${cleaned}`;
  return cleaned;
}

function describeParam(v: ParamValue): string {
  if (isParamRef(v)) return `<param:${v.$param}>`;
  if (v instanceof AssetRef) return `<asset:${v.path}>`;
  if (typeof v === "bigint") return `${v}n`;
  if (typeof v === "string") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(describeParam).join(", ")}]`;
  return String(v);
}
