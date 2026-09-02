import { ComfyError, ErrorCodes } from "../errors.js";
import { cloneGraph, type Graph, type NodeId, type SlotRef } from "../ir/index.js";
import type { NodeDefs } from "../defs/index.js";

export interface BypassLowering {
  graph: Graph;
  errors: ComfyError[];
}

/**
 * Conservative bypass lowering.
 *
 * Bypassed nodes pass their inputs through to their outputs — but the exact
 * pass-through semantics live in the Comfy frontend, and custom nodes can
 * deviate. This pass therefore resolves a bypassed node's output only when it
 * can do so *unambiguously*:
 *
 *  1. an explicit `bypassMap` (output index → input name) on the node, else
 *  2. exactly one connected input whose declared type matches the output type.
 *
 * Zero matches or multiple matches produce E_UNRESOLVED_BYPASS with the
 * candidate inputs listed — never a silent guess. Muted nodes are dropped;
 * consumers that still reference them produce E_MUTED_CONSUMED.
 */
export function lowerBypass(g: Graph, defs?: NodeDefs): BypassLowering {
  const errors: ComfyError[] = [];
  const out = cloneGraph(g);

  const outputTypesOf = (id: NodeId): string[] | undefined => {
    const node = out.nodes[id];
    if (!node) return undefined;
    if (node.raw) return node.outputTypes;
    const def = defs?.[node.type];
    return def ? def.outputs.map((o) => o.type) : node.outputTypes;
  };

  // Resolve every reference that points into a bypassed (or muted) node.
  const resolveRef = (consumer: NodeId, inputName: string, start: SlotRef): SlotRef | null => {
    let ref: SlotRef = start;
    const visited = new Set<string>();
    for (;;) {
      const target = out.nodes[ref.node];
      if (!target) {
        errors.push(
          new ComfyError({
            code: ErrorCodes.InvalidGraph,
            message: `Input "${inputName}" of node "${consumer}" references unknown node "${ref.node}"`,
            nodeId: consumer,
            input: inputName,
          }),
        );
        return null;
      }
      if (target.mode === "muted") {
        errors.push(
          new ComfyError({
            code: ErrorCodes.MutedConsumed,
            message: `Input "${inputName}" of node "${consumer}" references muted node "${ref.node}" (${target.type})`,
            nodeId: consumer,
            input: inputName,
            hint: "Unmute the node, remove the connection, or prune the consumer.",
          }),
        );
        return null;
      }
      if (target.mode !== "bypassed") return ref;

      const key = `${ref.node}:${ref.out}`;
      if (visited.has(key)) {
        errors.push(
          new ComfyError({
            code: ErrorCodes.UnresolvedBypass,
            message: `Bypass resolution for "${consumer}.${inputName}" loops through node "${ref.node}"`,
            nodeId: ref.node,
            hint: "A cycle exists among bypassed nodes; resolve it by un-bypassing one of them.",
          }),
        );
        return null;
      }
      visited.add(key);

      const types = outputTypesOf(ref.node);
      const outType = types?.[ref.out];
      if (outType === undefined) {
        errors.push(
          new ComfyError({
            code: ErrorCodes.UnresolvedBypass,
            message: `Cannot determine the output type of bypassed node "${ref.node}" slot ${ref.out}`,
            nodeId: ref.node,
            hint: "Provide defs, or declare outputTypes on the raw node.",
          }),
        );
        return null;
      }

      let nextRef: SlotRef | undefined;
      const explicit = target.bypassMap?.[ref.out];
      if (explicit !== undefined) {
        const candidate = target.inputs[explicit];
        if (candidate === undefined || Array.isArray(candidate)) {
          errors.push(
            new ComfyError({
              code: ErrorCodes.UnresolvedBypass,
              message: `bypassMap for node "${ref.node}" output ${ref.out} points at input "${explicit}", which has no single connection`,
              nodeId: ref.node,
              input: explicit,
            }),
          );
          return null;
        }
        nextRef = candidate;
      } else {
        // Policy: bypass mapping is NEVER guessed from type matching. The
        // frontend's pass-through semantics are not proven to correspond to
        // "exactly one same-typed input", and a wrong guess silently compiles
        // a graph that differs from what the user saw. Require an explicit
        // (or importer-derived) bypassMap.
        const candidateInputs = Object.keys(target.inputs)
          .filter((k) => !Array.isArray(target.inputs[k]))
          .sort();
        errors.push(
          new ComfyError({
            code: ErrorCodes.UnresolvedBypass,
            message: `Bypassed node "${ref.node}" (${target.type}) output ${ref.out} has no bypassMap entry`,
            nodeId: ref.node,
            expected:
              "an explicit bypassMap {outIndex: inputName} reproducing Comfy's pass-through",
            got:
              candidateInputs.length > 0
                ? `connected inputs: ${candidateInputs.join(", ")}`
                : "no connected inputs",
            hint:
              "Set bypassMap (g.setBypassMap or an import that derives it), or un-bypass the node " +
              "and rewire consumers directly. Comfy's own bypass export semantics are node-specific " +
              "and are not inferred here.",
          }),
        );
        return null;
      }
      ref = { ...nextRef };
    }
  };

  const resolveValue = (
    consumer: NodeId,
    inputName: string,
    value: SlotRef | SlotRef[],
  ): SlotRef | SlotRef[] | null => {
    if (Array.isArray(value)) {
      const resolved: SlotRef[] = [];
      let ok = true;
      for (const r of value) {
        const one = resolveRef(consumer, inputName, r);
        if (one === null) ok = false;
        else resolved.push(one);
      }
      return ok ? resolved : null;
    }
    return resolveRef(consumer, inputName, value);
  };

  for (const id of Object.keys(out.nodes)) {
    const node = out.nodes[id];
    if (node.mode === "bypassed" || node.mode === "muted") continue; // their inputs don't matter
    for (const [inputName, value] of Object.entries(node.inputs)) {
      const resolved = resolveValue(id, inputName, value);
      if (resolved === null) delete node.inputs[inputName];
      else node.inputs[inputName] = resolved;
    }
  }

  // Graph outputs pointing at bypassed/muted nodes get resolved or dropped.
  const resolvedOutputs = [];
  for (const o of out.outputs) {
    const target = out.nodes[o.node];
    if (!target) continue;
    if (target.mode === "active") {
      resolvedOutputs.push(o);
      continue;
    }
    const resolved =
      target.mode === "bypassed"
        ? resolveRef(`(output:${o.node})`, o.node, { node: o.node, out: o.out })
        : null;
    if (resolved) resolvedOutputs.push({ ...o, node: resolved.node, out: resolved.out });
  }
  out.outputs = resolvedOutputs;

  // Drop bypassed and muted nodes entirely.
  for (const id of Object.keys(out.nodes)) {
    if (out.nodes[id].mode === "bypassed" || out.nodes[id].mode === "muted") delete out.nodes[id];
  }

  return { graph: out, errors };
}
