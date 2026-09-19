# CLI (`cwf` / `comfy-workflows`)

Same package as the SDK. Failures print JSON on **stderr** and exit non-zero. `--json` prints machine JSON on **stdout**.

## Commands

```
cwf import <workflow.json> [--out foo.ir.json] [--ts dir/workflow.ts] [--from defs.json]
cwf snapshot --url URL -o object_info.json
cwf lock --url URL [-o comfy.lock.json]
cwf codegen [--url URL | --from snapshot.json] -o src/nodes/gen [--exact-combos]
cwf compile <workflow.ts | graph.ir.json> [-o out.api.json] [--defs defs.json] [--pretty]
cwf validate <file> [--url URL] [--defs defs.json]
cwf run <file> --url URL [--param k=v ...] [--out outdir]
cwf init [name] --from <workflow.json> [--out dir] [--git] [--json]
cwf expose <param> --node <id> --input <name> [--required] [--description ...] [--default ...]
cwf suggest [dir] [--json]
cwf pack [dir] [--json] [--publish]
cwf inspect <package-or-path> [--url URL] [--json]
cwf explain <file | workflow.ts>
cwf catalog [query] [--from catalog.json]
cwf agent install [--project dir] [--force] [--json]
cwf agent check [--project dir] [--json]
```

`--json` is supported on `init`, `suggest`, `pack`, `inspect`, and `agent`.

`compile` / `validate` / `run` accept `workflow.ts`, `.ir.json`, and Comfy JSON. `--param` / `-p` is repeatable. `validate` never queues. `run` never installs Python.

## Missing custom nodes

1. `cwf inspect --json`
2. If classes are missing, show `comfy node install <registry-id>` from declared `requires.nodePacks`
3. Run `comfy node install` **only** with explicit user intent

This SDK never installs Python. `cwf setup` was removed (`E_REMOVED_COMMAND`).

`cwf catalog` searches generated node catalogs. `cwf explain` shows recipe expansion.

Structured errors use `ComfyError.code` (`E_TYPE_MISMATCH`, `E_UNBOUND_PARAM`, …). Branch on the code, not on prose.

Deeper: `_links.md` (`cli`, `errors`).
