# Windows

Windows is first-class. These docs do not assume WSL or Docker.

## Shells

PowerShell and Git Bash both work. Quote paths with spaces.

::: code-group

```powershell [PowerShell]
cwf snapshot --url http://127.0.0.1:8188 -o object_info.json
cwf inspect . --url http://127.0.0.1:8188
```

```sh [shell]
cwf snapshot --url http://127.0.0.1:8188 -o object_info.json
cwf inspect . --url http://127.0.0.1:8188
```

:::

## Portable Comfy

A portable tree looks like:

```
C:\ComfyUI\
  python_embeded\python.exe
  ComfyUI\main.py
  ComfyUI\custom_nodes\
```

or `main.py` next to `python_embeded`. Custom-node install is Comfy CLI / Manager (`comfy node install`), not this SDK.

## Node.js

Node ≥ 22. The `cwf` bin is `dist/cli/bin.js`. On Windows, `npx cwf` / `pnpm exec cwf` is more reliable than hoping `cwf` is on PATH after a local `pnpm add`.

## GitHub Packages (PowerShell)

GitHub Packages installs need a token with `read:packages`. Keep it out of source control.

```powershell
$env:GITHUB_PACKAGES_TOKEN = "ghp_…"   # PAT, read:packages
@'
@stepupgaming:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}
'@ | Set-Content -Encoding utf8 .npmrc
pnpm add @stepupgaming/comfy-workflows
Remove-Item Env:GITHUB_PACKAGES_TOKEN
```

To stop using the mapping, delete the project `.npmrc` (or those two lines). Do not put this in your user `~/.npmrc` unless you want every `@stepupgaming` package on this machine to resolve to GitHub Packages.

Anonymous alternative: download the Release `.tgz` and `pnpm add .\stepupgaming-comfy-workflows-<version>.tgz`. [Distribution](/product/distribution).
