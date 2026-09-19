# CLI

The `cwf` CLI (`comfy-workflows` is an alias) mirrors the SDK. JSON on stdout when useful; **every error is JSON on stderr**.

## Agent-safe usage

Prefer read-only JSON. This CLI never installs Python.

```sh
cwf inspect --json
cwf suggest --json
cwf pack --json
```

If inspect reports missing classes, print `comfy node install <registry-id>` from declared `requires.nodePacks`. Run that command only with explicit user intent.

### `cwf agent`

```
cwf agent install [--project dir] [--force] [--json]
cwf agent check [--project dir] [--json]
```

Copies the bundled skill from the **installed** package into `<project>/.agents/skills/comfy-workflows/`. No network. No symlinks. `--force` is required if the destination has local edits. `check` reports `missing` / `current` / `outdated` / `modified`. Default project is the current working directory.

`--json` is supported on `init`, `suggest`, `pack`, `inspect`, and `agent`. Success JSON goes to **stdout**. Failures are `{ "error": { "code": "E_…", … } }` on **stderr** and a non-zero exit.

`inspect`, `explain`, and `catalog` do not guess and do not execute package JavaScript. `run` never installs Python. Compile is deterministic.

`cwf setup`, `cwf resolve-nodes`, and `cwf node-pack` were removed (`E_REMOVED_COMMAND`).

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

See [Convert a workflow](/migrate/import). Inspect vs live `/object_info`: [Custom nodes](/guide/custom-nodes).

### `cwf explain` / `cwf catalog`

```
cwf explain <file | workflow.ts>
cwf catalog [query] [--from catalog.json]
```

## Shared flags

Short aliases: `-o` out, `-u` url, `-d` defs, `-p` param, `-t` ts, `-f` from.

Defs order: `--defs` → live `--url` → bundled core (`E_LIVE_DEFS_UNAVAILABLE` if live fetch failed).
