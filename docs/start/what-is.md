# What is Comfy Workflows?

Comfy Workflows is a TypeScript SDK and CLI for authoring ComfyUI graphs as code.

You write typed node graphs (or import JSON you already have). The SDK compiles them to the API JSON Comfy executes. Graph IR is the stored semantic form. ComfyUI stays the execution backend.

> Unofficial project. Not affiliated with or endorsed by Comfy Org.

## What it is not

It is not a replacement for ComfyUI. It does not author Python custom nodes. It does not download models. It is not "a CLI that converts some JSON."

Official Comfy clients focus on talking to a running instance. This project focuses on the graph itself: types, import, compile, packages, and environment setup.

## Why not edit Comfy JSON?

Hand-edited prompt JSON drifts. Node ids shuffle. Seeds larger than 2^53 round through JavaScript numbers and change. A `MODEL` wired into a `CLIP` input fails only when you queue. Reusing half a workflow means copy-paste.

Comfy Workflows treats those as compiler problems:

- `g.add(spec, params)` is checked against a real `/object_info` snapshot.
- Seeds are `bigint` in memory and tagged `{"$int":"..."}` on disk.
- `compile(graph, defs)` is pure. Identical inputs produce byte-identical JSON.
- Recipes and packages compose graphs instead of stapling JSON files.
- `comfy.lock.json` records the node universe you built against.

## The three-way split

| Role | What | Edit? |
| ---- | ---- | ----- |
| Authoring source | TypeScript (`ir.build.ts` or `workflow.ts`) | Yes |
| Semantic document | Graph IR (`workflow.ir.json`) | No |
| Execution artifact | Comfy API JSON | No |

Graph IR is canonical **semantics**. TypeScript is the canonical **thing a person maintains**. Those are not in conflict. Do not hand-edit IR JSON because "IR is canonical."

Details: [Mental model](/concepts/mental-model) and [What do I edit?](/start/what-do-i-edit).

## Three ways in

| You have | Start |
| -------- | ----- |
| A working `workflow.json` | [Convert an existing workflow](/migrate/import) |
| A blank project and a local Comfy | [Code-first quickstart](/code/quickstart) |
| A product that already talks to Comfy | [Product integration](/product/architecture) |

[Choose your path](/start/choose-your-path) if that table is not enough.

## Current core

`@stepupgaming/comfy-workflows` **0.2.13**. Canonical host is GitHub (Packages + Release tarballs); npmjs is a convenience mirror. The `cwf` CLI ships in the same package (`comfy-workflows` is an alias). Node.js ≥ 22. [Install](/start/install).
