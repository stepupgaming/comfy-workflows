/**
 * Comfy Registry client — read-only metadata.
 *
 * Base: https://api.comfy.org
 *   GET /nodes/search?comfy_node_search=        → candidate packs (paginated)
 *   GET /comfy-nodes/{className}/node           → ranked candidate pack (HINT ONLY)
 *   GET /nodes/{nodeId}                         → pack metadata + latest_version
 *   GET /nodes/{nodeId}/versions                → published versions
 *   GET /nodes/{nodeId}/install?version=        → installable version payload
 *   GET /nodes/{nodeId}/versions/{v}/comfy-nodes → class definitions for that version
 *
 * `lookupClass` enumerates search hits (all pages) plus the ranked hint.
 * The ranked endpoint is never the complete candidate universe. A pack is
 * verified only when its selected version's comfy-nodes list includes the class.
 *
 * This module never installs anything. It never follows `repository` as a
 * clone instruction. Tests inject `fetchImpl`.
 */

export const DEFAULT_REGISTRY_URL = "https://api.comfy.org";

/** Page size for `GET /nodes/search`. */
export const REGISTRY_SEARCH_LIMIT = 64;
/** Hard cap so a broken totalPages cannot loop forever. */
export const REGISTRY_SEARCH_MAX_PAGES = 20;

export interface RegistryPack {
  id: string;
  name: string;
  repository?: string;
  latestVersion?: string;
  publisherId?: string;
}

export interface RegistryVersion {
  version: string;
  status?: string;
  deprecated?: boolean;
}

export interface RegistryLookup {
  className: string;
  packs: RegistryPack[];
}

export interface RegistryClient {
  /**
   * Candidate packs for a class. Search (paginated) is the universe;
   * ranked `/comfy-nodes/{class}/node` is merged as an extra hint.
   * Never treat the result as ownership or installation proof.
   */
  lookupClass(className: string): Promise<RegistryPack[]>;
  getPack(id: string): Promise<RegistryPack | undefined>;
  listVersions(id: string): Promise<RegistryVersion[]>;
  installableVersion(id: string, version?: string): Promise<string | undefined>;
  /**
   * Class names this pack version claims to provide. `undefined` means the
   * Registry has no definitions for that version (cannot verify).
   */
  listComfyNodes(id: string, version: string): Promise<string[] | undefined>;
}

export interface RegistryClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function searchNodes(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (isRecord(body) && Array.isArray(body["nodes"])) return body["nodes"];
  return [];
}

function searchPaging(
  body: unknown,
  page: number,
  pageSize: number,
): { totalPages: number } {
  if (!isRecord(body)) {
    return { totalPages: pageSize === 0 ? page : page };
  }
  const totalPagesRaw = body["totalPages"] ?? body["totalNumberOfPages"];
  if (typeof totalPagesRaw === "number" && Number.isFinite(totalPagesRaw) && totalPagesRaw >= 1) {
    return { totalPages: Math.floor(totalPagesRaw) };
  }
  const totalRaw = body["total"];
  const limitRaw = body["limit"];
  if (
    typeof totalRaw === "number" &&
    Number.isFinite(totalRaw) &&
    typeof limitRaw === "number" &&
    Number.isFinite(limitRaw) &&
    limitRaw > 0
  ) {
    return { totalPages: Math.max(1, Math.ceil(totalRaw / limitRaw)) };
  }
  // If this page was full, there may be another; otherwise this is the last.
  if (pageSize >= REGISTRY_SEARCH_LIMIT) return { totalPages: page + 1 };
  return { totalPages: page };
}

function packFromNode(json: unknown): RegistryPack | undefined {
  if (!isRecord(json)) return undefined;
  const id = json["id"];
  if (typeof id !== "string" || id.length === 0) return undefined;
  const name = typeof json["name"] === "string" && json["name"].length > 0 ? json["name"] : id;
  const repository = typeof json["repository"] === "string" ? json["repository"] : undefined;
  const latest = isRecord(json["latest_version"]) ? json["latest_version"] : undefined;
  const latestVersion = typeof latest?.["version"] === "string" ? latest["version"] : undefined;
  const publisher = isRecord(json["publisher"]) ? json["publisher"] : undefined;
  const publisherId = typeof publisher?.["id"] === "string" ? publisher["id"] : undefined;
  return { id, name, repository, latestVersion, publisherId };
}

function versionFrom(json: unknown): RegistryVersion | undefined {
  if (!isRecord(json)) return undefined;
  const version = json["version"];
  if (typeof version !== "string" || version.length === 0) return undefined;
  const status = typeof json["status"] === "string" ? json["status"] : undefined;
  const deprecated = typeof json["deprecated"] === "boolean" ? json["deprecated"] : undefined;
  return { version, status, deprecated };
}

function comfyNodeName(json: unknown): string | undefined {
  if (typeof json === "string" && json.length > 0) return json;
  if (!isRecord(json)) return undefined;
  for (const key of ["comfy_node_name", "comfy_node_id", "name", "class_type"]) {
    const v = json[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

export function createRegistryClient(opts: RegistryClientOptions = {}): RegistryClient {
  const base = (opts.baseUrl ?? DEFAULT_REGISTRY_URL).replace(/\/+$/, "");
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;

  async function getJson(path: string): Promise<{ status: number; body: unknown }> {
    const res = await fetchImpl(`${base}${path}`, {
      headers: { Accept: "application/json" },
    });
    let body: unknown = undefined;
    const text = await res.text();
    if (text.length > 0) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    return { status: res.status, body };
  }

  return {
    async lookupClass(className: string): Promise<RegistryPack[]> {
      const unique = new Map<string, RegistryPack>();
      const add = (pack: RegistryPack | undefined): void => {
        if (pack && !unique.has(pack.id)) unique.set(pack.id, pack);
      };

      const encoded = encodeURIComponent(className);
      let page = 1;
      let totalPages = 1;
      while (page <= totalPages && page <= REGISTRY_SEARCH_MAX_PAGES) {
        const q = `/nodes/search?comfy_node_search=${encoded}&page=${page}&limit=${REGISTRY_SEARCH_LIMIT}`;
        const { status, body } = await getJson(q);
        if (status === 404) break;
        if (status !== 200) {
          throw new Error(`Comfy Registry search for ${className} failed (HTTP ${status})`);
        }
        const nodes = searchNodes(body);
        const paging = searchPaging(body, page, nodes.length);
        totalPages = paging.totalPages;
        for (const item of nodes) add(packFromNode(item));
        if (nodes.length === 0) break;
        if (page >= paging.totalPages) break;
        page += 1;
      }

      const ranked = await getJson(`/comfy-nodes/${encoded}/node`);
      if (ranked.status === 200) add(packFromNode(ranked.body));
      else if (ranked.status !== 404) {
        throw new Error(`Comfy Registry ranked lookup for ${className} failed (HTTP ${ranked.status})`);
      }

      return [...unique.values()];
    },

    async getPack(id: string): Promise<RegistryPack | undefined> {
      const encoded = encodeURIComponent(id);
      const { status, body } = await getJson(`/nodes/${encoded}`);
      if (status === 404) return undefined;
      if (status === 200) return packFromNode(body);
      throw new Error(`Comfy Registry getPack ${id} failed (HTTP ${status})`);
    },

    async listVersions(id: string): Promise<RegistryVersion[]> {
      const encoded = encodeURIComponent(id);
      const { status, body } = await getJson(`/nodes/${encoded}/versions`);
      if (status === 404) return [];
      if (status !== 200) throw new Error(`Comfy Registry versions ${id} failed (HTTP ${status})`);
      const raw = Array.isArray(body)
        ? body
        : isRecord(body) && Array.isArray(body["versions"])
          ? body["versions"]
          : [];
      const out: RegistryVersion[] = [];
      for (const item of raw) {
        const v = versionFrom(item);
        if (v) out.push(v);
      }
      return out;
    },

    async installableVersion(id: string, version?: string): Promise<string | undefined> {
      const encoded = encodeURIComponent(id);
      const q = version !== undefined ? `?version=${encodeURIComponent(version)}` : "";
      const { status, body } = await getJson(`/nodes/${encoded}/install${q}`);
      if (status === 404) return undefined;
      if (status === 200 && isRecord(body) && typeof body["version"] === "string") {
        return body["version"];
      }
      if (status === 200) return version;
      throw new Error(`Comfy Registry install probe ${id} failed (HTTP ${status})`);
    },

    async listComfyNodes(id: string, version: string): Promise<string[] | undefined> {
      const encoded = encodeURIComponent(id);
      const ver = encodeURIComponent(version);
      const names = new Set<string>();
      let page = 1;
      let totalPages = 1;
      let sawBody = false;
      while (page <= totalPages && page <= REGISTRY_SEARCH_MAX_PAGES) {
        const { status, body } = await getJson(
          `/nodes/${encoded}/versions/${ver}/comfy-nodes?page=${page}&limit=${REGISTRY_SEARCH_LIMIT}`,
        );
        if (status === 404) return sawBody ? [...names].sort() : undefined;
        if (status !== 200) {
          throw new Error(`Comfy Registry comfy-nodes ${id}@${version} failed (HTTP ${status})`);
        }
        sawBody = true;
        const raw = Array.isArray(body)
          ? body
          : isRecord(body) && Array.isArray(body["comfy_nodes"])
            ? body["comfy_nodes"]
            : isRecord(body) && Array.isArray(body["nodes"])
              ? body["nodes"]
              : undefined;
        if (raw === undefined) {
          if (page === 1) return undefined;
          break;
        }
        for (const item of raw) {
          const n = comfyNodeName(item);
          if (n) names.add(n);
        }
        const paging = searchPaging(body, page, raw.length);
        totalPages = paging.totalPages;
        if (raw.length === 0 || page >= totalPages) break;
        page += 1;
      }
      return [...names].sort();
    },
  };
}
