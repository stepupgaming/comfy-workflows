# Custom node development vs consumption

Comfy Workflows does **not** author Python custom-node implementations.

It:

- consumes `/object_info`
- generates typed TypeScript wrappers
- declares node-pack dependencies
- can prepare a Comfy environment explicitly (`cwf setup`)

Writing a new node is a Comfy custom-node repo (Python, `NODE_CLASS_MAPPINGS`, Registry publish). After that node exists on a running Comfy, this SDK can wrap it.

If you came here looking for a Python node generator, you are in the wrong project. If you came here to type-check `VHS_LoadVideo` in a workflow, [codegen](/code/codegen).
