import { writeFileSync, readFileSync, renameSync, unlinkSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  WORKFLOW_MANIFEST_FILENAME,
  serializeNodePacks,
  type WorkflowManifest,
} from "./manifest.js";

/**
 * Serialize a validated manifest for disk.
 * specVersion 1 writes string ids; specVersion 2 writes pack objects.
 */
export function stringifyManifest(manifest: WorkflowManifest): string {
  const body = {
    ...manifest,
    requires: {
      ...manifest.requires,
      nodePacks: serializeNodePacks(manifest.requires.nodePacks, manifest.specVersion),
    },
  };
  return JSON.stringify(body, null, 2) + "\n";
}

/**
 * Atomically replace comfy.workflow.json in a package directory.
 * Writes to a sibling temp file then renames. Restores the previous
 * contents if the rename fails after a partial write.
 */
export function writeManifestFile(dir: string, manifest: WorkflowManifest): string {
  const path = join(dir, WORKFLOW_MANIFEST_FILENAME);
  const text = stringifyManifest(manifest);
  const tmp = join(dirname(path), `.${WORKFLOW_MANIFEST_FILENAME}.${process.pid}.tmp`);
  const prev = existsSync(path) ? readFileSync(path, "utf8") : undefined;
  try {
    writeFileSync(tmp, text, "utf8");
    try {
      renameSync(tmp, path);
    } catch {
      // Windows cannot always rename-over; write then unlink tmp.
      writeFileSync(path, text, "utf8");
      try {
        unlinkSync(tmp);
      } catch {
        /* ignore */
      }
    }
  } catch (e) {
    if (prev !== undefined) {
      try {
        writeFileSync(path, prev, "utf8");
      } catch {
        /* ignore */
      }
    }
    try {
      unlinkSync(tmp);
    } catch {
      /* ignore */
    }
    throw e;
  }
  return path;
}
