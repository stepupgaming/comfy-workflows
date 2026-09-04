---
title: Custom-node dependencies
layout: doc
---

# Custom-node dependencies

A published workflow should declare which Comfy custom-node packs it needs. Comfy Workflows resolves those declarations against the Comfy Registry, and `cwf setup` prepares a local Comfy installation — after you approve the exact plan.

```sh
pnpm add @alice/some-workflow
cwf inspect @alice/some-workflow --url http://127.0.0.1:8188
cwf setup @alice/some-workflow --comfy C:\ComfyUI
# restart Comfy if setup says so
cwf inspect @alice/some-workflow --url http://127.0.0.1:8188
cwf run @alice/some-workflow --url http://127.0.0.1:8188
```

You should not have to hunt GitHub for missing custom nodes.

Package format is host-agnostic. The same `inspect` / `resolve-nodes` / `setup` path works whether the tarball came from npm, GitHub Packages, a GitHub Release, or a local file. Core and already-published first-party packages may live on npm; new workflow packages may temporarily be distributed via GitHub while npm rate-limits new names. That is a publication detail, not a resolver assumption.

Do **not** set a scope-wide `@stepupgaming:registry=https://npm.pkg.github.com`. That would also send the existing core package to GitHub Packages. Install the core from npm, then fetch a GitHub Packages workflow as a tarball:

```sh
pnpm add @stepupgaming/comfy-workflows
npm pack @stepupgaming/comfy-workflow-h3-rtx-vsr@0.1.1 --registry=https://npm.pkg.github.com
pnpm add ./stepupgaming-comfy-workflow-h3-rtx-vsr-0.1.1.tgz
cwf inspect @stepupgaming/comfy-workflow-h3-rtx-vsr
cwf setup @stepupgaming/comfy-workflow-h3-rtx-vsr --comfy <ComfyUI-path> --dry-run
```

GitHub Packages reads typically need a `read:packages` token at pack/install time. That token must not be committed.

## Security contract

Custom nodes are executable Python.

- **`cwf run` never installs them.** Missing classes fail at compile/validate time.
- **`cwf inspect` never installs them.** It only reports.
- **`cwf init` never installs them.** With `--url` it may _discover_ **verified** registry metadata.
- **Installation happens only through `cwf setup`** (or another explicitly invoked setup command).
- Default confirmation is **No**. `--yes` means “approve this **verified** plan”, not “allow arbitrary untrusted sources”.
- Registered Comfy Registry packs are eligible for setup **after version-level verification**. Arbitrary Git URLs and pip specs are **not** auto-installed.
- Workflow-package JavaScript is never executed to inspect dependency metadata.
- Manifests are declarative: no `install`, `script`, `command`, `shell`, `pip`, or `git` fields.
- Registry names, descriptions, and repository prose never become shell commands or argv.

## nodeClasses vs nodePacks

- **`requires.nodeClasses`** — the non-negotiable set of Comfy `class_type` names the graph uses. `cwf pack` requires this to match the IR.
- **`requires.nodePacks`** — installable packs that _provide_ those classes. Identity is the Comfy Registry package id (for example `comfyui-videohelpersuite`).

### Manifest spec versions

| specVersion | `nodePacks` wire format |
| ----------- | ----------------------- |
| **1**       | `string[]` of registry ids (legacy) |
| **2**       | `NodePackRequirement[]` objects |

Existing published v1 packages remain valid. Rich dependency metadata is **specVersion 2**. The parser never silently writes objects under specVersion 1.

A v2 pack entry:

```json
{
  "id": "comfyui-videohelpersuite",
  "name": "ComfyUI-VideoHelperSuite",
  "version": "^1.7.9",
  "repository": "https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite",
  "provides": ["VHS_LoadVideo", "VHS_VideoCombine"],
  "source": "registry"
}
```

`repository` is informational. It is never an instruction to clone a URL.

## How resolution works

```sh
cwf resolve-nodes . --url http://127.0.0.1:8188
cwf resolve-nodes . --url http://127.0.0.1:8188 --write
```

Without `--write`, nothing is mutated. With `--write`, **verified** packs are merged into `comfy.workflow.json` as specVersion 2.

`GET https://api.comfy.org/nodes/search?comfy_node_search={className}` is the candidate universe (paginated). `GET /comfy-nodes/{className}/node` is an additional ranked hint only — never the complete set. Official Comfy source treats the ranked endpoint as a preempted “best” pack. It can attribute a core class to a third-party pack, hide other claimants, or 404 for a real custom class.

Verification pipeline:

1. Required class
2. Live `/object_info` (availability — a present class needs no install)
3. Known-core evidence (bundled defs snapshot **plus** known newer stock classes such as `CLIPLoader` / `UNETLoader`)
4. Author-declared `provides` (explicit mapping — a claim, not proof)
5. Registry search candidates (all pages) plus ranked hint
6. Exact pack **version** (`GET /nodes/{id}/versions`, then `/install?version=`)
7. Pack-version definitions (`GET /nodes/{id}/versions/{version}/comfy-nodes`, paginated)
8. Verified provider set

A publisher `source: "registry"` declaration is a **claim**. Only `provided === true` for the selected version authorizes automatic installation. `provided === false` or `provided === undefined` is UNKNOWN / unverifiable and never reaches the installer.

Outcomes per class:

| Outcome            | Meaning |
| ------------------ | ------- |
| `CORE`             | Known stock class. Never installed as a custom pack. |
| `RESOLVED_CUSTOM`  | Exactly one **verified** pack/version supplies the class. |
| `AMBIGUOUS`        | More than one **verified** pack supplies the class. Author must pick. `E_NODE_PACK_AMBIGUOUS`. |
| `UNKNOWN`          | No verified provider. Not “definitely core” and not “definitely custom”. `E_NODE_PACK_UNKNOWN`. |

A ranked hint that does not list the class in that version’s definitions is dropped. `--write` never records an unverified guess.

Manual authoring when the registry cannot help:

```sh
cwf node-pack add comfyui-videohelpersuite --provides VHS_LoadVideo,VHS_VideoCombine
cwf node-pack map GemmyH3SaveAVLatent my-internal-pack
```

Manual entries still pass manifest validation. They are `source: "manual"` and are **not** auto-installed by `cwf setup`. Mapping is author intent, not a shell escape.

`cwf pack` warns (`W_PACK_UNRESOLVED_NODE_PACK`) when a class has no owning pack. That stays a warning: absence from the bundled core snapshot is not proof the class is custom. `cwf pack --publish` still fails contradictory/invalid pack metadata.

## Exact versions

A manifest `version` of `^1.7.9` does **not** mean “install latest”. Setup resolves the range against published Registry versions and records:

- `requestedVersion`: `^1.7.9`
- `resolvedVersion`: `1.9.2` (example)

The installer is then invoked with the **exact** resolved version. If no published version satisfies the range: `E_NODE_PACK_VERSION_UNSATISFIED`. No silent latest.

## How `cwf setup` works

```sh
cwf setup @alice/cool-video-workflow --comfy C:\ComfyUI
```

1. Load the manifest + IR as data (no package JS).
2. Diff required classes against live `/object_info` when `--url` is given, and against the local `custom_nodes` tree.
3. Verify missing classes; resolve exact compatible pack versions.
4. Build an install plan (library API: `buildDependencyReport` / `createSetupPlan` / `applySetupPlan`).
5. Print exactly which registered packs and versions will be installed.
6. Ask `Continue? [y/N]` (default No). `--yes` skips the prompt; `--dry-run` prints the plan and exits.
7. Delegate to ComfyUI-Manager **`cm-cli.py install <registry-id>@<exact-version>`** with an argument array (no shell concatenation). `COMFYUI_PATH` is set to the target root. The subprocess uses the **target** Python (`python_embeded\python.exe` on portable Windows, otherwise the target venv). If Python cannot be established: `E_COMFY_PYTHON_UNKNOWN` — nothing is installed.
8. Report that Comfy must be restarted. Setup never kills a running Comfy process.

Agent / CI shape:

```sh
cwf setup workflow --comfy C:\ComfyUI --dry-run --json
cwf setup workflow --comfy C:\ComfyUI --yes --json
```

`--yes` still refuses unresolved, ambiguous, unregistered, and version-unsatisfied packs.

JSON distinguishes `alreadyInstalled`, `toInstall`, `unresolved`, `ambiguous`, `failed`, `restartRequired`, `ready`, `availabilityKnown`.

`ready: true` means every required node class is **known available** on the target Comfy instance (`/object_info`). Installing a pack is not readiness: after a successful install the plan is `installed` / `restartRequired: true` / `ready: false` until availability is re-verified. Manual-source skipped dependencies never make `ready` true while their classes are still missing.

Inspect JSON classifies required classes as `coreNodeClasses`, `resolvedCustomNodeClasses`, `unknownNodeClasses`, and `ambiguousNodeClasses`. UNKNOWN is not CUSTOM.

## Local vs remote Comfy

`cwf inspect workflow --url https://remote-comfy` is fine: `/object_info` is readable.

`cwf setup --url remote` without `--comfy` produces a plan and states that **local filesystem access** is required to apply it. There is no remote shell, no invented Manager HTTP install against a stranger's server.

`--comfy` always wins over detection. Supported layouts: a git checkout (`main.py` + `comfy/` + venv), a portable Windows tree (`python_embeded` / inner `ComfyUI/`), and `COMFYUI_PATH`. Personal machine paths are never hard-coded. If more than one install could match, pass `--comfy`. Paths containing spaces are supported.

## Models

`requires.models` is reported (`status: unknown` in this increment). There is no model downloader. Model installation is a later increment; the setup-plan shape already has a `models` field so it can be added without redesign.

## JSON / agent mode

`cwf inspect`, `cwf resolve-nodes`, and `cwf setup` all accept `--json`.

Library entry: `@stepupgaming/comfy-workflows/deps` — `resolveNodeClasses`, `createSetupPlan`, `applySetupPlan`, `buildDependencyReport`.
