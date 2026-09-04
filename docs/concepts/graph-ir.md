# Graph IR

Most people should author TypeScript, not IR JSON. This page is for tool authors, other-language integrations, debugging, storage, and diffs.

IR version: `irVersion: 1`.

## Document shape

```ts
interface Graph {
  irVersion: 1;
  name?: string;
  nodes: Record<NodeId, NodeInstance>;
  outputs: GraphOutputDecl[];
  params?: Record<string, TemplateParamDef>;  // template
  ports?: TemplatePort[];                     // template
}
```

## Node

```ts
interface NodeInstance {
  type: string;                          // Comfy class_type
  params: Record<string, ParamValue>;
  inputs: Record<string, SlotRef | SlotRef[]>;
  mode?: "active" | "bypassed" | "muted";
  title?: string;
  raw?: true;
  outputTypes?: string[];
  outputNames?: string[];
  bypassMap?: Record<number, string>;    // output index → input name
  source?: { format: string; raw: unknown };
}
```

Ids are strings. Imported graphs keep original ids. Fresh builders use `n1`, `n2`, … unless you pass `{ id }`.

## SlotRef

```ts
{ node: NodeId, out: number }
```

Index is identity. Names are metadata.

## ParamRef

```ts
{ $param: "seed" }
```

On disk the same tagged object. In memory, `paramRef("seed")`.

## Tagged lossless integers

```json
{ "seed": { "$int": "18446744073709551615" } }
```

`$int` is a reserved tag. Do not use it as a literal key. [Lossless integers](/concepts/lossless-integers).

## Serialization

- `serializeGraph` / `parseGraph` — IR JSON, `JSON.parse`-safe
- `serializeIrJson` / `parseIrJson` — tagged values
- `serializeComfyJson` — raw bigint literals for `/prompt`

## Canonical ordering / hash

`graphHash(g)` SHA-256s the key-sorted tagged IR. Node id comparison is numeric-aware (`n2` < `n10`). Compiled emit sorts ids and writes inputs in def order.

## Source metadata

`node.source` holds importer leftovers. The compiler never interprets it. Unknown custom nodes keep their original JSON there.

API: [IR API](/reference/api/ir)
