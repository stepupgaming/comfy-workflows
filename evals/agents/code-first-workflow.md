# Eval: create a typed code-first workflow

TASK:
Create a new text-to-image workflow as TypeScript using `@stepupgaming/comfy-workflows`. Target a Comfy instance at http://127.0.0.1:8188 if available.

PASS:
- Reads SKILL.md / `references/code-first.md` rather than inventing a second JSON format
- Snapshots `/object_info` or uses bundled core nodes
- Authors `workflow.ts` or `ir.build.ts` with `g.add(spec, …)`
- Uses `bigint` for seed (`42n`)
- Compiles with `cwf compile` / `compile()`
- Does not write `workflow.ir.json` by hand
- Does not invent custom `class_type` strings

FAIL:
- Hand-builds Comfy API JSON
- Edits generated IR
- Uses `rawNode` for CheckpointLoaderSimple / KSampler
- Runs `cwf setup --yes` for a core-only graph
