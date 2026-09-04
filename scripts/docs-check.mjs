#!/usr/bin/env node
/**
 * Validate docs against the current SDK. Run from repo root after docs-gen.
 */
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const docsRoot = join(root, "docs");
const catalog = JSON.parse(
  await readFile(join(docsRoot, "reference", "_generated", "catalog.json"), "utf8"),
);
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));

const failures = [];

function fail(msg) {
  failures.push(msg);
}

if (catalog.version !== pkg.version) {
  fail(`generated catalog version ${catalog.version} != package.json ${pkg.version}`);
}

const requiredCommands = [
  "init",
  "import",
  "suggest",
  "expose",
  "snapshot",
  "lock",
  "codegen",
  "compile",
  "validate",
  "run",
  "pack",
  "inspect",
  "resolve-nodes",
  "node-pack",
  "setup",
  "explain",
  "catalog",
];
for (const cmd of requiredCommands) {
  if (!catalog.cliCommands.includes(cmd)) fail(`CLI command missing from generated help: ${cmd}`);
}

const requiredCodes = [
  "E_TYPE_MISMATCH",
  "E_UNBOUND_PARAM",
  "E_UNBOUND_PORT",
  "E_UNRESOLVED_BYPASS",
  "E_MUTED_CONSUMED",
  "E_NODE_PACK_AMBIGUOUS",
  "E_NODE_PACK_UNKNOWN",
  "E_NODE_PACK_VERSION_UNSATISFIED",
  "E_COMFY_PYTHON_UNKNOWN",
];
for (const code of requiredCodes) {
  if (!catalog.errorCodes.includes(code)) fail(`error code missing from source: ${code}`);
}

const forbidden = [
  "comfy-sdk/",
  "from \"comfy-sdk",
  "@stepupgaming/comfy-sdk",
  "0.2.8",
  "0.2.10",
  "0.2.11",
];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".vitepress" || e.name === "_generated") continue;
      files.push(...(await walk(p)));
    } else if (e.name.endsWith(".md") || e.name.endsWith(".mts") || e.name.endsWith(".vue")) {
      files.push(p);
    }
  }
  return files;
}

const mdFiles = await walk(docsRoot);
for (const file of mdFiles) {
  const text = await readFile(file, "utf8");
  const rel = relative(root, file).replaceAll("\\", "/");
  for (const needle of forbidden) {
    if (text.includes(needle) && !rel.endsWith("compatibility.md")) {
      fail(`${rel} contains stale token ${JSON.stringify(needle)}`);
    }
  }
}

const requiredPages = [
  "docs/index.md",
  "docs/start/what-is.md",
  "docs/start/choose-your-path.md",
  "docs/start/what-do-i-edit.md",
  "docs/code/quickstart.md",
  "docs/migrate/import.md",
  "docs/product/architecture.md",
  "docs/product/build-time-vs-runtime.md",
  "docs/concepts/mental-model.md",
  "docs/reference/cli.md",
  "docs/reference/errors.md",
  "docs/guide/custom-nodes.md",
];
for (const p of requiredPages) {
  try {
    await readFile(join(root, p));
  } catch {
    fail(`missing required page ${p}`);
  }
}

if (failures.length) {
  process.stderr.write(failures.map((f) => `docs-check: ${f}`).join("\n") + "\n");
  process.exit(1);
}
process.stdout.write(
  `docs-check: ok (${mdFiles.length} pages, ${catalog.cliCommands.length} commands, ${catalog.errorCodes.length} codes)\n`,
);
