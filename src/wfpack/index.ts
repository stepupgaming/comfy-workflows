/**
 * Comfy workflow packages — distributable, inspectable workflow artifacts.
 *
 * A workflow package is an npm package whose canonical payload is Graph IR
 * (`workflow.ir.json`), described by a versioned `comfy.workflow.json`
 * manifest. The manifest and IR are pure data: consumers can inspect
 * identity, parameters, outputs, and node requirements WITHOUT executing
 * package JavaScript. Optional JS/TS exports are convenience wrappers only.
 */

export * from "./manifest.js";
export * from "./discover.js";
export * from "./derive.js";
