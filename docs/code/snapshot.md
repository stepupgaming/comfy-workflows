# Snapshot an environment

Node wrappers are not universal. They describe **one** Comfy: its version, its custom nodes, its combo lists.

```sh
cwf snapshot --url http://127.0.0.1:8188 -o environments/image/object_info.json
cwf lock --url http://127.0.0.1:8188 -o environments/image/comfy.lock.json
```

Keep the snapshot next to the lock. Treat both as generated.

## Why a file, not "just hit /object_info"

- CI can typecheck and compile without a GPU box.
- Two environments (image vs video) stay separate on purpose. Do not mash them into one mega-registry.
- Diffs on `object_info.json` / lock hashes show drift.

Live `--url` on `codegen` is convenient while iterating. Commit the snapshot.

## Hash

Codegen stamps `objectInfoHash` into generated headers. `compile` / `validate` / `run` compare `comfy.lock.json` against the defs in use and warn `E_LOCK_DRIFT` when they disagree. Drift is reported, never ignored.

Next: [Generate typed nodes](/code/codegen) · [Multiple environments](/product/environments)
