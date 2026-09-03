/**
 * comfy-workflows — code-first, typed, composable workflows for ComfyUI.
 *
 * Graph IR is the canonical semantic representation; TypeScript workflow files
 * are the canonical authoring representation; Comfy API JSON is a build
 * artifact; ComfyUI is the execution backend.
 */

// Graph IR (canonical representation + operations)
export * from "./ir/index.js";

// Lossless JSON (tagged IR form + raw-literal Comfy form)
export {
  parseIrJson,
  serializeComfyJson,
  serializeIrJson,
  type ComfyApiObject,
  type IrValue,
  type TaggedJson,
} from "./json.js";

// Authoring layer
export * from "./builder/index.js";

// Compilation (IR → Comfy API JSON)
export * from "./compile/index.js";

// Node definitions
export * from "./defs/index.js";

// Runtime (client, assets, run orchestration)
export * from "./runtime/index.js";

// Errors
export {
  ComfyError,
  ErrorCodes,
  isComfyError,
  type ComfyErrorFields,
  type ErrorCode,
} from "./errors.js";

// Workflow packages (manifest, discovery, coherence checks)
export * from "./wfpack/index.js";

// Recipes (composable workflow builders + transforms)
export * as recipes from "./recipes/index.js";
