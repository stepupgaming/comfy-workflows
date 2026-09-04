# Production architecture

A product that talks to Comfy should not grow a second graph language in Python or Rust.

The pattern that holds up:

```
real Comfy environment
        ↓
 /object_info snapshot
        ↓
 generated typed node SDK
        ↓
 hand-authored ir.build.ts
        ↓
 generated Graph IR + manifest
        ↓
 application runtime (any language)
        ↓
 Comfy
```

TypeScript is a **build-time** authoring tool. The application runtime binds parameter values and posts compiled JSON. It does not construct `class_type` nodes.

## Two architectures

### A. The app is already Node/TypeScript

Call `workflow()`, `compile()`, `createClient().run()` in process. Fine.

### B. The app is Rust, Python, Go, C#, …

Keep Node off the production box if you want. At build time:

1. Codegen per environment
2. Author `ir.build.ts`
3. Emit `workflow.ir.json` and/or a prompt template with `{$param}` holes
4. CI fails if generated artifacts drift

At run time the host language only:

- fills declared parameters
- posts to Comfy
- collects artifacts

It must not grow nodes, rewrite wiring, or pick output indexes by folklore.

[Build-time vs runtime](/product/build-time-vs-runtime) · [No second compiler](/concepts/no-second-compiler)

## Multiple Comfy trees

Image, video, and speech installs are different node universes. Snapshot each. Generate each. Do not invent a mega-registry. [Environments](/product/environments)

## What the application owns

- Product UX, job queue, storage
- Parameter values (prompt, seed, paths staged onto Comfy)
- Which **package** to run (that choice is product logic, not graph surgery)

## What Comfy Workflows owns

- Graph topology
- Types
- Deterministic compile
- Manifest / inspect
- Verified custom-node setup (explicit `cwf setup` only)

## Case study

A generalized walkthrough of this architecture: [Case study](/product/case-study).
