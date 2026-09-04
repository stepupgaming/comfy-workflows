# Example: package and run

```sh
pnpm add @stepupgaming/comfy-workflow-t2i   # npmjs mirror, or install the Release .tgz
cwf inspect @stepupgaming/comfy-workflow-t2i --url http://127.0.0.1:8188
cwf run @stepupgaming/comfy-workflow-t2i --url http://127.0.0.1:8188 \
  --param checkpoint=v1-5-pruned-emaonly.safetensors \
  --param prompt="a lighthouse at dusk" --param seed=42
```

`inspect` / `run <package>` never execute package JavaScript.

Authoring your own: [Package and publish](/migrate/package)
