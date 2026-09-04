#!/usr/bin/env node
/**
 * Clean tarball consumer acceptance.
 *
 * Packs the current core, installs the exact .tgz into a fresh temp project,
 * then proves the published surface: deps APIs, CLI shims, --help, compile.
 *
 * Not a Vitest worker. CI and release.yml run this after build/tests.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const nodeDir = join(process.execPath, "..");
const npmCliCandidates = [
  join(nodeDir, "node_modules", "npm", "bin", "npm-cli.js"),
  join(nodeDir, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
  join(nodeDir, "..", "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
];
const npmCli = npmCliCandidates.find((p) => existsSync(p));
if (npmCli === undefined) {
  throw new Error(`Cannot locate npm-cli.js beside ${process.execPath}`);
}
if (!existsSync(join(root, "dist", "index.js"))) {
  throw new Error("dist/index.js missing — run `pnpm build` first");
}

function run(command, args, opts) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      windowsHide: true,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (b) => {
      const s = b.toString("utf8");
      stdout += s;
      if (opts.echo) process.stdout.write(s);
    });
    child.stderr.on("data", (b) => {
      const s = b.toString("utf8");
      stderr += s;
      if (opts.echo) process.stderr.write(s);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function npm(args, cwd, echo = false) {
  const result = await run(process.execPath, [npmCli, ...args], { cwd, echo });
  if (result.code !== 0) {
    throw new Error(
      `npm ${args.join(" ")} failed (${result.code})\n${result.stdout}\n${result.stderr}`,
    );
  }
  return result;
}

const tmp = mkdtempSync(join(tmpdir(), "cwf-tarball-"));
const consumer = mkdtempSync(join(tmpdir(), "cwf-consumer-"));
const cleanup = () => {
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  try {
    rmSync(consumer, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
};
process.on("exit", cleanup);

const packed = await npm(
  ["pack", "--pack-destination", tmp, "--ignore-scripts"],
  root,
  true,
);
const tgzBase = packed.stdout.trim().split(/\r?\n/).pop().trim();
const tgzPath = join(tmp, tgzBase.split(/[\\/]/).pop());
if (!existsSync(tgzPath)) throw new Error(`packed tarball missing: ${tgzPath}`);

writeFileSync(
  join(consumer, "package.json"),
  JSON.stringify({ name: "cwf-consumer-test", type: "module", private: true }),
);

await npm(
  ["install", tgzPath, "--no-audit", "--no-fund", "--ignore-scripts"],
  consumer,
  true,
);

const check = `
  const core = await import("@stepupgaming/comfy-workflows");
  const deps = await import("@stepupgaming/comfy-workflows/deps");
  const recipes = await import("@stepupgaming/comfy-workflows/recipes");
  if (typeof core.workflow !== "function") throw new Error("no workflow");
  if (typeof deps.createSetupPlan !== "function") throw new Error("no createSetupPlan");
  if (typeof deps.resolveNodeClasses !== "function") throw new Error("no resolveNodeClasses");
  const g = recipes.textToImage({ checkpoint: "x.safetensors", positivePrompt: "hi", seed: 1 });
  const r = core.compile(g);
  if (!r.ok) throw new Error("compile failed: " + JSON.stringify(r.errors));
  console.log("CONSUMER_OK " + r.hash.slice(0, 12));
`;
const imported = await run(process.execPath, ["--input-type=module", "-e", check], {
  cwd: consumer,
  echo: true,
});
if (imported.code !== 0) {
  throw new Error(`consumer import failed\n${imported.stdout}\n${imported.stderr}`);
}
if (!/CONSUMER_OK [0-9a-f]{12}/.test(imported.stdout)) {
  throw new Error(`missing CONSUMER_OK in:\n${imported.stdout}`);
}

const binDir = join(consumer, "node_modules", ".bin");
const shim = (name) =>
  process.platform === "win32"
    ? [join(binDir, `${name}.cmd`), join(binDir, name)].find((p) => existsSync(p))
    : join(binDir, name);
for (const name of ["cwf", "comfy-workflows"]) {
  const path = shim(name);
  if (!path) throw new Error(`missing installed shim ${name} under ${binDir}`);
}

const binJs = join(
  consumer,
  "node_modules",
  "@stepupgaming",
  "comfy-workflows",
  "dist",
  "cli",
  "bin.js",
);
const help = await run(process.execPath, [binJs, "--help"], { cwd: consumer, echo: true });
if (help.code !== 0) throw new Error(`cwf --help failed\n${help.stderr}`);
for (const needle of ["setup", "resolve-nodes"]) {
  if (!help.stdout.includes(needle)) {
    throw new Error(`cwf --help missing ${needle}\n${help.stdout}`);
  }
}

console.log("packed-consumer acceptance OK");
