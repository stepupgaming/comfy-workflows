import { sha256Hex } from "../ir/hash.js";
import { serializeComfyJson } from "../json.js";
import { lowerBypass } from "./bypass.js";
import { emitApiObject, emitApiJson } from "./emit.js";
import { validateGraph } from "./validate.js";
import type { ComfyApiObject } from "../json.js";
import type { ComfyError } from "../errors.js";
import type { Graph } from "../ir/index.js";
import type { NodeDefs } from "../defs/index.js";

export interface CompileSuccess {
  ok: true;
  /** Compiled API-format object (bigint values retained). */
  object: ComfyApiObject;
  /** Wire form: raw bigint literals, deterministic. POST this to /prompt. */
  json: string;
  /** SHA-256 of `json` — reproducibility fingerprint. */
  hash: string;
  /** Non-fatal findings (file-backed combo values, etc.). */
  warnings: ComfyError[];
}

export interface CompileFailure {
  ok: false;
  errors: ComfyError[];
  warnings: ComfyError[];
}

export type CompileResult = CompileSuccess | CompileFailure;

export interface CompileOptions {
  /** Pretty-print the JSON artifact (2-space). The wire form is always compact. */
  pretty?: boolean;
}

/**
 * Compile a Graph IR to ComfyUI API-format JSON.
 *
 * Pipeline: conservative bypass lowering → validation → deterministic emit.
 * Pure function: same graph + defs ⇒ byte-identical output.
 *
 * The result is a build artifact. Never hand-edit it; edit the IR or the
 * workflow.ts that produced it and recompile.
 */
export function compile(g: Graph, defs?: NodeDefs, opts: CompileOptions = {}): CompileResult {
  const lowered = lowerBypass(g, defs);
  const validation = validateGraph(lowered.graph, defs);
  if (!validation.ok || lowered.errors.length > 0) {
    return {
      ok: false,
      errors: [...lowered.errors, ...validation.errors],
      warnings: validation.warnings,
    };
  }
  const object = emitApiObject(lowered.graph, defs);
  const json = serializeComfyJson(object, opts.pretty ? 2 : undefined);
  return { ok: true, object, json, hash: sha256Hex(json), warnings: validation.warnings };
}

export { lowerBypass } from "./bypass.js";
export { emitApiObject, emitApiJson } from "./emit.js";
export { validateGraph } from "./validate.js";
export { canonicalComfyJson } from "./canonical.js";
