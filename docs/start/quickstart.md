# 5-minute quickstart

Two shortest paths. Pick one. Neither requires reading Graph IR first.

## Path A — you already have workflow JSON

```sh
pnpm add @stepupgaming/comfy-workflows
cwf init my-workflow --from workflow.json
cd my-workflow
cwf pack
cwf inspect . --url http://127.0.0.1:8188
```

`cwf init` writes `package.json`, `comfy.workflow.json`, `workflow.ir.json`, and an editable `workflow.ts`. Inspect reads the JSON as data. It does not execute package JS.

Full walkthrough: [Import workflow JSON](/migrate/import).

## Path B — you want TypeScript from scratch

You need a running Comfy at `http://127.0.0.1:8188` **or** a saved `object_info.json`.

```sh
pnpm add @stepupgaming/comfy-workflows
cwf snapshot --url http://127.0.0.1:8188 -o object_info.json
cwf lock --url http://127.0.0.1:8188
cwf codegen --from object_info.json -o src/nodes/gen
```

Then author with the bundled core nodes (enough for SD1.x T2I) or the generated registry:

<<< @/examples-src/code-first.ts

```sh
cwf compile workflow.ts -o dist/prompt.json
cwf validate workflow.ts --url http://127.0.0.1:8188
cwf run workflow.ts --url http://127.0.0.1:8188 --out out/
```

Full walkthrough: [Code-first quickstart](/code/quickstart).

Using a coding agent? After install, `cwf agent install` copies the SDK skill into `.agents/skills/comfy-workflows/`. [Coding agents](/guide/agents).

## What you just learned

To change the graph, change TypeScript (or re-import JSON). Do not edit compiled API JSON. Do not edit `workflow.ir.json` by hand in a first-party package.

[What do I edit?](/start/what-do-i-edit)
