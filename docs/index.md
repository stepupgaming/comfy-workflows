---
layout: home

hero:
  name: Comfy Workflows
  text: Code-first, typed, composable workflows for ComfyUI
  tagline: Author in TypeScript, share as npm packages, compile deterministically, run on any ComfyUI instance. Unofficial project — not affiliated with or endorsed by Comfy Org.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Package an existing workflow
      link: /guide/convert-workflow
    - theme: alt
      text: Workflow packages
      link: /guide/packages

features:
  - title: Import existing workflows
    details: Editor, API, and frontend JSON all import into Graph IR — ids, titles, and modes preserved. cwf init turns a working workflow.json into a publishable workflow package.
    link: /guide/convert-workflow
    linkText: Package an existing workflow
  - title: Author typed workflows
    details: Generated, fully typed wrappers for every node in your defs snapshot. g.add(spec, params) is type-checked end to end, with rawNode() and unsafe() escape hatches.
    link: /guide/authoring
    linkText: Authoring guide
  - title: Compose reusable packages
    details: Workflow packages ship canonical IR plus a typed wrapper. Compose a packaged template with hiresFix or withLora — one valid IR, deterministic compile, Comfy execution.
    link: /guide/packages
    linkText: Packages guide
  - title: Publish & inspect as packages
    details: Versioned comfy.workflow.json manifests make workflows inspectable without executing code. Host-agnostic (npm, GitHub, or a local tarball). cwf pack validates before you publish. cwf setup prepares verified Registry packs after explicit approval — run never installs them.
    link: /guide/custom-nodes
    linkText: Custom-node dependencies
  - title: Compile deterministically
    details: compile(graph, defs) produces validated, byte-identical API JSON for identical graphs — stable ids, sorted emit, conservative bypass lowering, structured errors.
    link: /guide/compile-and-validate
    linkText: Compile & validate
  - title: Execute on ComfyUI
    details: HTTP+WS execution against local or remote Comfy, asset staging, artifact download, replayable run.json — plus an agent-friendly CLI with machine-readable errors.
    link: /guide/runtime
    linkText: Runtime guide

---

<div class="layer-strip" aria-label="Comfy Workflows layer hierarchy: packages → recipes → typed node SDK → Graph IR → compiler → runtime">
  <svg viewBox="0 0 960 88" xmlns="http://www.w3.org/2000/svg" role="img">
    <g font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="14" text-anchor="middle">
      <line x1="140" y1="30" x2="180" y2="30" stroke="var(--vp-c-divider)" stroke-width="2"/>
      <line x1="300" y1="30" x2="340" y2="30" stroke="var(--vp-c-divider)" stroke-width="2"/>
      <line x1="460" y1="30" x2="500" y2="30" stroke="var(--vp-c-divider)" stroke-width="2"/>
      <line x1="620" y1="30" x2="660" y2="30" stroke="var(--vp-c-divider)" stroke-width="2"/>
      <line x1="780" y1="30" x2="820" y2="30" stroke="var(--vp-c-divider)" stroke-width="2"/>
      <circle cx="90" cy="30" r="7" fill="#3ecf8e"/>
      <text x="90" y="66" font-weight="600" fill="var(--vp-c-text-1)">Packages</text>
      <circle cx="240" cy="30" r="7" fill="#e6c07b"/>
      <text x="240" y="66" font-weight="600" fill="var(--vp-c-text-1)">Recipes</text>
      <circle cx="400" cy="30" r="7" fill="#8ea6f0"/>
      <text x="400" y="66" font-weight="600" fill="var(--vp-c-text-1)">Typed SDK</text>
      <circle cx="560" cy="30" r="7" fill="#b18ef0"/>
      <text x="560" y="66" font-weight="600" fill="var(--vp-c-text-1)">Graph IR</text>
      <circle cx="720" cy="30" r="7" fill="#64b5f6"/>
      <text x="720" y="66" font-weight="600" fill="var(--vp-c-text-1)">Compiler</text>
      <circle cx="870" cy="30" r="7" fill="#ef8f7a"/>
      <text x="870" y="66" font-weight="600" fill="var(--vp-c-text-1)">Runtime</text>
    </g>
  </svg>
  <p class="layer-strip-caption">work at the highest level that works · drop down when needed</p>
</div>
