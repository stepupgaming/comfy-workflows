---
title: Introduction
layout: doc
---

# What is Comfy Workflows?

Comfy Workflows is a code-first way to build ComfyUI workflows. Instead of hand-editing JSON in a text editor — losing types, reproducibility, and composability — you author workflows in TypeScript, share them as npm packages, and compile them deterministically to the exact JSON ComfyUI executes.

Three ideas carry the whole design:

1. **Graph IR is the semantic truth.** A plain-JSON intermediate representation sits between your code and ComfyUI. Everything — imports, recipes, packages, compilation — speaks IR.
2. **TypeScript is the authoring surface.** Typed node wrappers make illegal wiring a compile error, not a runtime surprise.
3. **npm is the distribution layer.** Workflows ship as versioned packages with a manifest that can be inspected without executing code.

> Unofficial project. Not affiliated with or endorsed by Comfy Org.

## Why not just edit Comfy JSON?

Hand-edited JSON drifts: node ids shift, seeds silently exceed 2^53 and corrupt, a `MODEL` output wired into a `CLIP` input fails only at queue time, and reusing half a workflow means copy-paste. Comfy Workflows fixes each of these structurally:

- **Types**: `g.add(spec, params)` is checked against your Comfy instance's node definitions. Mismatches fail before anything is queued.
- **Lossless integers**: seeds are `bigint` in memory and `{"$int": "..."}` on disk — the full 64-bit range survives every round-trip.
- **Determinism**: the same graph plus the same defs compiles to byte-identical JSON, with a hash to prove it.
- **Composition**: recipes and packaged templates are functions over graphs. `hiresFix(textToImage({...}))` is one valid graph, not two JSON files stapled together.
- **Environment awareness**: a lockfile records the node universe you built against; drift is reported, never silently ignored.

Official Comfy SDKs focus on API execution. Comfy Workflows focuses on workflow authoring, import, Graph IR, deterministic compilation, composition, packaging, and distribution.

## The pipeline

Existing workflows enter through import; everything converges on IR:

```
Comfy JSON ──cwf import──▶ Graph IR ──author/compose──▶ IR ──cwf compile──▶ API JSON ──▶ ComfyUI
                              ▲                                          (build artifact)
                              │ workflow packages (npm: manifest + IR)
```

- **Import**: `cwf import existing.json --ts workflows/foo/workflow.ts` turns editor/API JSON into IR plus editable TypeScript. See [Getting started](./getting-started#importing-existing-workflows).
- **Author**: build graphs with the typed SDK or one-call [recipes](/reference/recipes). See [Authoring workflows](./authoring).
- **Share**: publish the IR plus a manifest as an npm package; others `cwf inspect` and `cwf run` it. See [Workflow packages](./packages).
- **Compile & run**: deterministic compile, local or live validation, HTTP+WS execution with replayable run metadata. See [Compile & validate](./compile-and-validate) and [Runtime](./runtime).

## Install the core package

```sh
npm install @stepupgaming/comfy-workflows
```

The [`cwf` CLI](./cli) ships with the package (`comfy-workflows` works too). Every command prints JSON for machines and human text otherwise; every error is machine-readable JSON on stderr.

## Where to go next

- [Getting started](./getting-started) — install-to-running-workflow walkthrough
- [Authoring workflows](./authoring) — builder API, templates, escape hatches
- [Workflow packages](./packages) — installing, inspecting, running, authoring
- [CLI](./cli) — the full command set
- [Architecture](/reference/architecture) — the frozen IR/compiler/runtime design
- [Errors](./errors) — the machine-readable error taxonomy
