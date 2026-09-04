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
cwf resolve-nodes <package-or-path> [--url URL] [--write] [--json]
cwf node-pack add <registry-id> --provides ClassA,ClassB [--dir pkg]
cwf setup <package-or-path> --comfy <Comfy-path> [--yes] [--dry-run] [--json]
cwf explain <file | workflow.ts>
cwf catalog [query] [--from catalog.json]
```

`--json` is supported on `init`, `suggest`, `pack`, `inspect`, `resolve-nodes`, `setup`, and `node-pack`.

`compile` / `validate` / `run` accept `workflow.ts`, `.ir.json`, and Comfy JSON. `--param` / `-p` is repeatable. `validate` never queues. `run` never installs Python.

## Agent-safe order

1. `cwf inspect --json`
2. `cwf setup --dry-run --json` if classes are missing
3. `cwf setup --yes` **only** with explicit user intent and a real `--comfy` path

Do not run `setup --yes` as a surprise on a developer laptop.

`cwf catalog` searches generated node catalogs. `cwf explain` shows recipe expansion. Neither guesses ownership.

Structured errors use `ComfyError.code` (`E_TYPE_MISMATCH`, `E_UNBOUND_PARAM`, `E_NODE_PACK_UNKNOWN`, …). Branch on the code, not on prose.

Deeper: `_links.md` (`cli`, `errors`).
