---
name: comfy-custom-nodes
description: >
  Use when adding, typing, resolving, or installing ComfyUI custom nodes for
  @stepupgaming/comfy-workflows: /object_info snapshot, cwf codegen, g.add of
  generated specs, rawNode escape hatch, inspect / resolve-nodes / setup,
  Registry vs manual node packs. Trigger on missing class_type, UNKNOWN node,
  VHS_LoadVideo, custom_nodes, cwf setup, codegen wrappers. Not for writing
  Python NODE_CLASS_MAPPINGS. Use comfy-workflows for graph topology.
---

# Comfy custom nodes

This SDK **consumes** `/object_info`. It does not author Python custom-node implementations.

Ship path: `node_modules/@stepupgaming/comfy-workflows/skills/comfy-custom-nodes/`. Run `cwf agent install` so agents discover it at `.agents/skills/comfy-custom-nodes/`.

Graph topology belongs in skill `comfy-workflows`.

## Default path (class already on the running Comfy)

1. Snapshot live `/object_info`.
2. `cwf codegen`.
3. `g.add(GeneratedSpec, { ... })`.

Do not invent `class_type` strings. Do not guess which GitHub repo owns a class.

Read `references/generated-nodes.md`.

## Escape hatch

`rawNode` names a class when the snapshot still cannot describe it. It does not download or execute Python. It is **not** the default custom-node API.

`unsafe(slot)` widens lying sockets. Combo/range/cycle/unbound checks still run. Use only with explicit user intent.

Read `references/custom-nodes.md`.

## Package dependencies

- `requires.nodeClasses` — `class_type` names the graph uses.
- `requires.nodePacks` — Comfy Registry ids that provide those classes (example `comfyui-videohelpersuite`), not GitHub URLs.

`cwf resolve-nodes` is deterministic. No LLM. A pack is installable only after the **selected version's** definitions list the class.

| Outcome | Meaning |
| ------- | ------- |
| `CORE` | Stock class. Never installed as a custom pack. |
| `RESOLVED_CUSTOM` | Exactly one verified pack/version. |
| `AMBIGUOUS` | More than one verified pack. Author picks. |
| `UNKNOWN` | No verified provider. Not "definitely custom". |

`UNKNOWN` is not `CUSTOM`. Ambiguous stays ambiguous.

Only verified Registry mappings belong as `source: "registry"`. Product-specific classes stay `source: "manual"` and are not auto-installed.

## Setup / security

```sh
cwf inspect <pkg> --json
cwf resolve-nodes <pkg> --url http://127.0.0.1:8188 --json
cwf setup <pkg> --comfy <Comfy-path> --dry-run --json
```

Install only after the user names a Comfy directory and asks to apply:

```sh
cwf setup <pkg> --comfy <Comfy-path> --yes
```

- `run` / `inspect` / `init` never install Python
- Default confirmation is No
- `--yes` approves a **verified** plan, not arbitrary git/pip
- Manifests have no shell/pip/git command fields
- `repository` is informational; never clone it
- Models are not auto-downloaded
- Package JS is never executed to read dependency metadata

## When uncertain

| Symptom | Do |
| ------- | -- |
| Unknown class | Snapshot `/object_info`. Do not guess the name. |
| Generated wrapper missing a class | Recapture + codegen. Then `rawNode` only if still absent. |
| Missing custom pack | `inspect --json`, `resolve-nodes --json`, `setup --dry-run --json`. Do not `--yes` without user intent. |
| User wants a new Python node | Wrong project. Write a Comfy custom-node repo, then wrap it here. |
