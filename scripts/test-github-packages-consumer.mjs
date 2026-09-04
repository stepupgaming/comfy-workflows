#!/usr/bin/env node
/**
 * Authenticated GitHub Packages consumer acceptance.
 *
 * Fresh temp project. Scope mapping is project-local only. No npmjs.
 * Installs core + one first-party workflow from npm.pkg.github.com.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { npm, run } from "./release-lib.mjs";

const token = process.env.GITHUB_TOKEN || process.env.NODE_AUTH_TOKEN;
if (!token) {
  throw new Error("GITHUB_TOKEN is required for the GitHub Packages consumer test");
}

const coreName = process.env.CWF_CORE_PACKAGE || "@stepupgaming/comfy-workflows";
const workflowName = process.env.CWF_WORKFLOW_PACKAGE || "@stepupgaming/comfy-workflow-t2i";
const coreSpec = process.env.CWF_CORE_SPEC || coreName;
const workflowSpec = process.env.CWF_WORKFLOW_SPEC || workflowName;

const consumer = mkdtempSync(join(tmpdir(), "cwf-ghpkg-"));
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
  JSON.stringify({ name: "cwf-ghpkg-consumer", type: "module", private: true }),
);
writeFileSync(
  join(consumer, ".npmrc"),
  [
    "@stepupgaming:registry=https://npm.pkg.github.com",
    "//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}",
    "",
  ].join("\n"),
);

const env = { ...process.env, GITHUB_TOKEN: token, NODE_AUTH_TOKEN: token };
delete env.NPM_CONFIG_REGISTRY;

await npm(["install", coreSpec, workflowSpec, "--no-audit", "--no-fund", "--ignore-scripts"], consumer, true, env);

const check = `
  const core = await import(${JSON.stringify(coreName)});
  const deps = await import(${JSON.stringify(coreName + "/deps")});
  const recipes = await import(${JSON.stringify(coreName + "/recipes")});
  if (typeof core.workflow !== "function") throw new Error("no workflow");
  if (typeof deps.createSetupPlan !== "function") throw new Error("no createSetupPlan");
  const g = recipes.textToImage({ checkpoint: "x.safetensors", positivePrompt: "hi", seed: 1 });
  const r = core.compile(g);
  if (!r.ok) throw new Error("compile failed: " + JSON.stringify(r.errors));
  console.log("GHPKG_OK " + r.hash.slice(0, 12));
`;
const imported = await run(process.execPath, ["--input-type=module", "-e", check], {
  cwd: consumer,
  echo: true,
  env,
});
if (imported.code !== 0) {
  throw new Error(`GitHub Packages import failed\n${imported.stdout}\n${imported.stderr}`);
}

const binJs = join(consumer, "node_modules", "@stepupgaming", "comfy-workflows", "dist", "cli", "bin.js");
const inspect = await run(process.execPath, [binJs, "inspect", workflowName, "--json"], {
  cwd: consumer,
  echo: true,
  env,
});
if (inspect.code !== 0) {
  throw new Error(`cwf inspect failed\n${inspect.stdout}\n${inspect.stderr}`);
}

const help = await run(process.execPath, [binJs, "--help"], { cwd: consumer, echo: true, env });
if (help.code !== 0 || !help.stdout.includes("setup")) {
  throw new Error(`cwf --help failed\n${help.stdout}\n${help.stderr}`);
}

console.log("github-packages consumer acceptance OK");
