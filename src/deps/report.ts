/**
 * Build a dependency-aware inspect / setup view from a workflow package
 * plus optional live Comfy `/object_info` and a local install tree.
 */

import type { WorkflowManifest, WorkflowNodePack } from "../wfpack/manifest.js";
import { isCoreNodeClass } from "./core.js";
import {
  findInstalledPack,
  listInstalledPacks,
  packVersionStatus,
  type InstalledPack,
} from "./installed.js";
import { createSetupPlan, packAction, type SetupPlan, type SetupPlanPack } from "./plan.js";
import type { RegistryClient } from "./registry.js";
import { resolveNodeClasses, type ResolveNodesResult } from "./resolve.js";
import type { ComfyTarget } from "./target.js";
import { selectCompatibleVersion } from "./versions.js";

export interface DependencyReport {
  requiredNodeClasses: string[];
  availableNodeClasses: string[];
  missingNodeClasses: string[];
  /**
   * @deprecated UNKNOWN is not custom. Prefer `resolvedCustomNodeClasses`
   * / `unknownNodeClasses`. Kept as an alias of resolved-custom evidence.
   */
  customNodeClasses: string[];
  coreNodeClasses: string[];
  resolvedCustomNodeClasses: string[];
  unknownNodeClasses: string[];
  ambiguousNodeClasses: string[];
  resolution: ResolveNodesResult;
  plan: SetupPlan;
}

export interface BuildDependencyReportOptions {
  manifest: WorkflowManifest;
  nodeClasses: string[];
  packageName?: string;
  installedClasses?: Iterable<string>;
  comfyUrl?: string;
  target?: ComfyTarget;
  registry: RegistryClient;
  skipLookup?: boolean;
}

function declaredProvidesClass(packs: WorkflowNodePack[], className: string): boolean {
  return packs.some((p) => (p.provides ?? []).includes(className));
}

export async function buildDependencyReport(
  opts: BuildDependencyReportOptions,
): Promise<DependencyReport> {
  const required = [...new Set(opts.nodeClasses)].sort();
  const installedSet =
    opts.installedClasses !== undefined ? new Set(opts.installedClasses) : undefined;
  const available = installedSet ? required.filter((c) => installedSet.has(c)) : [];
  // Without a live instance we cannot know availability — do not treat every
  // class as missing (that would make inspect without --url look broken).
  const missing = installedSet ? required.filter((c) => !installedSet.has(c)) : [];
  const coreNodeClasses = required.filter((c) => isCoreNodeClass(c));

  const resolution = await resolveNodeClasses({
    nodeClasses: required,
    declaredPacks: opts.manifest.requires.nodePacks,
    installedClasses: opts.installedClasses,
    registry: opts.registry,
    missingOnly: installedSet !== undefined,
    skipLookup: opts.skipLookup,
  });

  const localPacks: InstalledPack[] = opts.target ? listInstalledPacks(opts.target) : [];

  const planPacks: SetupPlanPack[] = [];
  for (const declared of resolution.packs) {
    const local = findInstalledPack(localPacks, declared.id);
    // A live instance that already has every class this pack provides is
    // treated as installed even when we cannot see custom_nodes on disk.
    const classesOfPack = declared.provides ?? [];
    const liveHasAll =
      installedSet !== undefined &&
      classesOfPack.length > 0 &&
      classesOfPack.every((c) => installedSet.has(c));
    const versionStatus = local
      ? packVersionStatus(local, declared.version)
      : liveHasAll
        ? "unknown"
        : "missing";
    let resolvedVersion: string | undefined;
    if (!opts.skipLookup && (declared.source ?? "registry") !== "manual") {
      const selected = await selectCompatibleVersion(opts.registry, {
        id: declared.id,
        version: declared.version,
      });
      resolvedVersion = selected.resolved;
    }
    const matching = resolution.resolutions.filter((r) => r.pack?.id === declared.id);
    const fromResolution = matching.find((r) => r.pack?.resolvedVersion !== undefined)?.pack
      ?.resolvedVersion;
    const verified =
      matching.length > 0
        ? matching.every((r) => r.kind === "resolved_custom" && r.pack?.verified === true)
        : false;
    planPacks.push(
      packAction({
        declared,
        versionStatus,
        resolvedVersion: resolvedVersion ?? fromResolution,
        installedVersion: local?.version,
        versionUnsatisfied:
          !opts.skipLookup &&
          declared.version !== undefined &&
          resolvedVersion === undefined &&
          fromResolution === undefined &&
          (declared.source ?? "registry") !== "manual",
        verified,
      }),
    );
  }

  const unresolvedCustom = missing.filter(
    (c) =>
      !isCoreNodeClass(c) &&
      !declaredProvidesClass(resolution.packs, c) &&
      resolution.unknown.some((u) => u.className === c),
  );

  const plan = createSetupPlan({
    manifest: opts.manifest,
    packageName: opts.packageName,
    target: opts.target
      ? { root: opts.target.root, layout: opts.target.layout, url: opts.comfyUrl }
      : opts.comfyUrl !== undefined
        ? { root: "(remote)", layout: "remote", url: opts.comfyUrl }
        : undefined,
    missingNodeClasses: missing,
    availableNodeClasses: available,
    packs: planPacks,
    unresolved: resolution.unknown.filter(
      (u) => unresolvedCustom.includes(u.className) || missing.includes(u.className),
    ),
    ambiguous: resolution.ambiguous,
    remoteOnly: opts.target === undefined && opts.comfyUrl !== undefined,
    availabilityKnown: installedSet !== undefined,
  });

  const resolvedCustomNodeClasses = resolution.resolutions
    .filter((r) => r.kind === "resolved_custom")
    .map((r) => r.className);
  const unknownNodeClasses = resolution.resolutions
    .filter((r) => r.kind === "unknown")
    .map((r) => r.className);
  const ambiguousNodeClasses = resolution.resolutions
    .filter((r) => r.kind === "ambiguous")
    .map((r) => r.className);
  // UNKNOWN != CUSTOM. Do not expose unknown classes as if they were custom.
  const customNodeClasses = resolvedCustomNodeClasses.slice();

  return {
    requiredNodeClasses: required,
    availableNodeClasses: available,
    missingNodeClasses: missing,
    customNodeClasses,
    coreNodeClasses,
    resolvedCustomNodeClasses,
    unknownNodeClasses,
    ambiguousNodeClasses,
    resolution,
    plan,
  };
}
