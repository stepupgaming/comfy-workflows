# Example: custom-node / video-shaped graph

The bundled core snapshot has no VHS nodes. A real video graph needs a snapshot from a Comfy that has those packs installed.

Pattern (names must come from **your** codegen output):

```ts
// After: cwf codegen --from environments/video/object_info.json -o environments/video/nodes
import { workflow } from "@stepupgaming/comfy-workflows";
import {
  /* VHS_LoadVideo, VHS_VideoCombine — only if codegen emitted them */
} from "../environments/video/nodes/registry.ts";
```

If those exports are missing, the class is not in the snapshot. Install the pack, restart Comfy, recapture, regenerate. Do not `rawNode("VHS_LoadVideo")` as the normal path.

`rawNode` remains valid when `/object_info` cannot describe the class. [Escape hatches](/code/escape-hatches).

This library is not limited to 7-node SD1.5 graphs. Production video/speech graphs follow the same authoring file; they just import a different generated registry. [Multi-environment](/examples/multi-environment).
