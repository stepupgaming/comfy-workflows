# Parameters, integers, topology

```ts
seed: 42n              // literal, compiled into the graph
seed: paramRef("seed") // hole filled at instantiate / cwf run --param
```

```ts
const seed = g.param("seed", {
  type: "int", // int | float | string | boolean | combo
  default: 42n,
  description: "Sampling seed",
});
```

`paramRef("seed")` is the same placeholder without declaring metadata. Declare the param on the builder (or let a recipe declare it).

```ts
import { instantiateTemplate } from "@stepupgaming/comfy-workflows";
const graph = instantiateTemplate(tpl, { params: { prompt: "a lighthouse", seed: 42n } });
```

Unbound param → `E_UNBOUND_PARAM`. Unbound port → `E_UNBOUND_PORT`.

## Topology vs parameter

| Change | Where |
| ------ | ----- |
| Which nodes/connections exist | TypeScript builder |
| Value of an existing widget | ParamRef / `--param` |

## Seeds and integers > 2^53

JavaScript `number` cannot hold Comfy 64-bit seeds exactly.

```
bigint  →  IR {"$int":"18446744073709551615"}  →  raw numeric literal on /prompt
```

Use `42n` in TypeScript. Do not `JSON.parse` compiled prompt JSON if you need the seed intact. `run.json.compiledJson` is stored as a **string** for that reason.

`cwf run --param seed=42` parses as integer. Huge seeds must not pass through JS `Number`.

Local filesystem paths are `AssetRef`, not string defaults in a published package (`E_PACK_LOCAL_PATH`). Checkpoint **names** on the server are portable.

Deeper: `_links.md` (`parameters`, `lossless-integers`).
