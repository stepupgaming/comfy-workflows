# Run

## CLI

```sh
cwf run workflow.ts --url http://127.0.0.1:8188 --out out/ --param seed=42
cwf run @stepupgaming/comfy-workflow-t2i --url http://127.0.0.1:8188 \
  --param checkpoint=v1-5-pruned-emaonly.safetensors \
  --param prompt="a lighthouse" --param seed=42
```

Artifacts land in `out/<runId>/` beside `run.json`.

`cwf run` never installs custom-node Python. Missing classes fail at compile/validate.

## TypeScript

<<< @/examples-src/runtime.ts

`run` input shapes:

| `kind` | When |
| ------ | ---- |
| `template` | Graph still has ParamRefs; pass `params` / `inputs` |
| `graph` | Already concrete |
| `compiled` | Pre-built API object |
| `wire` | Exact JSON string (replay) |

`runAll(inputs, { concurrency })` batches with a cap.

`validate(input)` talks to the server without queueing.

Progress: `onEvent` plus a `/history` poll fallback because WS event names differ across Comfy versions. `signal` aborts.

## Replay

`run.json.compiledJson` is the exact lossless `/prompt` body, stored as a **string**. Do not `JSON.parse` it if you care about 64-bit seeds. POST it again with `{ kind: "wire", json }`.

[Runtime API](/reference/api/runtime) · [Reproducible runs](/guide/reproducible-runs)
