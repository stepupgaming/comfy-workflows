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
| `E_NODE_PACK_AMBIGUOUS` | `cwf node-pack add` / pick a provider |
| `E_NODE_PACK_UNKNOWN` | Manual map, or the class is core/unregistered |
| `E_NODE_PACK_VERSION_UNSATISFIED` | Relax the range or publish that version |
| `E_COMFY_PYTHON_UNKNOWN` | Pass `--comfy` at the tree that has Python |
| `E_SETUP_DECLINED` | Answer y or pass `--yes` |
| `E_SETUP_NOT_APPLICABLE` | Local `--comfy` required to apply |

[Debugging](/guide/errors)
