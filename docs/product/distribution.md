# Package distribution

A workflow package is files:

- `package.json` with a `comfyWorkflow` pointer
- `comfy.workflow.json`
- `workflow.ir.json`

The **format** does not care which registry hosted the tarball. The **host** can be npm, GitHub Packages, a GitHub Release, or a path on disk.

## npm first

Core `@stepupgaming/comfy-workflows` is on npm (current: 0.2.12). First-party examples `@stepupgaming/comfy-workflow-t2i` and `@stepupgaming/comfy-workflow-hires` are on npm.

```sh
pnpm add @stepupgaming/comfy-workflows
pnpm add @stepupgaming/comfy-workflow-t2i
```

Publish a package whose **name already exists** with a normal `npm publish`. Creating a **new** name can hit npm's new-package rate limit (`E429`, "rate limited exceeded"). That is a host quota, not a Comfy Workflows architecture.

## Alternative hosts

While a new name cannot be created on npm, GitHub Packages or a Release tarball is a fine temporary host. Document the tarball. Do not teach consumers to rewrite `~/.npmrc` with:

```
@stepupgaming:registry=https://npm.pkg.github.com
```

That remaps the **entire scope**, including the core SDK, and then `pnpm add @stepupgaming/comfy-workflows` 404s on GitHub (or pulls the wrong thing).

Safer:

```sh
pnpm add @stepupgaming/comfy-workflows
npm pack @you/some-workflow@1.0.0 --registry=https://npm.pkg.github.com
pnpm add ./you-some-workflow-1.0.0.tgz
```

GitHub Packages reads usually need a `read:packages` token at pack/install time. Do not commit it.

## Resolver

`cwf inspect` / `cwf run <package>` resolve npm names through Node's ordinary package lookup, or a path. They never execute package JS.
