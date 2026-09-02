import { ComfyError, ErrorCodes } from "../errors.js";
import type { Graph } from "../ir/index.js";
import type { NodeDefs } from "../defs/index.js";
import { importApiJson } from "./apiFormat.js";
import { importWorkflowJson, type EditorImportResult } from "./editorFormat.js";

export { importApiJson, importWorkflowJson };
export type { EditorImportResult };

export type ComfyFormat = "api" | "editor";

/** Detect which Comfy JSON shape a document has. */
export function detectComfyFormat(json: unknown): ComfyFormat {
  if (json !== null && typeof json === "object" && !Array.isArray(json)) {
    if (Array.isArray((json as { nodes?: unknown }).nodes)) return "editor";
    const values = Object.values(json);
    if (
      values.length > 0 &&
      values.every(
        (v) =>
          v !== null &&
          typeof v === "object" &&
          !Array.isArray(v) &&
          typeof (v as { class_type?: unknown }).class_type === "string",
      )
    ) {
      return "api";
    }
  }
  throw new ComfyError({
    code: ErrorCodes.InvalidGraph,
    message: "Unrecognized Comfy JSON format (expected editor workflow or API/prompt format)",
    hint: "Editor format has a 'nodes' array; API format maps node ids to {class_type, inputs}.",
  });
}

/** Import any Comfy JSON (editor or API format) into Graph IR. */
export function importComfyJson(json: unknown, defs?: NodeDefs): EditorImportResult {
  const format = detectComfyFormat(json);
  if (format === "api") {
    return { graph: importApiJson(json, defs), diagnostics: [] };
  }
  return importWorkflowJson(json, defs);
}

/** Convenience: import from a Graph, normalizing the return shape. */
export function importToGraph(json: unknown, defs?: NodeDefs): Graph {
  return importComfyJson(json, defs).graph;
}
