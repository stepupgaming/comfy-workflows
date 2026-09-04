---
layout: home

hero:
  name: Comfy Workflows
  text: Code-first, typed, composable workflows for ComfyUI
  tagline: Stop hand-editing workflow JSON. Import an existing graph or author one in TypeScript, compile it deterministically, package it, and run it anywhere Comfy runs.
  actions:
    - theme: brand
      text: Build a workflow as code
      link: /code/quickstart
    - theme: alt
      text: Convert an existing workflow
      link: /migrate/import
    - theme: alt
      text: Product integration
      link: /product/architecture
    - theme: alt
      text: GitHub
      link: https://github.com/stepupgaming/comfy-workflows

features:
  - title: Import what you already have
    details: Editor v0.4, workflow v1, and API/prompt JSON import into Graph IR. Node ids, titles, modes, and integers past 2^53 survive.
    link: /migrate/import
    linkText: Convert a workflow
  - title: Author in TypeScript
    details: Snapshot /object_info, generate typed node wrappers, then g.add(spec, params). Illegal wiring fails in the type checker, not in the queue.
    link: /code/quickstart
    linkText: Code-first quickstart
  - title: Ship as packages
    details: A workflow package is manifest + IR. Inspect and run never execute package JavaScript. Host can be npm, GitHub Packages, or a tarball.
    link: /migrate/package
    linkText: Packages
  - title: Custom nodes, on purpose
    details: Codegen wraps the nodes your Comfy actually has. Setup installs verified Registry packs only after you approve the plan. run never installs Python.
    link: /guide/custom-nodes
    linkText: Custom-node guide
  - title: Use it inside a product
    details: TypeScript at build time. Generated IR at runtime. A Rust or Python app binds parameters and posts to Comfy. Node is not required as a production daemon.
    link: /product/build-time-vs-runtime
    linkText: Build-time vs runtime
  - title: Deterministic compile
    details: Same graph + same defs → byte-identical API JSON. Environment lock reports drift. Seeds are bigint end to end.
    link: /concepts/determinism
    linkText: Determinism
---

<div class="home-code">
<p class="home-code-label">Typed composition, not pseudo-code</p>
</div>

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

<div class="layer-strip" aria-label="TypeScript to Graph IR to Comfy">
  <svg viewBox="0 0 960 88" xmlns="http://www.w3.org/2000/svg" role="img">
    <g font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="14" text-anchor="middle">
      <line x1="200" y1="30" x2="280" y2="30" stroke="var(--vp-c-divider)" stroke-width="2"/>
      <line x1="440" y1="30" x2="520" y2="30" stroke="var(--vp-c-divider)" stroke-width="2"/>
      <line x1="680" y1="30" x2="760" y2="30" stroke="var(--vp-c-divider)" stroke-width="2"/>
      <circle cx="120" cy="30" r="7" fill="#3ecf8e"/>
      <text x="120" y="66" font-weight="600" fill="var(--vp-c-text-1)">TypeScript</text>
      <circle cx="360" cy="30" r="7" fill="#b18ef0"/>
      <text x="360" y="66" font-weight="600" fill="var(--vp-c-text-1)">Graph IR</text>
      <circle cx="600" cy="30" r="7" fill="#64b5f6"/>
      <text x="600" y="66" font-weight="600" fill="var(--vp-c-text-1)">Compiler</text>
      <circle cx="840" cy="30" r="7" fill="#ef8f7a"/>
      <text x="840" y="66" font-weight="600" fill="var(--vp-c-text-1)">Comfy</text>
    </g>
  </svg>
  <p class="layer-strip-caption">TypeScript is what you edit · Graph IR is the semantic document · Comfy JSON is a build artifact</p>
</div>
