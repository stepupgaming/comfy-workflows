import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { join } from "node:path";
import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";
import { compile } from "../compile/index.js";
import { loadDefsSnapshot } from "../defs/snapshot.js";
import { hashObjectInfo, parseObjectInfo } from "../defs/parse.js";
import type { NodeDefs } from "../defs/types.js";
import { emitTs } from "../emit-ts/emit.js";
import { generateNodeModules } from "../codegen/codegen.js";
import { importComfyJson } from "../import/index.js";
import { parseGraph, serializeGraph } from "../ir/serialize.js";
import type { Graph, ParamValue } from "../ir/types.js";
import { instantiateTemplate } from "../ir/template.js";
import {
  WORKFLOW_MANIFEST_FILENAME,
  WORKFLOW_PACKAGE_JSON_KEY,
  WORKFLOW_PACKAGE_KEYWORDS,
  analyzePortability,
  assertExposeCoherent,
  checkPackageCoherence,
  deriveNodeClasses,
  discoverPackage,
  exposeParam,
  generatePackage,
  inferPackageName,
  loadPackageGraph,
  manifestFromGraph,
  parseNodePack,
  suggestParams,
  writeManifestFile,
} from "../wfpack/index.js";
import type { WorkflowNodePack } from "../wfpack/index.js";
import { createClient } from "../runtime/client.js";
import { captureLock, writeLock, readLockAt, lockDrift, type NodePackInfo } from "../lock/lock.js";
import { explainGraph } from "../recipes/explain.js";
import { ComfyError, ErrorCodes, isComfyError } from "../errors.js";
import {
  applySetupPlan,
  assertComfyPath,
  buildDependencyReport,
  createRegistryClient,
  inspectComfyTarget,
  isCoreNodeClass,
  mergeResolvedPacks,
  resolveNodeClasses,
} from "../deps/index.js";
import { createInterface } from "node:readline";
import type { EmitterRegistry } from "../emit-ts/emit.js";
import { parseJsonLossless } from "../lossless-parse.js";
import { inspectAgentSkill, installAgentSkill } from "./agent-skill.js";

/**
 * `cwf` CLI — the scriptable surface for agents:
 *   import | snapshot | lock | codegen | compile | validate | run | catalog | explain
 *   init | expose | suggest | pack | inspect | resolve-nodes | node-pack | setup
 *
 * Failures print machine-readable JSON errors to stderr and exit non-zero.
 */

const dirOfThis = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(dirOfThis, "..", "..");

interface ParsedArgs {
  positional: string[];
  flags: Record<string, string | boolean | string[]>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean | string[]> = {};
  // Short → long aliases. Documented CLI surface uses these short forms.
  const SHORT_ALIASES: Record<string, string> = {
    o: "out",
    u: "url",
    d: "defs",
    p: "param",
    t: "ts",
    f: "from",
    F: "format",
  };
  const isFlagToken = (s: string | undefined): boolean => s !== undefined && s.startsWith("-");
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--param" || a === "-p") {
      const list = (flags["param"] as string[]) ?? [];
      list.push(argv[++i] ?? "");
      flags["param"] = list;
    } else if (a.startsWith("--")) {
      const key = SHORT_ALIASES[a.slice(2)] ?? a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !isFlagToken(next)) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else if (a.startsWith("-") && a.length > 1) {
      const raw = a.slice(1);
      const key = SHORT_ALIASES[raw] ?? raw;
      const next = argv[i + 1];
      if (next !== undefined && !isFlagToken(next)) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

function flag(flags: Record<string, string | boolean | string[]>, key: string): string | undefined {
  const v = flags[key];
  return typeof v === "string" ? v : undefined;
}

function flagList(
  flags: Record<string, string | boolean | string[]>,
  key: string,
): string[] | undefined {
  const v = flags[key];
  return Array.isArray(v) ? v : undefined;
}

function registryFromFlags(flags: Record<string, string | boolean | string[]>) {
  const url = flag(flags, "registry-url") ?? process.env["CWF_REGISTRY_URL"];
  return createRegistryClient(url !== undefined ? { baseUrl: url } : {});
}

export async function cli(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  const { positional, flags } = parseArgs(rest);
  try {
    switch (command) {
      case "import":
        return await cmdImport(positional, flags);
      case "snapshot":
        return await cmdSnapshot(flags);
      case "lock":
        return await cmdLock(flags);
      case "codegen":
        return await cmdCodegen(flags);
      case "compile":
        return await cmdCompile(positional, flags);
      case "validate":
        return await cmdValidate(positional, flags);
      case "run":
        return await cmdRun(positional, flags);
      case "init":
        return await cmdInit(positional, flags);
      case "expose":
        return await cmdExpose(positional, flags);
      case "suggest":
        return await cmdSuggest(positional, flags);
      case "pack":
        return await cmdPack(positional, flags);
      case "inspect":
        return await cmdInspect(positional, flags);
      case "resolve-nodes":
        return await cmdResolveNodes(positional, flags);
      case "node-pack":
        return await cmdNodePack(positional, flags);
      case "setup":
        return await cmdSetup(positional, flags);
      case "catalog":
        return await cmdCatalog(positional, flags);
      case "explain":
        return await cmdExplain(positional, flags);
      case "agent":
        return await cmdAgent(positional, flags);
      case "help":
      case "--help":
      case "-h":
        printHelp();
        return 0;
      default:
        printHelp();
        return command === undefined ? 0 : 1;
    }
  } catch (e) {
    const err = isComfyError(e)
      ? e.toJSON()
      : { code: "E_UNCAUGHT", message: String(e instanceof Error ? (e.stack ?? e.message) : e) };
    process.stderr.write(JSON.stringify({ error: err }, null, 2) + "\n");
    return 1;
  }
}

function printHelp(): void {
  process.stdout.write(
    [
      "cwf — code-first, typed, composable workflows for ComfyUI",
      "",
      "  cwf import <workflow.json> [--out foo.ir.json] [--ts dir/workflow.ts] [--from defs.json]",
      "  cwf snapshot --url URL -o object_info.json",
      "  cwf lock --url URL [-o comfy.lock.json]",
      "  cwf codegen [--url URL | --from snapshot.json] -o src/nodes/gen [--exact-combos]",
      "  cwf compile <workflow.ts | graph.ir.json> [-o out.api.json] [--defs defs.json] [--pretty]",
      "  cwf validate <file> [--url URL] [--defs defs.json]",
      "  cwf run <file> --url URL [--param k=v ...] [--out outdir]",
      "  cwf init [name] --from <workflow.json> [--out dir] [--git] [--json]",
      "  cwf expose <param> --node <id> --input <name> [--required] [--description ...] [--default ...]",
      "  cwf suggest [dir] [--json]                 # deterministic parameter suggestions (no mutation)",
      "  cwf pack [dir] [--json] [--publish]        # validate a workflow package",
      "  cwf inspect <package-or-path> [--url URL] [--json]  # inspect without running JS",
      "  cwf resolve-nodes <package-or-path> [--url URL] [--write] [--json]",
      "  cwf node-pack add <registry-id> --provides ClassA,ClassB [--dir pkg] [--name ...] [--version ...]",
      "  cwf setup <package-or-path> --comfy <Comfy-path> [--yes] [--dry-run] [--json]",
      "  cwf explain <file | workflow.ts>   # what does this expand into?",
      "  cwf catalog [query] [--from catalog.json]",
      "  cwf agent install [--project dir] [--force] [--json]  # copy bundled skill to .agents/skills",
      "  cwf agent check [--project dir] [--json]              # project skill vs installed package",
      "",
    ].join("\n"),
  );
}

/* ------------------------------------------------------------------ */
/* Shared plumbing                                                     */
/* ------------------------------------------------------------------ */

/** Load defs (plus their objectInfoHash) from comfy-node-defs JSON, a wrapped snapshot, or bare object_info. */
async function loadDefsAny(defsPath: string | undefined): Promise<NodeDefs> {
  return (await loadDefsSources(defsPath)).defs;
}

/**
 * Resolve defs for commands that talk to a server: an explicit --defs wins;
 * otherwise, when --url is present, fetch THAT server's /object_info so
 * installed custom nodes need no redundant flag. Falls back to the bundled
 * defs only when neither is available.
 */
async function loadDefsForServer(
  defsPath: string | undefined,
  url: string | undefined,
  client: ReturnType<typeof createClient> | undefined,
): Promise<{ defs: NodeDefs; objectInfoHash?: string; source: "defs-flag" | "live" | "bundled" }> {
  if (defsPath !== undefined) {
    const s = await loadDefsSources(defsPath);
    return { ...s, source: "defs-flag" };
  }
  if (url !== undefined && client !== undefined) {
    try {
      const live = await client.objectInfo();
      return {
        defs: parseObjectInfo(live as never),
        objectInfoHash: hashObjectInfo(live),
        source: "live",
      };
    } catch (e) {
      process.stderr.write(
        JSON.stringify({
          warning: "E_LIVE_DEFS_UNAVAILABLE",
          message:
            `Could not fetch /object_info from ${url} for live defs ` +
            `(${e instanceof Error ? e.message : String(e)}); falling back to bundled core defs.`,
        }) + "\n",
      );
    }
  }
  return { ...bundledDefsWithHash(), source: "bundled" };
}

async function loadDefsSources(
  defsPath: string | undefined,
): Promise<{ defs: NodeDefs; objectInfoHash?: string }> {
  if (defsPath === undefined) return bundledDefsWithHash();
  const json = JSON.parse(await readFile(defsPath, "utf8")) as Record<string, unknown>;
  if (json["format"] === "comfy-node-defs" && json["defs"] !== undefined) {
    return {
      defs: json["defs"] as NodeDefs,
      objectInfoHash:
        typeof json["objectInfoHash"] === "string"
          ? json["objectInfoHash"]
          : hashObjectInfo(json["defs"]),
    };
  }
  const snapshot = await loadDefsSnapshot(defsPath);
  return { defs: snapshot.defs, objectInfoHash: snapshot.objectInfoHash };
}

// Bundled at build time — works both from src (jiti) and dist (published CLI).
import bundledDefsJson from "../nodes/gen/defs.json" with { type: "json" };
function bundledDefsWithHash(): { defs: NodeDefs; objectInfoHash?: string } {
  const gen = bundledDefsJson as { defs?: NodeDefs; objectInfoHash?: string };
  if (!gen?.defs) {
    throw new Error(
      "Bundled node defs missing — run `cwf codegen` in your project and pass --defs <path>.",
    );
  }
  return { defs: gen.defs, objectInfoHash: gen.objectInfoHash };
}

/**
 * Lock drift check: compare the defs in use against a comfy.lock.json.
 * Report-only — a mismatch is a warning, never a hard failure, because the
 * server is the authority on what it can actually run.
 */
async function warnLockDrift(
  defsSources: { objectInfoHash?: string },
  lockPath: string | undefined,
  context: { defsUrl?: string; client?: ReturnType<typeof createClient> },
): Promise<void> {
  const resolved = lockPath ?? ((await exists("comfy.lock.json")) ? "comfy.lock.json" : undefined);
  if (resolved === undefined) return;
  const lock = await readLockAt(resolved);
  if (lock === undefined) return;
  let liveHash = defsSources.objectInfoHash;
  if (context.defsUrl !== undefined && context.client !== undefined) {
    // Prefer the live universe when a server is in the loop.
    const live = await context.client.objectInfo().catch(() => undefined);
    if (live !== undefined) liveHash = hashObjectInfo(live);
  }
  if (liveHash === undefined) return;
  const drift = lockDrift(lock, liveHash);
  if (drift !== undefined) {
    process.stderr.write(
      JSON.stringify({ warning: "E_LOCK_DRIFT", message: drift, lock: resolved }) + "\n",
    );
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await readFile(p);
    return true;
  } catch {
    return false;
  }
}

async function graphFromInput(
  inputPath: string,
  params: Record<string, unknown>,
  defs?: NodeDefs,
): Promise<Graph> {
  if (inputPath.endsWith(".ts") || inputPath.endsWith(".mts")) {
    const jiti = createJiti(import.meta.url, { alias: sdkAliases() });
    const mod = (await jiti.import(path.resolve(inputPath))) as {
      build?: () => unknown;
      default?: () => unknown;
    };
    const build = mod.build ?? mod.default;
    if (typeof build !== "function") {
      throw new Error(`${inputPath} must export build() (or default) returning a Graph`);
    }
    const built = build() as Graph;
    if (Object.keys(params).length > 0 || hasPlaceholders(built)) {
      return instantiateTemplate(built, { params: params as never });
    }
    return built;
  }
  // JSON input: accept IR documents AND Comfy workflow JSON (editor/API format).
  const text = await readFile(inputPath, "utf8");
  let graph: Graph;
  if (looksLikeIr(text)) {
    graph = parseGraph(text);
  } else {
    // Lossless parse: workflow JSON may contain integers beyond JS's safe
    // range (e.g. 2^64−1 seeds); JSON.parse would silently corrupt them.
    graph = importComfyJson(parseJsonLossless(text), defs).graph;
  }
  if (Object.keys(params).length > 0 || hasPlaceholders(graph)) {
    graph = instantiateTemplate(graph, { params: params as never });
  }
  return graph;
}

/** IR documents carry irVersion; anything else is treated as Comfy workflow JSON. */
function looksLikeIr(text: string): boolean {
  return /"irVersion"\s*:/.test(text);
}

/**
 * Resolve a `run`/`validate` input: an existing file path (workflow.ts, IR
 * JSON, Comfy JSON) wins; otherwise the input is treated as an installed
 * workflow package name/path whose manifest/IR is read directly — package
 * JavaScript is never executed on this path.
 */
async function graphFromInputOrPackage(
  input: string,
  params: Record<string, unknown>,
  defs?: NodeDefs,
): Promise<Graph> {
  if (existsSync(input)) return graphFromInput(input, params, defs);
  const pkg = discoverPackage(input);
  const graph = loadPackageGraph(pkg);
  if (Object.keys(params).length > 0 || Object.keys(graph.params ?? {}).length > 0) {
    return instantiateTemplate(graph, { params: params as never });
  }
  return graph;
}

/**
 * Alias map so `import … from "@stepupgaming/comfy-workflows…"` resolves
 * inside this repo (dev: src, published: dist). The legacy `comfy-sdk…`
 * specifiers keep resolving so workflow.ts files authored before the rename
 * still compile.
 */
function sdkAliases(): Record<string, string> {
  const base = existsSync(path.join(PKG_ROOT, "dist", "index.js"))
    ? path.join(PKG_ROOT, "dist")
    : path.join(PKG_ROOT, "src");
  const ext = existsSync(path.join(PKG_ROOT, "dist", "index.js")) ? "js" : "ts";
  return {
    "@stepupgaming/comfy-workflows/nodes": path.join(base, "nodes", `index.${ext}`),
    "@stepupgaming/comfy-workflows/runtime": path.join(base, "runtime", `index.${ext}`),
    "@stepupgaming/comfy-workflows/ir": path.join(base, "ir", `index.${ext}`),
    "@stepupgaming/comfy-workflows/wfpack": path.join(base, "wfpack", `index.${ext}`),
    "@stepupgaming/comfy-workflows": path.join(base, `index.${ext}`),
    "comfy-sdk/nodes": path.join(base, "nodes", `index.${ext}`),
    "comfy-sdk/runtime": path.join(base, "runtime", `index.${ext}`),
    "comfy-sdk/ir": path.join(base, "ir", `index.${ext}`),
    "comfy-sdk": path.join(base, `index.${ext}`),
  };
}

function existsSync(p: string): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("node:fs").existsSync(p);
  } catch {
    return false;
  }
}

function hasPlaceholders(g: Graph): boolean {
  return Object.values(g.nodes).some((n) =>
    Object.values(n.params).some(
      (v) =>
        typeof v === "object" &&
        v !== null &&
        !Array.isArray(v) &&
        "$param" in (v as unknown as Record<string, unknown>),
    ),
  );
}

function parseParams(list: string[] | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const kv of list ?? []) {
    const eq = kv.indexOf("=");
    if (eq <= 0) throw new Error(`Bad --param (expected key=value): ${kv}`);
    const key = kv.slice(0, eq);
    const raw = kv.slice(eq + 1);
    if (/^-?\d+n$/.test(raw)) out[key] = BigInt(raw.slice(0, -1));
    else if (/^-?\d+$/.test(raw)) {
      // Integers parse losslessly (BigInt) so CLI params never lose precision.
      const v = BigInt(raw);
      out[key] =
        v <= BigInt(Number.MAX_SAFE_INTEGER) && v >= BigInt(-Number.MAX_SAFE_INTEGER)
          ? Number(v)
          : v;
    } else {
      try {
        out[key] = JSON.parse(raw);
      } catch {
        out[key] = raw;
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Commands                                                            */
/* ------------------------------------------------------------------ */

async function cmdImport(
  positional: string[],
  flags: Record<string, string | boolean | string[]>,
): Promise<number> {
  const file = positional[0];
  if (file === undefined)
    throw new Error(
      "Usage: cwf import <workflow.json> [--out foo.ir.json] [--ts dir/workflow.ts] [--from defs.json]",
    );
  const defs = await loadDefsAny(flag(flags, "from"));
  // Lossless parse: workflow JSON may contain integers beyond JS's safe range
  // (e.g. 2^64−1 seeds); JSON.parse would silently corrupt them.
  const raw = parseJsonLossless(await readFile(file, "utf8"));
  const { graph, diagnostics } = importComfyJson(raw, defs);
  const outPath = flag(flags, "out") ?? file.replace(/\.json$/i, ".ir.json");
  await writeFile(outPath, serializeGraph(graph, { pretty: true }), "utf8");
  const summary: Record<string, unknown> = {
    ok: true,
    ir: outPath,
    nodes: Object.keys(graph.nodes).length,
    outputs: graph.outputs.length,
    diagnostics,
  };
  if (flag(flags, "ts") !== undefined) {
    const tsPath = flag(flags, "ts") as string;
    await mkdir(path.dirname(path.resolve(tsPath)), { recursive: true });
    // --registry <codegenDir>: route nodes to a generated custom-node registry
    // (the output of `cwf codegen -o <dir>`), so emitted workflow.ts imports
    // resolve even for classes absent from the package's built-in registry.
    let registries: EmitterRegistry[] | undefined;
    const registryDir = flag(flags, "registry");
    if (registryDir !== undefined) {
      const registryDefsPath = join(registryDir, "defs.json");
      const json = JSON.parse(await readFile(registryDefsPath, "utf8")) as {
        defs?: NodeDefs;
      };
      const classes = new Set(Object.keys(json.defs ?? {}));
      // Use the EXACT classType -> identifier map persisted by codegen. Sanitized
      // names can collide and get suffixes at generation time, so re-deriving
      // them here would emit imports that do not exist in the registry.
      const identifiersPath = join(registryDir, "identifiers.json");
      let identifiers: ReadonlyMap<string, string>;
      try {
        const idents = JSON.parse(await readFile(identifiersPath, "utf8")) as {
          identifiers?: Record<string, string>;
        };
        identifiers = new Map(Object.entries(idents.identifiers ?? {}));
      } catch {
        throw new Error(
          `Registry directory ${registryDir} has no identifiers.json — regenerate it with ` +
            "`cwf codegen` so emitted imports use the exact generated names.",
        );
      }
      const rel = path
        .relative(path.dirname(path.resolve(tsPath)), join(registryDir, "registry.js"))
        .replaceAll("\\", "/");
      const specifier = rel.startsWith(".") ? rel : `./${rel}`;
      registries = [{ specifier, classes, identifiers }];
      summary["registry"] = specifier;
    }
    await writeFile(tsPath, emitTs(graph, { defs, registries: registries as never }), "utf8");
    summary["ts"] = tsPath;
  }
  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
  return 0;
}

async function cmdSnapshot(flags: Record<string, string | boolean | string[]>): Promise<number> {
  const url = flag(flags, "url");
  const out = flag(flags, "out");
  if (url === undefined || out === undefined)
    throw new Error("Usage: cwf snapshot --url URL -o object_info.json");
  const client = createClient({ url });
  const objectInfo = await client.objectInfo();
  await mkdir(path.dirname(path.resolve(out)), { recursive: true });
  const { saveDefsSnapshot } = await import("../defs/snapshot.js");
  const hash = await saveDefsSnapshot(out, objectInfo as never, { source: url });
  process.stdout.write(
    JSON.stringify({
      ok: true,
      out,
      objectInfoHash: hash,
      classes: Object.keys(objectInfo).length,
    }) + "\n",
  );
  return 0;
}

async function cmdLock(flags: Record<string, string | boolean | string[]>): Promise<number> {
  const url = flag(flags, "url");
  if (url === undefined) throw new Error("Usage: cwf lock --url URL [-o comfy.lock.json]");
  const client = createClient({ url });
  const [objectInfo, systemStats] = [
    await client.objectInfo(),
    await client.systemStats().catch(() => undefined),
  ];
  const nodePacks = await fetchNodePacks(url);
  const lock = await captureLock({ objectInfo, systemStats, nodePacks });
  const out = flag(flags, "out") ?? "comfy.lock.json";
  // Honor the exact requested path (the lock format lives in the file itself).
  await mkdir(path.dirname(path.resolve(out)), { recursive: true });
  await writeFile(out, JSON.stringify(lock, null, 2) + "\n", "utf8");
  process.stdout.write(JSON.stringify({ ok: true, out, lock }, null, 2) + "\n");
  return 0;
}

async function fetchNodePacks(baseUrl: string): Promise<Record<string, NodePackInfo>> {
  for (const p of ["/manager/customnode/getlist", "/customnode/getlist"]) {
    try {
      const res = await fetch(`${baseUrl}${p}`);
      if (!res.ok) continue;
      const body = (await res.json()) as {
        nodepacks?: Array<{ name?: string; cnr_version?: string; version?: string }>;
      };
      const packs: Record<string, NodePackInfo> = {};
      for (const np of body.nodepacks ?? []) {
        if (typeof np.name === "string") packs[np.name] = { version: np.version ?? np.cnr_version };
      }
      return packs;
    } catch {
      continue;
    }
  }
  return {};
}

async function cmdCodegen(flags: Record<string, string | boolean | string[]>): Promise<number> {
  const out = flag(flags, "out");
  if (out === undefined)
    throw new Error(
      "Usage: cwf codegen [--url URL | --from snapshot.json] -o src/nodes/gen [--exact-combos]",
    );
  const exactCombos = flags["exact-combos"] === true;
  const url = flag(flags, "url");
  const from = flag(flags, "from");
  if (url !== undefined) {
    const client = createClient({ url });
    const raw = await client.objectInfo();
    const hash = hashObjectInfo(raw);
    const result = generateNodeModules({
      defs: parseObjectInfo(raw as never),
      objectInfoHash: hash,
      exactCombos,
      importsFrom: "@stepupgaming/comfy-workflows",
    });
    await writeGenerated(out, result.files);
    process.stdout.write(
      JSON.stringify({
        ok: true,
        out,
        files: result.files.map((f) => f.path),
        objectInfoHash: hash,
      }) + "\n",
    );
    return 0;
  }
  if (from !== undefined) {
    const snapshot = await loadDefsSnapshot(from);
    const result = generateNodeModules({
      defs: snapshot.defs,
      objectInfoHash: snapshot.objectInfoHash,
      exactCombos,
      importsFrom: "@stepupgaming/comfy-workflows",
    });
    await writeGenerated(out, result.files);
    process.stdout.write(
      JSON.stringify({
        ok: true,
        out,
        files: result.files.map((f) => f.path),
        objectInfoHash: snapshot.objectInfoHash,
      }) + "\n",
    );
    return 0;
  }
  throw new Error("Usage: cwf codegen [--url URL | --from snapshot.json] -o src/nodes/gen");
}

async function writeGenerated(
  out: string,
  files: Array<{ path: string; content: string }>,
): Promise<void> {
  await mkdir(out, { recursive: true });
  for (const f of files) await writeFile(path.join(out, f.path), f.content, "utf8");
}

async function cmdCompile(
  positional: string[],
  flags: Record<string, string | boolean | string[]>,
): Promise<number> {
  const input = positional[0];
  if (input === undefined)
    throw new Error(
      "Usage: cwf compile <workflow.ts | graph.ir.json> [-o out.api.json] [--lock comfy.lock.json]",
    );
  const url = flag(flags, "url");
  const client = url !== undefined ? createClient({ url }) : undefined;
  const defsSources = await loadDefsForServer(flag(flags, "defs"), url, client);
  if (defsSources.source === "live") {
    process.stderr.write(JSON.stringify({ info: "defs", source: "live", url }) + "\n");
  }
  const defs = defsSources.defs;
  const graph = await graphFromInput(input, parseParams(flagList(flags, "param")), defs);
  await warnLockDrift(defsSources, flag(flags, "lock"), {});
  const result = compile(graph, defs, { pretty: flags["pretty"] === true });
  if (!result.ok) {
    process.stderr.write(
      JSON.stringify(
        {
          ok: false,
          errors: result.errors.map((e) => e.toJSON()),
          warnings: result.warnings.map((e) => e.toJSON()),
        },
        null,
        2,
      ) + "\n",
    );
    return 1;
  }
  const outPath = flag(flags, "out");
  if (outPath !== undefined) {
    await mkdir(path.dirname(path.resolve(outPath)), { recursive: true });
    await writeFile(outPath, result.json + "\n", "utf8");
  } else {
    process.stdout.write(result.json + "\n");
  }
  process.stderr.write(
    JSON.stringify(
      {
        ok: true,
        hash: result.hash,
        nodes: Object.keys(result.object).length,
        warnings: result.warnings.length,
      },
      null,
      2,
    ) + "\n",
  );
  return 0;
}

async function cmdValidate(
  positional: string[],
  flags: Record<string, string | boolean | string[]>,
): Promise<number> {
  const input = positional[0];
  if (input === undefined)
    throw new Error(
      "Usage: cwf validate <file> [--url URL] [--defs defs.json] [--lock comfy.lock.json]",
    );
  const url = flag(flags, "url");
  const client = url !== undefined ? createClient({ url }) : undefined;
  const defsSources = await loadDefsForServer(flag(flags, "defs"), url, client);
  if (defsSources.source === "live") {
    process.stderr.write(JSON.stringify({ info: "defs", source: "live", url }) + "\n");
  }
  const defs = defsSources.defs;
  const graph = await graphFromInput(input, parseParams(flagList(flags, "param")), defs);
  const result = compile(graph, defs);
  const errorJson = () => (result.ok ? [] : result.errors.map((e) => e.toJSON()));
  const warningJson = () => result.warnings.map((e) => e.toJSON());
  if (url !== undefined && client !== undefined) {
    await warnLockDrift(defsSources, flag(flags, "lock"), { defsUrl: url, client });
    const server = await client.validate({ kind: "graph", graph });
    process.stdout.write(
      JSON.stringify(
        {
          ok: result.ok && server.ok,
          local: { errors: errorJson(), warnings: warningJson() },
          server: server.serverResponse ?? null,
        },
        null,
        2,
      ) + "\n",
    );
    return result.ok && server.ok ? 0 : 1;
  }
  process.stdout.write(
    JSON.stringify({ ok: result.ok, errors: errorJson(), warnings: warningJson() }, null, 2) + "\n",
  );
  return result.ok ? 0 : 1;
}

async function cmdRun(
  positional: string[],
  flags: Record<string, string | boolean | string[]>,
): Promise<number> {
  const input = positional[0];
  const url = flag(flags, "url");
  if (input === undefined || url === undefined) {
    throw new Error(
      "Usage: cwf run <file> --url URL [--param k=v ...] [--out outdir] [--defs defs.json] [--lock comfy.lock.json]",
    );
  }
  const client = createClient({ url });
  const defsSources = await loadDefsForServer(flag(flags, "defs"), url, client);
  if (defsSources.source === "live") {
    process.stderr.write(JSON.stringify({ info: "defs", source: "live", url }) + "\n");
  }
  await warnLockDrift(defsSources, flag(flags, "lock"), { defsUrl: url, client });
  const graph = await graphFromInputOrPackage(
    input,
    parseParams(flagList(flags, "param")),
    defsSources.defs,
  );
  const result = await client.run(
    { kind: "graph", graph },
    {
      outDir: flag(flags, "out"),
      defs: defsSources.defs,
      onEvent: (e) => {
        if (e.type === "progress" && process.stderr.isTTY) {
          process.stderr.write(`\rprogress ${e.value}/${e.max}`);
        }
      },
    },
  );
  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        runId: result.runId,
        artifacts: result.artifacts.map((a) => ({
          filename: a.filename,
          savedPath: a.savedPath,
          type: a.type,
        })),
      },
      null,
      2,
    ) + "\n",
  );
  return 0;
}

function formatValuePreview(value: string): string {
  if (value.length > 80) return JSON.stringify(value.slice(0, 77) + "...");
  return JSON.stringify(value);
}

async function cmdInit(
  positional: string[],
  flags: Record<string, string | boolean | string[]>,
): Promise<number> {
  const from = flag(flags, "from");
  if (from === undefined)
    throw new Error(
      "Usage: cwf init [name] --from <workflow.json> [--out dir] [--git] [--json] [--url URL]",
    );
  const defs = await loadDefsAny(flag(flags, "defs"));
  const raw = parseJsonLossless(await readFile(from, "utf8"));
  const { graph, diagnostics } = importComfyJson(raw, defs);
  const nameArg = positional[0] ?? path.basename(from);
  const name = inferPackageName(nameArg);
  const dest = path.resolve(flag(flags, "out") ?? name.dirName);
  if (existsSync(dest)) {
    const { readdirSync } = await import("node:fs");
    if (readdirSync(dest).length > 0)
      throw new Error(`Destination ${dest} already exists and is not empty`);
  }
  const nodeClasses = deriveNodeClasses(graph);
  let nodePacks: WorkflowNodePack[] | undefined;
  const initUrl = flag(flags, "url");
  if (initUrl !== undefined) {
    const resolved = await resolveNodeClasses({
      nodeClasses,
      registry: registryFromFlags(flags),
      installedClasses: await liveClassNames(initUrl),
    });
    nodePacks = resolved.packs;
  }
  const generated = generatePackage({
    name,
    graph,
    defs,
    nodePacks,
  });
  await mkdir(dest, { recursive: true });
  for (const [rel, content] of Object.entries(generated.files)) {
    await writeFile(path.join(dest, rel), content, "utf8");
  }
  if (flags["git"] === true) {
    try {
      execFileSync("git", ["init"], { cwd: dest, stdio: "pipe" });
    } catch (e) {
      process.stderr.write(
        JSON.stringify({
          warning: "E_GIT_INIT_FAILED",
          message: `git init failed (${e instanceof Error ? e.message : String(e)}); package files were still written.`,
        }) + "\n",
      );
    }
  }
  const asJson = flags["json"] === true;
  const payload = {
    ok: true,
    dir: dest,
    package: name.npmName,
    title: name.title,
    files: Object.keys(generated.files),
    nodeClasses: generated.nodeClasses,
    nodePacks: generated.manifest.requires.nodePacks,
    portability: generated.portability,
    suggestions: generated.suggestions,
    diagnostics,
  };
  if (asJson) {
    process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
    return 0;
  }
  const lines: string[] = [];
  lines.push(`Created package: ${dest}`);
  lines.push(`  npm name: ${name.npmName}`);
  lines.push(`  files: ${Object.keys(generated.files).join(", ")}`);
  const coreCount = generated.nodeClasses.filter((c) => isCoreNodeClass(c)).length;
  const customCount = generated.nodeClasses.length - coreCount;
  lines.push(`  Imported ${generated.nodeClasses.length} node classes`);
  lines.push(`  Core: ${coreCount}`);
  lines.push(`  Custom: ${customCount}`);
  if (generated.manifest.requires.nodePacks.length > 0) {
    lines.push("  Resolved:");
    for (const p of generated.manifest.requires.nodePacks) {
      const n = (p.provides ?? []).length;
      lines.push(`    ${p.name ?? p.id} → ${n} class${n === 1 ? "" : "es"}`);
    }
  }
  if (generated.portability.length > 0) {
    lines.push("");
    lines.push("Portability warnings:");
    for (const f of generated.portability) {
      lines.push(`  ${f.kind}:`);
      lines.push(`    node ${f.nodeId} / ${f.input}`);
      lines.push(`    value: ${f.value}`);
    }
    const first = generated.portability[0];
    const exposeHint =
      generated.suggestions.find((s) => s.nodeId === first.nodeId && s.input === first.input)
        ?.name ?? first.input.replace(/_/g, "-");
    lines.push("");
    lines.push("Suggested next step:");
    lines.push(`  cwf expose ${exposeHint} --node ${first.nodeId} --input ${first.input}`);
    if (generated.suggestions.length > 1) {
      lines.push("  (see `cwf suggest .` for the full list)");
    }
  } else {
    lines.push("");
    lines.push("Next:");
    lines.push(`  cd ${dest}`);
    lines.push("  cwf pack");
    lines.push("  npm publish");
  }
  process.stdout.write(lines.join("\n") + "\n");
  return 0;
}

async function cmdExpose(
  positional: string[],
  flags: Record<string, string | boolean | string[]>,
): Promise<number> {
  const paramName = positional[0];
  const nodeId = flag(flags, "node");
  const input = flag(flags, "input");
  if (paramName === undefined || nodeId === undefined || input === undefined)
    throw new Error(
      "Usage: cwf expose <param-name> --node <node-id> --input <input-name> [--dir pkg] [--required] [--description ...] [--default ...]",
    );
  const dir = flag(flags, "dir") ?? process.cwd();
  const pkg = discoverPackage(dir);
  const graph = loadPackageGraph(pkg);
  const defs = await loadDefsAny(flag(flags, "defs"));
  const defaultRaw = flag(flags, "default");
  const parsedDefault =
    defaultRaw === undefined ? undefined : parseParams([`_=${defaultRaw}`])["_"];
  const { graph: next } = exposeParam(graph, {
    name: paramName,
    nodeId,
    input,
    required: flags["required"] === true,
    description: flag(flags, "description"),
    default: parsedDefault as ParamValue | undefined,
    defs,
  });
  const manifest = manifestFromGraph(next, pkg.manifest);
  assertExposeCoherent(manifest, next);
  const irText = serializeGraph(next, { pretty: true }) + "\n";
  const manifestText = JSON.stringify(manifest, null, 2) + "\n";
  const tsText = emitTs(next, { defs, moduleName: manifest.name }) + "\n";
  // Validation already ran. Snapshot the previous files so a later write
  // failure can restore them (Windows cannot atomically rename-over).
  const manPath = path.join(pkg.dir, WORKFLOW_MANIFEST_FILENAME);
  const tsPath = path.join(pkg.dir, "workflow.ts");
  const prevIr = await readFile(pkg.irPath, "utf8");
  const prevMan = await readFile(manPath, "utf8").catch(() => undefined);
  const prevTs = await readFile(tsPath, "utf8").catch(() => undefined);
  try {
    await writeFile(pkg.irPath, irText, "utf8");
    await writeFile(manPath, manifestText, "utf8");
    await writeFile(tsPath, tsText, "utf8");
  } catch (e) {
    await writeFile(pkg.irPath, prevIr, "utf8").catch(() => undefined);
    if (prevMan !== undefined) await writeFile(manPath, prevMan, "utf8").catch(() => undefined);
    if (prevTs !== undefined) await writeFile(tsPath, prevTs, "utf8").catch(() => undefined);
    throw e;
  }
  if (flags["json"] === true) {
    process.stdout.write(
      JSON.stringify(
        {
          ok: true,
          param: paramName,
          node: nodeId,
          input,
          required: manifest.parameters[paramName]?.required ?? false,
          dir: pkg.dir,
        },
        null,
        2,
      ) + "\n",
    );
    return 0;
  }
  process.stdout.write(
    `exposed ${paramName} ← ${nodeId}.${input} (${manifest.parameters[paramName]?.required ? "required" : "optional"})\n`,
  );
  return 0;
}

async function cmdSuggest(
  positional: string[],
  flags: Record<string, string | boolean | string[]>,
): Promise<number> {
  const dir = positional[0] ?? process.cwd();
  const pkg = discoverPackage(dir);
  const graph = loadPackageGraph(pkg);
  const defs = await loadDefsAny(flag(flags, "defs"));
  const suggestions = suggestParams(graph, defs);
  const portability = analyzePortability(graph);
  if (flags["json"] === true) {
    process.stdout.write(
      JSON.stringify({ ok: true, dir: pkg.dir, suggestions, portability }, null, 2) + "\n",
    );
    return 0;
  }
  if (suggestions.length === 0) {
    process.stdout.write("No parameter suggestions.\n");
    return 0;
  }
  const lines: string[] = ["Suggested parameters", ""];
  for (const s of suggestions) {
    lines.push(s.name);
    lines.push(`  ${s.nodeId}.${s.input}`);
    lines.push(`  current: ${formatValuePreview(s.current)}`);
    lines.push(
      `  cwf expose ${s.name} --node ${s.nodeId} --input ${s.input}${s.requiredSuggestion ? " --required" : ""}`,
    );
    lines.push("");
  }
  process.stdout.write(lines.join("\n"));
  return 0;
}

async function cmdPack(
  positional: string[],
  flags: Record<string, string | boolean | string[]>,
): Promise<number> {
  const dir = positional[0] ?? process.cwd();
  const pkg = discoverPackage(dir);
  const graph = loadPackageGraph(pkg);
  const report = checkPackageCoherence(pkg.manifest, graph);

  // Package-metadata checks (beyond manifest/IR coherence).
  const diagnostics = [...report.diagnostics];
  const pj = pkg.packageJson;
  if (typeof pj["name"] !== "string" || (pj["name"] as string).length === 0)
    diagnostics.push({
      level: "error",
      code: "E_PACK_NO_NAME",
      message: "package.json has no name.",
    });
  const keywords = Array.isArray(pj["keywords"]) ? (pj["keywords"] as unknown[]) : [];
  for (const kw of WORKFLOW_PACKAGE_KEYWORDS) {
    if (!keywords.includes(kw))
      diagnostics.push({
        level: "warning",
        code: "W_PACK_KEYWORD",
        message: `package.json keywords omits "${kw}" (discoverability).`,
        hint: `Add all of: ${WORKFLOW_PACKAGE_KEYWORDS.join(", ")}.`,
      });
  }
  if (pj[WORKFLOW_PACKAGE_JSON_KEY] === undefined)
    diagnostics.push({
      level: "warning",
      code: "W_PACK_NO_POINTER",
      message: `package.json has no "${WORKFLOW_PACKAGE_JSON_KEY}" pointer (manifest was found by filename convention).`,
      hint: `Add "${WORKFLOW_PACKAGE_JSON_KEY}": "./${WORKFLOW_MANIFEST_FILENAME}".`,
    });

  const asJson = flags["json"] === true;
  const publish = flags["publish"] === true;
  if (publish) {
    for (const d of diagnostics) {
      // Unresolved/unknown classes are not proof they are custom; do not
      // fail publication merely because the bundled core snapshot is stale.
      if (d.code === "E_PACK_INVALID_NODE_PACK") d.level = "error";
    }
  }
  const errors = diagnostics.filter((d) => d.level === "error");
  if (asJson) {
    process.stdout.write(
      JSON.stringify(
        {
          ok: errors.length === 0,
          dir: pkg.dir,
          name: pj["name"] ?? null,
          version: pj["version"] ?? null,
          manifest: pkg.manifest.name,
          entry: pkg.manifest.entry,
          nodeClasses: report.nodeClasses,
          diagnostics,
        },
        null,
        2,
      ) + "\n",
    );
  } else {
    process.stdout.write(`pack ${pkg.dir}\n`);
    process.stdout.write(
      `  package: ${String(pj["name"] ?? "?")} ${String(pj["version"] ?? "")}\n`,
    );
    process.stdout.write(
      `  workflow: ${pkg.manifest.title} (${pkg.manifest.name}) → ${pkg.manifest.entry}\n`,
    );
    process.stdout.write(`  nodes: ${report.nodeClasses.derived.join(", ") || "—"}\n`);
    for (const d of diagnostics) {
      process.stdout.write(`  ${d.level === "error" ? "✗" : "⚠"} [${d.code}] ${d.message}\n`);
      if (d.hint) process.stdout.write(`      ${d.hint.replace(/\n/g, "\n      ")}\n`);
    }
    process.stdout.write(
      errors.length === 0
        ? "  ok: package is publishable\n"
        : `  ok: false (${errors.length} error(s))\n`,
    );
  }
  return errors.length === 0 ? 0 : 1;
}

async function cmdInspect(
  positional: string[],
  flags: Record<string, string | boolean | string[]>,
): Promise<number> {
  const spec = positional[0];
  if (spec === undefined)
    throw new Error("Usage: cwf inspect <package-or-path> [--url URL] [--json]");
  // Discovery + IR load only — package JS is never executed.
  const pkg = discoverPackage(spec);
  const graph = loadPackageGraph(pkg);
  // Consumer-facing parameter table comes from the manifest (the contract);
  // the IR template is the source of truth `pack` checks it against.
  const params = Object.entries(pkg.manifest.parameters).map(([name, p]) => ({
    name,
    required: p.required,
    type: p.type,
    description: p.description,
  }));
  const nodeClasses = deriveNodeClasses(graph);
  const url = flag(flags, "url");
  const comfyPath = flag(flags, "comfy");

  let installedClasses: string[] | undefined;
  if (url !== undefined) {
    const client = createClient({ url });
    const info = await client.objectInfo();
    installedClasses = Object.keys(info);
  }
  const report = await buildDependencyReport({
    manifest: pkg.manifest,
    nodeClasses,
    packageName: typeof pkg.packageJson["name"] === "string" ? pkg.packageJson["name"] : undefined,
    installedClasses,
    comfyUrl: url,
    target: comfyPath !== undefined ? inspectComfyTarget(assertComfyPath(comfyPath)) : undefined,
    registry: registryFromFlags(flags),
    skipLookup: url === undefined,
  });
  const live =
    url !== undefined
      ? {
          url,
          available: report.availableNodeClasses,
          missing: report.missingNodeClasses,
        }
      : undefined;

  if (flags["json"] === true) {
    process.stdout.write(
      JSON.stringify(
        {
          ok: true,
          package: {
            name: pkg.packageJson["name"] ?? null,
            version: pkg.packageJson["version"] ?? null,
            dir: pkg.dir,
          },
          manifest: pkg.manifest,
          templateParams: params,
          nodeClasses,
          dependencies: {
            required: report.requiredNodeClasses.length,
            available: report.availableNodeClasses.length,
            missing: report.missingNodeClasses.length,
            coreNodeClasses: report.coreNodeClasses,
            resolvedCustomNodeClasses: report.resolvedCustomNodeClasses,
            unknownNodeClasses: report.unknownNodeClasses,
            ambiguousNodeClasses: report.ambiguousNodeClasses,
            customNodeClasses: report.customNodeClasses,
            packs: report.plan.packages,
            unresolved: report.plan.unresolved,
            ambiguous: report.plan.ambiguous,
            models: report.plan.models,
            ready: report.plan.ready,
          },
          ...(live !== undefined ? { live } : {}),
        },
        null,
        2,
      ) + "\n",
    );
    return 0;
  }
  const lines: string[] = [];
  lines.push(`${pkg.manifest.title} (${pkg.manifest.name})`);
  if (pkg.manifest.description) lines.push(`  ${pkg.manifest.description}`);
  lines.push(
    `  package: ${String(pkg.packageJson["name"] ?? spec)} ${String(pkg.packageJson["version"] ?? "")}`,
  );
  if (url !== undefined) lines.push(`  Comfy: ${url}`);
  lines.push(`  entry: ${pkg.manifest.entry}`);
  lines.push(`  params:`);
  for (const p of params)
    lines.push(
      `    ${p.required ? "●" : "○"} ${p.name}${p.type ? ` (${p.type})` : ""}${p.description ? ` — ${p.description}` : ""}`,
    );
  if (params.length === 0) lines.push(`    (none — concrete graph)`);
  lines.push(`  outputs:`);
  for (const o of pkg.manifest.outputs) lines.push(`    ${o.name} : ${o.type}`);
  lines.push(
    `  Required node classes: ${report.requiredNodeClasses.length}` +
      (url !== undefined
        ? `  Available: ${report.availableNodeClasses.length}  Missing: ${report.missingNodeClasses.length}`
        : ""),
  );
  lines.push(`  requires:`);
  for (const c of nodeClasses) {
    const mark = live === undefined ? " " : live.available.includes(c) ? "✓" : "✗";
    lines.push(`    ${mark} ${c}`);
  }
  if (report.plan.packages.length > 0) {
    lines.push(`  node packs:`);
    for (const p of report.plan.packages) {
      const status =
        p.versionStatus === "missing"
          ? "not installed"
          : p.versionStatus === "incompatible"
            ? "installed but incompatible version"
            : p.versionStatus === "unknown"
              ? "installed (version unknown)"
              : "installed compatible";
      lines.push(
        `    ${p.id}${p.resolvedVersion ? `@${p.resolvedVersion}` : ""}  status: ${status}`,
      );
      if (p.provides.length > 0) lines.push(`      provides: ${p.provides.join(", ")}`);
    }
  }
  if (report.plan.unresolved.length > 0) {
    lines.push(`  unresolved classes:`);
    for (const u of report.plan.unresolved) lines.push(`    ${u.className}`);
  }
  if (report.plan.ambiguous.length > 0) {
    lines.push(`  ambiguous classes:`);
    for (const a of report.plan.ambiguous) {
      lines.push(
        `    ${a.className} → ${(a.candidates ?? []).map((c) => c.id).join(", ") || "(none)"}`,
      );
    }
  }
  if (live !== undefined) {
    lines.push(
      live.missing.length === 0
        ? `  live ${live.url}: all ${nodeClasses.length} node classes available`
        : `  live ${live.url}: MISSING ${live.missing.join(", ")}`,
    );
    if (live.missing.length > 0) {
      const pkgName = String(pkg.packageJson["name"] ?? spec);
      lines.push(`  Setup:`);
      lines.push(`    cwf setup ${pkgName} --comfy <ComfyUI-path>`);
    }
  }
  if (pkg.manifest.requires.models.length > 0) {
    lines.push(`  models:`);
    for (const m of pkg.manifest.requires.models)
      lines.push(`    ${m.kind}: ${m.name}  status: unknown${m.optional ? " (optional)" : ""}`);
  }
  process.stdout.write(lines.join("\n") + "\n");
  return 0;
}

async function liveClassNames(url: string | undefined): Promise<string[] | undefined> {
  if (url === undefined) return undefined;
  const client = createClient({ url });
  const info = await client.objectInfo();
  return Object.keys(info);
}

function formatResolveText(result: {
  missing: string[];
  resolutions: Array<{
    className: string;
    kind: string;
    pack?: { id: string; name?: string };
    candidates?: Array<{ id: string }>;
  }>;
  packs: WorkflowNodePack[];
}): string {
  const lines: string[] = [];
  const missingCustom = result.missing.filter((c) => !isCoreNodeClass(c));
  if (missingCustom.length > 0) {
    lines.push("Missing node classes:");
    lines.push("");
    for (const c of missingCustom) lines.push(`  ${c}`);
    lines.push("");
  }
  const resolved = result.packs;
  if (resolved.length > 0) {
    lines.push("Resolved package:");
    lines.push("");
    for (const p of resolved) {
      lines.push(`  ${p.id}${p.name && p.name !== p.id ? `  (${p.name})` : ""}`);
      if ((p.provides ?? []).length > 0) {
        lines.push("    provides:");
        for (const c of p.provides ?? []) lines.push(`      ${c}`);
      }
      lines.push("");
    }
  }
  const unknown = result.resolutions.filter((r) => r.kind === "unknown");
  for (const u of unknown) {
    lines.push(`E_NODE_PACK_UNKNOWN`);
    lines.push("");
    lines.push(`  Class:`);
    lines.push(`    ${u.className}`);
    lines.push("");
    lines.push("  No registered package could be identified.");
    lines.push("");
  }
  const ambiguous = result.resolutions.filter((r) => r.kind === "ambiguous");
  for (const a of ambiguous) {
    lines.push(`E_NODE_PACK_AMBIGUOUS`);
    lines.push("");
    lines.push(`  Class:`);
    lines.push(`    ${a.className}`);
    lines.push("");
    lines.push("  Candidates:");
    for (const c of a.candidates ?? []) lines.push(`    ${c.id}`);
    lines.push("");
  }
  if (lines.length === 0)
    lines.push("No custom-node packs to resolve (core classes only, or none missing).");
  return lines.join("\n") + (lines[lines.length - 1] === "" ? "" : "\n");
}

async function cmdResolveNodes(
  positional: string[],
  flags: Record<string, string | boolean | string[]>,
): Promise<number> {
  const spec = positional[0];
  if (spec === undefined)
    throw new Error("Usage: cwf resolve-nodes <package-or-path> [--url URL] [--write] [--json]");
  const pkg = discoverPackage(spec);
  const graph = loadPackageGraph(pkg);
  const nodeClasses = deriveNodeClasses(graph);
  const url = flag(flags, "url");
  const installedClasses = await liveClassNames(url);
  const result = await resolveNodeClasses({
    nodeClasses,
    declaredPacks: pkg.manifest.requires.nodePacks,
    installedClasses,
    registry: registryFromFlags(flags),
    missingOnly: installedClasses !== undefined,
  });

  if (flags["write"] === true) {
    // Write only packs with positive per-version evidence. A source:"registry"
    // claim is not proof. Already-declared packs remain via mergeResolvedPacks.
    const verifiedIds = new Set(
      result.resolutions
        .filter((r) => r.kind === "resolved_custom" && r.pack?.verified === true)
        .map((r) => r.pack!.id),
    );
    const verified = result.packs.filter((p) => p.source === "registry" && verifiedIds.has(p.id));
    const next = mergeResolvedPacks(pkg.manifest, verified);
    writeManifestFile(pkg.dir, next);
  }

  if (flags["json"] === true) {
    process.stdout.write(
      JSON.stringify(
        {
          ok: result.unknown.length === 0 && result.ambiguous.length === 0,
          dir: pkg.dir,
          wrote: flags["write"] === true,
          required: result.required,
          missing: result.missing,
          available: result.available,
          resolutions: result.resolutions,
          packs: result.packs,
          unknown: result.unknown,
          ambiguous: result.ambiguous,
        },
        null,
        2,
      ) + "\n",
    );
    return result.ambiguous.length > 0 || result.unknown.length > 0 ? 1 : 0;
  }
  process.stdout.write(formatResolveText(result));
  return result.ambiguous.length > 0 || result.unknown.length > 0 ? 1 : 0;
}

async function cmdNodePack(
  positional: string[],
  flags: Record<string, string | boolean | string[]>,
): Promise<number> {
  const sub = positional[0];
  if (sub === "add") {
    const id = positional[1];
    const providesRaw = flag(flags, "provides");
    if (id === undefined || providesRaw === undefined)
      throw new Error(
        "Usage: cwf node-pack add <registry-id> --provides FooNode,BarNode [--dir pkg] [--name ...] [--version ...] [--repository ...]",
      );
    const dir = flag(flags, "dir") ?? process.cwd();
    const pkg = discoverPackage(dir);
    const provides = providesRaw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const pack = parseNodePack(
      {
        id,
        provides,
        name: flag(flags, "name"),
        version: flag(flags, "version"),
        repository: flag(flags, "repository"),
        source: "manual",
      },
      undefined,
      2,
    );
    const next = mergeResolvedPacks(pkg.manifest, [pack]);
    writeManifestFile(pkg.dir, next);
    if (flags["json"] === true) {
      process.stdout.write(JSON.stringify({ ok: true, dir: pkg.dir, pack }, null, 2) + "\n");
      return 0;
    }
    process.stdout.write(
      `added node pack ${pack.id} providing ${pack.provides?.join(", ") ?? "(none)"}\n`,
    );
    return 0;
  }
  if (sub === "map") {
    const className = positional[1];
    const id = positional[2];
    if (className === undefined || id === undefined)
      throw new Error("Usage: cwf node-pack map <class> <registry-id> [--dir pkg]");
    const dir = flag(flags, "dir") ?? process.cwd();
    const pkg = discoverPackage(dir);
    const pack = parseNodePack({ id, provides: [className], source: "manual" }, undefined, 2);
    const next = mergeResolvedPacks(pkg.manifest, [pack]);
    writeManifestFile(pkg.dir, next);
    if (flags["json"] === true) {
      process.stdout.write(
        JSON.stringify({ ok: true, dir: pkg.dir, className, pack }, null, 2) + "\n",
      );
      return 0;
    }
    process.stdout.write(`mapped ${className} → ${id}\n`);
    return 0;
  }
  throw new Error(
    "Usage: cwf node-pack add <id> --provides A,B  |  cwf node-pack map <class> <id>",
  );
}

async function confirmYes(prompt: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => {
    rl.question(prompt, (a) => resolve(a));
  });
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

function formatSetupPlan(plan: {
  workflow: { name: string; title: string; package?: string };
  target?: { root: string; layout: string; url?: string };
  toInstall: Array<{
    id: string;
    resolvedVersion?: string;
    requestedVersion?: string;
    source: string;
    provides: string[];
  }>;
  alreadyInstalled: Array<{ id: string }>;
  unresolved: Array<{ className: string }>;
  ambiguous: Array<{ className: string; candidates?: Array<{ id: string }> }>;
  applyBlocked?: string;
  restartRequired: boolean;
  ready: boolean;
}): string {
  const lines: string[] = [];
  lines.push("Preparing:");
  lines.push(`  ${plan.workflow.package ?? plan.workflow.name}`);
  lines.push("");
  if (plan.target) {
    lines.push("Target:");
    lines.push(`  ${plan.target.root}${plan.target.url ? `  (${plan.target.url})` : ""}`);
    lines.push("");
  }
  if (plan.toInstall.length === 0) {
    lines.push("Will install:");
    lines.push("  (nothing)");
    lines.push("");
  } else {
    lines.push("Will install:");
    lines.push("");
    for (const p of plan.toInstall) {
      const ver = p.resolvedVersion ?? p.requestedVersion ?? "latest";
      lines.push(`  ${p.id}@${ver}`);
      lines.push(`    source: ${p.source === "registry" ? "Comfy Registry" : p.source}`);
      if (p.provides.length > 0) {
        lines.push("    provides:");
        for (const c of p.provides) lines.push(`      ${c}`);
      }
      lines.push("");
    }
  }
  if (plan.unresolved.length > 0) {
    lines.push("Unresolved classes (will not be installed):");
    for (const u of plan.unresolved) lines.push(`  ${u.className}`);
    lines.push("");
  }
  if (plan.ambiguous.length > 0) {
    lines.push("Ambiguous classes (will not be installed):");
    for (const a of plan.ambiguous) {
      lines.push(`  ${a.className}: ${(a.candidates ?? []).map((c) => c.id).join(", ")}`);
    }
    lines.push("");
  }
  if (plan.applyBlocked) {
    lines.push(plan.applyBlocked);
    lines.push("");
  }
  return lines.join("\n");
}

async function cmdSetup(
  positional: string[],
  flags: Record<string, string | boolean | string[]>,
): Promise<number> {
  const spec = positional[0];
  const comfyPath = flag(flags, "comfy");
  const url = flag(flags, "url");
  if (spec === undefined)
    throw new Error(
      "Usage: cwf setup <package-or-path> --comfy <Comfy-install-path> [--yes] [--dry-run] [--json] [--url URL]",
    );
  const pkg = discoverPackage(spec);
  const graph = loadPackageGraph(pkg);
  const nodeClasses = deriveNodeClasses(graph);
  const installedClasses = await liveClassNames(url);
  const target =
    comfyPath !== undefined ? inspectComfyTarget(assertComfyPath(comfyPath)) : undefined;
  const report = await buildDependencyReport({
    manifest: pkg.manifest,
    nodeClasses,
    packageName: typeof pkg.packageJson["name"] === "string" ? pkg.packageJson["name"] : undefined,
    installedClasses,
    comfyUrl: url,
    target,
    registry: registryFromFlags(flags),
  });
  const plan = report.plan;
  const dryRun = flags["dry-run"] === true;
  const asJson = flags["json"] === true;
  const yes = flags["yes"] === true;

  if (asJson && (dryRun || !yes)) {
    process.stdout.write(
      JSON.stringify(
        {
          ok: plan.ready && plan.toInstall.length === 0,
          dryRun: dryRun || !yes,
          alreadyInstalled: plan.alreadyInstalled,
          toInstall: plan.toInstall,
          unresolved: plan.unresolved,
          ambiguous: plan.ambiguous,
          failed: plan.failed,
          restartRequired: plan.restartRequired,
          ready: plan.ready,
          availabilityKnown: plan.availabilityKnown,
          applyBlocked: plan.applyBlocked ?? null,
          models: plan.models,
          missingNodeClasses: plan.missingNodeClasses,
        },
        null,
        2,
      ) + "\n",
    );
    if (dryRun) return plan.ambiguous.length > 0 || plan.unresolved.length > 0 ? 1 : 0;
    return 0;
  }

  if (!asJson) {
    process.stdout.write(formatSetupPlan(plan));
    if (plan.toInstall.length > 0) {
      process.stdout.write(
        "This installs executable Python code into the target Comfy environment.\n\n",
      );
    }
  }

  if (dryRun) {
    if (!asJson) process.stdout.write("Dry run — nothing installed.\n");
    return plan.ambiguous.length > 0 || (plan.unresolved.length > 0 && plan.toInstall.length === 0)
      ? 1
      : 0;
  }

  if (plan.toInstall.length === 0) {
    if (!asJson) {
      process.stdout.write(
        plan.ready
          ? "Already prepared — no custom-node installs required.\n"
          : "Nothing to install. Unresolved or ambiguous classes remain — see above.\n",
      );
    }
    return plan.ready ? 0 : 1;
  }

  if (plan.applyBlocked) {
    throw new ComfyError({
      code: ErrorCodes.SetupNotApplicable,
      message: plan.applyBlocked,
      hint: "Pass --comfy <local-ComfyUI-path> to apply a plan against a local install.",
    });
  }
  if (target === undefined) {
    throw new ComfyError({
      code: ErrorCodes.SetupNotApplicable,
      message: "cwf setup requires --comfy <Comfy-install-path> to apply an install plan.",
    });
  }

  let approved = yes;
  if (!approved) {
    approved = await confirmYes("Continue? [y/N] ");
  }
  if (!approved) {
    throw new ComfyError({
      code: ErrorCodes.SetupDeclined,
      message: "Setup declined — nothing was installed.",
    });
  }

  const applied = await applySetupPlan({ plan, target, yes: true, dryRun: false });
  if (asJson) {
    process.stdout.write(
      JSON.stringify(
        {
          ok: applied.plan.failed.length === 0,
          alreadyInstalled: applied.plan.alreadyInstalled,
          toInstall: applied.plan.toInstall,
          unresolved: applied.plan.unresolved,
          ambiguous: applied.plan.ambiguous,
          failed: applied.plan.failed,
          restartRequired: applied.plan.restartRequired,
          ready: applied.plan.ready,
          availabilityKnown: applied.plan.availabilityKnown,
          results: applied.results,
        },
        null,
        2,
      ) + "\n",
    );
    return applied.plan.failed.length === 0 ? 0 : 1;
  }
  if (applied.plan.failed.length > 0) {
    process.stdout.write("Failed:\n");
    for (const f of applied.plan.failed) process.stdout.write(`  ${f.id}\n`);
  }
  const installed = applied.results.filter((r) => r.ok && !r.skipped);
  if (installed.length > 0) {
    process.stdout.write("Installed:\n");
    for (const r of installed) process.stdout.write(`  ${r.id}\n`);
    process.stdout.write("\n");
    process.stdout.write("ComfyUI must be restarted before these nodes become available.\n");
  }
  return applied.plan.failed.length === 0 ? 0 : 1;
}

async function cmdExplain(
  positional: string[],
  flags: Record<string, string | boolean | string[]>,
): Promise<number> {
  const input = positional[0];
  if (input === undefined) throw new Error("Usage: cwf explain <file | workflow.ts>");
  const graph = await graphFromInput(
    input,
    parseParams(flagList(flags, "param")),
    await loadDefsAny(flag(flags, "defs")),
  );
  process.stdout.write(explainGraph(graph) + "\n");
  return 0;
}

async function cmdCatalog(
  positional: string[],
  flags: Record<string, string | boolean | string[]>,
): Promise<number> {
  const query = (positional[0] ?? "").toLowerCase();
  const from = flag(flags, "from") ?? path.join(PKG_ROOT, "src", "nodes", "gen", "catalog.json");
  let entries: Array<{
    classType: string;
    category: string;
    displayName?: string;
    inputs: Array<{ name: string }>;
    outputs: Array<{ type: string }>;
  }>;
  try {
    const json = JSON.parse(await readFile(from, "utf8")) as { nodes?: typeof entries };
    entries = json.nodes ?? (json as unknown as typeof entries);
  } catch {
    throw new Error(`Catalog not found at ${from}; run \`cwf codegen\` first or pass --from`);
  }
  const hits = entries.filter((e) => {
    if (query === "") return true;
    return (
      e.classType.toLowerCase().includes(query) ||
      (e.displayName ?? "").toLowerCase().includes(query) ||
      e.category.toLowerCase().includes(query)
    );
  });
  process.stdout.write(
    hits
      .map(
        (e) =>
          `${e.classType}  [${e.category}]  in: ${e.inputs.map((i) => i.name).join(",")}  out: ${e.outputs.map((o) => o.type).join(",")}`,
      )
      .join("\n") + (hits.length > 0 ? "\n" : ""),
  );
  return 0;
}

async function cmdAgent(
  positional: string[],
  flags: Record<string, string | boolean | string[]>,
): Promise<number> {
  const sub = positional[0];
  const projectRoot = flag(flags, "project") ?? process.cwd();
  const asJson = flags["json"] === true;
  if (sub === "install") {
    const report = installAgentSkill({
      projectRoot,
      pkgRoot: PKG_ROOT,
      force: flags["force"] === true,
    });
    if (asJson) {
      process.stdout.write(JSON.stringify({ ok: true, ...report }, null, 2) + "\n");
      return 0;
    }
    const verb =
      report.action === "unchanged"
        ? "current"
        : report.action === "updated"
          ? "updated"
          : report.action === "forced"
            ? "replaced"
            : "installed";
    process.stdout.write(
      `skill ${verb}: ${report.destination}\n` +
        `package ${report.coreVersion}  status ${report.status}\n`,
    );
    return 0;
  }
  if (sub === "check" || sub === "status") {
    const report = inspectAgentSkill({ projectRoot, pkgRoot: PKG_ROOT });
    if (asJson) {
      process.stdout.write(JSON.stringify({ ok: true, ...report }, null, 2) + "\n");
      return 0;
    }
    process.stdout.write(
      [
        `skill: ${report.skill}`,
        `core: ${report.coreVersion}`,
        `installed: ${report.installed ? "yes" : "no"}`,
        `installedVersion: ${report.installedVersion ?? "—"}`,
        `destination: ${report.destination}`,
        `status: ${report.status}`,
        "",
      ].join("\n"),
    );
    return 0;
  }
  throw new Error("Usage: cwf agent install [--project dir] [--force] [--json]  |  cwf agent check [--project dir] [--json]");
}
