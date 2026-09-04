/**
 * Locate a local ComfyUI installation. Explicit `--comfy` always wins.
 * Common layouts are detected when they are unambiguous; personal machine
 * paths are never hard-coded.
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export type ComfyLayout = "git" | "portable-windows" | "desktop" | "unknown";

export interface ComfyTarget {
  root: string;
  customNodesDir: string;
  layout: ComfyLayout;
  managerDir?: string;
  pythonCandidates: string[];
  /** True when this looks like a real Comfy tree we can install into. */
  writable: boolean;
}

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function isFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

function looksLikeComfyRoot(root: string): boolean {
  if (isFile(join(root, "main.py")) && isDir(join(root, "comfy"))) return true;
  if (isDir(join(root, "ComfyUI")) && isFile(join(root, "ComfyUI", "main.py"))) return true;
  if (isFile(join(root, "ComfyUI", "main.py")) && isDir(join(root, "python_embeded"))) return true;
  return false;
}

function layoutOf(root: string): ComfyLayout {
  if (
    isDir(join(root, "python_embeded")) ||
    isFile(join(root, "run_nvidia_gpu.bat")) ||
    isDir(join(dirname(root), "python_embeded"))
  ) {
    return "portable-windows";
  }
  if (isFile(join(root, "main.py"))) return "git";
  return "unknown";
}

function resolveRoot(input: string): string {
  const abs = resolve(input);
  if (isFile(join(abs, "main.py"))) return abs;
  const inner = join(abs, "ComfyUI");
  if (isFile(join(inner, "main.py"))) return inner;
  return abs;
}

function pythonCandidates(root: string): string[] {
  const out: string[] = [];
  const candidates = [
    join(dirname(root), "python_embeded", "python.exe"),
    join(root, "python_embeded", "python.exe"),
    join(root, "venv", "Scripts", "python.exe"),
    join(root, "venv", "bin", "python"),
    join(root, ".venv", "Scripts", "python.exe"),
    join(root, ".venv", "bin", "python"),
  ];
  for (const p of candidates) {
    if (isFile(p)) out.push(p);
  }
  return out;
}

function findManager(customNodes: string): string | undefined {
  if (!isDir(customNodes)) return undefined;
  const names = ["ComfyUI-Manager", "comfyui-manager", "comfyui_manager"];
  for (const n of names) {
    const p = join(customNodes, n);
    if (isFile(join(p, "cm-cli.py"))) return p;
  }
  try {
    for (const ent of readdirSync(customNodes, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue;
      const p = join(customNodes, ent.name);
      if (isFile(join(p, "cm-cli.py"))) return p;
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

export function inspectComfyTarget(comfyPath: string): ComfyTarget {
  const root = resolveRoot(comfyPath);
  const layout = layoutOf(root);
  const customNodesDir = join(root, "custom_nodes");
  const managerDir = findManager(customNodesDir);
  return {
    root,
    customNodesDir,
    layout,
    managerDir,
    pythonCandidates: pythonCandidates(root),
    writable: isDir(root),
  };
}

/**
 * Detect a Comfy tree from the environment without guessing a developer's
 * personal path. Order: COMFYUI_PATH, then cwd if it already is a Comfy root.
 */
export function detectComfyTarget(): ComfyTarget | undefined {
  const env = process.env["COMFYUI_PATH"];
  if (typeof env === "string" && env.length > 0) return inspectComfyTarget(env);
  const cwd = process.cwd();
  if (looksLikeComfyRoot(cwd)) return inspectComfyTarget(cwd);
  return undefined;
}

export function existsPath(p: string): boolean {
  return existsSync(p);
}
