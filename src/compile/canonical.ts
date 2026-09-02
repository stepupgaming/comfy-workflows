import { serializeComfyJson, type ComfyApiObject } from "../json.js";

/**
 * Canonical form of a Comfy API object: keys deep-sorted, compact, lossless.
 * Two API JSON documents that represent the same graph produce identical
 * canonical strings — this is what round-trip equality compares (raw byte
 * equality is too strict: key order is not semantic).
 */
export function canonicalComfyJson(obj: ComfyApiObject | unknown): string {
  return serializeComfyJson(sortDeep(obj));
}

function sortDeep(value: unknown): unknown {
  if (typeof value === "bigint" || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortDeep);
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(value as Record<string, unknown>).sort()) {
    out[k] = sortDeep((value as Record<string, unknown>)[k]);
  }
  return out;
}
