# Agent instructions for this repository

You are modifying **Comfy Workflows** (`@stepupgaming/comfy-workflows`), a TypeScript SDK and `cwf` CLI. This file is for work **in this repo**. If you are using the SDK in another project, read `skills/comfy-workflows/SKILL.md` instead.

Unofficial project. Not affiliated with or endorsed by Comfy Org. MIT. Do not publish a `comfy` binary.

## Product mental model

```
TypeScript authoring
    ↓
Graph IR
    ↓
official Comfy Workflows compiler
    ↓
Comfy API JSON
    ↓
ComfyUI
```

- **Graph IR** is the canonical semantic representation.
- **TypeScript** (`ir.build.ts` / `workflow.ts`) is the human-maintained first-party authoring source.
- **`workflow.ir.json`** is generated. Do not hand-edit it.
- **Comfy API JSON** is a compile artifact. Do not hand-edit it.
- ComfyUI executes. This SDK does not replace Comfy and does not author Python nodes.

## Repository invariants

Do not:

- Hand-edit generated `workflow.ir.json`, `comfy.workflow.json` (except intentional manifest metadata), or typed node SDK files under `src/nodes/gen`
- Invent `class_type` names or custom-node ownership from filenames
- Implement another Graph IR compiler (including in Python/Rust/Go)
- Silently install executable custom-node Python (`inspect` / `init` / `run` never install; only `cwf setup` does)
- Make npmjs a release prerequisite
- Put GitHub-specific distribution fields into Graph IR
- Treat `rawNode` as the normal custom-node path (codegen from `/object_info` is)
- Weaken exact integer handling (`bigint`, `{"$int":"..."}`, raw numeric literals on `/prompt`)
- Guess bypass / mute lowering
- Guess output slots (identity is `{nodeId, outputIndex}`; names are sugar)
- Rewrite `~/.npmrc` with tokens, commit `_authToken`, or hardcode `publishConfig.registry` to GitHub Packages
- Add H3/LAWDIS/project-specific resolver behavior to this generic SDK

## Useful commands

These exist in `package.json`. Do not invent others.

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm build:packages
pnpm codegen:core
pnpm docs:gen
pnpm docs:check
pnpm docs:dev
pnpm docs:build
pnpm agent:check
pnpm test:packed-consumer
pnpm test:tarball-consumer
pnpm test:github-packages-consumer
pnpm release:pack
pnpm release:status
```

Live Comfy tests run only when `COMFY_URL` points at a running instance.

CI also requires:

- `pnpm codegen:core && git diff --exit-code src/nodes/gen`
- `pnpm build:packages && git diff --exit-code packages/*/workflow.ir.json packages/*/comfy.workflow.json`

## Source map

| Area | Where |
| ---- | ----- |
| Public API | `src/index.ts` |
| Builder | `src/builder/` |
| Graph IR | `src/ir/` |
| Compiler | `src/compile/` |
| Runtime client | `src/runtime/` |
| Workflow packages | `src/wfpack/`, `packages/` |
| Custom-node resolution | `src/deps/` |
| CLI | `src/cli/` |
| Codegen | `src/codegen/`, `src/emit-ts/` |
| Bundled generated nodes | `src/nodes/gen/` (do not hand-edit) |
| Recipes | `src/recipes/` |
| Errors | `src/errors.ts` |
| Schema | `schema/` |
| Docs | `docs/` (VitePress, `base: /comfy-workflows/`) |
| Doc examples (typechecked) | `docs/examples-src/` |
| Release tooling | `scripts/release-*.mjs`, `distribution/`, `.github/workflows/` |
| Agent skill (SDK users) | `skills/comfy-workflows/` |
| Agent evals | `evals/agents/` |

## Before changing subsystem X

Read the matching docs. Do not copy the site into this file.

| Change | Read first |
| ------ | ---------- |
| Workflow authoring / IR | `docs/concepts/mental-model.md`, `docs/code/build-a-graph.md` |
| Parameters / templates | `docs/code/parameters.md`, `docs/concepts/templates.md` |
| Custom nodes / setup | `docs/guide/custom-nodes.md`, `src/deps/AGENTS.md` |
| Non-Node products | `docs/product/build-time-vs-runtime.md`, `docs/concepts/no-second-compiler.md` |
| Packages | `packages/AGENTS.md`, `docs/concepts/packages.md` |
| Distribution | `docs/product/distribution.md` |
| Docs site | `docs/AGENTS.md` |
| Integers / seeds | `docs/concepts/lossless-integers.md` |
| Bypass | `docs/concepts/bypass.md` |

## Distribution (repo policy)

GitHub Release + GitHub Packages are canonical. npmjs is an optional mirror and **must not** fail a release. Pack once (`pnpm release:pack`). Do not retry new npm package-name creates that hit E429.

## Security

Workflow packages are data. `cwf inspect` must not execute package JavaScript. Custom-node install executes Python and requires explicit `cwf setup` after a printed plan. Models are not auto-downloaded. Manifests have no shell/pip/git command fields.
