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
export const WORKFLOW_MANIFEST_SPEC_VERSION = 1;

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

/** Dependency requirements. Informational in v1 except nodeClasses. */
export interface WorkflowManifestRequires {
  /**
   * Required Comfy node class names. Explicit in the manifest, or
   * deterministically derivable from the packaged IR — `pack` verifies
   * at least one of the two holds.
   */
  nodeClasses: string[];
  /** Node-pack names, when known. Informational in v1. */
  nodePacks: string[];
  /** Model/checkpoint requirements, when known. Informational in v1. */
  models: Array<{ kind: string; name: string; optional?: boolean }>;
}

export interface WorkflowManifest {
  specVersion: 1;
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
 */
export function parseWorkflowManifest(value: unknown): WorkflowManifest {
  if (!isRecord(value)) fail("manifest must be a JSON object");
  if (value["specVersion"] !== 1)
    fail(`unsupported specVersion (expected 1)`, { specVersion: value["specVersion"] });
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
  const nodePacks = req["nodePacks"] === undefined ? [] : req["nodePacks"];
  if (!Array.isArray(nodePacks)) fail(`"requires.nodePacks" must be an array`);
  const models = req["models"] === undefined ? [] : req["models"];
  if (!Array.isArray(models)) fail(`"requires.models" must be an array`);

  const manifest: WorkflowManifest = {
    specVersion: 1,
    name: value["name"] as string,
    title: value["title"] as string,
    entry: value["entry"] as string,
    parameters,
    outputs,
    requires: {
      nodeClasses,
      nodePacks: nodePacks as string[],
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
