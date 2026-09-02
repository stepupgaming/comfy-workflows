/**
 * Normalized node definitions, parsed from ComfyUI's `/object_info` endpoint.
 *
 * `/object_info` is the machine-readable contract of a Comfy instance: every
 * node class, its input kinds (combos, widgets, socket types), ranges,
 * defaults, and outputs. The SDK treats it as the source of truth for
 * codegen, validation, and import decoding.
 */

export type DefInputKind = "combo" | "int" | "float" | "string" | "boolean" | "connection";

export interface DefInput {
  name: string;
  kind: DefInputKind;
  /**
   * Declared type name: "INT"/"FLOAT"/"STRING"/"BOOLEAN" for widgets,
   * "COMBO" for combos, or the socket type (e.g. "MODEL", "IMAGE") for
   * connection inputs.
   */
  type: string;
  required: boolean;
  /** Combo options, when kind === "combo". */
  options?: (string | number)[];
  default?: string | number | boolean;
  min?: number;
  max?: number;
  step?: number;
  round?: number;
  multiline?: boolean;
  dynamicPrompts?: boolean;
  placeholder?: string;
  /** Widget is force-converted to a socket by the frontend. */
  forceInput?: boolean;
  /** Seed-style integer with a frontend control_after_generate companion. */
  controlAfterGenerate?: boolean;
  tooltip?: string;
  label?: string;
}

export interface DefOutput {
  index: number;
  /** Socket type name, e.g. "LATENT". */
  type: string;
  /** Display name if it differs from the type (metadata only). */
  name?: string;
}

export interface NodeDef {
  classType: string;
  displayName: string;
  category: string;
  /** Ordered: required inputs first, then optional (honoring input_order). */
  inputs: DefInput[];
  outputs: DefOutput[];
  /** Node produces graph outputs (SaveImage, PreviewImage, VHS video, …). */
  outputNode: boolean;
  deprecated?: boolean;
  experimental?: boolean;
  description?: string;
  pythonModule?: string;
}

export type NodeDefs = Record<string, NodeDef>;

/** Input kinds that carry a literal value (widget) rather than a connection. */
export function isWidgetKind(kind: DefInputKind): boolean {
  return kind !== "connection";
}

/** Socket-typed input that must be satisfied by a connection. */
export function isConnectionInput(input: DefInput): boolean {
  return input.kind === "connection" && !input.forceInput;
}
