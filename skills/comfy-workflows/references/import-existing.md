# Import existing workflow JSON

Editor v0.4, workflow v1, and API/prompt JSON all import.

```sh
pnpm add @stepupgaming/comfy-workflows
cwf init my-workflow --from workflow.json
cd my-workflow
```

Writes `package.json`, `comfy.workflow.json`, `workflow.ir.json`, optional `workflow.ts`.

- `workflow.ir.json` is the stored payload for an imported package.
- `workflow.ts` is editable convenience. Inspect/run never execute it.
- `--url` may discover verified Registry metadata. It never installs Python.
- `--json` prints the same report for scripts.

Without packaging:

```sh
cwf import existing-workflow.json --out foo.ir.json --ts workflows/foo/workflow.ts
```

## After import

1. `cwf inspect . --json`
2. `cwf suggest . --json` then `cwf expose` for runtime params
3. If this becomes first-party, move ongoing edits into TypeScript (`ir.build.ts`) and treat IR as generated from then on

Do not "clean up" imported IR by hand. Ids, titles, modes, and integers past 2^53 are supposed to survive.

Unknown classes in the JSON become `rawNode(...)` in emitted TS, with original JSON on `node.source`. Snapshot + codegen if those classes exist on the target Comfy.

Deeper: `_links.md` (`import`).
