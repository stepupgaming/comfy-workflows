import { promises as fs } from "node:fs";
import path from "node:path";
import { hashObjectInfo } from "../defs/parse.js";

/**
 * comfy.lock.json — the environment lockfile.
 *
 * A workflow is only reproducible against the Comfy/node universe it was
 * compiled against. The lock records that universe: the ComfyUI version, the
 * canonical /object_info hash, and every installed node pack (version + git
 * commit where determinable). Compile/validate/run warn on drift.
 */

export interface NodePackInfo {
  version?: string;
  commit?: string;
}

export interface ComfyLock {
  format: "comfy-lock";
  version: 1;
  capturedAt: string;
  comfyuiVersion?: string;
  objectInfoHash: string;
  nodePacks: Record<string, NodePackInfo>;
}

export const LOCK_FILENAME = "comfy.lock.json";

export async function captureLock(opts: {
  objectInfo: Record<string, unknown>;
  systemStats?: Record<string, unknown>;
  /** e.g. ComfyUI-Manager's /customnode/getlist (optional). */
  nodePacks?: Record<string, NodePackInfo>;
}): Promise<ComfyLock> {
  const comfyuiVersion = readComfyVersion(opts.systemStats);
  return {
    format: "comfy-lock",
    version: 1,
    capturedAt: new Date().toISOString(),
    ...(comfyuiVersion !== undefined ? { comfyuiVersion } : {}),
    objectInfoHash: hashObjectInfo(opts.objectInfo),
    nodePacks: opts.nodePacks ?? {},
  };
}

function readComfyVersion(systemStats?: Record<string, unknown>): string | undefined {
  const system = systemStats?.["system"] as
    { comfyui_version?: string; python_version?: string } | undefined;
  return system?.comfyui_version;
}

export async function readLock(dir: string): Promise<ComfyLock | undefined> {
  return readLockAt(path.join(dir, LOCK_FILENAME));
}

/** Read a lockfile from an exact path (any filename). */
export async function readLockAt(filePath: string): Promise<ComfyLock | undefined> {
  try {
    const text = await fs.readFile(filePath, "utf8");
    const json = JSON.parse(text) as ComfyLock;
    if (json.format === "comfy-lock") return json;
    return undefined;
  } catch {
    return undefined;
  }
}

export async function writeLock(dir: string, lock: ComfyLock): Promise<void> {
  await fs.writeFile(path.join(dir, LOCK_FILENAME), JSON.stringify(lock, null, 2) + "\n", "utf8");
}

/** Human-readable drift summary between the live environment and a lock. */
export function lockDrift(lock: ComfyLock, currentObjectInfoHash: string): string | undefined {
  if (lock.objectInfoHash === currentObjectInfoHash) return undefined;
  return (
    `Environment drift: compiled/locked against objectInfoHash ${lock.objectInfoHash.slice(0, 12)}… ` +
    `but the current instance reports ${currentObjectInfoHash.slice(0, 12)}… ` +
    "(custom nodes may have been added, updated, or removed)"
  );
}
