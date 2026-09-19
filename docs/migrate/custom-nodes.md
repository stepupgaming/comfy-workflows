# Custom nodes on an imported workflow

Unknown classes do not fail import. They become `rawNode` with the original JSON preserved. That is enough to round-trip. It is not enough to type-check.

## 1. See what the live instance has

```sh
cwf inspect . --url http://127.0.0.1:8188
```

Missing classes print as `✗`. Inspect never installs them.

## 2. Declare Registry packs

Put Comfy Registry package ids on `requires.nodePacks` in `comfy.workflow.json`. Identity is the Registry id (example `comfyui-videohelpersuite`), not a GitHub URL.

## 3. Install with Comfy CLI

```sh
comfy node install comfyui-videohelpersuite
```

Restart Comfy, then inspect again. `inspect`, `init`, and `run` never install executable Python.

Then snapshot `/object_info` and [codegen](/code/codegen) so the class is a typed spec instead of `rawNode`.
