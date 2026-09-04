# Installation

## Prerequisites

- Node.js ≥ 22
- npm, pnpm, or yarn
- A ComfyUI instance you can reach (the docs use `http://127.0.0.1:8188`)

You do not need Comfy running to **author** or **compile** against a saved snapshot. You need it to snapshot, lock, run, and `setup`.

## Install the core

GitHub is the canonical host. npmjs is a convenience mirror of the same package.

### Convenience (npmjs mirror)

::: code-group

```sh [pnpm]
pnpm add @stepupgaming/comfy-workflows
```

```sh [npm]
npm install @stepupgaming/comfy-workflows
```

:::

That package is the SDK **and** the `cwf` CLI (`comfy-workflows` is the same binary).

```sh
npx cwf --help
```

Using a coding agent?

```sh
cwf agent install
```

That copies the version-matched skill from the installed package into `.agents/skills/comfy-workflows/` so compatible agents can discover it without searching `node_modules` or scraping the docs site. Rerun after upgrading the core. Details: [Coding agents](/guide/agents).

### Authenticated GitHub Packages

GitHub Packages installs require a token with `read:packages`. Keep the mapping **project-local**.

::: code-group

```powershell [PowerShell]
$env:GITHUB_PACKAGES_TOKEN = "ghp_…"
@'
@stepupgaming:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}
'@ | Set-Content -Encoding utf8 .npmrc
pnpm add @stepupgaming/comfy-workflows
Remove-Item Env:GITHUB_PACKAGES_TOKEN
```

```sh [shell]
export GITHUB_PACKAGES_TOKEN=ghp_…
cat > .npmrc <<'EOF'
@stepupgaming:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}
EOF
pnpm add @stepupgaming/comfy-workflows
unset GITHUB_PACKAGES_TOKEN
```

:::

### Anonymous Release tarball

Download `stepupgaming-comfy-workflows-<version>.tgz` from the [GitHub Release](https://github.com/stepupgaming/comfy-workflows/releases) and:

```sh
pnpm add ./stepupgaming-comfy-workflows-<version>.tgz
```

No npmjs. No GitHub Packages PAT. Details: [Distribution](/product/distribution).

## Windows notes

PowerShell and Git Bash both work. Quote paths that contain spaces:

::: code-group

```powershell [PowerShell]
cwf setup .\my-workflow --comfy "C:\Program Files\ComfyUI"
```

```sh [shell]
cwf setup ./my-workflow --comfy "/c/Program Files/ComfyUI"
```

:::

Portable Windows Comfy uses `python_embeded\python.exe`. `cwf setup --comfy` looks there. Do not assume WSL. Details: [Windows](/guide/windows).

## First-party workflow packages

Same three hosts. Convenience mirror:

```sh
pnpm add @stepupgaming/comfy-workflow-t2i
pnpm add @stepupgaming/comfy-workflow-hires
```

Or install the Release `.tgz`. Or install from GitHub Packages with the project-local scope mapping above.

Index: [First-party packages](/product/packages).

## Next

- [5-minute quickstart](/start/quickstart)
- [Code-first](/code/quickstart)
- [Convert JSON](/migrate/import)
