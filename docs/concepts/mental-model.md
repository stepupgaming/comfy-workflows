# Mental model

```
Human-maintained TypeScript
        ↓
 Graph semantics
        ↓
 Graph IR
        ↓
 compiler
        ↓
 Comfy API JSON
```

## Canonical vs authored

**Graph IR is the canonical semantic representation of a workflow.**

**TypeScript can be the canonical author-maintained source that generates that IR.**

Those sentences do not fight. "IR is canonical" does **not** mean developers should edit IR JSON. They should not.

Comfy API JSON is a build artifact. Never hand-edit it.

## Two package situations

### 1. Imported package

```
workflow.json
    ↓ import
workflow.ir.json
```

`workflow.ts` may be emitted as an editable convenience. You can adopt it, or keep treating IR as the thing `cwf expose` mutates.

### 2. First-party / code-authored package

```
ir.build.ts
    ↓ build
workflow.ir.json
comfy.workflow.json
```

`ir.build.ts` is what the developer edits. Generated files say do not hand-edit.

## Layers you can drop through

```
Workflow packages → Recipes → Typed node SDK → Graph IR → Compiler → Runtime → Comfy
```

Work at the highest level that still says what you mean.

[What do I edit?](/start/what-do-i-edit) · [Graph IR](/concepts/graph-ir)
