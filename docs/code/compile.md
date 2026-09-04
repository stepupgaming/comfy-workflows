# Compile and validate

`compile(graph, defs)` is pure. No I/O. Same graph + same defs → byte-identical API JSON.

```ts
import { compile } from "@stepupgaming/comfy-workflows";

const result = compile(graph);
if (!result.ok) {
  for (const e of result.errors) console.error(e.code, e.message);
} else {
  result.json; // POST this to /prompt
  result.hash; // SHA-256 of json
  result.object; // structured API object (bigint retained)
}
```

Pipeline: conservative bypass lowering → validation → deterministic emit.

## CLI

```sh
cwf compile workflow.ts -o dist/prompt.json --pretty
cwf compile graph.ir.json -o dist/prompt.json --defs defs.json --lock comfy.lock.json
cwf validate workflow.ts --url http://127.0.0.1:8188
```

`compile`, `validate`, and `run` accept `workflow.ts`, `.ir.json`, and Comfy JSON (imported on the fly).

`validate` never queues a prompt.

## What validation checks

Unknown class, missing inputs, type mismatch, bad combo, range, cycles, muted consumers, unresolved bypass, unbound params/ports, unstaged `AssetRef`, dangling slot refs. Codes: [Errors](/reference/errors).

File-backed combos (checkpoint filenames) warn rather than fail locally. The server remains authoritative; its rejection is normalized into the same `ComfyError` shape.

## Lock drift

When `comfy.lock.json` is present, a defs-hash mismatch prints `E_LOCK_DRIFT` as a **warning** and compilation continues. CI should treat that as a signal to recapture, not as success.

## The artifact

API JSON is a build output, like a `.wasm`. Do not hand-edit it. Replay by POSTing `run.json.compiledJson` as `{ kind: "wire", json }`.
