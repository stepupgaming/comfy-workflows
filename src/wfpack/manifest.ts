import { ComfyError, ErrorCodes } from "../errors.js";

/**
 * `comfy.workflow.json` — the versioned workflow package manifest.
 *
 * This is the contract between workflow publishers and consumers. It is
 * deliberately small: identity, entry point, parameters, outputs, and
 * dependency requirements. Everything a consumer needs to decide "can I run
 * this?" without executing package code.
 */

export const WORKFLOW_MANIFEST_FILENAME = "comfy.workflow.json";
/** Current write version for newly generated rich-dependency manifests. */
export const WORKFLOW_MANIFEST_SPEC_VERSION = 2;
export const WORKFLOW_MANIFEST_SPEC_VERSION_V1 = 1;
export const WORKFLOW_MANIFEST_SPEC_VERSION_V2 = 2;

/** Pointer key in a workflow package's package.json. */
export const WORKFLOW_PACKAGE_JSON_KEY = "comfyWorkflow";

/** Keywords every workflow package should carry for discoverability. */
export const WORKFLOW_PACKAGE_KEYWORDS = ["comfy-workflow", "comfyui", "comfy-workflows"] as const;

/** A template parameter as declared in the manifest. */
export interface WorkflowManifestParam {
  /** Widget kind: mirrors TemplateParamDef types plus free-form fallback. */
  type: "int" | "float" | "string" | "boolean" | "combo" | string;
  required: boolean;
  default?: string | number | boolean | null;
  options?: Array<string | number>;
  description?: string;
}

/** A declared graph output. */
export interface WorkflowManifestOutput {
  /** Friendly name (matches the graph's output decl name when present). */
  name: string;
  /** Socket type, e.g. "IMAGE", "LATENT", "CONDITIONING". */
  type: string;
}

/**
 * A custom-node pack the workflow needs. Identity is the Comfy Registry
 * package id (`id`) whenever one exists. specVersion 1 may still list a
 * bare string; the parser normalizes those to `{ id, source: "manual" }`.
 *
 * `repository` is informational / fallback metadata — never an instruction
 * to clone an arbitrary URL.
 */
export interface WorkflowNodePack {
  /** Canonical Comfy Registry / Manager package id, e.g. "comfyui-videohelpersuite". */
  id: string;
  /** Human-readable name, e.g. "ComfyUI-VideoHelperSuite". */
  name?: string;
  /** Semver range (`^1.8.0`, `>=1.0.0`, exact `1.2.3`). Omit to accept any installed version. */
  version?: string;
  /** Informational source URL. Never treated as an automatic git clone. */
  repository?: string;
  /** Node class names this pack is expected to provide. */
  provides?: string[];
  /** When true, missing this pack does not block setup readiness. */
  optional?: boolean;
  /** Provenance of the id. Default `"registry"` when omitted. */
  source?: "registry" | "manual";
}

/** Dependency requirements. nodeClasses are the non-negotiable set. */
export interface WorkflowManifestRequires {
  /**
   * Required Comfy node class names. Explicit in the manifest, or
   * deterministically derivable from the packaged IR — `pack` verifies
   * at least one of the two holds.
   */
  nodeClasses: string[];
  /**
   * Installable custom-node packs. In-memory always objects.
   * Wire format: specVersion 1 = string ids; specVersion 2 = objects.
   */
  nodePacks: WorkflowNodePack[];
  /** Model/checkpoint requirements, when known. Informational — no downloader. */
  models: Array<{ kind: string; name: string; optional?: boolean }>;
}

export interface WorkflowManifest {
  specVersion: 1 | 2;
  /** Machine identity, e.g. "text-to-image". Unique within its npm package. */
  name: string;
  /** Human title, e.g. "Text to Image". */
  title: string;
  /** Relative path from the package root to the IR document. */
  entry: string;
  description?: string;
  parameters: Record<string, WorkflowManifestParam>;
  outputs: WorkflowManifestOutput[];
  requires: WorkflowManifestRequires;
  /** Minimum core package version (semver range) this package was built against. */
  coreVersion?: string;
  /** Compatibility metadata (min ComfyUI version, tested versions, notes). */
  compatibility?: {
    minComfyUIVersion?: string;
    notes?: string;
  };
}

const PARAM_TYPES = new Set(["int", "integer", "float", "string", "boolean", "combo"]);

function fail(message: string, details?: unknown): never {
  throw new ComfyError({
    code: ErrorCodes.InvalidGraph,
    message: `Invalid ${WORKFLOW_MANIFEST_FILENAME}: ${message}`,
    hint: "See the workflow-package spec for the manifest contract.",
    details,
  });
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Validate an unknown value as a WorkflowManifest. Throws ComfyError
 * (E_INVALID_GRAPH) with a precise message on the first problem found.
 * Pure data validation — never executes package code.
 *
 * specVersion 1: `nodePacks` is string[] (legacy). Objects are rejected.
 * specVersion 2: `nodePacks` is NodePackRequirement[] (rich objects).
 */
export function parseWorkflowManifest(value: unknown): WorkflowManifest {
  if (!isRecord(value)) fail("manifest must be a JSON object");
  const spec = value["specVersion"];
  if (spec !== 1 && spec !== 2)
    fail(`unsupported specVersion (expected 1 or 2)`, { specVersion: spec });
  if (typeof value["name"] !== "string" || value["name"].length === 0)
    fail(`"name" must be a non-empty string`);
  if (typeof value["title"] !== "string" || value["title"].length === 0)
    fail(`"title" must be a non-empty string`);
  if (typeof value["entry"] !== "string" || value["entry"].length === 0)
    fail(`"entry" must be a relative path to the IR document`);
  if (value["entry"].startsWith("/") || /^[A-Za-z]:[\\/]/.test(value["entry"]))
    fail(`"entry" must be a package-relative path, not absolute`);

  if (!isRecord(value["parameters"])) fail(`"parameters" must be an object`);
  const parameters: Record<string, WorkflowManifestParam> = {};
  for (const [name, p] of Object.entries(value["parameters"] as Record<string, unknown>)) {
    if (!isRecord(p)) fail(`parameter "${name}" must be an object`);
    const t = p["type"];
    // Accept both "int" and the colloquial "integer"; normalize to "int".
    const type = t === "integer" ? "int" : t;
    if (typeof type !== "string" || (!PARAM_TYPES.has(type) && type.length === 0))
      fail(`parameter "${name}" needs a type`);
    if (typeof p["required"] !== "boolean") fail(`parameter "${name}" needs "required": boolean`);
    const param: WorkflowManifestParam = {
      type: type as WorkflowManifestParam["type"],
      required: p["required"] as boolean,
    };
    if (p["default"] !== undefined) {
      const d = p["default"];
      if (d !== null && !["string", "number", "boolean"].includes(typeof d))
        fail(`parameter "${name}" default must be a JSON scalar`);
      param.default = d as WorkflowManifestParam["default"];
    }
    if (p["options"] !== undefined) {
      if (!Array.isArray(p["options"])) fail(`parameter "${name}" options must be an array`);
      param.options = p["options"] as Array<string | number>;
    }
    if (p["description"] !== undefined) {
      if (typeof p["description"] !== "string")
        fail(`parameter "${name}" description must be a string`);
      param.description = p["description"];
    }
    parameters[name] = param;
  }

  if (!Array.isArray(value["outputs"])) fail(`"outputs" must be an array`);
  const outputs: WorkflowManifestOutput[] = (value["outputs"] as unknown[]).map((o, i) => {
    if (!isRecord(o) || typeof o["name"] !== "string" || typeof o["type"] !== "string")
      fail(`outputs[${i}] needs { name: string, type: string }`);
    return { name: o["name"] as string, type: o["type"] as string };
  });

  if (!isRecord(value["requires"])) fail(`"requires" must be an object`);
  const req = value["requires"] as Record<string, unknown>;
  if (!Array.isArray(req["nodeClasses"])) fail(`"requires.nodeClasses" must be an array`);
  const nodeClasses = (req["nodeClasses"] as unknown[]).map((c, i) => {
    if (typeof c !== "string" || c.length === 0)
      fail(`requires.nodeClasses[${i}] must be a class name`);
    return c;
  });
  const nodePacksRaw = req["nodePacks"] === undefined ? [] : req["nodePacks"];
  if (!Array.isArray(nodePacksRaw)) fail(`"requires.nodePacks" must be an array`);
  const nodePacks = nodePacksRaw.map((p, i) => parseNodePack(p, i, spec));
  const models = req["models"] === undefined ? [] : req["models"];
  if (!Array.isArray(models)) fail(`"requires.models" must be an array`);

  const manifest: WorkflowManifest = {
    specVersion: spec,
    name: value["name"] as string,
    title: value["title"] as string,
    entry: value["entry"] as string,
    parameters,
    outputs,
    requires: {
      nodeClasses,
      nodePacks,
      models: models as WorkflowManifest["requires"]["models"],
    },
  };
  if (typeof value["description"] === "string") manifest.description = value["description"];
  if (typeof value["coreVersion"] === "string") manifest.coreVersion = value["coreVersion"];
  if (isRecord(value["compatibility"])) {
    const c = value["compatibility"] as Record<string, unknown>;
    manifest.compatibility = {
      ...(typeof c["minComfyUIVersion"] === "string"
        ? { minComfyUIVersion: c["minComfyUIVersion"] }
        : {}),
      ...(typeof c["notes"] === "string" ? { notes: c["notes"] } : {}),
    };
  }
  return manifest;
}

const PACK_ID = /^[A-Za-z][A-Za-z0-9._-]{0,99}$/;
const VERSION_RANGE =
  /^(?:\*|[><]=?\d+\.\d+\.\d+|\^\d+\.\d+\.\d+|\d+\.\d+\.\d+)(?:\s+(?:[><]=?\d+\.\d+\.\d+|\^\d+\.\d+\.\d+|\d+\.\d+\.\d+))*$/;

/**
 * Accept a legacy string (`"comfyui-videohelpersuite"`) or a registry-id
 * object. Strings become `{ id, source: "manual" }`.
 *
 * specVersion 1 rejects objects. specVersion 2 rejects strings.
 */
export function parseNodePack(
  value: unknown,
  index?: number,
  specVersion: 1 | 2 = 2,
): WorkflowNodePack {
  const where = index === undefined ? "nodePack" : `requires.nodePacks[${index}]`;
  if (typeof value === "string") {
    if (specVersion === 2)
      fail(`${where} must be an object in specVersion 2 (got a string id)`);
    if (value.length === 0) fail(`${where} must be a non-empty string`);
    if (!PACK_ID.test(value))
      fail(`${where} id "${value}" is not a valid Comfy Registry package id`);
    return { id: value, source: "manual" };
  }
  if (!isRecord(value)) fail(`${where} must be a string or object`);
  if (specVersion === 1)
    fail(`${where} must be a string registry id in specVersion 1 (got an object)`);
  const id = value["id"];
  if (typeof id !== "string" || id.length === 0) fail(`${where} needs a non-empty "id"`);
  if (!PACK_ID.test(id)) fail(`${where} id "${id}" is not a valid Comfy Registry package id`);
  if (/[\\/]/.test(id) || id.includes("..")) fail(`${where} id cannot contain path separators`);
  const pack: WorkflowNodePack = { id };
  if (value["name"] !== undefined) {
    if (typeof value["name"] !== "string") fail(`${where}.name must be a string`);
    pack.name = value["name"];
  }
  if (value["version"] !== undefined) {
    if (typeof value["version"] !== "string" || value["version"].length === 0)
      fail(`${where}.version must be a semver range string`);
    if (!VERSION_RANGE.test(value["version"].trim()))
      fail(`${where}.version "${value["version"]}" is not a supported semver range`);
    pack.version = value["version"].trim();
  }
  if (value["repository"] !== undefined) {
    if (typeof value["repository"] !== "string") fail(`${where}.repository must be a string`);
    pack.repository = value["repository"];
  }
  if (value["provides"] !== undefined) {
    if (!Array.isArray(value["provides"]))
      fail(`${where}.provides must be an array of class names`);
    pack.provides = value["provides"].map((c, i) => {
      if (typeof c !== "string" || c.length === 0)
        fail(`${where}.provides[${i}] must be a class name`);
      return c;
    });
  }
  if (value["optional"] !== undefined) {
    if (typeof value["optional"] !== "boolean") fail(`${where}.optional must be a boolean`);
    pack.optional = value["optional"];
  }
  if (value["source"] !== undefined) {
    if (value["source"] !== "registry" && value["source"] !== "manual")
      fail(`${where}.source must be "registry" or "manual"`);
    pack.source = value["source"];
  } else {
    // v2 rich object with source omitted → registry claim (still not install proof).
    pack.source = "registry";
  }
  const forbidden = ["install", "script", "command", "shell", "pip", "git"];
  for (const k of forbidden) {
    if (k in value)
      fail(`${where} must not declare "${k}" — manifests are declarative, not install scripts`);
  }
  return pack;
}

/** Serialize a pack list for writing back to comfy.workflow.json. */
export function serializeNodePacks(
  packs: WorkflowNodePack[],
  specVersion: 1 | 2 = 2,
): unknown[] {
  if (specVersion === 1) return packs.map((p) => p.id);
  return packs.map((p) => {
    const o: Record<string, unknown> = { id: p.id };
    if (p.name !== undefined) o.name = p.name;
    if (p.version !== undefined) o.version = p.version;
    if (p.repository !== undefined) o.repository = p.repository;
    if (p.provides !== undefined && p.provides.length > 0) o.provides = p.provides;
    if (p.optional === true) o.optional = true;
    o.source = p.source ?? "registry";
    return o;
  });
}

/** Promote a v1 (string ids) manifest to v2 so rich packs can be written. */
export function promoteManifestToV2(manifest: WorkflowManifest): WorkflowManifest {
  if (manifest.specVersion === 2) return manifest;
  return { ...manifest, specVersion: 2 };
}
