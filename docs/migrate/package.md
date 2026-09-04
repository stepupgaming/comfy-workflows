# Package and publish

## Validate

```sh
cwf pack
cwf pack --json
```

`pack` checks package metadata, manifest schema, entry resolution, IR parsing, parameter/output coherence, node-class agreement, embedded machine-local paths, and the no-JS-execution property. Unresolved classes stay warnings. `--publish` still fails contradictory pack metadata.

## Inspect as a consumer would

```sh
cwf inspect . --url http://127.0.0.1:8188
cwf inspect @stepupgaming/comfy-workflow-t2i
```

Inspect reads `package.json` + `comfy.workflow.json` + `workflow.ir.json`. Package JavaScript is never imported. That is regression-tested with a fixture whose entry throws on load.

## Run

```sh
cwf run . --url http://127.0.0.1:8188 --param prompt="a lighthouse" --param seed=42
cwf run @stepupgaming/comfy-workflow-t2i --url http://127.0.0.1:8188 \
  --param checkpoint=v1-5-pruned-emaonly.safetensors \
  --param prompt="a lighthouse at dusk" --param seed=42
```

If inspect reported missing custom nodes, run `cwf setup` first. `cwf run` will not install them.

## Publish

The **format** is host-agnostic. The **host** can be npm, GitHub Packages, a GitHub Release tarball, or a local path.

Prefer npm when the name already exists or when new-package creation is allowed:

```sh
npm publish --access public
```

Do not remap all of `@stepupgaming` to GitHub Packages. That would also pull the core SDK from the wrong registry. Safer: install core from npm, then add a GitHub Packages workflow as a tarball. [Distribution](/product/distribution).

## First-party packages on npm

| Package | What it is |
| ------- | ---------- |
| `@stepupgaming/comfy-workflow-t2i` | Baseline text-to-image |
| `@stepupgaming/comfy-workflow-hires` | T2I plus a latent hires pass |

Both declare `peerDependencies["@stepupgaming/comfy-workflows"]` as `^0.2.0`. During 0.x, `^0.2.0` accepts 0.2.12 and rejects 0.3.0.

The repo-only helper `pnpm build:packages` regenerates those two. That is not the public authoring path. Public authors use `cwf init` / `cwf pack`.
