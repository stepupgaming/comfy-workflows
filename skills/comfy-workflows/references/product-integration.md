# Product integration (including Python/Rust/Go)

A product that talks to Comfy should not grow a second graph language.

```
real Comfy
    ↓ /object_info snapshot
 generated typed node SDK
    ↓
 hand-authored ir.build.ts
    ↓
 generated Graph IR + manifest / prompt template
    ↓
 application runtime (any language)
    ↓
 Comfy
```

## Option A — the app is already Node

`workflow()` → `compile()` → `createClient().run()` in process. Fine.

## Option B — Python / Rust / Go / C#

Keep TypeScript at **build time**. Ship generated artifacts. At runtime, bind `{"$param":"..."}` values and POST to Comfy.

The binder must stay topology-free. Replace a parameter. Do not create a `KSampler`. Do not interpret product flags as different `class_type` graphs.

If a flag needs different nodes, author another `ir.build.ts`. If it needs a different number, bind a parameter.

### Does production need Node?

| Situation | Need Node? |
| --------- | ---------- |
| Authoring / CI | Yes |
| TS app calling `createClient` | Yes |
| Python/Rust posting compiled JSON | No |
| `cwf run` on a workstation | Yes (the CLI) |

Do not reimplement bypass lowering, lossless integer emit, or slot identity.

Deeper: `_links.md` (`architecture`, `build-time-vs-runtime`, `no-second-compiler`).
