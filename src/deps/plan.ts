/**
 * First-class setup plan. Shared by CLI, agents, and (later) a GUI.
 *
 * Custom-node installation is planned here; models are reported only.
 * Applying a plan is a separate step (`applySetupPlan`) and never runs
 * during inspect/run/init.
 */

import type { WorkflowManifest, WorkflowNodePack } from "../wfpack/manifest.js";
import type { ClassResolution } from "./resolve.js";
import type { InstalledVersionStatus } from "./installed.js";

export type SetupAction = "install" | "skip" | "upgrade";
export type SetupSource = "registry" | "manual";

export interface SetupPlanPack {
  id: string;
  name?: string;
  requestedVersion?: string;
  resolvedVersion?: string;
  installedVersion?: string;
  versionStatus: InstalledVersionStatus;
  source: SetupSource;
  repository?: string;
  provides: string[];
  optional?: boolean;
  action: SetupAction;
}

export interface SetupPlanModel {
  kind: string;
  name: string;
  optional?: boolean;
  /** Always "unknown" in this increment — no model downloader. */
  status: "unknown";
}

export interface SetupPlan {
  workflow: { name: string; title: string; package?: string };
  target?: { root: string; layout: string; url?: string };
  alreadyInstalled: SetupPlanPack[];
  toInstall: SetupPlanPack[];
  missingNodeClasses: string[];
  availableNodeClasses: string[];
  packages: SetupPlanPack[];
  unresolved: ClassResolution[];
  ambiguous: ClassResolution[];
  models: SetupPlanModel[];
  failed: SetupPlanPack[];
  restartRequired: boolean;
  ready: boolean;
  /** Why apply is blocked even if the plan looks complete. */
  applyBlocked?: string;
}

export interface CreateSetupPlanInput {
  manifest: WorkflowManifest;
  packageName?: string;
  target?: { root: string; layout: string; url?: string };
  missingNodeClasses: string[];
  availableNodeClasses: string[];
  packs: SetupPlanPack[];
  unresolved: ClassResolution[];
  ambiguous: ClassResolution[];
  /** Remote HTTP Comfy cannot be written from here. */
  remoteOnly?: boolean;
}

export function createSetupPlan(input: CreateSetupPlanInput): SetupPlan {
  const alreadyInstalled = input.packs.filter((p) => p.action === "skip");
  const toInstall = input.packs.filter((p) => p.action === "install" || p.action === "upgrade");
  const blockingUnresolved = input.unresolved.filter((u) => u.kind === "unknown");
  const blockingAmbiguous = input.ambiguous;
  const requiredMissingPacks = toInstall.filter((p) => p.optional !== true);
  const ready =
    blockingUnresolved.length === 0 &&
    blockingAmbiguous.length === 0 &&
    requiredMissingPacks.length === 0 &&
    input.missingNodeClasses.length === 0;

  let applyBlocked: string | undefined;
  if (input.remoteOnly) {
    applyBlocked =
      "Installation requires local access to the Comfy environment. A remote --url cannot apply this plan.";
  }

  const models: SetupPlanModel[] = (input.manifest.requires.models ?? []).map((m) => ({
    kind: m.kind,
    name: m.name,
    optional: m.optional,
    status: "unknown",
  }));

  return {
    workflow: {
      name: input.manifest.name,
      title: input.manifest.title,
      package: input.packageName,
    },
    target: input.target,
    alreadyInstalled,
    toInstall,
    missingNodeClasses: [...input.missingNodeClasses].sort(),
    availableNodeClasses: [...input.availableNodeClasses].sort(),
    packages: [...input.packs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    unresolved: input.unresolved,
    ambiguous: input.ambiguous,
    models,
    failed: [],
    restartRequired: toInstall.length > 0,
    ready,
    applyBlocked,
  };
}

export function packAction(opts: {
  declared: WorkflowNodePack;
  versionStatus: InstalledVersionStatus;
  resolvedVersion?: string;
  installedVersion?: string;
  /** Declared range matched no Registry version — do not install latest. */
  versionUnsatisfied?: boolean;
}): SetupPlanPack {
  let action: SetupAction = "install";
  if (opts.declared.source === "manual") {
    // Author mapping is not permission to run unregistered installers.
    action = "skip";
  } else if (opts.versionUnsatisfied) action = "skip";
  else if (opts.versionStatus === "compatible") action = "skip";
  else if (opts.versionStatus === "incompatible") action = "upgrade";
  else if (opts.versionStatus === "unknown") {
    // Installed but version unproven — do not reinstall blindly.
    action = "skip";
  }
  return {
    id: opts.declared.id,
    name: opts.declared.name,
    requestedVersion: opts.declared.version,
    resolvedVersion: opts.resolvedVersion,
    installedVersion: opts.installedVersion,
    versionStatus: opts.versionStatus,
    source: opts.declared.source === "manual" ? "manual" : "registry",
    repository: opts.declared.repository,
    provides: [...(opts.declared.provides ?? [])].sort(),
    optional: opts.declared.optional,
    action,
  };
}
