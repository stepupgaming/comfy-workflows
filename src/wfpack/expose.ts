import { cloneGraph } from "../ir/graph.js";
import {
  isParamRef,
  paramRef,
  type Graph,
  type ParamValue,
  type TemplateParamDef,
} from "../ir/types.js";
import type { NodeDefs } from "../defs/types.js";
import { ComfyError, ErrorCodes } from "../errors.js";
import { isAbsolutePath } from "./portability.js";
import type { WorkflowManifest, WorkflowManifestParam } from "./manifest.js";
import { deriveNodeClasses } from "./discover.js";
import { checkPackageCoherence } from "./derive.js";

export interface ExposeOptions {
  name: string;
  nodeId: string;
  input: string;
  required?: boolean;
  description?: string;
  /** Explicit default; omitted → keep the old literal unless required/local-path. */
  default?: ParamValue;
  defs?: NodeDefs;
}

export interface ExposeResult {
  graph: Graph;
  previous: ParamValue;
}

const PARAM_NAME = /^[A-Za-z_][A-Za-z0-9_-]*$/;

function fail(message: string, hint?: string, details?: unknown): never {
  throw new ComfyError({
    code: ErrorCodes.InvalidGraph,
    message,
    hint,
    details,
  });
}

function typeFromValue(value: ParamValue): TemplateParamDef["type"] {
  if (typeof value === "bigint") return "int";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return Number.isInteger(value) ? "int" : "float";
  return "string";
}

function typeFromDefs(
  graph: Graph,
  nodeId: string,
  input: string,
  value: ParamValue,
  defs?: NodeDefs,
): TemplateParamDef["type"] {
  const node = graph.nodes[nodeId];
  const def = defs?.[node.type]?.inputs.find((i) => i.name === input);
  if (def?.kind === "int") return "int";
  if (def?.kind === "float") return "float";
  if (def?.kind === "boolean") return "boolean";
  if (def?.kind === "combo") return "combo";
  if (def?.kind === "string") return "string";
  return typeFromValue(value);
}

function isLocalPrivate(value: ParamValue): boolean {
  return typeof value === "string" && isAbsolutePath(value);
}

function scalarDefault(value: ParamValue): string | number | boolean | undefined {
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return value;
  if (typeof value === "bigint") {
    const n = Number(value);
    if (Number.isSafeInteger(n) && BigInt(n) === value) return n;
    return undefined;
  }
  return undefined;
}

/**
 * Promote a concrete widget input to a template parameter.
 *
 * Pure: clones the graph. The old literal is kept as the param default unless
 * `--required` is set or the value is a machine-local path.
 */
export function exposeParam(graph: Graph, opts: ExposeOptions): ExposeResult {
  if (!PARAM_NAME.test(opts.name))
    fail(
      `Parameter name "${opts.name}" is not a valid identifier`,
      "Use a letter/underscore start, then letters, digits, hyphens, or underscores.",
    );
  const node = graph.nodes[opts.nodeId];
  if (!node)
    fail(
      `No node "${opts.nodeId}" in the graph`,
      "Pass a node id from the packaged IR (cwf inspect . --json).",
    );
  if (!(opts.input in node.params))
    fail(
      `Node "${opts.nodeId}" (${node.type}) has no widget input "${opts.input}"`,
      `Available widget inputs: ${Object.keys(node.params).join(", ") || "(none)"}.`,
    );
  const previous = node.params[opts.input];
  if (isParamRef(previous))
    fail(
      `Node "${opts.nodeId}" input "${opts.input}" is already bound to parameter "${previous.$param}"`,
    );
  if (graph.params?.[opts.name] !== undefined)
    fail(
      `Parameter "${opts.name}" is already declared`,
      "Pick a different name, or expose a different input.",
    );

  const dropDefault =
    opts.required === true || (opts.default === undefined && isLocalPrivate(previous));
  const type = typeFromDefs(graph, opts.nodeId, opts.input, previous, opts.defs);
  const def: TemplateParamDef = { name: opts.name, type };
  if (opts.description !== undefined) def.description = opts.description;
  if (!dropDefault) def.default = opts.default !== undefined ? opts.default : previous;

  const next = cloneGraph(graph);
  if (!next.params) next.params = {};
  next.params[opts.name] = def;
  next.nodes[opts.nodeId].params[opts.input] = paramRef(opts.name);
  return { graph: next, previous };
}

/** Rebuild a manifest from a (possibly mutated) graph, preserving author metadata. */
export function manifestFromGraph(graph: Graph, previous: WorkflowManifest): WorkflowManifest {
  const parameters: Record<string, WorkflowManifestParam> = {};
  for (const [name, def] of Object.entries(graph.params ?? {})) {
    const required = def.default === undefined;
    const param: WorkflowManifestParam = { type: def.type, required };
    if (def.description !== undefined) param.description = def.description;
    if (def.options !== undefined) param.options = def.options;
    if (def.default !== undefined) {
      const d = scalarDefault(def.default);
      if (d !== undefined) param.default = d;
    }
    parameters[name] = param;
  }
  const outputs = graph.outputs.map((o, i) => {
    const node = graph.nodes[o.node];
    const name = o.name ?? previous.outputs[i]?.name ?? `output-${i}`;
    const type =
      previous.outputs.find((p) => p.name === name)?.type ?? node?.outputTypes?.[o.out] ?? "IMAGE";
    return { name, type };
  });
  return {
    ...previous,
    parameters,
    outputs,
    requires: {
      ...previous.requires,
      nodeClasses: deriveNodeClasses(graph),
    },
  };
}

/** Fail if the mutated package would not pack. */
export function assertExposeCoherent(manifest: WorkflowManifest, graph: Graph): void {
  const report = checkPackageCoherence(manifest, graph);
  const errors = report.diagnostics.filter((d) => d.level === "error");
  if (errors.length > 0) {
    throw new ComfyError({
      code: ErrorCodes.InvalidGraph,
      message: errors.map((e) => `[${e.code}] ${e.message}`).join("; "),
      hint: errors[0]?.hint,
      details: { diagnostics: report.diagnostics },
    });
  }
}
