# Import round-trip

## Source forms

| Format | Detect | Notes |
| ------ | ------ | ----- |
| Editor / save (`"version": 0.4`) | `nodes` array + `links` | links table, positional `widgets_values` |
| Workflow v1 | `nodes` array, `version >= 1` | named widget maps supported |
| API / prompt JSON | id → `{class_type, inputs}` | connections already `{id, slot}` |

Detection is automatic. `cwf compile`, `cwf validate`, and `cwf run` also accept these files directly and import on the fly.

## What is preserved

- Node ids verbatim, so Comfy-side errors map back
- Titles and modes (`0` active, `2` muted, `4` bypassed)
- Slot identity as output **index**
- Integers beyond 2^53
- Unknown custom nodes as raw nodes, original JSON on `node.source`
- Metadata the importer did not understand, same `node.source` bag

## What is normalized

- `Reroute` chains are traced through
- `PrimitiveNode` values are inlined into the widgets they feed
- Widget decode of positional `widgets_values` needs defs (`--from` or a live `--url`). Without defs, unknown nodes still round-trip as raw.

## What this SDK does not do

It does not export Graph IR back to editor-format JSON yet. That is on the [roadmap](/project/roadmap). Compile emits API JSON, which is the execution form, not a canvas restore file.

## Bypass

Imported bypassed nodes do not get a guessed `bypassMap`. Compile fails with `E_UNRESOLVED_BYPASS` until you set one. That is deliberate. [Bypass and mute](/concepts/bypass).
