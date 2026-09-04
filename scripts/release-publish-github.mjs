#!/usr/bin/env node
/**
 * Publish packed tarballs to GitHub Packages.
 *
 * Uses publication-time registry config (never a package.json publishConfig
 * registry). Same .tgz as the Release asset.
 */
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  artifactsDir,
  catalogRows,
  npm,
  npmCliPath,
  root,
  run,
  tarballBasename,
} from "./release-lib.mjs";

const token = process.env.GITHUB_TOKEN || process.env.NODE_AUTH_TOKEN;
if (!token) throw new Error("GITHUB_TOKEN (or NODE_AUTH_TOKEN) is required to publish to GitHub Packages");

const rows = catalogRows();
const tmp = mkdtempSync(join(tmpdir(), "cwf-gh-npmrc-"));
const npmrc = join(tmp, ".npmrc");
writeFileSync(
  npmrc,
  [
    "@stepupgaming:registry=https://npm.pkg.github.com",
    "//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}",
    "",
  ].join("\n"),
);

const env = {
  ...process.env,
  GITHUB_TOKEN: token,
  NODE_AUTH_TOKEN: token,
  npm_config_userconfig: npmrc,
};
delete env.NPM_CONFIG_REGISTRY;

const published = [];
for (const row of rows) {
  const file = tarballBasename(row.name, row.version);
  const tgz = join(artifactsDir, file);
  if (!existsSync(tgz)) throw new Error(`missing packed tarball ${tgz}`);
  const probe = await run(
    process.execPath,
    [npmCliPath(), "view", `${row.name}@${row.version}`, "version", "--registry=https://npm.pkg.github.com"],
    { cwd: root, env },
  );
  if (probe.code === 0 && probe.stdout.trim()) {
    process.stdout.write(`${row.name}@${row.version} already on GitHub Packages — skipping\n`);
    published.push({ name: row.name, version: row.version, host: "github-packages", file, skipped: true });
    continue;
  }
  process.stdout.write(`publishing ${row.name}@${row.version} → GitHub Packages\n`);
  await npm(["publish", tgz, "--access", "public"], artifactsDir, true, env);
  published.push({ name: row.name, version: row.version, host: "github-packages", file });
}

process.stdout.write(`release-publish-github: ${published.length} package(s)\n`);
