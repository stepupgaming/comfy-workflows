# Composition

Work at the highest level that still says what you mean.

```
package  →  recipe / helper  →  typed nodes  →  raw IR
```

Drop down when the level above cannot express the graph.

## Author-defined helpers

A function that returns or mutates a `Graph` is enough most of the time:

```ts
function withReference(g: GraphBuilder, image: NodeOutput<"IMAGE">) {
  // add LoadImage / reference nodes, return handles
}
```

Keep helpers topology-shaped. Do not hide runtime parameters inside `if (opts.quality === "high") addNode(...)` unless that really is a different graph. Prefer a second package or a second `ir.build.ts`.

## When to make a recipe

Recipes in this repo (`textToImage`, `hiresFix`, `withLora`, …) are graphs-in / graphs-out and **preserve ParamRef**. Composition stays lazy until `instantiateTemplate`.

If your helper needs to be that composable, follow the same rule: do not eagerly bind placeholders.

## When to make another package

A second graph with its own parameters, node classes, and release cycle. Face-refine vs base generation is two packages, not an `if` in one builder.

## Observability

```ts
import { explainGraph } from "@stepupgaming/comfy-workflows/recipes";
console.log(explainGraph(graph));
```

```sh
cwf explain workflow.ts
```

That is how you answer "what did `hiresFix` actually create?"

[Recipes](/code/recipes) · [Example](/examples/composition)
