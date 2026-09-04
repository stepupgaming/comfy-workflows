# Parameters and templates

A **literal** is compiled into the graph. A **ParamRef** is a hole filled later.

```ts
seed: 42n              // literal
seed: paramRef("seed") // or g.param("seed", { type: "int" })
```

Topology stays put. Values arrive at instantiate / `cwf run --param`.

<<< @/examples-src/template.ts

## `g.param`

```ts
const seed = g.param("seed", {
  type: "int",          // int | float | string | boolean | combo
  default: 42n,
  description: "Sampling seed",
  // options: [...]    // combo
});
```

Duplicate names throw. The returned `ParamRef` is `{ $param: "seed" }` and can sit in any widget slot.

`paramRef("seed")` builds the same placeholder without declaring metadata. Recipes use it; declare the param on the builder (or let the recipe declare it) so instantiate knows the type/default.

## Binding

```ts
import { instantiateTemplate } from "@stepupgaming/comfy-workflows";

const graph = instantiateTemplate(tpl, {
  params: { prompt: "a lighthouse", seed: 42n },
  // inputs: { image: someSlotRef },
});
```

Unbound param with no default → `E_UNBOUND_PARAM`. Unbound port → `E_UNBOUND_PORT`. Instantiation renumbers nodes `n1..nN` in topological order so the same template + bindings compile identically.

CLI:

```sh
cwf run workflow.ts --url http://127.0.0.1:8188 --param prompt=hello --param seed=42
```

`--param` is repeatable (`-p`).

## Integer / bigint

Use `bigint` (`42n`) for seeds. `number` is accepted but cannot hold values above 2^53 exactly. [Lossless integers](/concepts/lossless-integers).

## Files and paths

Local files that must be uploaded are `AssetRef`, not string paths in a published default. Machine-local paths fail `cwf pack` (`E_PACK_LOCAL_PATH`). Checkpoint **names** on the server are portable parameters. Absolute `C:\Users\...` paths are not. [Assets](/guide/assets).

## Discovery

Package manifests list parameters. `cwf inspect` prints required vs optional. `cwf suggest` proposes expose candidates without mutating.

## Topology vs parameter

If changing a value changes **which nodes exist**, it is topology. Put it in TypeScript.

If it only changes a node input, it is a runtime parameter.

That rule keeps a Python/Rust binder stupid in a good way: replace `{$param}`, do not grow graphs. [No second compiler](/concepts/no-second-compiler).
