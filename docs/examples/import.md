# Example: import existing workflow

Fixture: [`fixtures/workflows/t2i.api.json`](https://github.com/stepupgaming/comfy-workflows/blob/main/fixtures/workflows/t2i.api.json) (API form). `t2i.ui.json` and `t2i.ui.v1.json` are the editor / v1 shapes of the same graph.

```sh
pnpm add @stepupgaming/comfy-workflows
cwf init packaged-demo --from fixtures/workflows/t2i.api.json
cd packaged-demo
cwf suggest .
cwf pack
cwf inspect . --json
```

[Import tutorial](/migrate/import)
