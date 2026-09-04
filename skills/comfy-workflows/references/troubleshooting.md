# Troubleshooting

| Situation | Correct action | Wrong action |
| --------- | -------------- | ------------ |
| User hands `workflow.json` and wants code | `cwf init` / `import`; optionally adopt `workflow.ts` | Hand-rewrite JSON as IR |
| Add a custom node already in Comfy | Snapshot, codegen, `g.add` | Invent a class name or `rawNode` first |
| Change KSampler steps at runtime | `paramRef("steps")` / `g.param` | Patch `workflow.ir.json` or hardcoded node ids in Python |
| Optional branch that adds nodes | New TypeScript graph / package | Binder that constructs nodes |
| Python app, "must Node run in prod?" | No, if you ship compiled artifacts | Second compiler in Python |
| Install missing custom nodes | `inspect` → `resolve-nodes` → `setup --dry-run`; `setup --yes` only if asked | `setup --yes` unprompted; clone `repository` |
| Publish a new package | Build artifacts, `cwf pack`, GitHub canonical | Custom registry; npm-only as source of truth |
| "Where do I edit this generated workflow?" | `ir.build.ts` / `workflow.ts` | `workflow.ir.json`, prompt JSON, `src/nodes/gen` |
| Codegen missing a class | Recapture `/object_info`, regenerate | Guess an export |
| Seed larger than 2^53 | `bigint` / `$int` tag | `Number`, `JSON.parse` compiled JSON |
| Type mismatch | Fix wiring or, with user intent, `unsafe` | "skip validation" (no such flag) |
| Bypass / mute confusion | Read bypass docs; compiler will not guess | Invent pass-through |
| Output slot confusion | Use index `{node, out}` | Key on output name |
| Ambiguous node pack | Report candidates; do not auto-pick | Guess from GitHub name |
| npm rate limit / missing npm name | Use GitHub Packages / Release tarball | Retry creates; bump version to dodge E429 |

Compile is deterministic. If bytes changed, inputs changed (graph or defs). Check `comfy.lock.json` drift (`E_LOCK_DRIFT`) rather than editing output JSON.
