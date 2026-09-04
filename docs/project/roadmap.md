# Roadmap

## Shipped (0.2.x)

- Import editor v0.4 / workflow v1 / API JSON into Graph IR (lossless integers)
- Typed authoring + codegen from `/object_info`
- Deterministic compile, structured errors
- HTTP+WS runtime, asset staging, `run.json` replay
- `comfy.lock.json` drift warnings
- Workflow packages: manifest, `cwf pack` / `inspect` / `run <package>`
- Custom-node resolve + explicit `cwf setup` (never from `run`)
- First-party packages `@stepupgaming/comfy-workflow-t2i` and `…-hires`
- Recipes: `textToImage`, `img2img`, `inpaint`, `outpaint`, `withLora`, `withControlNet`, `hiresFix`, `upscale`

## Near-term

- Editor-format export (IR back to UI JSON)
- Deeper asset management (sync, dedup, cleanup) on the existing staging seam
- Keep docs examples typechecked (`pnpm docs:check`)

## Exploratory

- Video-oriented recipes (only if they stay generic; no product-specific graphs in core)
- MCP server
- Model acquisition (explicit, licensed, not silent)

The layer contract does not change for those: packages and recipes above the typed SDK, IR as semantics, Comfy JSON as artifact.
