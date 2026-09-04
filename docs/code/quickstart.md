# Code-first quickstart

This tutorial starts from **no** workflow JSON. The graph lives in TypeScript. You should finish it thinking: to change the workflow, I change TypeScript.

You need Node.js ≥ 22 and a ComfyUI instance at `http://127.0.0.1:8188`. If Comfy is down, snapshot a fixture `object_info.json` instead and skip `run`.

## 1. Install

```sh
pnpm add @stepupgaming/comfy-workflows
```

## 2. Snapshot the live node universe

```sh
cwf snapshot --url http://127.0.0.1:8188 -o object_info.json
cwf lock --url http://127.0.0.1:8188
cwf codegen --from object_info.json -o src/nodes/gen
```

`snapshot` writes `/object_info`. `lock` records Comfy version + that hash in `comfy.lock.json`. `codegen` writes typed wrappers, `registry.ts`, `defs.json`, `catalog.json`, and `NODES.md`, all stamped with `objectInfoHash`.

Do not hand-edit the generated directory. When you install or update node packs, recapture and regenerate.

For this tutorial the **bundled** `@stepupgaming/comfy-workflows/nodes` registry is enough (core SD1.x classes). After codegen, switch the import to `./src/nodes/gen/registry.ts` so custom nodes type-check too.

## 3. Author the graph

Save this as `workflow.ts`. The checked-in copy is [`docs/examples-src/code-first.ts`](https://github.com/stepupgaming/comfy-workflows/blob/main/docs/examples-src/code-first.ts).

<<< @/examples-src/code-first.ts{4-48}

What you are looking at:

- `g.add(spec, params)` is the typed builder.
- `.MODEL`, `.CLIP`, `.LATENT`, `.IMAGE` are handles over `{nodeId, outputIndex}`.
- `seed: 42n` is a bigint. It will not round through JS number.
- `g.output(...)` names the graph output the runtime should fetch.
- `toGraph()` is Graph IR in memory.

## 4. Compile, validate, run

```sh
cwf compile workflow.ts -o dist/prompt.json
cwf validate workflow.ts --url http://127.0.0.1:8188
cwf run workflow.ts --url http://127.0.0.1:8188 --out out/
```

- `compile` writes deterministic API JSON. That file is an artifact. Do not edit it.
- `validate` never queues work.
- `run` submits, streams progress, downloads artifacts into `out/<runId>/`, writes `run.json`.

## What you edit next time

Change `workflow.ts` (or `ir.build.ts` in a package). Rebuild. Do not patch `workflow.ir.json` or the prompt JSON.

[What do I edit?](/start/what-do-i-edit) · [Parameters](/code/parameters) · [Generated node SDKs](/code/codegen)
