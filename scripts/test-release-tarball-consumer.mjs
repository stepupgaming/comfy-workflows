#!/usr/bin/env node
/**
 * Anonymous GitHub Release tarball consumer acceptance.
 *
 * Uses exact packed .tgz files. No registry auth. No npmjs.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { artifactsDir, npm, run, tarballBasename } from "./release-lib.mjs";

const manifestPath = join(artifactsDir, "manifest.json");
if (!existsSync(manifestPath)) {
  throw new Error("release-artifacts/manifest.json missing — run `node scripts/release-pack.mjs` first");
}
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const core = manifest.packages.find((p) => p.kind === "core");
const workflow = manifest.packages.find((p) => p.name === "@stepupgaming/comfy-workflow-t2i") ?? manifest.packages.find((p) => p.kind === "workflow");
if (!core || !workflow) throw new Error("packed catalog is missing core or a workflow package");

const coreTgz = join(artifactsDir, core.file ?? tarballBasename(core.name, core.version));
const wfTgz = join(artifactsDir, workflow.file ?? tarballBasename(workflow.name, workflow.version));
if (!existsSync(coreTgz) || !existsSync(wfTgz)) {
  throw new Error(`missing tarball(s): ${coreTgz} ${wfTgz}`);
}

const consumer = mkdtempSync(join(tmpdir(), "cwf-tgz-"));
const cleanup = () => {
  try {
    rmSync(consumer, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
};
process.on("exit", cleanup);

writeFileSync(
  join(consumer, "package.json"),
  JSON.stringify({ name: "cwf-tarball-consumer", type: "module", private: true }),
);

const env = { ...process.env };
delete env.NODE_AUTH_TOKEN;
delete env.NPM_CONFIG_REGISTRY;

await npm(["install", coreTgz, wfTgz, "--no-audit", "--no-fund", "--ignore-scripts"], consumer, true, env);

const check = `
  const core = await import("@stepupgaming/comfy-workflows");
  const deps = await import("@stepupgaming/comfy-workflows/deps");
  const recipes = await import("@stepupgaming/comfy-workflows/recipes");
  if (typeof core.workflow !== "function") throw new Error("no workflow");
  if (typeof deps.createSetupPlan !== "function") throw new Error("no createSetupPlan");
  const g = recipes.textToImage({ checkpoint: "x.safetensors", positivePrompt: "hi", seed: 1 });
  const r = core.compile(g);
  if (!r.ok) throw new Error("compile failed: " + JSON.stringify(r.errors));
  console.log("TARBALL_OK " + r.hash.slice(0, 12));
`;
const imported = await run(process.execPath, ["--input-type=module", "-e", check], { cwd: consumer, echo: true });
if (imported.code !== 0) throw new Error(`tarball import failed\n${imported.stdout}\n${imported.stderr}`);

const installedRoot = join(consumer, "node_modules", "@stepupgaming", "comfy-workflows");
const skillMd = join(installedRoot, "skills", "comfy-workflows", "SKILL.md");
if (!existsSync(skillMd)) throw new Error(`tarball skill missing: ${skillMd}`);

const inspect = await run(
  process.execPath,
  [
    join(consumer, "node_modules", "@stepupgaming", "comfy-workflows", "dist", "cli", "bin.js"),
    "inspect",
    workflow.name,
    "--json",
  ],
  { cwd: consumer, echo: true },
);
if (inspect.code !== 0) throw new Error(`cwf inspect failed\n${inspect.stdout}\n${inspect.stderr}`);

const help = await run(
  process.execPath,
  [join(consumer, "node_modules", "@stepupgaming", "comfy-workflows", "dist", "cli", "bin.js"), "--help"],
  { cwd: consumer, echo: true },
);
if (help.code !== 0 || !help.stdout.includes("setup") || !help.stdout.includes("agent install")) {
  throw new Error(`cwf --help failed\n${help.stdout}\n${help.stderr}`);
}

const binJs = join(installedRoot, "dist", "cli", "bin.js");
const agentInstall = await run(process.execPath, [binJs, "agent", "install", "--json"], {
  cwd: consumer,
  echo: true,
});
if (agentInstall.code !== 0) {
  throw new Error(`cwf agent install failed\n${agentInstall.stdout}\n${agentInstall.stderr}`);
}
const projectSkill = join(consumer, ".agents", "skills", "comfy-workflows", "SKILL.md");
if (!existsSync(projectSkill)) throw new Error(`tarball project skill missing: ${projectSkill}`);
const agentCheck = await run(process.execPath, [binJs, "agent", "check", "--json"], {
  cwd: consumer,
  echo: true,
});
if (agentCheck.code !== 0) throw new Error(`cwf agent check failed\n${agentCheck.stderr}`);
const st = JSON.parse(agentCheck.stdout.slice(agentCheck.stdout.indexOf("{")));
if (st.status !== "current") throw new Error(`tarball agent check ${st.status}`);

console.log("release-tarball consumer acceptance OK");
