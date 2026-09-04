# Case study: integrating Comfy Workflows into a production application

This is the architecture a product uses when it outgrows a folder of hand-edited JSON and a Python file that mutates `class_type`.

It is generalized. It does not document a private app's internals.

## Before

- Python or Rust assembled graphs by copying dicts
- Hardcoded node ids (`"8"` is always the sampler, until it isn't)
- One mega-builder with flags that added and removed nodes
- Custom-node installs tribal-knowledge
- Seeds corrupted if anything touched `JSON.parse`

## After

```
comfy/
  environments/
    image/     object_info.json  comfy.lock.json  nodes/
    video/     …
    speech/    …
workflows/
  image-t2i/   ir.build.ts
  video-gen/   ir.build.ts
  speech/      ir.build.ts
```

- Each environment is snapshotted from the Comfy that will run it
- Codegen produces typed specs for **that** universe
- Humans (and agents) edit `ir.build.ts`
- CI rebuilds `workflow.ir.json` + manifest and fails on drift
- The application runtime selects a **package** and binds `{$param}` values
- No host-language topology
- `cwf setup` is a documented, explicit ops step

## Binding rule that saved the migration

If a flag would change which nodes exist, it is a different package (or a different `ir.build.ts`). If it only fills a widget, it is a parameter.

Continue vs first-frame vs upscale are different graphs. Steps and seed are not.

## Non-Node runtime

The production worker can stay Python or Rust. It loads generated artifacts, binds params, POSTs to Comfy. It never becomes a second Graph IR compiler.

## Custom nodes

Declare packs in the manifest. Resolve with `cwf resolve-nodes`. Install with `cwf setup` on the machine that owns the Comfy tree. Restart. Re-inspect. Then run.

## What to copy

Not a vendor's class names. The **shape**: per-environment snapshots, authored TypeScript, generated IR, narrow binder, CI drift gates.

[Build-time vs runtime](/product/build-time-vs-runtime) · [Environments](/product/environments) · [What do I edit?](/start/what-do-i-edit)
