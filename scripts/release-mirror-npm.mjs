#!/usr/bin/env node
/**
 * Best-effort npmjs mirror of already-packed tarballs.
 *
 * Never fails the GitHub release. Never retries in a loop. Never bumps
 * versions. New names that npm rate-limits stay deferred.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  artifactsDir,
  catalogRows,
  classifyNpmFailure,
  npm,
  npmCliPath,
  root,
  run,
  tarballBasename,
  writeJson,
} from "./release-lib.mjs";

const rows = catalogRows();
const env = {
  ...process.env,
  NPM_CONFIG_REGISTRY: "https://registry.npmjs.org",
};
delete env.NODE_AUTH_TOKEN;

const results = [];

async function npmView(spec) {
  const result = await run(process.execPath, [npmCliPath(), "view", spec, "name"], {
    cwd: root,
    env,
  });
  return result.code === 0 && result.stdout.trim().length > 0;
}

for (const row of rows) {
  const file = tarballBasename(row.name, row.version);
  const tgz = join(artifactsDir, file);
  if (!existsSync(tgz)) {
    results.push({
      name: row.name,
      version: row.version,
      npmMirrorStatus: "unavailable",
      error: `missing tarball ${file}`,
    });
    continue;
  }
  if (!row.npmMirrorEligible) {
    results.push({
      name: row.name,
      version: row.version,
      npmMirrorStatus: "not-requested",
    });
    continue;
  }
  try {
    if (await npmView(`${row.name}@${row.version}`)) {
      process.stdout.write(`${row.name}@${row.version} already on npm — mirrored\n`);
      results.push({ name: row.name, version: row.version, npmMirrorStatus: "mirrored" });
      continue;
    }
    if (!(await npmView(row.name))) {
      process.stdout.write(
        `${row.name} is not on npm — skipping create (npmMirrorStatus=deferred-rate-limit)\n`,
      );
      results.push({
        name: row.name,
        version: row.version,
        npmMirrorStatus: "deferred-rate-limit",
        error: "package name does not exist on npmjs; not creating new names during release",
      });
      continue;
    }
    process.stdout.write(`mirroring ${row.name}@${row.version} → npmjs\n`);
    await npm(["publish", tgz, "--access", "public", "--provenance"], artifactsDir, true, env);
    results.push({ name: row.name, version: row.version, npmMirrorStatus: "mirrored" });
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err);
    const status = classifyNpmFailure(text, "");
    process.stderr.write(`npm mirror deferred for ${row.name}@${row.version}: ${status}\n${text}\n`);
    results.push({
      name: row.name,
      version: row.version,
      npmMirrorStatus: status === "mirrored" ? "mirrored" : status,
      error: text.slice(0, 2000),
    });
  }
}

writeJson(join(artifactsDir, "npm-mirror.json"), {
  generatedAt: new Date().toISOString(),
  results,
});

const core = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const statusPath = join(root, "distribution", "status.json");
let previous = { packages: [] };
if (existsSync(statusPath)) {
  try {
    previous = JSON.parse(readFileSync(statusPath, "utf8"));
  } catch {
    previous = { packages: [] };
  }
}
const byName = new Map((previous.packages ?? []).map((p) => [p.name, p]));
for (const r of results) {
  byName.set(r.name, {
    name: r.name,
    version: r.version,
    canonicalHost: "github-packages",
    githubPackages: true,
    npmMirrorStatus: r.npmMirrorStatus,
    npmMirrorError: r.error,
  });
}
writeJson(statusPath, {
  version: core.version,
  generatedAt: new Date().toISOString(),
  canonical: {
    githubRelease: `https://github.com/stepupgaming/comfy-workflows/releases/tag/v${core.version}`,
    githubPackages: true,
  },
  packages: [...byName.values()],
});

process.stdout.write("release-mirror-npm: recorded (never fails the GitHub release)\n");
process.exit(0);
