---
name: comfy-custom-nodes
description: >
  Use when adding, typing, or declaring ComfyUI custom nodes for
  @stepupgaming/comfy-workflows: /object_info snapshot, cwf codegen, g.add of
  generated specs, rawNode escape hatch, inspect missing classes, Comfy
  Registry ids on requires.nodePacks. Trigger on missing class_type, UNKNOWN
  node, VHS_LoadVideo, custom_nodes, codegen wrappers. Not for writing
  Python NODE_CLASS_MAPPINGS. Use comfy-workflows for graph topology.
---

# Comfy custom nodes

This SDK **consumes** `/object_info`. It does not author Python custom-node implementations. It does not install them.

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

- `requires.nodeClasses` — `class_type` names the graph uses. `cwf pack` checks this against IR.
- `requires.nodePacks` — Comfy Registry ids that provide those classes (example `comfyui-videohelpersuite`), not GitHub URLs.

Authors write Registry ids. `cwf pack` warns if the graph uses non-core classes and `nodePacks` is empty.

## Missing classes on a live Comfy

```sh
cwf inspect <pkg> --url http://127.0.0.1:8188 --json
```

Inspect reports missing classes. It never installs Python.

If the user asked to install into their Comfy, they run Comfy CLI:

```sh
comfy node install <registry-id>
```

Restart Comfy, recapture `/object_info` if authoring types, then codegen.

Do **not** run `comfy node install` unless the user explicitly asked to install. Do not clone `repository`. `cwf setup` was removed.

## When uncertain

| Symptom                           | Do                                                                                                         |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Unknown class                     | Snapshot `/object_info`. Do not guess the name.                                                            |
| Generated wrapper missing a class | Recapture + codegen. Then `rawNode` only if still absent.                                                  |
| Missing custom pack               | `inspect --json`. Show `comfy node install <id>` from declared `nodePacks`. Install only with user intent. |
| User wants a new Python node      | Wrong project. Write a Comfy custom-node repo, then `comfy node publish`.                                  |
