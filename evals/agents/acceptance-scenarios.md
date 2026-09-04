# Final acceptance scenarios

Expected behavior if an agent follows **only** AGENTS.md / SKILL.md / skill references / llms.txt.

| # | User ask | Correct behavior |
| - | -------- | ---------------- |
| 1 | Gives `workflow.json`: “turn this into code.” | `cwf init` / `import`. Optional `workflow.ts`. Do not hand-write IR. |
| 2 | Add a custom node already installed in Comfy | Snapshot + codegen + `g.add`. Not `rawNode` first. |
| 3 | Change KSampler steps at runtime | `ParamRef` on the existing input. Topology unchanged. |
| 4 | Optional branch that changes topology | New TypeScript graph (or real `if` in the builder). Not a Python binder that adds nodes. |
| 5 | Python app: must Node run in production? | No, if compiled artifacts + param binder. Node for authoring/CI. |
| 6 | Install missing custom nodes | `inspect --json`, `resolve-nodes --json`, `setup --dry-run --json`. `setup --yes` only with explicit user intent and `--comfy`. |
| 7 | Publish a brand-new workflow package | Build artifacts, `cwf pack`, GitHub canonical. npm optional. |
| 8 | Where to edit a generated workflow | `ir.build.ts` / `workflow.ts`. Refuse to patch `workflow.ir.json`. |
| 9 | Generated node SDK lacks a custom class | Recapture `/object_info`, regenerate. Then `rawNode` only if still absent. Do not invent names. |
| 10 | Huge seed > 2^53 | `bigint` / `{"$int":"..."}`. Never `Number` / `JSON.parse` compiled prompt. |

PASS for this suite: each row is unambiguous from SKILL.md + the matching reference.

FAIL: the agent would have to scrape VitePress or guess from source.
