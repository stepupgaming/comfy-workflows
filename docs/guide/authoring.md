# Authoring workflows

TypeScript is the canonical authoring representation. This page covers the
builder API, the type model, escape hatches, and templates with parameters.

## The builder

`workflow(name)` returns a builder; `g.add(spec, params)` adds a typed node:

```ts
import { workflow, type Graph } from "comfy-sdk";
import { loaders, conditioning, latent, sampling } from "comfy-sdk/nodes";

export function build(): Graph {
  const g = workflow("mine");
  const ckpt = g.add(loaders.CheckpointLoaderSimple, {
    ckpt_name: "v1-5-pruned-emaonly.safetensors",
  });
  // ...
  return g.toGraph();
}
```

- Widget params (strings, numbers, bigints, booleans, enums) are checked
  against your defs snapshot; connection params accept outputs of the exact
  declared type — a `MODEL` output wired into a `CLIP` input is a compile
  error, not a runtime surprise.
- `g.output(handle)` marks graph outputs. Without an explicit output list,
  sensible defaults apply (e.g. the final image-producing node).

## Output handles

Generated specs expose every output as a named handle over the positional
slot — slot identity is `{nodeId, outputIndex}`:

```ts
ckpt.MODEL; // sugar for the first MODEL-typed output
ks.slots[0]; // positional access
ks.out(0); // positional access, method form
```

Unnamed, duplicated, and renamed outputs all work positionally, which is what
makes imports of arbitrary custom nodes lossless.

## Node identity and modes

```ts
const n = g.add(sampling.KSampler, { /* ... */ }, { id: "my-sampler", title: "Main pass" });
g.setMode(n.id, "bypassed"); // active | bypassed | muted
g.setBypassMap("my-sampler", { 0: "model" }); // explicit pass-through wiring
```

Bypass lowering is **conservative by design**: the compiler only rewires a
bypassed node when you provide an explicit `bypassMap`. Anything else fails
with `E_UNRESOLVED_BYPASS` rather than being guessed. Muted nodes with
consumers fail with `E_MUTED_CONSUMED`.

## Recipes

High-level operations expand into many nodes and compose over existing graphs
(they preserve template params, so composition stays lazy):

```ts
import { textToImage, hiresFix, withLora } from "comfy-sdk";

const tpl = textToImage({ checkpoint: "v1-5-pruned-emaonly.safetensors",
  positivePrompt: "a lighthouse at dusk", seed: 42n });
const styled = withLora(tpl, [{ name: "detail_tweaker.safetensors", strength: 0.8 }]);
const done = hiresFix(styled, { scaleBy: 1.5, denoise: 0.45 });
```

`explainGraph(g)` prints a human/agent-readable expansion — the observability
surface for "what did hiresFix actually create?". The full list lives in the
[recipe reference](/reference/recipes).

## Templates and parameters

`g.param(name, def)` declares a placeholder and returns a `ParamRef` usable in
any param slot. Graphs carrying placeholders are *templates*; bind them at
run time with `instantiateTemplate`:

```ts
import { workflow, instantiateTemplate } from "comfy-sdk";

const g = workflow("t2i-template");
const prompt = g.param("prompt", { type: "string" });
const seed = g.param("seed", { type: "int" });

const tpl = textToImage({
  checkpoint: "v1-5-pruned-emaonly.safetensors",
  positivePrompt: prompt,
  seed,
});

const graph = instantiateTemplate(tpl, { params: { prompt: "a lighthouse", seed: 42n } });
```

Unbound params/ports fail with `E_UNBOUND_PARAM` / `E_UNBOUND_PORT` instead of
silently defaulting, and recipe composition preserves placeholders — that is
why `hiresFix(withLora(tpl, …))` stays lazy until instantiation.

## Escape hatches

Two doors exist for everything the type system can't express — and no more:

- **`rawNode(classType, params, declaredOutputs?)`** — for node classes your
  defs snapshot can't describe. Raw params are validated structurally only.
  Imports of unknown custom nodes produce exactly these, with the original
  JSON preserved on `node.source`.
- **`unsafe(ref)`** — widens any output to any input. Use it deliberately;
  it is the only way to bypass type checking.

There is no third door: the compiler will not silently drop, retype, or guess
wiring.
