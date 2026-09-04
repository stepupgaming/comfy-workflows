# Agent notes for `docs/`

Human docs live here. VitePress config is `docs/.vitepress/config.mts`. Site base is **`/comfy-workflows/`**. Do not change it to the unpublished historical package name.

## Generated vs authored

- Author Markdown under `docs/` (except `docs/reference/_generated/` and `docs/public/llms*.txt`, `docs/public/agent-index.json`).
- Run `pnpm docs:gen` (from repo root) to refresh CLI help, error codes, package index, and agent discovery files.
- Do not hand-edit `docs/reference/_generated/` or the generated `docs/public/llms.txt`, `llms-full.txt`, `agent-index.json`.

## Examples must typecheck

`docs/examples-src/` is compiled by `pnpm docs:check` (`tsc --noEmit -p docs/examples-src/tsconfig.json`). If you paste a snippet into a page with `<<< @/examples-src/...`, keep that file compiling.

## Checks

```sh
pnpm docs:check
pnpm agent:check
```

`docs-check` fails on stale package names, old core versions listed as current, and committed npm tokens. `agent:check` fails if agent-facing files teach generated-JSON editing, npm-as-canonical, a second compiler, or automatic `setup --yes`.

## Agent surfaces that are not this site

- Repo contributors: root `AGENTS.md`
- SDK users in another app: `skills/comfy-workflows/SKILL.md`
- Do not collapse those into VitePress pages.

The human page for people configuring agents is `docs/guide/agents.md`.
