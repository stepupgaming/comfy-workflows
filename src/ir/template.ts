import { ComfyError, ErrorCodes } from "../errors.js";
import { cloneGraph, connect, connectList, topoSort } from "./graph.js";
import { isParamRef, type Graph, type ParamValue, type SlotRef } from "./types.js";

export interface InstantiateBindings {
  /** Values for the template's ParamRef placeholders. */
  params?: Record<string, ParamValue>;
  /** SlotRefs for the template's input ports. */
  inputs?: Record<string, SlotRef | SlotRef[]>;
}

/**
 * Instantiate a template (a Graph carrying ParamRef placeholders and/or input
 * ports) into a concrete Graph:
 *
 * 1. every `{$param}` placeholder is replaced by its bound value, falling back
 *    to the param's declared default; E_UNBOUND_PARAM if neither exists,
 * 2. every port is bound to the provided SlotRef (E_UNBOUND_PORT otherwise),
 * 3. node ids are renumbered deterministically (n1..nN in topological order)
 *    so repeated instantiation of the same template with the same bindings
 *    yields byte-identical output.
 *
 * Pure: the template is not mutated.
 */
export function instantiateTemplate(tpl: Graph, bindings: InstantiateBindings = {}): Graph {
  const g = cloneGraph(tpl);

  // Effective bindings: explicit values win over declared defaults.
  const effective: Record<string, ParamValue> = {};
  for (const def of Object.values(tpl.params ?? {})) {
    if (def.default !== undefined) effective[def.name] = def.default;
  }
  for (const [name, value] of Object.entries(bindings.params ?? {})) {
    effective[name] = value;
  }

  // 1. Resolve ParamRef placeholders everywhere in params (including arrays).
  for (const node of Object.values(g.nodes)) {
    for (const [name, value] of Object.entries(node.params)) {
      const resolved = resolvePlaceholders(value, effective);
      if (resolved === UNRESOLVED) {
        throw new ComfyError({
          code: ErrorCodes.UnboundParam,
          message: `Template param "${isParamRef(value) ? value.$param : "?"}" was not bound and has no default`,
          input: name,
          hint: "Pass params: { name: value } to instantiateTemplate, or declare a default.",
        });
      }
      node.params[name] = resolved;
    }
  }

  // 2. Bind ports.
  for (const port of g.ports ?? []) {
    const bound = bindings.inputs?.[port.name];
    if (!bound) {
      throw new ComfyError({
        code: ErrorCodes.UnboundPort,
        message: `Template port "${port.name}" was not bound`,
        input: port.name,
        nodeId: port.node,
        hint: `Pass inputs: { ${port.name}: <slotRef> } to instantiateTemplate`,
      });
    }
    if (!(port.node in g.nodes)) {
      throw new ComfyError({
        code: ErrorCodes.InvalidGraph,
        message: `Template port "${port.name}" references unknown node "${port.node}"`,
      });
    }
    if (Array.isArray(bound))
      connectList(
        g,
        port.node,
        port.input,
        bound.map((r) => ({ ...r })),
      );
    else connect(g, port.node, port.input, { ...bound });
  }
  delete g.ports;
  delete g.params;

  // 3. Deterministic renumbering in topological order.
  const order = topoSort(g);
  const mapping: Record<string, string> = {};
  order.forEach((oldId, i) => {
    mapping[oldId] = `n${i + 1}`;
  });
  const renamed: Record<string, (typeof g.nodes)[string]> = {};
  for (const oldId of order) renamed[mapping[oldId]] = g.nodes[oldId];
  g.nodes = renamed;
  for (const node of Object.values(g.nodes)) {
    for (const [inputName, ref] of Object.entries(node.inputs)) {
      if (Array.isArray(ref))
        node.inputs[inputName] = ref.map((r) => ({ ...r, node: mapping[r.node] ?? r.node }));
      else node.inputs[inputName] = { ...ref, node: mapping[ref.node] ?? ref.node };
    }
  }
  g.outputs = g.outputs.map((o) => ({ ...o, node: mapping[o.node] ?? o.node }));
  if (tpl.name !== undefined) g.name = tpl.name;

  return g;
}

const UNRESOLVED = Symbol("unresolved-param");

function resolvePlaceholders(
  value: ParamValue,
  effective: Record<string, ParamValue>,
): ParamValue | typeof UNRESOLVED {
  if (Array.isArray(value)) {
    const out: ParamValue[] = [];
    for (const v of value) {
      const r = resolvePlaceholders(v, effective);
      if (r === UNRESOLVED) return UNRESOLVED;
      out.push(r);
    }
    return out;
  }
  if (!isParamRef(value)) return value;
  if (value.$param in effective) return effective[value.$param];
  return UNRESOLVED;
}

export interface TemplateParamInfo {
  name: string;
  required: boolean;
  type?: string;
  description?: string;
}

/** Introspect a template's params — used by explain() and the CLI. */
export function templateParams(tpl: Graph): TemplateParamInfo[] {
  return Object.values(tpl.params ?? {}).map((def) => ({
    name: def.name,
    required: def.default === undefined,
    type: def.type,
    description: def.description,
  }));
}

export function templatePorts(tpl: Graph): Array<{ name: string; type?: string }> {
  return (tpl.ports ?? []).map((p) => ({ name: p.name, type: p.type }));
}
