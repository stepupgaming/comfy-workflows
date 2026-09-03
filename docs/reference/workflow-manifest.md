---
title: comfy.workflow.json reference
layout: doc
---

# `comfy.workflow.json` reference

The versioned manifest every workflow package ships. `specVersion` is `1`; consumers must reject manifests whose major contract they don't understand.

A minimal manifest:

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
    "nodeClasses": ["CheckpointLoaderSimple", "CLIPTextEncode", "KSampler", "VAEDecode", "SaveImage"],
    "nodePacks": [],
    "models": []
  }
}
```

The machine-readable [JSON Schema](https://github.com/stepupgaming/comfy-workflows/blob/main/schema/comfy.workflow.schema.json) ships with the core package (`@stepupgaming/comfy-workflows/schema`).

## Fields

- **`specVersion`** (`1`, required) — manifest contract version. Versioned from day one.
- **`name`** (string, required) — machine identity, unique within its npm package (e.g. `"text-to-image"`).
- **`title`** (string, required) — human title (e.g. `"Text to Image"`).
- **`entry`** (string, required) — package-relative path to the canonical IR document (e.g. `"./workflow.ir.json"`). Must stay inside the package; absolute paths and `../` escapes are rejected.
- **`description`** (string) — what the workflow does.
- **`parameters`** (object, required) — template parameters keyed by name. Each entry: `type` (`int`/`float`/`string`/`boolean`/`combo`; `"integer"` is accepted as an alias of `"int"`), `required` (boolean), plus optional `default` (JSON scalar), `options`, and `description`. Must cohere with the IR template's declared params: every manifest entry must exist in the IR and vice versa; a manifest-required param must have no default anywhere.
- **`outputs`** (array, required) — declared graph outputs as `{ name, type }` pairs (e.g. `{ "name": "image", "type": "IMAGE" }`). Every manifest entry must match a graph output decl and vice versa.
- **`requires.nodeClasses`** (string[], required) — required Comfy node class names. Explicit in the manifest or deterministically derivable from the IR — `cwf pack` fails when the manifest omits a used class *or* lists one the IR doesn't use.
- **`requires.nodePacks`** (string[]) — node-pack names when known. Informational in v1; empty triggers a `pack` warning, not an error.
- **`requires.models`** (array) — model/checkpoint requirements as `{ kind, name, optional? }` when known. Metadata and compatibility reporting only in v1 — there is no model downloader.
- **`coreVersion`** (string) — minimum core package version (semver range) the package was built against.
- **`compatibility`** (object) — `minComfyUIVersion`, free-form `notes`.

## Dependency semantics

- **Node classes** are the one non-negotiable requirement: they must be explicit or derivable. Everything downstream of this — `inspect --url` availability checks, `pack` validation — builds on that set.
- **Node packs** stay informational where they can't be inferred reliably. Fill them in when the mapping is known so consumers know what to install.
- **Models** are declared, never fetched. Checkpoint choices belong in parameters (portable) rather than baked into the IR (machine-local).
