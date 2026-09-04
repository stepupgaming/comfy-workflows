# Choose your path

Pick the row that matches what you have. Each link is a tutorial, not a dump of every flag.

| I have… | Start here |
| ------- | ---------- |
| `workflow.json` / API JSON I already like | [Convert an existing workflow](/migrate/import) |
| A blank project and I want typed code | [Code-first quickstart](/code/quickstart) |
| A product that uses Comfy (maybe not even Node at runtime) | [Product integration](/product/architecture) |
| Custom nodes on my Comfy | [Snapshot + codegen](/code/codegen) |
| A published workflow package | [Install, inspect, run](/migrate/package) |
| A class `/object_info` cannot describe | [Escape hatches](/code/escape-hatches) (`rawNode` / `unsafe`) |

If you are converting JSON **and** you later want to own the graph in TypeScript, finish the import tutorial, then treat the emitted `workflow.ts` (or a new `ir.build.ts`) as the source. See [What do I edit?](/start/what-do-i-edit).

## Custom nodes, two jobs

Consuming custom nodes: snapshot the live instance, generate wrappers, declare Registry packs, run `cwf setup` after you approve the plan.

Writing Python node implementations: that is Comfy / a custom-node repo. This SDK does not generate Python nodes. [Custom node development vs consumption](/guide/consume-vs-author-nodes).
