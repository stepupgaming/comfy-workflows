# Runtime & execution

`@stepupgaming/comfy-workflows/runtime` executes graphs on any reachable ComfyUI — local or
remote. ComfyUI is an execution backend only; everything the runtime submits
was compiled by the SDK.

## createClient

```ts
import { createClient } from "@stepupgaming/comfy-workflows/runtime";

const client = createClient({
  url: "http://127.0.0.1:8188",
  headers: { Authorization: "Bearer …" }, // optional, applied to every request
  timeoutMs: 600_000, // default
});
```

All HTTP/WS traffic goes through this client. `fetchImpl` and `wsFactory` are
injectable for tests.

## What can be run

`run` accepts four input shapes — work at the highest one that fits:

```ts
await client.run({ kind: "template", graph: tpl, params: { seed: 42n } });
await client.run({ kind: "graph", graph }); // template with placeholders already bound
await client.run({ kind: "compiled", object: compiled }); // pre-compiled API object
await client.run({ kind: "wire", json: compiledJsonString }); // exact bytes (replay)
```

Every shape converges on the same submission path: the POST body is assembled
by string concatenation through the bigint-aware serializer, so 64-bit seeds
never round-trip through JS numbers. Losslessness is verified end-to-end by
the test suite.

## run, runAll, validate

```ts
const result = await client.run({ kind: "graph", graph }, { outDir: "out" });
result.artifacts; // [{ filename, subfolder, type, contentType, savedPath, bytes }]
result.graphHash; // hash of the submitted graph
```

- `runAll(inputs, { concurrency })` sweeps a batch of inputs with a bounded
  concurrency cap.
- `validate(input)` compiles (when needed) and validates against the server —
  without queueing work. It never executes. With local `defs` configured,
  you additionally get structured early errors before anything hits the wire.
- Progress and completion are observed via WS events **plus** a polling
  fallback against `/history`, because event naming differs across ComfyUI
  versions. `onEvent` receives typed `RunEvent`s; `signal` aborts.

## Asset staging

Connection-style image/mask params accept `AssetRef`s pointing at local
files. Before submit, the runtime uploads them (`/upload/image`,
`/upload/mask`) and rewrites the refs to server filenames:

```ts
import { AssetRef } from "@stepupgaming/comfy-workflows";

const graph = img2img({
  checkpoint: "v1-5-pruned-emaonly.safetensors",
  image: new AssetRef("C:/pics/input.png"),
  positivePrompt: "…",
  seed: 1n,
});
```

Uploads never mutate the caller's graph — a clone is staged. Full asset
management (sync, dedup, cleanup) is a follow-up; the seam is built in now.

## Replayable runs

With `outDir` configured, every run writes a self-auditing directory:

```
out/<runId>/run.json     # params, graphHash, defsHash, the exact /prompt body, artifacts, warnings
out/<runId>/<files>      # downloaded artifacts
```

`run.json.compiledJson` is the exact lossless JSON submitted to `/prompt`
(bigint literals intact, stored as a string — never re-parsed). POST it again
with `{ "kind": "wire", "json": … }` to reproduce the run byte-for-byte.

## Lockfile drift

`compile`, `validate`, and `run` all check `comfy.lock.json` (or `--lock <path>`)
and report `E_LOCK_DRIFT` as a warning when the live environment's
`objectInfoHash` no longer matches. Drift is reported, never silently ignored.
