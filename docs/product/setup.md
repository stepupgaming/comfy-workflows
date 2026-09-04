# Custom-node setup

```
workflow requires class
        ↓
 class resolution
        ↓
 verified Registry pack + version
        ↓
 setup plan
        ↓
 explicit approval
        ↓
 Manager install
        ↓
 restart Comfy
        ↓
 /object_info verification
```

```sh
cwf setup @alice/some-workflow --comfy C:\ComfyUI --dry-run
cwf setup @alice/some-workflow --comfy C:\ComfyUI
```

Default prompt is `Continue? [y/N]`. `--yes` approves this **verified** plan. It does not install UNKNOWN / AMBIGUOUS / manual-source packs.

## Security invariant

**`inspect`, `init`, and `run` never install executable Python.** Only explicit setup does.

Full page: [Custom-node dependencies](/guide/custom-nodes).
