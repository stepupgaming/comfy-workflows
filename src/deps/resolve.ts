/**
 * Map missing Comfy node classes to owning Comfy Registry packs.
 *
 * Deterministic. No LLM. No guess-from-repo-name.
 *
 * `GET /comfy-nodes/{class}/node` is a candidate hint only. A pack is
 * accepted only after the selected pack version's comfy-node definitions
 * list the class (or the author declared it and verification is unavailable
 * / skipped). Ambiguous ownership is reported, never auto-picked.
 */

import type { WorkflowManifest, WorkflowNodePack } from "../wfpack/manifest.js";
import { isCoreNodeClass } from "./core.js";
import type { RegistryClient, RegistryPack } from "./registry.js";
import { classProvidedByVersion, selectCompatibleVersion } from "./versions.js";

export type ClassResolutionKind = "core" | "resolved_custom" | "ambiguous" | "unknown";

export interface ClassCandidate {
  id: string;
  name?: string;
  latestVersion?: string;
  resolvedVersion?: string;
  repository?: string;
  verified?: boolean;
}

export interface ClassResolution {
  className: string;
  kind: ClassResolutionKind;
  /** Pack chosen when kind is resolved_custom. */
  pack?: ClassCandidate;
  candidates?: ClassCandidate[];
}

export interface ResolveNodesResult {
  required: string[];
  missing: string[];
  available: string[];
  resolutions: ClassResolution[];
  /** Packs that can be written into requires.nodePacks (verified + declared). */
  packs: WorkflowNodePack[];
  ambiguous: ClassResolution[];
  unknown: ClassResolution[];
}

export interface ResolveNodesOptions {
  /** Required node classes (from IR / manifest). */
  nodeClasses: string[];
  /** Already-declared packs from the manifest (win over registry lookup). */
  declaredPacks?: WorkflowNodePack[];
  /** Live /object_info class names. When omitted, every class is treated as missing. */
  installedClasses?: Iterable<string>;
  registry: RegistryClient;
  /**
   * Resolve only classes missing from the live instance. When false (default
   * for `cwf resolve-nodes` without --url), resolve every non-core class.
   */
  missingOnly?: boolean;
  /** Skip live Registry lookups (inspect without --url; tests). */
  skipLookup?: boolean;
  /**
   * Additional known-core class names (caller-supplied defs / core metadata).
   * Live object_info is availability, not ownership — do not pass it here.
   */
  extraCoreClasses?: Iterable<string>;
}

function byId(a: ClassCandidate, b: ClassCandidate): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function declaredOwner(className: string, packs: WorkflowNodePack[]): WorkflowNodePack[] {
  return packs.filter((p) => (p.provides ?? []).includes(className));
}

function toCandidate(
  p: RegistryPack,
  extra?: { resolvedVersion?: string; verified?: boolean },
): ClassCandidate {
  return {
    id: p.id,
    name: p.name,
    latestVersion: p.latestVersion,
    repository: p.repository,
    resolvedVersion: extra?.resolvedVersion,
    verified: extra?.verified,
  };
}

function packFromDeclared(p: WorkflowNodePack, extraProvides: string[]): WorkflowNodePack {
  const provides = [...new Set([...(p.provides ?? []), ...extraProvides])].sort();
  return { ...p, provides };
}

/**
 * Resolve node classes to registry packs. Ordering of `resolutions`,
 * `packs`, `ambiguous`, and `unknown` is sorted — JSON output is stable.
 */
export async function resolveNodeClasses(opts: ResolveNodesOptions): Promise<ResolveNodesResult> {
  const required = [...new Set(opts.nodeClasses)].sort();
  const installed = new Set(opts.installedClasses ?? []);
  const haveLive = opts.installedClasses !== undefined;
  const declared = opts.declaredPacks ?? [];
  const missingOnly = opts.missingOnly === true;
  const extraCore = opts.extraCoreClasses;

  const available = haveLive ? required.filter((c) => installed.has(c)) : [];
  const missing = haveLive ? required.filter((c) => !installed.has(c)) : required.slice();

  const toResolve = missingOnly && haveLive ? missing : required;

  const resolutions: ClassResolution[] = [];
  const packProvides = new Map<string, { pack: WorkflowNodePack; provides: Set<string> }>();

  const remember = (p: WorkflowNodePack, className: string): void => {
    const existing = packProvides.get(p.id);
    if (existing) {
      existing.provides.add(className);
      return;
    }
    packProvides.set(p.id, { pack: p, provides: new Set([className, ...(p.provides ?? [])]) });
  };

  for (const className of toResolve) {
    if (isCoreNodeClass(className, extraCore)) {
      resolutions.push({ className, kind: "core" });
      continue;
    }

    // Live availability is not ownership, but a present class needs no pack install.
    // Still resolve ownership when looking up (missingOnly already dropped available).

    const owners = declaredOwner(className, declared);
    if (owners.length > 1) {
      const candidates = owners
        .map((p) => ({ id: p.id, name: p.name, repository: p.repository }))
        .sort(byId);
      resolutions.push({ className, kind: "ambiguous", candidates });
      continue;
    }

    if (owners.length === 1) {
      const p = owners[0]!;
      if (opts.skipLookup) {
        resolutions.push({
          className,
          kind: "resolved_custom",
          pack: { id: p.id, name: p.name, repository: p.repository, verified: false },
        });
        remember(p, className);
        continue;
      }
      const meta = (await opts.registry.getPack(p.id)) ?? {
        id: p.id,
        name: p.name ?? p.id,
        repository: p.repository,
      };
      const ver = await selectCompatibleVersion(opts.registry, {
        id: p.id,
        latestVersion: meta.latestVersion,
        version: p.version,
      });
      if (ver.unsatisfied) {
        resolutions.push({ className, kind: "unknown" });
        continue;
      }
      const provided = await classProvidedByVersion(
        opts.registry,
        p.id,
        ver.resolved,
        className,
      );
      if (provided === false) {
        // Author mapping contradicts Registry definitions — do not treat as verified.
        resolutions.push({ className, kind: "unknown" });
        continue;
      }
      const pack: WorkflowNodePack = {
        ...p,
        name: p.name ?? meta.name,
        repository: p.repository ?? meta.repository,
        version: p.version ?? (ver.resolved !== undefined ? `^${ver.resolved}` : undefined),
        source: p.source ?? "manual",
      };
      resolutions.push({
        className,
        kind: "resolved_custom",
        pack: {
          id: p.id,
          name: pack.name,
          repository: pack.repository,
          latestVersion: meta.latestVersion,
          resolvedVersion: ver.resolved,
          verified: provided === true,
        },
      });
      remember(pack, className);
      continue;
    }

    if (opts.skipLookup) {
      // Inspect without a registry probe: leave undeclared custom classes
      // unmentioned rather than pretending they are unknown-to-the-registry.
      continue;
    }

    let found: RegistryPack[] = [];
    try {
      found = await opts.registry.lookupClass(className);
    } catch {
      resolutions.push({ className, kind: "unknown" });
      continue;
    }
    const unique = new Map<string, RegistryPack>();
    for (const p of found) unique.set(p.id, p);

    const verified: ClassCandidate[] = [];
    const unverified: ClassCandidate[] = [];
    for (const p of [...unique.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
      const ver = await selectCompatibleVersion(opts.registry, p);
      if (ver.unsatisfied) continue;
      const provided = await classProvidedByVersion(opts.registry, p.id, ver.resolved, className);
      const cand = toCandidate(p, { resolvedVersion: ver.resolved, verified: provided === true });
      if (provided === true) verified.push(cand);
      else if (provided === undefined) unverified.push(cand);
      // provided === false → ranked false positive; drop.
    }

    if (verified.length === 1) {
      const cand = verified[0]!;
      const p = unique.get(cand.id)!;
      resolutions.push({ className, kind: "resolved_custom", pack: cand });
      const existing = packProvides.get(p.id);
      if (existing) {
        existing.provides.add(className);
      } else {
        packProvides.set(p.id, {
          pack: {
            id: p.id,
            name: p.name,
            version: cand.resolvedVersion !== undefined ? `^${cand.resolvedVersion}` : undefined,
            repository: p.repository,
            source: "registry",
            provides: [className],
          },
          provides: new Set([className]),
        });
      }
      continue;
    }
    if (verified.length > 1) {
      resolutions.push({ className, kind: "ambiguous", candidates: verified.sort(byId) });
      continue;
    }
    // Hint-only hits that could not be verified are UNKNOWN — never install from a ranked guess.
    if (unverified.length > 0 || unique.size === 0) {
      resolutions.push({
        className,
        kind: "unknown",
        candidates: unverified.length > 0 ? unverified : undefined,
      });
      continue;
    }
    resolutions.push({ className, kind: "unknown" });
  }

  // Preserve declared packs even if they provided no currently-resolved class.
  for (const p of declared) {
    if (!packProvides.has(p.id)) {
      packProvides.set(p.id, { pack: p, provides: new Set(p.provides ?? []) });
    }
  }

  const packs = [...packProvides.values()]
    .map(({ pack, provides }) => packFromDeclared(pack, [...provides]))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const ambiguous = resolutions.filter((r) => r.kind === "ambiguous");
  const unknown = resolutions.filter((r) => r.kind === "unknown");

  return {
    required,
    missing,
    available,
    resolutions,
    packs,
    ambiguous,
    unknown,
  };
}

/** Merge resolved packs into a manifest (pure). Promotes specVersion 1 → 2 when writing objects. */
export function mergeResolvedPacks(
  manifest: WorkflowManifest,
  packs: WorkflowNodePack[],
): WorkflowManifest {
  const byId = new Map<string, WorkflowNodePack>();
  for (const p of manifest.requires.nodePacks) byId.set(p.id, { ...p });
  for (const p of packs) {
    const prev = byId.get(p.id);
    if (!prev) {
      byId.set(p.id, {
        ...p,
        provides: [...new Set(p.provides ?? [])].sort(),
      });
      continue;
    }
    const provides = [...new Set([...(prev.provides ?? []), ...(p.provides ?? [])])].sort();
    byId.set(p.id, {
      ...prev,
      ...p,
      provides,
      name: p.name ?? prev.name,
      repository: p.repository ?? prev.repository,
      version: prev.version ?? p.version,
      source: prev.source ?? p.source,
    });
  }
  const nextPacks = [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const specVersion: 1 | 2 = nextPacks.length === 0 && manifest.specVersion === 1 ? 1 : 2;
  return {
    ...manifest,
    specVersion,
    requires: {
      ...manifest.requires,
      nodePacks: nextPacks,
    },
  };
}
