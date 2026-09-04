/**
 * Shared release/distribution helpers. Host is metadata; package format stays npm.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

export const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const catalogPath = join(root, "distribution", "packages.json");
export const artifactsDir = join(root, "release-artifacts");

export function loadCatalog() {
  return JSON.parse(readFileSync(catalogPath, "utf8"));
}

export function loadPackageJson(dir) {
  return JSON.parse(readFileSync(join(root, dir, "package.json"), "utf8"));
}

export function catalogRows() {
  const catalog = loadCatalog();
  return catalog.packages.map((entry) => {
    const pkg = loadPackageJson(entry.dir);
    if (pkg.name !== entry.name) {
      throw new Error(`catalog name ${entry.name} != package.json ${pkg.name} in ${entry.dir}`);
    }
    return { ...entry, version: pkg.version, description: pkg.description ?? entry.description };
  });
}

export function tarballBasename(name, version) {
  return `${name.replace(/^@/, "").replace("/", "-")}-${version}.tgz`;
}

export function sha256File(path) {
  const hash = createHash("sha256");
  hash.update(readFileSync(path));
  return hash.digest("hex");
}

export function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

export function writeJson(path, value) {
  ensureDir(dirname(path));
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}

export function run(command, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: opts.cwd ?? root,
      env: opts.env ?? process.env,
      windowsHide: true,
      shell: opts.shell ?? false,
      stdio: opts.stdio ?? ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    if (child.stdout) {
      child.stdout.on("data", (b) => {
        const s = b.toString("utf8");
        stdout += s;
        if (opts.echo) process.stdout.write(s);
      });
    }
    if (child.stderr) {
      child.stderr.on("data", (b) => {
        const s = b.toString("utf8");
        stderr += s;
        if (opts.echo) process.stderr.write(s);
      });
    }
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

export function npmCliPath() {
  const nodeDir = join(process.execPath, "..");
  const candidates = [
    join(nodeDir, "node_modules", "npm", "bin", "npm-cli.js"),
    join(nodeDir, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
    join(nodeDir, "..", "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error(`Cannot locate npm-cli.js beside ${process.execPath}`);
  return found;
}

export async function npm(args, cwd = root, echo = false, env = process.env) {
  const result = await run(process.execPath, [npmCliPath(), ...args], { cwd, echo, env });
  if (result.code !== 0) {
    throw new Error(`npm ${args.join(" ")} failed (${result.code})\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}

export function githubReleaseUrl(tag) {
  const catalog = loadCatalog();
  return `https://github.com/${catalog.githubOwner}/${catalog.githubRepo}/releases/tag/${tag}`;
}

export function githubPackageUrl(unscopedName) {
  const catalog = loadCatalog();
  return `https://github.com/${catalog.githubOwner}/${catalog.githubRepo}/pkgs/npm/${unscopedName}`;
}

export function npmUrl(name) {
  return `https://www.npmjs.com/package/${name}`;
}

export function releaseTag(version) {
  return version.startsWith("v") ? version : `v${version}`;
}

export function classifyNpmFailure(stderr, stdout) {
  const text = `${stdout}\n${stderr}`;
  if (/E429|rate limit/i.test(text)) return "deferred-rate-limit";
  if (/ENEEDAUTH|401|403|trusted publisher|provenance/i.test(text)) return "deferred";
  if (/E404|not found/i.test(text) && /new package|you cannot publish/i.test(text)) return "deferred-rate-limit";
  if (/ECONNRESET|ENOTFOUND|ETIMEDOUT|503|502|500/i.test(text)) return "deferred";
  if (/cannot publish over|previously published|EPUBLISHCONFLICT|403 Forbidden.*cannot publish/i.test(text)) {
    return "mirrored";
  }
  return "unavailable";
}
