# Node SDK

`@stepupgaming/comfy-workflows/nodes` is the **bundled core** registry, generated from `fixtures/object_info/core.json`.

```ts
import { loaders, sampling, KSampler, specs } from "@stepupgaming/comfy-workflows/nodes";
```

`specs` is `Record<classType, NodeSpec>`.

For **your** custom nodes, run `cwf codegen -o <dir>` and import that registry. The documented module contract: generated files import helpers from `"@stepupgaming/comfy-workflows"`.

A `NodeSpec` encodes input kinds (`connection`, `int`, `float`, `string`, `boolean`, `combo`) and outputs. `g.add(spec, params)` uses that to type-check.

Helpers used by codegen (`conn`, `int`, `combo`, `defineNode`, …) live on the builder types module. You rarely call them by hand.

[Codegen](/code/codegen) · [Catalog](/reference/node-catalog)
