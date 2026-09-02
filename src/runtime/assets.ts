import { promises as fs } from "node:fs";
import path from "node:path";
import { AssetRef } from "../ir/types.js";
import { cloneGraph } from "../ir/graph.js";
import type { Graph, ParamValue } from "../ir/index.js";
import { ComfyError, ErrorCodes } from "../errors.js";

/**
 * Asset staging — the seam between local files and the server's input
 * directory. Params may carry AssetRef values; before submission the runtime
 * uploads each one (POST /upload/image, the ComfyUI upload endpoint) and
 * rewrites the param to the server-side filename. Full asset management
 * (sync, dedup, cleanup) is deliberately out of scope; this seam is built in
 * from day one so workflows can reference local files losslessly.
 */

export interface UploadedAsset {
  name: string;
  subfolder: string;
  /** Combo value to write back into the param. */
  serverValue: string;
}

export interface AssetUploader {
  (asset: AssetRef): Promise<UploadedAsset>;
}

export function defaultUploader(
  baseUrl: string,
  headers: Record<string, string> | undefined,
  fetchImpl: typeof fetch,
): AssetUploader {
  return async (asset: AssetRef): Promise<UploadedAsset> => {
    let bytes: Buffer;
    try {
      bytes = await fs.readFile(asset.path);
    } catch (e) {
      throw new ComfyError({
        code: ErrorCodes.AssetStageFailed,
        message: `Failed to read asset ${asset.path}`,
        hint: e instanceof Error ? e.message : String(e),
      });
    }
    const name = asset.name ?? path.basename(asset.path);
    const form = new FormData();
    form.append("image", new Blob([new Uint8Array(bytes)]), name);
    form.append("overwrite", "true");
    form.append("type", "input");
    // FormData must set its own multipart Content-Type (with boundary).
    // Preserve caller headers (auth etc.) but strip any explicit Content-Type —
    // passing one (even `undefined`) overrides the boundary and breaks the upload.
    const uploadHeaders: Record<string, string> = { ...headers };
    delete uploadHeaders["Content-Type"];
    delete uploadHeaders["content-type"];
    const res = await fetchImpl(`${baseUrl}/upload/image`, {
      method: "POST",
      headers: uploadHeaders,
      body: form,
    }).catch((e: unknown) => {
      throw new ComfyError({
        code: ErrorCodes.AssetStageFailed,
        message: `Upload failed for ${asset.path}`,
        hint: e instanceof Error ? e.message : String(e),
      });
    });
    if (!res.ok) {
      throw new ComfyError({
        code: ErrorCodes.AssetStageFailed,
        message: `Upload failed for ${asset.path}: HTTP ${res.status}`,
        details: await res.text().catch(() => undefined),
      });
    }
    const body = (await res.json()) as { name?: string; subfolder?: string };
    const serverName = body.name ?? name;
    const subfolder = body.subfolder ?? "";
    return {
      name: serverName,
      subfolder,
      serverValue: subfolder ? `${subfolder}/${serverName}` : serverName,
    };
  };
}

/**
 * Replace every AssetRef in the graph's params with its staged server value.
 * Non-mutating: operates on a CLONE of the graph and returns it — the caller's
 * Graph (and any AssetRefs in it) is left byte/semantically unchanged, so the
 * same Graph can be staged and run repeatedly.
 */
export async function stageAssets(
  g: Graph,
  upload: AssetUploader,
  seen?: Map<string, UploadedAsset>,
): Promise<{ graph: Graph; staged: UploadedAsset[] }> {
  const clone = cloneGraph(g);
  const cache = seen ?? new Map<string, UploadedAsset>();
  const staged: UploadedAsset[] = [];
  for (const node of Object.values(clone.nodes)) {
    for (const [name, value] of Object.entries(node.params)) {
      node.params[name] = await rewriteValue(value, upload, cache, staged);
    }
  }
  return { graph: clone, staged };
}

async function rewriteValue(
  value: ParamValue,
  upload: AssetUploader,
  cache: Map<string, UploadedAsset>,
  staged: UploadedAsset[],
): Promise<ParamValue> {
  if (Array.isArray(value)) {
    const out: ParamValue[] = [];
    for (const v of value) out.push(await rewriteValue(v, upload, cache, staged));
    return out;
  }
  if (!(value instanceof AssetRef)) return value;
  const key = `${value.path}:${value.kind}:${value.name ?? ""}`;
  let result = cache.get(key);
  if (!result) {
    result = await upload(value);
    cache.set(key, result);
    staged.push(result);
  }
  return result.serverValue;
}
