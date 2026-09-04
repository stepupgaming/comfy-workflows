#!/usr/bin/env node
/**
 * Generate agent-discovery artifacts from canonical docs + package.json.
 * Invoked by docs-gen. Do not hand-edit the outputs.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const version = pkg.version;
const ownerRepo = "stepupgaming/comfy-workflows";
const site = "https://stepupgaming.github.io/comfy-workflows";
const github = `https://github.com/${ownerRepo}`;
const rawTag = `https://raw.githubusercontent.com/${ownerRepo}/v${version}`;
const rawMain = `https://raw.githubusercontent.com/${ownerRepo}/main`;

const publicDir = join(root, "docs", "public");
const skillRefDir = join(root, "skills", "comfy-workflows", "references");

const TOPICS = [
  ["mental-model", "docs/concepts/mental-model.md", "Mental model"],
  ["what-do-i-edit", "docs/start/what-do-i-edit.md", "What do I edit?"],
  ["choose-your-path", "docs/start/choose-your-path.md", "Choose your path"],
  ["what-is", "docs/start/what-is.md", "What is Comfy Workflows?"],
  ["quickstart", "docs/code/quickstart.md", "Code-first quickstart"],
  ["codegen", "docs/code/codegen.md", "Typed node codegen"],
  ["build-a-graph", "docs/code/build-a-graph.md", "Author a graph"],
  ["parameters", "docs/code/parameters.md", "Parameters"],
  ["connections", "docs/code/connections.md", "Connections"],
  ["composition", "docs/code/composition.md", "Composition"],
  ["recipes", "docs/code/recipes.md", "Recipes"],
  ["import", "docs/migrate/import.md", "Import existing JSON"],
  ["custom-nodes", "docs/guide/custom-nodes.md", "Custom nodes"],
  ["escape-hatches", "docs/code/escape-hatches.md", "rawNode / unsafe"],
  ["architecture", "docs/product/architecture.md", "Product architecture"],
  ["build-time-vs-runtime", "docs/product/build-time-vs-runtime.md", "Build-time vs runtime"],
  ["no-second-compiler", "docs/concepts/no-second-compiler.md", "No second compiler"],
  ["packages", "docs/concepts/packages.md", "Packages"],
  ["distribution", "docs/product/distribution.md", "Distribution"],
  ["security", "docs/product/security.md", "Security"],
  ["cli", "docs/reference/cli.md", "CLI"],
  ["errors", "docs/reference/errors.md", "Error codes"],
  ["api", "docs/reference/api/index.md", "Public API"],
  ["graph-ir", "docs/concepts/graph-ir.md", "Graph IR"],
  ["lossless-integers", "docs/concepts/lossless-integers.md", "Lossless integers"],
  ["agents", "docs/guide/agents.md", "Coding agents"],
  ["manifest", "docs/reference/manifest.md", "Manifest"],
];

function sitePath(docRel) {
  const fromDocs = docRel.replace(/^docs\//, "");
  if (fromDocs.endsWith("/index.md")) {
    return `${site}/${fromDocs.slice(0, -"index.md".length)}`;
  }
  return `${site}/${fromDocs.replace(/\.md$/, "")}`;
}

function stripFrontmatter(text) {
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
}

function inlineIncludes(text, filePath) {
  let out = stripFrontmatter(text);
  out = out.replace(/<EditBadge\b[^>]*\/>/g, "");
  out = out.replace(/<EditBadge\b[\s\S]*?<\/EditBadge>/g, "");
  out = out.replace(/<Flow\b[^>]*\/>/g, "");
  out = out.replace(/<!--@include:\s*([^>]+?)-->/g, (_, spec) => {
    const rel = spec.trim();
    const abs = resolve(dirname(filePath), rel);
    if (!existsSync(abs)) return `\n<!-- missing include ${rel} -->\n`;
    return `\n${stripFrontmatter(readFileSync(abs, "utf8")).trim()}\n`;
  });
  out = out.replace(/<<< @\/([^\s{]+)(?:\{[^}]+\})?/g, (_, rel) => {
    const abs = join(root, "docs", rel);
    if (!existsSync(abs)) return `\n<!-- missing example ${rel} -->\n`;
    const body = readFileSync(abs, "utf8");
    const fence = rel.endsWith(".ts") ? "ts" : rel.endsWith(".js") ? "js" : "";
    return `\n\`\`\`${fence}\n${body.trim()}\n\`\`\`\n`;
  });
  return out.trim() + "\n";
}

const FULL_ORDER = [
  "docs/concepts/mental-model.md",
  "docs/start/what-do-i-edit.md",
  "docs/code/quickstart.md",
  "docs/code/codegen.md",
  "docs/code/parameters.md",
  "docs/code/connections.md",
  "docs/code/composition.md",
  "docs/code/recipes.md",
  "docs/code/escape-hatches.md",
  "docs/guide/custom-nodes.md",
  "docs/product/architecture.md",
  "docs/product/build-time-vs-runtime.md",
  "docs/concepts/no-second-compiler.md",
  "docs/product/security.md",
  "docs/concepts/packages.md",
  "docs/product/distribution.md",
  "docs/reference/cli.md",
  "docs/reference/errors.md",
  "docs/reference/api/index.md",
  "docs/concepts/lossless-integers.md",
  "docs/guide/agents.md",
];

await mkdir(publicDir, { recursive: true });
await mkdir(skillRefDir, { recursive: true });

const llms = [
  "# Comfy Workflows",
  "",
  "Code-first TypeScript SDK and `cwf` CLI for ComfyUI. Author graphs in TypeScript (or import JSON), compile them through Graph IR with the official compiler, and run them on ComfyUI. Unofficial project. Not affiliated with or endorsed by Comfy Org.",
  "",
  `Core package: @stepupgaming/comfy-workflows@${version}`,
  `Human docs: ${site}/`,
  `Skill (in the installed package): skills/comfy-workflows/SKILL.md`,
  `Repo instructions (contributors): ${rawMain}/AGENTS.md`,
  "",
  "## Critical rules",
  "",
  "- TypeScript (`ir.build.ts` / `workflow.ts`) is the normal authored surface.",
  "- Graph IR is the canonical semantic representation. Do not hand-edit generated `workflow.ir.json` or Comfy API JSON.",
  "- Use generated typed nodes from `/object_info` (`cwf codegen`) for known custom nodes.",
  "- `rawNode` is an escape hatch, not the default custom-node API.",
  "- Non-Node applications must not implement another Graph IR compiler. Bind `{$param}` at runtime.",
  "- GitHub Release + GitHub Packages are canonical distribution. npmjs is an optional convenience mirror.",
  "- `inspect` / `init` / `run` never install Python. Only explicit `cwf setup` does, after a printed plan. Do not run `setup --yes` without user intent.",
  "- Seeds use bigint / `{\"$int\":\"...\"}`. Do not round integers past 2^53 through JS `Number`.",
  "",
  "Prefer these raw Markdown URLs over scraping rendered HTML.",
  `Installed-package skills should use the matching git tag \`v${version}\` (see skill \`references/_links.md\`). The live site index below tracks \`main\`.`,
  "",
  "## Start",
  "",
  `- [What is it](${rawMain}/docs/start/what-is.md)`,
  `- [Choose your path](${rawMain}/docs/start/choose-your-path.md)`,
  `- [What do I edit?](${rawMain}/docs/start/what-do-i-edit.md)`,
  `- [Install](${rawMain}/docs/start/install.md)`,
  "",
  "## Build workflows as code",
  "",
  `- [Quickstart](${rawMain}/docs/code/quickstart.md)`,
  `- [Codegen](${rawMain}/docs/code/codegen.md)`,
  `- [Graph](${rawMain}/docs/code/build-a-graph.md)`,
  `- [Parameters](${rawMain}/docs/code/parameters.md)`,
  `- [Connections](${rawMain}/docs/code/connections.md)`,
  `- [Composition](${rawMain}/docs/code/composition.md)`,
  `- [Recipes](${rawMain}/docs/code/recipes.md)`,
  "",
  "## Existing workflows",
  "",
  `- [Import](${rawMain}/docs/migrate/import.md)`,
  `- [Parameterize](${rawMain}/docs/code/parameters.md)`,
  `- [Package](${rawMain}/docs/migrate/package.md)`,
  "",
  "## Product integration",
  "",
  `- [Architecture](${rawMain}/docs/product/architecture.md)`,
  `- [Build-time vs runtime](${rawMain}/docs/product/build-time-vs-runtime.md)`,
  `- [No second compiler](${rawMain}/docs/concepts/no-second-compiler.md)`,
  `- [Multiple environments](${rawMain}/docs/product/environments.md)`,
  `- [CI](${rawMain}/docs/product/ci.md)`,
  "",
  "## Custom nodes",
  "",
  `- [Custom nodes](${rawMain}/docs/guide/custom-nodes.md)`,
  `- [Setup / security](${rawMain}/docs/product/security.md)`,
  `- [Escape hatches](${rawMain}/docs/code/escape-hatches.md)`,
  "",
  "## Reference",
  "",
  `- [API](${rawMain}/docs/reference/api/index.md)`,
  `- [CLI](${rawMain}/docs/reference/cli.md)`,
  `- [Errors](${rawMain}/docs/reference/errors.md)`,
  `- [Graph IR](${rawMain}/docs/concepts/graph-ir.md)`,
  `- [Manifest](${rawMain}/docs/reference/manifest.md)`,
  `- [Distribution](${rawMain}/docs/product/distribution.md)`,
  `- [Coding agents](${rawMain}/docs/guide/agents.md)`,
  "",
  "## Machine files",
  "",
  `- [llms.txt](${site}/llms.txt)`,
  `- [llms-full.txt](${site}/llms-full.txt)`,
  `- [agent-index.json](${site}/agent-index.json)`,
  `- [Skill](${rawMain}/skills/comfy-workflows/SKILL.md)`,
  "",
].join("\n");

await writeFile(join(publicDir, "llms.txt"), llms);

const fullParts = [
  `# Comfy Workflows — agent digest`,
  ``,
  `Generated from canonical docs for @stepupgaming/comfy-workflows@${version}.`,
  `Not a dump of the entire site. Prefer SKILL.md + a single reference when possible.`,
  ``,
];
for (const rel of FULL_ORDER) {
  const abs = join(root, rel);
  const raw = await readFile(abs, "utf8");
  fullParts.push(`\n\n---\n\n# Source: ${rel}\n\n`);
  fullParts.push(inlineIncludes(raw, abs));
}
await writeFile(join(publicDir, "llms-full.txt"), fullParts.join(""));

const topics = {};
for (const [key, rel, title] of TOPICS) {
  topics[key] = {
    title,
    markdown: rawMain + "/" + rel,
    markdownAtTag: rawTag + "/" + rel,
    html: sitePath(rel),
  };
}

const index = {
  name: "comfy-workflows",
  package: "@stepupgaming/comfy-workflows",
  version,
  unofficial: true,
  skill: {
    packagePath: "skills/comfy-workflows/SKILL.md",
    repo: `${github}/blob/v${version}/skills/comfy-workflows/SKILL.md`,
    raw: `${rawTag}/skills/comfy-workflows/SKILL.md`,
  },
  agentsMd: `${rawMain}/AGENTS.md`,
  llms: `${site}/llms.txt`,
  llmsFull: `${site}/llms-full.txt`,
  docs: site + "/",
  github,
  docLinkPolicy:
    "Skill references shipped in the npm-compatible tarball are the version-accurate operating manual. Deep human-doc links from an installed skill use raw GitHub at tag v{version}. The live llms.txt on GitHub Pages tracks main, which matches the deployed docs site.",
  canonicalHost: "github-packages",
  npmMirror: "optional",
  topics,
};

await writeFile(join(publicDir, "agent-index.json"), JSON.stringify(index, null, 2) + "\n");

const linkLines = [
  "<!-- GENERATED by scripts/agent-docs.mjs — do not edit. -->",
  "",
  `# Versioned doc links for @stepupgaming/comfy-workflows@${version}`,
  "",
  "These URLs match **this package version** (git tag). Do not follow live `main` docs for APIs that may have moved.",
  "",
  "Human HTML (same version is not guaranteed on Pages until that tag is deployed): see each topic's `html` in `docs/public/agent-index.json`.",
  "",
];
for (const [key, rel, title] of TOPICS) {
  linkLines.push(`- **${title}** (\`${key}\`): ${rawTag}/${rel}`);
}
linkLines.push("");
await writeFile(join(skillRefDir, "_links.md"), linkLines.join("\n"));

process.stdout.write(
  `agent-docs: llms.txt, llms-full.txt, agent-index.json, skill _links.md (v${version})\n`,
);
