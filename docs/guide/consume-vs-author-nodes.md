# Custom node development vs consumption

Comfy Workflows does **not** author Python custom-node implementations.

It:

- consumes `/object_info`
- generates typed TypeScript wrappers
- declares Comfy Registry pack ids on the workflow manifest

Writing a new node is a Comfy custom-node repo (Python, `NODE_CLASS_MAPPINGS`, Registry publish via `comfy node init` / `comfy node publish`). After that node exists on a running Comfy, this SDK can wrap it.

Install published packs with Comfy CLI:

```sh
comfy node install <registry-id>
```

If you came here looking for a Python node generator, you are in the wrong project. If you came here to type-check `VHS_LoadVideo` in a workflow, [codegen](/code/codegen).
