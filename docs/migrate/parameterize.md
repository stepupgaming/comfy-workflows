# Parameterize it

A packaged workflow is useful when callers can change prompts, seeds, and sizes without forking the graph.

## Suggestions first (read-only)

```sh
cwf suggest .
cwf suggest . --json
```

Heuristics look for checkpoint, prompts, seed, width/height, steps, cfg, denoise, and paths. Nothing is mutated.

## Expose a widget

```sh
cwf expose checkpoint --node 4 --input ckpt_name --required --description "Checkpoint on the Comfy server"
cwf expose prompt --node 6 --input text --required
cwf expose seed --node 3 --input seed
```

`expose` updates IR, manifest, and `workflow.ts` together after validation. Machine-local paths never become portable defaults. An absolute path that stays baked in fails `cwf pack` with `E_PACK_LOCAL_PATH` and a suggested expose command.

## Literal vs ParamRef

A literal is compiled into the graph:

```ts
seed: 42n
```

A parameter is bound later:

```ts
seed: paramRef("seed")
```

Topology stays stable. Values arrive at run time:

```sh
cwf run . --url http://127.0.0.1:8188 --param seed=42 --param prompt="a lighthouse"
```

If changing a value would add or remove nodes, that is topology. Put it in TypeScript. If it only fills a widget, it is a parameter. That distinction is the whole [templates](/concepts/templates) page.

## Required vs default

A manifest-required parameter must have no default in the IR. Optional parameters should declare a default so `instantiateTemplate` / `cwf run` can proceed without every flag.
