import { ComfyError, ErrorCodes, type ComfyErrorFields } from "../errors.js";
import { topoSort } from "../ir/index.js";
import { isParamRef, type Graph, type NodeId, type ParamValue } from "../ir/index.js";
import { AssetRef } from "../ir/types.js";
import { isConnectionInput, type DefInput, type NodeDefs } from "../defs/index.js";
import { sortedNodeIds } from "../ir/types.js";

export interface ValidationResult {
  ok: boolean;
  errors: ComfyError[];
  /** Non-fatal findings (e.g. file-backed combo values we can't verify locally). */
  warnings: ComfyError[];
}

/**
 * Validate a (lowered) graph. Structural checks always run; def-based checks
 * (types, combos, ranges, required inputs) run when defs are provided for the
 * node's class. Raw nodes are validated structurally only.
 */
export function validateGraph(g: Graph, defs?: NodeDefs): ValidationResult {
  const errors: ComfyError[] = [];
  const warnings: ComfyError[] = [];
  const push = (fields: ComfyErrorFields) => errors.push(new ComfyError(fields));
  const warn = (fields: ComfyErrorFields) => warnings.push(new ComfyError(fields));

  const outputCountOf = (id: NodeId): number | undefined => {
    const node = g.nodes[id];
    if (!node) return undefined;
    if (node.raw) return node.outputTypes?.length;
    const def = defs?.[node.type];
    if (def) return def.outputs.length;
    return node.outputTypes?.length;
  };

  const outputTypeOf = (id: NodeId, out: number): string | undefined => {
    const node = g.nodes[id];
    if (!node) return undefined;
    if (node.raw) return node.outputTypes?.[out];
    const def = defs?.[node.type];
    if (!def) return node.outputTypes?.[out];
    return def.outputs[out]?.type;
  };

  for (const id of sortedNodeIds(g)) {
    const node = g.nodes[id];
    const def = node.raw ? undefined : defs?.[node.type];

    if (!node.raw && defs && !def) {
      push({
        code: ErrorCodes.UnknownNodeType,
        message: `Node "${id}" uses unknown type "${node.type}"`,
        nodeId: id,
        hint: "Regenerate wrappers with `comfy codegen` against the target instance, or mark the node raw.",
      });
      continue;
    }

    if (def) {
      validateAgainstDef(id, node.params, node.inputs, def, push, warn);
    }

    // Structural ref checks (all nodes).
    for (const [inputName, ref] of Object.entries(node.inputs)) {
      const checkOne = (r: { node: NodeId; out: number }) => {
        const target = g.nodes[r.node];
        if (!target) {
          push({
            code: ErrorCodes.InvalidGraph,
            message: `Input "${inputName}" of node "${id}" references unknown node "${r.node}"`,
            nodeId: id,
            input: inputName,
          });
          return;
        }
        const count = outputCountOf(r.node);
        if (count !== undefined && (r.out < 0 || r.out >= count)) {
          push({
            code: ErrorCodes.InvalidGraph,
            message: `Input "${inputName}" of node "${id}" references output slot ${r.out} of "${r.node}", which has ${count} output(s)`,
            nodeId: id,
            input: inputName,
          });
          return;
        }
        if (def) {
          const expected = def.inputs.find((i) => i.name === inputName)?.type;
          const got = outputTypeOf(r.node, r.out);
          if (expected !== undefined && got !== undefined && expected !== got) {
            push({
              code: ErrorCodes.TypeMismatch,
              message: `Input "${inputName}" of node "${id}" expects ${expected} but ${r.node} output ${r.out} is ${got}`,
              nodeId: id,
              input: inputName,
              expected,
              got,
            });
          }
        }
      };
      if (Array.isArray(ref)) ref.forEach(checkOne);
      else checkOne(ref);
    }
  }

  // Cycles.
  try {
    topoSort(g);
  } catch (e) {
    if (e instanceof ComfyError) errors.push(e);
    else errors.push(new ComfyError({ code: ErrorCodes.Cycle, message: String(e) }));
  }

  return { ok: errors.length === 0, errors, warnings };
}

/** File-backed combo values (models, images) vary per server — only the server can verify them. */
function isFileLike(value: string): boolean {
  return /\.[A-Za-z0-9]+$/.test(value) || value.includes("/") || value.includes("\\");
}

function validateAgainstDef(
  id: NodeId,
  params: Record<string, ParamValue>,
  inputs: Record<string, unknown>,
  def: import("../defs/types.js").NodeDef,
  push: (fields: ComfyErrorFields) => void,
  warn: (fields: ComfyErrorFields) => void,
): void {
  const byName = new Map<string, DefInput>();
  for (const input of def.inputs) byName.set(input.name, input);

  // Params must correspond to widget-kind inputs.
  for (const [name, value] of Object.entries(params)) {
    const input = byName.get(name);
    if (!input) {
      push({
        code: ErrorCodes.UnknownInput,
        message: `Node "${id}" (${def.classType}) has no input named "${name}"`,
        nodeId: id,
        input: name,
        hint: `Valid inputs: ${def.inputs.map((i) => i.name).join(", ") || "(none)"}`,
      });
      continue;
    }
    if (input.kind === "connection") {
      push({
        code: ErrorCodes.InvalidInput,
        message: `Node "${id}": "${name}" is a ${input.type} connection, not a widget value`,
        nodeId: id,
        input: name,
        expected: `connection of type ${input.type}`,
        got: "literal value",
      });
      continue;
    }
    checkParamValue(id, name, value, input, push, warn);
  }

  // Connection-kind inputs must come via node.inputs, not params.
  for (const [name, ref] of Object.entries(inputs)) {
    const input = byName.get(name);
    if (!input) {
      push({
        code: ErrorCodes.UnknownInput,
        message: `Node "${id}" (${def.classType}) has no input named "${name}"`,
        nodeId: id,
        input: name,
      });
      continue;
    }
    if (input.kind !== "connection" && !input.forceInput) {
      push({
        code: ErrorCodes.InvalidInput,
        message: `Node "${id}": "${name}" is a ${input.kind} widget; connect via params instead of a slot ref`,
        nodeId: id,
        input: name,
        expected: `literal ${input.kind} value`,
        got: "slot connection",
      });
    }
  }

  // Required inputs must be satisfied.
  for (const input of def.inputs) {
    if (!input.required) continue;
    if (isConnectionInput(input)) {
      if (!(input.name in inputs)) {
        push({
          code: ErrorCodes.MissingInput,
          message: `Node "${id}" (${def.classType}) is missing required connection "${input.name}" (${input.type})`,
          nodeId: id,
          input: input.name,
        });
      }
    } else if (!(input.name in params) && input.default === undefined) {
      push({
        code: ErrorCodes.MissingInput,
        message: `Node "${id}" (${def.classType}) is missing required ${input.kind} "${input.name}" and it has no default`,
        nodeId: id,
        input: input.name,
      });
    }
  }
}

function checkParamValue(
  id: NodeId,
  name: string,
  value: ParamValue,
  input: DefInput,
  push: (fields: ComfyErrorFields) => void,
  warn: (fields: ComfyErrorFields) => void,
): void {
  if (isParamRef(value)) return; // template placeholder; resolved before compile
  if (value instanceof AssetRef) {
    if (input.kind !== "combo" && input.kind !== "string") {
      push({
        code: ErrorCodes.InvalidParam,
        message: `Node "${id}": asset value for "${name}" is only valid for combo/string inputs`,
        nodeId: id,
        input: name,
      });
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) checkParamValue(id, name, v, input, push, warn);
    return;
  }
  switch (input.kind) {
    case "combo": {
      const options = input.options ?? [];
      if (!options.some((o) => o === value)) {
        const fields: ComfyErrorFields = {
          code: ErrorCodes.BadCombo,
          message: `Node "${id}": "${name}" value ${JSON.stringify(value)} is not one of the known options`,
          nodeId: id,
          input: name,
          allowed: options.map(String),
          got: String(value),
        };
        if (typeof value === "string" && isFileLike(value)) {
          // The server's file list differs from any local snapshot — warn, and
          // let the server's own validation decide at submit time.
          warn({
            ...fields,
            message: `${fields.message} (file-backed combo; server list may differ)`,
          });
        } else {
          push(fields);
        }
      }
      break;
    }
    case "int": {
      const n = typeof value === "bigint" ? undefined : value;
      if (typeof value === "number" && !Number.isInteger(value)) {
        push({
          code: ErrorCodes.InvalidParam,
          message: `Node "${id}": "${name}" must be an integer, got ${value}`,
          nodeId: id,
          input: name,
          got: String(value),
        });
        break;
      }
      const cmp = typeof value === "bigint" ? value : BigInt(Object.is(n, -0) ? 0 : (n as number));
      if (input.min !== undefined && cmp < BigInt(Math.trunc(input.min))) {
        push({
          code: ErrorCodes.Range,
          message: `Node "${id}": "${name}" value ${cmp} is below minimum ${input.min}`,
          nodeId: id,
          input: name,
          expected: `>= ${input.min}`,
          got: cmp.toString(),
        });
      }
      if (input.max !== undefined && cmp > BigInt(Math.ceil(input.max))) {
        push({
          code: ErrorCodes.Range,
          message: `Node "${id}": "${name}" value ${cmp} is above maximum ${input.max}`,
          nodeId: id,
          input: name,
          expected: `<= ${input.max}`,
          got: cmp.toString(),
        });
      }
      break;
    }
    case "float": {
      if (typeof value !== "number") {
        push({
          code: ErrorCodes.InvalidParam,
          message: `Node "${id}": "${name}" must be a number, got ${typeof value}`,
          nodeId: id,
          input: name,
          got: typeof value,
        });
        break;
      }
      if (input.min !== undefined && value < input.min) {
        push({
          code: ErrorCodes.Range,
          message: `Node "${id}": "${name}" value ${value} is below minimum ${input.min}`,
          nodeId: id,
          input: name,
          expected: `>= ${input.min}`,
          got: String(value),
        });
      }
      if (input.max !== undefined && value > input.max) {
        push({
          code: ErrorCodes.Range,
          message: `Node "${id}": "${name}" value ${value} is above maximum ${input.max}`,
          nodeId: id,
          input: name,
          expected: `<= ${input.max}`,
          got: String(value),
        });
      }
      break;
    }
    case "string": {
      if (typeof value !== "string") {
        push({
          code: ErrorCodes.InvalidParam,
          message: `Node "${id}": "${name}" must be a string, got ${typeof value}`,
          nodeId: id,
          input: name,
          got: typeof value,
        });
      }
      break;
    }
    case "boolean": {
      if (typeof value !== "boolean") {
        push({
          code: ErrorCodes.InvalidParam,
          message: `Node "${id}": "${name}" must be a boolean, got ${typeof value}`,
          nodeId: id,
          input: name,
          got: typeof value,
        });
      }
      break;
    }
    case "connection":
      break; // handled elsewhere
  }
}
