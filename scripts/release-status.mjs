#!/usr/bin/env node
/**
 * Write distribution/status.json + docs package-index fragment from catalog
 * plus optional GitHub/npm probe results. Network probes are best-effort.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  catalogRows,
  githubPackageUrl,
  githubReleaseUrl,
  loadCatalog,
  npmUrl,
  releaseTag,
  root,
  writeJson,
} from "./release-lib.mjs";

const catalog = loadCatalog();
const rows = catalogRows();
const core = rows.find((r) => r.kind === "core");
const tag = releaseTag(core.version);

const priorPath = join(root, "distribution", "status.json");
let prior = { packages: [] };
if (existsSync(priorPath)) {
  try {
    prior = JSON.parse(readFileSync(priorPath, "utf8"));
  } catch {
    prior = { packages: [] };
  }
}
const priorByName = new Map((prior.packages ?? []).map((p) => [p.name, p]));

const packages = rows.map((row) => {
  const prev = priorByName.get(row.name) ?? {};
  return {
    name: row.name,
    version: row.version,
    kind: row.kind,
    family: row.family,
    description: row.description,
    canonicalHost: "github-packages",
    githubPackages: prev.githubPackages ?? true,
    githubPackageUrl: githubPackageUrl(row.name.replace(/^@[^/]+\//, "")),
    releaseTag: tag,
    releaseUrl: githubReleaseUrl(tag),
    tarball: `${row.name.replace(/^@/, "").replace("/", "-")}-${row.version}.tgz`,
    npmMirrorStatus: prev.npmMirrorStatus ?? (row.npmMirrorEligible ? "unknown" : "not-requested"),
    npmUrl: npmUrl(row.name),
  };
});

const status = {
  version: core.version,
  generatedAt: new Date().toISOString(),
  canonical: {
    githubRelease: githubReleaseUrl(tag),
    githubPackages: true,
    githubPackagesRegistry: catalog.githubPackagesRegistry,
  },
  npmMirror: {
    status: packages.every((p) => p.npmMirrorStatus === "mirrored")
      ? "mirrored"
      : packages.some((p) => String(p.npmMirrorStatus).startsWith("deferred"))
        ? "deferred"
        : "unknown",
  },
  packages,
};

writeJson(join(root, "distribution", "status.json"), status);
process.stdout.write(`release-status: ${packages.length} package(s) v${core.version}\n`);
