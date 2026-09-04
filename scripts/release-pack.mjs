#!/usr/bin/env node
/**
 * Pack each catalog package exactly once into release-artifacts/.
 * Same .tgz is later published to GitHub Packages, attached to the
 * GitHub Release, and optionally mirrored to npm.
 */
import { existsSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  artifactsDir,
  catalogRows,
  ensureDir,
  npm,
  root,
  sha256File,
  tarballBasename,
  writeJson,
} from "./release-lib.mjs";

rmSync(artifactsDir, { recursive: true, force: true });
ensureDir(artifactsDir);

const packed = [];
for (const row of catalogRows()) {
  const destName = tarballBasename(row.name, row.version);
  const packedResult = await npm(
    ["pack", "--pack-destination", artifactsDir, "--ignore-scripts"],
    join(root, row.dir),
    true,
  );
  const printed = packedResult.stdout.trim().split(/\r?\n/).pop().trim();
  const printedBase = printed.split(/[\\/]/).pop();
  const fromPath = join(artifactsDir, printedBase);
  const toPath = join(artifactsDir, destName);
  if (!existsSync(fromPath)) throw new Error(`npm pack did not produce ${fromPath}`);
  if (fromPath !== toPath) renameSync(fromPath, toPath);
  const sha256 = sha256File(toPath);
  packed.push({
    name: row.name,
    version: row.version,
    kind: row.kind,
    family: row.family,
    dir: row.dir,
    file: destName,
    sha256,
    npmMirrorEligible: row.npmMirrorEligible,
  });
  process.stdout.write(`packed ${row.name}@${row.version} ${destName} sha256=${sha256}\n`);
}

writeJson(join(artifactsDir, "manifest.json"), {
  generatedAt: new Date().toISOString(),
  packages: packed,
});
process.stdout.write(`release-pack: ${packed.length} tarball(s) in ${artifactsDir}\n`);
