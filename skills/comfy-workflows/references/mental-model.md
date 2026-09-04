# Mental model

```
Human-maintained TypeScript
        ↓
 Graph IR          ← canonical semantics (generated file: do not edit)
        ↓
 official compiler
        ↓
 Comfy API JSON    ← execution artifact (do not edit)
        ↓
 ComfyUI
```

TypeScript (`ir.build.ts` / `workflow.ts`) is the normal authored surface.

Two package shapes:

**Imported**

```
workflow.json  →  cwf init / import  →  workflow.ir.json  (+ optional workflow.ts)
```

IR is the stored payload. `workflow.ts` is a convenience you may adopt.

**First-party**

```
ir.build.ts  →  build  →  workflow.ir.json + comfy.workflow.json
```

Edit only `ir.build.ts`.

Layers, highest first:

```
packages → recipes → typed node SDK → Graph IR → compiler → runtime → Comfy
```

Work at the highest level that still says what you mean.

Deeper canonical docs: see `_links.md` (`mental-model`, `what-do-i-edit`).
