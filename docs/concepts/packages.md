# Packages

A workflow package is an npm-shaped directory whose **payload** is Graph IR.

```
package.json            # comfyWorkflow pointer, keywords
comfy.workflow.json     # manifest
workflow.ir.json        # canonical IR
README.md
ir.build.ts             # optional authoring source (build-time)
workflow.ts             # optional convenience
dist/                   # optional typed wrapper; never required to inspect
```

Inspect reads the three JSON files. It does not execute `ir.build.ts` or `dist/`.

Package **format** vs package **host**: npm, GitHub Packages, Release tarball, local path. The resolver should not care.

[Package guide](/migrate/package) · [Manifest](/reference/manifest) · [Distribution](/product/distribution)
