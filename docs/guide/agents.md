# Coding agents

Three different surfaces. Do not collapse them.

| Who | File | Job |
| --- | ---- | --- |
| Agent modifying this repository | [AGENTS.md](https://github.com/stepupgaming/comfy-workflows/blob/main/AGENTS.md) | Repo invariants, commands, source map |
| Agent using the SDK in another app | Skill in the installed package: `node_modules/@stepupgaming/comfy-workflows/skills/comfy-workflows/SKILL.md` | Operating manual + progressive references |
| Agent that found the docs site | [llms.txt](/llms.txt) | Routing to raw Markdown |

Deeper single-file digest: [llms-full.txt](/llms-full.txt). Discovery JSON: [agent-index.json](/agent-index.json).

This page is for people configuring agents. It is not the skill.

## Skill (portable)

After `pnpm add @stepupgaming/comfy-workflows` the tarball contains:

```
skills/comfy-workflows/SKILL.md
skills/comfy-workflows/references/
```

The skill teaches: edit TypeScript not generated IR, codegen for custom nodes, `rawNode` as escape hatch, no second compiler, explicit `cwf setup`, GitHub-canonical distribution.

Deep human-doc links from an **installed** skill pin the matching git tag (`references/_links.md`) so an old package does not point at newer APIs. The live `llms.txt` on this site tracks `main`.

## Raw Markdown

Prefer GitHub raw files over scraping VitePress HTML:

https://raw.githubusercontent.com/stepupgaming/comfy-workflows/main/docs/start/what-do-i-edit.md

Each rendered page also exposes `rel="alternate"` `text/markdown` and a “View Markdown source” link.

## JSON CLI

Do not have an agent run `cwf setup --yes` on a laptop as a surprise.

Prefer:

```sh
cwf inspect --json
cwf setup --dry-run --json
cwf suggest --json
cwf pack --json
cwf resolve-nodes --json
```

before any install.

- `--json` on `init`, `suggest`, `pack`, `inspect`, `resolve-nodes`, `setup`, `node-pack`
- Success JSON on **stdout**; every error is JSON on **stderr** with `ComfyError.code`
- `inspect` / `explain` / `catalog` do not guess and do not execute package JavaScript
- `run` never installs Python
- Compile is deterministic: same graph → same bytes

Full command list: [CLI reference](/reference/cli). Error codes: [errors](/reference/errors).

## Security agents get wrong

- Workflow packages are data
- Custom-node install executes Python and needs explicit user intent
- Registry mapping must be verified; do not guess from GitHub names
- Models are not auto-downloaded
- `rawNode` does not download code
- Release host is unrelated to graph semantics
