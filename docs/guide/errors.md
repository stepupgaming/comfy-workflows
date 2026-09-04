# Errors and debugging

Every SDK failure carries a stable `code` plus structured fields. Agents branch on `code`, not on prose. Canonical definition: `src/errors.ts`. New codes may be added; existing ones do not change meaning.

Full table: [Error codes](/reference/errors).

## ComfyError

| Field | Meaning |
| ----- | ------- |
| `code` | Stable `E_*` identifier |
| `message` | Human-readable summary |
| `nodeId` | IR node, when applicable |
| `input` | Input/param name |
| `expected` / `got` | Types or values |
| `allowed` | Combo options, for `E_BAD_COMBO` |
| `hint` | Actionable suggestion |
| `nodeErrors` | Per-node children (server `node_errors`) |
| `details` | Original payload |

CLI failures print JSON on stderr:

```json
{ "error": { "code": "E_TYPE_MISMATCH", "nodeId": "n5", "input": "clip", "expected": "CLIP", "got": "MODEL" } }
```

Envelope warnings (not compiler codes): `E_LOCK_DRIFT`, `E_LIVE_DEFS_UNAVAILABLE`. Crashes outside `ComfyError` become `E_UNCAUGHT`.

## Troubleshooting

| Symptom | What to run | Likely cause |
| ------- | ----------- | ------------ |
| Node class missing | `cwf inspect . --url URL` | Class not in live `/object_info`. Install pack or recapture snapshot. |
| Custom pack unknown | `cwf resolve-nodes . --url URL` | No verified Registry owner. Manual `cwf node-pack add`, or the class is actually core. |
| Lock drift | `cwf lock --url URL` after reviewing diff | Comfy or custom nodes changed. Update snapshot + codegen on purpose. |
| Generated types stale | `cwf codegen --from object_info.json -o …` | You installed a pack and did not regenerate. |
| `E_TYPE_MISMATCH` | `cwf explain file` | Wrong handle. Check `.MODEL` vs `.CLIP`. Use `unsafe` only if the node lies. |
| `rawNode` required | Snapshot the instance that has the class | Codegen from the right environment. `rawNode` is the escape hatch, not the default. |
| `E_UNBOUND_PARAM` | `cwf inspect` for required params | Pass `--param` or declare a default. |
| Path not portable | `cwf pack` → `E_PACK_LOCAL_PATH` | `cwf expose … --required`. Do not publish `C:\Users\…`. |
| Runtime Comfy error | read `E_NODE_EXECUTION_ERROR` / `nodeErrors` | Missing model, OOM, node bug. Graph compiled; Comfy failed. |
| Package validates, model missing | `requires.models` is informational | Place the checkpoint yourself. No downloader. |
| Pack installed, still failing | `ready: false`, `restartRequired` | Restart Comfy, then `inspect --url` until classes show ✓. |

## Branching

```ts
import { ComfyError } from "@stepupgaming/comfy-workflows";

try {
  await client.run({ kind: "graph", graph });
} catch (e) {
  if (e instanceof ComfyError) {
    switch (e.code) {
      case "E_BAD_COMBO":
        break;
      case "E_NODE_EXECUTION_ERROR":
        break;
    }
  }
}
```
