# Roadmap

## Status

The full pipeline is implemented and tested: import → IR → compile → runtime.
Recipes cover the core text/image domains. Generated typed wrappers are
committed and stamped with the `objectInfoHash` they were built from; CI
fails on codegen drift.

Highlights of what ships today:

- Import of editor v0.4 / workflow v1 / API JSON into Graph IR (lossless for
  integers beyond 2^53), with optional TypeScript emission.
- Deterministic compile to byte-identical API JSON with structured,
  machine-readable errors.
- Runtime over HTTP+WS with asset staging, artifact download, and replayable
  `run.json` metadata.
- Environment locking via `comfy.lock.json` with drift warnings.

See [ARCHITECTURE](/reference/architecture) for why each piece looks the way
it does.

## Follow-ups

These are tracked but **not** part of the frozen v0.1 scope:

- Editor-format export (IR back to UI JSON)
- Full asset management (sync, dedup, cleanup — the staging seam exists)
- Video recipes (AnimateDiff / SVD)
- MCP server

The architecture leaves room for each without breaking the existing layer
contract: recipes stay above the typed SDK, IR stays the semantic truth, and
Comfy JSON stays a build artifact.
