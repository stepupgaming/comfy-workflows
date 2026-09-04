# Custom nodes on an imported workflow

Unknown classes do not fail import. They become `rawNode` with the original JSON preserved. That is enough to round-trip. It is not enough to type-check or to install the Python.

## 1. See what the live instance has

```sh
cwf inspect . --url http://127.0.0.1:8188
```

Missing classes print as `✗`. Inspect never installs them.

## 2. Map classes to Registry packs

```sh
cwf resolve-nodes . --url http://127.0.0.1:8188
cwf resolve-nodes . --url http://127.0.0.1:8188 --write
```

`--write` merges **verified** packs into `comfy.workflow.json` as specVersion 2. Ambiguous verified owners exit with `E_NODE_PACK_AMBIGUOUS`. Unknown classes report `E_NODE_PACK_UNKNOWN`. A publisher `source: "registry"` claim is not proof.

If the Registry cannot identify an owner:

```sh
cwf node-pack add comfyui-videohelpersuite --provides VHS_LoadVideo,VHS_VideoCombine
```

Manual entries are `source: "manual"` and are **not** auto-installed by `cwf setup`.

## 3. Install only through setup

```sh
cwf setup . --comfy C:\ComfyUI --dry-run
cwf setup . --comfy C:\ComfyUI
```

Default confirmation is No. `--yes` approves this verified plan. It does not relax source policy.

`inspect`, `init`, and `run` never install executable Python.

Full contract: [Custom-node dependencies](/guide/custom-nodes).
