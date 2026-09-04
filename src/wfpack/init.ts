import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cloneGraph } from "../ir/graph.js";
import { serializeGraph } from "../ir/serialize.js";
import { emitTs } from "../emit-ts/emit.js";
import type { Graph } from "../ir/types.js";
import type { NodeDefs } from "../defs/types.js";
import type { WorkflowManifest, WorkflowNodePack } from "./manifest.js";
import { stringifyManifest } from "./write.js";
import {
  WORKFLOW_MANIFEST_FILENAME,
  WORKFLOW_PACKAGE_JSON_KEY,
  WORKFLOW_PACKAGE_KEYWORDS,
} from "./manifest.js";
import { deriveNodeClasses } from "./discover.js";
import { isCoreNodeClass } from "../deps/core.js";
import { analyzePortability, type PortabilityFinding } from "./portability.js";
import { suggestParams, type SuggestedParam } from "./suggest.js";
import { ComfyError, ErrorCodes } from "../errors.js";

/**
 * Compatibility policy (0.x): a workflow package declares
 * `^0.<minor>.0` of the core it was built against. `^0.2.0` accepts
 * 0.2.1 but not 0.3.0. From 1.x onward the range is `^<major>.0.0`.
 */
export function corePeerRange(coreVersion: string): string {
  const m = /^(\d+)\.(\d+)\.\d+/.exec(coreVersion.trim());
  if (!m) {
    throw new ComfyError({
      code: ErrorCodes.InvalidGraph,
      message: `Cannot derive a peer range from core version "${coreVersion}"`,
      hint: "Pass a semver string like 0.2.1, or omit coreVersion to read this package's version.",
    });
  }
  const major = Number(m[1]);
  const minor = Number(m[2]);
  return major === 0 ? `^0.${minor}.0` : `^${major}.0.0`;
}

/** Version of the installed/published core package this module ships in. */
export function readCorePackageVersion(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    const file = join(dir, "package.json");
    if (existsSync(file)) {
      try {
        const json = JSON.parse(readFileSync(file, "utf8")) as { name?: string; version?: string };
        if (json.name === "@stepupgaming/comfy-workflows" && typeof json.version === "string") {
          return json.version;
        }
      } catch {
        /* keep walking */
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new ComfyError({
    code: ErrorCodes.InvalidGraph,
    message: "Cannot read @stepupgaming/comfy-workflows version from package.json",
    hint: "Pass coreVersion explicitly to generatePackage().",
  });
}

export interface PackageNameParts {
  /** npm package name as it will appear in package.json (scoped or unscoped). */
  npmName: string;
  /** Directory name to create (unscoped last segment). */
  dirName: string;
  /** Manifest machine identity (unscoped, kebab). */
  workflowName: string;
  /** Human title. */
  title: string;
}

const SCOPED = /^(@[A-Za-z0-9-~][A-Za-z0-9-._~]*)\/([A-Za-z0-9-~][A-Za-z0-9-._~]*)$/;
const UNSCOPED = /^[a-z0-9-~][a-z0-9-._~]*$/;

function fail(message: string, hint?: string): never {
  throw new ComfyError({ code: ErrorCodes.InvalidGraph, message, hint });
}

/** Infer npm/package identity from `cwf init <name>` or a source filename. */
export function inferPackageName(raw: string): PackageNameParts {
  const trimmed = raw.trim();
  if (trimmed.length === 0) fail("Package name is empty");
  // Drop a trailing .json if the user passed a filename as the name.
  const withoutExt = trimmed.replace(/\.json$/i, "");
  const scoped = withoutExt.match(SCOPED);
  if (scoped) {
    const scope = scoped[1].toLowerCase();
    const pkg = scoped[2].toLowerCase();
    const npmName = `${scope}/${pkg}`;
    return {
      npmName,
      dirName: pkg,
      workflowName: kebab(pkg),
      title: titleCase(pkg),
    };
  }
  const kebabName = kebab(withoutExt.split(/[/\\]/).pop() ?? withoutExt);
  if (!UNSCOPED.test(kebabName))
    fail(
      `Invalid package name "${trimmed}"`,
      'Use an unscoped name like "portrait-v2" or a scoped name like "@alice/portrait". Do not default to @stepupgaming.',
    );
  return {
    npmName: kebabName,
    dirName: kebabName,
    workflowName: kebabName,
    title: titleCase(kebabName),
  };
}

function kebab(s: string): string {
  return s
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function titleCase(s: string): string {
  return kebab(s)
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export interface GeneratedPackageFiles {
  "package.json": string;
  "comfy.workflow.json": string;
  "workflow.ir.json": string;
  "workflow.ts": string;
  "README.md": string;
  ".gitignore": string;
}

export interface InitPackageResult {
  files: GeneratedPackageFiles;
  manifest: WorkflowManifest;
  portability: PortabilityFinding[];
  suggestions: SuggestedParam[];
  nodeClasses: string[];
}

export interface InitPackageOptions {
  name: PackageNameParts;
  graph: Graph;
  defs?: NodeDefs;
  /** Optional description; otherwise a placeholder. */
  description?: string;
  /**
   * Semver range for peerDependency / manifest coreVersion.
   * Omit to derive `corePeerRange(readCorePackageVersion())` from this
   * package — never a hardcoded fallback.
   */
  coreVersion?: string;
  /** Optional resolved node packs (metadata only — init never installs). */
  nodePacks?: WorkflowNodePack[];
}

function scalarDefault(value: unknown): string | number | boolean | undefined {
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return value;
  if (typeof value === "bigint") {
    const n = Number(value);
    if (Number.isSafeInteger(n) && BigInt(n) === value) return n;
  }
  return undefined;
}

function outputType(graph: Graph, nodeId: string, out: number, defs?: NodeDefs): string {
  const node = graph.nodes[nodeId];
  if (!node) return "UNKNOWN";
  if (node.outputTypes?.[out]) return node.outputTypes[out];
  const def = defs?.[node.type];
  if (def?.outputs[out]?.type) return def.outputs[out].type;
  if (def?.outputNode) return "IMAGE";
  return "IMAGE";
}

export function buildManifest(opts: InitPackageOptions): WorkflowManifest {
  const { name, graph, defs, description, coreVersion } = opts;
  const parameters: WorkflowManifest["parameters"] = {};
  for (const [pname, def] of Object.entries(graph.params ?? {})) {
    const required = def.default === undefined;
    const param: WorkflowManifest["parameters"][string] = { type: def.type, required };
    if (def.description !== undefined) param.description = def.description;
    if (def.options !== undefined) param.options = def.options;
    if (def.default !== undefined) {
      const d = scalarDefault(def.default);
      if (d !== undefined) param.default = d;
    }
    parameters[pname] = param;
  }
  const outputs = graph.outputs.map((o, i) => ({
    name: o.name ?? `output-${i}`,
    type: outputType(graph, o.node, o.out, defs),
  }));
  const models: WorkflowManifest["requires"]["models"] = [];
  for (const f of analyzePortability(graph)) {
    if (f.kind === "checkpoint" || f.kind === "model") {
      models.push({ kind: f.kind, name: f.value });
    }
  }
  const manifest: WorkflowManifest = {
    specVersion: (opts.nodePacks?.length ?? 0) > 0 ? 2 : 1,
    name: name.workflowName,
    title: name.title,
    entry: "./workflow.ir.json",
    description:
      description ??
      `Imported ComfyUI workflow packaged as ${name.npmName}. Verify license and redistribution rights before publishing.`,
    parameters,
    outputs,
    requires: {
      nodeClasses: deriveNodeClasses(graph),
      nodePacks: opts.nodePacks ?? [],
      models,
    },
  };
  if (coreVersion !== undefined) manifest.coreVersion = coreVersion;
  return manifest;
}

function generateReadme(opts: {
  name: PackageNameParts;
  manifest: WorkflowManifest;
  nodeClasses: string[];
}): string {
  const { name, manifest, nodeClasses } = opts;
  const required = Object.entries(manifest.parameters).filter(([, p]) => p.required);
  const optional = Object.entries(manifest.parameters).filter(([, p]) => !p.required);
  const paramFlags = required
    .map(([n]) => `--param ${n}=...`)
    .concat(
      optional.slice(0, 1).map(([n, p]) => `--param ${n}=${JSON.stringify(p.default ?? "...")}`),
    );
  const runExample =
    paramFlags.length > 0
      ? `cwf run ${name.npmName} --url http://127.0.0.1:8188 \\\n  ${paramFlags.join(" \\\n  ")}`
      : `cwf run ${name.npmName} --url http://127.0.0.1:8188`;

  const reqLines =
    required.length === 0
      ? "- (none — this package is a concrete graph)"
      : required
          .map(([n, p]) => `- \`${n}\` (${p.type}${p.description ? `: ${p.description}` : ""})`)
          .join("\n");
  const optLines =
    optional.length === 0
      ? "- (none)"
      : optional
          .map(([n, p]) => {
            const def = p.default !== undefined ? `, default ${JSON.stringify(p.default)}` : "";
            return `- \`${n}\` (${p.type}${def}${p.description ? `: ${p.description}` : ""})`;
          })
          .join("\n");
  const modelLines =
    manifest.requires.models.length === 0
      ? "- (none declared — check portability warnings from `cwf init` / `cwf suggest`)"
      : manifest.requires.models
          .map((m) => `- ${m.kind}: \`${m.name}\`${m.optional ? " (optional)" : ""}`)
          .join("\n");
  const nodeLines = nodeClasses.map((c) => `- ${c}`).join("\n");
  const packLines =
    manifest.requires.nodePacks.length === 0
      ? ""
      : manifest.requires.nodePacks
          .map((p) => {
            const classes =
              (p.provides ?? []).length > 0 ? ` (${(p.provides ?? []).join(", ")})` : "";
            return `- \`${p.id}\`${p.version ? `@${p.version}` : ""}${classes}`;
          })
          .join("\n");
  const hasCustom =
    manifest.requires.nodePacks.length > 0 || nodeClasses.some((c) => !isCoreNodeClass(c));
  const customSection = hasCustom
    ? [
        "",
        "## Custom nodes",
        "",
        packLines ? "Declared node packs:\n\n" + packLines + "\n" : "",
        "Check:",
        "",
        "```sh",
        `cwf inspect ${name.npmName} --url http://127.0.0.1:8188`,
        "```",
        "",
        "Prepare a local Comfy installation (this installs executable Python via Comfy Registry / Manager — approval required):",
        "",
        "```sh",
        `cwf setup ${name.npmName} --comfy <ComfyUI-path>`,
        "```",
        "",
        "`cwf run` never installs custom nodes. Unresolved classes need `cwf node-pack map` / `cwf resolve-nodes --write`. Setup asks before installing executable Python.",
        "",
      ].join("\n")
    : "";

  return [
    `# ${manifest.title}`,
    "",
    manifest.description ?? "",
    "",
    "## Source",
    "",
    "Imported from a ComfyUI workflow JSON. Edit `workflow.ts` if you want a typed authoring surface; `workflow.ir.json` remains the canonical payload.",
    "",
    "## Install",
    "",
    "```sh",
    `pnpm add ${name.npmName}`,
    "```",
    "",
    "## Required parameters",
    "",
    reqLines,
    "",
    "## Optional parameters",
    "",
    optLines,
    "",
    "## Node requirements",
    "",
    nodeLines || "- (none)",
    "",
    "## Model requirements",
    "",
    modelLines,
    "",
    "## Inspect & run",
    "",
    "```sh",
    `cwf inspect ${name.npmName} --url http://127.0.0.1:8188`,
    "",
    runExample,
    "```",
    customSection,
    "",
    "Or from this directory after `cwf pack`:",
    "",
    "```sh",
    "cwf inspect .",
    "cwf run . --url http://127.0.0.1:8188",
    "```",
    "",
    "## License / redistribution",
    "",
    "This package was generated from an existing ComfyUI workflow. Importing a workflow does **not** grant redistribution rights to any models, custom nodes, images, or the workflow itself. Verify the license of every asset and of the source workflow before you `npm publish`.",
    "",
    "The generated `package.json` defaults to MIT for the *package scaffolding only* — change it if that does not match the source.",
    "",
    "## Docs",
    "",
    "- [Convert a ComfyUI workflow into a package](https://stepupgaming.github.io/comfy-workflows/guide/convert-workflow)",
    "- [Workflow packages](https://stepupgaming.github.io/comfy-workflows/guide/packages)",
    "",
    "## Git (optional)",
    "",
    "```sh",
    "git init",
    "git add .",
    'git commit -m "Initial workflow package"',
    "```",
    "",
    "Package format is host-agnostic (npm, GitHub Packages, or a local tarball). Adjust install instructions for your publisher.",
    "",
  ].join("\n");
}

const GITIGNORE = ["node_modules/", "dist/", "*.tgz", ".DS_Store", ""].join("\n");

export function generatePackage(opts: InitPackageOptions): InitPackageResult {
  const graph = cloneGraph(opts.graph);
  if (graph.name === undefined) graph.name = opts.name.workflowName;
  const built = { ...opts, graph };
  const manifest = buildManifest(built);
  const nodeClasses = deriveNodeClasses(graph);
  const coreVersion = opts.coreVersion ?? corePeerRange(readCorePackageVersion());
  manifest.coreVersion = coreVersion;
  const packageJson: Record<string, unknown> = {
    name: opts.name.npmName,
    version: "0.1.0",
    description: manifest.description,
    type: "module",
    license: "MIT",
    keywords: [...WORKFLOW_PACKAGE_KEYWORDS],
    [WORKFLOW_PACKAGE_JSON_KEY]: `./${WORKFLOW_MANIFEST_FILENAME}`,
    files: ["workflow.ir.json", WORKFLOW_MANIFEST_FILENAME, "workflow.ts", "README.md"],
    engines: { node: ">=22" },
    // workflow.ts imports the core package; inspect/run never execute it.
    peerDependencies: {
      "@stepupgaming/comfy-workflows": coreVersion,
    },
  };
  const files: GeneratedPackageFiles = {
    "package.json": JSON.stringify(packageJson, null, 2) + "\n",
    "comfy.workflow.json": stringifyManifest(manifest),
    "workflow.ir.json": serializeGraph(graph, { pretty: true }) + "\n",
    "workflow.ts": emitTs(graph, { defs: opts.defs, moduleName: opts.name.workflowName }) + "\n",
    "README.md": generateReadme({ name: opts.name, manifest, nodeClasses }),
    ".gitignore": GITIGNORE,
  };
  return {
    files,
    manifest,
    portability: analyzePortability(graph),
    suggestions: suggestParams(graph, opts.defs),
    nodeClasses,
  };
}
