# Updating Comfy / custom nodes

When the target Comfy changes:

1. Snapshot `/object_info` again
2. Recapture `comfy.lock.json`
3. Regenerate typed nodes
4. Rebuild IR from `ir.build.ts`
5. `cwf pack` / validate
6. Commit. CI `git diff --exit-code` should be green because you updated the artifacts on purpose.

If you skip codegen, `g.add` will not know new classes and compile against live defs will throw `E_UNKNOWN_NODE_TYPE`.

If you skip the lock update, you get `E_LOCK_DRIFT` warnings forever.

Do not "fix" drift by editing hashes.
