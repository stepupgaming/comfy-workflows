# Graph API

Module: `@stepupgaming/comfy-workflows` (authoring layer).

## `workflow(name?: string): GraphBuilder`

Creates a builder. `name` is metadata.

## `GraphBuilder`

| Method | Purpose |
| ------ | ------- |
| `param(name, def)` | Declare a template param; returns `ParamRef` |
| `port(name, nodeId, input, type?)` | Unbound connection filled at instantiate |
| `add(spec, params, opts?)` | Typed node. `opts.id` preserves ids |
| `rawNode(classType, values, opts?)` | Escape hatch |
| `connectInput(target, inputName, ref)` | Untyped wire |
| `setParamRaw(target, name, value)` | Raw widget write |
| `setMode(target, mode)` | `active` \| `bypassed` \| `muted` |
| `setTitle(target, title)` | Display title |
| `setBypassMap(target, map)` | output index → input name |
| `output(ref, { name? })` | Graph output / artifact |
| `toGraph()` | Graph IR |
| `explain()` | Text expansion of this builder |

## `paramRef(name)` / `isParamRef`

`{ $param: name }`.

## `unsafe(output)` / `unsafeRef(node, out)`

Widen an output handle to any socket type.

## `AssetRef`

`new AssetRef(path, kind?, name?)` with `kind` `"image"` \| `"mask"`.

Guide: [Build a graph](/code/build-a-graph) · [Escape hatches](/code/escape-hatches)
