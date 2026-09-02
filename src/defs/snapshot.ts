import { promises as fs } from "node:fs";
import { ComfyError, ErrorCodes } from "../errors.js";
import { hashObjectInfo, parseObjectInfo, type RawObjectInfo } from "./parse.js";
import type { NodeDefs } from "./types.js";

/**
 * Defs snapshots: a captured /object_info payload committed alongside the code
 * that was generated from it. Snapshots make codegen, validation, and import
 * reproducible without a live Comfy instance; the live-query path uses the
 * same parser.
 */

export interface DefsSnapshot {
  defs: NodeDefs;
  objectInfoHash: string;
  source?: string;
  capturedAt?: string;
}

const WRAPPED = "comfy-object-info-snapshot";

/** Load a snapshot file. Accepts both the wrapped snapshot format and a bare /object_info map. */
export async function loadDefsSnapshot(path: string): Promise<DefsSnapshot> {
  const text = await fs.readFile(path, "utf8");
  const json: unknown = JSON.parse(text);
  if (json !== null && typeof json === "object" && !Array.isArray(json)) {
    const obj = json as Record<string, unknown>;
    if (obj["format"] === WRAPPED && obj["object_info"] !== undefined) {
      return {
        defs: parseObjectInfo(obj["object_info"] as RawObjectInfo),
        objectInfoHash:
          typeof obj["objectInfoHash"] === "string"
            ? obj["objectInfoHash"]
            : hashObjectInfo(obj["object_info"]),
        source: typeof obj["source"] === "string" ? obj["source"] : undefined,
        capturedAt: typeof obj["capturedAt"] === "string" ? obj["capturedAt"] : undefined,
      };
    }
    // Bare /object_info map.
    return { defs: parseObjectInfo(obj as RawObjectInfo), objectInfoHash: hashObjectInfo(obj) };
  }
  throw new ComfyError({
    code: ErrorCodes.InvalidGraph,
    message: `Defs snapshot at ${path} is not an object`,
    hint: "Expected a /object_info JSON map or a comfy-object-info-snapshot wrapper.",
  });
}

export async function saveDefsSnapshot(
  path: string,
  objectInfo: RawObjectInfo,
  meta: { source?: string; capturedAt?: string } = {},
): Promise<string> {
  const wrapped = {
    format: WRAPPED,
    version: 1,
    capturedAt: meta.capturedAt ?? new Date().toISOString(),
    source: meta.source,
    objectInfoHash: hashObjectInfo(objectInfo),
    object_info: objectInfo,
  };
  await fs.writeFile(path, JSON.stringify(wrapped, null, 2) + "\n", "utf8");
  return wrapped.objectInfoHash;
}
