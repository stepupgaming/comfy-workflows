# Error codes

Generated from `src/errors.ts`. Meanings below are the source comments.

<!--@include: ./_generated/error-codes.md-->

## CLI envelope codes (not in `ErrorCodes`)

| Code | Meaning |
| ---- | ------- |
| `E_LOCK_DRIFT` | Lockfile/defs hash mismatch. **Warning.** |
| `E_LIVE_DEFS_UNAVAILABLE` | `/object_info` fetch failed; bundled defs used. **Warning.** |
| `E_UNCAUGHT` | Non-`ComfyError` crash |
| `E_PACK_LOCAL_PATH` | Pack validation: machine-local path in IR (see `cwf pack`) |

## Remediation (common)

| Code | Typical fix |
| ---- | ----------- |
| `E_UNKNOWN_NODE_TYPE` | Snapshot the Comfy that has the class; codegen; or `rawNode` |
| `E_TYPE_MISMATCH` | Wire the right handle; `unsafe` only if the node lies |
| `E_UNBOUND_PARAM` / `E_UNBOUND_PORT` | Pass bindings or defaults |
| `E_UNRESOLVED_BYPASS` | `g.setBypassMap` |
| `E_MUTED_CONSUMED` | Unmute or disconnect |
| `E_REMOVED_COMMAND` | `cwf setup` / `resolve-nodes` / `node-pack` were removed. Use `comfy node install <id>` |

[Debugging](/guide/errors)
