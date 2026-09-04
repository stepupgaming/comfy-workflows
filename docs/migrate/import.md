# Import workflow JSON

You already have a working Comfy graph. You do not need to learn Graph IR first.

This path turns editor JSON, workflow v1 JSON, or API/prompt JSON into a package you can inspect, parameterize, and run.

The fixture used in examples is [`fixtures/workflows/t2i.api.json`](https://github.com/stepupgaming/comfy-workflows/blob/main/fixtures/workflows/t2i.api.json). Any of the three source forms works the same way.

## 1. Install

```sh
pnpm add @stepupgaming/comfy-workflows
```

## 2. Create the package

```sh
cwf init my-workflow --from workflow.json
cd my-workflow
```

`cwf init` imports with the same importer as `cwf import`, then writes:

```
my-workflow/
  package.json
  comfy.workflow.json
  workflow.ir.json
  workflow.ts
  README.md
  .gitignore
```

`workflow.ir.json` is the canonical payload. `workflow.ts` is an editable convenience. Inspecting or running the package never executes that TypeScript.

Scoped names work:

```sh
cwf init @alice/portrait --from workflow.json
```

Comfy Workflows will not put you in `@stepupgaming` unless you type that scope.

`--url` optionally discovers Comfy Registry node-pack metadata. It never installs Python. `--git` runs `git init` in the new directory. `--json` prints the same report for scripts.

## 3. Or import without packaging

```sh
cwf import existing-workflow.json --out foo.ir.json --ts workflows/foo/workflow.ts
```

Use this when you want Graph IR plus TypeScript and you are not making an npm package yet.

Pass `--from defs.json` (or snapshot defs from a live instance) so positional `widgets_values` decode correctly. Unknown custom nodes still import as `rawNode(...)` with the original JSON on `node.source`.

## What survives import

- Node ids, titles, and modes (`active` / `muted` / `bypassed`)
- Integers larger than 2^53 (`{"$int":"..."}` on disk, `bigint` in memory)
- Unknown custom nodes (as raw nodes, not a hard failure)
- Source metadata the importer did not fully understand

Frontend `Reroute` chains are traced. `PrimitiveNode` values are inlined into the widgets they feed.

Full fidelity notes: [Import round-trip](/migrate/round-trip).

## Next

1. [Understand generated files](/migrate/generated-files)
2. [Expose parameters](/migrate/parameterize)
3. [Custom nodes](/migrate/custom-nodes)
4. [Package and publish](/migrate/package)
