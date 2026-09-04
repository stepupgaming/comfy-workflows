# CLI

The `cwf` CLI (`comfy-workflows` is an alias) mirrors the SDK. JSON on stdout when useful; **every error is JSON on stderr**.

## Agent-safe usage

Prefer read-only JSON before anything that installs Python:

```sh
cwf inspect --json
cwf setup --dry-run --json
cwf suggest --json
cwf pack --json
cwf resolve-nodes --json
```

`--json` is supported on `init`, `suggest`, `pack`, `inspect`, `resolve-nodes`, `setup`, and `node-pack`. Success JSON goes to **stdout**. Failures are `{ "error": { "code": "E_…", … } }` on **stderr** and a non-zero exit.

Do not run `cwf setup --yes` unless the user named a Comfy directory and asked to install. `inspect`, `explain`, and `catalog` do not guess and do not execute package JavaScript. `run` never installs Python. Compile is deterministic.

This help text is generated from `src/cli/cli.ts` (`pnpm docs:gen`). If a command is missing here, `docs:check` fails.

<!--@include: ./_generated/cli-help.md-->

## Notes the one-line help compresses

### `cwf import`

```
cwf import <workflow.json> [--out foo.ir.json] [--ts dir/workflow.ts] [--from defs.json]
```

Editor v0.4, workflow v1, or API format. `--registry <dir>` routes classes to a generated registry; missing specs become `rawNode(...)`.

### `cwf snapshot` / `cwf lock` / `cwf codegen`

```
cwf snapshot --url URL -o object_info.json
cwf lock --url URL [-o comfy.lock.json]
cwf codegen [--url URL | --from snapshot.json] -o src/nodes/gen [--exact-combos]
```

### `cwf compile` / `cwf validate` / `cwf run`

Accept `workflow.ts`, `.ir.json`, and Comfy JSON. `--lock` / `comfy.lock.json` → `E_LOCK_DRIFT` warning. `--param k=v` repeatable (`-p`).

`validate` never queues. `run` never installs Python.

### `cwf init` / `expose` / `suggest` / `pack` / `inspect`

See [Convert a workflow](/migrate/import).

### `cwf resolve-nodes` / `node-pack` / `setup`

See [Custom nodes](/guide/custom-nodes).

### `cwf explain` / `cwf catalog`

```
cwf explain <file | workflow.ts>
cwf catalog [query] [--from catalog.json]
```

## Shared flags

Short aliases: `-o` out, `-u` url, `-d` defs, `-p` param, `-t` ts, `-f` from.

Defs order: `--defs` → live `--url` → bundled core (`E_LIVE_DEFS_UNAVAILABLE` if live fetch failed).
