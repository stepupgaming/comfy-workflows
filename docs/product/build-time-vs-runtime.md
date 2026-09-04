# Build-time vs runtime

You do not need to add Node as a daemon to a Rust or Python application merely because Comfy Workflows authored its workflows.

## Option A — JavaScript/TypeScript application

The app can:

- build / instantiate
- compile
- `createClient`
- `run`

SDK in process. Comfy still executes.

## Option B — non-Node product

```
TypeScript at BUILD TIME
        ↓
 generated IR / prompt template
        ↓
 application runtime binds values
        ↓
 Comfy
```

<<< @/examples-src/product-build.ts

The binder on the other side of that wall should stay **narrow and topology-free**. Replace `{"$param":"seed"}` with a value. Do not create a `KSampler`. Do not decide that "continue" means a different class_type.

A tiny JS illustration of that binder (the same idea in Python or Rust):

<<< @/examples-src/binder.js

## Authority

The Comfy Workflows compiler is the authority for lowering Graph IR to API JSON.

Other runtimes may consume:

- compiled artifacts
- generated templates
- narrow parameter binding

They should not silently fork compiler semantics (bypass lowering, lossless ints, slot indexes).

If you think you need a second compiler, you probably need another `ir.build.ts` instead.

## Node at runtime?

| Situation | Need Node? |
| --------- | ---------- |
| Authoring / CI | Yes |
| TS app calling `createClient` | Yes |
| Python/Rust posting compiled JSON | No |
| `cwf run` on a workstation | Yes (the CLI) |

[No second compiler](/concepts/no-second-compiler)
