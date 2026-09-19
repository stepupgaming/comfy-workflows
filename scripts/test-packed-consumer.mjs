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
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

function assertAgentSkillsCurrent(json, pkgVersion) {
  if (json.ok !== true) throw new Error(`agent report not ok: ${JSON.stringify(json)}`);
  const skills = json.skills;
  if (!Array.isArray(skills) || skills.length !== 2) {
    throw new Error(`expected 2 skills, got ${JSON.stringify(json)}`);
  }
  const names = new Set(skills.map((s) => s.skill));
  for (const name of ["comfy-workflows", "comfy-custom-nodes"]) {
    if (!names.has(name)) throw new Error(`missing skill ${name} in ${JSON.stringify(json)}`);
  }
  for (const row of skills) {
    if (row.status !== "current") {
      throw new Error(`agent check ${row.skill} status ${row.status}, expected current`);
    }
    if (row.installed !== true) throw new Error(`agent check ${row.skill} installed !== true`);
    if (row.coreVersion !== pkgVersion) {
      throw new Error(`agent check ${row.skill} coreVersion ${row.coreVersion} != ${pkgVersion}`);
    }
  }
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
  const recipes = await import("@stepupgaming/comfy-workflows/recipes");
  if (typeof core.workflow !== "function") throw new Error("no workflow");
  if (typeof core.isCoreNodeClass !== "function") throw new Error("no isCoreNodeClass");
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

const installedRoot = join(consumer, "node_modules", "@stepupgaming", "comfy-workflows");
const skillMd = join(installedRoot, "skills", "comfy-workflows", "SKILL.md");
if (!existsSync(skillMd)) throw new Error(`packed skill missing: ${skillMd}`);
const skillBody = readFileSync(skillMd, "utf8");
for (const needle of ["Graph IR", "ir.build.ts", "Do not reimplement", "comfy-custom-nodes"]) {
  if (!skillBody.includes(needle)) throw new Error(`packed SKILL.md missing ${needle}`);
}
if (!existsSync(join(installedRoot, "skills", "comfy-workflows", "references", "code-first.md"))) {
  throw new Error("packed skill references missing");
}
const customSkillMd = join(installedRoot, "skills", "comfy-custom-nodes", "SKILL.md");
if (!existsSync(customSkillMd)) throw new Error(`packed custom-node skill missing: ${customSkillMd}`);
const customSkillBody = readFileSync(customSkillMd, "utf8");
for (const needle of ["rawNode", "comfy node install", "codegen"]) {
  if (!customSkillBody.includes(needle)) throw new Error(`packed custom-node SKILL.md missing ${needle}`);
}
if (!existsSync(join(installedRoot, "skills", "comfy-custom-nodes", "references", "custom-nodes.md"))) {
  throw new Error("packed custom-node skill references missing");
}

const binJs = join(installedRoot, "dist", "cli", "bin.js");
const help = await run(process.execPath, [binJs, "--help"], { cwd: consumer, echo: true });
if (help.code !== 0) throw new Error(`cwf --help failed\n${help.stderr}`);
for (const needle of ["inspect", "codegen", "agent install"]) {
  if (!help.stdout.includes(needle)) {
    throw new Error(`cwf --help missing ${needle}\n${help.stdout}`);
  }
}
if (/\bcwf setup\b/.test(help.stdout) || help.stdout.includes("resolve-nodes")) {
  throw new Error(`cwf --help still lists removed installer commands\n${help.stdout}`);
}

const agentInstall = await run(process.execPath, [binJs, "agent", "install", "--json"], {
  cwd: consumer,
  echo: true,
});
if (agentInstall.code !== 0) {
  throw new Error(`cwf agent install failed\n${agentInstall.stdout}\n${agentInstall.stderr}`);
}
const projectSkill = join(consumer, ".agents", "skills", "comfy-workflows", "SKILL.md");
if (!existsSync(projectSkill)) throw new Error(`project skill missing: ${projectSkill}`);
if (!existsSync(join(consumer, ".agents", "skills", "comfy-workflows", "references", "code-first.md"))) {
  throw new Error("project skill references missing");
}
if (!existsSync(join(consumer, ".agents", "skills", "comfy-custom-nodes", "SKILL.md"))) {
  throw new Error("project custom-node skill missing");
}
const projectSkillBody = readFileSync(projectSkill, "utf8");
if (!/^name:\s*comfy-workflows\s*$/m.test(projectSkillBody)) {
  throw new Error("installed project skill frontmatter name is not comfy-workflows");
}

const agentCheck = await run(process.execPath, [binJs, "agent", "check", "--json"], {
  cwd: consumer,
  echo: true,
});
if (agentCheck.code !== 0) {
  throw new Error(`cwf agent check failed\n${agentCheck.stdout}\n${agentCheck.stderr}`);
}
const checkJson = JSON.parse(agentCheck.stdout.slice(agentCheck.stdout.indexOf("{")));
const pkgVersion = JSON.parse(readFileSync(join(installedRoot, "package.json"), "utf8")).version;
assertAgentSkillsCurrent(checkJson, pkgVersion);

console.log("packed-consumer acceptance OK");
