import type { RegistryClient } from "./registry.js";
import { pickBestVersion } from "./semver.js";

function isActiveVersion(status: string | undefined, deprecated: boolean | undefined): boolean {
  if (deprecated === true) return false;
  if (status === undefined) return true;
  const s = status.toLowerCase();
  if (s.includes("banned") || s.includes("deleted") || s.includes("yank")) return false;
  if (s.includes("deprecated")) return false;
  return true;
}

export interface SelectedPackVersion {
  requested?: string;
  resolved?: string;
  unsatisfied: boolean;
}

/** Pick the highest active Registry version that satisfies `requested`. */
export async function selectCompatibleVersion(
  registry: RegistryClient,
  pack: { id: string; latestVersion?: string; version?: string },
): Promise<SelectedPackVersion> {
  const requested = pack.version;
  let versions: string[] = [];
  try {
    const listed = await registry.listVersions(pack.id);
    versions = listed.filter((v) => isActiveVersion(v.status, v.deprecated)).map((v) => v.version);
  } catch {
    versions = [];
  }
  if (versions.length === 0 && pack.latestVersion) versions = [pack.latestVersion];
  const resolved = pickBestVersion(versions, requested);
  if (resolved !== undefined) {
    try {
      const installable = await registry.installableVersion(pack.id, resolved);
      if (installable !== undefined) return { requested, resolved: installable, unsatisfied: false };
    } catch {
      /* keep pickBestVersion result */
    }
    return { requested, resolved, unsatisfied: false };
  }
  if (requested !== undefined && requested !== "" && requested !== "*") {
    return { requested, resolved: undefined, unsatisfied: true };
  }
  if (pack.latestVersion) return { requested, resolved: pack.latestVersion, unsatisfied: false };
  return { requested, resolved: undefined, unsatisfied: false };
}

export async function classProvidedByVersion(
  registry: RegistryClient,
  packId: string,
  version: string | undefined,
  className: string,
): Promise<boolean | undefined> {
  if (version === undefined) return undefined;
  try {
    const names = await registry.listComfyNodes(packId, version);
    if (names === undefined) return undefined;
    return names.includes(className);
  } catch {
    return undefined;
  }
}
