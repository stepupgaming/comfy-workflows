import { serializeComfyJson } from "../json.js";
import { sha256Hex } from "../ir/hash.js";
import type { DefInput, DefInputKind, NodeDef, NodeDefs } from "./types.js";

/**
 * Raw `/object_info` shapes. Deliberately loose: ComfyUI's schema is permissive
 * by design (custom nodes vary), so the parser normalizes defensively and
 * never trusts a field to exist.
 */

type RawInputSpec = unknown; // [typeOrOptions, optionsObj?] in various shapes
type RawNodeEntry = {
  input?: {
    required?: Record<string, RawInputSpec>;
    optional?: Record<string, RawInputSpec>;
    hidden?: Record<string, RawInputSpec>;
  };
  input_order?: { required?: string[]; optional?: string[] };
  output?: unknown;
  output_name?: unknown;
  name?: string;
  category?: string;
  output_node?: boolean;
  deprecated?: boolean;
  experimental?: boolean;
  description?: string;
  python_module?: string;
};

export type RawObjectInfo = Record<string, RawNodeEntry>;

const WIDGET_TYPES = new Set(["INT", "FLOAT", "STRING", "BOOLEAN"]);

/** Types that are sockets even if they never appear as a node output. */
const BASE_SOCKET_TYPES = new Set([
  "MODEL",
  "CLIP",
  "VAE",
  "IMAGE",
  "MASK",
  "LATENT",
  "CONDITIONING",
  "CONTROL_NET",
  "UPSCALE_MODEL",
  "NOISE",
  "SAMPLER",
  "SIGMAS",
  "GUIDER",
  "CLIP_VISION",
  "CLIP_VISION_OUTPUT",
  "STYLE_MODEL",
  "INSIGHTFACE",
  "BBOX_DETECTOR",
  "SEGM_DETECTOR",
  "SAM_MODEL",
  "FACE_ANALYSIS_MODEL",
  "AUDIO",
  "VIDEO",
  "LATENT_KEYFRAME",
  "CONTROL_NET_WEIGHTS",
  "TIMESTEP_KEYFRAME",
]);

/**
 * Build the registry of socket type names from all nodes' outputs — the same
 * heuristic the ComfyUI frontend uses to tell `["MODEL"]`-style socket specs
 * apart from single-option combos.
 */
function collectSocketTypes(raw: RawObjectInfo): Set<string> {
  const types = new Set(BASE_SOCKET_TYPES);
  for (const entry of Object.values(raw)) {
    if (!Array.isArray(entry.output)) continue;
    for (const t of entry.output) if (typeof t === "string") types.add(t);
  }
  return types;
}

function parseInputSpec(
  name: string,
  spec: RawInputSpec,
  required: boolean,
  socketTypes: Set<string>,
): DefInput | null {
  // Special form: ["IMAGE_UPLOAD", true] and friends — frontend upload
  // affordances, not real inputs. Filter them out entirely.
  if (!Array.isArray(spec) || spec.length === 0) return null;
  const first = spec[0];

  // Nested form: [[...]] — either a combo's option list or a socket type
  // wrapped one level deep. Disambiguated via the socket type registry.
  if (Array.isArray(first)) {
    const strings = first.filter((o) => typeof o === "string");
    if (first.length === 1 && typeof first[0] === "string" && socketTypes.has(first[0])) {
      return {
        name,
        kind: "connection",
        type: first[0] as string,
        required,
        ...pickCommon(spec[1] ?? {}),
      };
    }
    const options = first.filter(
      (o): o is string | number => typeof o === "string" || typeof o === "number",
    );
    const opts = spec[1] ?? {};
    return {
      name,
      kind: "combo",
      type: "COMBO",
      required,
      options,
      ...pickCommon(opts as Record<string, unknown>),
    };
  }

  if (typeof first !== "string") return null;

  const opts = (
    spec.length > 1 && spec[1] !== null && typeof spec[1] === "object" ? spec[1] : {}
  ) as Record<string, unknown>;

  // Newer COMBO form: ["COMBO", { options: [...] }]
  if (first === "COMBO") {
    const options = Array.isArray(opts["options"])
      ? (opts["options"] as unknown[]).filter(
          (o): o is string | number => typeof o === "string" || typeof o === "number",
        )
      : [];
    return { name, kind: "combo", type: "COMBO", required, options, ...pickCommon(opts) };
  }

  // Flat forms: ["MODEL"] → socket; ["euler", "karras"] → legacy combo.
  if (!WIDGET_TYPES.has(first)) {
    if (spec.length === 1 && socketTypes.has(first)) {
      return { name, kind: "connection", type: first, required, ...pickCommon(opts) };
    }
    if (spec.slice(1).every((s) => typeof s === "string" || typeof s === "number")) {
      return {
        name,
        kind: "combo",
        type: "COMBO",
        required,
        options: spec.filter(
          (s): s is string | number => typeof s === "string" || typeof s === "number",
        ),
      };
    }
  }

  if (first.endsWith("_UPLOAD")) return null; // frontend affordance, not an input

  if (WIDGET_TYPES.has(first)) {
    const kind: DefInputKind =
      first === "INT"
        ? "int"
        : first === "FLOAT"
          ? "float"
          : first === "STRING"
            ? "string"
            : "boolean";
    const input: DefInput = { name, kind, type: first, required, ...pickCommon(opts) };
    if (
      typeof opts["default"] === "string" ||
      typeof opts["default"] === "number" ||
      typeof opts["default"] === "boolean"
    ) {
      input.default = opts["default"];
    }
    return input;
  }

  // Anything else is a socket-typed connection input.
  return { name, kind: "connection", type: first, required, ...pickCommon(opts) };
}

function pickCommon(opts: Record<string, unknown>): Partial<DefInput> {
  const out: Partial<DefInput> = {};
  if (typeof opts["min"] === "number") out["min"] = opts["min"];
  if (typeof opts["max"] === "number") out["max"] = opts["max"];
  if (typeof opts["step"] === "number") out["step"] = opts["step"];
  if (typeof opts["round"] === "number") out["round"] = opts["round"];
  if (opts["multiline"] === true) out["multiline"] = true;
  if (opts["dynamicPrompts"] === true) out["dynamicPrompts"] = true;
  if (typeof opts["placeholder"] === "string") out["placeholder"] = opts["placeholder"];
  if (opts["forceInput"] === true) out["forceInput"] = true;
  if (opts["control_after_generate"] === true) out["controlAfterGenerate"] = true;
  if (typeof opts["tooltip"] === "string") out["tooltip"] = opts["tooltip"];
  if (typeof opts["label"] === "string") out["label"] = opts["label"];
  return out;
}

function orderedInputNames(
  section: Record<string, RawInputSpec> | undefined,
  order: string[] | undefined,
): string[] {
  if (!section) return [];
  const keys = Object.keys(section);
  if (!order || order.length === 0) return keys;
  const known = order.filter((n) => n in section);
  const rest = keys.filter((k) => !order.includes(k));
  return [...known, ...rest];
}

/** Parse a raw /object_info response (or snapshot) into normalized defs. */
export function parseObjectInfo(raw: RawObjectInfo): NodeDefs {
  const socketTypes = collectSocketTypes(raw);
  const defs: NodeDefs = {};
  for (const classType of Object.keys(raw)) {
    const entry = raw[classType];
    const inputs: DefInput[] = [];
    const requiredNames = orderedInputNames(entry.input?.required, entry.input_order?.required);
    for (const name of requiredNames) {
      const parsed = parseInputSpec(name, entry.input?.required?.[name], true, socketTypes);
      if (parsed) inputs.push(parsed);
    }
    const optionalNames = orderedInputNames(entry.input?.optional, entry.input_order?.optional);
    for (const name of optionalNames) {
      const parsed = parseInputSpec(name, entry.input?.optional?.[name], false, socketTypes);
      if (parsed) inputs.push(parsed);
    }

    const outputTypes = Array.isArray(entry.output)
      ? entry.output.filter((o): o is string => typeof o === "string")
      : [];
    const outputNames = Array.isArray(entry.output_name)
      ? entry.output_name.filter((o): o is string => typeof o === "string")
      : [];

    defs[classType] = {
      classType,
      displayName: typeof entry.name === "string" ? entry.name : classType,
      category: typeof entry.category === "string" ? entry.category : "",
      inputs,
      outputs: outputTypes.map((type, index) => ({
        index,
        type,
        ...(outputNames[index] !== undefined && outputNames[index] !== type
          ? { name: outputNames[index] }
          : {}),
      })),
      outputNode: entry.output_node === true,
      ...(entry.deprecated ? { deprecated: true } : {}),
      ...(entry.experimental ? { experimental: true } : {}),
      ...(typeof entry.description === "string" ? { description: entry.description } : {}),
      ...(typeof entry.python_module === "string" ? { pythonModule: entry.python_module } : {}),
    };
  }
  return defs;
}

/** Canonical hash of an /object_info payload — the environment fingerprint used by comfy.lock.json. */
export function hashObjectInfo(raw: unknown): string {
  return sha256Hex(serializeComfyJson(sortDeep(raw as Record<string, unknown>)));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = sortDeep((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}
