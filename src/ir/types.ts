/**
 * Graph IR — the canonical semantic representation of a ComfyUI workflow.
 *
 * Design constraints (see ARCHITECTURE.md):
 * - Plain tagged-JSON-serializable data; safe under ordinary `JSON.parse`.
 * - Slot identity is `{nodeId, outputIndex}`. Output names are descriptive
 *   metadata and generated-TS conveniences only — unnamed, duplicated, renamed
 *   and arbitrary custom-node outputs all remain representable.
 * - Integers are `bigint` in memory, `{"$int": "..."}` on disk.
 */

export type NodeId = string;

/** active = execute; bypassed = pass-through (lowered conservatively at compile); muted = off. */
export type NodeMode = "active" | "bypassed" | "muted";

/** Reference to output slot `out` of node `node`. Identity is index-based. */
export interface SlotRef {
  node: NodeId;
  out: number;
}

/** A reference to a template parameter, resolved by `instantiateTemplate`. */
export interface ParamRef {
  readonly $param: string;
}

/**
 * A local file that a runtime must stage (upload) before submission. Stored in
 * params; the runtime replaces it with the server-side filename after upload.
 */
export class AssetRef {
  readonly path: string;
  readonly kind: "image" | "mask";
  /** Optional server-side name to request; defaults to the basename. */
  readonly name?: string;

  constructor(path: string, kind: "image" | "mask" = "image", name?: string) {
    this.path = path;
    this.kind = kind;
    this.name = name;
  }
}

export function paramRef(name: string): ParamRef {
  return Object.freeze({ $param: name });
}

export function isParamRef(value: unknown): value is ParamRef {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    "$param" in value &&
    typeof (value as Record<string, unknown>)["$param"] === "string"
  );
}

export function isAssetRef(value: unknown): value is AssetRef {
  return value instanceof AssetRef;
}

export function slot(node: NodeId, out: number): SlotRef {
  return { node, out };
}

/** Widget/param values a node can carry. Bigints are the lossless integer form. */
export type ParamValue =
  string | number | bigint | boolean | null | AssetRef | ParamRef | ParamValue[];

export interface NodeInstance {
  /** ComfyUI class_type, e.g. "KSampler". */
  type: string;
  /** Widget values (literals, assets, template placeholders). */
  params: Record<string, ParamValue>;
  /** Connection inputs, by input name. Arrays for list-valued inputs. */
  inputs: Record<string, SlotRef | SlotRef[]>;
  mode?: NodeMode;
  title?: string;
  /**
   * Raw node: class whose runtime behavior is not adequately described by
   * /object_info (or not present in defs at all). Params/inputs are validated
   * structurally only. Used by `rawNode()` and by the importer for unknown
   * custom node types.
   */
  raw?: true;
  /** For raw nodes: declared output type names, by output index. */
  outputTypes?: string[];
  /** Optional output display names (metadata only; identity is the index). */
  outputNames?: string[];
  /**
   * Explicit bypass resolution: output index → input name whose connection
   * should pass through. Only ever set deliberately (or by an importer that
   * can determine frontend semantics); otherwise bypass resolution is
   * conservative and yields E_UNRESOLVED_BYPASS.
   */
  bypassMap?: Record<number, string>;
  /**
   * Preserved source metadata for constructs the importer did not fully
   * understand. Never interpreted by the compiler; kept so no information
   * is lost during import.
   */
  source?: { format: string; raw: unknown };
}

export interface GraphOutputDecl {
  node: NodeId;
  out: number;
  /** Optional friendly name for runtime artifacts. */
  name?: string;
}

export interface TemplateParamDef {
  name: string;
  type: "int" | "float" | "string" | "boolean" | "combo";
  default?: ParamValue;
  /** For combo params. */
  options?: (string | number)[];
  description?: string;
}

/** A template input port: an unbound connection input, filled at instantiate. */
export interface TemplatePort {
  name: string;
  node: NodeId;
  input: string;
  /** Declared socket type, when known (e.g. "IMAGE"). */
  type?: string;
}

export interface Graph {
  irVersion: 1;
  name?: string;
  nodes: Record<NodeId, NodeInstance>;
  /** Declared outputs: what the runtime should fetch/return from a run. */
  outputs: GraphOutputDecl[];
  /** Present when the graph is a template (contains ParamRef placeholders). */
  params?: Record<string, TemplateParamDef>;
  /** Present when the graph is a template with unbound input ports. */
  ports?: TemplatePort[];
}

export function createGraph(name?: string): Graph {
  const g: Graph = { irVersion: 1, nodes: {}, outputs: [] };
  if (name !== undefined) g.name = name;
  return g;
}

/**
 * Deterministic id comparison: digit runs compare numerically ("n2" < "n10",
 * "12" < "3" is false), non-digit runs lexicographically. Used everywhere an
 * ordering must be stable across processes.
 */
export function compareIds(a: NodeId, b: NodeId): number {
  return compareIdStrings(a, b);
}

export function compareIdStrings(a: string, b: string): number {
  const chunksA = splitChunks(a);
  const chunksB = splitChunks(b);
  const len = Math.min(chunksA.length, chunksB.length);
  for (let i = 0; i < len; i++) {
    const [ta, va] = chunksA[i];
    const [tb, vb] = chunksB[i];
    if (ta !== tb) return ta === "num" ? -1 : 1; // numbers sort before strings
    if (ta === "num") {
      const diff = (va as number) - (vb as number);
      if (diff !== 0) return diff < 0 ? -1 : 1;
    } else if (va !== vb) {
      return va < vb ? -1 : 1;
    }
  }
  if (chunksA.length !== chunksB.length) return chunksA.length < chunksB.length ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

function splitChunks(s: string): Array<["num" | "str", number | string]> {
  const chunks: Array<["num" | "str", number | string]> = [];
  let i = 0;
  while (i < s.length) {
    if (/[0-9]/.test(s[i])) {
      let j = i;
      while (j < s.length && /[0-9]/.test(s[j])) j++;
      chunks.push(["num", Number.parseInt(s.slice(i, j), 10)]);
      i = j;
    } else {
      let j = i;
      while (j < s.length && !/[0-9]/.test(s[j])) j++;
      chunks.push(["str", s.slice(i, j)]);
      i = j;
    }
  }
  return chunks;
}

/** Deterministically sorted node ids of a graph. */
export function sortedNodeIds(g: Graph): NodeId[] {
  return Object.keys(g.nodes).sort(compareIds);
}
