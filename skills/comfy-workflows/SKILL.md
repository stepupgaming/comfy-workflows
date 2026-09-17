---
name: comfy-workflows
description: >
  Use when creating, editing, compiling, packaging, importing, or running
  ComfyUI graphs as TypeScript through @stepupgaming/comfy-workflows:
  ir.build.ts / workflow.ts, Graph IR, ParamRef, recipes, cwf compile /
  validate / run / pack, and non-Node product binders. Trigger on workflow.json
  conversion, "edit the graph", topology vs runtime params, or "do we need Node
  in production?" Custom nodes, codegen, and cwf setup: skill comfy-custom-nodes.
---

# Comfy Workflows

Code-first TypeScript SDK and `cwf` CLI for ComfyUI. Unofficial. Not affiliated with Comfy Org.

This skill ships **inside the installed package**:

```
node_modules/@stepupgaming/comfy-workflows/skills/comfy-workflows/SKILL.md
```

You do not need to clone the repository to use it.

If you are reading this from `node_modules` rather than a project skill, run `cwf agent install` so compatible agents can discover it at `.agents/skills/comfy-workflows/`. That copies this versioned bundle. It does not fetch the network.

Versioned deep-doc links for **this package version** are in `references/_links.md`. Prefer those over the live docs site so you do not follow newer APIs than the installed SDK.

## Choose the task

| User intent | Read |
| ----------- | ---- |
| Existing `workflow.json` / API JSON | `references/import-existing.md` |
| Create or edit a code-authored graph | `references/code-first.md` |
| Custom nodes, missing classes, codegen, `cwf setup` | skill `comfy-custom-nodes` |
| Rust / Python / Go / C# product | `references/product-integration.md` |
| Package / publish | `references/packages.md` |
| CLI / `--json` | `references/cli.md` |
| Seeds, ParamRef, runtime values | `references/parameters.md` |
| Errors, uncertainty | `references/troubleshooting.md` |
| Mental model | `references/mental-model.md` |

Do not scrape rendered VitePress HTML when these files or raw Markdown links exist.

## Critical authoring rule

First-party / code-authored workflows:

**EDIT**

- `ir.build.ts` or `workflow.ts`

**GENERATED. Do not hand-edit.**

- `workflow.ir.json`
- compiled prompt / API JSON
- generated node SDK (`cwf codegen` output, `src/nodes/gen`)
- `object_info.json` snapshots (recapture, do not patch)

`comfy.workflow.json` is generated for first-party packages. Edit it only when you intend to change published metadata (imported packages: `cwf expose`).

Graph IR is canonical **semantics**. TypeScript is what a person or agent maintains. Those do not conflict. Never patch IR JSON because "IR is canonical."

## Topology vs runtime

If the change adds, removes, or rewires nodes, it is **topology**. Edit TypeScript (`g.add`, recipes, helpers). Rebuild.

If it only changes an existing widget (prompt, seed, steps, checkpoint **name** on the server), it is a **runtime parameter**. Use `paramRef("name")` / `g.param(...)`. Bind later with `instantiateTemplate` or `cwf run --param`.

A Python/Rust binder replaces `{"$param":"..."}`. It does not grow graphs.

## Custom nodes

Load skill `comfy-custom-nodes`. Snapshot + codegen + `g.add`. `rawNode` is not the default. `cwf setup` is the only installer.

## Non-Node products

TypeScript at **build time**. Generated IR / prompt template at **runtime**.

Do not reimplement the Graph IR compiler in Python, Rust, Go, or C#. Do not lower bypass, lossless ints, or slot indexes in a second language.

Node is required for authoring and CI. Node is **not** required as a production daemon if the app only binds params and POSTs compiled JSON to Comfy.

## Security

- Workflow packages are **data**. `cwf inspect` / package discovery for `run` must not execute package JavaScript.
- `inspect`, `init`, and `run` never install Python.
- Only `cwf setup` installs custom nodes, after a printed plan.
- Default confirmation is No. Do **not** run `cwf setup --yes` unless the user explicitly asked to install into a named Comfy directory.
- Prefer `cwf inspect --json` and `cwf setup --dry-run --json` first.
- Manifests have no `install` / `script` / `shell` / `pip` / `git` command fields. `repository` is not a clone instruction.
- Models are not auto-downloaded.
- Registry mapping must be version-verified. Do not invent it.

## Distribution

GitHub Release + GitHub Packages are canonical. npmjs is an optional convenience mirror.

The **format** is npm-compatible (`package.json` + `comfy.workflow.json` + `workflow.ir.json`). The **host** does not change graph semantics. Do not put registry URLs into Graph IR.

## Task recipes

### Create a new code-first workflow

1. Determine the target Comfy (`--url`).
2. If the graph needs custom classes, follow skill `comfy-custom-nodes` (snapshot + codegen).
3. Create `ir.build.ts` or `workflow.ts`.
4. `g.add` generated specs. Use `paramRef` for runtime values.
5. `cwf compile` / `cwf validate`.
6. `cwf run` only if the user wants a live queue.
7. Do not touch generated IR.

### Modify an existing code-authored workflow

1. Open `ir.build.ts` (not `workflow.ir.json`).
2. Change topology or inputs there.
3. Rebuild (`pnpm build:packages` in this monorepo, or the project's compile step).
4. Inspect the generated diff. Do not "fix" generated files.

### Import JSON

1. `cwf init <name> --from workflow.json` or `cwf import`.
2. Inspect IR. Optionally adopt `workflow.ts`.
3. If it becomes first-party, migrate edits into TypeScript and treat IR as generated.

### Runtime-only value change

1. Confirm the input already exists on a node.
2. Use `ParamRef`. Rebuild artifacts.
3. Bind at run (`--param` or the host-language binder).

### Optional topology branch

That is a **different graph**. Author another builder / package (or a real `if` in TypeScript that adds nodes). Do not encode topology in the Python binder.

## When uncertain

| Symptom | Do |
| ------- | -- |
| Unknown node class / missing pack | Skill `comfy-custom-nodes`. Do not guess names or clone GitHub. |
| Type mismatch | Read declared input/output types. `unsafe` only with explicit user intent. |
| Need Python/Rust in production | Generated artifact + narrow binder. Not a new compiler. |
| Seed > 2^53 | `bigint` / `{"$int":"..."}`. Never `Number` / `JSON.parse` the compiled prompt. |
| User asks where to edit a generated file | Point at `ir.build.ts` / `workflow.ts`. Refuse to patch IR. |

## CLI habits

JSON on stdout when `--json` is passed. Errors are JSON on stderr. Exit non-zero on failure.

Commands with `--json`: `init`, `suggest`, `pack`, `inspect`, `resolve-nodes`, `setup` (and `node-pack` subcommands).

`cwf catalog` and `cwf explain` are read-only discovery.

Full command list: `references/cli.md`.
