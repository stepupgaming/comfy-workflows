# Public API

Package: `@stepupgaming/comfy-workflows` (current docs built against the repo's `package.json` version).

| Subpath | What it is |
| ------- | ---------- |
| `@stepupgaming/comfy-workflows` | Graph builder, IR, compile, recipes, errors, `createClient` |
| `/nodes` | Bundled core node specs (from `fixtures/object_info/core.json`) |
| `/recipes` | Same recipes as the root named exports |
| `/ir` | Graph IR types and operations |
| `/runtime` | `createClient`, assets |
| `/wfpack` | Manifest, discover, pack helpers |
| `/deps` | Registry resolve + setup planning |
| `/schema` | `comfy.workflow.schema.json` |

Do not dump generated per-node pages into the sidebar. Search [Node catalog](/reference/node-catalog) / `cwf catalog` instead.

Curated modules:

- [Graph API](/reference/api/graph)
- [Node SDK](/reference/api/nodes)
- [IR API](/reference/api/ir)
- [Runtime API](/reference/api/runtime)
- [Workflow package API](/reference/api/wfpack)
- [Dependency / setup API](/reference/api/deps)
- [Recipes](/reference/recipes)
- [CLI](/reference/cli)
- [Error codes](/reference/errors)

Guides for the same ideas: [Author a graph](/code/build-a-graph) · [Run](/code/run) · [Custom nodes](/guide/custom-nodes)
