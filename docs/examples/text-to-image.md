# Example: text to image

Checked-in source: [`docs/examples-src/code-first.ts`](https://github.com/stepupgaming/comfy-workflows/blob/main/docs/examples-src/code-first.ts). Also `examples/t2i/workflow.ts` in the repo (adds a LoRA).

<<< @/examples-src/code-first.ts

```sh
cwf compile docs/examples-src/code-first.ts -o dist/t2i.api.json
cwf run docs/examples-src/code-first.ts --url http://127.0.0.1:8188 --out out/
```

Needs a checkpoint named `v1-5-pruned-emaonly.safetensors` on the server (or change the string). The graph still typechecks and compiles without that file.

Recipe form: [Composition](/examples/composition).
