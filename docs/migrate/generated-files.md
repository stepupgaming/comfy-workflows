# Understand generated files

After `cwf init` or `cwf import`, you have several files. Only some of them are yours.

| File | Edit? | Role |
| ---- | ----- | ---- |
| `package.json` | Yes (metadata) | npm identity, `comfyWorkflow` pointer, keywords |
| `comfy.workflow.json` | After you mean to | Manifest: params, outputs, node classes |
| `workflow.ir.json` | No | Canonical Graph IR |
| `workflow.ts` | Optional yes | Emitted TypeScript. Adopt it if you want to own the graph in code. |
| `README.md` | Yes | Generated scaffolding. Rewrite if you publish. |

See [What do I edit?](/start/what-do-i-edit) for the full table including codegen and locks.

## `workflow.ir.json`

Plain tagged JSON. Safe under ordinary `JSON.parse`. Slot identity is `{node, out}`. Template placeholders look like `{"$param":"seed"}`. Big integers look like `{"$int":"18446744073709551615"}`.

Do not hand-edit this in a first-party package. If you adopted `workflow.ts` / `ir.build.ts`, rebuild IR from TypeScript.

## `workflow.ts`

`cwf import --ts` and `cwf init` emit this so you can keep working in the type checker. Classes known to defs but missing from every registry become `rawNode(...)` so the file always loads.

If you later snapshot your Comfy and run codegen, re-import with `--registry <dir>` so those classes become typed specs.

## `comfy.workflow.json`

Identity, parameters, outputs, `requires.nodeClasses`. `cwf pack` checks this against the IR. A class listed in the IR but missing here (or the reverse) fails the pack.

## Portability warnings

`cwf init` never rewrites behavior. It does tell you about values that make the package machine-specific: checkpoint filenames, absolute paths. Those warnings are the cue to [expose parameters](/migrate/parameterize).
