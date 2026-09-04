/**
 * Detect which custom-node packs a local Comfy installation already has.
 *
 * Version is read from pyproject.toml / `__init__.py` metadata when present;
 * otherwise status is `"unknown"` — never pretended to be compatible.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { versionSatisfies } from "./semver.js";
import type { ComfyTarget } from "./target.js";

export type InstalledVersionStatus = "compatible" | "incompatible" | "unknown" | "missing";

export interface InstalledPack {
  id: string;
  dirName: string;
  dir: string;
  version?: string;
  disabled: boolean;
}

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function readPyprojectNameVersion(dir: string): { id?: string; version?: string } {
  const file = join(dir, "pyproject.toml");
  if (!existsSync(file)) return {};
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return {};
  }
  const name = /^\s*name\s*=\s*"([^"]+)"/m.exec(text)?.[1];
  const version = /^\s*version\s*=\s*"([^"]+)"/m.exec(text)?.[1];
  return { id: name, version };
}

function normalizeId(raw: string): string {
  return raw.trim().toLowerCase().replace(/_/g, "-");
}

/**
 * Scan `custom_nodes` for installed packs. Disabled packs (`.disabled` suffix
 * or `.disabled` marker) are recorded but not treated as providing classes.
 */
export function listInstalledPacks(target: ComfyTarget): InstalledPack[] {
  if (!isDir(target.customNodesDir)) return [];
  const out: InstalledPack[] = [];
  let entries: string[] = [];
  try {
    entries = readdirSync(target.customNodesDir);
  } catch {
    return [];
  }
  for (const name of entries) {
    const dir = join(target.customNodesDir, name);
    if (!isDir(dir)) continue;
    if (name === "__pycache__") continue;
    const disabled = name.endsWith(".disabled") || existsSync(join(dir, ".disabled"));
    const meta = readPyprojectNameVersion(dir);
    const id = meta.id ?? name.replace(/\.disabled$/, "");
    out.push({
      id,
      dirName: name,
      dir,
      version: meta.version,
      disabled,
    });
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function findInstalledPack(
  installed: InstalledPack[],
  id: string,
): InstalledPack | undefined {
  const want = normalizeId(id);
  return installed.find((p) => !p.disabled && normalizeId(p.id) === want);
}

export function packVersionStatus(
  installed: InstalledPack | undefined,
  requestedRange?: string,
): InstalledVersionStatus {
  if (!installed || installed.disabled) return "missing";
  if (requestedRange === undefined || requestedRange === "" || requestedRange === "*") {
    return installed.version === undefined ? "unknown" : "compatible";
  }
  if (installed.version === undefined) return "unknown";
  const ok = versionSatisfies(installed.version, requestedRange);
  if (ok === undefined) return "unknown";
  return ok ? "compatible" : "incompatible";
}
