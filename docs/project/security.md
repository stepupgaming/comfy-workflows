# Security

## Workflow packages

`cwf inspect <package>` reads:

- `package.json`
- `comfy.workflow.json`
- `workflow.ir.json`

It does not execute package JavaScript. `ir.build.ts` is build-time authoring source, not consumer discovery code. This is regression-tested with a fixture whose entry throws on import.

That boundary is why third-party workflow packages can be listed without running them.

## Custom nodes

Custom nodes are executable Python. Installing them is equivalent to running someone else's code inside Comfy.

- `inspect` / `init` / `run` never install
- This SDK never installs Python
- Users install with `comfy node install <registry-id>` (Comfy Registry / Manager)
- No arbitrary git/pip from manifests
- `repository` is informational

## `rawNode`

Names a class the type system does not know. The implementation still has to exist in Comfy. `rawNode` is not a download primitive.

## Models

Not downloaded. [Models](/guide/models)

[Custom-node guide](/guide/custom-nodes)
