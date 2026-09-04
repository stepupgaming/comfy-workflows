# Build a graph

`workflow(name)` returns a `GraphBuilder`. `g.add(spec, params)` adds a typed node. `g.toGraph()` is Graph IR.

<<< @/examples-src/code-first.ts{8-47}

## Creating a graph

```ts
import { workflow } from "@stepupgaming/comfy-workflows";
const g = workflow("mine");
```

`name` is metadata. It shows up in `explainGraph` / `cwf explain`.

## Adding typed nodes

`params` is checked against the spec:

- Widget inputs: `string`, `number`, `bigint`, `boolean`, combo strings
- Connection inputs: an output handle of the declared socket type
- Everything: a `ParamRef` from `g.param(...)`

A `MODEL` wired into a `CLIP` input is a type error.

You can import category namespaces or named specs:

```ts
import { loaders, sampling } from "@stepupgaming/comfy-workflows/nodes";
import { KSampler } from "@stepupgaming/comfy-workflows/nodes";
```

## Widget vs connection

The builder splits `params` for you. If the value is a node output handle, it becomes `inputs[name] = { node, out }`. Otherwise it becomes `params[name]`.

## Node ids and titles

```ts
const ks = g.add(sampling.KSampler, { /* ... */ }, { id: "sampler" });
g.setTitle(ks.id, "Main pass");
```

Imported graphs pass `{ id }` so Comfy errors map back to the original ids. Fresh graphs get `n1`, `n2`, … unless you set an id.

## Graph outputs

```ts
g.output(decoded.IMAGE, { name: "image" });
```

Without an explicit list, some recipes declare a sensible default (for example the decoded image). Runtime artifact fetch follows `graph.outputs`.

## Modes

```ts
g.setMode(ks.id, "bypassed"); // active | bypassed | muted
g.setBypassMap(ks.id, { 0: "model" });
```

Bypass lowering is conservative. No map → `E_UNRESOLVED_BYPASS`. Muted node with a consumer → `E_MUTED_CONSUMED`. [Bypass](/concepts/bypass).

## Serialization

```ts
import { parseGraph, serializeGraph } from "@stepupgaming/comfy-workflows";
const text = serializeGraph(g.toGraph(), { pretty: true });
const again = parseGraph(text);
```

Next: [Connections](/code/connections) · [Parameters](/code/parameters)
