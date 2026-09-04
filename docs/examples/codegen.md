# Example: generated node SDK

```sh
cwf snapshot --url http://127.0.0.1:8188 -o object_info.json
cwf codegen --from object_info.json -o comfy-nodes
```

Then:

```ts
import { CheckpointLoaderSimple } from "./comfy-nodes/registry";
```

The bundled registry used in other examples is the same format, generated from `fixtures/object_info/core.json`.

[Generate typed nodes](/code/codegen)
