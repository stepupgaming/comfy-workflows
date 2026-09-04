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

The **format** is host-agnostic. Cut a **GitHub release**. That is the completion gate.

1. Pack the exact `.tgz` (`npm pack`).
2. Publish that tarball to GitHub Packages.
3. Attach the same tarball to the GitHub Release.
4. Optionally mirror the same tarball to npmjs.

Do not put `"publishConfig": { "registry": "https://npm.pkg.github.com" }` in `package.json`. Configure the registry at publish time so the same package remains mirrorable.

npmjs is optional. A new package name does not need npm to exist.

Authenticated consumers can map `@stepupgaming` **project-locally** to GitHub Packages. That mapping covers the whole scope — including core — which is intended once core lives on GitHub Packages. Do not set it globally unless you want that on every project. Anonymous consumers use the Release `.tgz`. [Distribution](/product/distribution).

## First-party packages

| Package | What it is |
| ------- | ---------- |
| `@stepupgaming/comfy-workflow-t2i` | Baseline text-to-image |
| `@stepupgaming/comfy-workflow-hires` | T2I plus a latent hires pass |

Both declare `peerDependencies["@stepupgaming/comfy-workflows"]` as `^0.2.0`. During 0.x, `^0.2.0` accepts 0.2.13 and rejects 0.3.0.

The repo-only helper `pnpm build:packages` regenerates those two. That is not the public authoring path. Public authors use `cwf init` / `cwf pack`.

Index: [First-party packages](/product/packages).
