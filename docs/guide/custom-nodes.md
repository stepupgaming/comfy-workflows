# Custom-node dependencies

A published workflow should declare which Comfy custom-node packs it needs. Comfy Registry and `comfy-cli` install those packs. This SDK does not.

```sh
pnpm add @alice/some-workflow
cwf inspect @alice/some-workflow --url http://127.0.0.1:8188
# if classes are missing:
comfy node install comfyui-videohelpersuite
# restart Comfy
cwf inspect @alice/some-workflow --url http://127.0.0.1:8188
cwf run @alice/some-workflow --url http://127.0.0.1:8188
```

You should not have to hunt GitHub for missing custom nodes. Put the Registry id on the manifest; install with Comfy's tool.

Package format is host-agnostic. Inspect works whether the tarball came from npm, GitHub Packages, a GitHub Release, or a local file. [Distribution](/product/distribution).

## Security contract

Custom nodes are executable Python. **This SDK never installs them.**

- **`cwf run` never installs them.** Missing classes fail at compile/validate time.
- **`cwf inspect` never installs them.** It reports missing classes vs live `/object_info`.
- **`cwf init` never installs them.**
- Install with **`comfy node install <registry-id>`** (or ComfyUI Manager) only when you intend to put Python into a Comfy tree.
- Manifests are declarative: no `install`, `script`, `command`, `shell`, `pip`, or `git` fields.
- `repository` is informational. It is never an instruction to clone a URL.
- Workflow-package JavaScript is never executed to inspect dependency metadata.
- Models are not auto-downloaded.

This SDK **consumes** `/object_info`. It does not author Python node implementations. [Consume vs author](/guide/consume-vs-author-nodes).

## nodeClasses vs nodePacks

- **`requires.nodeClasses`** — the non-negotiable set of Comfy `class_type` names the graph uses. `cwf pack` requires this to match the IR.
- **`requires.nodePacks`** — Comfy Registry package ids that provide those classes (for example `comfyui-videohelpersuite`). A shopping list for `comfy node install`.

### Manifest spec versions

| specVersion | `nodePacks` wire format             |
| ----------- | ----------------------------------- |
| **1**       | `string[]` of registry ids (legacy) |
| **2**       | `NodePackRequirement[]` objects     |

Existing published v1 packages remain valid. A v2 pack entry:

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

`version` is “tested with.” Inspect prints `comfy node install <id>` (id only). It does not resolve ranges against the Registry. `repository` is never cloned.

Authors write Registry ids by hand. `cwf pack` warns (`W_PACK_UNRESOLVED_NODE_PACK`) when the graph uses classes outside the bundled core snapshot and `nodePacks` is empty. That stays a warning.

## How inspect works

```sh
cwf inspect . --url http://127.0.0.1:8188
cwf inspect . --url http://127.0.0.1:8188 --json
```

With `--url`, inspect diffs `requires.nodeClasses` against live `/object_info`. Missing classes print as `✗`. If the manifest declared packs, it prints:

```
comfy node install comfyui-videohelpersuite
```

`ready: true` in JSON means every required class is present on that instance. Declaring a pack is not readiness.

Without `--url`, inspect still lists classes and declared packs. It does not call the Registry API.

## After install

Restart Comfy. Recapture `/object_info` if you are authoring types, then `cwf codegen`. [Typed node codegen](/code/codegen).

Optional Comfy-native path after compile: `comfy node install-deps --workflow=out.api.json`. Declared `nodePacks` remain the primary shopping list because they are author intent.

## Models

`requires.models` is reported. There is no model downloader. [Models](/guide/models).

## JSON / agent mode

`cwf inspect` accepts `--json`.

There is no `@stepupgaming/comfy-workflows/deps` installer API. `cwf setup`, `cwf resolve-nodes`, and `cwf node-pack` were removed (`E_REMOVED_COMMAND`).
