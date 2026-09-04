# Errors

Every failure the SDK can produce carries a stable `code` plus structured
fields — so agents and scripts branch on failures programmatically instead of
parsing prose. The canonical definition lives in `src/errors.ts`; new codes
may be added, existing ones do not change meaning.

## ComfyError

`ComfyError` extends `Error` with machine-readable fields:

| Field       | Meaning                                              |
| ----------- | ---------------------------------------------------- |
| `code`      | Stable `E_*` identifier (see table below)            |
| `message`   | Human-readable summary                               |
| `nodeId`    | IR node the failure is attached to, when applicable  |
| `input`     | Input/param name the failure is about                |
| `expected`  | What the compiler/runtime expected there             |
| `got`       | What was actually found                              |
| `allowed`   | Allowed combo options, for `E_BAD_COMBO`             |
| `hint`      | Actionable suggestion, when derivable                |
| `nodeErrors`| Per-node child errors (e.g. server `node_errors`)    |
| `details`   | Original server/import payload, when applicable      |

`toJSON()` returns the plain-object form, suitable for JSON logs and agent
consumption.

## Error codes

| Code                     | Raised when…                                        |
| ------------------------ | --------------------------------------------------- |
| `E_UNKNOWN_NODE_TYPE`    | node class is absent from the provided defs          |
| `E_MISSING_INPUT`        | required input has no value and no default           |
| `E_TYPE_MISMATCH`        | connected output type ≠ input's declared type        |
| `E_BAD_COMBO`            | combo value is not among the allowed options         |
| `E_RANGE`                | numeric param is outside its declared `[min, max]`   |
| `E_UNKNOWN_INPUT`        | param references an undeclared input                 |
| `E_INVALID_INPUT`        | input key conflicts with the def                     |
| `E_CYCLE`                | the graph contains a cycle                           |
| `E_MUTED_CONSUMED`       | a muted node is still referenced by a consumer       |
| `E_UNRESOLVED_BYPASS`    | a bypass pass-through could not be resolved — set an explicit `bypassMap` |
| `E_INVALID_GRAPH`        | dangling ref, out-of-range slot, malformed IR        |
| `E_INVALID_PARAM`        | param value is invalid for its declared kind         |
| `E_UNBOUND_PARAM`        | template placeholder was never bound                 |
| `E_UNBOUND_PORT`         | template input port was never bound                  |
| `E_ASSET_UNSTAGED`       | an `AssetRef` reached compilation without staging    |
| `E_ASSET_STAGE_FAILED`   | asset upload failed                                  |
| `E_SUBMIT_FAILED`        | HTTP submit failed (network, 4xx/5xx)                |
| `E_NODE_EXECUTION_ERROR` | ComfyUI reported a node-level execution error        |
| `E_TIMEOUT`              | run exceeded the configured timeout                  |
| `E_CONNECTION_FAILED`    | transport-level failure talking to Comfy             |
| `E_UNSUPPORTED_FEATURE`  | import met a construct the importer can't represent  |
| `E_NODE_PACK_AMBIGUOUS`  | more than one **verified** registry pack provides a class |
| `E_NODE_PACK_UNKNOWN`    | no verified registered pack could be identified for a class |
| `E_INVALID_NODE_PACK`    | node-pack metadata is invalid (or an unsafe id)      |
| `E_NODE_PACK_VERSION_UNSATISFIED` | declared version range matches no active Registry version |
| `E_COMFY_PYTHON_UNKNOWN` | target Comfy Python interpreter could not be established |
| `E_SETUP_DECLINED`       | setup confirmation was no / missing `--yes`          |
| `E_SETUP_NOT_APPLICABLE` | setup cannot be applied (remote URL, no Manager)     |
| `E_SETUP_FAILED`         | official installer returned a failure                |

The CLI additionally reports three envelope-level codes that are not
compiler/runtime codes: `E_LOCK_DRIFT` (lockfile/defs drift — a *warning*),
`E_LIVE_DEFS_UNAVAILABLE` (live `/object_info` fetch failed; bundled defs were
used — also a warning), and `E_UNCAUGHT` (a non-`ComfyError` crash).

## What errors look like

CLI failures print machine-readable JSON on stderr:

```json
{ "error": { "code": "E_TYPE_MISMATCH", "nodeId": "n5", "input": "clip", "expected": "CLIP", "got": "MODEL" } }
```

Server rejections from `/prompt` are normalized into the same shape: the
top-level error keeps `E_SUBMIT_FAILED` and copies `nodeId` / `input` /
`expected` / `got` from the first failing node, with the full normalized
`nodeErrors` list attached — so a validation failure at ComfyUI reads exactly
like a local one.

## Branching on failures (agents)

```ts
try {
  await comfy.run({ kind: "graph", graph });
} catch (e) {
  if (e instanceof ComfyError) {
    switch (e.code) {
      case "E_BAD_COMBO":
        // e.input names the param, e.allowed lists valid values
        break;
      case "E_NODE_EXECUTION_ERROR":
        // e.nodeErrors holds per-node detail
        break;
    }
  }
}
```
