#!/usr/bin/env node
/**
 * Deterministic agent-surface validation. No LLM.
 */
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const catalogPath = join(root, "docs", "reference", "_generated", "catalog.json");
if (!existsSync(catalogPath)) {
  process.stderr.write("agent-check: run `pnpm docs:gen` first (missing catalog.json)\n");
  process.exit(1);
}
const catalog = JSON.parse(await readFile(catalogPath, "utf8"));

const failures = [];
function fail(msg) {
  failures.push(msg);
}

const skillDir = join(root, "skills", "comfy-workflows");
const skillMd = join(skillDir, "SKILL.md");
const requiredRoot = [
  "AGENTS.md",
  "docs/AGENTS.md",
  "src/deps/AGENTS.md",
  "packages/AGENTS.md",
  "skills/comfy-workflows/SKILL.md",
  "docs/public/llms.txt",
  "docs/public/llms-full.txt",
  "docs/public/agent-index.json",
  "docs/guide/agents.md",
  "evals/agents/README.md",
];
for (const rel of requiredRoot) {
  if (!existsSync(join(root, rel))) fail(`missing ${rel}`);
}

const requiredRefs = [
  "mental-model.md",
  "code-first.md",
  "import-existing.md",
  "generated-nodes.md",
  "parameters.md",
  "custom-nodes.md",
  "product-integration.md",
  "packages.md",
  "cli.md",
  "troubleshooting.md",
  "_links.md",
];
for (const f of requiredRefs) {
  if (!existsSync(join(skillDir, "references", f))) fail(`missing skill reference ${f}`);
}

const skillText = existsSync(skillMd) ? await readFile(skillMd, "utf8") : "";
if (!skillText.startsWith("---")) fail("SKILL.md missing YAML frontmatter");
const fmEnd = skillText.indexOf("\n---", 3);
if (fmEnd < 0) fail("SKILL.md frontmatter not closed");
const fm = skillText.slice(3, fmEnd);
if (!/^name:\s*comfy-workflows\s*$/m.test(fm)) fail("SKILL.md frontmatter name must be comfy-workflows");
if (!/description:/m.test(fm)) fail("SKILL.md frontmatter missing description");

if (!pkg.files?.includes("skills")) {
  fail('package.json "files" must include "skills" so the tarball ships the skill');
}

if (!pkg.scripts?.["agent:check"]) fail("package.json missing agent:check script");

if (catalog.version !== pkg.version) {
  fail(`catalog version ${catalog.version} != package.json ${pkg.version}`);
}

const linksMd = existsSync(join(skillDir, "references", "_links.md"))
  ? await readFile(join(skillDir, "references", "_links.md"), "utf8")
  : "";
if (!linksMd.includes(`v${pkg.version}/`)) {
  fail(`skill _links.md does not pin git tag v${pkg.version}`);
}

const agentIndex = JSON.parse(await readFile(join(root, "docs", "public", "agent-index.json"), "utf8"));
if (agentIndex.version !== pkg.version) fail(`agent-index.json version ${agentIndex.version} != ${pkg.version}`);
if (!agentIndex.llms?.includes("/llms.txt")) fail("agent-index.json missing llms.txt");
if (!agentIndex.skill?.packagePath) fail("agent-index.json missing skill.packagePath");

const llms = await readFile(join(root, "docs", "public", "llms.txt"), "utf8");
const llmsFull = await readFile(join(root, "docs", "public", "llms-full.txt"), "utf8");
if (llms.length < 400) fail("llms.txt looks empty");
if (llmsFull.length < 2000) fail("llms-full.txt looks too small");
if (!llms.includes("raw.githubusercontent.com")) fail("llms.txt should route to raw Markdown");
if (!llms.includes("GitHub Release")) fail("llms.txt missing GitHub canonical distribution");

const cliInSkill = await readFile(join(skillDir, "references", "cli.md"), "utf8");
for (const cmd of catalog.cliCommands) {
  if (!cliInSkill.includes(`cwf ${cmd}`) && !cliInSkill.includes(`cwf ${cmd} `)) {
    if (!new RegExp(`cwf ${cmd}\\b`).test(cliInSkill)) {
      fail(`skill CLI reference missing command ${cmd}`);
    }
  }
}

const requiredCommandsInAgents = ["pnpm typecheck", "pnpm test", "pnpm docs:check", "pnpm build", "pnpm build:packages"];
const agentsRoot = await readFile(join(root, "AGENTS.md"), "utf8");
for (const c of requiredCommandsInAgents) {
  if (!agentsRoot.includes(c)) fail(`AGENTS.md missing command ${c}`);
}

async function walkMd(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walkMd(p)));
    else if (e.name.endsWith(".md")) out.push(p);
  }
  return out;
}

const skillFiles = existsSync(skillDir) ? await walkMd(skillDir) : [];
const agentFacing = [
  join(root, "AGENTS.md"),
  join(root, "docs", "AGENTS.md"),
  join(root, "src", "deps", "AGENTS.md"),
  join(root, "packages", "AGENTS.md"),
  join(root, "docs", "guide", "agents.md"),
  join(root, "docs", "public", "llms.txt"),
  join(root, "docs", "public", "llms-full.txt"),
  ...skillFiles,
];

function isInstructionalEditIr(text) {
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const l = line.trim().toLowerCase();
    if (!l.includes("workflow.ir.json")) continue;
    const negated =
      /\b(do not|don't|never|not |generated|do not hand-edit|must not)\b/i.test(line) ||
      /\| \*\*no\*\*/i.test(line) ||
      /\*\*no\*\*/i.test(line) ||
      /generated\. do not/i.test(line);
    const instructs = /^(-\s*)?(please\s+)?(edit|patch|hand-edit|modify|update|change)\b/i.test(l);
    if (instructs && !negated) return line;
  }
  return null;
}

function hasPositiveNpmCanonical(text) {
  return /npm(js)? is (the )?canonical/i.test(text) && !/not (the )?canonical/i.test(text);
}

function teachesSecondCompiler(text) {
  return /implement(?: another)? graph ir compiler in python/i.test(text) && !/do not/i.test(text);
}

function teachesRawNodeDefault(text) {
  return /rawnode is (the )?(default|normal|primary) custom-node/i.test(text);
}

function teachesAutoSetupYes(text) {
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!/setup --yes/i.test(line)) continue;
    const negated = /\b(do not|don't|never|not |unless|only if|only with|without user)\b/i.test(line);
    if (!negated && /run `?cwf setup --yes/i.test(line)) return line;
  }
  return null;
}

for (const file of agentFacing) {
  if (!existsSync(file)) continue;
  const text = await readFile(file, "utf8");
  const rel = relative(root, file).replaceAll("\\", "/");
  const badIr = isInstructionalEditIr(text);
  if (badIr) fail(`${rel} instructs editing workflow.ir.json: ${badIr.slice(0, 120)}`);
  if (hasPositiveNpmCanonical(text)) fail(`${rel} teaches npm as canonical`);
  if (teachesSecondCompiler(text)) fail(`${rel} teaches a second compiler`);
  if (teachesRawNodeDefault(text)) fail(`${rel} teaches rawNode as default custom-node API`);
  const autoYes = teachesAutoSetupYes(text);
  if (autoYes) fail(`${rel} instructs setup --yes: ${autoYes.slice(0, 120)}`);
}

for (const file of skillFiles) {
  const text = await readFile(file, "utf8");
  const rel = relative(root, file).replaceAll("\\", "/");
  const linkRe = /\[[^\]]*\]\(([^)]+)\)/g;
  let m;
  while ((m = linkRe.exec(text))) {
    const href = m[1].split("#")[0].split("?")[0];
    if (!href || href.startsWith("http") || href.startsWith("mailto:")) continue;
    const target = resolve(dirname(file), href);
    if (!existsSync(target)) fail(`${rel} broken relative link ${href}`);
  }
}

const requiredPhrases = [
  [skillText, "Graph IR", "SKILL.md"],
  [skillText, "rawNode", "SKILL.md"],
  [skillText, "setup", "SKILL.md"],
  [skillText, "GitHub", "SKILL.md"],
  [await readFile(join(skillDir, "references", "product-integration.md"), "utf8"), "compiler", "product-integration.md"],
  [await readFile(join(skillDir, "references", "custom-nodes.md"), "utf8"), "inspect", "custom-nodes.md"],
];
for (const [text, needle, label] of requiredPhrases) {
  if (!text.includes(needle)) fail(`${label} missing ${JSON.stringify(needle)}`);
}

if (skillText.split(/\n/).length > 500) {
  fail(`SKILL.md is ${skillText.split(/\n/).length} lines; keep the operating manual under 500`);
}

const evalsDir = join(root, "evals", "agents");
const requiredEvals = [
  "code-first-workflow.md",
  "modify-workflow.md",
  "runtime-parameter.md",
  "custom-node.md",
  "python-product-integration.md",
  "import-existing.md",
  "package-workflow.md",
  "acceptance-scenarios.md",
];
for (const f of requiredEvals) {
  if (!existsSync(join(evalsDir, f))) fail(`missing eval ${f}`);
}

if (failures.length) {
  process.stderr.write(failures.map((f) => `agent-check: ${f}`).join("\n") + "\n");
  process.exit(1);
}

const skillBytes = Buffer.byteLength(skillText, "utf8");
process.stdout.write(
  `agent-check: ok (skill ${skillText.split(/\n/).length} lines / ~${Math.round(skillBytes / 4)} tokens, ${requiredRefs.length} refs, v${pkg.version})\n`,
);
