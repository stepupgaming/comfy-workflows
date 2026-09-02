import { createHash } from "node:crypto";
import { serializeIrJson, type IrValue } from "../json.js";
import type { Graph } from "./types.js";

/** Recursively sort object keys so equal structures hash identically. */
function deepSort(value: IrValue): IrValue {
  if (Array.isArray(value)) return value.map(deepSort);
  if (value !== null && typeof value === "object") {
    const out: Record<string, IrValue> = {};
    for (const k of Object.keys(value).sort())
      out[k] = deepSort((value as Record<string, IrValue>)[k]);
    return out;
  }
  return value;
}

/** Canonical (compact, key-sorted) IR string. Two equal graphs produce equal strings. */
export function canonicalIrString(g: Record<string, IrValue>): string {
  return serializeIrJson(deepSort(g));
}

/** SHA-256 of the canonical IR form — content address for graphs and templates. */
export function graphHash(g: Graph): string {
  return sha256Hex(canonicalIrString(g as unknown as Record<string, IrValue>));
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
