# Custom nodes

This SDK **consumes** `/object_info`. It does not author Python node implementations.

## Authoring (typed)

Known in the snapshot → codegen → `g.add(spec, …)`.

Unknown or unrepresentable → `rawNode`. Escape hatch only. Names a class. Does not download code.

```ts
const n = g.rawNode(
  "SomeUnregisteredNode",
  { model: ckpt.MODEL, strength: 0.5 },
  { outputs: [{ name: "MODEL", type: "MODEL" }], id: "9" },
);
```

`unsafe(slot)` widens types when a node lies about sockets. It does not disable combo/range/cycle/unbound checks. Use only with explicit user intent.

Do not invent `class_type`. If codegen did not emit it, snapshot again.

## Package dependencies

- `requires.nodeClasses` — `class_type` names the graph uses. `cwf pack` checks this against IR.
- `requires.nodePacks` — Comfy Registry ids that provide those classes.

Identity is the Registry package id (example `comfyui-videohelpersuite`), not a GitHub URL.

Resolution (`cwf resolve-nodes`) is deterministic. No LLM. A pack is accepted only after the **selected version's** node definitions list the class. Ambiguous → report, do not auto-pick. Unknown → not installable.

`UNKNOWN` is not `CUSTOM`.

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

Rules:

- `run` / `inspect` / `init` never install Python
- Default confirmation is No
- `--yes` approves a **verified** plan, not arbitrary git/pip
- Manifests have no shell/pip/git command fields
- `repository` is informational; never clone it automatically
- Models are not auto-downloaded
- Package JS is never executed to read dependency metadata

Deeper: `_links.md` (`custom-nodes`, `security`).
