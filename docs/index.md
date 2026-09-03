---
layout: home

hero:
  name: comfy-sdk
  text: TypeScript-first workflows for ComfyUI
  tagline: Typed nodes, Graph IR as the source of truth, deterministic compile, lossless integers — ComfyUI as an execution backend, never a hand-edited JSON format.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: CLI reference
      link: /guide/cli
    - theme: alt
      text: Why comfy-sdk?
      link: /guide/

features:
  - title: Recipes
    details: High-level operations — textToImage, img2img, inpaint, outpaint, withLora, withControlNet, hiresFix, upscale — that expand into full node graphs. One call instead of hand-wiring.
    link: /reference/recipes
    linkText: Recipe reference
  - title: Typed node SDK
    details: Generated, fully typed wrappers for every node in your defs snapshot. g.add(spec, params) is type-checked end to end, with rawNode() and unsafe() escape hatches when you need them.
    link: /guide/authoring
    linkText: Authoring guide
  - title: Graph IR
    details: "The canonical semantic representation. Plain JSON, index-canonical slot refs, lossless {\"$int\": \"...\"} integers, template params, graphHash."
    link: /reference/architecture
    linkText: IR invariants
  - title: Import existing workflows
    details: Editor v0.4, workflow v1, and API JSON all import into IR — ids, titles, and modes preserved — with optional TypeScript emission so legacy graphs become editable code.
    link: /guide/getting-started#importing-existing-workflows
    linkText: Import guide
  - title: Deterministic compile
    details: compile(graph, defs) produces validated, byte-identical API JSON for identical graphs — stable ids, sorted emit, conservative bypass lowering, structured errors.
    link: /guide/compile-and-validate
    linkText: Compile & validate
  - title: Runtime & CLI
    details: HTTP+WS execution against local or remote Comfy, asset staging, artifact download, replayable run.json — plus an agent-friendly CLI whose every error is machine-readable JSON.
    link: /guide/runtime
    linkText: Runtime guide

---

<div class="layer-strip" aria-label="comfy-sdk layer hierarchy: Recipes → Typed node SDK → Graph IR → Comfy compiler → Comfy runtime">
  <svg viewBox="0 0 960 88" xmlns="http://www.w3.org/2000/svg" role="img">
    <g font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="15" text-anchor="middle">
      <line x1="156" y1="30" x2="212" y2="30" stroke="var(--vp-c-divider)" stroke-width="2"/>
      <line x1="348" y1="30" x2="404" y2="30" stroke="var(--vp-c-divider)" stroke-width="2"/>
      <line x1="540" y1="30" x2="596" y2="30" stroke="var(--vp-c-divider)" stroke-width="2"/>
      <line x1="732" y1="30" x2="788" y2="30" stroke="var(--vp-c-divider)" stroke-width="2"/>
      <circle cx="96" cy="30" r="7" fill="#3ecf8e"/>
      <text x="96" y="66" font-weight="600" fill="var(--vp-c-text-1)">Recipes</text>
      <circle cx="288" cy="30" r="7" fill="#e6c07b"/>
      <text x="288" y="66" font-weight="600" fill="var(--vp-c-text-1)">Typed node SDK</text>
      <circle cx="480" cy="30" r="7" fill="#8ea6f0"/>
      <text x="480" y="66" font-weight="600" fill="var(--vp-c-text-1)">Graph IR</text>
      <circle cx="672" cy="30" r="7" fill="#b18ef0"/>
      <text x="672" y="66" font-weight="600" fill="var(--vp-c-text-1)">Comfy compiler</text>
      <circle cx="864" cy="30" r="7" fill="#64b5f6"/>
      <text x="864" y="66" font-weight="600" fill="var(--vp-c-text-1)">Comfy runtime</text>
    </g>
  </svg>
  <p class="layer-strip-caption">work at the highest level that works · drop down when needed</p>
</div>

