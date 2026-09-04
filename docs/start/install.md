# Installation

## Prerequisites

- Node.js ≥ 22
- npm, pnpm, or yarn
- A ComfyUI instance you can reach (the docs use `http://127.0.0.1:8188`)

You do not need Comfy running to **author** or **compile** against a saved snapshot. You need it to snapshot, lock, run, and `setup`.

## Install the core

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

These are already on npm:

```sh
pnpm add @stepupgaming/comfy-workflow-t2i
pnpm add @stepupgaming/comfy-workflow-hires
```

Other workflow packages may live on GitHub Packages or a tarball while new npm names are rate-limited. That is a **host** detail. The package **format** does not care. Do not remap the entire `@stepupgaming` scope to GitHub Packages: that would also send the core package to the wrong registry. [Distribution](/product/distribution).

## Next

- [5-minute quickstart](/start/quickstart)
- [Code-first](/code/quickstart)
- [Convert JSON](/migrate/import)
