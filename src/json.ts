/**
 * Lossless JSON handling — the bedrock of the SDK's determinism guarantees.
 *
 * Two distinct serializations exist because the two formats have different needs:
 *
 * 1. IR JSON (canonical, persisted, diffed, `JSON.parse`-able by anyone):
 *    Integers that JS cannot represent exactly — every `bigint` value — are
 *    written as tagged scalars: `{"$int": "18446744073709551615"}`. An ordinary
 *    `JSON.parse` of an IR file can therefore never silently corrupt a value;
 *    the tag survives even in tooling that mangles big numbers, and
 *    `parseIrJson()` restores them to `bigint` exactly.
 *
 * 2. Comfy API JSON (build artifact sent to `/prompt`): emitted by
 *    `serializeComfyJson()`, which writes `bigint` values as raw numeric
 *    literals (`18446744073709551615`) — exactly what ComfyUI's Python side
 *    parses natively. Bigints never pass through `JSON.stringify` or JS number
 *    coercion anywhere in the SDK; the runtime POSTs this string directly.
 */

export type JsonScalar = string | number | boolean | null;

/** Shape produced by `serializeIrJson` — plain JSON, safe under JSON.parse. */
export type TaggedJson =
  | JsonScalar
  | TaggedJson[]
  | { $int: string }
  | { $asset: string; kind?: string; name?: string }
  | { $param: string }
  | { $input: string }
  | { [key: string]: TaggedJson };

export type IrValue = JsonScalar | bigint | IrValue[] | { [key: string]: IrValue };

const INT_TAG = "$int";

function isIntTagObject(value: unknown): value is { $int: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  if (Object.keys(value).length !== 1) return false;
  const tag = (value as Record<string, unknown>)[INT_TAG];
  return typeof tag === "string" && /^-?\d+$/.test(tag);
}

/**
 * Serialize an in-memory IR value (which may contain `bigint`) to the tagged
 * IR JSON form. Deterministic: object keys are emitted in insertion order;
 * callers that need a canonical form should pre-sort keys (see
 * `ir/hash.ts`).
 */
export function serializeIrJson(value: IrValue, indent?: number | string): string {
  return writeIrInto(value, indent, 0);
}

function pad(indent: number | string, depth: number): string {
  if (indent === undefined) return "";
  return (
    "\n" +
    (typeof indent === "number" ? " ".repeat(indent * (depth + 1)) : indent.repeat(depth + 1))
  );
}

function padClose(indent: number | string, depth: number): string {
  if (indent === undefined) return "";
  return "\n" + (typeof indent === "number" ? " ".repeat(indent * depth) : indent.repeat(depth));
}

function writeIrInto(value: IrValue, indent: number | string | undefined, depth: number): string {
  if (typeof value === "bigint") {
    return `{"${INT_TAG}":"${value.toString()}"}`;
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    assertFiniteNumber(value);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const items = value.map((v) => writeIrInto(v, indent, depth + 1));
    if (indent === undefined) return `[${items.join(",")}]`;
    return `[${pad(indent, depth)}${items.join("," + pad(indent, depth))}${padClose(indent, depth)}]`;
  }
  const obj = value as Record<string, IrValue>;
  const entries = Object.keys(obj)
    .filter((k) => obj[k] !== undefined) // JSON semantics: undefined properties don't exist
    .map((k) => `${JSON.stringify(k)}:${writeIrInto(obj[k], indent, depth + 1)}`);
  if (entries.length === 0) return "{}";
  if (indent === undefined) return `{${entries.join(",")}}`;
  return `{${pad(indent, depth)}${entries.join("," + pad(indent, depth))}${padClose(indent, depth)}}`;
}

/**
 * Parse tagged IR JSON back into in-memory values: `{"$int": "..."}` becomes
 * `bigint`. Plain JSON numbers stay numbers (they are exactly representable
 * by construction — anything bigger was tagged on write).
 */
export function parseIrJson(text: string): IrValue {
  const raw: unknown = JSON.parse(text);
  return reviveIr(raw) as IrValue;
}

function reviveIr(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reviveIr);
  if (value !== null && typeof value === "object") {
    if (isIntTagObject(value)) return BigInt((value as { $int: string }).$int);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = reviveIr(v);
    return out;
  }
  return value;
}

/** A compiled ComfyUI API-format prompt object. Node ids are the SDK's IR ids. */
export type ComfyApiObject = Record<
  string,
  { class_type: string; inputs: Record<string, unknown>; _meta: { title: string } }
>;

/**
 * Serialize a compiled Comfy API object to its wire form. `bigint` values are
 * emitted as raw numeric literals — this is the ONLY place big numbers become
 * untagged, and the result is exactly what ComfyUI's Python JSON parser reads.
 * The runtime POSTs this string as the request body verbatim; the string never
 * round-trips through JS numbers.
 */
export function serializeComfyJson(value: unknown, indent?: number | string): string {
  return writeComfy(value, indent, 0);
}

function writeComfy(value: unknown, indent: number | string | undefined, depth: number): string {
  if (typeof value === "bigint") {
    // ComfyUI parses JSON with Python's json module: arbitrary-precision ints.
    return value.toString();
  }
  if (value === undefined) {
    throw new Error("Cannot serialize undefined to Comfy JSON");
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    assertFiniteNumber(value);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const items = value.map((v) => writeComfy(v, indent, depth + 1));
    if (indent === undefined) return `[${items.join(",")}]`;
    return `[${pad(indent, depth)}${items.join("," + pad(indent, depth))}${padClose(indent, depth)}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.length === 0) return "{}";
  const entries = keys.map((k) => `${JSON.stringify(k)}:${writeComfy(obj[k], indent, depth + 1)}`);
  if (indent === undefined) return `{${entries.join(",")}}`;
  return `{${pad(indent, depth)}${entries.join("," + pad(indent, depth))}${padClose(indent, depth)}}`;
}

function assertFiniteNumber(n: number): void {
  if (!Number.isFinite(n)) {
    throw new Error(`Cannot serialize non-finite number ${String(n)} to JSON`);
  }
}
