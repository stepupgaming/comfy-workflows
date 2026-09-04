# Example: typed nodes

Bundled core specs (`CheckpointLoaderSimple`, `KSampler`, …) use the same `NodeSpec` shape codegen emits for custom nodes.

<<< @/examples-src/typed-nodes.ts

After `cwf codegen -o comfy-nodes`, import from that directory instead. Names must exist in the snapshot. Do not invent `VHS_LoadVideo` unless your `object_info.json` contains it.

[Codegen](/code/codegen)
