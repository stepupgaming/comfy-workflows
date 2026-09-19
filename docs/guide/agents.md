# Coding agents

Three different surfaces. Do not collapse them.

| Who | File | Job |
| --- | ---- | --- |
| Agent modifying this repository | [AGENTS.md](https://github.com/stepupgaming/comfy-workflows/blob/main/AGENTS.md) | Repo invariants, commands, source map |
| Agent using the SDK in another app | Skills in the installed package: `skills/comfy-workflows/` (graphs) and `skills/comfy-custom-nodes/` (codegen) | Operating manuals + progressive references |
| Agent that found the docs site | [llms.txt](/llms.txt) | Routing to raw Markdown |

Deeper single-file digest: [llms-full.txt](/llms-full.txt). Discovery JSON: [agent-index.json](/agent-index.json).

This page is for people configuring agents. It is not the skill.

## Skill (portable)

After `pnpm add @stepupgaming/comfy-workflows` the tarball contains:

```
skills/comfy-workflows/SKILL.md
skills/comfy-workflows/references/
skills/comfy-custom-nodes/SKILL.md
skills/comfy-custom-nodes/references/
```

Compatible Agent Skills clients look in `.agents/skills/`, not `node_modules`. Copy the bundled skill into the project:

```sh
cwf agent install
cwf agent check --json
```

That writes `.agents/skills/comfy-workflows/` and `.agents/skills/comfy-custom-nodes/` from the **installed** package (same version as the SDK). Rerun after upgrading the core. Local edits are not overwritten unless you pass `--force`. There is no `postinstall` hook. This does not mutate `AGENTS.md`.

Some clients also have their own skill directories. The portable project location this command uses is `.agents/skills/`.

`comfy-workflows` teaches: edit TypeScript not generated IR, topology vs ParamRef, no second compiler, packages. `comfy-custom-nodes` teaches: snapshot + codegen, `rawNode` as escape hatch, declare Registry ids, `comfy node install` only with user intent.

Deep human-doc links from an **installed** skill pin the matching git tag (`references/_links.md`) so an old package does not point at newer APIs. The live `llms.txt` on this site tracks `main`.

## Raw Markdown

Prefer GitHub raw files over scraping VitePress HTML:

https://raw.githubusercontent.com/stepupgaming/comfy-workflows/main/docs/start/what-do-i-edit.md

Each rendered page also exposes `rel="alternate"` `text/markdown` and a “View Markdown source” link.

## JSON CLI

Do not have an agent run `comfy node install` on a laptop as a surprise.

Prefer:

```sh
cwf inspect --json
cwf suggest --json
cwf pack --json
```

If classes are missing, print `comfy node install <registry-id>` from declared packs. Install only with user intent.

- `--json` on `init`, `suggest`, `pack`, `inspect`, `agent`
- Success JSON on **stdout**; every error is JSON on **stderr** with `ComfyError.code`
- `inspect` / `explain` / `catalog` do not guess and do not execute package JavaScript
- `run` never installs Python
- Compile is deterministic: same graph → same bytes

Full command list: [CLI reference](/reference/cli). Error codes: [errors](/reference/errors).

## Security agents get wrong

- Workflow packages are data
- Custom-node install executes Python and needs explicit user intent (`comfy node install`)
- Do not guess pack owners from GitHub names
- Models are not auto-downloaded
- `rawNode` does not download code
- Release host is unrelated to graph semantics
