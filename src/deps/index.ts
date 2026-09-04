/**
 * Custom-node dependency resolution and Comfy environment setup.
 *
 * Comfy Workflows owns declaration + resolution + orchestration.
 * Comfy Registry / ComfyUI-Manager own actual installation.
 *
 * `inspect` and `run` never call the installer.
 */

export { CORE_NODE_CLASSES, KNOWN_CORE_EXTRAS, isCoreNodeClass } from "./core.js";
export {
  createRegistryClient,
  DEFAULT_REGISTRY_URL,
  type RegistryClient,
  type RegistryClientOptions,
  type RegistryLookup,
  type RegistryPack,
  type RegistryVersion,
} from "./registry.js";
export {
  mergeResolvedPacks,
  resolveNodeClasses,
  type ClassCandidate,
  type ClassResolution,
  type ClassResolutionKind,
  type ResolveNodesOptions,
  type ResolveNodesResult,
} from "./resolve.js";
export {
  createSetupPlan,
  packAction,
  type CreateSetupPlanInput,
  type SetupAction,
  type SetupPlan,
  type SetupPlanModel,
  type SetupPlanPack,
  type SetupSource,
} from "./plan.js";
export {
  applySetupPlan,
  assertComfyPath,
  managerCliPath,
  pickTargetPython,
  runCmCli,
  type ApplySetupOptions,
  type InstallerResult,
} from "./install.js";
export {
  detectComfyTarget,
  inspectComfyTarget,
  type ComfyLayout,
  type ComfyTarget,
} from "./target.js";
export {
  findInstalledPack,
  listInstalledPacks,
  packVersionStatus,
  type InstalledPack,
  type InstalledVersionStatus,
} from "./installed.js";
export { parseSemVer, pickBestVersion, versionSatisfies, type SemVer } from "./semver.js";
export {
  classProvidedByVersion,
  selectCompatibleVersion,
  type SelectedPackVersion,
} from "./versions.js";
export {
  buildDependencyReport,
  type BuildDependencyReportOptions,
  type DependencyReport,
} from "./report.js";
