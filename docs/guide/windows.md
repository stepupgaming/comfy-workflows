# Windows

Windows is first-class. These docs do not assume WSL or Docker.

## Shells

PowerShell and Git Bash both work. Quote paths with spaces.

::: code-group

```powershell [PowerShell]
cwf snapshot --url http://127.0.0.1:8188 -o object_info.json
cwf setup . --comfy "C:\ComfyUI"
cwf setup . --comfy "C:\Program Files\ComfyUI"
```

```sh [shell]
cwf snapshot --url http://127.0.0.1:8188 -o object_info.json
cwf setup . --comfy /c/ComfyUI
cwf setup . --comfy "/c/Program Files/ComfyUI"
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

or `main.py` next to `python_embeded`. `cwf setup --comfy` uses `python_embeded\python.exe` when present. If Python cannot be established: `E_COMFY_PYTHON_UNKNOWN`.

## Node.js

Node ≥ 22. The `cwf` bin is `dist/cli/bin.js`. On Windows, `npx cwf` / `pnpm exec cwf` is more reliable than hoping `cwf` is on PATH after a local `pnpm add`.
