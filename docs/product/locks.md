# Environment locks

`comfy.lock.json` records the node universe you built against.

```sh
cwf lock --url http://127.0.0.1:8188
cwf lock --url http://127.0.0.1:8188 -o environments/video/comfy.lock.json
```

Fields:

- `format`: `"comfy-lock"`
- `version`: `1`
- `capturedAt`
- `comfyuiVersion` (from `/system_stats` when available)
- `objectInfoHash`
- `nodePacks` (version / commit when known)

## Drift

`compile`, `validate`, and `run` compare the lock to the defs in use. Mismatch → `E_LOCK_DRIFT` **warning**. Compilation still proceeds. CI should fail the job anyway if you care about reproducibility.

```
development environment changed
        ↓
 lock drift warning
        ↓
 inspect /object_info
        ↓
 deliberately update snapshot, lock, codegen
```

Do not hand-edit hashes to silence the warning.

## What a lock does not guarantee

GPU bit-identical images. Model nondeterminism. A different checkpoint file with the same name. [Determinism](/concepts/determinism)
