# Package distribution

A workflow package is files:

- `package.json` with a `comfyWorkflow` pointer
- `comfy.workflow.json`
- `workflow.ir.json`

The **format** does not care which registry hosted the tarball. The **host** is distribution metadata, not workflow semantics.

Releasing Comfy Workflows does not depend on any single external package registry.

## Canonical host

GitHub is the release authority.

```
package source
     ↓
validated artifact
     ↓
GitHub Release / tag
     ↓
GitHub Packages          ← authenticated npm-compatible registry
     ↓
GitHub Release .tgz      ← public / anonymous artifact
     ↓
release COMPLETE
```

Then, independently:

```
optional npmjs mirror
     ↓
mirrored  |  deferred  |  not-requested
```

A failed, rate-limited, or delayed npm publish does **not** make a GitHub release incomplete.

## Three consumer paths

### 1. Convenience install (npmjs mirror)

When the package name already exists on npmjs, this is the shortest public command:

```sh
pnpm add @stepupgaming/comfy-workflows
```

That is a **mirror**. The source of truth is the GitHub release of the same version.

### 2. Authenticated GitHub Packages

GitHub currently requires authentication to install from `npm.pkg.github.com`, including public packages. Use a **project-local** `.npmrc`, not a global `~/.npmrc`, unless you explicitly want the whole machine remapped.

Token permission for install: `read:packages`. Never commit the token.

::: code-group

```powershell [PowerShell]
$env:GITHUB_PACKAGES_TOKEN = "ghp_…"   # PAT with read:packages
@'
@stepupgaming:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}
'@ | Set-Content -Encoding utf8 .npmrc
pnpm add @stepupgaming/comfy-workflows
pnpm add @stepupgaming/comfy-workflow-t2i
Remove-Item Env:GITHUB_PACKAGES_TOKEN
```

```sh [shell]
export GITHUB_PACKAGES_TOKEN=ghp_…   # PAT with read:packages
cat > .npmrc <<'EOF'
@stepupgaming:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}
EOF
pnpm add @stepupgaming/comfy-workflows
pnpm add @stepupgaming/comfy-workflow-t2i
unset GITHUB_PACKAGES_TOKEN
```

:::

A scope mapping applies to the **entire** `@stepupgaming` scope. That is now a valid authenticated path because core and first-party workflow packages are all on GitHub Packages. Keep it project-local so unrelated `@stepupgaming` names on npmjs are not stolen.

Do not paste a permanent secret into a source-controlled `.npmrc`. Prefer `${GITHUB_PACKAGES_TOKEN}` / `${GITHUB_TOKEN}` interpolation.

### 3. Anonymous GitHub Release tarball

No npmjs. No GitHub Packages PAT.

Download the exact `.tgz` from the [GitHub Release](https://github.com/stepupgaming/comfy-workflows/releases) and install it:

```sh
pnpm add ./stepupgaming-comfy-workflows-<version>.tgz
pnpm add ./stepupgaming-comfy-workflow-t2i-0.2.0.tgz
```

Tarball names are deterministic: `{owner}-{unscoped-name}-{version}.tgz`.

This is the public path when you do not want to authenticate to GitHub Packages.

## npmjs is a mirror

Existing names may be mirrored after a GitHub release. New names are **not** created automatically. If npm returns `E429`, auth failure, or an outage, the mirror is recorded as `deferred` and the GitHub release stays complete.

Do not bump versions to work around npm infrastructure.

## Resolver

`cwf inspect` / `cwf run <package>` resolve npm names through Node's ordinary package lookup, or a path, or an already-installed tarball. They never execute package JavaScript. They never call the GitHub API.

## Package index

Generated from repository metadata: [First-party packages](/product/packages).
