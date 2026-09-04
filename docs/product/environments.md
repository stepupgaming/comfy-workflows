# Multiple Comfy environments

One project may talk to several Comfy installs. They do not share a node universe.

Typical split: image, video, speech. Different custom-node sets, different Comfy versions, different model stacks.

Do not invent a mega-registry that pretends VHS nodes exist on the image box.

## Layout

```
comfy/
  environments/
    image/
      object_info.json      ← generated
      comfy.lock.json       ← generated
      nodes/                ← generated codegen
    video/
      object_info.json
      comfy.lock.json
      nodes/
workflows/
  image/
    ir.build.ts             ← authored
  video/
    ir.build.ts
```

Each `ir.build.ts` imports **that** environment's registry.

```ts
import { CheckpointLoaderSimple } from "../environments/image/nodes/registry.ts";
```

## Recapture

When the video box gains a node pack:

```sh
cwf snapshot --url http://127.0.0.1:8188 -o comfy/environments/video/object_info.json
cwf lock --url http://127.0.0.1:8188 -o comfy/environments/video/comfy.lock.json
cwf codegen --from comfy/environments/video/object_info.json -o comfy/environments/video/nodes
```

Commit the result. CI should `codegen` / build IR and `git diff --exit-code`.

## Why this is not optional

Generated types that do not match the target fail in confusing ways: `E_UNKNOWN_NODE_TYPE` at compile, or worse, a graph that compiles against bundled core defs and dies on the real server.

Always compile against the snapshot of the Comfy you will hit.

[Locks](/product/locks) · [CI](/product/ci) · [Example](/examples/multi-environment)
