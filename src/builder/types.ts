import type { NodeId, ParamRef, TemplateParamDef } from "../ir/index.js";
import { AssetRef } from "../ir/types.js";

/**
 * Typed node specs.
 *
 * A NodeSpec is the type-level encoding of a node definition: input kinds,
 * connection types, combo options, defaults. Codegen emits specs using the
 * `conn`/`int`/`float`/`string`/`bool`/`combo` helpers, whose generic
 * signatures preserve literal types (`conn("MODEL")` produces a spec input
 * whose `type` is the literal "MODEL") — that is what makes
 * `g.add(KSampler, { model })` type-check connections exactly.
 */

export interface NodeOutput<T extends string = string> {
  /** Phantom brand: the socket type of the output slot. Covariant. */
  readonly __outType: T;
  readonly node: NodeId;
  readonly out: number;
}

export function isNodeOutput(value: unknown): value is NodeOutput<string> {
  return (
    typeof value === "object" &&
    value !== null &&
    "__outType" in value &&
    "node" in value &&
    "out" in value &&
    typeof (value as { node: unknown })["node"] === "string" &&
    typeof (value as { out: unknown })["out"] === "number"
  );
}

/** Widen any output to fit any input. Escape hatch for cursed custom nodes. */
export function unsafe<T extends string = never>(o: NodeOutput<string>): NodeOutput<T> {
  return { __outType: o.__outType as T, node: o.node, out: o.out };
}

/** Build an untyped output ref by hand. Escape hatch; prefer handles. */
export function unsafeRef<T extends string = never>(node: NodeId, out: number): NodeOutput<T> {
  return { __outType: "" as T, node, out };
}

/* ------------------------------------------------------------------ */
/* Spec input shapes                                                   */
/* ------------------------------------------------------------------ */

export interface ConnectionInput<T extends string = string, R extends boolean = true> {
  readonly kind: "connection";
  readonly type: T;
  readonly required: R;
  readonly forceInput?: true;
  readonly tooltip?: string;
}

export interface ComboInput<
  O extends readonly (string | number)[] = readonly string[],
  R extends boolean = true,
> {
  readonly kind: "combo";
  readonly options: O;
  readonly required: R;
  readonly default?: string | number;
  readonly tooltip?: string;
}

export interface IntInput<R extends boolean = true> {
  readonly kind: "int";
  readonly required: R;
  readonly default?: number;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly controlAfterGenerate?: true;
  readonly forceInput?: true;
  readonly tooltip?: string;
}

export interface FloatInput<R extends boolean = true> {
  readonly kind: "float";
  readonly required: R;
  readonly default?: number;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly round?: number;
  readonly forceInput?: true;
  readonly tooltip?: string;
}

export interface StringInput<R extends boolean = true> {
  readonly kind: "string";
  readonly required: R;
  readonly default?: string;
  readonly multiline?: true;
  readonly dynamicPrompts?: true;
  readonly placeholder?: string;
  readonly forceInput?: true;
  readonly tooltip?: string;
}

export interface BooleanInput<R extends boolean = true> {
  readonly kind: "boolean";
  readonly required: R;
  readonly default?: boolean;
  readonly forceInput?: true;
  readonly tooltip?: string;
}

export type SpecInput =
  | ConnectionInput<string, boolean>
  | ComboInput<readonly (string | number)[], boolean>
  | IntInput<boolean>
  | FloatInput<boolean>
  | StringInput<boolean>
  | BooleanInput<boolean>;

/* ------------------------------------------------------------------ */
/* Spec input helper factories (used by codegen and hand-written specs) */
/* ------------------------------------------------------------------ */

/**
 * Helpers use OVERLOADS instead of generic inference for the `required` flag:
 * inferring a literal from an optional property is unreliable under contextual
 * typing, while overload resolution is deterministic:
 *   conn("MODEL")                 → ConnectionInput<"MODEL", true>
 *   conn("IMAGE", {required:false}) → ConnectionInput<"IMAGE", false>
 */

interface CommonOpts {
  forceInput?: boolean;
  tooltip?: string;
}

export function conn<T extends string>(
  type: T,
  opts: CommonOpts & { required: false },
): ConnectionInput<T, false>;
export function conn<T extends string>(type: T, opts?: CommonOpts): ConnectionInput<T, true>;
export function conn<T extends string>(
  type: T,
  opts: CommonOpts & { required?: boolean } = {},
): ConnectionInput<T, boolean> {
  return {
    kind: "connection",
    type,
    required: opts.required ?? true,
    ...(opts.forceInput ? { forceInput: true as const } : {}),
    ...(opts.tooltip ? { tooltip: opts.tooltip } : {}),
  } as ConnectionInput<T, boolean>;
}

export interface ComboOpts {
  default?: string | number;
  required?: false | true;
  tooltip?: string;
}

export function combo<O extends readonly (string | number)[]>(
  options: O,
  opts: ComboOpts & { required: false },
): ComboInput<O, false>;
export function combo<O extends readonly (string | number)[]>(
  options: O,
  opts?: ComboOpts,
): ComboInput<O, true>;
export function combo<O extends readonly (string | number)[]>(
  options: O,
  opts: ComboOpts = {},
): ComboInput<O, boolean> {
  return {
    kind: "combo",
    options,
    required: opts.required ?? true,
    ...(opts.default !== undefined ? { default: opts.default } : {}),
    ...(opts.tooltip ? { tooltip: opts.tooltip } : {}),
  } as ComboInput<O, boolean>;
}

export interface IntOpts {
  default?: number;
  min?: number;
  max?: number;
  step?: number;
  controlAfterGenerate?: boolean;
  forceInput?: boolean;
  required?: false | true;
  tooltip?: string;
}

export function int(opts: IntOpts & { required: false }): IntInput<false>;
export function int(opts?: IntOpts): IntInput<true>;
export function int(opts: IntOpts = {}): IntInput<boolean> {
  return {
    kind: "int",
    required: opts.required ?? true,
    ...(opts.default !== undefined ? { default: opts.default } : {}),
    ...(opts.min !== undefined ? { min: opts.min } : {}),
    ...(opts.max !== undefined ? { max: opts.max } : {}),
    ...(opts.step !== undefined ? { step: opts.step } : {}),
    ...(opts.controlAfterGenerate ? { controlAfterGenerate: true as const } : {}),
    ...(opts.forceInput ? { forceInput: true as const } : {}),
    ...(opts.tooltip ? { tooltip: opts.tooltip } : {}),
  } as IntInput<boolean>;
}

export interface FloatOpts {
  default?: number;
  min?: number;
  max?: number;
  step?: number;
  round?: number;
  forceInput?: boolean;
  required?: false | true;
  tooltip?: string;
}

export function float(opts: FloatOpts & { required: false }): FloatInput<false>;
export function float(opts?: FloatOpts): FloatInput<true>;
export function float(opts: FloatOpts = {}): FloatInput<boolean> {
  return {
    kind: "float",
    required: opts.required ?? true,
    ...(opts.default !== undefined ? { default: opts.default } : {}),
    ...(opts.min !== undefined ? { min: opts.min } : {}),
    ...(opts.max !== undefined ? { max: opts.max } : {}),
    ...(opts.step !== undefined ? { step: opts.step } : {}),
    ...(opts.round !== undefined ? { round: opts.round } : {}),
    ...(opts.forceInput ? { forceInput: true as const } : {}),
    ...(opts.tooltip ? { tooltip: opts.tooltip } : {}),
  } as FloatInput<boolean>;
}

export interface StrOpts {
  default?: string;
  multiline?: boolean;
  dynamicPrompts?: boolean;
  placeholder?: string;
  forceInput?: boolean;
  required?: false | true;
  tooltip?: string;
}

export function str(opts: StrOpts & { required: false }): StringInput<false>;
export function str(opts?: StrOpts): StringInput<true>;
export function str(opts: StrOpts = {}): StringInput<boolean> {
  return {
    kind: "string",
    required: opts.required ?? true,
    ...(opts.default !== undefined ? { default: opts.default } : {}),
    ...(opts.multiline ? { multiline: true as const } : {}),
    ...(opts.dynamicPrompts ? { dynamicPrompts: true as const } : {}),
    ...(opts.placeholder ? { placeholder: opts.placeholder } : {}),
    ...(opts.forceInput ? { forceInput: true as const } : {}),
    ...(opts.tooltip ? { tooltip: opts.tooltip } : {}),
  } as StringInput<boolean>;
}

export interface BoolOpts {
  default?: boolean;
  forceInput?: boolean;
  required?: false | true;
  tooltip?: string;
}

export function bool(opts: BoolOpts & { required: false }): BooleanInput<false>;
export function bool(opts?: BoolOpts): BooleanInput<true>;
export function bool(opts: BoolOpts = {}): BooleanInput<boolean> {
  return {
    kind: "boolean",
    required: opts.required ?? true,
    ...(opts.default !== undefined ? { default: opts.default } : {}),
    ...(opts.forceInput ? { forceInput: true as const } : {}),
    ...(opts.tooltip ? { tooltip: opts.tooltip } : {}),
  } as BooleanInput<boolean>;
}

/* ------------------------------------------------------------------ */
/* NodeSpec                                                            */
/* ------------------------------------------------------------------ */

export interface OutputEntry {
  /** Display name (metadata; identity is the index). */
  name?: string;
  type: string;
}

export interface NodeSpec<I extends Record<string, SpecInput> = Record<string, SpecInput>> {
  classType: string;
  inputs: I;
  outputs: ReadonlyArray<OutputEntry>;
  category?: string;
  outputNode?: boolean;
  description?: string;
  deprecated?: boolean;
  experimental?: boolean;
}

/**
 * Define a node spec. `I` and `O` have direct inference sites in the
 * parameter type (not just the constraint) so the helper functions' literal
 * types — connection types, `required` flags, output tuples — survive into the
 * inferred spec type. That is what gives handles typed `.MODEL` / `.slots[0]`
 * accessors.
 */
export function defineNode<
  I extends Record<string, SpecInput>,
  O extends ReadonlyArray<OutputEntry>,
>(
  classType: string,
  spec: { inputs: I; outputs: O } & Omit<NodeSpec, "classType" | "inputs" | "outputs">,
): { classType: string; inputs: I; outputs: O } & Omit<
  NodeSpec,
  "classType" | "inputs" | "outputs"
> {
  return { classType, ...spec };
}

/* ------------------------------------------------------------------ */
/* Param / handle type mapping                                         */
/* ------------------------------------------------------------------ */

/**
 * The value type accepted for a spec input:
 * - connection inputs take a typed NodeOutput
 * - widgets take literals (int also takes bigint — the lossless form)
 * - combo/string also accept AssetRef (staged by the runtime)
 * - everything accepts a template ParamRef placeholder
 */
export type ParamTypeOf<I extends SpecInput> =
  I extends ConnectionInput<infer T, infer _R>
    ? NodeOutput<T> | NodeOutput<T>[] | ParamRef
    : I extends ComboInput<infer O, infer _R2>
      ? O[number] | AssetRef | ParamRef | NodeOutput<never>
      : I extends IntInput<infer _R3>
        ? number | bigint | ParamRef
        : I extends FloatInput<infer _R4>
          ? number | ParamRef
          : I extends StringInput<infer _R5>
            ? string | AssetRef | ParamRef | NodeOutput<never>
            : I extends BooleanInput<infer _R6>
              ? boolean | ParamRef
              : never;

type RequiredInputKeys<S extends NodeSpec> = {
  [K in keyof S["inputs"]]: S["inputs"][K] extends { required: true } ? K : never;
}[keyof S["inputs"]];

type OptionalInputKeys<S extends NodeSpec> = {
  [K in keyof S["inputs"]]: S["inputs"][K] extends { required: true } ? never : K;
}[keyof S["inputs"]];

export type NodeParamsOf<S extends NodeSpec> = {
  [K in RequiredInputKeys<S>]: ParamTypeOf<S["inputs"][K]>;
} & {
  [K in OptionalInputKeys<S>]?: ParamTypeOf<S["inputs"][K]>;
};

/* ------------------------------------------------------------------ */
/* Handle types                                                        */
/* ------------------------------------------------------------------ */

type OutputEntries<S extends NodeSpec> = S["outputs"];

/** Positional outputs — the canonical access form (identity is the index). */
export type OutsTuple<S extends NodeSpec> = {
  [K in keyof OutputEntries<S>]: OutputEntries<S>[K] extends { type: infer T }
    ? NodeOutput<T & string>
    : never;
};

/** Named outputs — generated sugar over the index identity. */
export type NamedOuts<S extends NodeSpec> = {
  [K in Extract<OutputEntries<S>[number]["name"], string>]: NodeOutput<
    Extract<OutputEntries<S>[number], { name: K }>["type"] & string
  >;
};

export interface HandleBase {
  readonly id: NodeId;
  /** Positional output access (untyped brand) — for loops and raw handles. */
  out(i: number): NodeOutput;
}

export type NodeHandle<S extends NodeSpec> = NamedOuts<S> &
  HandleBase & {
    /** Positional outputs, fully typed by tuple position. */
    readonly slots: OutsTuple<S>;
  };

/** Handle for raw nodes: positional + by-name, no static guarantees. */
export interface RawHandle extends HandleBase {
  /** Raw outputs carry a `never` brand: assignable to any typed input. */
  readonly slots: ReadonlyArray<NodeOutput<never>>;
  byName(name: string): NodeOutput | undefined;
}

/** Template parameter definition (re-exported shape from IR). */
export type ParamDef = Omit<TemplateParamDef, "name">;
