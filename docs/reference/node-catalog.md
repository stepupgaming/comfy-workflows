# Node catalog

There is **no** universal static catalog. Node availability depends on the defs snapshot / environment.

The list below is the **bundled core** snapshot shipped with the package (`cwf codegen` of `fixtures/object_info/core.json`). Your Comfy almost certainly has more, including custom nodes.

```sh
cwf catalog [query] [--from catalog.json]
cwf codegen --from object_info.json -o src/nodes/gen   # writes NODES.md
```

<!--@include: ../../src/nodes/gen/NODES.md-->
