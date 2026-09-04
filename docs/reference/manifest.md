# `comfy.workflow.json`

The versioned manifest every workflow package ships. `specVersion` is `1` (legacy string `nodePacks`) or `2` (rich pack objects). Consumers must reject manifests whose contract they don't understand.

JSON Schema: [`schema/comfy.workflow.schema.json`](https://github.com/stepupgaming/comfy-workflows/blob/main/schema/comfy.workflow.schema.json), also `@stepupgaming/comfy-workflows/schema`.

## Minimal example

```json
{
  "specVersion": 1,
  "name": "text-to-image",
  "title": "Text to Image",
  "entry": "./workflow.ir.json",
  "parameters": {
    "checkpoint": { "type": "string", "required": true },
    "prompt": { "type": "string", "required": true },
    "seed": { "type": "integer", "required": true }
  },
  "outputs": [{ "name": "image", "type": "IMAGE" }],
  "requires": {
    "nodeClasses": [
      "CheckpointLoaderSimple",
      "CLIPTextEncode",
      "KSampler",
      "VAEDecode",
      "SaveImage"
    ],
    "nodePacks": [],
    "models": []
  }
}
```

## Fields

- **`specVersion`** (`1` \| `2`, required)
- **`name`** (string, required) — machine identity
- **`title`** (string, required)
- **`entry`** (string, required) — package-relative path to IR. Absolute paths and `../` escapes rejected.
- **`description`**
- **`parameters`** — keyed by name. `type` (`int`/`float`/`string`/`boolean`/`combo`; `"integer"` aliases `int`), `required`, optional `default`, `options`, `description`. Must cohere with the IR template.
- **`outputs`** — `{ name, type }[]`, must match graph output decls
- **`requires.nodeClasses`** — must match classes used in IR (`cwf pack` fails on omit or stale)
- **`requires.nodePacks`** — v1 strings / v2 objects. See [Custom nodes](/guide/custom-nodes)
- **`requires.models`** — `{ kind, name, optional? }`. Reported, never downloaded
- **`coreVersion`** — semver range of `@stepupgaming/comfy-workflows`. During 0.x: `^0.<minor>.0`
- **`compatibility`** — `minComfyUIVersion`, `notes`

[Packages](/concepts/packages)
