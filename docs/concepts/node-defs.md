# Node definitions

Defs are the typed description of `/object_info`: class name, inputs (connection vs widget), outputs, combo options, min/max.

They come from a **snapshot of one Comfy**, not from a mythical global catalog.

```ts
import { parseObjectInfo, hashObjectInfo, loadDefsSnapshot } from "@stepupgaming/comfy-workflows";
```

Compile without defs still emits, but validation against types/combos needs them. Live `--url` fetches `/object_info` for `validate` / `run`.

Codegen turns defs into TypeScript specs (`defineNode`, `conn`, `int`, `combo`, …). Those specs are what `g.add` type-checks against.

Dynamic / autogrow inputs may not round-trip into a perfect spec. That is an escape-hatch case, not a reason to skip codegen.

[Codegen](/code/codegen)
