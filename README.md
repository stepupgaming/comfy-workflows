# Comfy Workflows

**Code-first, typed, composable workflows for ComfyUI.**

Author graphs in TypeScript, or import JSON you already have. Graph IR is the stored semantic form. Comfy API JSON is a compile artifact. ComfyUI executes.

> Unofficial project. Not affiliated with or endorsed by Comfy Org.

Docs: https://stepupgaming.github.io/comfy-workflows/

```ts
import { workflow } from "@stepupgaming/comfy-workflows";
import { conditioning, image, latent, loaders, sampling } from "@stepupgaming/comfy-workflows/nodes";

const g = workflow("t2i");
const ckpt = g.add(loaders.CheckpointLoaderSimple, {
  ckpt_name: "v1-5-pruned-emaonly.safetensors",
});
const pos = g.add(conditioning.CLIPTextEncode, { text: "a red cube", clip: ckpt.CLIP });
const lat = g.add(latent.EmptyLatentImage, { width: 512, height: 512, batch_size: 1 });
const ks = g.add(sampling.KSampler, {
  model: ckpt.MODEL,
  positive: pos.CONDITIONING,
  negative: pos.CONDITIONING,
  latent_image: lat.LATENT,
  seed: 42n,
  steps: 20,
  cfg: 7,
  sampler_name: "euler",
  scheduler: "normal",
  denoise: 1,
});
const dec = g.add(latent.VAEDecode, { samples: ks.LATENT, vae: ckpt.VAE });
g.add(image.SaveImage, { images: dec.IMAGE, filename_prefix: "t2i" });
```

## Install

```sh
pnpm add @stepupgaming/comfy-workflows
# or: npm install @stepupgaming/comfy-workflows
```

Node.js ≥ 22. The `cwf` CLI ships in the same package.

## Start here

| You have | Go |
| -------- | -- |
| A blank project | [Code-first quickstart](https://stepupgaming.github.io/comfy-workflows/code/quickstart) |
| Existing `workflow.json` | [Convert a workflow](https://stepupgaming.github.io/comfy-workflows/migrate/import) |
| A product that talks to Comfy | [Product integration](https://stepupgaming.github.io/comfy-workflows/product/architecture) |
| Custom nodes | [Codegen](https://stepupgaming.github.io/comfy-workflows/code/codegen) · [Setup](https://stepupgaming.github.io/comfy-workflows/guide/custom-nodes) |
| API / CLI | [Reference](https://stepupgaming.github.io/comfy-workflows/reference/api/) |

## Guarantees

- **Deterministic compile.** Same graph + defs → byte-identical API JSON.
- **Lossless integers.** Seeds are `bigint`; IR uses `{"$int":"..."}`; `/prompt` gets a raw numeric literal.
- **Slot identity is `{nodeId, outputIndex}`.** Names are handle sugar.
- **Packages are data.** `cwf inspect` / `cwf run <package>` never execute package JavaScript.
- **`inspect` / `init` / `run` never install Python.** Only explicit `cwf setup` does, after you approve the plan.
- **TypeScript is what you edit.** `workflow.ir.json` and API JSON are generated. [What do I edit?](https://stepupgaming.github.io/comfy-workflows/start/what-do-i-edit)

## Runtime architecture

A Node app can `compile` + `createClient().run()` in process.

A Rust/Python/Go app should keep TypeScript at **build time**, ship generated IR / prompt templates, and bind `{$param}` values at runtime. Do not write a second Graph IR compiler. Details: [Build-time vs runtime](https://stepupgaming.github.io/comfy-workflows/product/build-time-vs-runtime).

## Status

Core `@stepupgaming/comfy-workflows` **0.2.12** is on npm. First-party examples `@stepupgaming/comfy-workflow-t2i` and `…-hires` are on npm. Workflow **format** is host-agnostic (npm, GitHub Packages, tarball).

Roadmap: [docs](https://stepupgaming.github.io/comfy-workflows/project/roadmap). Design: [ARCHITECTURE.md](./ARCHITECTURE.md).

## Development

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
pnpm docs:check
```

Live integration tests run only when `COMFY_URL` points at a running ComfyUI.

## License

MIT. See [LICENSE](./LICENSE).
