# Compatibility

## Runtime

- Node.js ≥ 22
- ComfyUI as an HTTP+WS backend (docs use 0.3x-era `/object_info` / `/prompt` / `/history`)
- Windows, macOS, Linux. Portable Windows Python is supported for `cwf setup`.

## Core versioning

During 0.x, workflow packages declare `peerDependencies` and `coreVersion` as `^0.<minor>.0`. `^0.2.0` accepts 0.2.12 and rejects 0.3.0.

## Manifest

`specVersion` 1 and 2. v1 string `nodePacks` still parse. New rich metadata is v2.

## Import

Editor v0.4, workflow v1, API/prompt JSON.

## Migrating from the unpublished `comfy-sdk` name

v0.1 was never on npm as `comfy-sdk`. The rename is mechanical:

- package: `comfy-sdk` → `@stepupgaming/comfy-workflows`
- CLI: do not publish a `comfy` binary. Use `cwf` / `comfy-workflows`
- repo: `stepupgaming/comfy-workflows`

Old `comfy-sdk…` import specifiers in existing `workflow.ts` files still resolve via CLI compatibility aliases.
