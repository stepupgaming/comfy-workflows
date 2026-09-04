# Example: multi-environment project

```
comfy/
  environments/
    image/
      object_info.json
      comfy.lock.json
      nodes/           ← cwf codegen output
    video/
      object_info.json
      comfy.lock.json
      nodes/
workflows/
  image/
    ir.build.ts        ← import from ../../comfy/environments/image/nodes/registry.ts
  video/
    ir.build.ts
```

Each builder imports **that** environment's registry. CI rebuilds IR and fails on drift.

[Multiple environments](/product/environments)
